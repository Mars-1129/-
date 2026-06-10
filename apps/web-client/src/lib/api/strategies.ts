import type {
  AssignTemplateStrategiesRequest,
  CreateStrategyRequest,
  Strategy,
  UpdateStrategyRequest,
} from '@tikstream/shared-types';
import { request } from './http';

export function listStrategies(query?: { category?: string; keyword?: string }): Promise<Strategy[]> {
  return request<Strategy[]>('/api/v1/strategies', { method: 'GET', query });
}

export function createStrategy(body: CreateStrategyRequest): Promise<Strategy> {
  return request<Strategy>('/api/v1/strategies', { method: 'POST', body });
}

export function getStrategy(strategyId: string): Promise<Strategy> {
  return request<Strategy>(`/api/v1/strategies/${encodeURIComponent(strategyId)}`);
}

export function updateStrategy(strategyId: string, body: UpdateStrategyRequest): Promise<Strategy> {
  return request<Strategy>(`/api/v1/strategies/${encodeURIComponent(strategyId)}`, { method: 'PATCH', body });
}

export function deleteStrategy(strategyId: string): Promise<{ strategy_id: string; deleted: boolean }> {
  return request<{ strategy_id: string; deleted: boolean }>(`/api/v1/strategies/${encodeURIComponent(strategyId)}`, { method: 'DELETE' });
}

export function assignTemplateStrategies(templateId: string, body: AssignTemplateStrategiesRequest): Promise<{ template_id: string; assigned: number }> {
  return request<{ template_id: string; assigned: number }>(`/api/v1/templates/${encodeURIComponent(templateId)}/strategies`, { method: 'PUT', body });
}

export function getTemplateStrategies(templateId: string): Promise<Strategy[]> {
  return request<Strategy[]>(`/api/v1/templates/${encodeURIComponent(templateId)}/strategies`);
}
