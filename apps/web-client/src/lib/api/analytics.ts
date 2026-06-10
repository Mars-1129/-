import type {
  AbCompareQuery,
  AbCompareReportResponse,
  AudioVisualSankeyQuery,
  AudioVisualSankeyResponse,
  PerformancePrediction,
  RetentionCurveQuery,
  RetentionCurveResponse,
  SelfHealRequest,
  SelfHealResultResponse,
  StyleFactorHeatmapQuery,
  StyleFactorHeatmapResponse,
} from '@tikstream/shared-types';
import { request, resolveBaseUrl } from './http';

export function getRetentionCurve(query: RetentionCurveQuery): Promise<RetentionCurveResponse> {
  return request<RetentionCurveResponse>('/api/v1/analytics/retention-curve', { query });
}

export function getStyleFactors(query: StyleFactorHeatmapQuery): Promise<StyleFactorHeatmapResponse> {
  return request<StyleFactorHeatmapResponse>('/api/v1/analytics/style-factors', { query });
}

export function getAudioVisualSankey(query: AudioVisualSankeyQuery): Promise<AudioVisualSankeyResponse> {
  return request<AudioVisualSankeyResponse>('/api/v1/analytics/audio-visual-sankey', { query });
}

export function getAbCompare(query: AbCompareQuery): Promise<AbCompareReportResponse> {
  return request<AbCompareReportResponse>('/api/v1/analytics/ab-compare', { query });
}

export function postSelfHeal(body: SelfHealRequest): Promise<SelfHealResultResponse> {
  return request<SelfHealResultResponse>('/api/v1/analytics/self-heal', {
    method: 'POST',
    body,
  });
}

/** SSE 流式自愈诊断 —— 实时推送进度 + AI 生成建议 */
export interface SelfHealProgressEvent {
  type: 'progress' | 'ai_chunk' | 'done' | 'error';
  step?: string;
  message?: string;
  data?: unknown;
  result?: SelfHealResultResponse;
  trace_id?: string;
  timestamp?: string;
}

export function postSelfHealStream(
  params: {
    product_id: string;
    creation_id: string;
    trigger_source?: string;
    issue_type?: string;
    strategy?: string;
    dry_run?: boolean;
    target_shot_indexes?: number[];
  },
  onEvent: (event: SelfHealProgressEvent) => void,
  onError: (error: Error) => void,
  options?: { signal?: AbortSignal },
): { close: () => void } {
  const url = new URL('/api/v1/analytics/self-heal/stream', resolveBaseUrl());
  url.searchParams.set('product_id', params.product_id);
  url.searchParams.set('creation_id', params.creation_id);
  if (params.trigger_source) url.searchParams.set('trigger_source', params.trigger_source);
  if (params.issue_type) url.searchParams.set('issue_type', params.issue_type);
  if (params.strategy) url.searchParams.set('strategy', params.strategy);
  url.searchParams.set('dry_run', params.dry_run !== false ? 'true' : 'false');
  if (params.target_shot_indexes?.length) {
    url.searchParams.set('target_shot_indexes', params.target_shot_indexes.join(','));
  }

  const controller = new AbortController();
  const signal = options?.signal;

  // 如果外部传入 signal，联动取消
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  // 超时 180s（与服务端 120s 兜底 + AI 调用 30s 对齐，留足余量）
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 180_000);

  fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`SSE 连接失败: HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('浏览器不支持流式读取');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // 保留最后一个可能不完整的行
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6)) as SelfHealProgressEvent;
              onEvent(parsed);
            } catch {
              // 忽略解析失败的行
            }
          }
        }
      }

      // 处理最后的 buffer
      if (buffer.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(buffer.slice(6)) as SelfHealProgressEvent;
          onEvent(parsed);
        } catch {
          // ignore
        }
      }
    })
    .catch((err) => {
      if ((err as Error).name === 'AbortError') {
        if (timedOut) {
          onError(new Error('自愈诊断超时 (180s)，请稍后重试'));
        }
        // 外部主动 cancel 或组件卸载：静默
        return;
      }
      onError(err instanceof Error ? err : new Error(String(err)));
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });

  return {
    close: () => {
      controller.abort();
      clearTimeout(timeoutId);
    },
  };
}

/** POST /api/v1/analytics/predict-performance — 冷启动效果预测 */
export function predictPerformance(
  scriptId: string, 
  productId: string, 
  forceSource?: 'LLM' | 'DUCKDB' | 'VIRAL_DNA' | 'HEURISTIC',
): Promise<PerformancePrediction> {
  return request<PerformancePrediction>(
    '/api/v1/analytics/predict-performance',
    { method: 'POST', body: { script_id: scriptId, product_id: productId, force_source: forceSource } },
  );
}

/** SSE /api/v1/analytics/predict-performance/stream — 流式冷启动预测（实时进度） */
export function predictPerformanceStream(
  scriptId: string,
  productId: string,
  onProgress: (event: { type: 'progress' | 'done' | 'error'; step?: string; message?: string; data?: unknown; result?: PerformancePrediction; trace_id?: string }) => void,
  signal?: AbortSignal,
): Promise<PerformancePrediction> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;

  // 构建 URL
  const params = new URLSearchParams({ script_id: scriptId });
  if (productId) params.set('product_id', productId);

  const url = `${baseUrl}/api/v1/analytics/predict-performance/stream?${params.toString()}`;

  return new Promise<PerformancePrediction>((resolve, reject) => {
    fetch(url, { signal }).then(async (response) => {
      if (!response.ok) {
        reject(new Error(`SSE connection failed: ${response.status}`));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        reject(new Error('No reader available'));
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

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const event = JSON.parse(jsonStr);
              onProgress(event);

              if (event.type === 'done' && event.result) {
                resolve(event.result);
              } else if (event.type === 'error') {
                reject(new Error(event.message || 'Prediction failed'));
              }
            } catch {
              // ignore parse errors for individual events
            }
          }
        }
      }
    }).catch(reject);
  });
}
