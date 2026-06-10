/**
 * 分片上传工具
 * 支持大文件分片上传和断点续传
 */

export interface ChunkUploadOptions {
  file: File;
  uploadId: string;
  chunkSize?: number;
  onProgress?: (progress: number, loadedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export interface ChunkedUploadState {
  uploadId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  completedChunks: Set<number>;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  error?: string;
}

/**
 * 生成分片迭代器
 */
export async function* chunkGenerator(
  file: File,
  chunkSize: number = 5 * 1024 * 1024, // 默认 5MB
): AsyncGenerator<{ chunk: Blob; index: number; total: number; start: number; end: number }> {
  const totalChunks = Math.ceil(file.size / chunkSize);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    yield {
      chunk: file.slice(start, end),
      index: i,
      total: totalChunks,
      start,
      end,
    };
  }
}

/**
 * 保存上传状态到 localStorage（用于断点续传）
 * Bug 20: 文件名脱敏 — localStorage 中的 fileName 仅保留文件扩展名，
 * 原始文件名通过 uploadId 路由到服务端，不暴露在客户端本地存储中
 */
export function saveUploadState(key: string, state: ChunkedUploadState): void {
  const safeName = `upload_${state.uploadId.slice(0, 8)}${getExtension(state.fileName)}`;
  const serializable = {
    uploadId: state.uploadId,
    fileName: safeName,
    fileSize: state.fileSize,
    chunkSize: state.chunkSize,
    totalChunks: state.totalChunks,
    completedChunks: Array.from(state.completedChunks),
    status: state.status,
    error: state.error,
  };
  localStorage.setItem(`chunked_upload_${key}`, JSON.stringify(serializable));
}

/** 提取文件扩展名（含点），无扩展名时返回空字符串 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(lastDot) : '';
}

/**
 * 恢复上传状态
 */
export function loadUploadState(key: string): ChunkedUploadState | null {
  const stored = localStorage.getItem(`chunked_upload_${key}`);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return {
      ...parsed,
      completedChunks: new Set(parsed.completedChunks),
    };
  } catch {
    return null;
  }
}

/**
 * 清除上传状态
 */
export function clearUploadState(key: string): void {
  localStorage.removeItem(`chunked_upload_${key}`);
}

/**
 * 初始化分片上传
 */
export async function initChunkedUpload(
  file: File,
  productId: string,
  type: 'IMAGE' | 'VIDEO',
  options?: {
    remark?: string;
    auto_recognize_product?: boolean;
    reference_material_id?: string;
    reference_category?: string;
  },
): Promise<{ uploadId: string; totalChunks: number; chunkSize: number }> {
  const chunkSize = 5 * 1024 * 1024; // 5MB
  const totalChunks = Math.ceil(file.size / chunkSize);
  const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  const body: Record<string, unknown> = {
    upload_id: uploadId,
    file_name: file.name,
    file_size: file.size,
    chunk_size: chunkSize,
    total_chunks: totalChunks,
    product_id: productId,
    type,
    remark: options?.remark,
  };
  if (options?.auto_recognize_product) body.auto_recognize_product = true;
  if (options?.reference_material_id) body.reference_material_id = options.reference_material_id;
  if (options?.reference_category) body.reference_category = options.reference_category;

  const response = await fetch('/api/v1/materials/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = response.statusText;
    try { const body = await response.json(); message = body?.message || body?.error?.code || message; } catch { /* use statusText */ }
    throw new Error(`初始化上传失败: ${message}`);
  }

  return { uploadId, totalChunks, chunkSize };
}

/**
 * 上传单个分片
 */
export async function uploadChunk(
  uploadId: string,
  chunkIndex: number,
  chunk: Blob,
  options?: { signal?: AbortSignal },
): Promise<{ success: boolean; chunkIndex: number }> {
  const formData = new FormData();
  formData.append('upload_id', uploadId);
  formData.append('chunk_index', String(chunkIndex));
  formData.append('chunk', chunk);

  const response = await fetch('/api/v1/materials/upload/chunk', {
    method: 'POST',
    body: formData,
    signal: options?.signal,
  });

  if (!response.ok) {
    let message = response.statusText;
    try { const body = await response.json(); message = body?.message || body?.error?.code || message; } catch { /* use statusText */ }
    throw new Error(`分片 ${chunkIndex} 上传失败: ${message}`);
  }

  return { success: true, chunkIndex };
}

/**
 * 完成分片上传
 */
