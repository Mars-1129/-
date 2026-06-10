// =============================================================================
// TikStream AI — 通用素材选择器组件
// =============================================================================
// 用途：在剧本生成、创作模块中复用，实现素材与创作/剧本的有效关联
// 支持单选/多选素材，支持素材→切片展开视图，支持搜索和类型过滤
// =============================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Image, Video, Search, X, ChevronDown, ChevronRight, Info, Zap, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { LazyImage } from '../ui/lazy-image';
import { listMaterials, type MaterialListItem, analyzeMaterialVision, type VisionAnalysisResult } from '../../lib/api/materials';
import { ApiClientError, resolveBaseUrl } from '../../lib/api/http';

function resolveAssetUrl(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    if (value.startsWith('/api/')) {
      return new URL(value, resolveBaseUrl()).toString();
    }

    return new URL(value, window.location.origin).toString();
  } catch {
    return undefined;
  }
}

export interface SelectedMaterial {
  material_id: string;
  file_name: string;
  type: string;
  thumbnail_url: string | null;
  selected_slice_id?: string;
  selected_slice_caption?: string;
}

export interface MaterialSelectorProps {
  /** 商品 ID（必填，用于限定素材范围） */
  productId: string;
  /** 选择模式 */
  mode?: 'single' | 'multiple';
  /** 类型过滤 */
  typeFilter?: ('IMAGE' | 'VIDEO')[];
  /** 最大选中数量（仅 multiple 模式有效），默认 5 */
  maxSelect?: number;
  /** 已选中素材 ID 列表（受控） */
  selectedIds: string[];
  /** 选中变化回调 */
  onChange: (ids: string[], materials: SelectedMaterial[]) => void;
  /** 是否显示切片级选择 */
  allowSliceSelect?: boolean;
  /** 已选中的切片绑定（material_id → slice_id） */
  sliceBindings?: Record<string, string>;
  /** 切片绑定变化 */
  onSliceBindingsChange?: (bindings: Record<string, string>) => void;
}

