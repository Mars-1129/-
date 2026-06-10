// =============================================================================
// TikStream AI — Viral Video Analysis Provider
// =============================================================================
// 调度 AI 对爆款视频进行结构化拆解
// P0: Doubao Vision 分析缩略图
// P1: Doubao Text 基于 URL/平台/标题做拆解（主路径）
// P2: 启发式降级模板
// =============================================================================

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DoubaoTextProvider } from './doubao-text.provider';
import { DoubaoVisionProvider } from './doubao-vision.provider';
import {
  ViralVideoAnalysisPromptBuilder,
  VideoAnalysisPromptParams,
} from '../prompts/video-analysis.prompt';

export interface AnalysisContext {
  source_url: string;
  source_platform: string;
  title?: string;
  /** 缩略图 URL (MinIO 公开 URL)，用于 Vision 分析 */
  thumbnail_url?: string;
  /** 商品上下文 */
  product_context?: {
    category?: string;
    title?: string;
  };
  /** 页面元数据（从 OpenGraph/Twitter Card 抓取） */
  page_metadata?: PageMetadata;
}

export interface PageMetadata {
  title?: string;
  description?: string;
  image_url?: string;
}

export interface AnalysisResult {
  title: string;
  hook_type: string;
  strategy_json: Record<string, unknown>;
  factor_json: Record<string, unknown>;
  report_json: Record<string, unknown>;
  selling_points: string[];
  shots: Array<{
    shot_index: number;
    duration: number;
    scene_description: string;
    camera_movement: string;
    transition_type: string;
    visual_elements: string;
    audio_elements: string;
  }>;
}

const VISION_ANALYSIS_PROMPT = `你是一个短视频缩略图分析专家。
请仔细分析这张视频缩略图，提取以下信息：

1. 画面中有几个主体（人/产品/文字）？
2. 文字内容是什么？（如果有的文字或标题文字）
3. 画面色调和氛围（暖色/冷色/高对比/柔和）
4. 画面上是否有明显的产品展示？
5. 人物的表情和动作（如果有的话）
6. 推测视频可能的类型（开箱/评测/教程/vlog/产品展示/剧情）

请用简洁的文字描述，200字以内。`;

const FALLBACK_STRUCTURES: Record<string, Partial<AnalysisResult>> = {
  tiktok: {
    hook_type: '好奇型',
    factor_json: {
      optimal_shot_count: 6,
      optimal_total_duration: 15,
      camera_patterns: ['Static', 'Dolly_In_Fast'],
      transition_preference: 'Dissolve',
      bgm_style: '轻快电子',
      caption_density: 'high',
      cta_placement: '末尾引导',
    },
  },
  youtube: {
    hook_type: '问题型',
    factor_json: {
      optimal_shot_count: 10,
      optimal_total_duration: 45,
      camera_patterns: ['Static', 'Pan_Left'],
      transition_preference: 'Fade_In',
      bgm_style: '舒缓钢琴',
      caption_density: 'mid',
      cta_placement: '中部+末尾',
    },
  },
};

@Injectable()
export class ViralVideoAnalysisProvider {
  private readonly logger = new Logger(ViralVideoAnalysisProvider.name);

  constructor(
    private readonly doubaoText: DoubaoTextProvider,
    private readonly doubaoVision: DoubaoVisionProvider,
    private readonly promptBuilder: ViralVideoAnalysisPromptBuilder,
  ) {}

  /** 暴露文本生成能力供 Service 层使用（如关键词建议） */
  async generateText(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.doubaoText.generateText(systemPrompt, userPrompt);
  }

  /**
   * 对爆款视频进行 AI 结构化拆解
   * P0: Vision 分析缩略图 → Text 综合拆解
   * P1: Text 直接拆解（基于 URL/平台/标题）
   * P2: 启发式降级模板
   *
   * 文本推断增强: 在 P1 前尝试抓取 OpenGraph/Twitter Card 页面元数据，
   * 为 LLM 提供更真实的内容上下文（标题、描述、缩略图），弥补无法直接分析视频文件的限制。
   */
  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    this.logger.log(
      `Analyzing viral video: platform=${context.source_platform}, url=${context.source_url.substring(0, 80)}`,
    );

