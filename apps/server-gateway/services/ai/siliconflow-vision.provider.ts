/**
 * SiliconFlow (硅基流动) AI 视觉理解 Provider
 *
 * 基于 Qwen2.5-VL-72B 多模态模型，对商品素材画面进行深度视觉分析：
 * - 商品特征提取
 * - 视觉卖点识别
 * - 推荐分镜类型
 * - 风格标签
 *
 * 与 DoubaoVisionProvider 形成双通道，互为补充。
 */

import { Injectable, Logger } from '@nestjs/common';
import { siliconFlowRequestWithRetry } from './siliconflow-client';
import { env } from '../../src/common/env';

export interface VisionAnalysisResult {
  /** 商品特征描述 */
  product_features: string[];
  /** 视觉卖点（可直接用于剧本生成的 selling_points） */
  visual_selling_points: string[];
  /** 推荐分镜类型 */
  shot_suggestions: Array<{
    shot_type: string;
    description: string;
    priority: number;
  }>;
  /** 风格标签 */
  style_tags: string[];
  /** 画面质量评估 */
  quality_assessment: {
    clarity: 'high' | 'medium' | 'low';
    lighting: string;
    composition: string;
  };
  /** 原始模型输出（调试用） */
  raw_response?: string;
}

/** 图片 Caption 生成结果 — 用于素材切片持久化 (dense_caption + tags) */
export interface ImageCaptionResult {
  /** 80-200 词稠密视觉描述，与视频切片 dense_caption 格式一致 */
  dense_caption: string;
  /** 5-15 个标签，与视频切片 tags 格式一致 */
  tags: string[];
  /** 商品外观特征，写入 product_dimension_tags */
  product_features: string[];
  /** 原始模型输出（调试用） */
  raw_response?: string;
}

@Injectable()
export class SiliconFlowVisionProvider {
  private readonly logger = new Logger(SiliconFlowVisionProvider.name);
  private readonly model: string;

  constructor() {
    this.model = env('SILICONFLOW_VISION_MODEL', undefined, 'Qwen/Qwen3-VL-32B-Instruct');
  }

  /**
   * 对素材主图进行视觉分析
   *
   * @param imageUrl 素材图片的公开 URL（必须可公网访问）
   * @param context 可选的上下文信息（商品标题、已有卖点等）
   */
  async analyzeMaterialImage(
    imageUrl: string,
    context?: {
      product_title?: string;
      existing_selling_points?: string[];
      material_filename?: string;
    },
  ): Promise<VisionAnalysisResult> {
    const prompt = this.buildVisionPrompt(context);
    
    this.logger.log(`[SiliconFlow Vision] Analyzing image: ${imageUrl.substring(0, 80)}...`);

    try {
      const response = await siliconFlowRequestWithRetry<{
        choices: Array<{ message: { content: string } }>;
      }>('/chat/completions', {
        method: 'POST',
        body: {
          model: this.model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: imageUrl },
                },
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
          max_tokens: 2048,
          temperature: 0.3,
        },
        timeoutMs: 45_000,
      });

