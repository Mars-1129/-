import { CaptionResult, CaptionPrompt, SliceSegment, GatewayProductInfo } from './types';
import { DoubaoCaptionClient } from './ai/doubao-caption-client';
import { Client as MinioClient } from 'minio';
import { SLICING_CONSTANTS } from './constants';

export class CaptionProcessor {
  private readonly doubaoClient: DoubaoCaptionClient;
  private readonly minioClient: MinioClient;

  constructor() {
    this.doubaoClient = new DoubaoCaptionClient();
    this.minioClient = new MinioClient({
      endPoint: SLICING_CONSTANTS.MINIO_ENDPOINT,
      port: SLICING_CONSTANTS.MINIO_PORT,
      useSSL: false,
      accessKey: SLICING_CONSTANTS.MINIO_ACCESS_KEY,
      secretKey: SLICING_CONSTANTS.MINIO_SECRET_KEY,
    });
  }

  async generate(
    segment: SliceSegment,
    productInfo: GatewayProductInfo,
    keyFrameUrl?: string,
  ): Promise<CaptionResult> {
    const prompt = this.buildCaptionPrompt(segment, productInfo);

    // 下载关键帧图片并转为 base64，用于多模态视觉分析
    let imageBase64: string | undefined;
    if (keyFrameUrl) {
      try {
        imageBase64 = await this.downloadKeyFrameAsBase64(keyFrameUrl);
        if (imageBase64) {
          console.log(`[CaptionProcessor] Using multimodal caption with keyframe: ${keyFrameUrl.substring(0, 60)}... (${Math.round(imageBase64.length / 1024)}KB)`);
        }
      } catch (err) {
        console.warn(`[CaptionProcessor] Failed to download keyframe, falling back to text-only: ${(err as Error).message}`);
      }
    }

    const rawText = await this.callDoubaoApi(prompt, imageBase64);

    return this.parseCaptionResponse(rawText);
  }

  buildCaptionPrompt(segment: SliceSegment, productInfo: GatewayProductInfo): CaptionPrompt {
    const productContext = `Product Context:
- Product: ${productInfo.title} (${productInfo.category})
- Selling Points: ${productInfo.selling_points.join(', ')}
- Time Window: ${segment.start_sec}s to ${segment.end_sec}s (duration: ${segment.duration}s)`;

    const systemPrompt = `You are a professional video captioning AI specialized in e-commerce product videos for TikTok Shop. Your task is to provide a DENSE, highly detailed caption and relevant tags for the given video segment. The caption must be in English and describe the visual scene in rich detail.

${productContext}

CAPTION REQUIREMENTS:
1. MUST be 80-200 words of dense visual description
2. Describe subject, action, product details, lighting, composition, mood
3. Include spatial relationships and camera perspective
4. Note any on-screen text, UI elements, or product labeling visible
5. Describe colors, textures, and materials in detail

TAG REQUIREMENTS:
1. 5-15 tags in snake_case (lowercase, underscores)
2. Include: camera angle, lighting condition, setting, product_feature, action_type, mood
3. Prioritize descriptive tags over generic ones

STRICT OUTPUT FORMAT (JSON only, no markdown fences, no explanatory text):
{"dense_caption":"string","tags":["string","string",...]}`;

    const userPrompt = `Analyze the video segment from ${segment.start_sec}s to ${segment.end_sec}s (duration ${segment.duration}s) of the product "${productInfo.title}" and produce a dense visual caption with tags in the specified JSON format.`;

    return { systemPrompt, userPrompt };
  }

