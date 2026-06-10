import type {
  AssignTemplateFactorsRequest,
  ClusterTemplatesRequest,
  ClusterTemplatesResponse,
  CreateFactorRequest,
  CreateTemplateRequest,
  Factor,
  FactorCategory,
  PaginatedData,
  Script,
  ScriptTemplateGenerateRequest,
  Template,
  TemplateDetail,
  TemplateFactorAssignment,
  UpdateFactorRequest,
  UpdateTemplateRequest,
} from '@tikstream/shared-types';
import { request } from './http';

export function listTemplates(query: {
  page?: number;
  page_size?: number;
  category?: string;
  status?: string;
  keyword?: string;
  sort_by?: string;
  sort_order?: string;
} = {}): Promise<PaginatedData<Template>> {
  return request<PaginatedData<Template>>('/api/v1/templates', {
    query: {
      page: query.page ?? 1,
      page_size: query.page_size ?? 100,
      category: query.category || undefined,
      status: query.status || undefined,
      keyword: query.keyword || undefined,
      sort_by: query.sort_by || undefined,
      sort_order: query.sort_order || undefined,
    },
  });
}

export function getTemplate(templateId: string): Promise<TemplateDetail> {
  return request<TemplateDetail>(`/api/v1/templates/${templateId}`);
}

export function createTemplate(body: CreateTemplateRequest): Promise<Template> {
  return request<Template>('/api/v1/templates', {
    method: 'POST',
    body,
  });
}

export function updateTemplate(
  templateId: string,
  body: UpdateTemplateRequest,
): Promise<Template> {
  return request<Template>(`/api/v1/templates/${templateId}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteTemplate(templateId: string): Promise<{ template_id: string; deleted: boolean }> {
  return request<{ template_id: string; deleted: boolean }>(`/api/v1/templates/${templateId}`, {
    method: 'DELETE',
  });
}

export function applyTemplate(
  templateId: string,
  body: ScriptTemplateGenerateRequest,
): Promise<Script> {
  return request<Script>(`/api/v1/templates/${templateId}/apply`, {
    method: 'POST',
    body,
  });
}

export function clusterTemplates(
  body: ClusterTemplatesRequest,
): Promise<ClusterTemplatesResponse> {
  return request<ClusterTemplatesResponse>('/api/v1/templates/cluster', {
    method: 'POST',
    body,
  });
}

export function listFactors(query?: { category?: FactorCategory; keyword?: string }): Promise<Factor[]> {
  return request<Factor[]>('/api/v1/factors', { method: 'GET', query });
}

export function createFactor(body: CreateFactorRequest): Promise<Factor> {
  return request<Factor>('/api/v1/factors', { method: 'POST', body });
}

export function getFactor(factorId: string): Promise<Factor> {
  return request<Factor>(`/api/v1/factors/${encodeURIComponent(factorId)}`);
}

export function updateFactor(factorId: string, body: UpdateFactorRequest): Promise<Factor> {
  return request<Factor>(`/api/v1/factors/${encodeURIComponent(factorId)}`, { method: 'PATCH', body });
}

export function deleteFactor(factorId: string): Promise<{ factor_id: string; deleted: boolean }> {
  return request<{ factor_id: string; deleted: boolean }>(`/api/v1/factors/${encodeURIComponent(factorId)}`, { method: 'DELETE' });
}

export function assignTemplateFactors(templateId: string, body: AssignTemplateFactorsRequest): Promise<{ template_id: string; assigned: number }> {
  return request<{ template_id: string; assigned: number }>(`/api/v1/templates/${encodeURIComponent(templateId)}/factors`, { method: 'PUT', body });
}

export function getTemplateFactors(templateId: string): Promise<TemplateFactorAssignment[]> {
  return request<TemplateFactorAssignment[]>(`/api/v1/templates/${encodeURIComponent(templateId)}/factors`);
}
