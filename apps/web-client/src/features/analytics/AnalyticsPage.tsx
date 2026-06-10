import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertTriangle, RefreshCw, BarChart3, CheckCircle, XCircle, Clock, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  getRetentionCurve, getStyleFactors, getAudioVisualSankey, getAbCompare, postSelfHealStream,
  type SelfHealProgressEvent,
} from '../../lib/api/analytics';
import { rerenderCreationShot } from '../../lib/api/creations';
import { AnalyticsSkeleton } from '../../components/ui/content-skeleton';
import { RetentionChart } from './components/RetentionChart';
import { StyleHeatmap } from './components/StyleHeatmap';
import { SankeyChart } from './components/SankeyChart';
import { HeatmapControls } from './components/HeatmapControls';
import { TimeRangePicker } from './components/TimeRangePicker';
import type { TimeRange } from './components/TimeRangePicker';
import { AnalysisScopeSelector, type AnalysisScope, type AnalysisFunction } from './components/AnalysisScopeSelector';
import type {
  RetentionCurveResponse,
  StyleFactorHeatmapResponse,
  AudioVisualSankeyResponse,
  AbCompareReportResponse,
  SelfHealResultResponse,
  HeatmapDimension,
  AnalyticsMetric,
} from '@tikstream/shared-types';

function fmtPct(n: number | null | undefined, fallback = '-'): string {
  if (n == null || isNaN(n)) return fallback;
  return `${(n * 100).toFixed(1)}%`;
}

const SELF_HEAL_STEPS = [
  { step: 'validating',        label: '校验请求参数' },
  { step: 'fetching_product',  label: '查询商品信息' },
  { step: 'fetching_creation', label: '获取创作任务' },
  { step: 'fetching_data',     label: '获取留存分析数据' },
  { step: 'diagnosing',        label: '诊断分镜问题' },
  { step: 'ai_generating',     label: 'AI 生成自愈建议' },
  { step: 'completing',        label: '完成诊断' },
] as const;

type StepStatus = 'pending' | 'in_progress' | 'done' | 'error';
type StepRecord = { step: string; label: string; status: StepStatus; message?: string };

