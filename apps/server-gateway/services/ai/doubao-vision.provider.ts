// =============================================================================
// TikStream AI — Doubao Vision Provider
// 火山引擎方舟多模态视觉模型调用 (需求2: 自动从图像内容提取商品维度)
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { SCRIPT_CONSTANTS } from '../../src/script/script.constants';
import { arkApiKey, arkBaseUrl, env } from '../../src/common/env';

export interface DoubaoVisionResponse {
  success: boolean;
  result?: string;
  error?: string;
  requestId?: string;
}

@Injectable()
export class DoubaoVisionProvider {
  private readonly logger = new Logger(DoubaoVisionProvider.name);

  private tokenBucket: number = SCRIPT_CONSTANTS.RATE_LIMIT.DOUBAO_TEXT_RPM;
  private lastRefillTime: number = Date.now();
  private readonly refillInterval = 60 * 1000;
  // Promise 链式锁，确保 acquireToken 串行执行，消除并发竞态条件
  private acquireMutex: Promise<void> = Promise.resolve();

  /**
   * 调用 Doubao Vision 模型分析图片内容
   * @param imageUrl 图片 URL (MinIO 公开 URL)
   * @param prompt 分析提示词
   */
  async analyzeImage(imageUrl: string, prompt: string): Promise<string> {
    if (!imageUrl) {
      throw new Error('imageUrl is required for vision analysis');
    }

    await this.acquireToken();

    try {
      const response = await this.callVisionApi(imageUrl, prompt);

      if (!response.success) {
        this.logger.error(`Doubao Vision API call failed: ${response.error}`);
        const err = new Error(response.error || '视觉 AI 模型服务调用失败') as Error & { code?: string };
        err.code = 'MODEL_PROVIDER_FAILED';
        throw err;
      }

      return response.result || '';
    } catch (e) {
      // API 调用失败，释放已消耗的 token
      this.tokenBucket++;
      throw e;
    }
  }

  private async acquireToken(): Promise<void> {
    const prev = this.acquireMutex;
    let release!: () => void;
    this.acquireMutex = new Promise<void>((resolve) => { release = resolve; });

    await prev;

    try {
      const now = Date.now();
      const timeSinceRefill = now - this.lastRefillTime;

      if (timeSinceRefill >= this.refillInterval) {
        this.tokenBucket = SCRIPT_CONSTANTS.RATE_LIMIT.DOUBAO_TEXT_RPM;
        this.lastRefillTime = now;
      }

      if (this.tokenBucket <= 0) {
        const waitTime = this.refillInterval - timeSinceRefill;
        this.logger.warn(`Vision rate limit exceeded, waiting ${waitTime}ms`);
        await this.delay(waitTime);
        this.tokenBucket = SCRIPT_CONSTANTS.RATE_LIMIT.DOUBAO_TEXT_RPM;
        this.lastRefillTime = Date.now();
      }

      this.tokenBucket--;
    } finally {
      release();
    }
  }

  private async callVisionApi(
    imageUrl: string,
    prompt: string,
    attempt: number = 1,
  ): Promise<DoubaoVisionResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, SCRIPT_CONSTANTS.RATE_LIMIT.TIMEOUT_MS);

      try {
        const apiKey = arkApiKey();
        const apiUrl = arkBaseUrl();
        // doubao-1.5-vision-pro-32k 用于多模态视觉分析
        const model = env('ARK_VISION_MODEL', 'VOLC_ARK_VISION_MODEL', 'doubao-1-5-vision-pro-32k');

        if (!apiKey) {
          return {
            success: false,
            error: 'ARK_API_KEY is required for Doubao Vision analysis',
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
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: imageUrl } },
                  { type: 'text', text: prompt },
                ],
              },
            ],
            max_tokens: 4096,
            temperature: 0.3,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429 && attempt < SCRIPT_CONSTANTS.RATE_LIMIT.MAX_RETRY_ATTEMPTS) {
            const retryDelay = SCRIPT_CONSTANTS.RATE_LIMIT.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            this.logger.warn(`Vision rate limited, retrying in ${retryDelay}ms (attempt ${attempt})`);
            await this.delay(retryDelay);
            return this.callVisionApi(imageUrl, prompt, attempt + 1);
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
        if (attempt < SCRIPT_CONSTANTS.RATE_LIMIT.MAX_RETRY_ATTEMPTS) {
          this.logger.warn(`Vision request timeout, retrying (attempt ${attempt})`);
          await this.delay(SCRIPT_CONSTANTS.RATE_LIMIT.RETRY_DELAY_MS * Math.pow(2, attempt - 1));
          return this.callVisionApi(imageUrl, prompt, attempt + 1);
        }
        return {
          success: false,
          error: 'Request timed out',
        };
      }

      if (attempt < SCRIPT_CONSTANTS.RATE_LIMIT.MAX_RETRY_ATTEMPTS) {
        this.logger.warn(`Vision network error, retrying (attempt ${attempt}): ${error}`);
        await this.delay(SCRIPT_CONSTANTS.RATE_LIMIT.RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        return this.callVisionApi(imageUrl, prompt, attempt + 1);
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
}
