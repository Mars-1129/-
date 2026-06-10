import { request, buildUrl, ApiClientError } from './http';

export interface MaterialListItem {
  material_id: string;
  file_name: string;
  type: string;
  source_type: string;
  status: string;
  origin_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number;
  slices_count: number;
  product_title: string;
  product_category: string;
  referenced_material_id?: string | null;
  reference_category?: string | null;
  created_at: string;
}

export interface CursorPageInfo {
  cursor: string | null;
  has_more: boolean;
  total_count: number;
}

export interface MaterialListResponse {
  items: MaterialListItem[];
  page_info: CursorPageInfo;
}

export interface MaterialDetailItem {
  material_id: string;
  product_id: string;
  file_name: string;
  type: string;
  source_type: string;
  origin_url: string;
  thumbnail_url: string | null;
  file_size_bytes: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  status: string;
  slices_count: number;
  remark: string | null;
  vision_analysis?: VisionAnalysisResult | null;
  referenced_material_id?: string | null;
  reference_category?: string | null;
  created_at: string;
  updated_at: string;
  product: {
    id: string;
    title: string;
    category: string;
    selling_points: string[];
  } | null;
}

export interface MaterialDetailSlice {
  id: string;
  material_id: string;
  slice_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  dense_caption: string | null;
  tags: string[];
  stream_url: string | null;
  key_frame_url: string | null;
  embedding_version: string | null;
  sfx_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MaterialDetailResponse {
  material: MaterialDetailItem;
  slices: MaterialDetailSlice[];
}

export interface MaterialSliceSearchResult extends MaterialDetailSlice {
  score: number | null;
  file_name?: string;
  type?: string;
}

export interface MaterialSearchResponse {
  items: MaterialSliceSearchResult[];
  page_info: CursorPageInfo;
  search_source: string;
}

export interface MaterialUploadResponse {
  material_id: string;
  product_id: string;
  file_name: string;
  type: string;
  source_type: string;
  status: string;
  thumbnail_url?: string;
  file_size_bytes: number;
  async_task_id: string;
  /** AI 生成的稠密描述 (图片上传时同步返回，视频上传时初始为空) */
  dense_caption?: string;
  /** AI 生成的标签 (图片上传时同步返回，视频上传时初始为空) */
  tags?: string[];
  created_at: string;
}

export interface MaterialReprocessResponse {
  material_id: string;
  task_id: string;
  status: string;
}

export function listMaterials(query: {
  product_id: string;
  type?: string;
  status?: string;
  keyword?: string;
  limit?: number;
  cursor?: string;
}): Promise<MaterialListResponse> {
  return request<MaterialListResponse>('/api/v1/materials', {
    query,
    raw: true,
  });
}

export function getMaterialDetail(materialId: string): Promise<MaterialDetailResponse> {
  return request<MaterialDetailResponse>(`/api/v1/materials/${materialId}`, { raw: true });
}

export function deleteMaterial(materialId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/v1/materials/${materialId}`, {
    method: 'DELETE',
    raw: true,
  });
}

export function reprocessMaterial(materialId: string): Promise<MaterialReprocessResponse> {
  return request<MaterialReprocessResponse>(`/api/v1/materials/${materialId}/reprocess`, {
    method: 'POST',
    raw: true,
  });
}

// 回收站功能
export function listTrashMaterials(query: {
  product_id: string;
  limit?: number;
  cursor?: string;
}): Promise<MaterialListResponse> {
  return request<MaterialListResponse>('/api/v1/materials/trash', {
    query,
    raw: true,
  });
}

export function restoreMaterial(materialId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/v1/materials/${materialId}/restore`, {
    method: 'POST',
    raw: true,
  });
}

export function permanentDeleteMaterial(materialId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/v1/materials/${materialId}/permanent`, {
    method: 'DELETE',
    raw: true,
  });
}

export interface VisionAnalysisResult {
  product_features: string[];
  visual_selling_points: string[];
  shot_suggestions: Array<{
    shot_type: string;
    description: string;
    priority: number;
  }>;
  style_tags: string[];
  quality_assessment: {
    clarity: 'high' | 'medium' | 'low';
    lighting: string;
    composition: string;
  };
}

export function analyzeMaterialVision(materialId: string): Promise<VisionAnalysisResult> {
  return request<VisionAnalysisResult>(`/api/v1/materials/${materialId}/vision-analyze`, {
    method: 'POST',
    raw: true,
  });
}

export function searchMaterialSlices(body: {
  product_id: string;
  query: string;
  type?: string;
  status?: string;
  min_duration?: number;
  max_duration?: number;
  search_mode?: string;
  strictness?: string;
  granularity?: string;
  limit?: number;
}): Promise<MaterialSearchResponse> {
  return request<MaterialSearchResponse>('/api/v1/materials/search', {
    method: 'POST',
    body,
    raw: true,
  });
}

export function uploadMaterial(params: {
  file: File;
  product_id?: string;
  type: 'IMAGE' | 'VIDEO' | 'PRODUCT_MAIN_IMAGE';
  source_type?: 'UPLOAD' | 'REFERENCE' | 'GENERATED';
  remark?: string;
  auto_recognize_product?: boolean;
  reference_material_id?: string;
  reference_category?: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}): Promise<MaterialUploadResponse> {
  const form = new FormData();
  form.append('file', params.file);
  if (params.product_id) {
    form.append('product_id', params.product_id);
  }
  if (params.auto_recognize_product) {
    form.append('auto_recognize_product', 'true');
  }
  form.append('type', params.type);
  if (params.source_type) {
    form.append('source_type', params.source_type);
  }
  if (params.remark) {
    form.append('remark', params.remark);
  }
  if (params.reference_material_id) {
    form.append('reference_material_id', params.reference_material_id);
  }
  if (params.reference_category) {
    form.append('reference_category', params.reference_category);
  }

  return new Promise<MaterialUploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl('/api/v1/materials/upload'));

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !params.onProgress) {
        return;
      }
      params.onProgress(Math.round((event.loaded / event.total) * 100));
    });

    xhr.onerror = () => reject(new ApiClientError('网络错误', 0));
    xhr.onabort = () => reject(new ApiClientError('请求已取消', 0));
    xhr.onload = () => {
      const payload = xhr.responseText ? (JSON.parse(xhr.responseText) as unknown) : null;
      if (xhr.status >= 200 && xhr.status < 300) {
        // 提取 API 信封中的 data 字段（与 chunkedUpload 保持一致）
        const data = payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)
          ? (payload as Record<string, unknown>).data
          : payload;
        resolve(data as MaterialUploadResponse);
        return;
      }

      const message =
        payload && typeof payload === 'object' && 'message' in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).message)
          : `HTTP ${xhr.status}`;
      reject(new ApiClientError(message, xhr.status));
    };

    if (params.signal) {
      params.signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.send(form);
  });
}
