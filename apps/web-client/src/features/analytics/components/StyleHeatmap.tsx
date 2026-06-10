import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EChartsWrapper } from './EChartsWrapper';
import type { StyleFactorHeatmapResponse } from '@tikstream/shared-types';

interface StyleHeatmapProps {
  data: StyleFactorHeatmapResponse;
}

export function StyleHeatmap({ data }: StyleHeatmapProps) {
  const { t } = useTranslation();

  const option = useMemo(() => {
    const maxScore = Math.max(...data.cells.map((c) => c.score), 1);

    const seriesData = data.cells.map((c) => {
      const xIdx = data.x_axis_labels.indexOf(c.x_key);
      const yIdx = data.y_axis_labels.indexOf(c.y_key);
      return [xIdx, yIdx, c.score];
    });

    return {
      tooltip: {
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 13 },
        formatter: (params: { value: number[] }) => {
          const [xi, yi, score] = params.value;
          const xLabel = data.x_axis_labels[xi] || '-';
          const yLabel = data.y_axis_labels[yi] || '-';
          const cell = data.cells.find((c) => c.x_key === xLabel && c.y_key === yLabel);
          const confidence = cell?.confidence_tag;
          const sampleSize = cell?.sample_size;
          return `<div class="text-sm">
            <span class="text-slate-300 font-semibold">${xLabel} × ${yLabel}</span><br/>
            <span class="text-slate-400">${t('analytics.scoreLabel')}</span><span class="text-cyan-300 font-semibold">${score}</span><br/>
            ${sampleSize != null ? `<span class="text-slate-400">${t('analytics.sampleCount')}</span><span class="text-slate-200">${sampleSize}</span><br/>` : ''}
            ${confidence ? `<span class="text-slate-400">${t('analytics.confidence')}</span><span class="${confidence === 'HIGH' ? 'text-emerald-400' : confidence === 'MEDIUM' ? 'text-amber-400' : 'text-rose-400'}">${confidence}</span>` : ''}
          </div>`;
        },
      },
      grid: { top: 20, right: 20, bottom: 80, left: 120 },
      xAxis: {
        type: 'category',
        data: data.x_axis_labels,
        name: data.x_dimension,
        nameTextStyle: { color: '#94a3b8', fontSize: 12 },
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', rotate: 25, fontSize: 11 },
        splitArea: { show: false },
      },
      yAxis: {
        type: 'category',
        data: data.y_axis_labels,
        name: data.y_dimension,
        nameTextStyle: { color: '#94a3b8', fontSize: 12 },
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', fontSize: 11 },
        splitArea: { show: false },
      },
      visualMap: {
        min: 0,
        max: maxScore,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 8,
        textStyle: { color: '#94a3b8' },
        inRange: {
          color: ['#1e1b4b', '#312e81', '#4338ca', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'],
        },
        outOfRange: { color: ['#0f172a'] },
      },
      toolbox: {
        right: 10,
        top: 0,
        feature: {
          saveAsImage: { title: t('analytics.exportImage'), backgroundColor: '#0f172a' },
          dataView: { title: t('analytics.dataView'), readOnly: true, textColor: '#e2e8f0', backgroundColor: '#1e293b' },
        },
        iconStyle: { borderColor: '#94a3b8' },
      },
      series: [
        {
          type: 'heatmap',
          data: seriesData,
          label: {
            show: true,
            color: '#e2e8f0',
            fontSize: 12,
            fontWeight: 'bold',
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(99,102,241,0.5)',
            },
          },
        },
      ],
    };
  }, [data, t]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>{t('analytics.xAxisLabel')}<span className="text-slate-200">{data.x_dimension}</span></span>
        <span>·</span>
        <span>{t('analytics.yAxisLabel')}<span className="text-slate-200">{data.y_dimension}</span></span>
        <span>·</span>
        <span>{t('analytics.metricLabel')}<span className="text-slate-200">{data.metric}</span></span>
      </div>
      <div className="rounded-xl bg-slate-950/80 p-2">
        <EChartsWrapper option={option} height={420} />
      </div>
      {(data.top_positive_factors && data.top_positive_factors.length > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-emerald-400">{t('analytics.positiveFactor')}</span>
          {data.top_positive_factors.map((f) => (
            <span key={f.factor} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
              {f.factor} +{(f.contribution * 100).toFixed(1)}%
            </span>
          ))}
        </div>
      )}
      {(data.top_negative_factors && data.top_negative_factors.length > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-rose-400">{t('analytics.negativeFactor')}</span>
          {data.top_negative_factors.map((f) => (
            <span key={f.factor} className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300">
              {f.factor} -{(f.contribution * 100).toFixed(1)}%
            </span>
          ))}
        </div>
      )}
      {data.is_mock && <div className="text-[10px] text-amber-400">{t('analytics.mockData')}</div>}
    </div>
  );
}