    let visionAnalysis: string | undefined;

    // 增强文本推断: 抓取页面 OpenGraph 元数据
    let pageMetadata = context.page_metadata;
    if (!pageMetadata && /^https?:\/\//.test(context.source_url)) {
      pageMetadata = await this.fetchPageMetadata(context.source_url);
      context.page_metadata = pageMetadata;
    }

    // 如果抓取到 og:image 且没有自有缩略图，则用 og:image 做 Vision 分析
    const effectiveThumbnail = context.thumbnail_url || pageMetadata?.image_url;

    // P0: 尝试 Vision 分析缩略图
    if (effectiveThumbnail) {
      try {
        visionAnalysis = await this.doubaoVision.analyzeImage(
          effectiveThumbnail,
          VISION_ANALYSIS_PROMPT,
        );
        this.logger.log(`Vision analysis completed for thumbnail: ${effectiveThumbnail.substring(0, 60)}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Vision analysis failed: ${msg}, falling back to text-only`);
      }
    }

    // P1: Text 拆解
    try {
      const promptParams: VideoAnalysisPromptParams = {
        source_url: context.source_url,
        source_platform: context.source_platform,
        title: context.title || context.page_metadata?.title,
        vision_analysis: visionAnalysis,
        product_context: context.product_context,
        page_metadata: context.page_metadata,
      };

      const { systemPrompt, userPrompt } = this.promptBuilder.build(promptParams);
      const rawResponse = await this.doubaoText.generateText(systemPrompt, userPrompt);

      return this.parseAnalysisResponse(rawResponse, context);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Text analysis failed: ${msg}, falling back to heuristic`);

      // P2: 降级模板
      return this.fallbackAnalysis(context);
    }
  }

  private parseAnalysisResponse(
    rawResponse: string,
    context: AnalysisContext,
  ): AnalysisResult {
    let cleaned = rawResponse.trim();

    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      this.logger.error(`Failed to parse analysis response: ${rawResponse.substring(0, 500)}`);
      return this.fallbackAnalysis(context);
    }

    return {
    title: (parsed.title as string) || context.title || this.inferTitle(context),
    hook_type: (parsed.hook_type as string) || '其他',
    strategy_json: (parsed.strategy_json as Record<string, unknown>) || {},
    factor_json: (parsed.factor_json as Record<string, unknown>) || {},
    report_json: (parsed.report_json as Record<string, unknown>) || {},
    selling_points: this.extractSellingPoints((parsed.report_json as Record<string, unknown>)?.selling_points),
    shots: this.parseShots(parsed.shots as unknown as Array<Record<string, unknown>> | undefined),
  };
  }

  private extractSellingPoints(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .slice(0, 10)
      .map((s) => s.trim());
  }

  private parseShots(
    rawShots: Array<Record<string, unknown>> | undefined | null,
  ): AnalysisResult['shots'] {
    if (!rawShots || !Array.isArray(rawShots) || rawShots.length === 0) {
      return [];
    }

    return rawShots.map((s, idx) => ({
      shot_index: (s.shot_index as number) ?? idx,
      duration: (s.duration as number) ?? 2.5,
      scene_description: (s.scene_description as string) || '',
      camera_movement: (s.camera_movement as string) || 'Static',
      transition_type: (s.transition_type as string) || 'None',
      visual_elements: (s.visual_elements as string) || '',
      audio_elements: (s.audio_elements as string) || '',
    }));
  }

  private fallbackAnalysis(context: AnalysisContext): AnalysisResult {
    const platform = context.source_platform.toLowerCase();
    const fallback = FALLBACK_STRUCTURES[platform] || FALLBACK_STRUCTURES.tiktok;

    return {
      title: context.title || this.inferTitle(context),
      hook_type: fallback.hook_type || '好奇型',
      strategy_json: {
        narrative_structure: '开门见山→痛点放大→产品方案→CTA',
        rhythm_pattern: '渐强式',
        conversion_funnel: '好奇→共鸣→渴望→行动',
        target_audience_profile: '泛兴趣用户',
      },
      factor_json: fallback.factor_json || {},
      report_json: {
        estimated_engagement: '中等',
        selling_points: ['标准商品卖点'],
        virality_factors: ['标准结构'],
        improvement_suggestions: ['建议补充人工标注以提升分析精度'],
        content_maturity: '初级',
        analysis_source: 'heuristic_fallback',
      },
      selling_points: ['标准商品卖点'],
      shots: [
        {
          shot_index: 0,
          duration: 2.5,
          scene_description: '开场 Hook 画面',
          camera_movement: 'Static',
          transition_type: 'None',
          visual_elements: '产品/人物出现',
          audio_elements: '背景音乐+人声',
        },
      ],
    };
  }

  private inferTitle(context: AnalysisContext): string {
    const platformLabel = context.source_platform.toUpperCase();
    return `${platformLabel} 爆款视频分析`;
  }

  /**
   * 从视频页面抓取 OpenGraph / Twitter Card 元数据
   * 为纯文本推断提供更真实的上下文（标题、描述、高清缩略图）
   *
   * 设计为"尽力而为"——任何步骤失败均静默降级，不影响主流程。
   */
  private async fetchPageMetadata(url: string): Promise<PageMetadata> {
    const meta: PageMetadata = {};
    const TIMEOUT_MS = 5000;
    const MAX_BODY_BYTES = 512 * 1024; // 512KB，避免下载整页

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'TikStreamAI/1.0 (VideoAnalysis; +https://tikstream.ai)',
          'Accept': 'text/html',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok || !response.body) {
        this.logger.warn(`Failed to fetch page: HTTP ${response.status} for ${url.substring(0, 60)}`);
        return meta;
      }

      // 只读前 512KB
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      try {
        while (totalBytes < MAX_BODY_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          totalBytes += value.length;
        }
      } finally {
        await reader.cancel().catch(() => {});
      }

      const decoder = new TextDecoder('utf-8', { fatal: false });
      // 使用标准 Uint8Array 拼接（代替 Node.js Buffer，确保跨环境兼容）
      const allBytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        allBytes.set(chunk, offset);
        offset += chunk.length;
      }
      const html = decoder.decode(allBytes);

      // 提取 <meta> 标签
      meta.title = this.extractMetaContent(html, 'og:title')
        || this.extractMetaContent(html, 'twitter:title')
        || this.extractTitleTag(html);

      meta.description = this.extractMetaContent(html, 'og:description')
        || this.extractMetaContent(html, 'twitter:description')
        || this.extractMetaContent(html, 'description');

      meta.image_url = this.extractMetaContent(html, 'og:image')
        || this.extractMetaContent(html, 'twitter:image');

      if (meta.title || meta.description) {
        this.logger.log(
          `Page metadata extracted: title=${meta.title?.substring(0, 40)}, hasImage=${!!meta.image_url}`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to extract page metadata: ${msg}`);
    }

    return meta;
  }

  private extractMetaContent(html: string, property: string): string | undefined {
    // 匹配 <meta property="og:title" content="..." /> 或 <meta name="description" content="..." />
    const patterns = [
      new RegExp(`<meta\\s+[^>]*property=["']${this.escapeRegex(property)}["'][^>]*content=["']([^"']*)["'][^>]*/?>`, 'i'),
      new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*property=["']${this.escapeRegex(property)}["'][^>]*/?>`, 'i'),
      new RegExp(`<meta\\s+[^>]*name=["']${this.escapeRegex(property)}["'][^>]*content=["']([^"']*)["'][^>]*/?>`, 'i'),
      new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*name=["']${this.escapeRegex(property)}["'][^>]*/?>`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return this.decodeHtmlEntities(match[1].trim());
      }
    }

    return undefined;
  }

  private extractTitleTag(html: string): string | undefined {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match?.[1]?.trim()
      .split(/[\s\|-]{2,}/)[0]?.trim(); // 只取标题主体，去掉 " - YouTube" 之类后缀
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/&copy;/g, '©')
      .replace(/&reg;/g, '®')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
