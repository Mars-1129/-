// =============================================================================
// TikStream AI — Doubao Text Provider
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { SCRIPT_CONSTANTS } from '../../src/script/script.constants';
import { arkApiKey, arkBaseUrl, env } from '../../src/common/env';

export interface DoubaoTextResponse {
  success: boolean;
  result?: string;
  error?: string;
  requestId?: string;
}

@Injectable()
export class DoubaoTextProvider {
  private readonly logger = new Logger(DoubaoTextProvider.name);

  // Bug 32: 将默认值提取为类常量，避免硬编码散落各处
  private static readonly DEFAULT_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  private static readonly DEFAULT_MODEL = 'doubao-seed-2-0-pro';

  private readonly apiUrl: string;
  private readonly model: string;

  private tokenBucket: number = SCRIPT_CONSTANTS.RATE_LIMIT.DOUBAO_TEXT_RPM;
  private lastRefillTime: number = Date.now();
  private readonly refillInterval = 60 * 1000;
  // Bug 31: Promise 链式锁，确保 acquireToken 串行执行，消除竞态条件
  private acquireMutex: Promise<void> = Promise.resolve();

  constructor() {
    this.apiUrl = arkBaseUrl();
    this.model = env('ARK_DOUBAO_PRO_ENDPOINT', 'VOLC_ARK_DOUBAO_PRO_ENDPOINT', DoubaoTextProvider.DEFAULT_MODEL);

    if (!env('ARK_BASE_URL', 'VOLC_ARK_API_URL') && !env('ARK_BASE_URL', 'DOUBAO_API_URL')) {
      this.logger.warn(`No ARK_BASE_URL/VOLC_ARK_API_URL/DOUBAO_API_URL configured, using default: ${this.apiUrl}`);
    }
    if (!env('ARK_DOUBAO_PRO_ENDPOINT', 'VOLC_ARK_DOUBAO_PRO_ENDPOINT')) {
      this.logger.warn(`No ARK_DOUBAO_PRO_ENDPOINT/VOLC_ARK_DOUBAO_PRO_ENDPOINT configured, using default: ${this.model}`);
    }
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    maxTokens?: number,
    options?: { timeoutMs?: number; maxRetries?: number; temperature?: number },
  ): Promise<string> {
    await this.acquireToken();

    let response: { success: boolean; result?: string; error?: string };
    try {
      response = await this.callDoubaoApi(
        systemPrompt,
        userPrompt,
        1,
        maxTokens,
        options?.timeoutMs,
        options?.maxRetries,
        options?.temperature,
      );
    } catch (e) {
      // 网络异常或 fetch 失败：请求未到达 API，释放已消耗的 token
      this.tokenBucket++;
      throw e;
    }

    if (!response.success) {
      // API 业务失败（4xx 内容过滤等）：请求已消耗服务端资源，不释放 token
      this.logger.error(`Doubao API call failed: ${response.error}`);
      const err = new Error(response.error || 'AI 模型服务调用失败') as Error & { code?: string };
      err.code = 'MODEL_PROVIDER_FAILED';
      throw err;
    }

    return response.result || '';
  }

  // 令牌桶获取最大等待时间：防止高并发下 mutex 链无限挂起
  private static readonly TOKEN_ACQUIRE_MAX_WAIT_MS = 60_000;

  private async acquireToken(): Promise<void> {
    const startTime = Date.now();
    while (true) {
      // 长时间无法获取令牌：抛出错误让调用方决定重试或降级
      if (Date.now() - startTime > DoubaoTextProvider.TOKEN_ACQUIRE_MAX_WAIT_MS) {
        throw new Error(`Token bucket acquire timeout after ${DoubaoTextProvider.TOKEN_ACQUIRE_MAX_WAIT_MS / 1000}s — too many concurrent AI requests`);
      }

      // 将当前操作串入 mutex 锁链，确保 acquireToken 不会并发执行
      const prev = this.acquireMutex;
      let release!: () => void;
      this.acquireMutex = new Promise<void>((resolve) => { release = resolve; });

      await prev; // 等待前一个 acquireToken 完成

      let waitMs = 0;
      try {
        const now = Date.now();
        const timeSinceRefill = now - this.lastRefillTime;

        if (timeSinceRefill >= this.refillInterval) {
          this.tokenBucket = SCRIPT_CONSTANTS.RATE_LIMIT.DOUBAO_TEXT_RPM;
          this.lastRefillTime = now;
        }

        if (this.tokenBucket > 0) {
          this.tokenBucket--;
          return;
        }
        waitMs = Math.max(1, this.refillInterval - timeSinceRefill);
      } finally {
        release(); // 释放锁，允许下一个请求进入
      }
      // 锁已释放，外部等待后重新竞争
      this.logger.warn(`Rate limit exceeded, waiting ${waitMs}ms`);
      // yield to event loop before waiting, prevent HTTP starvation under extreme concurrency
      await new Promise((r) => setImmediate(r));
      await this.delay(waitMs);
    }
  }

