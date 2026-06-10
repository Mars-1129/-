import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Upload, BarChart3, Lightbulb, CheckCircle, AlertTriangle, TrendingUp, Target, Shield, Star, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import {
  fetchComments,
  listComments,
  analyzeCommentsWithProgress,
  getAnalysisSummary,
  triggerOptimization,
  triggerOptimizationWithProgress,
  listOptimizations,
  checkAiHealth,
} from '../../lib/api/comments';
import type {
  CommentResponse,
  CommentSentimentSummary,
  OptimizationRecordResponse,
  BatchAnalyzeResponse,
  StructuredOptimization,
  OptimizationSuggestionItem,
} from '@tikstream/shared-types';
import { listScripts } from '../../lib/api/scripts';
import type { Script } from '@tikstream/shared-types';

type TabKey = 'list' | 'analysis' | 'optimizations';

function sentimentColor(s: string) {
  if (s === 'positive') return 'bg-green-100 text-green-800';
  if (s === 'negative') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-600';
}

/** 判断是否为占位式优化建议（非 AI 生成的模板文本） */
function isPlaceholderSuggestion(text: string): boolean {
  // 无"分镜"结构的短文本 → 旧版占位记录
  if (!text.includes('分镜')) return true;
  // 含占位标记短语
  if (text.includes('已触发自动优化') || text.includes('优化后可显著降低差评率')) return true;
  return false;
}

