import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, TrendingUp, Shield, Zap, AlertTriangle, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Select } from '../../components/ui/select';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import { listScripts } from '../../lib/api/scripts';
import { predictPerformanceStream } from '../../lib/api/analytics';
import type { PerformancePrediction, ImprovementSuggestion } from '@tikstream/shared-types';
import type { Script } from '@tikstream/shared-types';

function sourceLabel(src: PerformancePrediction['data_source'], t: (key: string) => string) {
  switch (src) {
    case 'LLM_DEEP_ANALYSIS': return { label: t('coldStart.sourceLLM'), color: 'bg-violet-500/10 text-violet-300' };
    case 'DUCKDB_PRECOMPUTED': return { label: t('coldStart.sourcePrecomputed'), color: 'bg-emerald-500/10 text-emerald-300' };
    case 'VIRAL_DNA_ESTIMATE': return { label: t('coldStart.sourceViralDna'), color: 'bg-sky-500/10 text-sky-300' };
    case 'HEURISTIC_FALLBACK': return { label: t('coldStart.sourceHeuristic'), color: 'bg-amber-500/10 text-amber-300' };
    default: return { label: src, color: 'bg-slate-800 text-slate-300' };
  }
}

function qualityBadge(q: PerformancePrediction['data_quality']) {
  switch (q) {
    case 'HIGH': return 'bg-emerald-500/10 text-emerald-300';
    case 'MEDIUM': return 'bg-amber-500/10 text-amber-300';
    case 'LOW': return 'bg-rose-500/10 text-rose-300';
  }
}

function suggestCategory(cat: ImprovementSuggestion['category'], t: (key: string) => string) {
  switch (cat) {
    case 'HOOK': return t('coldStart.categoryHook');
    case 'VOICEOVER': return t('coldStart.categoryVoiceover');
    case 'VISUAL_STYLE': return t('coldStart.categoryVisualStyle');
    case 'CTA': return 'CTA';
    case 'JITTER': return t('coldStart.categoryJitter');
    case 'PACING': return t('coldStart.categoryPacing');
    case 'OPENING_WEAK': return t('coldStart.categoryOpeningWeak');
    case 'MID_SAG': return t('coldStart.categoryMidSag');
    case 'TEXT_DENSITY': return t('coldStart.categoryTextDensity');
    case 'EMOTIONAL_ARC': return t('coldStart.categoryEmotionalArc');
    case 'BGM_MISMATCH': return t('coldStart.categoryBgmMismatch');
    case 'TIMING_OPTIMIZATION': return t('coldStart.categoryTiming');
    default: return cat;
  }
}

