import { Clock, GitCompare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type TimeRange = '7d' | '30d' | '90d';

interface TimeRangePickerProps {
  range: TimeRange;
  compareMode: boolean;
  onRangeChange: (r: TimeRange) => void;
  onCompareModeToggle: () => void;
}

const RANGE_OPTIONS: { labelKey: string; value: TimeRange }[] = [
  { labelKey: 'analytics.last7Days', value: '7d' },
  { labelKey: 'analytics.last30Days', value: '30d' },
  { labelKey: 'analytics.last90Days', value: '90d' },
];

export function TimeRangePicker({ range, compareMode, onRangeChange, onCompareModeToggle }: TimeRangePickerProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Clock className="h-3.5 w-3.5" />
        <span>{t('analytics.timeRange')}</span>
      </div>
      <div className="flex rounded-lg border border-slate-700 overflow-hidden">
        {RANGE_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => onRangeChange(o.value)}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              range === o.value
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            {t(o.labelKey)}
          </button>
        ))}
      </div>
      <button
        onClick={onCompareModeToggle}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition border ${
          compareMode
            ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
            : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
        }`}
      >
        <GitCompare className="h-3.5 w-3.5" />
        {t('analytics.trendCompareToggle')}
      </button>
    </div>
  );
}
