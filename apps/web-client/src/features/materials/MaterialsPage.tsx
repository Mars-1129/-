import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Database,
  Eye,
  Image as ImageIcon,
  Loader2,
  Music,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Trash2Icon,
  Upload,
  Video,
  Wand2,
  CheckCircle,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Progress } from '../../components/ui/progress';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import {
  deleteMaterial,
  getMaterialDetail,
  listMaterials,
  reprocessMaterial,
  searchMaterialSlices,
  uploadMaterial,
  listTrashMaterials,
  restoreMaterial,
  permanentDeleteMaterial,
  analyzeMaterialVision,
  type CursorPageInfo,
  type MaterialDetailResponse,
  type MaterialListItem,
  type MaterialSliceSearchResult,
  type VisionAnalysisResult,
} from '../../lib/api/materials';
import { resolveBaseUrl } from '../../lib/api/http';
import { formatBytes, formatDateTime, formatDuration } from '../../lib/utils/cn';
import { LazyImage } from '../../components/ui/lazy-image';
import { MaterialDetailSkeleton } from '../../components/ui/content-skeleton';
import { UploadQueuePanel } from './components/UploadQueuePanel';
import { ProductContextBar } from './components/ProductContextBar';
import { useUploadQueue } from '../../hooks/useUploadQueue';

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

function getStatusVariant(status: string): 'success' | 'warning' | 'destructive' | 'default' {
  if (status === 'COMPLETED') {
    return 'success';
  }
  if (status === 'FAILED') {
    return 'destructive';
  }
  if (status === 'PROCESSING' || status === 'PENDING') {
    return 'warning';
  }
  return 'default';
}

function isImageLikeType(type: string): boolean {
  return type === 'IMAGE' || type === 'PRODUCT_MAIN_IMAGE' || type === 'VIDEO';
}

const TYPE_LABELS: Record<string, string> = {
  IMAGE: 'material.typeImage',
  VIDEO: 'material.typeVideo',
  PRODUCT_MAIN_IMAGE: 'material.typeProductMainImage',
};

const REFERENCE_CATEGORY_LABELS: Record<string, string> = {
  COMPETITOR_IMAGE: 'material.refCategoryCompetitorImage',
  COMPETITOR_VIDEO: 'material.refCategoryCompetitorVideo',
  INSPIRATION: 'material.refCategoryInspiration',
  BENCHMARK: 'material.refCategoryBenchmark',
};

function inferMaterialType(file: File): 'IMAGE' | 'VIDEO' | null {
  if (file.type.startsWith('video/')) {
    return 'VIDEO';
  }
  if (file.type.startsWith('image/')) {
    return 'IMAGE';
  }

  const lower = file.name.toLowerCase();
  if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm')) {
    return 'VIDEO';
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
    return 'IMAGE';
  }

  return null;
}

