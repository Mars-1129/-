import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EChartsWrapper } from './EChartsWrapper';
import type { AudioVisualSankeyResponse } from '@tikstream/shared-types';

interface SankeyChartProps {
  data: AudioVisualSankeyResponse;
}

export function SankeyChart({ data }: SankeyChartProps) {
  const { t } = useTranslation();

  const option = useMemo(() => {
    // Build node_id -> name mapping so links can resolve to the correct node names
    const nodeIdToName = new Map(data.nodes.map((n) => [n.node_id, n.name]));

    const nodes = data.nodes.map((n) => ({
      name: n.name,
      itemStyle: {
        color: n.dimension === 'BGM_STYLE' ? '#7c3aed'
             : n.dimension === 'VISUAL_STYLE' ? '#0e7490'
             : '#059669',
      },
    }));

    const links = data.links.map((l) => ({
      source: nodeIdToName.get(l.source) || l.source,
      target: nodeIdToName.get(l.target) || l.target,
      value: l.value,
      lineStyle: {
        color: 'gradient',
        curveness: 0.3,
        opacity: 0.5,
      },
    }));

    return {
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 13 },
        formatter: (params: { dataType?: string; name?: string; value?: number; data?: { source?: string; target?: string; value?: number } }) => {
          if (params.dataType === 'edge') {
            return `<div class="text-sm">
              <span class="text-slate-400">${params.data?.source || '-'}</span>
              <span class="text-slate-500"> → </span>
              <span class="text-slate-400">${params.data?.target || '-'}</span><br/>
              <span class="text-cyan-300 font-semibold">${params.data?.value ?? '-'}</span>
            </div>`;
          }
          return `<div class="text-sm">
            <span class="text-slate-400">${params.name || '-'}</span><br/>
            <span class="text-cyan-300 font-semibold">${params.value ?? '-'}</span>
          </div>`;
        },
      },
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
          type: 'sankey',
          layout: 'none',
          emphasis: {
            focus: 'adjacency',
          },
          nodeAlign: 'left',
          layoutIterations: 32,
          data: nodes,
          links: links,
          label: {
            color: '#e2e8f0',
            fontSize: 11,
          },
          lineStyle: {
            color: 'gradient',
            curveness: 0.3,
            opacity: 0.35,
          },
        },
      ],
    };
  }, [data, t]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>{t('analytics.metricLabel')} {data.metric}</span>
      </div>
      <div className="rounded-xl bg-slate-950/80 p-2">
        <EChartsWrapper option={option} height={380} />
      </div>
      {data.is_mock && <div className="text-[10px] text-amber-400">{t('analytics.mockData')}</div>}
    </div>
  );
}
