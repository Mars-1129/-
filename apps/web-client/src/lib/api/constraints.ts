import type {
  AssignTemplateConstraintsRequest,
  Constraint,
  CreateConstraintRequest,
  UpdateConstraintRequest,
} from '@tikstream/shared-types';
import { request } from './http';

export function listConstraints(query?: { category?: string; rule_type?: string; keyword?: string }): Promise<Constraint[]> {
  return request<Constraint[]>('/api/v1/constraints', { method: 'GET', query });
}

export function createConstraint(body: CreateConstraintRequest): Promise<Constraint> {
  return request<Constraint>('/api/v1/constraints', { method: 'POST', body });
}

export function getConstraint(constraintId: string): Promise<Constraint> {
  return request<Constraint>(`/api/v1/constraints/${encodeURIComponent(constraintId)}`);
}

export function updateConstraint(constraintId: string, body: UpdateConstraintRequest): Promise<Constraint> {
  return request<Constraint>(`/api/v1/constraints/${encodeURIComponent(constraintId)}`, { method: 'PATCH', body });
}

export function deleteConstraint(constraintId: string): Promise<{ constraint_id: string; deleted: boolean }> {
  return request<{ constraint_id: string; deleted: boolean }>(`/api/v1/constraints/${encodeURIComponent(constraintId)}`, { method: 'DELETE' });
}

export function assignTemplateConstraints(templateId: string, body: AssignTemplateConstraintsRequest): Promise<{ template_id: string; assigned: number }> {
  return request<{ template_id: string; assigned: number }>(`/api/v1/templates/${encodeURIComponent(templateId)}/constraints`, { method: 'PUT', body });
}

export function getTemplateConstraints(templateId: string): Promise<Constraint[]> {
  return request<Constraint[]>(`/api/v1/templates/${encodeURIComponent(templateId)}/constraints`);
}
