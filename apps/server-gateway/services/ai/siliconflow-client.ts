/**
 * SiliconFlow (硅基流动) 通用 HTTP 客户端
 *
 * Base URL: https://api.siliconflow.cn/v1
 * Auth: Bearer Token (OpenAI 兼容格式)
 * 支持 TTS / Chat Completions / Embeddings 等端点
 */

import { env } from '../../src/common/env';

const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';

let cachedApiKey: string | null = null;

export function getSiliconFlowApiKey(): string {
  if (cachedApiKey !== null) return cachedApiKey;
  cachedApiKey = env('SILICONFLOW_API_KEY') || '';
  return cachedApiKey;
}

export function clearSiliconFlowApiKeyCache(): void {
  cachedApiKey = null;
}

export interface SiliconFlowRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** SSE streaming mode */
  stream?: boolean;
}

export interface SiliconFlowResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  headers: Headers;
}

export class SiliconFlowApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SiliconFlowApiError';
    this.status = status;
  }
}

/**
 * 通用请求方法
 */
export async function siliconFlowRequest<T = unknown>(
  path: string,
  options: SiliconFlowRequestOptions = {},
): Promise<SiliconFlowResponse<T>> {
  const apiKey = getSiliconFlowApiKey();
  if (!apiKey) {
    throw new SiliconFlowApiError('SILICONFLOW_API_KEY is not configured', 401);
  }

  const { method = 'POST', body, headers: extraHeaders, timeoutMs = 60_000, stream = false } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SILICONFLOW_BASE_URL}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new SiliconFlowApiError(`HTTP ${response.status}: ${errorText}`, response.status);
    }

    // For binary responses (TTS audio), return the raw response
    if (stream) {
      // For streaming, return the response for caller to handle
      return { ok: true, status: response.status, data: response as unknown as T, headers: response.headers };
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json() as T;
      return { ok: true, status: response.status, data: json, headers: response.headers };
    }

    // Binary or text response
    const data = (contentType.includes('audio/') ? response : await response.text()) as unknown as T;
    return { ok: true, status: response.status, data, headers: response.headers };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Rate-limited request with retry
 */
export async function siliconFlowRequestWithRetry<T = unknown>(
  path: string,
  options: SiliconFlowRequestOptions = {},
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<SiliconFlowResponse<T>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await siliconFlowRequest<T>(path, options);
    } catch (error) {
      lastError = error as Error;

      if (error instanceof SiliconFlowApiError) {
        // Don't retry 4xx errors (except 429)
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[SiliconFlow] Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${lastError.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError
    ? new SiliconFlowApiError(`Request failed after ${maxRetries} retries: ${lastError.message}`, 0)
    : new SiliconFlowApiError('Request failed after retries', 0);
}
