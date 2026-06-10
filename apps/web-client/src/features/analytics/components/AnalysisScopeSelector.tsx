import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, LayoutGrid, GitBranch, GitCompare, HeartPulse,
  ChevronDown, AlertCircle, Loader2,
} from 'lucide-react';
import { useWorkspaceStore } from '../../../app/store/workspace-store';
import { useProductionData } from '../hooks/useProductionData';
import type { Creation } from '@tikstream/shared-types';

export type AnalysisFunction = 'retention' | 'heatmap' | 'sankey' | 'ab-compare' | 'self-heal';

export interface AnalysisScope {
  function: AnalysisFunction;
  productId: string;
  creationIdA?: string;
  creationIdB?: string;
  /** 自愈专用：问题类型 */
  selfHealIssueType?: 'HOOK_WEAK' | 'VOICEOVER_TOO_LONG' | 'STYLE_MISMATCH' | 'CTA_WEAK';
  /** 自愈专用：修复策略 */
  selfHealStrategy?: 'REWRITE_ONLY' | 'RERENDER_SHOT' | 'REGENERATE_VARIANT';
  /** 自愈专用：是否仅预览不下发 */
  selfHealDryRun?: boolean;
}

const SELF_HEAL_ISSUE_OPTIONS: { value: NonNullable<AnalysisScope['selfHealIssueType']>; label: string }[] = [
  { value: 'HOOK_WEAK', label: '开场钩子不足' },
  { value: 'VOICEOVER_TOO_LONG', label: '旁白时长过长' },
  { value: 'STYLE_MISMATCH', label: '风格调性不匹配' },
  { value: 'CTA_WEAK', label: '行动号召偏弱' },
];

const SELF_HEAL_STRATEGY_OPTIONS: { value: NonNullable<AnalysisScope['selfHealStrategy']>; label: string }[] = [
  { value: 'REWRITE_ONLY', label: '仅重写剧本' },
  { value: 'RERENDER_SHOT', label: '分镜重渲染' },
  { value: 'REGENERATE_VARIANT', label: '全量再生' },
];

interface Props {
  scope: AnalysisScope;
  onScopeChange: (scope: AnalysisScope) => void;
  onAnalyze: () => void;
  loading: boolean;
}

const FUNCTION_META: Record<AnalysisFunction, {
  icon: typeof TrendingUp;
  labelKey: string;
  descKey: string;
  color: string;
  /** 需要哪些选择器: product | creation1 | creation2 */
  selectors: ('product' | 'creation1' | 'creation2')[];
}> = {
  retention:     { icon: TrendingUp, labelKey: 'analytics.retentionCurve', descKey: 'analytics.retentionCurveDesc', color: '#22d3ee', selectors: ['product', 'creation1'] },
  heatmap:       { icon: LayoutGrid, labelKey: 'analytics.styleHeatmap', descKey: 'analytics.styleHeatmapDesc', color: '#f59e0b', selectors: ['product'] },
  sankey:        { icon: GitBranch, labelKey: 'analytics.audioVisualSankey', descKey: 'analytics.audioVisualSankeyDesc', color: '#a78bfa', selectors: ['product', 'creation1'] },
  'ab-compare':  { icon: GitCompare, labelKey: 'analytics.abCompare', descKey: 'analytics.abCompareDesc', color: '#34d399', selectors: ['product', 'creation1', 'creation2'] },
  'self-heal':   { icon: HeartPulse, labelKey: 'analytics.selfHealSuggest', descKey: 'analytics.selfHealSuggestDesc', color: '#f43f5e', selectors: ['product', 'creation1'] },
};

