import { Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnalyticsMetric, HeatmapDimension } from '@tikstream/shared-types';

export const METRIC_OPTIONS: { labelKey: string; value: AnalyticsMetric }[] = [
  { labelKey: 'analytics.ctr', value: 'CTR' },
  { labelKey: 'analytics.cvr', value: 'CVR' },
  { labelKey: 'analytics.completeRate', value: 'COMPLETION_RATE' },
  { labelKey: 'analytics.retentionRate', value: 'RETENTION_RATE' },
];

export const DIMENSION_OPTIONS: { labelKey: string; value: HeatmapDimension }[] = [
  { labelKey: 'analytics.narrativeStrategy', value: 'NARRATIVE_STRATEGY' },
  { labelKey: 'analytics.visualStyle', value: 'VISUAL_STYLE' },
  { labelKey: 'analytics.bgmStyle', value: 'BGM_STYLE' },
  { labelKey: 'analytics.ctaStyle', value: 'CTA_STYLE' },
];

interface HeatmapControlsProps {
  xDimension: HeatmapDimension;
  yDimension: HeatmapDimension;
  metric: AnalyticsMetric;
  onXDimensionChange: (d: HeatmapDimension) => void;
  onYDimensionChange: (d: HeatmapDimension) => void;
  onMetricChange: (m: AnalyticsMetric) => void;
  onApply: () => void;
  loading?: boolean;
}

export function HeatmapControls({
  xDimension, yDimension, metric,
  onXDimensionChange, onYDimensionChange, onMetricChange,
  onApply, loading,
}: HeatmapControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <Settings2 className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-500">{t('analytics.xAxisLabel')}</span>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 text-xs outline-none focus:border-cyan-500/50"
          value={xDimension}
          onChange={(e) => onXDimensionChange(e.target.value as HeatmapDimension)}
        >
          {DIMENSION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} disabled={o.value === yDimension}>{t(o.labelKey)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-500">{t('analytics.yAxisLabel')}</span>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 text-xs outline-none focus:border-cyan-500/50"
          value={yDimension}
          onChange={(e) => onYDimensionChange(e.target.value as HeatmapDimension)}
        >
          {DIMENSION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} disabled={o.value === xDimension}>{t(o.labelKey)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-500">{t('analytics.metricLabel')}</span>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 text-xs outline-none focus:border-cyan-500/50"
          value={metric}
          onChange={(e) => onMetricChange(e.target.value as AnalyticsMetric)}
        >
          {METRIC_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
          ))}
        </select>
      </div>
      <button
        onClick={onApply}
        disabled={loading}
        className="ml-auto rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition"
      >
        {loading ? t('common.loading') : t('common.apply')}
      </button>
    </div>
  );
}