  private async callDoubaoApi(
    systemPrompt: string,
    userPrompt: string,
    attempt: number = 1,
    maxTokens: number = 8192,
    customTimeoutMs?: number,
    customMaxRetries?: number,
    customTemperature?: number,
  ): Promise<DoubaoTextResponse> {
    const effectiveTimeout = customTimeoutMs ?? SCRIPT_CONSTANTS.RATE_LIMIT.TIMEOUT_MS;
    const effectiveMaxRetries = customMaxRetries ?? SCRIPT_CONSTANTS.RATE_LIMIT.MAX_RETRY_ATTEMPTS;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort(new Error(`Doubao API timeout after ${effectiveTimeout}ms`));
      }, effectiveTimeout);

      try {
        const apiKey = arkApiKey();
        const apiUrl = this.apiUrl;
        const model = this.model;

        if (!apiKey) {
          return {
            success: false,
            error: 'VOLC_ARK_API_KEY is required for Doubao text generation',
          };
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: maxTokens,
            temperature: customTemperature ?? 0.7,
            top_p: 0.9,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 429 && attempt < effectiveMaxRetries) {
            const retryAfter = response.headers.get('Retry-After');
            const retryDelay = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : SCRIPT_CONSTANTS.RATE_LIMIT.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            this.logger.warn(`Rate limited, retrying in ${retryDelay}ms (attempt ${attempt})`);
            await this.delay(retryDelay);
            return this.callDoubaoApi(systemPrompt, userPrompt, attempt + 1, maxTokens, customTimeoutMs, customMaxRetries, customTemperature);
          }

          // 5xx 服务器临时故障也应重试，避免浪费 token / API 配额
          if (response.status >= 500 && attempt < effectiveMaxRetries) {
            const retryDelay = SCRIPT_CONSTANTS.RATE_LIMIT.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            this.logger.warn(`Server error ${response.status}, retrying in ${retryDelay}ms (attempt ${attempt})`);
            await this.delay(retryDelay);
            return this.callDoubaoApi(systemPrompt, userPrompt, attempt + 1, maxTokens, customTimeoutMs, customMaxRetries, customTemperature);
          }

          const errorText = await response.text();
          return {
            success: false,
            error: `HTTP ${response.status}: ${errorText}`,
          };
        }

        const data = await response.json();
        
        if (data.choices && data.choices.length > 0) {
          return {
            success: true,
            result: data.choices[0].message.content,
            requestId: data.id,
          };
        }

        return {
          success: false,
          error: 'API response missing choices',
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt < effectiveMaxRetries) {
          this.logger.warn(`Request timeout, retrying (attempt ${attempt})`);
          await this.delay(SCRIPT_CONSTANTS.RATE_LIMIT.RETRY_DELAY_MS * Math.pow(2, attempt - 1));
          return this.callDoubaoApi(systemPrompt, userPrompt, attempt + 1, maxTokens, customTimeoutMs, customMaxRetries, customTemperature);
        }
        return {
          success: false,
          error: 'Request timed out',
        };
      }

      if (attempt < effectiveMaxRetries) {
        this.logger.warn(`Network error, retrying (attempt ${attempt}): ${error}`);
        await this.delay(SCRIPT_CONSTANTS.RATE_LIMIT.RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        return this.callDoubaoApi(systemPrompt, userPrompt, attempt + 1, maxTokens, customTimeoutMs, customMaxRetries, customTemperature);
      }

      return {
        success: false,
        error: `Network error: ${error}`,
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Lightweight Doubao chat API reachability check for script health endpoint */
  async checkHealth(): Promise<{ ok: boolean; message: string; configured: boolean }> {
    const apiKey = arkApiKey();
    const configured = !!apiKey;

    if (!configured) {
      return { ok: false, message: 'ARK_API_KEY is not configured', configured: false };
    }

    try {
      const apiUrl = this.apiUrl;
      const model = this.model;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('Health check timeout')), 10_000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        return { ok: false, message: 'API rate-limited (HTTP 429)', configured: true };
      }

      if (response.ok) {
        return { ok: true, message: 'API reachable', configured: true };
      }

      const errorText = await response.text().catch(() => '');
      return {
        ok: false,
        message: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        configured: true,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `API connection failed: ${msg}`, configured: true };
    }
  }
}