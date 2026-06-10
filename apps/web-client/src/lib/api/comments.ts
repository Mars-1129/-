import type {
  AnalyzeCommentsRequest,
  BatchAnalyzeResponse,
  CommentListQuery,
  CommentResponse,
  CommentSentimentSummary,
  FetchCommentsRequest,
  FetchCommentsResponse,
  OptimizationRecordResponse,
  OptimizationResponse,
  OptimizeContentRequest,
} from '@tikstream/shared-types';
import { request } from './http';

/** POST /api/v1/comments/fetch — 从平台采集评论 */
export function fetchComments(body: FetchCommentsRequest): Promise<FetchCommentsResponse> {
  return request<FetchCommentsResponse>('/api/v1/comments/fetch', { method: 'POST', body });
}

/** GET /api/v1/comments — 查询评论列表 */
export function listComments(query: CommentListQuery): Promise<{ items: CommentResponse[]; next_cursor?: string; total?: number }> {
  return request<{ items: CommentResponse[]; next_cursor?: string; total?: number }>('/api/v1/comments', { query });
}

/** POST /api/v1/comments/analyze — 批量分析评论情感 */
export function analyzeComments(body: AnalyzeCommentsRequest): Promise<BatchAnalyzeResponse> {
  return request<BatchAnalyzeResponse>('/api/v1/comments/analyze', { method: 'POST', body });
}

/** POST /api/v1/comments/analyze — 带 SSE 进度回调的批量分析 */
export function analyzeCommentsWithProgress(
  body: AnalyzeCommentsRequest,
  onProgress: (event: { phase: string; stage: string; message: string; current: number; total: number }) => void,
): Promise<BatchAnalyzeResponse> {
  return new Promise((resolve, reject) => {
    fetch('/api/v1/comments/analyze/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          reject(new Error(`HTTP ${response.status}: ${text}`));
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          reject(new Error('Response body is not readable'));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === 'progress') {
                  onProgress(data);
                } else if (eventType === 'result') {
                  resolve(data as BatchAnalyzeResponse);
                } else if (eventType === 'error') {
                  reject(new Error((data as { message?: string }).message || '分析失败'));
                }
              } catch {
                // skip
              }
              eventType = '';
            }
          }
        }
      })
      .catch((err) => reject(err));
  });
}

/** GET /api/v1/comments/analysis/:productId — 获取情感分析摘要 */
export function getAnalysisSummary(productId: string): Promise<CommentSentimentSummary> {
  return request<CommentSentimentSummary>(`/api/v1/comments/analysis/${encodeURIComponent(productId)}`);
}

/** POST /api/v1/comments/optimize — 基于评论触发内容优化 */
export function triggerOptimization(body: OptimizeContentRequest): Promise<OptimizationResponse> {
  return request<OptimizationResponse>('/api/v1/comments/optimize', { method: 'POST', body });
}

/** POST /api/v1/comments/optimize/stream — 带 SSE 进度回调的优化触发 */
export function triggerOptimizationWithProgress(
  body: OptimizeContentRequest,
  onProgress: (event: { step: string; message: string; progress: number; data?: unknown }) => void,
): Promise<OptimizationResponse> {
  const controller = new AbortController();
  // 90s 超时，防止 API 不可达时前端永久挂起
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  return new Promise((resolve, reject) => {
    fetch('/api/v1/comments/optimize/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          reject(new Error(`HTTP ${response.status}: ${text}`));
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          reject(new Error('Response body is not readable'));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === 'connected') {
                  // SSE 连接建立确认，用于前端显示连接状态
                  onProgress({ step: 'connected', message: data.message || '连接已建立', progress: 0 });
                } else if (eventType === 'progress') {
                  onProgress(data);
                } else if (eventType === 'result') {
                  resolve(data as OptimizationResponse);
                } else if (eventType === 'error') {
                  reject(new Error((data as { message?: string }).message || '优化失败'));
                }
              } catch {
                // skip
              }
              eventType = '';
            }
          }
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          reject(new Error('优化请求超时（90s），请检查 AI 服务是否可用'));
        } else {
          reject(err);
        }
      });
  });
}

/** GET /health/ai — 检查 AI API 可用性 */
export function checkAiHealth(): Promise<{ status: string; ok: boolean; message: string; configured: boolean }> {
  return request<{ status: string; ok: boolean; message: string; configured: boolean }>('/health/ai');
}

/** GET /api/v1/comments/optimizations — 查询优化历史 */
export function listOptimizations(productId: string): Promise<OptimizationRecordResponse[]> {
  return request<OptimizationRecordResponse[]>('/api/v1/comments/optimizations', {
    query: { product_id: productId },
  });
}

/** POST /api/v1/comments/optimizations/:id/apply — 手动应用优化 */
export function applyOptimization(id: string): Promise<OptimizationRecordResponse> {
  return request<OptimizationRecordResponse>(`/api/v1/comments/optimizations/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
  });
}

/** POST /api/v1/comments/optimizations/:id/rollback — 回滚优化 */
export function rollbackOptimization(id: string): Promise<OptimizationRecordResponse> {
  return request<OptimizationRecordResponse>(`/api/v1/comments/optimizations/${encodeURIComponent(id)}/rollback`, {
    method: 'POST',
  });
}