export function AnalyticsPage(): JSX.Element {
  const { t } = useTranslation();

  const [scope, setScope]         = useState<AnalysisScope>({ function: 'retention', productId: '' });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [retention, setRetention] = useState<RetentionCurveResponse | null>(null);
  const [heatmap, setHeatmap]     = useState<StyleFactorHeatmapResponse | null>(null);
  const [sankey, setSankey]       = useState<AudioVisualSankeyResponse | null>(null);
  const [abCompare, setAbCompare] = useState<AbCompareReportResponse | null>(null);
  const [selfHeal, setSelfHeal]   = useState<SelfHealResultResponse | null>(null);

  const [xDimension, setXDimension] = useState<HeatmapDimension>('VISUAL_STYLE');
  const [yDimension, setYDimension] = useState<HeatmapDimension>('BGM_STYLE');
  const [heatmapMetric, setHeatmapMetric] = useState<AnalyticsMetric>('RETENTION_RATE');
  const [timeRange, setTimeRange]   = useState<TimeRange>('30d');

  const [selfHealSteps, setSelfHealSteps] = useState<StepRecord[]>(
    SELF_HEAL_STEPS.map((s) => ({ ...s, status: 'pending' as StepStatus })),
  );
  const [selfHealStreamError, setSelfHealStreamError] = useState<string | null>(null);
  const [applyingShots, setApplyingShots] = useState<Set<number>>(new Set());

  // ---- 统一的清空 & 加载入口 ----
  // 关键：runAnalysis 必须在 analyzeXXX 之后定义，避免 TDZ；
  // 同时用 loadFns ref 确保一直拿到各分析函数的最新版本
  const loadFnsRef = useRef<Record<AnalysisFunction, ((s: AnalysisScope) => void) | undefined>>({
    retention: undefined, heatmap: undefined, sankey: undefined, 'ab-compare': undefined, 'self-heal': undefined,
  });

  const runAnalysis = useCallback((s: AnalysisScope) => {
    setError(null);
    setRetention(null); setHeatmap(null); setSankey(null); setAbCompare(null); setSelfHeal(null);
    setSelfHealStreamError(null);
    if (!s.productId) return;
    loadFnsRef.current[s.function]?.(s);
  }, []);

  // ---- 各分析函数 ----
  const analyzeRetention = useCallback(async (s: AnalysisScope) => {
    if (!s.creationIdA) return;
    setLoading(true);
    try {
      const data = await getRetentionCurve({ product_id: s.productId, creation_id: s.creationIdA, granularity: 'DAY', time_range: timeRange });
      setRetention(data);
    } catch (err) { setError(err instanceof Error ? err.message : t('analytics.dataLoadFailed')); }
    finally { setLoading(false); }
  }, [timeRange, t]);
  loadFnsRef.current.retention = analyzeRetention;

  const analyzeHeatmap = useCallback(async (s: AnalysisScope) => {
    setLoading(true);
    try {
      const data = await getStyleFactors({ product_id: s.productId, x_dimension: xDimension, y_dimension: yDimension, metric: heatmapMetric, time_range: timeRange });
      setHeatmap(data);
    } catch (err) { setError(err instanceof Error ? err.message : t('analytics.dataLoadFailed')); }
    finally { setLoading(false); }
  }, [xDimension, yDimension, heatmapMetric, timeRange, t]);
  loadFnsRef.current.heatmap = analyzeHeatmap;

  const analyzeSankey = useCallback(async (s: AnalysisScope) => {
    setLoading(true);
    try {
      const data = await getAudioVisualSankey({ product_id: s.productId, creation_id: s.creationIdA, time_range: timeRange });
      setSankey(data);
    } catch (err) { setError(err instanceof Error ? err.message : t('analytics.dataLoadFailed')); }
    finally { setLoading(false); }
  }, [timeRange, t]);
  loadFnsRef.current.sankey = analyzeSankey;

  const analyzeAbCompare = useCallback(async (s: AnalysisScope) => {
    if (!s.creationIdA || !s.creationIdB) { setError(t('analytics.abMinData')); return; }
    setLoading(true);
    try {
      const data = await getAbCompare({ product_id: s.productId, creation_id_a: s.creationIdA, creation_id_b: s.creationIdB });
      setAbCompare(data);
    } catch (err) { setError(err instanceof Error ? err.message : t('analytics.abLoadFailed')); }
    finally { setLoading(false); }
  }, [t]);
  loadFnsRef.current['ab-compare'] = analyzeAbCompare;

  const analyzeSelfHeal = useCallback((s: AnalysisScope) => {
    if (!s.creationIdA) return;
    setSelfHealStreamError(null);
    setLoading(true);
    setSelfHealSteps(SELF_HEAL_STEPS.map((st) => ({ ...st, status: 'pending' as StepStatus })));

    postSelfHealStream(
      {
        product_id: s.productId,
        creation_id: s.creationIdA,
        trigger_source: 'RETENTION_DROP',
        issue_type: s.selfHealIssueType || 'HOOK_WEAK',
        strategy: s.selfHealStrategy || 'REWRITE_ONLY',
        dry_run: s.selfHealDryRun !== false,
      },
      (event: SelfHealProgressEvent) => {
        if (event.type === 'progress') {
          setSelfHealSteps((prev) =>
            prev.map((item) => {
              if (item.step === event.step) return { ...item, status: 'in_progress', message: event.message };
              const stepIdx = SELF_HEAL_STEPS.findIndex((cs) => cs.step === event.step);
              const curIdx  = SELF_HEAL_STEPS.findIndex((cs) => cs.step === item.step);
              if (stepIdx > curIdx && item.status === 'in_progress') return { ...item, status: 'done' };
              return item;
            }),
          );
        } else if (event.type === 'done' && event.result) {
          setSelfHeal(event.result);
          setSelfHealSteps((prev) => prev.map((item) => ({ ...item, status: 'done' })));
          setLoading(false);
        } else if (event.type === 'error') {
          setSelfHealStreamError(event.message || '自愈诊断失败');
          setSelfHealSteps((prev) => prev.map((item) => (item.status === 'in_progress' ? { ...item, status: 'error', message: event.message } : item)));
          setLoading(false);
        }
      },
      (err: Error) => {
        setError(err.message || t('analytics.selfHealLoadFailed'));
        setSelfHealSteps((prev) => prev.map((item) => (item.status === 'in_progress' ? { ...item, status: 'error', message: err.message } : item)));
        setLoading(false);
      },
    );
  }, [t]);
  loadFnsRef.current['self-heal'] = analyzeSelfHeal;

  // 应用自愈建议：对指定分镜触发重渲染
  const handleApplySelfHeal = useCallback(async (shotIndex: number) => {
    if (!selfHeal?.creation_id) return;
    setApplyingShots((prev) => new Set(prev).add(shotIndex));
    try {
      await rerenderCreationShot(selfHeal.creation_id, { shot_index: shotIndex, force_refresh: true });
    } catch (err) {
      console.error(`[Analytics] 应用自愈建议失败 (shot ${shotIndex}):`, err);
    } finally {
      setApplyingShots((prev) => {
        const next = new Set(prev);
        next.delete(shotIndex);
        return next;
      });
    }
  }, [selfHeal?.creation_id]);

  // 时间范围切换时重新加载留存
  const onTimeRangeChange = useCallback((r: TimeRange) => {
    setTimeRange(r);
    void analyzeRetention(scope);
  }, [analyzeRetention, scope]);

  // 热力图 Apply
  const onHeatmapApply = useCallback(() => { void analyzeHeatmap(scope); }, [analyzeHeatmap, scope]);

  // ---- 判断是否有结果 ----
  const currentResult: boolean =
    (scope.function === 'retention'  && !!retention) ||
    (scope.function === 'heatmap'    && !!heatmap) ||
    (scope.function === 'sankey'     && !!sankey) ||
    (scope.function === 'ab-compare' && !!abCompare) ||
    (scope.function === 'self-heal'  && !!selfHeal);

  // ---- 渲染 ----
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('analytics.dashboard')}</CardTitle>
            <CardDescription>{t('analytics.dashboardDesc')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {/* 功能+范围选择器 */}
          <AnalysisScopeSelector
            scope={scope}
            onScopeChange={setScope}
            onAnalyze={() => runAnalysis(scope)}
            loading={loading}
          />

          {/* 时间范围 (留存/热力图) */}
          {(scope.function === 'retention' || scope.function === 'heatmap') && currentResult && (
            <div className="mt-3">
              <TimeRangePicker
                range={timeRange}
                compareMode={false}
                onRangeChange={onTimeRangeChange}
                onCompareModeToggle={() => {}}
              />
            </div>
          )}

          <div className="mt-4">
            {/* 错误 */}
            {error && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
                <AlertTriangle className="h-8 w-8 text-rose-400" />
                <div className="text-sm text-rose-200">{error}</div>
                <Button variant="outline" size="sm" onClick={() => runAnalysis(scope)}>
                  <RefreshCw className="h-4 w-4 mr-1" />{t('common.retry')}
                </Button>
              </div>
            )}

            {/* 加载态 */}
            {!error && loading && !currentResult && (
              scope.function === 'self-heal' ? (
                <div className="space-y-3">
                  {selfHealStreamError ? (
                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-center">
                      <XCircle className="mx-auto h-6 w-6 text-rose-400" />
                      <div className="mt-2 text-sm text-rose-200">{selfHealStreamError}</div>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => runAnalysis(scope)}>
                        <RefreshCw className="h-4 w-4 mr-1" />{t('common.retry')}
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                        <span className="text-sm font-medium text-slate-200">自愈诊断进行中...</span>
                      </div>
                      <div className="space-y-2">
                        {selfHealSteps.map((step) => (
                          <div key={step.step} className="flex items-center gap-3 py-1">
                            {step.status === 'done'        ? <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" /> :
                             step.status === 'in_progress' ? <Loader2 className="h-4 w-4 animate-spin text-cyan-400 flex-shrink-0" /> :
                             step.status === 'error'       ? <XCircle className="h-4 w-4 text-rose-400 flex-shrink-0" /> :
                                                            <Clock className="h-4 w-4 text-slate-600 flex-shrink-0" />}
                            <span className={`text-sm ${
                              step.status === 'done' ? 'text-emerald-300' : step.status === 'in_progress' ? 'text-cyan-200' : step.status === 'error' ? 'text-rose-300' : 'text-slate-500'
                            }`}>
                              {step.label}
                              {step.message && step.status === 'in_progress' && (
                                <span className="ml-2 text-xs text-slate-400">({step.message})</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <AnalyticsSkeleton />
              )
            )}

            {/* 空状态 */}
            {!error && !loading && !currentResult && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-800 p-8 text-center">
                <BarChart3 className="h-8 w-8 text-slate-500" />
                <div className="text-sm text-slate-400">
                  {scope.productId ? t('analytics.selectScope') : t('analytics.selectProductFirst')}
                </div>
              </div>
            )}

            {/* ===== 结果区 ===== */}
            {!error && currentResult && (
              <>
                {/* 留存曲线 */}
                {scope.function === 'retention' && retention && (
                  <RetentionChart data={retention} timeRange={timeRange} />
                )}

                {/* 风格热力图 */}
                {scope.function === 'heatmap' && heatmap && (
                  <div className="space-y-3">
                    <HeatmapControls
                      xDimension={xDimension} yDimension={yDimension} metric={heatmapMetric}
                      onXDimensionChange={setXDimension} onYDimensionChange={setYDimension} onMetricChange={setHeatmapMetric}
                      onApply={onHeatmapApply} loading={loading}
                    />
                    <StyleHeatmap data={heatmap} />
                  </div>
                )}

                {/* 桑基图 */}
                {scope.function === 'sankey' && sankey && <SankeyChart data={sankey} />}

                {/* AB 对比 */}
                {scope.function === 'ab-compare' && abCompare && (
                  <div className="space-y-3">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {([
                        { key: 'A' as const, data: abCompare.version_a },
                        { key: 'B' as const, data: abCompare.version_b },
                      ]).map(({ key, data: v }) => (
                        <div key={key} className={`rounded-2xl border p-4 ${abCompare.winner === key ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/70'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-200">{t('analytics.creation' + key)} · {v.label}</span>
                            {abCompare.winner === key && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">{t('analytics.winner')}</span>}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                            <div><span className="text-slate-400">风格调性</span><div className="text-slate-100 font-semibold">{v.style_vibe || '-'}</div></div>
                            <div><span className="text-slate-400">Hook 策略</span><div className="text-slate-100 font-semibold">{v.hook_strategy || '-'}</div></div>
                            <div><span className="text-slate-400">完成率预测</span><div className="text-slate-100 font-semibold">{fmtPct(v.predicted_completion_rate)}</div></div>
                            <div><span className="text-slate-400">CTR 预测</span><div className="text-slate-100 font-semibold">{fmtPct(v.predicted_ctr)}</div></div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {abCompare.recommendation && (
                      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">{abCompare.recommendation}</div>
                    )}
                  </div>
                )}

                {/* 自愈建议 */}
                {scope.function === 'self-heal' && selfHeal && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-block h-2 w-2 rounded-full bg-cyan-400" />
                        <span className="text-sm font-medium text-slate-200">{t('analytics.statusLabel')} {selfHeal.status} · Dry Run: {selfHeal.dry_run ? t('common.yes') : t('common.no')}</span>
                      </div>
                      <div className="text-sm text-slate-300 mb-4 whitespace-pre-wrap">{selfHeal.suggestion_summary}</div>
                      {selfHeal.affected_shots.map((shot, i) => (
                        <div key={i} className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-200">Shot {shot.shot_index}</span>
                              <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-300">{shot.action}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-3 text-xs"
                              disabled={applyingShots.has(shot.shot_index)}
                              onClick={() => handleApplySelfHeal(shot.shot_index)}
                            >
                              {applyingShots.has(shot.shot_index) ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Sparkles className="h-3 w-3 mr-1" />
                              )}
                              {t('analytics.applySelfHeal') || '应用'}
                            </Button>
                          </div>
                          <div className="mt-1 text-sm text-slate-400">{shot.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mock 警告 */}
                {retention?.is_mock && scope.function !== 'self-heal' && (
                  <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
                    {t('analytics.mockWarning')}
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
