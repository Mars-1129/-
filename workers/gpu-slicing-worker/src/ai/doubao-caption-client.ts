import { SLICING_CONSTANTS } from '../constants';

export interface CaptionApiResponse {
  success: boolean;
  result?: string;
  error?: string;
  requestId?: string;
}

export class DoubaoCaptionClient {
  private tokenBucket: number = SLICING_CONSTANTS.DOUBAO_RPM;
  private lastRefillTime: number = Date.now();
  private readonly refillIntervalMs: number = 60_000;
  private acquireTokenChain: Promise<void> = Promise.resolve();

  constructor() {
    if (!SLICING_CONSTANTS.DOUBAO_API_KEY) {
      console.warn('[DoubaoCaptionClient] VOLC_ARK_API_KEY is not set — caption API will fail at runtime');
    }
  }

  async generateCaption(
    systemPrompt: string,
    userPrompt: string,
    imageBase64?: string,
  ): Promise<CaptionApiResponse> {
    await this.acquireToken();

    return this.callApiWithRetry(systemPrompt, userPrompt, 1, imageBase64);
  }

  getTokenBucketAvailable(): number {
    this.refillTokensIfNeeded();
    return this.tokenBucket;
  }

  private async acquireToken(): Promise<void> {
    this.acquireTokenChain = this.acquireTokenChain.then(() => this.doAcquireToken());
    return this.acquireTokenChain;
  }

  private async doAcquireToken(): Promise<void> {
    this.refillTokensIfNeeded();

    if (this.tokenBucket <= 0) {
      const now = Date.now();
      const timeSinceRefill = now - this.lastRefillTime;
      const waitTime = Math.max(0, this.refillIntervalMs - timeSinceRefill);

      console.warn(`[DoubaoCaptionClient] Rate limit reached, waiting ${waitTime}ms for token refill`);
      await this.delay(waitTime);

      this.tokenBucket = SLICING_CONSTANTS.DOUBAO_RPM;
      this.lastRefillTime = Date.now();
    }

    this.tokenBucket--;
  }

  private refillTokensIfNeeded(): void {
    const now = Date.now();
    const timeSinceRefill = now - this.lastRefillTime;

    if (timeSinceRefill >= this.refillIntervalMs) {
      this.tokenBucket = SLICING_CONSTANTS.DOUBAO_RPM;
      this.lastRefillTime = now;
    }
  }

  private async callApiWithRetry(
    systemPrompt: string,
    userPrompt: string,
    attempt: number,
    imageBase64?: string,
  ): Promise<CaptionApiResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SLICING_CONSTANTS.DOUBAO_TIMEOUT_MS);

      try {
        // Build user message content: multimodal if image is provided, text-only otherwise
        const userContent: unknown = imageBase64
          ? [
              {
                type: 'image_url',
                image_url: { url: imageBase64 },
              },
              {
                type: 'text',
                text: userPrompt,
              },
            ]
          : userPrompt;

        const response = await fetch(SLICING_CONSTANTS.DOUBAO_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SLICING_CONSTANTS.DOUBAO_API_KEY}`,
          },
          body: JSON.stringify({
            model: SLICING_CONSTANTS.DOUBAO_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
            max_tokens: SLICING_CONSTANTS.DOUBAO_MAX_TOKENS,
            temperature: SLICING_CONSTANTS.DOUBAO_TEMPERATURE,
            top_p: SLICING_CONSTANTS.DOUBAO_TOP_P,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          if (attempt <= SLICING_CONSTANTS.DOUBAO_MAX_RETRIES) {
            const retryDelay = SLICING_CONSTANTS.DOUBAO_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(`[DoubaoCaptionClient] HTTP 429 rate limited, retrying in ${retryDelay}ms (attempt ${attempt}/${SLICING_CONSTANTS.DOUBAO_MAX_RETRIES})`);
            await this.delay(retryDelay);
            return this.callApiWithRetry(systemPrompt, userPrompt, attempt + 1, imageBase64);
          }

          return {
            success: false,
            error: 'Rate limited after max retries',
          };
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');

          if ((response.status >= 500 || response.status === 408) && attempt <= SLICING_CONSTANTS.DOUBAO_MAX_RETRIES) {
            const retryDelay = SLICING_CONSTANTS.DOUBAO_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(`[DoubaoCaptionClient] HTTP ${response.status}, retrying in ${retryDelay}ms (attempt ${attempt}/${SLICING_CONSTANTS.DOUBAO_MAX_RETRIES})`);
            await this.delay(retryDelay);
            return this.callApiWithRetry(systemPrompt, userPrompt, attempt + 1, imageBase64);
          }

          return {
            success: false,
            error: `HTTP ${response.status}: ${errorText}`,
          };
        }

        const data = await response.json();

        if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
          return {
            success: true,
            result: data.choices[0].message.content,
            requestId: data.id,
          };
        }

        return {
          success: false,
          error: 'API response missing choices or content',
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt <= SLICING_CONSTANTS.DOUBAO_MAX_RETRIES) {
          const retryDelay = SLICING_CONSTANTS.DOUBAO_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[DoubaoCaptionClient] Request timeout, retrying in ${retryDelay}ms (attempt ${attempt}/${SLICING_CONSTANTS.DOUBAO_MAX_RETRIES})`);
          await this.delay(retryDelay);
          return this.callApiWithRetry(systemPrompt, userPrompt, attempt + 1, imageBase64);
        }

        return {
          success: false,
          error: 'Request timed out after max retries',
        };
      }

      if (attempt <= SLICING_CONSTANTS.DOUBAO_MAX_RETRIES) {
        const retryDelay = SLICING_CONSTANTS.DOUBAO_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[DoubaoCaptionClient] Network error, retrying in ${retryDelay}ms (attempt ${attempt}/${SLICING_CONSTANTS.DOUBAO_MAX_RETRIES}): ${(error as Error).message}`);
        await this.delay(retryDelay);
        return this.callApiWithRetry(systemPrompt, userPrompt, attempt + 1, imageBase64);
      }

      return {
        success: false,
        error: `Network error: ${(error as Error).message}`,
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