      const content = response.data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from SiliconFlow Vision API');
      }

      return this.parseVisionResponse(content);
    } catch (error) {
      this.logger.error(`SiliconFlow Vision analysis failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 批量分析多个素材
   */
  async analyzeBatch(
    images: Array<{ url: string; context?: VisionAnalysisResult['product_features'] }>,
  ): Promise<VisionAnalysisResult[]> {
    const results: VisionAnalysisResult[] = [];
    for (const img of images) {
      try {
        const result = await this.analyzeMaterialImage(img.url, {
          product_title: img.context?.[0],
        });
        results.push(result);
      } catch {
        results.push({
          product_features: [],
          visual_selling_points: [],
          shot_suggestions: [],
          style_tags: [],
          quality_assessment: { clarity: 'medium', lighting: 'unknown', composition: 'unknown' },
        });
      }
    }
    return results;
  }

  /**
   * 构建视觉分析 Prompt
   */
  private buildVisionPrompt(context?: {
    product_title?: string;
    existing_selling_points?: string[];
    material_filename?: string;
  }): string {
    let prompt = `你是一个电商视频制作的视觉分析专家。请仔细分析这张商品素材图片，按以下 JSON 格式返回分析结果（仅返回 JSON，不要额外文字）：

{
  "product_features": ["商品特征1", "商品特征2", ...],
  "visual_selling_points": ["可用作视频卖点的视觉特征1", ...],
  "shot_suggestions": [
    {"shot_type": "分镜类型名", "description": "分镜描述", "priority": 1}
  ],
  "style_tags": ["风格标签1", ...],
  "quality_assessment": {
    "clarity": "high|medium|low",
    "lighting": "光线描述",
    "composition": "构图描述"
  }
}

分析要点：
1. product_features: 提取商品的视觉外观特征（颜色、材质、形状、尺寸感等）
2. visual_selling_points: 从画面中可以转化为视频卖点的视觉特征
3. shot_suggestions: 基于画面内容，推荐3-5个适合的分镜类型（如：产品特写、使用场景、开箱展示、对比展示、细节放大等）
4. style_tags: 画面风格标签（如：棚拍白底、户外自然光、暖色调、极简风等）
5. quality_assessment: 评估画质、光线、构图`;

    if (context?.product_title) {
      prompt += `\n\n参考信息 - 商品名称: ${context.product_title}`;
    }
    if (context?.existing_selling_points?.length) {
      prompt += `\n已有卖点: ${context.existing_selling_points.join(', ')}`;
    }
    if (context?.material_filename) {
      prompt += `\n文件名: ${context.material_filename}`;
    }

    return prompt;
  }

  /**
   * 解析 JSON 响应，带容错处理
   */
  private parseVisionResponse(content: string): VisionAnalysisResult {
    try {
      // 尝试提取 JSON 块
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.emptyResult(content);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        product_features: Array.isArray(parsed.product_features) ? parsed.product_features : [],
        visual_selling_points: Array.isArray(parsed.visual_selling_points) ? parsed.visual_selling_points : [],
        shot_suggestions: Array.isArray(parsed.shot_suggestions)
          ? parsed.shot_suggestions.map((s: any) => ({
              shot_type: String(s.shot_type || ''),
              description: String(s.description || ''),
              priority: Number(s.priority) || 1,
            }))
          : [],
        style_tags: Array.isArray(parsed.style_tags) ? parsed.style_tags : [],
        quality_assessment: {
          clarity: ['high', 'medium', 'low'].includes(parsed.quality_assessment?.clarity)
            ? parsed.quality_assessment.clarity
            : 'medium',
          lighting: String(parsed.quality_assessment?.lighting || 'unknown'),
          composition: String(parsed.quality_assessment?.composition || 'unknown'),
        },
        raw_response: content,
      };
    } catch {
      return this.emptyResult(content);
    }
  }

  // =========================================================================
  // 图片 Caption 生成 — 用于素材切片持久化 (dense_caption + tags)
  // =========================================================================

  /**
   * 对素材图片生成 caption + tags，输出格式与视频切片 AI 分析一致
   *
   * @param imageUrl 图片 URL 或 base64 data URL
   * @param context 商品上下文（标题、已有卖点等）
   */
  async generateImageCaption(
    imageUrl: string,
    context?: {
      product_title?: string;
      existing_selling_points?: string[];
      material_filename?: string;
    },
  ): Promise<ImageCaptionResult> {
    const prompt = this.buildCaptionPrompt(context);

    this.logger.log(`[SiliconFlow Caption] Generating caption for image: ${imageUrl.substring(0, 80)}...`);

    try {
      const response = await siliconFlowRequestWithRetry<{
        choices: Array<{ message: { content: string } }>;
      }>('/chat/completions', {
        method: 'POST',
        body: {
          model: this.model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: imageUrl },
                },
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
          max_tokens: 2048,
          temperature: 0.5,
        },
        timeoutMs: 45_000,
      });

      const content = response.data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from SiliconFlow Vision API');
      }

      return this.parseCaptionResponse(content);
    } catch (error) {
      this.logger.error(`SiliconFlow Caption generation failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 构建 Caption 生成 Prompt — 输出 dense_caption + tags 格式
   */
  private buildCaptionPrompt(context?: {
    product_title?: string;
    existing_selling_points?: string[];
    material_filename?: string;
  }): string {
    let prompt = `你是一个电商短视频素材分析专家。请仔细分析这张商品素材图片，输出稠密的视觉描述和分类标签。按以下 JSON 格式返回（仅返回 JSON，不要额外文字）：

{
  "dense_caption": "80-200词的稠密视觉描述，英文，描述画面中的所有商品细节（颜色、材质、形状、纹理、光影、构图），用自然语言连贯通顺地叙述，就像在给视频剪辑师描述这个画面一样。",
  "tags": ["标签1", "标签2", ...],
  "product_features": ["商品外观特征1", "商品外观特征2", ...]
}

要求：
1. dense_caption: 80-200个英文单词的稠密画面描述，重点描述商品的视觉特征。使用自然流畅的叙述性语言，不要使用列表格式。描述画面构图、商品位置、颜色搭配、材质质感、光影效果、背景环境等。
2. tags: 返回5-15个标签，覆盖商品类型、风格、颜色、材质、使用场景等维度。标签使用中文。
3. product_features: 返回3-10个商品外观特征描述，中文。`;

    if (context?.product_title) {
      prompt += `\n\n参考信息 - 商品名称: ${context.product_title}`;
    }
    if (context?.existing_selling_points?.length) {
      prompt += `\n已有卖点: ${context.existing_selling_points.join(', ')}`;
    }
    if (context?.material_filename) {
      prompt += `\n文件名: ${context.material_filename}`;
    }

    return prompt;
  }

  /**
   * 解析 Caption JSON 响应，带容错
   */
  private parseCaptionResponse(content: string): ImageCaptionResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.emptyCaptionResult(content);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        dense_caption: typeof parsed.dense_caption === 'string' && parsed.dense_caption.trim().length > 0
          ? parsed.dense_caption.trim()
          : (typeof parsed.denseCaption === 'string' ? parsed.denseCaption.trim() : ''),
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.filter((t: unknown) => typeof t === 'string' && t.trim().length > 0).map((t: string) => t.trim()).slice(0, 15)
          : [],
        product_features: Array.isArray(parsed.product_features)
          ? parsed.product_features.filter((f: unknown) => typeof f === 'string' && f.trim().length > 0).map((f: string) => f.trim()).slice(0, 10)
          : (Array.isArray(parsed.productFeatures) ? parsed.productFeatures : []),
        raw_response: content,
      };
    } catch {
      return this.emptyCaptionResult(content);
    }
  }

  private emptyCaptionResult(raw?: string): ImageCaptionResult {
    return {
      dense_caption: '',
      tags: [],
      product_features: [],
      raw_response: raw,
    };
  }

  private emptyResult(raw?: string): VisionAnalysisResult {
    return {
      product_features: [],
      visual_selling_points: [],
      shot_suggestions: [],
      style_tags: [],
      quality_assessment: { clarity: 'medium', lighting: 'unknown', composition: 'unknown' },
      raw_response: raw,
    };
  }
}