export function MaterialSelector({
  productId,
  mode = 'multiple',
  typeFilter,
  maxSelect = 5,
  selectedIds,
  onChange,
  allowSliceSelect = false,
  sliceBindings,
  onSliceBindingsChange,
}: MaterialSelectorProps) {
  const { t } = useTranslation();
  const [materials, setMaterials] = useState<MaterialListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);
  const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(null);
  const [expandedSlices, setExpandedSlices] = useState<Map<string, Array<{ id: string; slice_id: string; dense_caption: string | null; key_frame_url: string | null; tags: string[] }>>>(new Map());
  const [slicesLoading, setSlicesLoading] = useState(false);
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionResults, setVisionResults] = useState<Record<string, VisionAnalysisResult | null>>({});
  const [visionError, setVisionError] = useState<string | null>(null);

  // 加载素材列表
  const loadMaterials = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listMaterials({
        product_id: productId,
        ...(activeTypeFilter ? { type: activeTypeFilter } : {}),
        ...(searchTerm ? { keyword: searchTerm } : {}),
        limit: 50,
      });
      setMaterials(response.items);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('common.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [productId, activeTypeFilter, searchTerm, t]);

  useEffect(() => {
    // 防抖搜索
    const timer = setTimeout(loadMaterials, 300);
    return () => clearTimeout(timer);
  }, [loadMaterials]);

  // 过滤后的素材列表
  const filteredMaterials = useMemo(() => {
    let result = materials;
    if (typeFilter && typeFilter.length > 0) {
      result = result.filter((m) => typeFilter.includes(m.type as 'IMAGE' | 'VIDEO'));
    }
    return result;
  }, [materials, typeFilter]);

  // 按状态分组：COMPLETED 优先
  const sortedMaterials = useMemo(() => {
    return [...filteredMaterials].sort((a, b) => {
      if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return -1;
      if (a.status !== 'COMPLETED' && b.status === 'COMPLETED') return 1;
      return 0;
    });
  }, [filteredMaterials]);

  // 处理选中/取消
  function handleToggle(id: string, material: MaterialListItem) {
    const chosen = new Set(selectedIds);
    let newIds: string[];
    let newMaterials: SelectedMaterial[];

    if (chosen.has(id)) {
      chosen.delete(id);
      newIds = Array.from(chosen);
    } else {
      if (mode === 'single') {
        chosen.clear();
      }
      if (maxSelect && chosen.size >= maxSelect) return;
      chosen.add(id);
      newIds = Array.from(chosen);
    }

    newMaterials = newIds.map((mid) => {
      const m = materials.find((m) => m.material_id === mid);
      return {
        material_id: mid,
        file_name: m?.file_name ?? '',
        type: m?.type ?? 'VIDEO',
        thumbnail_url: m?.thumbnail_url ?? null,
      };
    });
    onChange(newIds, newMaterials);
  }

  // 加载切片列表
  async function handleExpandMaterial(materialId: string) {
    if (expandedMaterialId === materialId) {
      setExpandedMaterialId(null);
      return;
    }
    setExpandedMaterialId(materialId);
    if (expandedSlices.has(materialId)) return;

    setSlicesLoading(true);
    try {
      // 引入动态导入避免循环依赖
      const { getMaterialDetail } = await import('../../lib/api/materials');
      const detail = await getMaterialDetail(materialId);
      setExpandedSlices((prev) => {
        const n = new Map(prev);
        n.set(materialId, detail.slices.map((s) => ({
          id: s.id,
          slice_id: s.slice_id,
          dense_caption: s.dense_caption,
          key_frame_url: s.key_frame_url,
          tags: s.tags || [],
        })));
        return n;
      });
    } catch {
      // 切片加载失败静默处理
    } finally {
      setSlicesLoading(false);
    }
  }

  function handleSliceSelect(materialId: string, sliceId: string) {
    if (!onSliceBindingsChange || !sliceBindings) return;
    const newBindings: Record<string, string> = { ...sliceBindings };
    newBindings[materialId] = sliceId;
    onSliceBindingsChange(newBindings);
  }

  // AI 视觉理解分析
  async function handleVisionAnalyze() {
    if (selectedIds.length === 0) return;
    setVisionLoading(true);
    setVisionError(null);
    const results: Record<string, VisionAnalysisResult | null> = {};

    for (const id of selectedIds) {
      if (visionResults[id]) {
        results[id] = visionResults[id];
        continue;
      }
      try {
        const result = await analyzeMaterialVision(id);
        results[id] = result;
      } catch {
        results[id] = null;
      }
    }
    setVisionResults((prev) => ({ ...prev, ...results }));
    setVisionLoading(false);
  }

  // 类型过滤器项
  const typeOptions = typeFilter && typeFilter.length > 0 ? typeFilter : ['IMAGE', 'VIDEO'];

  return (
    <div className="space-y-3">
      {/* 搜索和过滤栏 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={t('materialSelector.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-9"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {typeOptions.map((typeKey) => (
            <Button
              key={typeKey}
              variant={activeTypeFilter === typeKey ? 'default' : 'ghost'}
              size="sm"
              className="h-9 px-2.5 text-xs"
              onClick={() => setActiveTypeFilter(activeTypeFilter === typeKey ? null : typeKey)}
            >
              {typeKey === 'IMAGE' ? <Image className="h-3.5 w-3.5 mr-1" /> : <Video className="h-3.5 w-3.5 mr-1" />}
              {typeKey === 'IMAGE' ? t('materialSelector.image') : t('materialSelector.video')}
            </Button>
          ))}
        </div>
      </div>

      {/* 素材网格 */}
      {loading && (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[9/16] rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-sm text-red-400">
          <Info className="inline h-4 w-4 mr-1" />
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={loadMaterials}>
            {t('materialSelector.retry')}
          </Button>
        </div>
      )}

      {!loading && !error && sortedMaterials.length === 0 && (
        <div className="text-center py-8 text-sm text-slate-400">
          {searchTerm || activeTypeFilter
            ? t('materialSelector.noMatch')
            : t('materialSelector.emptyHint')}
        </div>
      )}

      {!loading && !error && sortedMaterials.length > 0 && (
        <div className="grid grid-cols-3 gap-3 max-h-[360px] overflow-y-auto pr-1">
          {sortedMaterials.map((material) => {
            const isSelected = selectedIds.includes(material.material_id);
            const isReady = material.status === 'COMPLETED';
            return (
              <div key={material.material_id}>
                <Card
                  className={`
                    relative overflow-hidden cursor-pointer transition-all duration-200
                    ${isSelected
                      ? 'ring-2 ring-cyan-500 ring-offset-1 ring-offset-slate-950'
                      : 'hover:ring-1 hover:ring-slate-600'}
                    ${!isReady ? 'opacity-70' : ''}
                  `}
                  onClick={() => isReady && handleToggle(material.material_id, material)}
                >
                  {/* 缩略图 */}
                  <div className="aspect-[9/16] bg-slate-800 relative">
                    {(() => {
                      const isImageType = material.type === 'IMAGE' || material.type === 'PRODUCT_MAIN_IMAGE';
                      const previewUrl = resolveAssetUrl(
                        material.thumbnail_url ?? (isImageType ? material.origin_url : null),
                      );
                      return previewUrl ? (
                        <LazyImage
                          src={previewUrl}
                          alt={material.file_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {material.type === 'IMAGE' ? (
                            <Image className="h-8 w-8 text-slate-600" />
                          ) : (
                            <Video className="h-8 w-8 text-slate-600" />
                          )}
                        </div>
                      );
                    })()}
                    {/* 类型标识 */}
                    <div className="absolute top-1.5 left-1.5">
                      <Badge className="bg-black/60 text-[10px] px-1.5 py-0 border-0">
                        {material.type === 'IMAGE' ? (
                          <Image className="h-2.5 w-2.5 mr-1" />
                        ) : (
                          <Video className="h-2.5 w-2.5 mr-1" />
                        )}
                        {material.type === 'IMAGE' ? t('materialSelector.imageBadge') : t('materialSelector.videoBadge')}
                      </Badge>
                    </div>
                    {/* 选中标记 */}
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 bg-cyan-500 rounded-full p-0.5">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                    {/* 未就绪标记 */}
                    {!isReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Badge className="bg-yellow-600/80 text-[10px]">{material.status}</Badge>
                      </div>
                    )}
                    {/* 切片展开按钮 */}
                    {isSelected && allowSliceSelect && (
                      <button
                        className="absolute bottom-1.5 right-1.5 bg-black/60 rounded-full p-1 hover:bg-black/80"
                        onClick={(e) => { e.stopPropagation(); handleExpandMaterial(material.material_id); }}
                      >
                        {expandedMaterialId === material.material_id ? (
                          <ChevronDown className="h-3 w-3 text-white" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-white" />
                        )}
                      </button>
                    )}
                  </div>
                  {/* 文件名 */}
                  <div className="px-2 py-1.5">
                    <p className="text-[11px] text-slate-300 truncate" title={material.file_name}>
                      {material.file_name}
                    </p>
                    {material.duration_seconds != null && (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {Math.round(material.duration_seconds)}s
                      </p>
                    )}
                  </div>
                </Card>

                {/* 切片展开面板 */}
                {isSelected && allowSliceSelect && expandedMaterialId === material.material_id && (
                  <div className="mt-1 ml-2 border-l border-slate-700 pl-3 py-1">
                    {slicesLoading && (
                      <p className="text-[11px] text-slate-500">{t('materialSelector.loadingSlices')}</p>
                    )}
                    {!slicesLoading && expandedSlices.get(material.material_id)?.map((slice) => {
                      const isSliceBound = sliceBindings?.[material.material_id] === slice.slice_id;
                      return (
                        <div
                          key={slice.id}
                          className={`
                            flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer text-[11px] transition-colors
                            ${isSliceBound ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}
                          `}
                          onClick={() => handleSliceSelect(material.material_id, slice.slice_id)}
                        >
                          {isSliceBound && <Check className="h-3 w-3 text-cyan-400 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <span className="truncate">
                              {slice.dense_caption?.slice(0, 40) || `切片 #${slice.slice_id.slice(0, 8)}`}
                            </span>
                            {slice.tags && slice.tags.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-0.5">
                                {slice.tags.slice(0, 3).map((tag) => (
                                  <span key={tag} className="rounded-full bg-slate-700/50 px-1 py-0.5 text-[9px] text-cyan-400/70">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {!slicesLoading && (!expandedSlices.get(material.material_id) || expandedSlices.get(material.material_id)!.length === 0) && (
                      <p className="text-[11px] text-slate-500">{t('materialSelector.noSlices')}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 已选素材预览条 */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
          <span className="text-xs text-slate-400 shrink-0">
            已选 {selectedIds.length}{maxSelect ? `/${maxSelect}` : ''}：
          </span>
          <div className="flex gap-1.5 flex-wrap flex-1">
            {selectedIds.map((id) => {
              const m = materials.find((m) => m.material_id === id);
              return (
                <Badge key={id} className="text-[10px] bg-cyan-500/15 text-cyan-300 border-cyan-500/30 flex items-center gap-1">
                  {m?.file_name?.slice(0, 15) ?? id.slice(0, 8)}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(id, m!);
                    }}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
          {selectedIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-slate-400"
              onClick={() => onChange([], [])}
            >
              {t('materialSelector.clear')}
            </Button>
          )}
        </div>
      )}

      {/* AI 视觉理解开关 */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-800/50">
        <Zap className={`h-3 w-3 ${visionEnabled ? 'text-cyan-400' : 'text-slate-600'}`} />
        <button
          className={`flex-1 text-left transition-colors ${visionEnabled ? 'text-cyan-300' : 'text-slate-400 hover:text-slate-300'}`}
          onClick={() => {
            setVisionEnabled(!visionEnabled);
            if (!visionEnabled && selectedIds.length > 0) {
              handleVisionAnalyze();
            }
          }}
        >
          {t('materialSelector.aiVision')}
        </button>
        {visionEnabled ? (
          <Badge className="text-[9px] bg-cyan-500/15 text-cyan-300 border-cyan-500/30">
            {t('materialSelector.enabled')}
          </Badge>
        ) : (
          <Badge className="text-[9px] bg-slate-800 text-slate-500 border-slate-700 cursor-pointer"
            onClick={() => {
              setVisionEnabled(true);
              if (selectedIds.length > 0) handleVisionAnalyze();
            }}>
              {t('materialSelector.enableAnalysis')}
          </Badge>
        )}
      </div>
      {/* 视觉分析结果 */}
      {visionEnabled && visionLoading && (
        <div className="text-[11px] text-slate-400 animate-pulse">
          <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />
          {t('materialSelector.analyzing')}
        </div>
      )}
      {visionEnabled && visionError && (
        <div className="text-[11px] text-red-400">{visionError}</div>
      )}
      {visionEnabled && !visionLoading && selectedIds.length > 0 && visionResults[selectedIds[0]] && (
        <div className="space-y-2 text-[11px] bg-slate-900/50 rounded-lg p-2 border border-slate-800">
          {visionResults[selectedIds[0]]?.product_features && visionResults[selectedIds[0]]!.product_features.length > 0 && (
            <div>
              <span className="text-cyan-400">{t('materialSelector.productFeatures')}</span>
              {visionResults[selectedIds[0]]!.product_features.slice(0, 5).map((f, i) => (
                <span key={i} className="text-slate-300">{f}{i < 4 ? ', ' : ''}</span>
              ))}
            </div>
          )}
          {visionResults[selectedIds[0]]?.style_tags && visionResults[selectedIds[0]]!.style_tags.length > 0 && (
            <div>
              <span className="text-cyan-400">{t('materialSelector.styleLabel')}</span>
              {visionResults[selectedIds[0]]!.style_tags.map((tag, i) => (
                <Badge key={i} className="text-[9px] bg-slate-800 text-slate-400 mr-1">{tag}</Badge>
              ))}
            </div>
          )}
          {visionResults[selectedIds[0]]?.visual_selling_points && visionResults[selectedIds[0]]!.visual_selling_points.length > 0 && (
            <div>
              <span className="text-cyan-400">{t('materialSelector.visualSellingPoints')}</span>
              <span className="text-slate-300">{visionResults[selectedIds[0]]!.visual_selling_points.slice(0, 3).join('; ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