export async function completeChunkedUpload(
  uploadId: string,
): Promise<{
    material_id: string;
    file_name: string;
    status: string;
    thumbnail_url?: string;
    dense_caption?: string;
    tags?: string[];
  }> {
  const response = await fetch('/api/v1/materials/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_id: uploadId }),
  });

  if (!response.ok) {
    let message = response.statusText;
    try { const body = await response.json(); message = body?.message || body?.error?.code || message; } catch { /* use statusText */ }
    throw new Error(`完成上传失败: ${message}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 获取上传状态
 */
export async function getUploadStatus(uploadId: string): Promise<{
  upload_id: string;
  completed_chunks: number[];
  total_chunks: number;
  status: string;
}> {
  const response = await fetch(`/api/v1/materials/upload/status/${uploadId}`);
  if (!response.ok) {
    throw new Error(`获取状态失败: ${response.statusText}`);
  }
  const result = await response.json();
  return result.data;
}

/**
 * 分片上传主函数
 * 支持断点续传
 */
export async function chunkedUpload(
  file: File,
  productId: string,
  type: 'IMAGE' | 'VIDEO',
  options?: {
    chunkSize?: number;
    onProgress?: (progress: number, loadedBytes: number, totalBytes: number) => void;
    signal?: AbortSignal;
    remark?: string;
    auto_recognize_product?: boolean;
    reference_material_id?: string;
    reference_category?: string;
  },
): Promise<{
  material_id: string;
  file_name: string;
  status: string;
  thumbnail_url?: string;
  dense_caption?: string;
  tags?: string[];
}> {
  const chunkSize = options?.chunkSize || 5 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / chunkSize);

  // 检查是否有未完成的上传
  const storageKey = `${file.name}_${file.size}`;
  let uploadId: string;
  let completedChunks: Set<number>;

  const savedState = loadUploadState(storageKey);
  if (savedState && savedState.status === 'paused') {
    // 恢复前先验证服务器端的上传状态是否仍有效
    try {
      const status = await getUploadStatus(savedState.uploadId);
      if (status) {
        uploadId = savedState.uploadId;
        completedChunks = savedState.completedChunks;
        console.log(`[ChunkedUpload] Resuming upload ${uploadId}, ${completedChunks.size}/${totalChunks} chunks completed, server confirms ${status.completed_chunks.length}/${status.total_chunks}`);
      } else {
        throw new Error('Server returned null status');
      }
    } catch {
      // 服务器端的上传已失效（被清理或不存在），清除本地状态并重新开始
      console.log(`[ChunkedUpload] Saved upload ${savedState.uploadId} invalid on server, starting fresh`);
      clearUploadState(storageKey);
      const initResult = await initChunkedUpload(file, productId, type, { remark: options?.remark, auto_recognize_product: options?.auto_recognize_product, reference_material_id: options?.reference_material_id, reference_category: options?.reference_category });
      uploadId = initResult.uploadId;
      completedChunks = new Set();
      console.log(`[ChunkedUpload] New upload ${uploadId}, ${totalChunks} chunks`);
    }
  } else {
    // 创建新上传
    const initResult = await initChunkedUpload(file, productId, type, { remark: options?.remark, auto_recognize_product: options?.auto_recognize_product, reference_material_id: options?.reference_material_id, reference_category: options?.reference_category });
    uploadId = initResult.uploadId;
    completedChunks = new Set();
    console.log(`[ChunkedUpload] New upload ${uploadId}, ${totalChunks} chunks`);
  }

  // 保存状态
  saveUploadState(storageKey, {
    uploadId,
    fileName: file.name,
    fileSize: file.size,
    chunkSize,
    totalChunks,
    completedChunks,
    status: 'uploading',
  });

  try {
    // 上传未完成的分片
    for await (const { chunk, index } of chunkGenerator(file, chunkSize)) {
      // 检查是否已取消
      if (options?.signal?.aborted) {
        throw new DOMException('Upload cancelled', 'AbortError');
      }

      // 跳过已完成的分片
      if (completedChunks.has(index)) {
        console.log(`[ChunkedUpload] Skipping chunk ${index} (already uploaded)`);
        continue;
      }

      // 上传分片
      await uploadChunk(uploadId, index, chunk, { signal: options?.signal });
      completedChunks.add(index);

      // 更新进度
      const progress = (completedChunks.size / totalChunks) * 100;
      const loadedBytes = Math.min(completedChunks.size * chunkSize, file.size);
      options?.onProgress?.(progress, loadedBytes, file.size);

      // 更新保存状态
      saveUploadState(storageKey, {
        uploadId,
        fileName: file.name,
        fileSize: file.size,
        chunkSize,
        totalChunks,
        completedChunks,
        status: 'uploading',
      });
    }

    // 完成上传
    const result = await completeChunkedUpload(uploadId);

    // 清除保存状态
    clearUploadState(storageKey);

    return result;
  } catch (error) {
    // 保存状态为暂停
    saveUploadState(storageKey, {
      uploadId,
      fileName: file.name,
      fileSize: file.size,
      chunkSize,
      totalChunks,
      completedChunks,
      status: 'paused',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * 暂停上传（仅保存状态）
 */
export function pauseUpload(file: File): ChunkedUploadState | null {
  const storageKey = `${file.name}_${file.size}`;
  const state = loadUploadState(storageKey);
  if (state) {
    state.status = 'paused';
    saveUploadState(storageKey, state);
  }
  return state;
}

/**
 * 继续上传
 */
export function resumeUpload(
  file: File,
  productId: string,
  type: 'IMAGE' | 'VIDEO',
  options?: {
    onProgress?: (progress: number, loadedBytes: number, totalBytes: number) => void;
    signal?: AbortSignal;
  },
): Promise<{
  material_id: string;
  file_name: string;
  status: string;
}> {
  return chunkedUpload(file, productId, type, options);
}
