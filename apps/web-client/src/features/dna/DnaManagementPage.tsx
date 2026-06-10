import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dna, Loader2, Zap, Eye, Sparkles, Search, BarChart3, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import { extractDnaStream, listDna, getDnaDetail } from '../../lib/api/viral-analysis';
import type { ViralDNA, ViralDNAExtractResponse } from '@tikstream/shared-types';

type TabKey = 'list' | 'extract' | 'detail';
type ExtractPhase = 'idle' | 'collecting' | 'clustering' | 'generating' | 'labeling' | 'persisting' | 'complete' | 'done' | 'error';

/** 获取产品列表中的唯一类目 */
function getUniqueCategories(products: Array<{ category?: string }>): string[] {
  const cats = products
    .map((p) => p.category)
    .filter((c): c is string => !!c && c.length > 0);
  return [...new Set(cats)].sort();
}

/** 获取类目→商品名映射 */
function getCategoryProductNames(products: Array<{ category?: string; title?: string }>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const p of products) {
    const cat = p.category;
    const name = p.title;
    if (cat && name) {
      const list = map.get(cat) || [];
      list.push(name);
      map.set(cat, list);
    }
  }
  return map;
}

const CATEGORY_COLORS: Record<string, string> = {
  beauty: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  electronics: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  fashion: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  food: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  home: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  health: 'bg-green-500/10 text-green-400 border-green-500/30',
  fitness: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  lifestyle: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

/** 安全 toFixed — 防止 null/undefined 导致渲染崩溃 */
function safeFixed(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !isFinite(value)) return '0'.padEnd(digits + 2, '0').replace(/^0/, '0.');
  return value.toFixed(digits);
}