export function ColdStartPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const products = useWorkspaceStore((s) => s.products);
  const selectedProductId = useWorkspaceStore((s) => s.selectedProductId);
  const productId = selectedProductId || products[0]?.id || '';

  const [scripts, setScripts] = useState<Array<{ script_id: string; title?: string }>>([]);
  const [selectedScriptId, setSelectedScriptId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PerformancePrediction | null>(null);

  // SSE streaming progress state
  const [progressStep, setProgressStep] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [progressHistory, setProgressHistory] = useState<Array<{ step: string; message: string }>>([]);

  useEffect(() => {
    if (!productId) return;
    listScripts(productId, 1, 50)
      .then((res) => {
        const items: Array<{ script_id: string; title?: string }> = Array.isArray(res)
          ? res
          : (res as { items?: Script[] }).items || [];
        setScripts(items);
        if (items.length > 0 && !selectedScriptId) setSelectedScriptId(items[0].script_id);
      })
      .catch(() => setScripts([]));
  }, [productId]);

  const handlePredict = useCallback(async () => {
    if (!selectedScriptId || !productId) return;
    setLoading(true);
    setError(null);
    setPrediction(null);
    setProgressStep('connecting');
    setProgressMessage('正在连接分析引擎...');
    setProgressHistory([]);

    try {
      const res = await predictPerformanceStream(
        selectedScriptId,
        productId,
        (event) => {
          if (event.type === 'progress') {
            setProgressStep(event.step || '');
            setProgressMessage(event.message || '');
            setProgressHistory((prev) => [
              ...prev,
              { step: event.step || '', message: event.message || '' },
            ]);
          } else if (event.type === 'error') {
            setError(event.message || t('coldStart.predictFailed'));
          }
        },
      );
      setPrediction(res);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError(t('coldStart.predictCancelled'));
      } else {
        setError(e instanceof Error ? e.message : t('coldStart.predictFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [selectedScriptId, productId, t]);

  if (!productId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>{t('coldStart.selectProductFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('coldStart.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('coldStart.subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <Select
            className="min-w-[200px]"
            value={selectedScriptId}
            onChange={(e) => { setSelectedScriptId(e.target.value); setPrediction(null); }}
          >
            {scripts.length === 0 && <option value="">{t('coldStart.noScript')}</option>}
            {scripts.map((s) => (
              <option key={s.script_id} value={s.script_id}>
                {s.title || s.script_id.slice(0, 8)}
              </option>
            ))}
          </Select>
          <Button onClick={handlePredict} disabled={loading || !selectedScriptId}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
            {t('coldStart.predictButton')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">{error}</div>
      )}

      {/* SSE Streaming Progress */}
      {loading && (
        <Card className="border-violet-500/20 bg-violet-500/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
              <span className="text-sm font-medium text-violet-300">{t('coldStart.analyzing')}</span>
            </div>
            <div className="space-y-3">
              {progressHistory.map((h, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-violet-400" />
                  </div>
                  <span className="text-muted-foreground">{h.message}</span>
                </div>
              ))}
              {progressStep && (
                <div className="flex items-start gap-3 text-sm">
                  <Loader2 className="w-5 h-5 animate-spin text-violet-400 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{progressMessage}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!prediction && !loading && (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <div className="text-center">
            <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('coldStart.noScriptSelected')}</p>
          </div>
        </div>
      )}

      {prediction && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">{t('coldStart.predictCTR')}</p>
                <p className="text-2xl font-bold text-sky-400">{(prediction.predicted_ctr * 100).toFixed(2)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">{t('coldStart.predictCVR')}</p>
                <p className="text-2xl font-bold text-purple-400">{(prediction.predicted_cvr * 100).toFixed(2)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">{t('coldStart.predictRetention')}</p>
                <p className="text-2xl font-bold text-emerald-400">{(prediction.predicted_retention * 100).toFixed(1)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">{t('coldStart.confidence')}</p>
                <p className="text-2xl font-bold">{Math.round(prediction.confidence * 100)}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Data Source */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">{t('coldStart.dataSource')}</span>
            <Badge className={sourceLabel(prediction.data_source, t).color}>
              {sourceLabel(prediction.data_source, t).label}
            </Badge>
            <span className={`text-xs px-2 py-0.5 rounded-full ${qualityBadge(prediction.data_quality)}`}>
              {t('coldStart.dataQuality')} {prediction.data_quality}
            </span>
            {prediction.predicted_completion !== undefined && (
              <span className="text-sm text-muted-foreground">
                {t('coldStart.predictedCompletion')} {(prediction.predicted_completion * 100).toFixed(1)}%
              </span>
            )}
          </div>

          {/* LLM Analysis Summary */}
          {prediction.llm_analysis_summary && (
            <Card className="border-violet-500/20 bg-violet-500/5">
              <CardContent className="p-4">
                <p className="text-sm text-violet-300 font-medium mb-2">{t('coldStart.llmSummary')}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{prediction.llm_analysis_summary}</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Factors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="w-4 h-4 text-red-500" /> {t('coldStart.riskFactors')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {prediction.risk_factors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('coldStart.noRiskDetected')}</p>
                ) : (
                  <ul className="space-y-2">
                    {prediction.risk_factors.map((rf, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-rose-400 mt-0.5">⚠</span> {rf}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Improvement Suggestions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="w-4 h-4 text-yellow-500" /> {t('coldStart.improvementSuggestions')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {prediction.improvement_suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('coldStart.noSuggestion')}</p>
                ) : (
                  <ul className="space-y-3">
                    {prediction.improvement_suggestions.map((sug: ImprovementSuggestion, i: number) => (
                      <li key={i} className="text-sm border-l-2 border-sky-500/50 pl-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800">
                            {suggestCategory(sug.category, t)}
                          </span>
                          <span className="text-xs text-emerald-400">
                            {t('coldStart.expectedBoost') + (sug.expected_boost * 100).toFixed(1)}%
                          </span>
                        </div>
                        <p>{sug.suggestion}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            {t('coldStart.predictTime')} {new Date(prediction.predicted_at).toLocaleString(i18n.resolvedLanguage)}
          </p>
        </>
      )}
    </div>
  );
}
