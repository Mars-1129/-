import type { SSEEventPayload, SSEEventType, TaskListQuery, TaskSummary } from '@tikstream/shared-types';
import { buildUrl, request } from './http';

export interface TaskListResponse {
  items: TaskSummary[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

export interface TaskStreamEvent {
  type: SSEEventType;
  payload: SSEEventPayload;
  last_event_id?: string;
}

export function listTasks(query: TaskListQuery): Promise<TaskListResponse> {
  return request<TaskListResponse>('/api/v1/tasks', { query });
}

export function getTask(taskId: string): Promise<TaskSummary> {
  return request<TaskSummary>(`/api/v1/tasks/${taskId}`);
}

export function softDeleteTask(taskId: string): Promise<{ task_id: string; deleted_at: string }> {
  return request(`/api/v1/tasks/${taskId}`, { method: 'DELETE' });
}

export function restoreTask(taskId: string): Promise<{ task_id: string }> {
  return request(`/api/v1/tasks/${taskId}/restore`, { method: 'POST' });
}

export function permanentDeleteTask(taskId: string): Promise<{ deleted: boolean }> {
  return request(`/api/v1/tasks/${taskId}/permanent`, { method: 'DELETE' });
}

export function batchSoftDeleteTasks(taskIds: string[]): Promise<{ deleted_count: number; skipped_count: number; skipped_task_ids: string[] }> {
  return request(`/api/v1/tasks/batch-delete?task_ids=${taskIds.map(encodeURIComponent).join(',')}`, { method: 'POST' });
}

export function listTrashTasks(query: TaskListQuery): Promise<TaskListResponse> {
  return request<TaskListResponse>('/api/v1/tasks/trash/list', { query });
}

export function emptyTrash(productId?: string): Promise<{ deleted_count: number }> {
  const query: Record<string, string> = {};
  if (productId) query.product_id = productId;
  return request('/api/v1/tasks/trash/empty', { method: 'DELETE', query });
}
export function subscribeTaskEvents(
  taskId: string,
  handlers: {
    onEvent: (event: TaskStreamEvent) => void;
    onError?: (event: Event) => void;
    onOpen?: (event: Event) => void;
  },
): () => void {
  const source = new EventSource(buildUrl(`/api/v1/tasks/${taskId}/events`));
  const eventTypes: SSEEventType[] = [
    'task.stage.changed',
    'task.progress.updated',
    'task.completed',
    'task.failed',
    'task.canceled',
    'shot.render.completed',
    'shot.render.failed',
    'heartbeat',
  ];

  const listeners = new Map<SSEEventType, (event: MessageEvent) => void>();
  let terminalReceived = false; // 收到终态事件后不再将连接关闭视为异常

  for (const type of eventTypes) {
    const listener = (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as SSEEventPayload;
      // 标记终态事件：服务器主动结束流是预期行为
      if (type === 'task.completed' || type === 'task.failed' || type === 'task.canceled') {
        terminalReceived = true;
      }
      handlers.onEvent({
        type,
        payload,
        last_event_id: event.lastEventId || undefined,
      });
    };

    listeners.set(type, listener);
    source.addEventListener(type, listener as EventListener);
  }

  source.onopen = handlers.onOpen ?? null;
  source.onerror = (event) => {
    // 已收到终态事件，连接关闭是服务器预期行为，不触发错误回调
    if (terminalReceived) return;
    // EventSource 在连接正常关闭时 readyState 为 CLOSED，也不触发错误
    if (source.readyState === EventSource.CLOSED) return;
    // EventSource 内置自动重连时 readyState 为 CONNECTING，不需上层再触发重连
    if (source.readyState === EventSource.CONNECTING) return;
    handlers.onError?.(event);
  };

  return () => {
    for (const [type, listener] of listeners.entries()) {
      source.removeEventListener(type, listener as EventListener);
    }
    source.close();
  };
}
