import type { ApiErrorResponse, ApiSuccessResponse } from '@tikstream/shared-types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function resolveBaseUrl(): string {
  if (API_BASE_URL) return API_BASE_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:5173';
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly retryable?: boolean,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function buildUrl(path: string, query?: object): string {
  const url = new URL(path, resolveBaseUrl());

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    if (response.ok) {
      return undefined; // 204/304 正常空响应
    }
    throw new ApiClientError(`Empty response body (HTTP ${response.status})`, response.status);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiClientError(`Invalid JSON response: ${text.slice(0, 100)}`, response.status);
  }
}

function isApiEnvelope<T>(payload: unknown): payload is ApiSuccessResponse<T> | ApiErrorResponse {
  return Boolean(payload) && typeof payload === 'object' && 'success' in (payload as Record<string, unknown>);
}

export async function request<T>(
  path: string,
  options: {
    method?: string;
    query?: object;
    body?: BodyInit | object | null;
    headers?: Record<string, string>;
    raw?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const { method = 'GET', query, body, headers, raw = false, signal } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  // 默认 2min 超时 (DNA 提取等长任务已通过 SSE 走流式通道)
  const timeoutController = new AbortController();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const timeoutId = setTimeout(() => timeoutController.abort(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
  const combinedSignal = signal
    ? (() => {
        const combined = new AbortController();
        signal.addEventListener('abort', () => combined.abort());
        timeoutController.signal.addEventListener('abort', () => combined.abort());
        return combined.signal;
      })()
    : timeoutController.signal;

  const response = await fetch(buildUrl(path, query), {
    method,
    body:
      body && !isFormData && typeof body === 'object'
        ? JSON.stringify(body)
        : (body as BodyInit | null | undefined),
    headers: {
      ...(isFormData ? {} : body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    signal: combinedSignal,
  });
  clearTimeout(timeoutId);

  const payload = await parseJson(response);

  if (raw) {
    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'message' in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).message)
          : `HTTP ${response.status}`;
      throw new ApiClientError(message, response.status);
    }

    return payload as T;
  }

  if (isApiEnvelope<T>(payload)) {
    if (payload.success) {
      return payload.data as T;
    }

    throw new ApiClientError(
      payload.message,
      response.status,
      payload.error.code,
      payload.error.retryable,
      payload.error.details,
    );
  }

  if (!response.ok) {
    throw new ApiClientError(`HTTP ${response.status}`, response.status);
  }

  return payload as T;
}