/** 格式化 Creation 显示名 */
function fmtCreation(c: Creation): string {
  const date = c.created_at ? new Date(c.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const status = c.status === 'FINISHED' ? '' : ` [${c.status}]`;
  return `${date || c.creation_id.slice(0, 8)}${status}`;
}

/** 格式化短 ID */
function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

export function AnalysisScopeSelector({ scope, onScopeChange, onAnalyze, loading }: Props): JSX.Element {
  const { t } = useTranslation();
  const products = useWorkspaceStore((s) => s.products);

  const selectedFunction = scope.function;
  const meta = FUNCTION_META[selectedFunction];

  // 商品列表
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.title.localeCompare(b.title)), [products]);

  // 当前商品
  const activeProductId = scope.productId || sortedProducts[0]?.id || '';
  const { creations: creationList, loading: creationsLoading } = useProductionData(activeProductId || undefined);

  const finishedCreations = useMemo(
    () => creationList.filter((c) => c.status === 'FINISHED'),
    [creationList],
  );

  // 自动补全 initial scope
  useEffect(() => {
    if (!scope.productId && sortedProducts.length > 0) {
      const newScope = { ...scope, productId: sortedProducts[0].id };
      if (meta.selectors.includes('creation1') && !scope.creationIdA && finishedCreations.length > 0) {
        newScope.creationIdA = finishedCreations[0].creation_id;
      }
      if (meta.selectors.includes('creation2') && !scope.creationIdB && finishedCreations.length > 1) {
        newScope.creationIdB = finishedCreations[1].creation_id;
      }
      if (newScope.productId !== scope.productId || newScope.creationIdA !== scope.creationIdA || newScope.creationIdB !== scope.creationIdB) {
        onScopeChange(newScope);
      }
    }
  }, [scope, sortedProducts, finishedCreations, meta, onScopeChange]);

  const update = (patch: Partial<AnalysisScope>) => onScopeChange({ ...scope, ...patch });

  return (
    <div className="space-y-4">
      {/* ===== 功能选择卡片 ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {(Object.entries(FUNCTION_META) as [AnalysisFunction, typeof meta][]).map(([key, m]) => {
          const Icon = m.icon;
          const isActive = key === selectedFunction;
          return (
            <button
              key={key}
              onClick={() => {
                if (key !== selectedFunction) {
                  const newScope: AnalysisScope = {
                    function: key,
                    productId: activeProductId,
                    creationIdA: m.selectors.includes('creation1') ? (finishedCreations[0]?.creation_id) : undefined,
                    creationIdB: m.selectors.includes('creation2') ? (finishedCreations[1]?.creation_id) : undefined,
                  };
                  if (key === 'self-heal') {
                    newScope.selfHealIssueType = 'HOOK_WEAK';
                    newScope.selfHealStrategy = 'REWRITE_ONLY';
                    newScope.selfHealDryRun = true;
                  }
                  onScopeChange(newScope);
                }
              }}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-left transition ${
                isActive
                  ? 'border-cyan-500/60 bg-cyan-500/10 shadow-sm'
                  : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/80'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" style={{ color: isActive ? m.color : '#64748b' }} />
              <span className={`text-xs font-medium ${isActive ? 'text-slate-100' : 'text-slate-400'}`}>
                {t(m.labelKey)}
              </span>
              <span className="text-[10px] text-slate-600 text-center leading-tight hidden sm:block">
                {t(m.descKey)}
              </span>
            </button>
          );
        })}
      </div>

      {/* ===== 自适应数据范围选择器 ===== */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        {/* 商品选择 */}
        {meta.selectors.includes('product') && (
          <Selector
            label={t('analytics.selectProduct')}
            icon={null}
            loading={false}
            selected={activeProductId}
            items={sortedProducts.map((p) => ({ value: p.id, label: p.title, sub: shortId(p.id) }))}
            onChange={(v) => update({ productId: v, creationIdA: undefined, creationIdB: undefined })}
            placeholder={t('analytics.selectProductFirst')}
          />
        )}

        {/* 创作选择 A */}
        {meta.selectors.includes('creation1') && (
          <Selector
            label={selectedFunction === 'ab-compare' ? t('analytics.creationA') : t('analytics.selectCreation')}
            icon={null}
            loading={creationsLoading}
            selected={scope.creationIdA || ''}
            items={finishedCreations.map((c) => ({
              value: c.creation_id,
              label: fmtCreation(c),
              sub: shortId(c.creation_id),
            }))}
            onChange={(v) => update({ creationIdA: v })}
            placeholder={creationsLoading ? t('common.loading') : t('analytics.noCreation')}
          />
        )}

        {/* 创作选择 B (仅 AB 对比) */}
        {meta.selectors.includes('creation2') && (
          <Selector
            label={t('analytics.creationB')}
            icon={null}
            loading={creationsLoading}
            selected={scope.creationIdB || ''}
            items={finishedCreations
              .filter((c) => c.creation_id !== scope.creationIdA)
              .map((c) => ({
                value: c.creation_id,
                label: fmtCreation(c),
                sub: shortId(c.creation_id),
              }))}
            onChange={(v) => update({ creationIdB: v })}
            placeholder={creationsLoading ? t('common.loading') : t('analytics.noCreation')}
          />
        )}

        {/* 自愈专用：问题类型 + 修复策略 + dry_run */}
        {selectedFunction === 'self-heal' && (
          <>
            <Selector
              label="问题类型"
              icon={null}
              loading={false}
              selected={scope.selfHealIssueType || 'HOOK_WEAK'}
              items={SELF_HEAL_ISSUE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => update({ selfHealIssueType: v as AnalysisScope['selfHealIssueType'] })}
              placeholder="选择问题类型"
            />
            <Selector
              label="修复策略"
              icon={null}
              loading={false}
              selected={scope.selfHealStrategy || 'REWRITE_ONLY'}
              items={SELF_HEAL_STRATEGY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => update({ selfHealStrategy: v as AnalysisScope['selfHealStrategy'] })}
              placeholder="选择策略"
            />
            <label className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                checked={scope.selfHealDryRun !== false}
                onChange={(e) => update({ selfHealDryRun: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/40"
              />
              <span className="text-xs text-slate-400">预览模式 (dry_run)</span>
            </label>
          </>
        )}

        {/* Analyze 按钮 */}
        <button
          onClick={onAnalyze}
          disabled={loading || !activeProductId || (meta.selectors.includes('creation1') && !scope.creationIdA) || (meta.selectors.includes('creation2') && !scope.creationIdB)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('analytics.startAnalyze')}
        </button>
      </div>

      {/* 缺失必要选择时的提示 */}
      {meta.selectors.includes('creation1') && !scope.creationIdA && finishedCreations.length === 0 && !creationsLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <AlertCircle className="h-3.5 w-3.5" />
          {t('analytics.abMinData')}
        </div>
      )}
    </div>
  );
}

/** 下拉选择器子组件 */
function Selector({
  label,
  loading,
  selected,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  selected: string;
  items: { value: string; label: string; sub?: string }[];
  onChange: (value: string) => void;
  placeholder: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);

  const selectedItem = items.find((i) => i.value === selected);

  return (
    <div className="relative">
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-slate-600 min-w-[140px] transition"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
            <span className="text-slate-500">{placeholder}</span>
          </>
        ) : selectedItem ? (
          <>
            <span className="truncate max-w-[160px]">{selectedItem.label}</span>
            {selectedItem.sub && <span className="text-[10px] text-slate-600 flex-shrink-0">{selectedItem.sub}</span>}
          </>
        ) : (
          <span className="text-slate-500">{placeholder}</span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
      </button>
      {open && items.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            {items.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => { onChange(item.value); setOpen(false); }}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-800 transition ${
                  item.value === selected ? 'text-cyan-300 bg-slate-800/50' : 'text-slate-300'
                }`}
              >
                <span className="truncate">{item.label}</span>
                {item.sub && <span className="text-[10px] text-slate-600 ml-2 flex-shrink-0">{item.sub}</span>}
              </button>
            ))}
          </div>
        </>
      )}
      {open && items.length === 0 && !loading && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-500 shadow-xl">
            {placeholder}
          </div>
        </>
      )}
    </div>
  );
}
