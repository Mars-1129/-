import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Hash, Music, Sparkles, TrendingUp, RefreshCw, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import { getTrends, refreshTrends } from '../../lib/api/trend-tracker';
import type { TrendTrackerResponse, TrendItem, TrendRecommendation } from '@tikstream/shared-types';

function typeIcon(t: TrendItem['type']) {
  switch (t) {
    case 'hashtag': return <Hash className="w-4 h-4" />;
    case 'sound': return <Music className="w-4 h-4" />;
    case 'effect': return <Sparkles className="w-4 h-4" />;
    case 'topic': return <TrendingUp className="w-4 h-4" />;
    default: return <TrendingUp className="w-4 h-4" />;
  }
}

function typeColor(t: TrendItem['type']) {
  switch (t) {
    case 'hashtag': return 'bg-sky-500/10 text-sky-300';
    case 'sound': return 'bg-purple-500/10 text-purple-300';
    case 'effect': return 'bg-amber-500/10 text-amber-300';
    case 'topic': return 'bg-emerald-500/10 text-emerald-300';
    default: return 'bg-slate-800 text-slate-300';
  }
}

function popularityBar(score: number) {
  const pct = Math.min(100, Math.max(0, score * 100));
  const color = score >= 0.7 ? 'bg-emerald-500' : score >= 0.4 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function expiresLabel(expiresAt: string, t: (key: string) => string) {
  const secs = (new Date(expiresAt).getTime() - Date.now()) / 1000;
  if (secs <= 0) return t('trendTracker.expired');
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} ${t('trendTracker.minutesLeft')}`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} ${t('trendTracker.hoursMinutesLeft')}`;
}

export function TrendTrackerPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const products = useWorkspaceStore((s) => s.products);
  const selectedProductId = useWorkspaceStore((s) => s.selectedProductId);
  const productId = selectedProductId || products[0]?.id || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrendTrackerResponse | null>(null);

  const loadTrends = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getTrends(productId);
      setData(res);
    } catch (e: unknown) {
      if (e instanceof TypeError && e.message === 'Failed to fetch') {
        setError(t('trendTracker.networkError'));
      } else {
        setError(e instanceof Error ? e.message : t('trendTracker.loadFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [productId, t]);

  useEffect(() => {
    loadTrends();
  }, [loadTrends]);

  const handleRefresh = async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await refreshTrends(productId);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('trendTracker.refreshFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (!productId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>{t('trendTracker.selectProductFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('trendTracker.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('trendTracker.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadTrends} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-1" />{t('trendTracker.refresh')}
          </Button>
          <Button onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            {t('trendTracker.forceRefresh')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">{error}</div>
      )}

      {!data && !loading && (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <div className="text-center">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('trendTracker.noData')}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('trendTracker.loading')}
        </div>
      )}

      {data && (
        <>
          {/* 快照信息 */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {expiresLabel(data.expires_at, t)}</span>
            <Badge variant="outline" className="text-xs">{data.data_source}</Badge>
            <span className="text-xs">{t('trendTracker.snapshotId')} {data.snapshot_id.slice(0, 8)}...</span>
          </div>

          {/* 热门趋势 */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Hash className="w-5 h-5 text-sky-400" /> {t('trendTracker.hotTrends')}
            </h2>
            {data.trends.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('trendTracker.noTrends')}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.trends.map((trend: TrendItem, idx: number) => (
                  <Card key={idx}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`p-1 rounded ${typeColor(trend.type)}`}>{typeIcon(trend.type)}</span>
                        <Badge variant="outline" className="text-xs">{trend.type}</Badge>
                      </div>
                      <a
                        href={trend.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sm hover:text-cyan-400 transition-colors"
                      >
                        {trend.name}
                      </a>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t('trendTracker.popularity')} {(trend.popularity_score * 100).toFixed(0)}%</span>
                          <span className="text-emerald-400">{t('trendTracker.growth')} +{(trend.growth_rate * 100).toFixed(0)}%</span>
                        </div>
                        {popularityBar(trend.popularity_score)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {t('trendTracker.expirationDays')} {trend.expiration_days} {t('common.days')}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* 蹭流量建议 */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" /> {t('trendTracker.productTrafficTitle')}
            </h2>
            {data.recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('trendTracker.noMatchSuggestions')}</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {data.recommendations.map((rec: TrendRecommendation, idx: number) => (
                  <Card key={idx}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`p-1 rounded ${typeColor(rec.trend.type)}`}>{typeIcon(rec.trend.type)}</span>
                          <span className="font-medium text-sm">{rec.trend.name}</span>
                        </div>
                        <span className="text-sm font-bold text-emerald-400">
                          {t('trendTracker.matchScore')} {(rec.product_match_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      {popularityBar(rec.product_match_score)}
                      <div className="mt-3">
                        <span className="text-xs text-muted-foreground">{t('trendTracker.potentialReach')} {rec.potential_reach.toLocaleString()}</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {rec.adaptation_tips.map((tip, j) => (
                          <div key={j} className="flex items-start gap-1.5 text-sm">
                            <span className="text-amber-400 mt-0.5">💡</span>
                            <span>{tip}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {t('trendTracker.dataGeneratedAt')} {new Date(data.created_at).toLocaleString(i18n.resolvedLanguage)}
          </p>
        </>
      )}
    </div>
  );
}