export function MaterialsPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const products = useWorkspaceStore((state) => state.products);
  const selectedProductId = useWorkspaceStore((state) => state.selectedProductId);
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const [materials, setMaterials] = useState<MaterialListItem[]>([]);
  const [pageInfo, setPageInfo] = useState<CursorPageInfo | null>(null);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  // 多选功能
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  // 回收站功能
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState<MaterialListItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [detail, setDetail] = useState<MaterialDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'AUTO' | 'VECTOR' | 'FUSION' | 'KEYWORD'>('AUTO');
  const [searchGranularity, setSearchGranularity] = useState<'slice' | 'material' | 'hybrid'>('slice');
  const [searchStrictness, setSearchStrictness] = useState<'strict' | 'relaxed'>('relaxed');
  const [searchResults, setSearchResults] = useState<MaterialSliceSearchResult[]>([]);
  const [searchSource, setSearchSource] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadType, setUploadType] = useState<'AUTO' | 'IMAGE' | 'VIDEO' | 'PRODUCT_MAIN_IMAGE'>('AUTO');
  const [uploadSourceType, setUploadSourceType] = useState<'UPLOAD' | 'REFERENCE'>('UPLOAD');
  const [uploadRemark, setUploadRemark] = useState('');
  const [referenceMaterialId, setReferenceMaterialId] = useState('');
  const [referenceCategory, setReferenceCategory] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [autoRecognizeProduct, setAutoRecognizeProduct] = useState(false);
  const [busyMaterialId, setBusyMaterialId] = useState<string | null>(null);
  const [materialSliceProgress, setMaterialSliceProgress] = useState<Record<string, { total: number; completed: number; stage: string }>>({});
  const uploadQueue = useUploadQueue();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(keyword);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    const productId = selectedProductId;
    if (!productId) {
      setMaterials([]);
      setPageInfo(null);
      setSelectedMaterialId(null);
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearchResults([]);
    setSearchError(null);

    const resolvedProductId = productId;
    let cancelled = false;

    async function run(): Promise<void> {
      setMaterialsLoading(true);
      setMaterialsError(null);

      try {
        const response = await listMaterials({
          product_id: resolvedProductId,
          type: typeFilter || undefined,
          status: statusFilter || undefined,
          keyword: debouncedKeyword.trim() || undefined,
          limit: 12,
        });

        if (cancelled) {
          return;
        }

        setMaterials(response.items);
        setPageInfo(response.page_info);
        setSelectedMaterialId((current) => {
          if (current && response.items.some((item) => item.material_id === current)) {
            return current;
          }
          return response.items[0]?.material_id ?? null;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setMaterialsError(error instanceof Error ? error.message : t('material.materialListLoadFailed'));
      } finally {
        if (!cancelled) {
          setMaterialsLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [debouncedKeyword, selectedProductId, statusFilter, typeFilter]);

  useEffect(() => {
    const materialId = selectedMaterialId;
    if (!materialId) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    const resolvedMaterialId = materialId;
    let cancelled = false;

    async function run(): Promise<void> {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const response = await getMaterialDetail(resolvedMaterialId);
        if (!cancelled) {
          setDetail(response);
          // Calculate slice processing progress
          const total = response.slices.length;
          if (total > 0) {
            const completed = response.slices.filter((s) => s.status === 'COMPLETED').length;
            const failed = response.slices.filter((s) => s.status === 'FAILED').length;
            const inProgress = response.slices.filter((s) => s.status === 'CAPTIONING' || s.status === 'EMBEDDING').length;
            const stage = inProgress > 0 ? t('material.sliceProcessing') : (total === completed + failed) ? t('material.processingDone') : t('material.waitingProcess');
            setMaterialSliceProgress((prev) => ({
              ...prev,
              [response.material.material_id]: { total, completed: completed + failed, stage },
            }));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : t('material.materialDetailLoadFailed'));
          setDetail(null);
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [selectedMaterialId]);

  // 当上传队列全部完成后自动刷新素材列表
  const prevUploadActiveRef = useRef(false);
  useEffect(() => {
    const isActive = uploadQueue.uploadingCount > 0 || uploadQueue.pendingCount > 0;
    if (prevUploadActiveRef.current && !isActive && selectedProductId) {
      void refreshMaterials();
    }
    prevUploadActiveRef.current = isActive;
  }, [uploadQueue.uploadingCount, uploadQueue.pendingCount, selectedProductId]);

  // Derive stable boolean to decide polling, avoiding recreating interval
  // on every materials/detail array reference change
  const hasPending = useMemo(
    () =>
      materials.some((item) => item.status === 'PENDING' || item.status === 'PROCESSING') ||
      (detail?.slices ?? []).some(
        (slice) =>
          slice.status === 'PENDING' || slice.status === 'CAPTIONING' || slice.status === 'EMBEDDING',
      ) ||
      uploadQueue.uploadingCount > 0 ||
      uploadQueue.pendingCount > 0,
    [materials, detail, uploadQueue.uploadingCount, uploadQueue.pendingCount],
  );

  // Auto-polling: refresh material list and detail when there are PENDING/PROCESSING items
  useEffect(() => {
    if (!hasPending) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    // Poll every 5 seconds when there are in-progress items
    pollingRef.current = setInterval(() => {
      void (async () => {
        if (!selectedProductId) return;
        try {
          // Refresh list
          const response = await listMaterials({
            product_id: selectedProductId,
            type: typeFilter || undefined,
            status: statusFilter || undefined,
            keyword: debouncedKeyword.trim() || undefined,
            limit: 12,
          });
          setMaterials(response.items);
          setPageInfo(response.page_info);
        } catch {
          // Silently ignore polling errors
        }

        // Refresh detail if a material is selected
        if (selectedMaterialId) {
          try {
            const detailResponse = await getMaterialDetail(selectedMaterialId);
            setDetail(detailResponse);
            setDetailError(null);
            // Calculate slice processing progress
            const total = detailResponse.slices.length;
            if (total > 0) {
              const completed = detailResponse.slices.filter((s) => s.status === 'COMPLETED').length;
              const failed = detailResponse.slices.filter((s) => s.status === 'FAILED').length;
              const inProgress = detailResponse.slices.filter((s) => s.status === 'CAPTIONING' || s.status === 'EMBEDDING').length;
              const stage2 = inProgress > 0 ? t('material.sliceProcessing') : (total === completed + failed) ? t('material.processingDone') : t('material.waitingProcess');
            setMaterialSliceProgress((prev) => ({
              ...prev,
              [detailResponse.material.material_id]: { total, completed: completed + failed, stage: stage2 },
              }));
            }
          } catch {
            // Silently ignore polling errors
          }
        }
      })();
    }, 5000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [hasPending, selectedProductId, selectedMaterialId, typeFilter, statusFilter, debouncedKeyword]);

  async function refreshMaterials(): Promise<void> {
    if (!selectedProductId) {
      return;
    }

    setMaterialsLoading(true);
    setMaterialsError(null);
    try {
      const response = await listMaterials({
        product_id: selectedProductId,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        keyword: debouncedKeyword.trim() || undefined,
        limit: 12,
      });
      setMaterials(response.items);
      setPageInfo(response.page_info);
      setSelectedMaterialId((current) => {
        if (current && response.items.some((item) => item.material_id === current)) {
          return current;
        }
        return response.items[0]?.material_id ?? null;
      });
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : t('material.materialListRefreshFailed'));
    } finally {
      setMaterialsLoading(false);
    }
  }

  async function loadMoreMaterials(): Promise<void> {
    if (!selectedProductId || !pageInfo?.has_more || !pageInfo.cursor) {
      return;
    }

    setMaterialsLoading(true);
    setMaterialsError(null);
    try {
      const response = await listMaterials({
        product_id: selectedProductId,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        keyword: debouncedKeyword.trim() || undefined,
        limit: 12,
        cursor: pageInfo.cursor,
      });
      setMaterials((current) => [...current, ...response.items]);
      setPageInfo(response.page_info);
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : t('material.materialListLoadFailed'));
    } finally {
      setMaterialsLoading(false);
    }
  }

  async function handleSearch(): Promise<void> {
    if (!selectedProductId) {
      setSearchResults([]);
      setSearchError(t('material.noProductForSearch'));
      return;
    }
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError(t('material.enterSearchQuery'));
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    setSearchProgress(t('material.buildingQuery'));
    try {
      setSearchProgress(t('material.executingSearch'));
      const response = await searchMaterialSlices({
        product_id: selectedProductId,
        query: searchQuery.trim(),
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        search_mode: searchMode,
        strictness: searchStrictness,
        granularity: searchGranularity,
        limit: 12,
      });
      setSearchProgress(t('material.loadingSliceDetail'));
      setSearchResults(response.items);
      setSearchSource(response.search_source ?? null);
      setSearchProgress(null);
    } catch (error) {
      setSearchProgress(null);
      const message = error instanceof Error ? error.message : t('material.sliceSearchFailed');
      if (message.includes('Embedding') || message.includes('embedding')) {
        setSearchError(t('material.vectorServiceUnavailable'));
      } else {
        setSearchError(message);
      }
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleFiles(files: File[]): Promise<void> {
    const hasProduct = Boolean(selectedProductId);
    const hasAutoRecognize = autoRecognizeProduct;
    if (!hasProduct && !hasAutoRecognize) {
      setUploadError(t('material.selectProductOrAutoRecognize'));
      return;
    }
    if (files.length === 0) return;

    setUploadError(null);
    setUploadSuccess(null);

    // 无商品 ID（仅自动识别模式）时降级为整体上传
    if (!hasProduct && hasAutoRecognize) {
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const inferredType = inferMaterialType(file);
        const finalType = uploadType === 'AUTO' ? inferredType : uploadType;
        if (!finalType) { failCount++; errors.push(`${file.name}: ${t('material.unsupportedFormat', { filename: file.name })}`); continue; }

        try {
          await uploadMaterial({
            file,
            auto_recognize_product: true,
            type: finalType as 'IMAGE' | 'VIDEO' | 'PRODUCT_MAIN_IMAGE',
            source_type: uploadSourceType,
            remark: uploadRemark.trim() || undefined,
            reference_material_id: uploadSourceType === 'REFERENCE' && referenceMaterialId ? referenceMaterialId : undefined,
            reference_category: uploadSourceType === 'REFERENCE' && referenceCategory ? referenceCategory as 'COMPETITOR_IMAGE' | 'COMPETITOR_VIDEO' | 'INSPIRATION' | 'BENCHMARK' : undefined,
          });
          successCount++;
        } catch (error) {
          failCount++;
          errors.push(`${file.name}: ${error instanceof Error ? error.message : t('material.uploadFailed')}`);
        }
      }

      if (successCount > 0 && failCount === 0) {
        setUploadSuccess(t('material.uploadSuccess', { count: successCount }));
      } else if (successCount > 0 && failCount > 0) {
        setUploadSuccess(t('material.uploadPartialSuccess', { success: successCount, fail: failCount }));
        setUploadError(errors.slice(0, 3).join('\n'));
      } else {
        setUploadError(t('material.uploadAllFailed', { errors: errors.slice(0, 3).join('\n') }));
      }
      setUploadRemark('');
      await refreshMaterials();
      return;
    }

    // 有商品 ID：加入分片上传队列
    const queueItems = files
      .map((file) => {
        const inferredType = inferMaterialType(file);
        const finalType = uploadType === 'AUTO' ? inferredType : uploadType;
        return { file, finalType };
      })
      .filter((item): item is { file: File; finalType: NonNullable<ReturnType<typeof inferMaterialType>> } => {
        if (!item.finalType) {
          setUploadError(t('material.unsupportedFormat', { filename: item.file.name }));
          return false;
        }
        return true;
      });

    if (queueItems.length === 0) return;

    setUploadRemark('');
    setUploadError(null);
    uploadQueue.addToQueue(
      queueItems.map(({ file, finalType }) => ({
        file,
        fileName: file.name,
        fileSize: file.size,
        productId: selectedProductId ?? '',
        type: finalType as 'IMAGE' | 'VIDEO' | 'PRODUCT_MAIN_IMAGE',
        sourceType: uploadSourceType,
        remark: uploadRemark.trim(),
        referenceMaterialId: uploadSourceType === 'REFERENCE' && referenceMaterialId ? referenceMaterialId : undefined,
        referenceCategory: uploadSourceType === 'REFERENCE' && referenceCategory ? referenceCategory : undefined,
        autoRecognizeProduct: false,
      })),
    );

    setUploadRemark('');
    // 上传状态由上方的 UploadQueuePanel 独立展示，此处不提前设置成功/失败提示
  }

  // 保持单个文件上传的兼容性
  async function handleFile(file: File): Promise<void> {
    return handleFiles([file]);
  }

  async function handleDelete(materialId: string): Promise<void> {
    if (!window.confirm(t('material.confirmDeleteMaterial'))) {
      return;
    }

    setBusyMaterialId(materialId);
    try {
      await deleteMaterial(materialId);
      if (selectedMaterialId === materialId) {
        setSelectedMaterialId(null);
      }
      await refreshMaterials();
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : t('material.materialDeleteFailed'));
    } finally {
      setBusyMaterialId(null);
    }
  }

  async function handleReprocess(materialId: string): Promise<void> {
    setBusyMaterialId(materialId);
    try {
      await reprocessMaterial(materialId);
      await refreshMaterials();
      if (selectedMaterialId === materialId) {
        try {
          const detailResponse = await getMaterialDetail(materialId);
          setDetail(detailResponse);
          setDetailError(null);
        } catch {
          // Will be re-fetched by polling
        }
      }
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : t('material.reprocessFailed'));
    } finally {
      setBusyMaterialId(null);
    }
  }

  async function handleVisionAnalyze(materialId: string): Promise<void> {
    setBusyMaterialId(materialId);
    try {
      await analyzeMaterialVision(materialId);
      // 刷新素材详情以获取持久化后的 vision_analysis 结果
      if (selectedMaterialId === materialId) {
        try {
          const detailResponse = await getMaterialDetail(materialId);
          setDetail(detailResponse);
          setDetailError(null);
        } catch {
          // Refresh will be handled by the UI
        }
      }
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : t('material.visionAnalyzeFailed'));
    } finally {
      setBusyMaterialId(null);
    }
  }

  // ========== 回收站功能 ==========
  async function loadTrashItems(): Promise<void> {
    if (!selectedProductId) return;
    setTrashLoading(true);
    try {
      const response = await listTrashMaterials({
        product_id: selectedProductId,
        limit: 50,
      });
      setTrashItems(response.items);
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : t('material.trashLoadFailed'));
    } finally {
      setTrashLoading(false);
    }
  }

  async function handleRestore(materialId: string): Promise<void> {
    setBusyMaterialId(materialId);
    try {
      await restoreMaterial(materialId);
      await loadTrashItems();
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : t('material.restoreFailed'));
    } finally {
      setBusyMaterialId(null);
    }
  }

  async function handlePermanentDelete(materialId: string): Promise<void> {
    if (!window.confirm(t('material.confirmPermanentDelete'))) {
      return;
    }
    setBusyMaterialId(materialId);
    try {
      await permanentDeleteMaterial(materialId);
      setSelectedMaterialIds((prev) => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
      await loadTrashItems();
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : t('material.permanentDeleteFailed'));
    } finally {
      setBusyMaterialId(null);
    }
  }

  async function handleBatchRestore(): Promise<void> {
    if (selectedMaterialIds.size === 0) return;
    setBusyMaterialId('batch');
    try {
      for (const id of selectedMaterialIds) {
        await restoreMaterial(id);
      }
      setSelectedMaterialIds(new Set());
      await loadTrashItems();
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : t('material.batchRestoreFailed'));
    } finally {
      setBusyMaterialId(null);
    }
  }

  async function handleBatchPermanentDelete(): Promise<void> {
    if (selectedMaterialIds.size === 0) return;
    if (!window.confirm(t('material.confirmBatchPermanentDelete', { count: selectedMaterialIds.size }))) {
      return;
    }
    setBusyMaterialId('batch');
    try {
      for (const id of selectedMaterialIds) {
        await permanentDeleteMaterial(id);
      }
      setSelectedMaterialIds(new Set());
      await loadTrashItems();
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : t('material.batchPermanentDeleteFailed'));
    } finally {
      setBusyMaterialId(null);
    }
  }

  // 监听 showTrash 变化，加载回收站数据
  useEffect(() => {
    if (showTrash && selectedProductId) {
      void loadTrashItems();
    }
  }, [showTrash, selectedProductId]);

  const selectedListItem = materials.find((item) => item.material_id === selectedMaterialId) ?? null;

  return (
    <div className="space-y-6">
      <ProductContextBar />
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('material.uploadWorkspace')}</CardTitle>
              <CardDescription>{t('material.uploadWorkspaceDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`rounded-3xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragActive ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-slate-700 bg-slate-950/50'
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  const file = event.dataTransfer.files[0];
                  if (file) {
                    void handleFile(file);
                  }
                }}
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="mt-4 text-sm font-medium text-slate-100">{t('material.dragHere')}</div>
                <div className="mt-2 text-xs text-slate-500">{t('material.dragHereDesc')}</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files && files.length > 0) {
                      void handleFiles(Array.from(files));
                      event.target.value = '';
                    }
                  }}
                />
                <Button className="mt-4 w-full" onClick={() => fileInputRef.current?.click()} disabled={uploadQueue.uploadingCount > 0 || (!selectedProductId && !autoRecognizeProduct)}>
                  {(uploadQueue.uploadingCount > 0) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {t('material.selectFile')}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs text-slate-500">{t('material.materialType')}</div>
                  <Select value={uploadType} onChange={(event) => setUploadType(event.target.value as 'AUTO' | 'IMAGE' | 'VIDEO' | 'PRODUCT_MAIN_IMAGE')}>
                    <option value="AUTO">{t('material.autoDetect')}</option>
                    <option value="VIDEO">{t('material.video2')}</option>
                    <option value="IMAGE">{t('material.image2')}</option>
                    <option value="PRODUCT_MAIN_IMAGE">{t('material.productMainImage')}</option>
                  </Select>
                </div>
                <div>
                  <div className="mb-2 text-xs text-slate-500">{t('material.materialSource')}</div>
                  <Select value={uploadSourceType} onChange={(event) => {
                    setUploadSourceType(event.target.value as 'UPLOAD' | 'REFERENCE');
                    if (event.target.value === 'UPLOAD') {
                      setReferenceMaterialId('');
                      setReferenceCategory('');
                    }
                  }}>
                    <option value="UPLOAD">{t('material.localMaterial')}</option>
                    <option value="REFERENCE">{t('material.referenceMaterial')}</option>
                  </Select>
                </div>
              </div>

              {uploadSourceType === 'REFERENCE' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs text-slate-500">{t('material.associateMainMaterial')}</div>
                    <Select value={referenceMaterialId} onChange={(event) => setReferenceMaterialId(event.target.value)}>
                      <option value="">{t('material.selectMainMaterial')}</option>
                      {materials.filter((m) => m.source_type !== 'REFERENCE').map((m) => (
                        <option key={m.material_id} value={m.material_id}>
                          {m.file_name} ({t(TYPE_LABELS[m.type]) || m.type})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <div className="mb-2 text-xs text-slate-500">{t('material.referenceCategory')}</div>
                    <Select value={referenceCategory} onChange={(event) => setReferenceCategory(event.target.value)}>
                      <option value="">{t('material.selectCategory')}</option>
                      <option value="COMPETITOR_IMAGE">{t('material.refCategoryCompetitorImage')}</option>
                      <option value="COMPETITOR_VIDEO">{t('material.refCategoryCompetitorVideo')}</option>
                      <option value="INSPIRATION">{t('material.refCategoryInspiration')}</option>
                      <option value="BENCHMARK">{t('material.refCategoryBenchmark')}</option>
                    </Select>
                  </div>
                </div>
              )}
              <div>
                <div className="mb-2 text-xs text-slate-500">{t('material.materialRemark')}</div>
                <Textarea
                  value={uploadRemark}
                  onChange={(event) => setUploadRemark(event.target.value)}
                  placeholder={t('material.remarkPlaceholder')}
                  className="min-h-[88px]"
                />
              </div>

              {uploadError && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{uploadError}</div>}
              {uploadSuccess && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  <div>{uploadSuccess}</div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setUploadSuccess(null)}>
                      {t('material.continueUpload')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate('/scripts')}>
                      {t('material.goGenerateScript')}
                    </Button>
                  </div>
                </div>
              )}
              <UploadQueuePanel
                items={uploadQueue.items}
                uploadingCount={uploadQueue.uploadingCount}
                pendingCount={uploadQueue.pendingCount}
                onPause={uploadQueue.pauseItem}
                onResume={uploadQueue.resumeItem}
                onRemove={uploadQueue.removeItem}
                onClearCompleted={uploadQueue.clearCompleted}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('material.sliceSearchTitle')}</CardTitle>
              <CardDescription>{t('material.sliceSearchDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('material.searchPlaceholder2')} />
              <div className="grid gap-3 sm:grid-cols-4">
                <Select value={searchMode} onChange={(event) => setSearchMode(event.target.value as 'AUTO' | 'VECTOR' | 'FUSION' | 'KEYWORD')}>
                  <option value="AUTO">{t('material.semanticSearch')}</option>
                  <option value="VECTOR">{t('material.vectorSearch')}</option>
                  <option value="KEYWORD">{t('material.keywordSearch')}</option>
                  <option value="FUSION">{t('material.fusionSearch')}</option>
                </Select>
                <Select value={searchGranularity} onChange={(event) => setSearchGranularity(event.target.value as 'slice' | 'material' | 'hybrid')}>
                  <option value="slice">{t('material.sliceLevel')}</option>
                  <option value="material">{t('material.materialLevel')}</option>
                  <option value="hybrid">{t('material.hybridLevel')}</option>
                </Select>
                <Select value={searchStrictness} onChange={(event) => setSearchStrictness(event.target.value as 'strict' | 'relaxed')}>
                  <option value="relaxed">{t('material.searchRelaxed')}</option>
                  <option value="strict">{t('material.searchStrict')}</option>
                </Select>
                <Button variant="outline" onClick={() => void handleSearch()} disabled={searchLoading || !selectedProductId}>
                  {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {t('material.searchSlices')}
                </Button>
              </div>
              {searchError && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{searchError}</div>}
              {searchProgress && (
                <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-cyan-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{searchProgress}</span>
                  </div>
                </div>
              )}
              {searchSource && (
                <div className="text-xs text-slate-500">
                  {t('material.searchSource2')}
                  {searchSource === 'vector'
                    ? t('material.vectorSemantic')
                    : searchSource === 'keyword_fallback'
                      ? t('material.keywordFallback')
                      : searchSource}
                </div>
              )}
              <div className="space-y-3">
                {searchResults.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-500">
                    {searchSource !== null ? t('material.searchNoResults') : t('material.searchResultsEmpty')}
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedMaterialId(item.material_id)}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-left transition-colors hover:border-slate-700 hover:bg-slate-900/70 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-100">{item.file_name ?? item.slice_id}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatDuration(item.start_time)} - {formatDuration(item.end_time)} · 相关度 {item.score?.toFixed(3) ?? '--'}
                          </div>
                        </div>
                        <Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>
                      </div>
                      {item.dense_caption && <div className="mt-3 text-sm text-slate-300">{item.dense_caption}</div>}
                      {item.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-900 px-2 py-1 text-xs text-slate-300">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{showTrash ? t('material.trashListTitle') : t('material.materialListTitle')}</CardTitle>
                  <CardDescription>
                    {showTrash ? t('material.trashListDesc') : t('material.materialListDesc')}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {!showTrash && (
                    <Button
                      variant={isSelectMode ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (isSelectMode) {
                          setSelectedMaterialIds(new Set());
                        }
                        setIsSelectMode(!isSelectMode);
                      }}
                    >
                      {isSelectMode ? t('material.finishSelect') : t('material.batchSelect')}
                    </Button>
                  )}
                  <Button
                    variant={showTrash ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      setShowTrash(!showTrash);
                      setIsSelectMode(false);
                      setSelectedMaterialIds(new Set());
                    }}
                  >
                    {showTrash ? <Database className="h-4 w-4" /> : <Trash2Icon className="h-4 w-4" />}
                    {showTrash ? t('material.backToList') : t('material.trashBtn')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="">{t('material.allTypes')}</option>
                  <option value="VIDEO">{t('material.video2')}</option>
                  <option value="IMAGE">{t('material.image2')}</option>
                  <option value="PRODUCT_MAIN_IMAGE">{t('material.productMainImage')}</option>
                </Select>
                <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">{t('material.allStatus')}</option>
                  <option value="PENDING">PENDING</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="FAILED">FAILED</option>
                </Select>
                <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t('material.placeholderFileFilter')} />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {isSelectMode ? (
                    <span className="text-cyan-400">{selectedMaterialIds.size} / {materials.length} 已选</span>
                  ) : (
                    <span>{t('material.materialsCount', { count: pageInfo?.total_count ?? materials.length })}</span>
                  )}
                </span>
                {isSelectMode && selectedMaterialIds.size > 0 && (
                  <div className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={() => {
                      if (window.confirm(t('material.confirmBatchDelete', { count: selectedMaterialIds.size }))) {
                        void (async () => {
                          for (const id of selectedMaterialIds) {
                            await deleteMaterial(id);
                          }
                          setSelectedMaterialIds(new Set());
                          await refreshMaterials();
                        })();
                      }
                    }}>
                      <Trash2 className="h-4 w-4" />
                      {t('material.batchDelete')}
                    </Button>
                  </div>
                )}
                {!isSelectMode && (
                  <Button variant="ghost" size="sm" onClick={() => void refreshMaterials()} disabled={materialsLoading || !selectedProductId}>
                    <RefreshCw className={`h-4 w-4 ${materialsLoading ? 'animate-spin' : ''}`} />
                    {t('material.refresh')}
                  </Button>
                )}
              </div>

              {materialsError && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{materialsError}</div>}

              <div className="space-y-3">
                {materials.length === 0 && !materialsLoading ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-sm text-slate-500">
                    {t('material.noMaterialsYet')}
                  </div>
                ) : (
                  (showTrash ? trashItems : materials).map((item) => {
                    const thumbnailSrc = resolveAssetUrl(item.thumbnail_url);
                    const originSrc = resolveAssetUrl(item.origin_url);
                    const isImage = isImageLikeType(item.type);
                    const isVideo = item.type === 'VIDEO';
                    // 图片：thumbnail > origin；视频：thumbnail > 首帧；音频：无封面
                    const coverImageUrl = isImage ? (thumbnailSrc ?? originSrc) : thumbnailSrc;
                    const videoFallbackUrl = isVideo && !thumbnailSrc ? originSrc : null;
                    const active = item.material_id === selectedMaterialId;
                    const isSelected = selectedMaterialIds.has(item.material_id);
                    const isTrash = showTrash;

                    const renderCover = (opacityClass?: string) => {
                      if (coverImageUrl) {
                        return (
                          <LazyImage src={coverImageUrl} alt={item.file_name}
                            className={`h-full w-full relative ${opacityClass ?? ''}`}
                            fallback={
                              <div className={`flex h-full w-full items-center justify-center bg-slate-800 ${opacityClass ?? ''}`}>
                                {isImage ? <ImageIcon className="h-5 w-5 text-amber-300" /> : <Play className="h-5 w-5 text-slate-400" />}
                              </div>
                            }
                          />
                        );
                      }
                      if (videoFallbackUrl) {
                        return (
                          <video src={videoFallbackUrl} muted preload="metadata" playsInline disablePictureInPicture
                            className={`h-full w-full object-cover ${opacityClass ?? ''}`} />
                        );
                      }
                      // 无 URL 回退到类型图标
                      return (
                        <div className={`flex h-full w-full items-center justify-center ${opacityClass ?? ''}`}>
                          {isVideo ? <Video className="h-5 w-5 text-cyan-300" />
                            : isImage ? <ImageIcon className="h-5 w-5 text-amber-300" />
                            : <Music className="h-5 w-5 text-slate-400" />}
                        </div>
                      );
                    };

                    if (isSelectMode && !isTrash) {
                      // 多选模式
                      return (
                        <button
                          key={item.material_id}
                          type="button"
                          onClick={() => {
                            setSelectedMaterialIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.material_id)) {
                                next.delete(item.material_id);
                              } else {
                                next.add(item.material_id);
                              }
                              return next;
                            });
                          }}
                          className={`w-full rounded-3xl border p-4 text-left transition-colors ${
                            isSelected
                              ? 'border-cyan-500 bg-cyan-500/10'
                              : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/70'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900">
                            {renderCover()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-2">
                                {isSelected ? (
                                  <CheckCircle className="h-5 w-5 text-cyan-400" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-slate-600" />
                                )}
                                <div className="truncate text-sm font-medium text-slate-100">{item.file_name}</div>
                              </div>
                              <Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>{t(TYPE_LABELS[item.type]) || item.type}</span>
                              <span>{formatBytes(item.file_size_bytes)}</span>
                              <span>{item.slices_count} {t('material.slicesUnit')}</span>
                              <span>{formatDuration(item.duration_seconds)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  }

                  if (isTrash) {
                      // 回收站模式
                      return (
                        <div
                          key={item.material_id}
                          onClick={() => {
                            setSelectedMaterialIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.material_id)) {
                                next.delete(item.material_id);
                              } else {
                                next.add(item.material_id);
                              }
                              return next;
                            });
                          }}
                          className={`rounded-3xl border p-4 transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-rose-500 bg-rose-500/10'
                              : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/70'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900">
                            {renderCover('opacity-50')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedMaterialIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(item.material_id)) {
                                      next.delete(item.material_id);
                                    } else {
                                      next.add(item.material_id);
                                    }
                                    return next;
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                              />
                              <div className="truncate text-sm font-medium text-slate-400">{item.file_name}</div>
                            </div>
                            <Badge variant="outline">{t('material.deleted')}</Badge>
                          </div>
                          <div className="mt-2 text-xs text-slate-600">{formatDateTime(item.created_at)}</div>
                        </div>
                            <div className="flex flex-col gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); void handleRestore(item.material_id); }}
                                disabled={busyMaterialId === item.material_id}
                              >
                                {busyMaterialId === item.material_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                {t('material.restore')}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); void handlePermanentDelete(item.material_id); }}
                                disabled={busyMaterialId === item.material_id}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // 普通模式
                    return (
                      <button
                        key={item.material_id}
                        type="button"
                        onClick={() => setSelectedMaterialId(item.material_id)}
                        className={`w-full rounded-3xl border p-4 text-left transition-colors ${
                          active ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/70'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900">
                            {renderCover()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-medium text-slate-100">{item.file_name}</div>
                              <Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>{t(TYPE_LABELS[item.type]) || item.type}</span>
                              <span>{formatBytes(item.file_size_bytes)}</span>
                              <span>{item.slices_count} {t('material.slicesUnit')}</span>
                              <span>{formatDuration(item.duration_seconds)}</span>
                            </div>
                            <div className="mt-2 text-xs text-slate-600">{formatDateTime(item.created_at)}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}

                {/* 回收站批量操作栏 */}
                {showTrash && selectedMaterialIds.size > 0 && (
                  <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-slate-700 bg-slate-900 px-6 py-3 shadow-lg">
                    <span className="text-sm text-slate-300">{t('material.materialSelected', { count: selectedMaterialIds.size })}</span>
                    <Button variant="outline" size="sm" onClick={() => void handleBatchRestore()} disabled={busyMaterialId === 'batch'}>
                      <RotateCcw className="h-4 w-4" />
                      {t('material.batchRestore')}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => void handleBatchPermanentDelete()} disabled={busyMaterialId === 'batch'}>
                      <Trash2 className="h-4 w-4" />
                      {t('material.batchPermanentDelete')}
                    </Button>
                  </div>
                )}
              </div>

              {pageInfo?.has_more && (
                <Button variant="outline" className="w-full" onClick={() => void loadMoreMaterials()} disabled={materialsLoading}>
                  {materialsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  {t('material.loadMore')}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('material.materialDetailTitle')}</CardTitle>
              <CardDescription>{t('material.materialDetailDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedMaterialId && !materialsLoading && (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-sm text-slate-500">
                  {t('material.selectMaterialHint')}
                </div>
              )}

              {detailLoading && <MaterialDetailSkeleton />}

              {detailError && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{detailError}</div>}

              {detail && (
                <>
                  <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/60">
                    <div className="aspect-video bg-slate-900">
                      {(() => {
                        const videoUrl = !isImageLikeType(detail.material.type)
                          ? resolveAssetUrl(detail.material.origin_url)
                          : null;
                        const imageUrl = resolveAssetUrl(
                          detail.material.origin_url ?? detail.material.thumbnail_url,
                        );

                        if (videoUrl) {
                          return (
                            <video
                              src={videoUrl}
                              controls
                              className="h-full w-full object-contain"
                              preload="metadata"
                            />
                          );
                        }
                        if (imageUrl) {
                          return (
                            <LazyImage
                              src={imageUrl}
                              alt={detail.material.file_name}
                              className="h-full w-full relative"
                            />
                          );
                        }
                        return (
                          <div className="flex h-full items-center justify-center text-slate-500">
                            {!isImageLikeType(detail.material.type) ? (
                              <Video className="h-8 w-8" />
                            ) : (
                              <ImageIcon className="h-8 w-8" />
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="space-y-4 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-slate-100">{detail.material.file_name}</div>
                          <div className="mt-1 text-sm text-slate-500">{detail.material.product?.title ?? selectedProduct?.title ?? '--'}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={getStatusVariant(detail.material.status)}>{detail.material.status}</Badge>
                          <Badge variant="outline">{t(TYPE_LABELS[detail.material.type]) || detail.material.type}</Badge>
                          {detail.material.source_type === 'REFERENCE' && (
                            <Badge variant="outline" className="text-amber-300 border-amber-500/30">{t('material.referenceMaterial')}</Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-slate-900/70 p-4 text-sm text-slate-300">
                          <div className="text-xs text-slate-500">{t('material.fileSizeLabel2')}</div>
                          <div className="mt-1 font-medium text-slate-100">{formatBytes(detail.material.file_size_bytes)}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-900/70 p-4 text-sm text-slate-300">
                          <div className="text-xs text-slate-500">{t('material.durationResolution')}</div>
                          <div className="mt-1 font-medium text-slate-100">
                            {formatDuration(detail.material.duration_seconds)} · {detail.material.width ?? '--'} × {detail.material.height ?? '--'}
                          </div>
                        </div>
                      </div>

                      {detail.material.remark && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">{detail.material.remark}</div>
                      )}

                      {detail.material.referenced_material_id && (
                        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-slate-300">
                          <div className="text-xs text-amber-400 mb-1">{t('material.referenceRelation')}</div>
                          <div>
                            {t('material.mainMaterial')}<span className="text-slate-100 font-mono text-xs">{detail.material.referenced_material_id}</span>
                          </div>
                          {detail.material.reference_category && (
                            <div className="mt-1">
                              {t('material.referenceCategoryLabel')}<span className="text-amber-200">{t(REFERENCE_CATEGORY_LABELS[detail.material.reference_category]) || detail.material.reference_category}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          onClick={() => void handleReprocess(detail.material.material_id)}
                          disabled={busyMaterialId === detail.material.material_id}
                        >
                          {busyMaterialId === detail.material.material_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                          {t('material.reprocess')}
                        </Button>
                        {isImageLikeType(detail.material.type) && (
                          <Button
                            variant="outline"
                            onClick={() => void handleVisionAnalyze(detail.material.material_id)}
                            disabled={busyMaterialId === detail.material.material_id}
                          >
                            {busyMaterialId === detail.material.material_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                            AI {t('material.visionAnalyze')}
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          onClick={() => void handleDelete(detail.material.material_id)}
                          disabled={busyMaterialId === detail.material.material_id}
                        >
                          {busyMaterialId === detail.material.material_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          {t('material.deleteMaterial')}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* AI 视觉分析结果 */}
                  {detail.material.vision_analysis && (
                    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-violet-200">
                        <Eye className="h-4 w-4" />
                        AI {t('material.visionAnalysisResult')}
                      </div>

                      {detail.material.vision_analysis.product_features.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-xs text-violet-400/70">{t('material.productFeatures')}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {detail.material.vision_analysis.product_features.map((f: string) => (
                              <span key={f} className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2.5 py-0.5 text-xs text-violet-200">
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {detail.material.vision_analysis.visual_selling_points.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-xs text-violet-400/70">{t('material.visualSellingPoints')}</div>
                          <ul className="space-y-1">
                            {detail.material.vision_analysis.visual_selling_points.map((p: string, i: number) => (
                              <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                                <span className="mt-0.5 text-violet-400">•</span>
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {detail.material.vision_analysis.style_tags.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-xs text-violet-400/70">{t('material.styleTags')}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {detail.material.vision_analysis.style_tags.map((tag: string) => (
                              <span key={tag} className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2.5 py-0.5 text-xs text-violet-300">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {detail.material.vision_analysis.shot_suggestions.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-xs text-violet-400/70">{t('material.shotSuggestions')}</div>
                          <div className="space-y-1">
                            {[...detail.material.vision_analysis.shot_suggestions]
                              .sort((a: { priority: number }, b: { priority: number }) => b.priority - a.priority)
                              .map((s: { shot_type: string; description: string; priority: number }) => (
                                <div key={s.shot_type} className="flex items-start gap-2 rounded-lg bg-slate-900/50 px-3 py-1.5 text-xs">
                                  <span className="mt-0.5 shrink-0 rounded bg-violet-600/30 px-1.5 py-0.5 text-[10px] font-medium text-violet-200">
                                    {s.shot_type}
                                  </span>
                                  <span className="text-slate-400">{s.description}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {detail.material.vision_analysis.quality_assessment && (
                        <div>
                          <div className="mb-1.5 text-xs text-violet-400/70">{t('material.qualityAssessment')}</div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-lg bg-slate-900/50 px-3 py-2">
                              <span className="text-slate-500">清晰度 </span>
                              <span className={detail.material.vision_analysis.quality_assessment.clarity === 'high' ? 'text-emerald-400' : detail.material.vision_analysis.quality_assessment.clarity === 'medium' ? 'text-amber-400' : 'text-rose-400'}>
                                {detail.material.vision_analysis.quality_assessment.clarity}
                              </span>
                            </div>
                            <div className="rounded-lg bg-slate-900/50 px-3 py-2">
                              <span className="text-slate-500">光线 </span>
                              <span className="text-slate-300">{detail.material.vision_analysis.quality_assessment.lighting}</span>
                            </div>
                            <div className="rounded-lg bg-slate-900/50 px-3 py-2">
                              <span className="text-slate-500">构图 </span>
                              <span className="text-slate-300">{detail.material.vision_analysis.quality_assessment.composition}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-slate-100">{t('material.sliceResults')}</div>
                      <div className="text-xs text-slate-500">{t('material.slicesCount', { count: detail.slices.length })}</div>
                    </div>
                    {/* 整体切片进度条 */}
                    {materialSliceProgress[detail.material.material_id] && materialSliceProgress[detail.material.material_id].stage !== '已完成' && (
                      <div className="space-y-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-cyan-200">{materialSliceProgress[detail.material.material_id].stage}</span>
                          <span className="text-cyan-400">
                            {materialSliceProgress[detail.material.material_id].completed}/{materialSliceProgress[detail.material.material_id].total}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                            style={{
                              width: `${Math.round((materialSliceProgress[detail.material.material_id].completed / materialSliceProgress[detail.material.material_id].total) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {detail.slices.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-6 text-sm text-slate-500">
                        {t('material.slicesEmpty')}
                      </div>
                    ) : (
                      detail.slices.map((slice) => {
                        const isProcessing = slice.status === 'PENDING' || slice.status === 'CAPTIONING' || slice.status === 'EMBEDDING';
                        const sliceProgress = slice.status === 'COMPLETED' || slice.status === 'FAILED'
                          ? 100
                          : slice.status === 'EMBEDDING'
                            ? 75
                            : slice.status === 'CAPTIONING'
                              ? 40
                              : 5;
                        return (
                          <div key={slice.id} className={`rounded-2xl border p-4 ${isProcessing ? 'border-cyan-500/30 bg-slate-950/60' : 'border-slate-800 bg-slate-950/60'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                                  {slice.slice_id}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void navigator.clipboard.writeText(slice.slice_id);
                                    }}
                                    className="rounded-lg border border-slate-700 bg-slate-900 p-1 text-slate-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
                                    title="复制切片 ID"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {formatDuration(slice.start_time)} - {formatDuration(slice.end_time)} · {formatDuration(slice.duration)}
                                </div>
                              </div>
                              <Badge variant={getStatusVariant(slice.status)}>{slice.status}</Badge>
                            </div>
                            {/* 每个切片的处理进度条 */}
                            {isProcessing && (
                              <div className="mt-3 space-y-1">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${slice.status === 'PENDING' ? 'bg-slate-500 w-1/3 animate-pulse' : 'bg-gradient-to-r from-cyan-500 to-blue-500'}`}
                                    style={{ width: `${sliceProgress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            {slice.dense_caption && <div className="mt-3 text-sm text-slate-300">{slice.dense_caption}</div>}
                            {slice.tags.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {slice.tags.map((tag) => (
                                  <span key={tag} className="rounded-full bg-slate-900 px-2 py-1 text-xs text-slate-300">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {!detail && selectedListItem && !detailLoading && (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-sm text-slate-500">
                  {t('material.detailUnavailable', { fileName: selectedListItem.file_name })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
