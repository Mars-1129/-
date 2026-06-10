import type {
  CreateCreationRequest,
  CreateCreationResponse,
  Creation,
  CreationStage,
  CreationStatus,
  EngineMode,
  PreviewCompositionResponse,
  ReplaceSliceRequest,
  RerenderShotRequest,
  ShotRenderSummary,
  AudioMixConfig,
} from '@tikstream/shared-types';
import { request } from './http';

export interface CreationListResponse {
  items: Creation[];
  page_info: {
    cursor: string | null;
    has_more: boolean;
    total_count: number;
  };
}

export function createCreation(body: CreateCreationRequest): Promise<CreateCreationResponse> {
  return request<CreateCreationResponse>('/api/v1/creations', {
    method: 'POST',
    body,
  });
}

export function listCreations(query: {
  product_id: string;
  status?: CreationStatus;
  current_stage?: CreationStage;
  engine_mode?: EngineMode;
  export_format?: string;
  limit?: number;
  cursor?: string;
}): Promise<CreationListResponse> {
  return request<CreationListResponse>('/api/v1/creations', {
    query,
  });
}

export function getCreation(creationId: string): Promise<Creation> {
  return request<Creation>(`/api/v1/creations/${creationId}`);
}

export function getCreationPreview(creationId: string): Promise<PreviewCompositionResponse> {
  return request<PreviewCompositionResponse>(`/api/v1/creations/${creationId}/preview`);
}

export function exportCreation(creationId: string): Promise<CreateCreationResponse> {
  return request<CreateCreationResponse>(`/api/v1/creations/${creationId}/export`, {
    method: 'POST',
  });
}

export function rerenderCreationShot(
  creationId: string,
  body: RerenderShotRequest,
): Promise<ShotRenderSummary> {
  return request<ShotRenderSummary>(`/api/v1/creations/${creationId}/rerender-shot`, {
    method: 'POST',
    body,
  });
}

export function replaceCreationSlice(
  creationId: string,
  body: ReplaceSliceRequest,
): Promise<ShotRenderSummary> {
  return request<ShotRenderSummary>(`/api/v1/creations/${creationId}/replace-slice`, {
    method: 'POST',
    body,
  });
}

export function retryCreation(creationId: string): Promise<CreateCreationResponse> {
  return request<CreateCreationResponse>(`/api/v1/creations/${creationId}/retry`, {
    method: 'POST',
  });
}

export function restitchCreation(creationId: string, audioMixConfig?: AudioMixConfig): Promise<CreateCreationResponse> {
  return request<CreateCreationResponse>(`/api/v1/creations/${creationId}/restitch`, {
    method: 'POST',
    body: audioMixConfig ? { audio_mix_config: audioMixConfig } : undefined,
  });
}

export function cancelCreation(creationId: string): Promise<{ creation_id: string; status: 'CANCELED' }> {
  return request<{ creation_id: string; status: 'CANCELED' }>(`/api/v1/creations/${creationId}/cancel`, {
    method: 'POST',
  });
}

export interface CreationHealthResponse {
  seedance: { ok: boolean; message: string; configured: boolean };
  worker: { ok: boolean; message: string; queue_waiting: number };
  stuck?: { stuck_count: number; stuck_creation_ids: string[]; auto_failed_count: number };
}

export function getCreationHealth(productId?: string): Promise<CreationHealthResponse> {
  const query: Record<string, string> = {};
  if (productId) {
    query.product_id = productId;
  }
  return request<CreationHealthResponse>('/api/v1/creations/health', { query });
}

// ========== Creation Template API (Phase 2) ==========

export interface CreationTemplateItem {
  template_id: string;
  name: string;
  product_id?: string;
  script_id: string;
  preset_json: Record<string, unknown>;
  created_at: string;
}

export function saveAsTemplate(creationId: string, name: string): Promise<CreationTemplateItem> {
  return request<CreationTemplateItem>(`/api/v1/creations/${encodeURIComponent(creationId)}/save-as-template`, {
    method: 'POST',
    body: { name },
  });
}

export function listCreationTemplates(query?: { product_id?: string; page?: number; page_size?: number }): Promise<{
  items: CreationTemplateItem[];
  page: number;
  page_size: number;
  total: number;
}> {
  return request<{ items: CreationTemplateItem[]; page: number; page_size: number; total: number }>('/api/v1/creations/templates/list', { method: 'GET', query });
}

export function deleteCreationTemplate(templateId: string): Promise<{ template_id: string; deleted: boolean }> {
  return request<{ template_id: string; deleted: boolean }>(`/api/v1/creations/templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' });
}
