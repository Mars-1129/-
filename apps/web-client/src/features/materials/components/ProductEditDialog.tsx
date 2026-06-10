import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateProductRequest } from '@tikstream/shared-types';
import { useWorkspaceStore } from '../../../app/store/workspace-store';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Loader2, X } from 'lucide-react';

interface ProductEditDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ProductEditDialog({ open, onClose }: ProductEditDialogProps) {
  const { t } = useTranslation();
  const addProduct = useWorkspaceStore((s) => s.addProduct);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [sellingPoints, setSellingPoints] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('material.productTitleRequired'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const spList = sellingPoints
        .split(/[,，;；]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const data: CreateProductRequest = {
        title: trimmedTitle,
        category: category.trim() || undefined,
        selling_points: spList.length > 0 ? spList : undefined,
        cover_image_url: coverImageUrl.trim() || undefined,
      };

      await addProduct(data);
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('material.createProductFailed'));
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setTitle('');
    setCategory('');
    setSellingPoints('');
    setCoverImageUrl('');
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">{t('material.newProduct')}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              {t('material.productTitleRequired')} <span className="text-rose-400">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('material.productTitleHint')}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">{t('material.productCategoryLabel')}</label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('material.productCategoryHint')}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">{t('material.sellingPointsLabel')}</label>
            <Input
              value={sellingPoints}
              onChange={(e) => setSellingPoints(e.target.value)}
              placeholder={t('material.sellingPointsHint')}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">{t('material.coverImageUrlLabel')}</label>
            <Input
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button className="flex-1" onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('material.createProductBtn')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
