import { useCallback, useEffect, useRef, useState } from 'react';
import {
  chunkedUpload,
  clearUploadState,
} from '../lib/chunked-uploader';

export type UploadQueueItem = {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  productId: string;
  type: 'IMAGE' | 'VIDEO' | 'PRODUCT_MAIN_IMAGE';
  sourceType: 'UPLOAD' | 'REFERENCE';
  remark: string;
  referenceMaterialId?: string;
  referenceCategory?: string;
  autoRecognizeProduct: boolean;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  status: 'queued' | 'uploading' | 'paused' | 'completed' | 'error';
  error?: string;
  materialId?: string;
  thumbnailUrl?: string;
  /** AI 生成的字幕（图片上传成功时返回） */
  denseCaption?: string;
  /** AI 生成的标签（图片上传成功时返回） */
  tags?: string[];
};

type UploadQueueState = {
  items: UploadQueueItem[];
};

let nextItemId = 0;

function genId(): string {
  nextItemId++;
  return `upload_${Date.now()}_${nextItemId}`;
}

export function useUploadQueue() {
  const [state, setState] = useState<UploadQueueState>({ items: [] });
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const processingRef = useRef(false);
  const itemsRef = useRef<UploadQueueItem[]>([]);
  itemsRef.current = state.items;

  const addToQueue = useCallback(
    (items: Omit<UploadQueueItem, 'id' | 'progress' | 'loadedBytes' | 'totalBytes' | 'status'>[]) => {
      const newItems: UploadQueueItem[] = items.map((item) => ({
        ...item,
        id: genId(),
        progress: 0,
        loadedBytes: 0,
        totalBytes: item.fileSize,
        status: 'queued' as const,
      }));

      setState((prev) => ({
        items: [...prev.items, ...newItems],
      }));

      return newItems;
    },
    [],
  );

  const removeItem = useCallback((id: string) => {
    const ac = abortControllersRef.current.get(id);
    if (ac) {
      ac.abort();
      abortControllersRef.current.delete(id);
    }
    const item = itemsRef.current.find((i) => i.id === id);
    if (item) {
      clearUploadState(`${item.fileName}_${item.fileSize}`);
    }
    setState((prev) => ({
      items: prev.items.filter((i) => i.id !== id),
    }));
  }, []);

  const pauseItem = useCallback((id: string) => {
    const ac = abortControllersRef.current.get(id);
    if (ac) {
      ac.abort();
      abortControllersRef.current.delete(id);
    }
    setState((prev) => ({
      items: prev.items.map((item) =>
        item.id === id && item.status === 'uploading'
          ? { ...item, status: 'paused' as const }
          : item,
      ),
    }));
  }, []);

  const resumeItem = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item || item.status !== 'paused') return;

      setState((prev) => ({
        items: prev.items.map((i) =>
          i.id === id ? { ...i, status: 'uploading' as const, error: undefined } : i,
        ),
      }));

      const ac = new AbortController();
      abortControllersRef.current.set(id, ac);

      try {
        const result = await chunkedUpload(item.file, item.productId, item.type as 'IMAGE' | 'VIDEO', {
          onProgress: (progress, loadedBytes, totalBytes) => {
            setState((prev) => ({
              items: prev.items.map((i) =>
                i.id === id
                  ? { ...i, progress, loadedBytes, totalBytes }
                  : i,
              ),
            }));
          },
          signal: ac.signal,
        });

        setState((prev) => ({
          items: prev.items.map((i) =>
            i.id === id
              ? {
                  ...i,
                  status: 'completed' as const,
                  progress: 100,
                  materialId: result.material_id,
                  thumbnailUrl: result.thumbnail_url,
                  denseCaption: result.dense_caption,
                  tags: result.tags,
                }
              : i,
          ),
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState((prev) => ({
          items: prev.items.map((i) =>
            i.id === id
              ? { ...i, status: 'error' as const, error: error instanceof Error ? error.message : '上传失败' }
              : i,
          ),
        }));
      } finally {
        abortControllersRef.current.delete(id);
      }
    },
    [],
  );

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // 从 ref 读取最新状态（避免在 setState updater 内启动副作用，
        // 防止 React 18 StrictMode 双调 updater 导致重复上传）
        const currentItems = itemsRef.current;
        const queuedItem = currentItems.find((i) => i.status === 'queued');
        if (!queuedItem) {
          processingRef.current = false;
          break;
        }

        const id = queuedItem.id;
        const ac = new AbortController();
        abortControllersRef.current.set(id, ac);

        // 标记为 uploading — 纯 setState，无副作用
        setState((prev) => ({
          items: prev.items.map((i) =>
            i.id === id ? { ...i, status: 'uploading' as const, error: undefined } : i,
          ),
        }));

        // 在 setState 外部执行上传，避免 StrictMode 双调
        try {
          const currentItem = itemsRef.current.find((i) => i.id === id);
          if (!currentItem) {
            abortControllersRef.current.delete(id);
            continue;
          }
          const result = await chunkedUpload(currentItem.file, currentItem.productId, currentItem.type as 'IMAGE' | 'VIDEO', {
            onProgress: (progress, loadedBytes, totalBytes) => {
              setState((prev2) => ({
                items: prev2.items.map((i2) =>
                  i2.id === id ? { ...i2, progress, loadedBytes, totalBytes } : i2,
                ),
              }));
            },
            signal: ac.signal,
            remark: currentItem.remark || undefined,
          });

          setState((prev2) => ({
            items: prev2.items.map((i2) =>
              i2.id === id
                ? {
                    ...i2,
                    status: 'completed' as const,
                    progress: 100,
                    materialId: result.material_id,
                    thumbnailUrl: result.thumbnail_url,
                    denseCaption: result.dense_caption,
                    tags: result.tags,
                  }
                : i2,
            ),
          }));
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            // 被取消，检查是否还有待处理项
            if (!itemsRef.current.some((i) => i.status === 'queued')) {
              processingRef.current = false;
              break;
            }
            continue;
          }
          setState((prev2) => ({
            items: prev2.items.map((i2) =>
              i2.id === id
                ? { ...i2, status: 'error' as const, error: error instanceof Error ? error.message : '上传失败' }
                : i2,
            ),
          }));
        } finally {
          abortControllersRef.current.delete(id);
        }

        // 短暂延迟后检查下一个排队项
        await new Promise((r) => setTimeout(r, 300));

        if (!itemsRef.current.some((i) => i.status === 'queued')) {
          processingRef.current = false;
          break;
        }
      }

      processingRef.current = false;
    } catch {
      processingRef.current = false;
    }
  }, []);

  const hasQueued = state.items.some((i) => i.status === 'queued');
  useEffect(() => {
    if (hasQueued) {
      void processQueue();
    }
  }, [hasQueued, processQueue]);

  const clearCompleted = useCallback(() => {
    setState((prev) => ({
      items: prev.items.filter((i) => i.status !== 'completed'),
    }));
  }, []);

  return {
    items: state.items,
    addToQueue,
    removeItem,
    pauseItem,
    resumeItem,
    clearCompleted,
    uploadingCount: state.items.filter((i) => i.status === 'uploading').length,
    pendingCount: state.items.filter((i) => i.status === 'queued' || i.status === 'paused').length,
  };
}
