import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EChartsWrapper } from './EChartsWrapper';
import * as echarts from 'echarts';
import type { RetentionCurveResponse } from '@tikstream/shared-types';

interface RetentionChartProps {
  data: RetentionCurveResponse;
  timeRange?: '7d' | '30d' | '90d';
}

function fmtPct(n: number | null | undefined, fallback = '-'): string {
  if (n == null || isNaN(n)) return fallback;
  return `${(n * 100).toFixed(1)}%`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const RANGE_CONFIG = {
  '7d': {
    smooth: false,
    symbolSize: 8,
    lineWidth: 3,
    labelInterval: 1,
    sliderStart: 0,
    sliderEnd: 100,
    showSlider: false,
    badgeColor: '#f59e0b',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-300',
  },
  '30d': {
    smooth: true,
    symbolSize: 5,
    lineWidth: 2,
    labelInterval: 3,
    sliderStart: 0,
    sliderEnd: 100,
    showSlider: true,
    badgeColor: '#22d3ee',
    badgeBg: 'bg-cyan-500/15',
    badgeText: 'text-cyan-300',
  },
  '90d': {
    smooth: true,
    symbolSize: 3,
    lineWidth: 1.5,
    labelInterval: 7,
    sliderStart: 0,
    sliderEnd: 35,
    showSlider: true,
    badgeColor: '#a78bfa',
    badgeBg: 'bg-violet-500/15',
    badgeText: 'text-violet-300',
  },
} as const;

export function RetentionChart({ data, timeRange = '30d' }: RetentionChartProps) {
  const { t } = useTranslation();

  const isDayMode = data.shot_markers.length === 0 && data.curve_points.length > 50;
  const cfg = RANGE_CONFIG[timeRange] ?? RANGE_CONFIG['30d'];

  const timeUnit = isDayMode ? t('common.days') : t('common.seconds');
  const dropLabel = isDayMode ? t('analytics.dropoffDay') : t('analytics.dropoffLabel');

  const timeRangeLabel = useMemo(() => {
    switch (timeRange) {
      case '7d': return t('analytics.last7Days');
      case '30d': return t('analytics.last30Days');
      case '90d': return t('analytics.last90Days');
      default: return null;
    }
  }, [timeRange, t]);

  const option = useMemo(() => {
    const times = data.curve_points.map((p) => p.time_sec);
    const rates = data.curve_points.map((p) => +(p.retention_rate * 100).toFixed(1));

    const interval = isDayMode ? cfg.labelInterval : 0;

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 13 },
        formatter: (params: { value: number[] }[]) => {
          const p = params[0];
          if (!p) return '';
          const label = isDayMode ? `第${p.value[0]}天` : `${p.value[0]}${timeUnit}`;
          return `<div class="text-sm">
            <span class="text-slate-400">${label}</span><br/>
            <span class="text-cyan-300 font-semibold">${t('analytics.retentionRate')} ${p.value[1]}%</span>
          </div>`;
        },
      },
      grid: { top: 20, right: 30, bottom: cfg.showSlider ? 50 : 30, left: 50 },
      xAxis: {
        type: 'category',
        data: times,
        name: isDayMode ? t('analytics.xAxisDay') : t('analytics.xAxis'),
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', interval },
      },
      yAxis: {
        type: 'value',
        name: t('analytics.yAxis'),
        min: 0,
        max: 100,
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      dataZoom: cfg.showSlider ? [
        { type: 'inside', start: cfg.sliderStart, end: cfg.sliderEnd },
        {
          type: 'slider',
          start: cfg.sliderStart,
          end: cfg.sliderEnd,
          height: 20,
          bottom: 8,
          textStyle: { color: '#94a3b8' },
          borderColor: '#334155',
          backgroundColor: '#0f172a',
          fillerColor: 'rgba(34,211,238,0.15)',
          handleStyle: { color: cfg.badgeColor },
        },
      ] : [{ type: 'inside' }],
      toolbox: {
        right: 10,
        top: 0,
        feature: {
          saveAsImage: { title: t('analytics.exportImage'), backgroundColor: '#0f172a' },
        },
        iconStyle: { borderColor: '#94a3b8' },
      },
      series: [
        {
          name: t('analytics.retentionRate'),
          type: 'line',
          data: rates.map((v, i) => [times[i], v]),
          smooth: cfg.smooth,
          symbol: 'circle',
          symbolSize: cfg.symbolSize,
          lineStyle: { color: cfg.badgeColor, width: cfg.lineWidth },
          itemStyle: { color: cfg.badgeColor },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: hexToRgba(cfg.badgeColor, 0.3) },
              { offset: 1, color: hexToRgba(cfg.badgeColor, 0.03) },
            ]),
          },
          markLine: data.drop_points.length > 0 ? {
            silent: true,
            symbol: 'none',
            data: data.drop_points.map((dp) => ({
              xAxis: dp.time_sec,
              label: { formatter: `↓${(dp.drop_rate * 100).toFixed(0)}%`, color: '#f43f5e', fontSize: 10 },
              lineStyle: { color: '#f43f5e', type: 'dashed', width: 1 },
            })),
          } : undefined,
          markPoint: data.drop_points.length > 0 ? {
            silent: true,
            data: data.drop_points.map((dp) => ({
              coord: [dp.time_sec, +((1 - dp.drop_rate) * 100)],
              symbol: 'pin',
              symbolSize: 24,
              itemStyle: { color: '#f43f5e' },
              label: { show: false },
            })),
          } : undefined,
        },
      ],
    };
  }, [data, t, isDayMode, cfg, timeUnit]);

  return (
    <div className="space-y-3">
      {/* 摘要行 */}
      <div className="flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cfg.badgeBg} ${cfg.badgeText}`}>
            {timeRangeLabel}
          </span>
          <span>{t('analytics.avgRetentionLabel')}<span className="text-cyan-300 font-semibold ml-1">{fmtPct(data.summary.avg_retention_rate)}</span></span>
          <span>{t('analytics.finalCompletionLabel')}<span className="text-emerald-300 font-semibold ml-1">{fmtPct(data.summary.final_completion_rate)}</span></span>
          <span className="text-slate-600">{data.curve_points.length} 个数据点</span>
        </div>
        {data.summary.primary_drop_shot_index != null && (
          <span>{dropLabel}<span className="text-rose-400">#{data.summary.primary_drop_shot_index}</span></span>
        )}
      </div>

      {/* 图表 */}
      <div className="rounded-xl bg-slate-950/80 p-2">
        <EChartsWrapper option={option} height={320} />
      </div>
      {data.is_mock && <div className="text-[10px] text-amber-400">{t('analytics.mockData')}</div>}
    </div>
  );
}
