import { Injectable, Logger } from '@nestjs/common';

export interface ImageBindEmbedRequest {
  text?: string;
  image_url?: string;
  image_base64?: string;
}

@Injectable()
export class ImageBindClientService {
  private readonly logger = new Logger(ImageBindClientService.name);
  private readonly imagebindApiUrl: string;
  private readonly embeddingDim: number;

  constructor() {
    this.imagebindApiUrl = process.env.IMAGEBIND_API_URL || 'http://text-embed-server:8080';
    const raw = Number(process.env.EMBEDDING_DIM || '384');
    this.embeddingDim = Number.isFinite(raw) && raw > 0 ? raw : 384;
    this.logger.log(`Embed client initialized: url=${this.imagebindApiUrl}, dim=${this.embeddingDim}`);
  }

  getEmbeddingDim(): number {
    return this.embeddingDim;
  }

  async embedQuery(input: ImageBindEmbedRequest): Promise<number[] | null> {
    const { text, image_url, image_base64 } = input;

    const hasText = text && text.trim().length > 0;
    const hasImage = !!(image_url || image_base64);

    if (!hasText && !hasImage) {
      return null;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const body: Record<string, unknown> = {};
      if (hasText) body.text = text!.trim();
      if (image_url) body.image_url = image_url;
      if (image_base64) body.image_base64 = image_base64;

      const response = await this.fetchWithRetry(
        `${this.imagebindApiUrl.replace(/\/$/, '')}/embed`,
        body,
        controller.signal,
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        this.logger.warn(`Embed service failed (HTTP ${response.status}): ${errorText}`);
        return null;
      }

      const data = await response.json() as { embedding?: number[]; vector?: number[] };
      const embedding = (Array.isArray(data.embedding) && data.embedding.length > 0)
        ? data.embedding
        : data.vector;

      if (!Array.isArray(embedding) || embedding.length !== this.embeddingDim) {
        this.logger.warn(
          `Embed service returned invalid shape: expected ${this.embeddingDim}, got ${embedding?.length ?? 'none'}`,
        );
        return null;
      }

      return embedding;
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Embed service failed: ${err.message}`);
      return null;
    }
  }

  /**
   * 带指数退避的重试请求，应对嵌入服务短暂不可用（重试 2 次，间隔 200ms/400ms）
   */
  private async fetchWithRetry(
    url: string,
    body: unknown,
    signal: AbortSignal,
    maxRetries = 2,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
        if (resp.ok || attempt === maxRetries) {
          return resp;
        }
        lastError = new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) break;
        // 指数退避
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
    throw lastError ?? new Error('fetchWithRetry: unexpected error');
  }
}