export function DnaManagementPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const products = useWorkspaceStore((s) => s.products);
  const selectedProductId = useWorkspaceStore((s) => s.selectedProductId);
  const productId = selectedProductId || products[0]?.id || '';

  const categories = getUniqueCategories(products);
  const categoryProductMap = getCategoryProductNames(products);
  const [tab, setTab] = useState<TabKey>('list');
  const [error, setError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [extractLoading, setExtractLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // DNA 列表
  const [dnaList, setDnaList] = useState<ViralDNA[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');

  // DNA 提取
  const [extractCategory, setExtractCategory] = useState(categories[0] || '');
  const [extractResult, setExtractResult] = useState<ViralDNAExtractResponse | null>(null);
  const [extractPhase, setExtractPhase] = useState<ExtractPhase>('idle');
  const extractAbortRef = useRef<AbortController | null>(null);

  // DNA 详情
  const [selectedDna, setSelectedDna] = useState<ViralDNA | null>(null);

  const loadDnaList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const res = await listDna(categoryFilter ? { category: categoryFilter } : undefined);
      setDnaList(res || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('dna.loadFailed'));
    } finally {
      setListLoading(false);
    }
  }, [categoryFilter, t]);

  useEffect(() => {
    if (tab === 'list') loadDnaList();
  }, [tab, loadDnaList]);

  const handleExtract = async () => {
    if (!extractCategory) return;
    setExtractLoading(true);
    setError(null);
    setExtractResult(null);
    setExtractPhase('idle');

    const abortCtrl = extractDnaStream(
      extractCategory,
      (phase, progress, detail) => {
        setExtractPhase(phase as ExtractPhase);
      },
      (result) => {
        setExtractResult(result);
        setExtractPhase('done');
        setExtractLoading(false);
      },
      (errMsg) => {
        setExtractPhase('error');
        setError(errMsg);
        setExtractLoading(false);
      },
    );

    extractAbortRef.current = abortCtrl;
  };

  const handleViewDna = async (dnaId: string) => {
    setDetailLoading(true);
    try {
      const dna = await getDnaDetail(dnaId);
      setSelectedDna(dna);
      setTab('detail');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('dna.loadDetailFailed'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleGoToScriptsWithDna = (dnaId: string) => {
    // 通过 sessionStorage 同步传递商品上下文，确保 ScriptsPage 渲染时立即可用
    const targetProduct = products.find((p) => p.id === productId);
    sessionStorage.setItem('dna_nav_context', JSON.stringify({
      dnaId,
      productId: productId || '',
      productTitle: targetProduct?.title || '',
      sellingPoints: targetProduct?.selling_points || [],
    }));
    const params = new URLSearchParams();
    params.set('mode', 'dna');
    params.set('dnaId', dnaId);
    navigate(`/scripts?${params.toString()}`);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('dna.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('dna.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-900 p-1 w-fit">
        {(['list', 'extract', 'detail'] as TabKey[]).map((key) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (key === 'list') loadDnaList(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t(`dna.${key}Tab`)}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">{error}</div>
      )}

      {listLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('dna.loading')}
        </div>
      )}

      {/* ===== DNA 列表 ===== */}
      {tab === 'list' && !listLoading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">{t('dna.allCategories')}</option>
              {categories.map((cat) => {
                const names = categoryProductMap.get(cat) || [];
                const label = names.length > 0 ? `${cat} (${names[0] || ''})` : cat;
                return <option key={cat} value={cat}>{label}</option>;
              })}
            </select>
            <Button variant="outline" size="sm" onClick={loadDnaList}>
              <Search className="w-4 h-4 mr-1" />{t('dna.filter')}
            </Button>
          </div>
          {dnaList.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">{t('dna.noData')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dnaList.map((dna) => (
                <Card key={dna.dna_id} className="hover:border-cyan-500/30 transition-colors cursor-pointer" onClick={() => handleViewDna(dna.dna_id)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className={CATEGORY_COLORS[dna.category || ''] || 'border-slate-600'}>{dna.category}</Badge>
                      <span className="text-xs text-muted-foreground">{dna.market}</span>
                    </div>
                    {dna.product_names && dna.product_names.length > 0 && (
                      <p className="text-xs text-slate-400 mb-2 truncate" title={dna.product_names.join(', ')}>
                        {dna.product_names.slice(0, 2).join(', ')}{dna.product_names.length > 2 ? ' ...' : ''}
                      </p>
                    )}
                    <div className="space-y-1 text-sm">
                      <p>{t('dna.hookMode')} <strong>{dna.hooks?.length || 0}</strong></p>
                      <p>{t('dna.visualStyle')} <strong>{dna.visual_styles?.length || 0}</strong></p>
                      <p>{t('dna.bgmPattern')} <strong>{dna.bgm_patterns?.length || 0}</strong></p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">
                        {t('dna.compositeScore')} {safeFixed(dna.composite_score, 2)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('dna.confidence')} {Math.round(dna.confidence * 100)}%
                      </span>
                    </div>
                    {dna.statistics && (
                      <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                        <span>{t('dna.statsSamples')}: {dna.sample_count} | {t('dna.statsDiversity')}: {safeFixed(dna.statistics.diversity_variance, 2)} | {t('dna.statsCI')}: ±{safeFixed(dna.statistics.confidence_interval_95, 3)}</span>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); handleViewDna(dna.dna_id); }}>
                        <Eye className="w-3 h-3 mr-1" />{t('dna.view')}
                      </Button>
                      <Button variant="default" size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); handleGoToScriptsWithDna(dna.dna_id); }}>
                        <Sparkles className="w-3 h-3 mr-1" />{t('dna.generate')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== DNA 提取 ===== */}
      {tab === 'extract' && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" /> {t('dna.extractTitle')}
            </CardTitle>
            <CardDescription>{t('dna.extractDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('dna.productCategory')}</label>
              {categories.length > 0 ? (
                <select
                  className="w-full mt-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={extractCategory}
                  onChange={(e) => { setExtractCategory(e.target.value); setExtractResult(null); setExtractPhase('idle'); setError(null); }}
                >
                  {categories.map((cat) => {
                    const names = categoryProductMap.get(cat) || [];
                    const label = names.length > 0 ? `${cat} (${names.slice(0, 2).join(', ')}${names.length > 2 ? '...' : ''})` : cat;
                    return <option key={cat} value={cat}>{label}</option>;
                  })}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">{t('dna.noCategories')}</p>
              )}
            </div>

            {/* 提取进度阶段 */}
            {extractPhase !== 'idle' && extractPhase !== 'done' && extractPhase !== 'error' && (
              <div className="space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2">
                {(['collecting', 'clustering', 'generating', 'labeling', 'persisting', 'complete'] as const).map((phase, i) => {
                  const phases = ['collecting', 'clustering', 'generating', 'labeling', 'persisting', 'complete'];
                  const phaseIdx = phases.indexOf(extractPhase);
                  const isActive = i === phaseIdx;
                  const isPassed = i < phaseIdx;
                  return (
                    <div key={phase} className={`flex items-center gap-2 text-xs transition-colors ${isActive ? 'text-sky-300' : isPassed ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {isPassed ? <CheckCircle className="h-3 w-3" /> : isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : <div className="h-3 w-3 rounded-full border border-slate-600" />}
                      <span>{t(`dna.phase${phase.charAt(0).toUpperCase() + phase.slice(1)}`)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {extractPhase === 'done' && extractResult && (
              <div className="bg-emerald-500/10 text-emerald-200 p-3 rounded-md text-sm space-y-1">
                <div className="flex items-center gap-1"><CheckCircle className="h-4 w-4" />{t('dna.extractComplete')}</div>
                <p>{t('dna.patternsCount')}: {extractResult.patterns?.length || 0}</p>
                <p>{t('dna.totalSamples')}: {extractResult.total_samples}</p>
                <p>{t('dna.confidence')}: {Math.round(extractResult.confidence * 100)}%</p>
                <Button variant="ghost" size="sm" className="px-0 h-auto text-sky-400 mt-1" onClick={() => { setTab('list'); loadDnaList(); }}>
                  {t('dna.viewDnaList')} →
                </Button>
              </div>
            )}

            {extractPhase === 'error' && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />{t('dna.extractFailed')}
              </div>
            )}

            <Button onClick={handleExtract} disabled={extractLoading || !extractCategory || categories.length === 0} className="w-full">
              {extractLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Dna className="w-4 h-4 mr-1" />}
              {extractLoading ? t('dna.extracting') : t('dna.startExtract')}
            </Button>
            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground text-center">{t('dna.noCategories')}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== DNA 详情与可视化 ===== */}
      {tab === 'detail' && selectedDna && (
        <div className="space-y-6">
          {/* 基本信息 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-4 flex-wrap">
                  <Badge variant="default" className={CATEGORY_COLORS[selectedDna.category || ''] || ''}>{selectedDna.category}</Badge>
                  <span className="text-sm text-muted-foreground">{t('dna.market')}: {selectedDna.market}</span>
                  <span className="text-sm text-muted-foreground">{t('dna.sampleCount')}: {selectedDna.sample_count}</span>
                  <span className="text-sm text-muted-foreground">{t('dna.confidence')}: {Math.round(selectedDna.confidence * 100)}%</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="default" onClick={() => handleGoToScriptsWithDna(selectedDna.dna_id)}>
                    <Sparkles className="w-3 h-3 mr-1" />{t('dna.generateScript')}
                  </Button>
                </div>
              </div>
              {selectedDna.product_names && selectedDna.product_names.length > 0 && (
                <p className="text-xs text-slate-400 mt-2">{t('dna.productNames')}: {selectedDna.product_names.join(', ')}</p>
              )}
            </CardContent>
          </Card>

          {/* 统计分析面板 */}
          {selectedDna.statistics && (
            <Card className="border-sky-500/20 bg-sky-500/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-sky-400" /> {t('dna.statsPanel')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  {/* Hook 类型分布 */}
                  <div className="space-y-1">
                    <p className="font-medium text-slate-300 mb-1">{t('dna.statsHookDist')}</p>
                    {Object.entries(selectedDna.statistics.hook_type_distribution).map(([hook, count]) => (
                      <p key={hook} className="text-xs text-slate-400">{hook}: {count}</p>
                    ))}
                  </div>

                  {/* 效果指标 */}
                  <div className="space-y-2">
                    <div>
                      <p className="font-medium text-slate-300">{t('dna.statsEngagement')}</p>
                      <p className="text-xs text-slate-400">{t('dna.statsMax')}: {safeFixed(selectedDna.statistics.engagement.max, 3)} | {t('dna.statsMedian')}: {safeFixed(selectedDna.statistics.engagement.median, 3)} | {t('dna.statsMean')}: {safeFixed(selectedDna.statistics.engagement.mean, 3)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-300">{t('dna.statsCtr')}</p>
                      <p className="text-xs text-slate-400">{t('dna.statsMax')}: {safeFixed(selectedDna.statistics.ctr.max, 3)} | {t('dna.statsMedian')}: {safeFixed(selectedDna.statistics.ctr.median, 3)} | {t('dna.statsMean')}: {safeFixed(selectedDna.statistics.ctr.mean, 3)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-300">{t('dna.statsCompletion')}</p>
                      <p className="text-xs text-slate-400">{t('dna.statsMax')}: {safeFixed(selectedDna.statistics.completion.max, 3)} | {t('dna.statsMedian')}: {safeFixed(selectedDna.statistics.completion.median, 3)} | {t('dna.statsMean')}: {safeFixed(selectedDna.statistics.completion.mean, 3)}</p>
                    </div>
                  </div>

                  {/* Hook 效果 + 其他 */}
                  <div className="space-y-2">
                    <div>
                      <p className="font-medium text-slate-300 mb-1">{t('dna.statsHookEffect')}</p>
                      {Object.entries(selectedDna.statistics.hook_type_effectiveness).map(([hook, eff]) => (
                        <p key={hook} className="text-xs text-slate-400">
                          {hook}: R={safeFixed(eff.retention, 3)} C={safeFixed(eff.ctr, 3)} P={safeFixed(eff.completion, 3)}
                        </p>
                      ))}
                    </div>
                    <div className="text-xs text-slate-400 space-y-0.5">
                      <p>{t('dna.statsDiversity')}: {safeFixed(selectedDna.statistics.diversity_variance, 2)}</p>
                      <p>{t('dna.statsCI')}: ±{safeFixed(selectedDna.statistics.confidence_interval_95, 3)}</p>
                      <p>{t('dna.statsSamples')}: {selectedDna.statistics.sample_size}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hook DNA */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" /> {t('dna.hookDna')}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {selectedDna.hooks?.map((h, i) => (
                  <div key={i} className="border rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{h.type}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {t('dna.duration')}: {h.structure.duration_seconds}s | {t('dna.wordCount')}: {h.structure.word_count}
                      </span>
                    </div>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {h.structure.emotional_hooks.map((eh, j) => (
                        <Badge key={j} variant="outline" className="text-xs">{eh}</Badge>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{t('dna.retentionRate')}: {safeFixed((h.effectiveness?.retention_rate_avg ?? 0) * 100, 1)}%</span>
                      <span>CTR: {safeFixed((h.effectiveness?.ctr_avg ?? 0) * 100, 2)}%</span>
                      <span>{t('dna.completionRate')}: {safeFixed((h.effectiveness?.completion_rate_avg ?? 0) * 100, 1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Visual Style DNA */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Eye className="w-4 h-4" /> {t('dna.visualStyleDna')}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {selectedDna.visual_styles?.map((vs, i) => (
                  <div key={i} className="border rounded-md p-3">
                    <Badge variant="outline" className="mb-2">{vs.style}</Badge>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>{t('dna.cameraPattern')}: {vs.camera_patterns?.join(', ') || '-'}</span>
                      <span>{t('dna.transitionSequence')}: {vs.transition_sequence?.join(' → ') || '-'}</span>
                      <span>{t('dna.shotCount')}: {vs.shot_count_range?.[0]} - {vs.shot_count_range?.[1]}</span>
                      <span>{t('dna.durationRange')}: {vs.duration_range?.[0]}s - {vs.duration_range?.[1]}s</span>
                      <span>{t('dna.textOverlayRatio')}: {vs.text_overlay_ratio != null ? `${safeFixed(vs.text_overlay_ratio * 100, 0)}%` : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* BGM + 节奏 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('dna.bgmRhythm')}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {selectedDna.bgm_patterns?.map((bgm, i) => (
                    <div key={i} className="border rounded-md p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">{bgm.genre}</Badge>
                        <span className="text-xs text-muted-foreground">BPM: {bgm.bpm_range?.[0]} - {bgm.bpm_range?.[1]}</span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>{t('dna.introDuration')}: {bgm.intro_duration_seconds}s</p>
                        <p>{t('dna.peakTimestamp')}: {bgm.peak_timestamp_seconds}s</p>
                        <p>{t('dna.fadeOut')}: {bgm.fade_out_duration_seconds}s</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{t('dna.rhythmDna')}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {selectedDna.pacing_patterns?.map((pp, i) => (
                    <div key={i} className="border rounded-md p-3">
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>{t('dna.avgShotDuration')}: {pp.avg_shot_duration_seconds}s</p>
                        <p>{t('dna.durationVariance')}: {pp.duration_variance?.toFixed(2)}</p>
                        {pp.engagement_peaks?.length > 0 && (
                          <p>{t('dna.engagementPeaks')}: {pp.engagement_peaks.map((s) => `${s}s`).join(', ')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* CTA Style */}
          <Card>
            <CardHeader><CardTitle className="text-base">{t('dna.ctaStyle')}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {selectedDna.cta_styles?.map((cta, i) => (
                  <div key={i} className="border rounded-md p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={cta.placement_type === 'ending' ? 'outline' : 'default'}>
                        {cta.placement_type === 'ending' ? t('dna.placementEnding') : cta.placement_type === 'mid_video' ? t('dna.placementMidVideo') : t('dna.placementScattered')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{t('dna.delayFromEnd')}: {cta.delay_from_end_seconds}s</span>
                      <span className="text-xs text-muted-foreground">{t('dna.visualIntensity')}: {cta.visual_intensity}</span>
                    </div>
                    {cta.text_templates?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {cta.text_templates.map((txt, j) => (
                          <Badge key={j} variant="outline" className="text-xs">{txt}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