export function CommentsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const products = useWorkspaceStore((s) => s.products);
  const globalProductId = useWorkspaceStore((s) => s.selectedProductId);

  // 独立的产品选择器
  const [selectedProductId, setSelectedProductId] = useState(globalProductId || products[0]?.id || '');
  const productId = selectedProductId;

  const [tab, setTab] = useState<TabKey>('list');
  const [listLoading, setListLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [optimizeTrigger, setOptimizeTrigger] = useState<'pain_point' | 'feature_request' | 'negative_sentiment'>('pain_point');
  // 优化进度
  const [optimizeProgress, setOptimizeProgress] = useState<{ step: string; message: string; progress: number; data?: unknown } | null>(null);

  // 脚本选择器
  const [scripts, setScripts] = useState<Script[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState('');
  const [optimizeScriptMode, setOptimizeScriptMode] = useState<'product' | 'script'>('product');

  // AI API 可用性
  const [aiHealth, setAiHealth] = useState<{ ok: boolean; message: string; configured: boolean } | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // 评论列表
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [sentimentFilter, setSentimentFilter] = useState<string | undefined>(undefined);

  // 情感摘要
  const [summary, setSummary] = useState<CommentSentimentSummary | null>(null);

  // 优化记录
  const [optimizations, setOptimizations] = useState<OptimizationRecordResponse[]>([]);

  // 最近一次结构化优化结果
  const [lastStructuredOptimization, setLastStructuredOptimization] = useState<StructuredOptimization | null>(null);

  // 采集弹窗
  const [showFetch, setShowFetch] = useState(false);
  const [fetchUrl, setFetchUrl] = useState('');
  const [fetchMode, setFetchMode] = useState<'mock' | 'csv_import' | 'tiktok_api'>('mock');
  const [fetchResult, setFetchResult] = useState('');

  // 分析进度与结果
  const [analyzeResult, setAnalyzeResult] = useState<BatchAnalyzeResponse | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<{
    phase: string;
    stage: string;
    message: string;
    current: number;
    total: number;
  } | null>(null);

  const loadComments = useCallback(async () => {
    if (!productId) return;
    setListLoading(true);
    setError(null);
    try {
      const res = await listComments({
        product_id: productId,
        ...(sentimentFilter ? { sentiment: sentimentFilter as 'positive' | 'neutral' | 'negative' } : {}),
      });
      setComments(res.items || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('comments.loadCommentsFailed'));
    } finally {
      setListLoading(false);
    }
  }, [productId, sentimentFilter, t]);

  const loadSummary = useCallback(async () => {
    if (!productId) return;
    setAnalyzeLoading(true);
    setError(null);
    try {
      const s = await getAnalysisSummary(productId);
      setSummary(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('comments.loadSummaryFailed'));
    } finally {
      setAnalyzeLoading(false);
    }
  }, [productId, t]);

  const loadOptimizations = useCallback(async () => {
    if (!productId) return;
    setOptimizeLoading(true);
    setError(null);
    try {
      const res = await listOptimizations(productId);
      // 过滤占位式优化建议：不含"分镜"结构或含占位标记文本
      const filtered = res.filter((o) => !isPlaceholderSuggestion(o.suggestion));
      setOptimizations(filtered);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('comments.loadOptimizationsFailed'));
    } finally {
      setOptimizeLoading(false);
    }
  }, [productId, t]);

  // 产品切换时加载脚本列表 + 清理优化状态
  useEffect(() => {
    if (!productId) {
      setScripts([]);
      setSelectedScriptId('');
      return;
    }
    setLastStructuredOptimization(null);
    setOptimizeScriptMode('product');
    setSelectedScriptId('');
    listScripts(productId)
      .then((res) => setScripts(res.items || []))
      .catch(() => setScripts([]));
  }, [productId]);

  // 自动检查 AI API 可用性（页面加载时执行一次）
  const doCheckHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const result = await checkAiHealth();
      setAiHealth(result);
    } catch {
      setAiHealth({ ok: false, message: '无法连接到健康检查端点', configured: false });
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    doCheckHealth();
  }, [doCheckHealth]);

  useEffect(() => {
    if (!productId) return;
    if (tab === 'list') loadComments();
    else if (tab === 'analysis') loadSummary();
    else if (tab === 'optimizations') loadOptimizations();
  }, [tab, productId, loadComments, loadSummary, loadOptimizations]);

  const handleFetch = async () => {
    if (!productId) return;
    // mock 模式无需视频链接
    if (fetchMode !== 'mock' && !fetchUrl.trim()) {
      setActionError(t('comments.enterVideoUrl'));
      return;
    }
    setListLoading(true);
    setActionError(null);
    try {
      const res = await fetchComments({
        product_id: productId,
        video_url: fetchUrl.trim() || `mock://product/${productId}`,
        mode: fetchMode,
      });
      setFetchResult(
        t('comments.collectComplete')
          .replace('{new}', String(res.new_count))
          .replace('{skipped}', String(res.skipped_count)),
      );
      setShowFetch(false);
      setFetchResult('');
      await loadComments();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t('comments.collectFailed'));
    } finally {
      setListLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!productId) return;
    setAnalyzeResult(null);
    setAnalyzeProgress(null);
    setAnalyzeLoading(true);
    try {
      const res = await analyzeCommentsWithProgress(
        { product_id: productId },
        (event) => {
          setAnalyzeProgress(event);
        },
      );
      setAnalyzeResult(res);
      loadSummary();
      loadComments();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('comments.analysisFailed'));
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const handleStartAnalyze = () => {
    setAnalyzeResult(null);
    setAnalyzeProgress(null);
    handleAnalyze();
  };

  const handleOptimize = async () => {
    if (!productId) return;
    setOptimizeLoading(true);
    setError(null);
    setActionError(null);
    setOptimizeProgress(null);
    try {
      const result = await triggerOptimizationWithProgress(
        {
          product_id: productId,
          trigger: optimizeTrigger,
          script_id: optimizeScriptMode === 'script' && selectedScriptId ? selectedScriptId : undefined,
        },
        (progress) => {
          setOptimizeProgress(progress);
        },
      );
      if (result.suggestion_structured) {
        setLastStructuredOptimization(result.suggestion_structured);
      }
      await loadOptimizations();
      await loadSummary();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t('comments.optimizationFailed'));
    } finally {
      setOptimizeLoading(false);
      setOptimizeProgress(null);
    }
  };

  if (!productId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>{t('comments.selectProductFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('comments.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('comments.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 独立产品选择器 */}
          <div className="relative">
            <select
              className="appearance-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 pr-8 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setAnalyzeResult(null);
                setAnalyzeProgress(null);
              }}
            >
              {products.length === 0 && (
                <option value="">{t('comments.selectProductFirst')}</option>
              )}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.sku_code || p.id}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFetch(true)}>
              <Upload className="w-4 h-4 mr-1" />{t('comments.collect')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleStartAnalyze} disabled={analyzeLoading}>
              <BarChart3 className="w-4 h-4 mr-1" />{analyzeLoading ? t('comments.analyzing') : t('comments.batchAnalysis')}
            </Button>
            <div className="flex gap-1 items-center">
              {/* 剧本定向（可选） */}
              {scripts.length > 0 && (
                <div className="flex items-center gap-1">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      className="w-3 h-3 accent-indigo-500"
                      checked={optimizeScriptMode === 'product'}
                      onChange={() => setOptimizeScriptMode('product')}
                    />
                    <span className="text-xs text-slate-400">{t('comments.optimizeByProduct', '产品')}</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      className="w-3 h-3 accent-indigo-500"
                      checked={optimizeScriptMode === 'script'}
                      onChange={() => setOptimizeScriptMode('script')}
                    />
                    <span className="text-xs text-slate-400">{t('comments.optimizeByScript', '剧本')}</span>
                  </label>
                </div>
              )}
              {optimizeScriptMode === 'script' && (
                <select
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"
                  value={selectedScriptId}
                  onChange={(e) => setSelectedScriptId(e.target.value)}
                >
                  <option value="">选择剧本...</option>
                  {scripts.map((s) => (
                    <option key={s.script_id} value={s.script_id}>
                      {s.title || s.script_id}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"
                value={optimizeTrigger}
                onChange={(e) => setOptimizeTrigger(e.target.value as 'pain_point' | 'feature_request' | 'negative_sentiment')}
              >
                <option value="pain_point">{t('comments.triggerPainPoint')}</option>
                <option value="feature_request">{t('comments.triggerFeatureRequest')}</option>
                <option value="negative_sentiment">{t('comments.triggerSentimentDrop')}</option>
              </select>
              <Button variant="default" size="sm" onClick={handleOptimize} disabled={optimizeLoading}>
                <Lightbulb className="w-4 h-4 mr-1" />{t('comments.triggerOptimization')}
              </Button>
              {/* AI 可用性状态 */}
              {aiHealth && (
                <span
                  className={`text-xs px-2 py-1 rounded-full cursor-pointer ${
                    aiHealth.ok ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-red-900/50 text-red-400 border border-red-700'
                  }`}
                  title={aiHealth.message}
                  onClick={doCheckHealth}
                >
                  {aiHealth.ok ? 'AI ✓' : 'AI ✗'}
                </span>
              )}
              {checkingHealth && (
                <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-400">
                  <Loader2 className="w-3 h-3 inline animate-spin mr-1" />AI...
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="list">{t('comments.listTab')}</TabsTrigger>
          <TabsTrigger value="analysis">{t('comments.analysisTab')}</TabsTrigger>
          <TabsTrigger value="optimizations">{t('comments.optimizationsTab')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">{error}</div>
      )}

      {actionError && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button className="ml-4 text-destructive/70 hover:text-destructive" onClick={() => setActionError(null)}>✕</button>
        </div>
      )}

      {(listLoading || analyzeLoading || optimizeLoading) && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />{' '}
          {listLoading ? t('comments.loadingComments') : analyzeLoading ? t('comments.analyzing') : t('comments.optimizing')}
        </div>
      )}

      {/* 优化进度流水线 - 分步展示 */}
      {optimizeProgress && (
        <div className="bg-indigo-950/20 border border-indigo-800/50 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-medium text-indigo-200">优化流程 - 5 步流水线</span>
            <span className="text-xs text-slate-500 ml-auto">总进度 {Math.round(optimizeProgress.progress)}%</span>
          </div>

          {/* 进度条 */}
          <div className="bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${optimizeProgress.step === 'completed' ? 'bg-green-500' : 'bg-indigo-500'}`}
              style={{ width: `${Math.max(optimizeProgress.progress, 3)}%` }}
            />
          </div>

          {/* 步骤列表 */}
          <div className="space-y-2">
            {[
              { key: 'loading_summary', label: '加载情感摘要', desc: '从数据库聚合评论分析数据' },
              { key: 'summary_loaded', label: '摘要就绪', desc: '正面/负面比、痛点、购买意向' },
              { key: 'building_prompt', label: '构建提示词', desc: '组装评论数据 → AI Prompt' },
              { key: 'calling_ai', label: 'AI 生成建议', desc: '豆包大模型分析并生成优化方案' },
              { key: 'saving_record', label: '持久化保存', desc: '优化记录写入数据库' },
            ].map((step) => {
              const isActive = optimizeProgress.step === step.key || 
                (step.key === 'summary_loaded' && ['loading_summary', 'summary_loaded'].includes(optimizeProgress.step)) ||
                (step.key === 'calling_ai' && ['calling_ai', 'ai_request_sent', 'ai_response_received', 'ai_fallback'].includes(optimizeProgress.step));
              const isDone = 
                (step.key === 'loading_summary' && !['loading_summary', 'connected'].includes(optimizeProgress.step)) ||
                (step.key === 'summary_loaded' && !['loading_summary', 'connected', 'summary_loaded'].includes(optimizeProgress.step)) ||
                (step.key === 'building_prompt' && !['loading_summary', 'connected', 'summary_loaded', 'building_prompt'].includes(optimizeProgress.step)) ||
                (step.key === 'calling_ai' && ['suggestions_generated', 'saving_record', 'record_saved', 'auto_applying', 'completed'].includes(optimizeProgress.step)) ||
                (step.key === 'saving_record' && ['record_saved', 'completed'].includes(optimizeProgress.step));
              
              return (
                <div key={step.key} className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isDone ? 'bg-green-900/20 border border-green-800/50' :
                  isActive ? 'bg-indigo-900/30 border border-indigo-700/50' :
                  'bg-slate-900/30 border border-slate-800/30'
                }`}>
                  <div className="flex-shrink-0">
                    {isDone ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : isActive ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${isDone ? 'text-green-300' : isActive ? 'text-indigo-300' : 'text-slate-500'}`}>
                      {step.label}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 当前步骤详情 */}
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800/50">
            <div className="flex items-center gap-2">
              {optimizeProgress.step === 'completed' ? (
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400 flex-shrink-0" />
              )}
              <p className="text-xs text-slate-300">{optimizeProgress.message}</p>
            </div>
            {optimizeProgress.data && (
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(optimizeProgress.data as Record<string, unknown>).map(([k, v]) => (
                  <Badge key={k} variant="outline" className="text-[10px]">
                    {k}: {String(v)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 评论列表 ===== */}
      {tab === 'list' && !listLoading && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Badge
              variant={sentimentFilter === undefined ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSentimentFilter(undefined)}
            >
              {t('comments.all')}
            </Badge>
            <Badge
              variant={sentimentFilter === 'positive' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSentimentFilter('positive')}
            >
              {t('comments.positive')}
            </Badge>
            <Badge
              variant={sentimentFilter === 'neutral' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSentimentFilter('neutral')}
            >
              {t('comments.neutral')}
            </Badge>
            <Badge
              variant={sentimentFilter === 'negative' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSentimentFilter('negative')}
            >
              {t('comments.negative')}
            </Badge>
          </div>
          {comments.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">{t('comments.noData')}</p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{c.author_name || t('comments.anonymousUser')}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${sentimentColor(c.analysis?.sentiment || '')}`}>
                            {c.analysis?.sentiment || t('comments.notAnalyzed')}
                          </span>
                          {c.like_count > 0 && <span className="text-xs text-muted-foreground">❤ {c.like_count}</span>}
                        </div>
                        <p className="text-sm">{c.content}</p>
                        {c.analysis?.key_topics != null && c.analysis.key_topics.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {c.analysis.key_topics.map((t: string) => (
                              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== 情感分析摘要 ===== */}
      {tab === 'analysis' && !analyzeLoading && summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">{t('comments.analysisTab')}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span>{t('comments.positive')}</span><span className="text-green-600">{summary.positive_count} ({Math.round(summary.positive_ratio * 100)}%)</span></div>
                <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full" style={{ width: `${summary.positive_ratio * 100}%` }} /></div>
                <div className="flex justify-between text-sm"><span>{t('comments.neutral')}</span><span className="text-gray-600">{summary.neutral_count}</span></div>
                <div className="flex justify-between text-sm"><span>{t('comments.negative')}</span><span className="text-red-600">{summary.negative_count} ({Math.round(summary.negative_ratio * 100)}%)</span></div>
                <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-red-500 h-2 rounded-full" style={{ width: `${summary.negative_ratio * 100}%` }} /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">{t('comments.optimizationsTab')}</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {summary.top_pain_points?.map((p, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-red-400">•</span> {p}
                  </li>
                )) || <li className="text-sm text-muted-foreground">{t('common.none')}</li>}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">{t('common.none')}</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {summary.top_feature_requests?.map((f, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-blue-400">•</span> {f}
                  </li>
                )) || <li className="text-sm text-muted-foreground">{t('common.none')}</li>}
              </ul>
              {summary.average_purchasing_intent !== undefined && (
                <p className="mt-3 text-sm">
                  {t('common.none')}: <span className="font-bold text-blue-600">{summary.average_purchasing_intent.toFixed(2)}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {tab === 'analysis' && !analyzeLoading && !summary && !analyzeProgress && !analyzeResult && (
        <p className="text-muted-foreground text-sm py-8 text-center">{t('common.noData')}</p>
      )}

      {/* ===== 分析进度（内联） ===== */}
      {analyzeProgress && (
        <div className="bg-indigo-950/30 border border-indigo-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {analyzeProgress.stage !== 'done' ? (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-300" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )}
            <span className={analyzeProgress.stage === 'done' ? 'text-green-400' : 'text-indigo-300'}>
              {analyzeProgress.message}
            </span>
            <span className="text-xs text-slate-500 ml-auto">
              {analyzeProgress.total > 0 ? `${analyzeProgress.current}/${analyzeProgress.total}` : `${analyzeProgress.current}%`}
            </span>
          </div>
          {analyzeProgress.total > 0 && (
            <div className="bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, (analyzeProgress.current / analyzeProgress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* ===== 分析结果（内联） ===== */}
      {analyzeResult && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              {t('comments.batchAnalysis')} - {t('common.completed')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-4 text-sm">
              <span>{t('comments.analyzedCount')}: <strong>{analyzeResult.analyzed_count}</strong></span>
              <span>{t('comments.failedCount')}: <strong>{analyzeResult.failed_count}</strong></span>
            </div>
            {analyzeResult.summary && (
              <div className="flex gap-3">
                <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400">
                  {t('comments.positive')} {Math.round(analyzeResult.summary.positive_ratio * 100)}%
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400">
                  {t('comments.negative')} {Math.round(analyzeResult.summary.negative_ratio * 100)}%
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {tab === 'optimizations' && !optimizeLoading && (
        <div className="space-y-6">
          {/* ===== 优化建议 ===== */}
          {/* 结构化优化结果 */}
          {lastStructuredOptimization && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-500" />
                  {t('comments.optimizationSummary')}
                </CardTitle>
                <CardDescription>{lastStructuredOptimization.summary}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* 评分卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  {[
                    { key: 'overall', label: '综合', icon: Star, color: 'text-yellow-500' },
                    { key: 'clarity', label: '清晰度', icon: Target, color: 'text-blue-500' },
                    { key: 'engagement', label: '参与度', icon: TrendingUp, color: 'text-green-500' },
                    { key: 'conversion', label: '转化力', icon: AlertTriangle, color: 'text-orange-500' },
                    { key: 'trust', label: '信任度', icon: Shield, color: 'text-purple-500' },
                  ].map(({ key, label, icon: Icon, color }) => {
                    const val = lastStructuredOptimization.score[key as keyof typeof lastStructuredOptimization.score] as number;
                    return (
                      <div key={key} className="bg-white dark:bg-slate-900 rounded-lg p-3 text-center border">
                        <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
                        <div className="text-lg font-bold">{val}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 结构化建议列表 */}
          {lastStructuredOptimization && lastStructuredOptimization.suggestions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">{t('comments.optimizationSuggestions')}</h3>
              <div className="space-y-3">
                {lastStructuredOptimization.suggestions.map((s: OptimizationSuggestionItem, i: number) => (
                  <Card key={i} className={s.priority === 'high' ? 'border-l-4 border-l-red-500' : s.priority === 'medium' ? 'border-l-4 border-l-yellow-500' : 'border-l-4 border-l-green-500'}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={s.priority === 'high' ? 'default' : s.priority === 'medium' ? 'outline' : 'outline'} className="text-xs">
                          {s.priority === 'high' ? '🔴 ' : s.priority === 'medium' ? '🟡 ' : '🟢 '}
                          {t('comments.optimizationPriority')}: {s.priority === 'high' ? '高' : s.priority === 'medium' ? '中' : '低'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {t('comments.optimizationShot')}{s.shot_index} - {s.shot_label}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex gap-2">
                          <span className="text-red-500 font-medium min-w-[4rem]">{t('comments.optimizationIssue')}:</span>
                          <span className="text-muted-foreground">{s.issue}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-blue-500 font-medium min-w-[4rem]">{t('comments.optimizationAction')}:</span>
                          <span>{s.action}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-gray-500 font-medium min-w-[4rem]">{t('comments.optimizationReason')}:</span>
                          <span className="text-muted-foreground">{s.reason}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-green-500 font-medium min-w-[4rem]">{t('comments.optimizationExpectedImpact')}:</span>
                          <span className="text-green-600">{s.expected_impact}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* 优化后大纲 */}
          {lastStructuredOptimization && lastStructuredOptimization.improved_script_outline.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('comments.optimizationImprovedOutline')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {lastStructuredOptimization.improved_script_outline.map((line: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-blue-400 font-mono text-xs mt-0.5">#{i + 1}</span>
                      {line}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* 优化历史记录 */}
          {optimizations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 mt-2">{t('comments.triggerOptimization')} {t('common.none')}</h3>
              <div className="space-y-3">
                {optimizations.map((o) => (
                  <Card key={o.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={o.status === 'applied' ? 'default' : 'outline'} className="text-xs">
                              {o.status}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{o.trigger}</Badge>
                          </div>
                          <p className="text-sm mt-2 whitespace-pre-wrap">{o.suggestion}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(o.created_at).toLocaleString(i18n.resolvedLanguage)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* 空状态 */}
          {!lastStructuredOptimization && optimizations.length === 0 && (
            <p className="text-muted-foreground text-sm py-8 text-center">{t('common.noData')}</p>
          )}
        </div>
      )}

      {/* ===== 采集弹窗 ===== */}
      {showFetch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-96">
            <CardHeader>
              <CardTitle>{t('comments.collect')}</CardTitle>
              <CardDescription>{t('comments.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium">{t('comments.videoLinkOrCsv')}</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm mt-1"
                  placeholder={fetchMode === 'mock' ? t('comments.mockNoUrlNeeded') : 'https://www.tiktok.com/@user/video/...'}
                  value={fetchUrl}
                  onChange={(e) => setFetchUrl(e.target.value)}
                  disabled={fetchMode === 'mock'}
                />
                {fetchMode === 'mock' && (
                  <p className="text-xs text-muted-foreground mt-1">{t('comments.mockAutoGenerate')}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">{t('comments.collectMode')}</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={fetchMode} onChange={(e) => setFetchMode(e.target.value as typeof fetchMode)}>
                  <option value="mock">Mock {t('comments.mockMode')}</option>
                  <option value="csv_import">{t('comments.csvImport')}</option>
                  <option value="tiktok_api">TikTok API</option>
                </select>
              </div>
              {fetchResult && <p className="text-sm text-green-600">{fetchResult}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowFetch(false); setFetchResult(''); }}>{t('common.cancel')}</Button>
                <Button size="sm" onClick={handleFetch} disabled={listLoading}>
                  {listLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('comments.collect')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
