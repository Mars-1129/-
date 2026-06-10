import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Loader2, TrendingUp, AlertTriangle, Globe, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Select } from '../../components/ui/select';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import { optimizePostingTime, getPostingPlatforms } from '../../lib/api/posting-time';
import type { PostingTimeOptimization, PostingTimeSlot, PostingAvoidSlot, PostingTimeHeatmapCell } from '@tikstream/shared-types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function heatmapColor(value: number): string {
  if (value <= 0) return 'bg-muted';
  if (value < 0.04) return 'bg-blue-900/40';
  if (value < 0.06) return 'bg-blue-700/50';
  if (value < 0.08) return 'bg-green-600/50';
  if (value < 0.10) return 'bg-amber-500/50';
  return 'bg-rose-500/60';
}

function heatmapText(value: number): string {
  if (value <= 0) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function competitionColor(level: string) {
  if (level === 'low') return 'bg-emerald-500/10 text-emerald-300';
  if (level === 'medium') return 'bg-amber-500/10 text-amber-300';
  return 'bg-rose-500/10 text-rose-300';
}

function competitionLabel(level: string, t: (key: string) => string) {
  if (level === 'low') return t('postingTime.levelLow');
  if (level === 'medium') return t('postingTime.levelMedium');
  return t('postingTime.levelHigh');
}

export function PostingTimePage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const products = useWorkspaceStore((s) => s.products);
  const selectedProductId = useWorkspaceStore((s) => s.selectedProductId);
  const productId = selectedProductId || products[0]?.id || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostingTimeOptimization | null>(null);
  const [platform, setPlatform] = useState('tiktok_us');
  const [contentType, setContentType] = useState('product_review');
  const [platforms, setPlatforms] = useState<Array<{ platform: string; display_name: string; timezone: string }>>([]);

  useEffect(() => {
    getPostingPlatforms()
      .then(setPlatforms)
      .catch(() => setPlatforms([
        { platform: 'tiktok_us', display_name: 'TikTok US', timezone: 'America/New_York' },
        { platform: 'douyin', display_name: t('postingTime.platformDouyin'), timezone: 'Asia/Shanghai' },
        { platform: 'xiaohongshu', display_name: t('postingTime.platformXiaohongshu'), timezone: 'Asia/Shanghai' },
      ]));
  }, [t]);

  const handleOptimize = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await optimizePostingTime({ product_id: productId, platform, content_type: contentType });
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('postingTime.analysisFailed'));
    } finally {
      setLoading(false);
    }
  }, [productId, platform, contentType, t]);

  if (!productId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>{t('postingTime.selectProductFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('postingTime.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('postingTime.subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <Select className="w-[180px]" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {platforms.map((p) => (
              <option key={p.platform} value={p.platform}>{p.display_name}</option>
            ))}
          </Select>
          <Select className="w-[180px]" value={contentType} onChange={(e) => setContentType(e.target.value)}>
            <option value="product_review">{t('postingTime.contentProductReview')}</option>
            <option value="tutorial">{t('postingTime.contentTutorial')}</option>
            <option value="vlog">{t('postingTime.contentVlog')}</option>
            <option value="live_commerce">{t('postingTime.contentLiveCommerce')}</option>
            <option value="unboxing">{t('postingTime.contentUnboxing')}</option>
          </Select>
          <Button onClick={handleOptimize} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Clock className="w-4 h-4 mr-1" />}
            {t('postingTime.startAnalysis')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">{error}</div>
      )}

      {!result && !loading && (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <div className="text-center">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('postingTime.noPlatformSelected')}</p>
          </div>
        </div>
      )}

      {result && (
        <>
          {/* Baseline */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('postingTime.baselineCTR')}</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{result.baseline_ctr.toFixed(4)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('postingTime.expectedBoost')}</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-emerald-400">+{(result.expected_ctr_lift * 100).toFixed(1)}%</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('postingTime.dataSource')}</CardTitle></CardHeader>
              <CardContent><Badge variant="outline">{result.data_source}</Badge></CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" /> {t('postingTime.bestTimeSlots')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {result.recommendations.map((slot: PostingTimeSlot, idx: number) => (
                <Card key={idx} className="border-emerald-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{slot.day_of_week}</span>
                      <span className="text-sm font-mono text-muted-foreground">{slot.time_range.start} - {slot.time_range.end}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{t('postingTime.score')}: <strong>{slot.score}</strong></span>
                      <span className="text-sm">{t('postingTime.ctrBoost')}: <strong>+{(slot.expected_ctr_boost * 100).toFixed(1)}%</strong></span>
                    </div>
                    <div className="flex gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${competitionColor(slot.competition_level)}`}>
                        {competitionLabel(slot.competition_level, t)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300">
                        {slot.audience_activity === 'peak' ? t('postingTime.peakActivity') : slot.audience_activity === 'moderate' ? t('postingTime.moderateActivity') : t('postingTime.lowActivity')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{slot.reasoning}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Heatmap — 历史互动热力图 */}
          {result.heatmap_data && result.heatmap_data.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-sky-400" /> {t('postingTime.heatmapTitle') || '互动率热力图 (天×时段)'}
              </h2>
              <Card>
                <CardContent className="p-4 overflow-x-auto">
                  <div className="inline-grid grid-cols-[80px_repeat(9,1fr)] gap-1 text-xs">
                    {/* Header row: hour labels */}
                    <div className="font-medium text-muted-foreground p-1" />
                    {['06-08','08-10','10-12','12-14','14-16','16-18','18-20','20-22','22-24'].map((h) => (
                      <div key={h} className="font-medium text-muted-foreground p-1 text-center">{h}</div>
                    ))}
                    {/* Data rows */}
                    {['周一','周二','周三','周四','周五','周六','周日'].map((day) => (
                      <React.Fragment key={day}>
                        <div className="font-medium text-muted-foreground p-1 flex items-center">{day}</div>
                        {['06-08','08-10','10-12','12-14','14-16','16-18','18-20','20-22','22-24'].map((hour) => {
                          const cell = result.heatmap_data?.find(
                            (c: PostingTimeHeatmapCell) => c.day === day && c.hour === hour,
                          );
                          const val = cell?.value ?? 0;
                          const hasData = cell?.metric !== 'no_data' && val > 0;
                          return (
                            <div
                              key={`${day}-${hour}`}
                              className={`p-2 rounded text-center font-mono text-[10px] ${heatmapColor(val)} ${hasData ? 'text-white font-semibold' : 'text-muted-foreground/40'}`}
                              title={`${day} ${hour}: ${heatmapText(val)}`}
                            >
                              {heatmapText(val)}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t('postingTime.heatmapNote') || '颜色越深 → 历史互动率越高 | 基于该商品在该平台的全部历史投放数据'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Avoid Slots */}
          {result.avoid_slots.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5" /> {t('postingTime.avoidTimeSlots')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.avoid_slots.map((slot: PostingAvoidSlot, idx: number) => (
                  <Card key={idx} className="border-rose-500/20">
                    <CardContent className="p-4">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">{t('postingTime.avoidTimeSlots')}</span>
                        <span className="text-sm font-mono">{slot.time_range.start} - {slot.time_range.end}</span>
                      </div>
                      <p className="text-xs text-rose-400">{slot.reason}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {t('postingTime.generatedAt')} {new Date(result.generated_at).toLocaleString(i18n.resolvedLanguage)}
          </p>
        </>
      )}
    </div>
  );
}
