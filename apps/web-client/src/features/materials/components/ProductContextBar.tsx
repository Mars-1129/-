import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductStats } from '@tikstream/shared-types';
import { useWorkspaceStore } from '../../../app/store/workspace-store';
import { getProductStats } from '../../../lib/api/products';
import { ImageIcon, Loader2, Plus, Video } from 'lucide-react';
import { ProductEditDialog } from './ProductEditDialog';

export function ProductContextBar() {
  const { t } = useTranslation();
  const products = useWorkspaceStore((s) => s.products);
  const selectedProductId = useWorkspaceStore((s) => s.selectedProductId);
  const setSelectedProductId = useWorkspaceStore((s) => s.setSelectedProductId);
  const [stats, setStats] = useState<ProductStats[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await getProductStats();
      setStats(res.products);
    } catch {
      // 静默失败，仅不展示统计数字
      setStats([]);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats, products.length]);

  function getStatsForProduct(productId: string): ProductStats | undefined {
    return stats.find((s) => s.product_id === productId);
  }

  return (
    <div className="space-y-3">
      {/* Product卡片行 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {products.map((product) => {
          const isSelected = product.id === selectedProductId;
          const s = getStatsForProduct(product.id);

          return (
            <button
              key={product.id}
              onClick={() => setSelectedProductId(product.id)}
              className={`flex-shrink-0 rounded-2xl border px-4 py-3 text-left transition-all min-w-[140px] ${
                isSelected
                  ? 'border-cyan-500/60 bg-cyan-500/10 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                  : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {product.cover_image_url ? (
                  <img
                    src={product.cover_image_url}
                    alt=""
                    className="h-7 w-7 rounded-lg object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-xs font-medium text-slate-400 ${product.cover_image_url ? 'hidden' : ''}`}>
                  {product.title.charAt(0)}
                </div>
                <span className="truncate text-sm font-medium text-slate-100 max-w-[90px]">
                  {product.title}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-500">
                {statsLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : s ? (
                  <>
                    <span className="inline-flex items-center gap-0.5">
                      <ImageIcon className="h-3 w-3" /> {s.image_count}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <Video className="h-3 w-3" /> {s.video_count}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-600">--</span>
                )}
              </div>
            </button>
          );
        })}

        {/* 新建产品按钮 */}
        <button
          onClick={() => setCreateOpen(true)}
          className="flex-shrink-0 rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-3 text-slate-500 transition-colors hover:border-slate-600 hover:bg-slate-900 hover:text-slate-300"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* 选中产品详情行 */}
      {selectedProduct && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-2">
          {selectedProduct.cover_image_url ? (
            <img
              src={selectedProduct.cover_image_url}
              alt=""
              className="h-10 w-10 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-sm font-semibold text-slate-400">
              {selectedProduct.title.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-100">{selectedProduct.title}</div>
            <div className="text-xs text-slate-500">
              {selectedProduct.sku_code} · {selectedProduct.category}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {(() => {
              const s = getStatsForProduct(selectedProduct.id);
              if (!s) return null;
              return (
                <>
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5 text-cyan-400" /> {s.image_count} {t('material.imagesUnit')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Video className="h-3.5 w-3.5 text-cyan-400" /> {s.video_count} {t('material.videosUnit')}
                  </span>
                  <span className="text-slate-600">{s.total_slices} {t('material.slicesUnitShort')}</span>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <ProductEditDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