  private async callDoubaoApi(prompt: CaptionPrompt, imageBase64?: string): Promise<string> {
    const response = await this.doubaoClient.generateCaption(
      prompt.systemPrompt,
      prompt.userPrompt,
      imageBase64,
    );

    if (!response.success) {
      const error = new Error(response.error || 'Doubao caption API call failed');
      (error as Error & { errorCode: string }).errorCode =
        response.error?.includes('rate') || response.error?.includes('429')
          ? 'RATE_LIMITED'
          : 'MODEL_PROVIDER_FAILED';
      throw error;
    }

    if (!response.result || response.result.trim().length === 0) {
      const error = new Error('Doubao caption API returned empty response');
      (error as Error & { errorCode: string }).errorCode = 'SCRIPT_PARSE_FAILED';
      throw error;
    }

    return response.result;
  }

  /**
   * 从 MinIO 下载关键帧图片并转为 base64 data URL
   */
  private async downloadKeyFrameAsBase64(keyFrameUrl: string): Promise<string | undefined> {
    const bucket = SLICING_CONSTANTS.MINIO_BUCKET;
    const prefix = `/${bucket}/`;
    const idx = keyFrameUrl.indexOf(prefix);
    if (idx === -1) {
      console.log(`[CaptionProcessor] Keyframe URL is not MinIO: ${keyFrameUrl.substring(0, 80)}...`);
      return undefined;
    }

    const objectKey = keyFrameUrl.substring(idx + prefix.length);
    try {
      const stream = await this.minioClient.getObject(bucket, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // 推断 content type
      const contentType = objectKey.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const base64 = buffer.toString('base64');
      return `data:${contentType};base64,${base64}`;
    } catch {
      return undefined;
    }
  }

  parseCaptionResponse(rawText: string): CaptionResult {
    if (!rawText || rawText.trim().length === 0) {
      const error = new Error('Caption API returned empty response');
      (error as Error & { errorCode: string }).errorCode = 'SCRIPT_PARSE_FAILED';
      throw error;
    }

    let trimmed = rawText.trim();

    // Log first 300 chars for debugging
    console.log(`[CaptionProcessor] Raw response (first 300 chars): ${trimmed.substring(0, 300)}`);

    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      trimmed = codeBlockMatch[1].trim();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Try to extract any JSON object from the text (handles mixed output)
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          const error = new Error('Caption API response is not valid JSON');
          (error as Error & { errorCode: string }).errorCode = 'SCRIPT_PARSE_FAILED';
          throw error;
        }
      } else {
        const error = new Error('Caption API response is not valid JSON');
        (error as Error & { errorCode: string }).errorCode = 'SCRIPT_PARSE_FAILED';
        throw error;
      }
    }

    if (typeof parsed !== 'object' || parsed === null) {
      const error = new Error('Caption API response is not a JSON object');
      (error as Error & { errorCode: string }).errorCode = 'SCRIPT_PARSE_FAILED';
      throw error;
    }

    const obj = parsed as Record<string, unknown>;

    // Accept both "dense_caption" and "caption" as field names (model compatibility)
    const denseCaption =
      (typeof obj.dense_caption === 'string' && obj.dense_caption.trim().length > 0)
        ? obj.dense_caption.trim()
        : (typeof obj.caption === 'string' && obj.caption.trim().length > 0)
          ? obj.caption.trim()
          : null;

    if (!denseCaption) {
      const error = new Error('Caption result missing or empty dense_caption/caption field');
      (error as Error & { errorCode: string }).errorCode = 'SCRIPT_PARSE_FAILED';
      throw error;
    }

    if (!Array.isArray(obj.tags)) {
      const error = new Error('Caption result missing tags array');
      (error as Error & { errorCode: string }).errorCode = 'SCRIPT_PARSE_FAILED';
      throw error;
    }

    const tags = (obj.tags as unknown[])
      .filter(
        (tag): tag is string =>
          typeof tag === 'string' && tag.trim().length > 0,
      )
      .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '_'));

    if (tags.length === 0) {
      const error = new Error('Caption result has no valid tags after filtering');
      (error as Error & { errorCode: string }).errorCode = 'SCRIPT_PARSE_FAILED';
      throw error;
    }

    return {
      dense_caption: denseCaption,
      tags,
    };
  }
}
