// =============================================================================
// TikStream AI — Creation Service
// =============================================================================

import { Injectable, Logger, Inject, HttpStatus, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MetricsService } from '../metrics/metrics.service';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import type {
  PreviewCompositionResponse,
  Script as ScriptType,
  ScriptShot,
  ShotRenderSummary,
  SubtitleEntry,
  TaskSummary,
} from '@tikstream/shared-types';
import type { CanvasParams, AudioMixConfig } from '../../../../shared/api_types';
import { DEFAULT_AUDIO_MIX_CONFIG } from '../../../../shared/api_types';
import type { CreationStatus } from '@prisma/client';
import { CreationRepository, CreateCreationParams, CreateShotRenderParams, CreationListFilter, DecodedCreationCursor, CreationRow, PaginatedCreationResult } from './creation.repository';
import { MaterialRepository } from '../material/material.repository';
import { MaterialService } from '../material/material.service';
import { SynonymService } from '../services/synonym/synonym.service';
import { CREATION_CONSTANTS } from './creation.constants';
import { serviceException } from '../common/service-exception';
import { resolveWorkerAssetUrl } from '../utils/public-asset-url';
import { ProductRepository } from '../product/product.repository';
import { ScriptService } from '../script/script.service';
import { ScriptQuickGenerateDto } from '../script/dto/generate-quick.dto';
import { ProductUrlParserProvider } from '../../services/ai/product-url-parser.provider';
import { ProductRecognitionProvider } from '../../services/ai/product-recognition.provider';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import type { SubtitleTranslationService } from '../subtitle/subtitle-translation.service';
import { fireAndForget } from '../common/async-utils';
import { arkApiKey, arkVideoApiKey, arkSeedanceBaseUrl } from '../common/env';

export interface CreateCreationDto {
  product_id: string;
  script_id?: string;
  engine_mode?: string;
  target_resolution?: string;
  export_format?: string;
  voice_profile?: string;
  bgm_policy?: string;
  force_refresh?: boolean;
  prefer_ai_video?: boolean;
  /** 目标配音语种（默认 zh-CN；支持 ja-JP/ko-KR/th-TH/id-ID/es-ES/en-US） */
  target_language?: string;

  // IMAGE_DRIVEN
  material_id?: string;
  style_vibe?: string;
  aspect_ratio?: string;

  // PROMPT_DRIVEN
  product_url?: string;
  product_title?: string;
  product_selling_points?: string[];
  product_category?: string;

  // 素材关联
  shot_slice_bindings?: Record<number, string>;
  preferred_material_ids?: string[];
  slice_match_strategy?: string;
}

export interface CreateCreationResponse {
  creation_id: string;
  task_id: string;
  product_id: string;
  script_id: string;
  status: string;
  current_stage: string;
  progress: number;
}

export interface CreationDetailShotRender {
  shot_render_id: string;
  creation_id: string;
  script_shot_id: string;
  shot_id: string | null;
  shot_index: number;
  cache_hash: string | null;
  slice_id: string | null;
  render_path: string | null;
  render_duration_ms: number | null;
  retry_count: number;
  source: string | null;
  status: string;
  error_message: string | null;
  seedance_prompt?: string;
  updated_at: string;
}

export interface CreationDetailResponse {
  creation_id: string;
  product_id: string;
  script_id: string;
  task_id: string;
  engine_mode: string;
  target_resolution: string;
  export_format: string;
  status: string;
  progress: number;
  current_stage: string;
  video_url: string | null;
  file_size_bytes: number | null;
  trace_id: string | null;
  error_code: string | null;
  error_message: string | null;
  prefer_ai_video: boolean;
  started_at: string | null;
  finished_at: string | null;
  shot_renders: CreationDetailShotRender[];
  created_at: string;
  updated_at: string;
}

export interface CancelCreationResponse {
  creation_id: string;
  status: 'CANCELED';
}

export interface CreationListItem {
  creation_id: string;
  product_id: string;
  script_id: string;
  task_id: string;
  engine_mode: string;
  target_resolution: string;
  export_format: string;
  status: string;
  progress: number;
  current_stage: string;
  video_url: string | null;
  file_size_bytes: number | null;
  trace_id: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CursorPageInfo {
  cursor: string | null;
  has_more: boolean;
  total_count: number | null;
}

export interface CreationListResponse {
  items: CreationListItem[];
  page_info: CursorPageInfo;
}

export interface TaskListResponse {
  items: TaskSummary[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

interface CreationJobPayload {
  creation_id: string;
  task_id: string;
  product_id: string;
  script_id: string;
  trace_id: string;
  voice_profile: string;
  bgm_policy: string;
  force_refresh: boolean;
  target_resolution?: string;
  /** 风格调性（来自剧本 style_vibe，用于 BGM 智能匹配） */
  style_vibe?: string;
  /** 目标配音语种（如 ja-JP / ko-KR 等，默认 zh-CN） */
  target_language?: string;
  /** restitch 模式：跳过 AI 生成 + TTS，直接 FFmpeg 拼接已缓存的 shot 视频 */
  restitch_only?: boolean;
  /** restitch 模式下各分镜的已渲染视频路径 */
  restitch_render_paths?: Array<{ shot_index: number; render_path: string }>;
  /** 音频混音控制配置 */
  audio_mix_config?: AudioMixConfig;
  /** 导出格式: mp4 / mov / webm（默认 mp4） */
  export_format?: string;
  /** 语音增强配置（人声增强、降噪等） */
  voice_enhancement?: {
    enabled: boolean;
    noiseReduction: string;
    dynamicCompression: boolean;
    clarityBoost: boolean;
    deEssing: boolean;
    outputGain: number;
  };
  /** 仅渲染指定分镜索引的列表（单分镜重渲染场景）；不传则渲染全部 */
  rerender_shot_indices?: number[];
  /** 重试时已完成的 shot_index 列表（checkpoint 模式），Worker 跳过这些分镜的 AI 生成 */
  retry_completed_shot_indices?: number[];
  /** 水印配置（透传到 Worker 的 ffmpeg-stitch-service） */
  watermark?: {
    enabled: boolean;
    type: 'visible' | 'invisible' | 'both';
    visible?: { content: string; logo_url?: string; position: string; opacity: number; font_size: number; include_timestamp: boolean; include_user_id: boolean };
    invisible?: { technique: 'metadata' | 'steganography'; robustness: 'basic'; payload: string };
    copyright?: { holder: string; license_type: string; attribution_required: boolean; copyright_year: number };
  };
  /** checkpoint 模式下已完成分镜的视频文件信息 */
  retry_completed_shot_videos?: Array<{ shot_index: number; render_path: string }>;
  /** 逐镜 BGM 配置（从剧本 bgm_segment 传递） */
  bgm_segments?: Array<{
    shot_index: number;
    style: string;
    energy_level: 'low' | 'mid' | 'high';
    beat_pattern: string;
  }>;
  shots: Array<{
    shot_id: string;
    shot_index: number;
    duration: number;
    visual_description?: string;
    voiceover?: string;
    /** 字幕文本（独立于旁白，用于烧录到视频） */
    subtitle_text?: string;
    voice_profile?: string;
    /** 素材切片关键帧/底图，作为 Seedance 图生视频首帧 */
    image_url?: string;
    selected_slice_id?: string;
    /** 切片原视频，仅在 Seedance 失败时作兜底 */
    selected_slice_url?: string;
    scene_description_query?: string;
    /** 运镜类型 */
    camera_movement?: string;
    /** 转场类型 */
    transition_type?: string;
  }>;
}

interface SliceMediaRef {
  sliceId: string;
  keyFrameUrl: string | null;
  streamUrl: string | null;
}

interface ProductInfo {
  id: string;
  title: string;
  coverImageUrl: string | null;
  sellingPoints?: unknown;
}

interface ScriptShotInfo {
  id: string;
  shotId: string | null;
  shotIndex: number;
  duration: number;
  sceneDescriptionQuery: string;
  visualDescription: string;
  cameraMovement: string;
  transitionType: string;
  voiceoverText: string;
  subtitleText: string;
  selectedSliceId: string | null;
  complianceStatus: string;
  bgmSegment: Record<string, unknown> | null;
}

interface ScriptInfo {
  id: string;
  productId: string;
  title: string | null;
  language: string | null;
  videoDuration: number;
  aspectRatio: string;
  styleVibe: string;
  generationMode: string;
  shots: ScriptShotInfo[];
}

interface ValidateResult {
  product: ProductInfo;
  script: ScriptInfo;
}

interface CreationIdentifiers {
  creationId: string;
  taskId: string;
  traceId: string;
}

interface CreationDetailShotRenderRecord {
  id: string;
  creationId: string;
  scriptShotId: string;
  shotId: string | null;
  shotIndex: number;
  cacheHash: string | null;
  sliceId: string | null;
  renderPath: string | null;
  renderDurationMs: number | null;
  retryCount: number;
  source: string | null;
  seedancePrompt: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreationDetailRecord {
  id: string;
  productId: string;
  scriptId: string;
  taskId: string;
  engineMode: string;
  targetResolution: string;
  exportFormat: string;
  status: string;
  progress: number;
  currentStage: string;
  videoUrl: string | null;
  fileSizeBytes: bigint | null;
  traceId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  preferAiVideo: boolean;
  watermarkConfig?: unknown;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  shotRenders: CreationDetailShotRenderRecord[];
}

// ===========================================================================
// 模块级常量：停用词集合，避免 extractKeywords 每次调用新建 Set
// ===========================================================================

const ENGLISH_STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 's', 't', 'just', 'don', 'now', 'and',
  'or', 'but', 'if', 'while', 'although', 'because', 'until', 'unless',
  'it', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we',
  'they', 'what', 'which', 'who', 'whom', 'their', 'his', 'her', 'my',
  'your', 'our', 'me', 'him', 'us', 'them', 'scene', 'shot', 'video',
]);

const CHINESE_STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些',
  '所', '为', '所以', '因为', '但是', '然而', '可以', '这个', '那个',
  '什么', '怎么', '如果', '虽然', '而且', '或者', '还是', '只是',
  '画面', '镜头', '场景', '视频', '需要', '展示', '进行', '使用',
  '能够', '应该', '已经', '可能', '一种', '我们', '他们',
  '与', '其', '被', '把', '从', '对', '以', '让', '向', '更', '最',
  '将', '等', '及', '则', '但', '或', '且', '并', '而',
]);

/**
 * 将 Prisma JsonValue 安全转换为 CreationJobPayload watermark 配置
 * 避免双重 as 断言丢失类型安全
 */
function safeWatermarkConfig(raw: unknown): CreationJobPayload['watermark'] | undefined {
  if (!raw || typeof raw !== 'object' || raw === null) return undefined;
  const config = raw as Record<string, unknown>;
  if (!config.enabled) return undefined;
  // 运行时校验 type 字段，避免 Worker 收到不完整的水印配置
  const validTypes = ['visible', 'invisible', 'both'];
  if (typeof config.type !== 'string' || !validTypes.includes(config.type)) {
    console.warn(`[safeWatermarkConfig] 无效或缺失 watermark type: ${JSON.stringify(config.type)}，已忽略`);
    return undefined;
  }
  return config as unknown as CreationJobPayload['watermark'];
}

@Injectable()
export class CreationService {
  private readonly logger = new Logger(CreationService.name);

  constructor(
    private readonly repository: CreationRepository,
    private readonly materialRepository: MaterialRepository,
    private readonly materialService: MaterialService,
    private readonly synonymService: SynonymService,
    private readonly productRepository: ProductRepository,
    private readonly scriptService: ScriptService,
    @Optional() private readonly urlParser: ProductUrlParserProvider | null,
    @Optional() private readonly productRecognition: ProductRecognitionProvider | null,
    private readonly doubaoText: DoubaoTextProvider,
    @Inject('CREATION_QUEUE') private readonly creationQueue: Queue,
    private readonly metricsService: MetricsService,
    @Optional() @Inject('SUBTITLE_TRANSLATION') private readonly subtitleTranslationService?: SubtitleTranslationService,
  ) {
    if (!this.subtitleTranslationService) {
      this.logger.warn('subtitleTranslationService not injected — DB-cached translation unavailable, real-time API fallback will be used');
    }
  }

  /** 将相对静态资源路径拼接为完整 URL，用于 BGM/封面等 */
  private getStaticAssetUrl(relativePath: string): string {
    const base = process.env.STATIC_ASSET_BASE_URL || '';
    return `${base}${relativePath}`;
  }

  // ===========================================================================
  // F0: createCreation — 主编排器
  // ===========================================================================

  async createCreation(dto: CreateCreationDto): Promise<CreateCreationResponse> {
    const engineMode = dto.engine_mode ?? CREATION_CONSTANTS.DEFAULT_ENGINE_MODE;
    this.metricsService.creationRequestsTotal.inc({ engine_mode: engineMode });

    switch (engineMode) {
      case 'IMAGE_DRIVEN':
        return this.createImageDrivenCreation(dto);
      case 'PROMPT_DRIVEN':
        return this.createPromptDrivenCreation(dto);
      case 'SCRIPT_DRIVEN':
      default:
        return this.createScriptDrivenCreation(dto);
    }
  }

  /**
   * SCRIPT_DRIVEN: 用户提供已有的 product_id + script_id，直接创建创作
   */
  private async createScriptDrivenCreation(dto: CreateCreationDto): Promise<CreateCreationResponse> {
    if (!dto.script_id) {
      throw serviceException(
        { message: 'SCRIPT_DRIVEN 模式必须提供 script_id', error: { code: 'SCRIPT_REQUIRED', retryable: false } },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { product, script } = await this.validateProductAndScript(
      dto.product_id,
      dto.script_id,
    );

    return this.executeCreationPipeline(dto, product, script.id, script.shots, script.styleVibe, script.language ?? 'zh-CN', undefined, script.generationMode);
  }

  /**
   * IMAGE_DRIVEN: 用户上传商品主图 → 识别 Product → 自动生成 Script → 创建创作
   * 要求传入 material_id（已有的 PRODUCT_MAIN_IMAGE 素材）
   */
  private async createImageDrivenCreation(dto: CreateCreationDto): Promise<CreateCreationResponse> {
    if (!dto.material_id) {
      throw serviceException(
        { message: 'IMAGE_DRIVEN 模式必须提供 material_id（PRODUCT_MAIN_IMAGE 素材 UUID）', error: { code: 'MATERIAL_REQUIRED', retryable: false } },
        HttpStatus.BAD_REQUEST,
      );
    }

    const material = await this.materialRepository.findMaterialById(dto.material_id);
    if (!material) {
      throw serviceException(
        { message: `素材不存在: ${dto.material_id}`, error: { code: 'MATERIAL_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    const effectiveProductId: string = dto.product_id ?? material.productId ?? '';
    if (!effectiveProductId) {
      throw serviceException(
        { message: '素材未绑定商品，请先上传素材时启用 auto_recognize_product', error: { code: 'PRODUCT_NOT_FOUND', retryable: false } },
        HttpStatus.BAD_REQUEST,
      );
    }

    const productRecord = await this.productRepository.findProductById(effectiveProductId);
    if (!productRecord) {
      throw serviceException(
        { message: `商品不存在: ${effectiveProductId}`, error: { code: 'PRODUCT_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }
    const product = productRecord as unknown as ProductInfo;

    let scriptShots: ScriptShotInfo[];
    let scriptId: string;
    if (dto.script_id) {
      const scriptResult = await this.validateProductAndScript(effectiveProductId, dto.script_id);
      scriptShots = scriptResult.script.shots;
      scriptId = scriptResult.script.id;
    } else {
      const sellingPoints = Array.isArray(product.sellingPoints) ? product.sellingPoints as string[] : [];
      const aspectRatio = (dto.aspect_ratio || '9:16') as '9:16' | '16:9';

      // 调用视觉模型分析素材图片，增强剧本生成准确性
      let imageAnalysis: string | undefined;
      try {
        const visionResult = await this.materialService.analyzeMaterialVision(dto.material_id);

        // 用视觉分析结果增强卖点
        if (visionResult.visual_selling_points?.length) {
          const merged = new Set([...sellingPoints, ...visionResult.visual_selling_points]);
          sellingPoints.length = 0;
          sellingPoints.push(...merged);
        }

        // 构建图片分析文本上下文，注入 LLM 剧本生成 Prompt
        const analysisParts: string[] = [];
        if (visionResult.product_features?.length) {
          analysisParts.push(`商品视觉特征: ${visionResult.product_features.join('、')}`);
        }
        if (visionResult.style_tags?.length) {
          analysisParts.push(`视觉风格: ${visionResult.style_tags.join('、')}`);
        }
        if (visionResult.quality_assessment) {
          analysisParts.push(`画质: ${visionResult.quality_assessment.clarity}, 光线: ${visionResult.quality_assessment.lighting}, 构图: ${visionResult.quality_assessment.composition}`);
        }
        if (visionResult.shot_suggestions?.length) {
          const sorted = [...visionResult.shot_suggestions].sort((a, b) => b.priority - a.priority);
          analysisParts.push(`推荐分镜类型: ${sorted.map(s => `${s.shot_type}(${s.description})`).join('; ')}`);
        }
        if (analysisParts.length > 0) {
          imageAnalysis = analysisParts.join('\n');
          this.logger.log(`IMAGE_DRIVEN: vision analysis completed for material ${dto.material_id}`);
        }
      } catch (err) {
        this.logger.warn(`IMAGE_DRIVEN: vision analysis failed for material ${dto.material_id}, proceeding with text-only context: ${err}`);
      }

      const quickDto: ScriptQuickGenerateDto = {
        product_id: effectiveProductId,
        title: product.title,
        selling_points: sellingPoints.length > 0 ? sellingPoints : ['品质可靠', '设计精良'],
        style_vibe: dto.style_vibe || 'professional',
        aspect_ratio: aspectRatio,
        language: 'zh-CN',
        image_analysis: imageAnalysis,
      };

      this.logger.log(`IMAGE_DRIVEN: auto-generating quick script for product ${effectiveProductId}`);
      const generatedScript: ScriptType = await this.scriptService.generateQuickScript(quickDto);
      scriptId = generatedScript.script_id;
      scriptShots = generatedScript.shots.map((s: ScriptShot) => this.mapScriptShotToScriptShotInfo(s));
    }

    // 提取素材图片 URL，供 Worker 端 Seedance I2V 使用
    const materialImageUrl = material.originUrl ?? undefined;

    return this.executeCreationPipeline(dto, product, scriptId, scriptShots, dto.style_vibe, 'zh-CN', materialImageUrl, 'IMAGE_DRIVEN');
  }

  /**
   * PROMPT_DRIVEN: 用户输入商品链接或手动填写商品信息 → 创建/解析 Product → 自动生成 Script → 创建创作
   */
  private async createPromptDrivenCreation(dto: CreateCreationDto): Promise<CreateCreationResponse> {
    let effectiveProductId = dto.product_id;

    if (!effectiveProductId) {
      let productTitle = dto.product_title || '未命名商品';
      let productCategory = dto.product_category || 'Other';
      let sellingPoints = dto.product_selling_points || ['品质可靠', '设计精良'];

      if (dto.product_url && this.urlParser) {
        this.logger.log(`PROMPT_DRIVEN: parsing product URL: ${dto.product_url}`);
        const parsed = await this.urlParser.parseUrl(dto.product_url);
        productTitle = parsed.title || productTitle;
        productCategory = parsed.category || productCategory;
        sellingPoints = parsed.selling_points.length > 0 ? parsed.selling_points : sellingPoints;
      }

      const createdProduct = await this.productRepository.createProduct({
        id: randomUUID(),
        title: productTitle,
        skuCode: `SKU-AUTO-${randomUUID().slice(0, 8).toUpperCase()}`,
        category: productCategory,
        sellingPoints,
      });

      effectiveProductId = (createdProduct as Record<string, unknown>).id as string;
      this.logger.log(`PROMPT_DRIVEN: created product ${effectiveProductId} (${productTitle})`);
    }

    const productRecord2 = await this.productRepository.findProductById(effectiveProductId);
    if (!productRecord2) {
      throw serviceException(
        { message: `商品不存在: ${effectiveProductId}`, error: { code: 'PRODUCT_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }
    const product = productRecord2 as unknown as ProductInfo;

    let scriptShots: ScriptShotInfo[];
    let scriptId: string;
    if (dto.script_id) {
      const scriptResult = await this.validateProductAndScript(effectiveProductId, dto.script_id);
      scriptShots = scriptResult.script.shots;
      scriptId = scriptResult.script.id;
    } else {
      const sellingPoints = Array.isArray(product.sellingPoints) ? product.sellingPoints as string[] : [];
      const aspectRatio = (dto.aspect_ratio || '9:16') as '9:16' | '16:9';

      const quickDto: ScriptQuickGenerateDto = {
        product_id: effectiveProductId,
        title: product.title,
        selling_points: sellingPoints.length > 0 ? sellingPoints : ['品质可靠', '设计精良'],
        style_vibe: dto.style_vibe || 'professional',
        aspect_ratio: aspectRatio,
        language: 'zh-CN',
      };

      this.logger.log(`PROMPT_DRIVEN: auto-generating quick script for product ${effectiveProductId}`);
      const generatedScript: ScriptType = await this.scriptService.generateQuickScript(quickDto);
      scriptId = generatedScript.script_id;
      scriptShots = generatedScript.shots.map((s: ScriptShot) => this.mapScriptShotToScriptShotInfo(s));
    }

    return this.executeCreationPipeline(dto, product, scriptId, scriptShots, dto.style_vibe, 'zh-CN', undefined, 'PROMPT_DRIVEN');
  }

  /** 将共享类型 ScriptShot 映射为内部 ScriptShotInfo */
  private mapScriptShotToScriptShotInfo(shot: ScriptShot): ScriptShotInfo {
    return {
      id: shot.id,
      shotId: shot.shot_id ?? null,
      shotIndex: shot.shot_index,
      duration: shot.duration,
      sceneDescriptionQuery: shot.scene_description_query,
      visualDescription: shot.visual_description,
      cameraMovement: shot.camera_movement,
      transitionType: shot.transition_type,
      voiceoverText: shot.voiceover_text,
      subtitleText: shot.subtitle_text,
      selectedSliceId: shot.selected_slice_id ?? null,
      complianceStatus: shot.compliance_status,
      bgmSegment: (shot.bgm_segment as unknown as Record<string, unknown>) ?? null,
    };
  }

  /**
   * 核心创作流水线：公有方法，由各 engine_mode 调用
   */
  private async executeCreationPipeline(
    dto: CreateCreationDto,
    product: ProductInfo,
    scriptId: string,
    shots: ScriptShotInfo[],
    scriptStyleVibe?: string,
    scriptLanguage?: string,
    materialImageUrl?: string,
    generationMode?: string,
  ): Promise<CreateCreationResponse> {
    // 分镜数量校验
    if (shots.length === 0) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.SCRIPT_NO_SHOTS_GENERATED,
          error: { code: 'SCRIPT_NO_SHOTS', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (shots.length > CREATION_CONSTANTS.MAX_SHOTS_PER_CREATION) {
      throw serviceException(
        {
          message: `分镜数量不能超过 ${CREATION_CONSTANTS.MAX_SHOTS_PER_CREATION} 个，当前为 ${shots.length} 个`,
          error: { code: 'SHOTS_LIMIT_EXCEEDED', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { creationId, taskId, traceId } = await this.generateCreationIdentifiers();

    const creationParams = this.buildCreationParams(dto, creationId, taskId, traceId, scriptId);

    const targetLanguage = dto.target_language ?? CREATION_CONSTANTS.DEFAULT_TARGET_LANGUAGE;
    const effectiveLanguage = scriptLanguage ?? 'zh-CN';

    const jobShots = await this.buildJobShots(
      shots,
      dto.voice_profile ?? CREATION_CONSTANTS.DEFAULT_VOICE_PROFILE,
      product.id,
      product.coverImageUrl,
      dto.prefer_ai_video ?? false,
      effectiveLanguage,
      targetLanguage,
      scriptId,
      dto.slice_match_strategy ?? 'AUTO',
      dto.preferred_material_ids,
      dto.shot_slice_bindings,
      materialImageUrl,
      generationMode,
    );

    const matchedSliceIds = new Map<number, string | null>();
    for (const jobShot of jobShots) {
      const shot = shots.find(s => (s.shotId ?? s.id) === jobShot.shot_id);
      if (shot && shot.shotIndex != null) {
        matchedSliceIds.set(shot.shotIndex, jobShot.selected_slice_id ?? null);
      }
    }

    const creation = await this.persistCreationRecordWithShotRenders(creationParams, shots, matchedSliceIds);

    await this.enqueueCreationJob({
      creation_id: creationId,
      task_id: taskId,
      product_id: product.id,
      script_id: scriptId,
      trace_id: traceId,
      voice_profile: dto.voice_profile ?? CREATION_CONSTANTS.DEFAULT_VOICE_PROFILE,
      bgm_policy: dto.bgm_policy ?? CREATION_CONSTANTS.DEFAULT_BGM_POLICY,
      force_refresh: dto.force_refresh ?? false,
      target_resolution: creationParams.targetResolution,
      style_vibe: scriptStyleVibe,
      target_language: targetLanguage !== 'zh-CN' ? targetLanguage : undefined,
      bgm_segments: shots.map((shot) => ({
        shot_index: shot.shotIndex,
        style: (shot.bgmSegment as Record<string, unknown>)?.style as string || '',
        energy_level: ((shot.bgmSegment as Record<string, unknown>)?.energy_level as string || 'mid') as 'low' | 'mid' | 'high',
        beat_pattern: (shot.bgmSegment as Record<string, unknown>)?.beat_pattern as string || '',
      })).filter(s => s.style?.trim()),
      shots: jobShots,
    });

    return this.mapToCreateCreationResponse(creation);
  }

  private resolveMediaUrl(url: string | null | undefined): string | undefined {
    return resolveWorkerAssetUrl(url);
  }

  private mapSliceRowToMediaRef(row: {
    sliceId: string;
    keyFrameUrl?: string | null;
    streamUrl?: string | null;
  }): SliceMediaRef {
    return {
      sliceId: row.sliceId,
      keyFrameUrl: row.keyFrameUrl
        ? (this.resolveMediaUrl(row.keyFrameUrl) ?? row.keyFrameUrl)
        : null,
      streamUrl: row.streamUrl
        ? (this.resolveMediaUrl(row.streamUrl) ?? row.streamUrl)
        : null,
    };
  }

  private async buildJobShots(
    shots: ScriptShotInfo[],
    voiceProfile: string,
    productId: string,
    productCoverImageUrl: string | null,
    preferAiVideo = false,
    scriptLanguage = 'zh-CN',
    targetLanguage = 'zh-CN',
    scriptId?: string,
    sliceMatchStrategy: string = 'AUTO',
    preferredMaterialIds?: string[],
    shotSliceBindings?: Record<number, string>,
    materialImageUrl?: string,
    generationMode?: string,
  ): Promise<CreationJobPayload['shots']> {
    const productCover = this.resolveMediaUrl(productCoverImageUrl);
    // IMAGE_DRIVEN 模式下，素材图片 URL 作为兜底，确保 Worker 有可用的 I2V 输入
    const materialCover = materialImageUrl ? this.resolveMediaUrl(materialImageUrl) : undefined;
    const needTranslation = targetLanguage !== 'zh-CN' && targetLanguage !== scriptLanguage;

    // Phase 3: 顺序处理分镜以支持多样性追踪 (sessionStyles 跨分镜累积)
    // 用于防止同一次创作中重复使用相同风格的切片
    const sessionStyles = new Set<string>();
    const jobShots: CreationJobPayload['shots'] = [];

    for (const shot of shots) {
        const matched = preferAiVideo
          ? await this.findBestSliceForShot(shot, productId, preferredMaterialIds, sessionStyles, generationMode)
          : await this.resolveSliceForShot(shot, productId, shotSliceBindings, sliceMatchStrategy, preferredMaterialIds, sessionStyles);

        const baseImageUrl = matched?.keyFrameUrl ?? productCover ?? materialCover ?? undefined;
        const fallbackVideoUrl = matched?.streamUrl ?? undefined;

        if (matched?.sliceId) {
          this.logger.debug(
            `Shot ${shot.shotIndex}: slice=${matched.sliceId} → Seedance base image=${baseImageUrl ? 'yes' : 'no'}, fallback_video=${fallbackVideoUrl ? 'yes' : 'no'}`,
          );
        }

        // 翻译旁白/字幕
        let voiceoverText = shot.voiceoverText;
        let subtitleText = shot.subtitleText || shot.voiceoverText;

        if (needTranslation) {
          const langName = this.langCodeToName(targetLanguage);

          if (subtitleText?.trim()) {
            if (this.subtitleTranslationService && scriptId) {
              try {
                const translations = await this.subtitleTranslationService.getTranslationsForCreation(scriptId, targetLanguage);
                const preTranslated = translations.get(Number(shot.shotIndex));
                if (preTranslated) {
                  subtitleText = preTranslated;
                  this.logger.debug(`Shot ${shot.shotIndex}: using DB-cached ${targetLanguage} translation`);
                } else {
                  subtitleText = await this.translateText(subtitleText, targetLanguage, langName);
                }
              } catch {
                subtitleText = await this.translateText(subtitleText, targetLanguage, langName);
              }
            } else {
              subtitleText = await this.translateText(subtitleText, targetLanguage, langName);
            }
          }

          if (voiceoverText?.trim()) {
            voiceoverText = await this.translateText(voiceoverText, targetLanguage, langName);
          }
        }

        this.logger.log(
          `[Creation] Shot ${shot.shotIndex} (${shot.shotId ?? shot.id}): ` +
          `image_url=${baseImageUrl ? 'provided' : 'none'}, ` +
          `slice=${matched?.sliceId || 'auto-matched'}, ` +
          `fallback_video=${fallbackVideoUrl ? 'provided' : 'none'}`,
        );

        // Phase 3: 追踪已选切片的 style_tags，用于后续分镜的多样性计算
        if (matched?.sliceId) {
          try {
            const sliceInfo = await this.materialRepository.findSlicesByIds([matched.sliceId]);
            const styleTags = (sliceInfo as any)?.[0]?.slice_dimension_tags as string[] || [];
            styleTags.forEach((t: string) => sessionStyles.add(t));
          } catch {
            // 多样性追踪失败不阻塞主流程
          }
        }

        jobShots.push({
          shot_id: shot.shotId ?? shot.id,
          shot_index: shot.shotIndex,
          duration: shot.duration,
          visual_description: shot.visualDescription,
          voiceover: voiceoverText,
          subtitle_text: subtitleText,
          voice_profile: voiceProfile,
          image_url: baseImageUrl,
          selected_slice_id: matched?.sliceId,
          selected_slice_url: fallbackVideoUrl,
          scene_description_query: shot.sceneDescriptionQuery,
          camera_movement: shot.cameraMovement,
          transition_type: shot.transitionType,
        });
      }

    return jobShots;
  }

  /** 为分镜解析素材：预选切片优先，否则智能匹配 */
  private async resolveSliceForShot(
    shot: ScriptShotInfo,
    productId: string,
    shotSliceBindings?: Record<number, string>,
    sliceMatchStrategy: string = 'AUTO',
    preferredMaterialIds?: string[],
    sessionStyles?: Set<string>,
  ): Promise<SliceMediaRef | null> {
    // First check shot_slice_bindings for manual override
    if (shotSliceBindings && typeof shotSliceBindings[shot.shotIndex] === 'string') {
      const boundSliceId = shotSliceBindings[shot.shotIndex];
      const sliceRows = await this.materialRepository.findSlicesByIds([boundSliceId]);
      const row = Array.isArray(sliceRows) && sliceRows.length > 0 ? sliceRows[0] : null;
      if (row) {
        this.logger.log(`Shot ${shot.shotIndex}: using manually bound slice ${boundSliceId}`);
        return this.mapSliceRowToMediaRef(row as unknown as { sliceId: string; keyFrameUrl: string | null; streamUrl: string | null });
      }
      this.logger.warn(`Bound slice ${boundSliceId} not found for shot_index=${shot.shotIndex}`);
    }

    // Check existing selectedSliceId
    if (shot.selectedSliceId) {
      const sliceRows = await this.materialRepository.findSlicesByIds([shot.selectedSliceId]);
      const row = Array.isArray(sliceRows) && sliceRows.length > 0 ? sliceRows[0] : null;
      if (row) {
        return this.mapSliceRowToMediaRef(row as unknown as { sliceId: string; keyFrameUrl: string | null; streamUrl: string | null });
      }
    }

    // MANUAL strategy: no auto-match, return null
    if (sliceMatchStrategy === 'MANUAL') {
      this.logger.log(`Shot ${shot.shotIndex}: MANUAL strategy, no auto-match performed`);
      return null;
    }

    // AUTO or AUTO_WITH_PREFERRED: use preferredMaterialIds to constrain search
    return this.findBestSliceForShot(shot, productId, preferredMaterialIds, sessionStyles);
  }

  // ===========================================================================
  // F3: findBestSliceForShot — 素材切片智能匹配（供 Seedance 底图）
  // 策略:
  //   1. 如果 shot.selectedSliceId 已指定，直接使用该切片
  //   2. 如果脚本有 sceneDescriptionQuery，通过关键词匹配查找最佳切片
  //   3. 返回 keyFrameUrl 作 Seedance 首帧、streamUrl 作失败兜底；无匹配则用商品封面
  // ===========================================================================

  private async findBestSliceForShot(
    shot: ScriptShotInfo,
    productId: string,
    preferredMaterialIds?: string[],
    sessionStyles?: Set<string>,
    generationMode?: string,
  ): Promise<SliceMediaRef | null> {
    // 策略1: 直接使用已选定的切片
    if (shot.selectedSliceId) {
      const sliceRows = await this.materialRepository.findSlicesByIds([shot.selectedSliceId]);
      const sliceRow = (sliceRows as unknown as Array<{
        sliceId: string;
        keyFrameUrl: string | null;
        streamUrl: string | null;
      }>)[0];
      if (sliceRow) {
        await this.materialRepository.incrementSliceUsageCount(shot.selectedSliceId);
        return this.mapSliceRowToMediaRef(sliceRow);
      }
    }

    // Resolve candidate slices from preferred material IDs
    let candidateSliceIds: string[] | undefined;
    if (preferredMaterialIds && preferredMaterialIds.length > 0) {
      const materialSlices = await this.materialRepository.findSlicesByMaterialIds(preferredMaterialIds);
      if (materialSlices && materialSlices.length > 0) {
        candidateSliceIds = materialSlices.map((s: any) => s.sliceId);
      }
      if (!candidateSliceIds || candidateSliceIds.length === 0) {
        this.logger.warn(`No slices found for preferred materials ${preferredMaterialIds.join(',')}, falling back to global search`);
        candidateSliceIds = undefined;
      }
    }

    // 策略2: 通过 sceneDescriptionQuery 做语义向量检索 (需求5: 打通 Qdrant 检索路径)
    if (!shot.sceneDescriptionQuery || shot.sceneDescriptionQuery.trim().length === 0) {
      return null;
    }

    try {
      // 调用 MaterialService 语义检索 (FUSION 模式: 并行向量+关键词 RRF 融合)
      const searchResult = await this.materialService.searchMaterialSlices({
        product_id: productId,
        query: shot.sceneDescriptionQuery,
        search_mode: 'FUSION',
        type: 'VIDEO',
        status: 'COMPLETED',
        limit: 10,
      } as unknown as Record<string, unknown> & { product_id: string });

      // If candidate slice IDs are specified, filter search results
      let rawItems: any[];
      if (searchResult) {
        // searchResults structure varies; handle both array and {items} forms
        rawItems = Array.isArray(searchResult) ? searchResult : (searchResult as any)?.items || [];
      } else {
        rawItems = [];
      }

      if (candidateSliceIds && candidateSliceIds.length > 0) {
        const candidateSet = new Set(candidateSliceIds);
        rawItems = rawItems.filter((item: any) => candidateSet.has(item.slice_id));
        this.logger.debug(`Filtered search results to ${rawItems.length} items from preferred materials`);
      }

      const candidateSlices = rawItems;
      if (candidateSlices.length === 0) {
        // 语义检索无结果，回退到关键词内存匹配
        return this.fallbackKeywordMatch(shot, productId);
      }

      // 对语义检索结果做后处理排序: semantic + duration + visual + diversity + dimension
      let bestMatch: { sliceId: string; keyFrameUrl: string | null; streamUrl: string | null; score: number } | null = null;

      // 根据 shot 的场景描述判断偏重的维度
      const query = shot.sceneDescriptionQuery.toLowerCase();
      const dimensionWeights = this.computeDimensionWeights(query);

      for (const slice of candidateSlices) {
        if (!slice.stream_url && !slice.key_frame_url) {
          continue;
        }

        const sliceDuration = slice.duration || 0;
        const durationDiff = Math.abs(sliceDuration - shot.duration);
        const durationScore = shot.duration > 0 ? Math.max(0, 1 - durationDiff / shot.duration) : 0;

        // 语义相似度 (Qdrant score 或 RRF score)
        const semanticScore = slice.score ?? 0;

        // Phase 3: 视觉质量评分 (从 vision_analysis 的 quality_assessment 获取)
        const visionQuality = (slice as any).vision_quality ?? 0.5;
        const visualScore = Math.max(0, Math.min(1, visionQuality));

        // Phase 3: 多样性奖励 (替代 hotBoost，惩罚已被同 session 选过的 style_tags)
        const styleTags = (slice as any).style_tags as string[] || [];
        const diversityPenalty = sessionStyles && styleTags.length > 0
          ? styleTags.filter((t: string) => sessionStyles.has(t)).length / Math.max(1, styleTags.length)
          : 0;
        const diversityBonus = 1 - diversityPenalty; // 0 = 全部重复, 1 = 完全新颖

        // 三层维度标签匹配加分
        const dimensionBonus = this.computeDimensionBonus(slice, query, dimensionWeights);

        // Phase 3 新评分公式:
        // semanticScore × 0.35 + visualScore × 0.15 + durationScore × 0.20 + diversityBonus × 0.15 + dimensionBonus × 0.15
        let totalScore = semanticScore * 0.35 + visualScore * 0.15 + durationScore * 0.20 + diversityBonus * 0.15 + dimensionBonus * 0.15;

        // Phase 4: 模式差异化评分调整
        switch (generationMode) {
          case 'PROMPT_DRIVEN':
            // 强调视觉多样性: diversityBonus 权重从 0.15 提升到 0.25
            totalScore = semanticScore * 0.30 + visualScore * 0.15 + durationScore * 0.15 + diversityBonus * 0.25 + dimensionBonus * 0.15;
            break;
          case 'VIRAL_REWRITE':
            // 偏好与爆款视频风格标签匹配的切片
            // style_match 通过 dimensionBonus 中 product_dimension_tags 隐式捕捉
            // 提升 durationScore 权重以适合快速剪辑
            totalScore = semanticScore * 0.35 + visualScore * 0.10 + durationScore * 0.25 + diversityBonus * 0.15 + dimensionBonus * 0.15;
            break;
          case 'TEMPLATE_DRIVEN':
            // 偏好与模板 camera_patterns 匹配的切片 (通过 video_dimension_tags 捕捉)
            // dimensionBonus 中 video 维度权重翻倍效果由 computeDimensionWeights 处理
            totalScore = semanticScore * 0.30 + visualScore * 0.15 + durationScore * 0.20 + diversityBonus * 0.10 + dimensionBonus * 0.25;
            break;
          case 'BATCH':
            // 强制多样性: diversityBonus 权重最大化
            totalScore = semanticScore * 0.25 + visualScore * 0.15 + durationScore * 0.20 + diversityBonus * 0.30 + dimensionBonus * 0.10;
            break;
          case 'COMPOSED':
            // VIRAL + TEMPLATE 融合: 均匀混合
            totalScore = semanticScore * 0.30 + visualScore * 0.15 + durationScore * 0.20 + diversityBonus * 0.15 + dimensionBonus * 0.20;
            break;
          case 'HYBRID':
            // 用户因子主导: 维度匹配权重最大 (user_factors 在 create-dto 中传递)
            totalScore = semanticScore * 0.30 + visualScore * 0.10 + durationScore * 0.20 + diversityBonus * 0.10 + dimensionBonus * 0.30;
            break;
          default:
            // 保持默认公式不变
            break;
        }

        if (totalScore > 0 && (!bestMatch || totalScore > bestMatch.score)) {
          bestMatch = {
            sliceId: slice.slice_id,
            keyFrameUrl: slice.key_frame_url,
            streamUrl: slice.stream_url,
            score: totalScore,
          };
        }
      }

      if (bestMatch && bestMatch.score >= CREATION_CONSTANTS.SLICE_MATCH_SCORE_THRESHOLD) {
        this.logger.debug(
          `Slice matched (vector): shot=${shot.shotIndex}, slice=${bestMatch.sliceId}, score=${bestMatch.score.toFixed(2)}`,
        );
        // 更新热度计数
        await this.materialRepository.incrementSliceUsageCount(bestMatch.sliceId);
        return {
          sliceId: bestMatch.sliceId,
          keyFrameUrl: bestMatch.keyFrameUrl
            ? (this.resolveMediaUrl(bestMatch.keyFrameUrl) ?? bestMatch.keyFrameUrl)
            : null,
          streamUrl: bestMatch.streamUrl
            ? (this.resolveMediaUrl(bestMatch.streamUrl) ?? bestMatch.streamUrl)
            : null,
        };
      }

      // 语义检索得分低，回退关键词匹配
      return this.fallbackKeywordMatch(shot, productId, sessionStyles);
    } catch (error) {
      this.logger.warn(
        `Vector search failed for shot=${shot.shotIndex}, falling back to keyword match: ${(error as Error).message}`,
      );
      return this.fallbackKeywordMatch(shot, productId, sessionStyles);
    }
  }

  /**
   * 关键词匹配兜底 (原 findBestSliceForShot 的逻辑，增加了同义词扩展)
   * 增强：从多个文本源提取关键词；产品级无结果时回退到全局搜索
   */
  private async fallbackKeywordMatch(
    shot: ScriptShotInfo,
    productId: string,
    sessionStyles?: Set<string>,
  ): Promise<SliceMediaRef | null> {
    // 多源关键词提取: sceneDescriptionQuery + visualDescription + voiceoverText
    const queryTexts = [
      shot.sceneDescriptionQuery || '',
      shot.visualDescription || '',
      shot.voiceoverText || '',
    ].filter(Boolean);
    const combinedText = queryTexts.join(' ');
    const rawKeywords = this.extractKeywords(combinedText);
    if (rawKeywords.length === 0) {
      return null;
    }
    const keywords = this.synonymService.expandKeywords(rawKeywords);

    let allSlices = await this.materialRepository.findSlicesByProductId(productId, {
      status: 'COMPLETED',
      limit: 100,
    });

    // 产品级无切片时回退到全局搜索
    if (allSlices.length === 0) {
      this.logger.debug(`fallbackKeywordMatch: no slices for product ${productId}, trying global search`);
      allSlices = await this.materialRepository.findAllCompletedSlices(100);
    }

    if (allSlices.length === 0) {
      return null;
    }

    let bestMatch: { sliceId: string; keyFrameUrl: string | null; streamUrl: string | null; score: number } | null = null;

    for (const slice of allSlices) {
      if (!slice.streamUrl && !slice.keyFrameUrl) {
        continue;
      }

      const sliceDuration = Number(slice.duration);
      const durationDiff = Math.abs(sliceDuration - shot.duration);
      const durationScore = Math.max(0, 1 - durationDiff / shot.duration);

      const caption = (slice.denseCaption || '').toLowerCase();
      const tagsJson = slice.tags;
      const tagsText = Array.isArray(tagsJson) ? tagsJson.join(' ').toLowerCase() : '';
      const textToMatch = `${caption} ${tagsText}`.toLowerCase();

      let matchCount = 0;
      for (const keyword of keywords) {
        if (textToMatch.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }
      const keywordScore = keywords.length > 0 ? matchCount / keywords.length : 0;

      // 综合评分: 关键词权重 0.7，时长权重 0.3
      const totalScore = keywordScore * 0.7 + durationScore * 0.3;

      if (totalScore > 0 && (!bestMatch || totalScore > bestMatch.score)) {
        bestMatch = {
          sliceId: slice.sliceId,
          keyFrameUrl: slice.keyFrameUrl ?? null,
          streamUrl: slice.streamUrl ?? null,
          score: totalScore,
        };
      }
    }

    if (bestMatch && bestMatch.score >= 0.3) {
      this.logger.debug(
        `Slice matched (keyword): shot=${shot.shotIndex}, slice=${bestMatch.sliceId}, score=${bestMatch.score.toFixed(2)}`,
      );
      // 更新热度计数
      await this.materialRepository.incrementSliceUsageCount(bestMatch.sliceId);
      return {
        sliceId: bestMatch.sliceId,
        keyFrameUrl: bestMatch.keyFrameUrl
          ? (this.resolveMediaUrl(bestMatch.keyFrameUrl) ?? bestMatch.keyFrameUrl)
          : null,
        streamUrl: bestMatch.streamUrl
          ? (this.resolveMediaUrl(bestMatch.streamUrl) ?? bestMatch.streamUrl)
          : null,
      };
    }

    return null;
  }

  /**
   * 从英文文本中提取有意义的关键词
   * 过滤停用词、提取名词和形容词
   */
  private extractKeywords(text: string): string[] {
    // 输入长度守卫，防止超长文本导致 ReDoS 或 OOM
    if (text.length > CREATION_CONSTANTS.MAX_KEYWORD_EXTRACTION_TEXT_LENGTH) {
      this.logger.warn(
        `extractKeywords: text truncated from ${text.length} to ${CREATION_CONSTANTS.MAX_KEYWORD_EXTRACTION_TEXT_LENGTH} chars`,
      );
      text = text.slice(0, CREATION_CONSTANTS.MAX_KEYWORD_EXTRACTION_TEXT_LENGTH);
    }

    // 提取英文单词
    const englishWords = text.match(/[a-zA-Z]{3,}/g) || [];

    // 提取中文关键词（连续中文字符 >= 2 个）
    const chineseWords = text.match(/[\u4e00-\u9fff]{2,}/g) || [];

    // 合并并去重（使用模块级常量，避免每次调用新建 Set）
    return [...new Set([
      ...chineseWords.filter(w => !CHINESE_STOP_WORDS.has(w)),
      ...englishWords
        .filter(w => !ENGLISH_STOP_WORDS.has(w.toLowerCase()))
        .map(w => w.toLowerCase()),
    ])];
  }

  // ===========================================================================
  // 多语种翻译辅助方法
  // ===========================================================================

  /**
   * 将 ISO 639-1 语种代码转为中文名
   */
  private langCodeToName(code: string): string {
    const map: Record<string, string> = {
      'zh-CN': '中文',
      'en-US': '英文',
      'ja-JP': '日语',
      'ko-KR': '韩语',
      'th-TH': '泰语',
      'id-ID': '印尼语',
      'es-ES': '西班牙语',
    };
    return map[code] || code;
  }

  /**
   * 使用 Doubao AI 将文本翻译为目标语种
   */
  private async translateText(text: string, targetLang: string, langName: string): Promise<string> {
    try {
      const systemPrompt = CREATION_CONSTANTS.TRANSLATION_SYSTEM_PROMPT(langName, targetLang);
      const result = await this.doubaoText.generateText(systemPrompt, text);
      if (!result) {
        throw serviceException(
          {
            message: 'Doubao returned empty translation result',
            error: { code: 'AI_TRANSLATION_EMPTY', retryable: true },
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
      this.logger.debug(`Translated to ${langName}: "${text.substring(0, 30)}..." → "${result.substring(0, 30)}..."`);
      return result;
    } catch (error) {
      const errMsg = (error as Error).message;
      this.logger.error(`Translation to ${langName} failed: ${errMsg}`);
      throw serviceException(
        {
          message: `翻译服务不可用（目标语言：${langName}），请稍后重试`,
          error: {
            code: 'TRANSLATION_FAILED',
            details: { target_lang: targetLang },
            retryable: true,
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // ===========================================================================
  // 三层维度标签匹配辅助方法
  // ===========================================================================

  /**
   * 根据 shot 的场景描述 query 推断对各维度的权重需求
   * product 维度: 商品展示/外观/整体 → 侧重商品维度标签匹配
   * video 维度: 运镜/光影/节奏 → 侧重视频维度标签匹配
   * slice 维度: 特写/细节/动作 → 侧重切片维度标签匹配
   */
  private computeDimensionWeights(query: string): { product: number; video: number; slice: number } {
    const q = query.toLowerCase();
    let productW = 0.33;
    let videoW = 0.33;
    let sliceW = 0.34;

    // 商品维度倾向词
    const productKeywords = ['product', 'showcase', '商品', '展示', '外观', '整体', '全景', 'full', 'overview', 'package', '包装'];
    // 视频维度倾向词
    const videoKeywords = ['camera', '运镜', 'light', '光影', '节奏', 'tempo', 'pan', 'zoom', 'tracking', 'dolly', 'aerial'];
    // 切片维度倾向词
    const sliceKeywords = ['close', 'detail', '特写', '细节', 'macro', 'texture', '动作', 'action', 'hand', 'use', '使用'];

    for (const kw of productKeywords) {
      if (q.includes(kw)) { productW += 0.15; videoW -= 0.08; sliceW -= 0.07; }
    }
    for (const kw of videoKeywords) {
      if (q.includes(kw)) { videoW += 0.15; productW -= 0.08; sliceW -= 0.07; }
    }
    for (const kw of sliceKeywords) {
      if (q.includes(kw)) { sliceW += 0.15; productW -= 0.08; videoW -= 0.07; }
    }

    // 归一化到 [0,1] 并保证和 = 1
    const total = productW + videoW + sliceW;
    if (total <= 0) return { product: 0.33, video: 0.33, slice: 0.34 };
    return {
      product: Math.max(0, productW / total),
      video: Math.max(0, videoW / total),
      slice: Math.max(0, sliceW / total),
    };
  }

  /**
   * 计算切片三层维度标签与 shot 查询的匹配加分
   */
  private computeDimensionBonus(
    slice: { product_dimension_tags?: string[]; video_dimension_tags?: string[]; slice_dimension_tags?: string[]; tags?: unknown },
    _query: string,
    weights: { product: number; video: number; slice: number },
  ): number {
    const tags = slice.tags as string[] | undefined;
    const allTags = new Set((tags || []).map(t => t.toLowerCase()));

    const productTags = (slice.product_dimension_tags || []).map(t => t.toLowerCase());
    const videoTags = (slice.video_dimension_tags || []).map(t => t.toLowerCase());
    const sliceTags2 = (slice.slice_dimension_tags || []).map(t => t.toLowerCase());

    // 如果维度标签为空，回退使用全局 tags
    const getTagSet = (dimTags: string[]) => dimTags.length > 0 ? new Set(dimTags) : allTags;

    // 按权重计算命中数：维度标签与全局 tags 的交集越多，加分越高
    const productSet = getTagSet(productTags);
    const videoSet = getTagSet(videoTags);
    const sliceSet = getTagSet(sliceTags2);

    const productHit = productSet.size > 0 ? Math.min(1, productSet.size / Math.max(1, allTags.size)) : 0;
    const videoHit = videoSet.size > 0 ? Math.min(1, videoSet.size / Math.max(1, allTags.size)) : 0;
    const sliceHit = sliceSet.size > 0 ? Math.min(1, sliceSet.size / Math.max(1, allTags.size)) : 0;

    return productHit * weights.product + videoHit * weights.video + sliceHit * weights.slice;
  }

  // ===========================================================================
  // F1: validateProductAndScript
  // ===========================================================================

  private async validateProductAndScript(
    productId: string,
    scriptId: string,
  ): Promise<ValidateResult> {
    if (!productId || typeof productId !== 'string' || productId.trim().length === 0) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.PRODUCT_ID_INVALID,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!scriptId || typeof scriptId !== 'string' || scriptId.trim().length === 0) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.SCRIPT_ID_INVALID,
          error: {
            code: 'SCRIPT_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const product = await this.repository.findProductById(productId);
    if (!product) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.PRODUCT_NOT_FOUND,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const rawScript = await this.repository.findScriptWithShots(scriptId);
    if (!rawScript) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.SCRIPT_NOT_FOUND,
          error: {
            code: 'SCRIPT_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (rawScript.productId !== productId) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.CREATION_SCRIPT_PRODUCT_MISMATCH(scriptId, productId),
          error: {
            code: 'CREATION_SCRIPT_PRODUCT_MISMATCH',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const shots: ScriptShotInfo[] = rawScript.shots.map((shot) => ({
      id: shot.id,
      shotId: shot.shotId,
      shotIndex: shot.shotIndex,
      duration: Number(shot.duration),
      sceneDescriptionQuery: shot.sceneDescriptionQuery,
      visualDescription: shot.visualDescription,
      cameraMovement: shot.cameraMovement,
      transitionType: shot.transitionType,
      voiceoverText: shot.voiceoverText,
      subtitleText: shot.subtitleText,
      selectedSliceId: shot.selectedSliceId,
      complianceStatus: shot.complianceStatus,
      bgmSegment: (shot as Record<string, unknown>).bgmSegment as Record<string, unknown> ?? null,
    }));

    const script: ScriptInfo = {
      id: rawScript.id,
      productId: rawScript.productId,
      title: rawScript.title,
      language: rawScript.language,
      videoDuration: Number(rawScript.videoDuration),
      aspectRatio: rawScript.aspectRatio,
      styleVibe: rawScript.styleVibe,
      generationMode: rawScript.generationMode,
      shots,
    };

    if (!script.shots || script.shots.length === 0) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.SCRIPT_NO_SHOTS_GENERATED,
          error: {
            code: 'SCRIPT_NO_SHOTS_GENERATED',
            retryable: false,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return { product, script };
  }

  // ===========================================================================
  // F2: generateCreationIdentifiers
  // ===========================================================================

  private async generateCreationIdentifiers(): Promise<CreationIdentifiers> {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${y}${m}${d}`;

    const creationId = randomUUID();
    const taskId = this.generateTaskId(datePrefix);
    const traceId = `trc_${datePrefix}_creation_${creationId.slice(0, 8)}`;

    return { creationId, taskId, traceId };
  }

  private generateTaskId(datePrefix: string): string {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
    return `tsk_${datePrefix}_${suffix}`;
  }

  // ===========================================================================
  // F3: buildCreationParams
  // ===========================================================================

  private buildCreationParams(
    dto: CreateCreationDto,
    creationId: string,
    taskId: string,
    traceId: string,
    scriptId?: string,
  ): CreateCreationParams {
    const now = new Date();

    return {
      id: creationId,
      productId: dto.product_id,
      scriptId: scriptId ?? dto.script_id ?? '',
      taskId,
      engineMode: dto.engine_mode ?? CREATION_CONSTANTS.DEFAULT_ENGINE_MODE,
      targetResolution: dto.target_resolution ?? CREATION_CONSTANTS.DEFAULT_TARGET_RESOLUTION,
      exportFormat: dto.export_format ?? CREATION_CONSTANTS.DEFAULT_EXPORT_FORMAT,
      traceId,
      preferAiVideo: dto.prefer_ai_video ?? false,
      createdAt: now,
      updatedAt: now,
    };
  }

  // ===========================================================================
  // F4: mapToCreateCreationResponse
  // ===========================================================================

  private mapToCreateCreationResponse(creation: {
    id: string;
    productId: string;
    scriptId: string;
    taskId: string;
    status: string;
    currentStage: string;
    progress: number;
  }): CreateCreationResponse {
    return {
      creation_id: creation.id,
      task_id: creation.taskId,
      product_id: creation.productId,
      script_id: creation.scriptId,
      status: creation.status,
      current_stage: creation.currentStage,
      progress: creation.progress,
    };
  }

  // ===========================================================================
  // F5: persistCreationRecordWithShotRenders
  // ===========================================================================

  private async persistCreationRecordWithShotRenders(
    params: CreateCreationParams,
    shots: ScriptShotInfo[],
    matchedSliceIds?: Map<number, string | null>,
  ): Promise<{
    id: string;
    productId: string;
    scriptId: string;
    taskId: string;
    status: string;
    currentStage: string;
    progress: number;
  }> {
    const now = params.createdAt;

    const shotRenderParams: CreateShotRenderParams[] = shots.map((shot) => {
      const actualSliceId = matchedSliceIds?.get(shot.shotIndex)
        ?? shot.selectedSliceId;
      return {
        id: randomUUID(),
        creationId: params.id,
        scriptShotId: shot.id,
        shotId: shot.shotId,
        shotIndex: shot.shotIndex,
        cacheHash: null,
        sliceId: actualSliceId,
        renderPath: null,
        renderDurationMs: null,
        retryCount: CREATION_CONSTANTS.SHOT_RENDER_RETRY_COUNT_INITIAL,
        status: CREATION_CONSTANTS.SHOT_RENDER_STATUS_INITIAL,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    try {
      const creation = await this.repository.createCreationWithShotRenders(params, shotRenderParams);

      return {
        id: creation.id,
        productId: creation.productId,
        scriptId: creation.scriptId,
        taskId: creation.taskId,
        status: creation.status,
        currentStage: creation.currentStage,
        progress: creation.progress,
      };
    } catch (error) {
      this.logger.error(`Failed to persist creation: ${(error as Error).message}`);
      throw this.handlePersistError(error);
    }
  }

  private handlePersistError(error: unknown): never {
    const err = error as Error & { code?: string; meta?: Record<string, unknown> };

    if (err.code === CREATION_CONSTANTS.PRISMA_ERROR_CODES.UNIQUE_CONSTRAINT) {
      const targetFields = Array.isArray(err.meta?.target)
        ? (err.meta?.target as string[]).join(', ')
        : 'unknown';

      throw serviceException(
        {
          message: `${CREATION_CONSTANTS.ERROR_MESSAGES.IDEMPOTENCY_CONFLICT} (fields: ${targetFields})`,
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            retryable: false,
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const isRetryable = CREATION_CONSTANTS.RETRYABLE_PRISMA_CODES.has(err.code ?? '');

    if (err.code === CREATION_CONSTANTS.PRISMA_ERROR_CODES.FOREIGN_KEY_CONSTRAINT) {
      this.logger.error(`${CREATION_CONSTANTS.ERROR_MESSAGES.PRISMA_FOREIGN_KEY_ERROR}: ${err.message}`, err.stack);
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.PRISMA_FOREIGN_KEY_ERROR,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (
      err.code === CREATION_CONSTANTS.PRISMA_ERROR_CODES.CONNECTION_REFUSED ||
      err.code === CREATION_CONSTANTS.PRISMA_ERROR_CODES.CONNECTION_CLOSED ||
      err.code === CREATION_CONSTANTS.PRISMA_ERROR_CODES.CONNECTION_POOL_EXHAUSTED
    ) {
      this.logger.error(`${CREATION_CONSTANTS.ERROR_MESSAGES.PRISMA_CONNECTION_ERROR}: ${err.message}`, err.stack);
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.PRISMA_CONNECTION_ERROR,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.error(`${CREATION_CONSTANTS.ERROR_MESSAGES.INTERNAL_SERVER_ERROR}: ${err.message}`, err.stack);
    throw serviceException(
      {
        message: CREATION_CONSTANTS.ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          retryable: isRetryable,
        },
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  // ===========================================================================
  // F6: enqueueCreationJob
  // ===========================================================================

  private async enqueueCreationJob(payload: CreationJobPayload): Promise<void> {
    try {
      await this.creationQueue.add(CREATION_CONSTANTS.QUEUE.CREATION_JOB_NAME, payload, {
        jobId: payload.task_id,
      });

      this.logger.log(
        `Creation job enqueued: task_id=${payload.task_id}, creation_id=${payload.creation_id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue creation job: task_id=${payload.task_id}, error=${(error as Error).message}`,
      );

      throw serviceException(
        {
          message: `${CREATION_CONSTANTS.ERROR_MESSAGES.BULLMQ_ENQUEUE_FAILED}: ${(error as Error).message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===========================================================================
  // F7: getCreationDetail — 创作任务详情查询主编排
  // ===========================================================================

  async getCreationDetail(creationId: string, productId?: string): Promise<CreationDetailResponse> {
    this.validateCreationId(creationId);

    const record = await this.repository.findCreationById(creationId);

    if (!record) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.CREATION_NOT_FOUND(creationId),
          error: {
            code: 'CREATION_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '创作任务不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return this.mapToCreationDetailResponse(record);
  }

  // ===========================================================================
  // H1: mapToCreationDetailResponse — Prisma camelCase → API snake_case 全映射
  // ===========================================================================

  private mapToCreationDetailResponse(record: CreationDetailRecord): CreationDetailResponse {
    const shotRenders: CreationDetailShotRender[] = (record.shotRenders ?? [])
      .slice()
      .sort((a, b) => a.shotIndex - b.shotIndex)
      .map((sr) => ({
        shot_render_id: sr.id,
        creation_id: sr.creationId,
        script_shot_id: sr.scriptShotId,
        shot_id: sr.shotId ?? null,
        shot_index: sr.shotIndex,
        cache_hash: sr.cacheHash ?? null,
        slice_id: sr.sliceId ?? null,
        render_path: sr.renderPath ?? null,
        render_duration_ms: sr.renderDurationMs ?? null,
        retry_count: sr.retryCount,
        source: (sr.source ?? null) as string | null,
        status: sr.status,
        error_message: sr.errorMessage ?? null,
        seedance_prompt: sr.seedancePrompt ?? undefined,
        updated_at: sr.updatedAt.toISOString(),
      })) as CreationDetailShotRender[];

    return {
      creation_id: record.id,
      product_id: record.productId,
      script_id: record.scriptId,
      task_id: record.taskId,
      engine_mode: record.engineMode,
      target_resolution: record.targetResolution,
      export_format: record.exportFormat,
      status: record.status,
      progress: record.progress,
      current_stage: record.currentStage,
      video_url: record.videoUrl ?? null,
      file_size_bytes: (() => {
        if (record.fileSizeBytes === null || record.fileSizeBytes === undefined) return null;
        const asNumber = Number(record.fileSizeBytes);
        if (!Number.isSafeInteger(asNumber)) {
          this.logger.warn(`fileSizeBytes ${record.fileSizeBytes} exceeds Number.MAX_SAFE_INTEGER, returning null to avoid precision loss`);
          return null;
        }
        return asNumber;
      })(),
      trace_id: record.traceId ?? null,
      error_code: record.errorCode ?? null,
      error_message: record.errorMessage ?? null,
      prefer_ai_video: record.preferAiVideo ?? false,
      started_at: record.startedAt ? record.startedAt.toISOString() : null,
      finished_at: record.finishedAt ? record.finishedAt.toISOString() : null,
      shot_renders: shotRenders,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    };
  }

  // ===========================================================================
  // H2: validateCreationId — UUID v4 格式严格校验
  // ===========================================================================

  private validateCreationId(creationId: string): void {
    if (!creationId || typeof creationId !== 'string' || creationId.trim().length === 0) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.CREATION_ID_INVALID,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
            details: [
              { field: 'creation_id', reason: 'creation_id 为必填字段，不能为空' },
            ],
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const trimmed = creationId.trim();

    if (!CREATION_CONSTANTS.UUID_V4_REGEX.test(trimmed)) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.CREATION_ID_NOT_UUID(creationId),
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
            details: [
              { field: 'creation_id', reason: `creation_id 不是有效的 UUID v4 格式: ${creationId}` },
            ],
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ===========================================================================
  // H3: validateCreationCancelable — 纯函数状态校验
  // 职责: 判断 Creation status 是否允许取消 (仅 PENDING/PROCESSING)
  // ===========================================================================

  private validateCreationCancelable(status: string): void {
    if (CREATION_CONSTANTS.CANCELABLE_STATUSES.has(status as CreationStatus)) return;

    const reason = CREATION_CONSTANTS.NON_CANCELABLE_STATUS_REASONS[status]
      ?? CREATION_CONSTANTS.NON_CANCELABLE_STATUS_REASONS.UNKNOWN;

    throw serviceException(
      {
        message: reason,
        error: {
          code: 'TASK_STATUS_CONFLICT',
          retryable: false,
          details: { creation_status: status, reason },
        },
      },
      HttpStatus.CONFLICT,
    );
  }

  private validateCreationRetryable(status: string): void {
    if (status === 'FAILED' || status === 'CANCELED') {
      return;
    }

    if (status === 'FINISHED') {
      throw serviceException(
        {
          message: '创作任务已完成，无需重试',
          error: {
            code: 'TASK_STATUS_CONFLICT',
            retryable: false,
            details: {
              creation_status: 'FINISHED',
              reason: 'already_finished',
            },
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    throw serviceException(
      {
        message: `当前状态不允许重试: ${status}`,
        error: {
          code: 'TASK_STATUS_CONFLICT',
          retryable: false,
          details: {
            creation_status: status,
            reason: 'not_retryable',
          },
        },
      },
      HttpStatus.CONFLICT,
    );
  }

  // ===========================================================================
  // F8: cancelCreation — 主编排器
  // 编排流程:
  //   Step1: validateCreationId(H2复用) → 格式校验
  //   Step2: findCreationById(H0复用) → 存在性校验
  //   Step3: validateCreationCancelable(H3新增) → 状态可取消校验
  //   Step4: repository.cancelCreationById(J0新增) → DB update
  //   Step5: BullMQ removeJob → [最佳努力, 失败不抛异常]
  //   Step6: return CancelCreationResponse
  // ===========================================================================

  async cancelCreation(creationId: string, productId?: string): Promise<CancelCreationResponse> {
    this.validateCreationId(creationId);

    const record = await this.repository.findCreationById(creationId);

    if (!record) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.CREATION_NOT_FOUND(creationId),
          error: {
            code: 'CREATION_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '创作任务不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    this.validateCreationCancelable(record.status);

    const canceled = await this.repository.cancelCreationById(creationId);

    if (!canceled) {
      const current = await this.repository.findCreationById(creationId);
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.CREATION_CANCEL_CONFLICT(current?.status ?? 'UNKNOWN'),
          error: {
            code: 'TASK_STATUS_CONFLICT',
            retryable: false,
            details: { current_status: current?.status },
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    this.logger.log(
      `Creation canceled: creation_id=${creationId}, task_id=${record.taskId}, ` +
      `previous_status=${record.status}`,
    );

    await this.safelyRemoveBullMqJob(record.taskId, creationId);

    return {
      creation_id: canceled.id,
      status: 'CANCELED',
    };
  }

  // ===========================================================================
  // G0: safelyRemoveBullMqJob — BullMQ 最佳努力移除 (失败不抛异常)
  // ===========================================================================

  private async safelyRemoveBullMqJob(taskId: string, creationId: string): Promise<void> {
    try {
      // Stage 1: 移除等待队列中的任务
      await this.creationQueue.remove(taskId);

      // Stage 2: 移除活跃/失败/已完成任务（getJob 可获取所有状态）
      const job = await this.creationQueue.getJob(taskId);
      if (job) {
        await job.remove();
        this.logger.log(
          `BullMQ job removed: task_id=${taskId}, creation_id=${creationId}`,
        );
      } else {
        this.logger.warn(
          `BullMQ job not found in queue: task_id=${taskId}, creation_id=${creationId}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to remove BullMQ job (best-effort, non-blocking): ` +
        `task_id=${taskId}, creation_id=${creationId}, error=${(error as Error).message}`,
      );
    }
  }

  // ===========================================================================
  // L0: listCreations — 创作任务列表查询主编排
  // 六步串行: 默认值解析 → 筛选构建 → 游标解码 → 分页查询 → item映射 → pageInfo构建
  // ===========================================================================

  async listCreations(dto: {
    product_id: string;
    status?: string;
    current_stage?: string;
    engine_mode?: string;
    export_format?: string;
    limit?: number;
    cursor?: string;
  }): Promise<CreationListResponse> {
    const params = this.resolveListDefaults(dto);

    // 尝试从数据库查询
    let creationItems: CreationListItem[] = [];
    let has_more = false;
    let next_cursor: string | null = null;
    let total_count: number | null = 0;

    try {
      const filter = this.buildListFilter(params);
      const decodedCursor = params.cursor
        ? this.repository.decodeCreationCursor(params.cursor)
        : null;

      const { items: rows, total_count: tc, has_more: hm, next_cursor: nc } =
        await this.repository.findCreationsPaginated(filter, decodedCursor, params.limit);

      creationItems = rows.map((row) => this.mapToCreationListItem(row));
      has_more = hm;
      next_cursor = nc;
      total_count = tc;

      this.logger.log(
        `Creation list query: product_id=${dto.product_id}, returned=${creationItems.length}, ` +
        `total_count=${total_count}, has_more=${has_more}`,
      );
    } catch (error) {
      const err = error as Error & { code?: string };
      this.logger.error(`Database query failed for creations: ${err.message}`);
      throw serviceException(
        {
          message: '创作列表查询失败，请稍后重试',
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { prisma_code: err.code },
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const page_info = this.buildPageInfo(creationItems, has_more, next_cursor, total_count);

    return { items: creationItems, page_info };
  }

  async getPreviewComposition(creationId: string, productId?: string): Promise<PreviewCompositionResponse> {
    this.validateCreationId(creationId);

    const record = await this.repository.findCreationById(creationId);
    if (!record) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.CREATION_NOT_FOUND(creationId),
          error: { code: 'CREATION_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '创作任务不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const script = await this.repository.findScriptWithShots(record.scriptId);
    if (!script) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.SCRIPT_NOT_FOUND,
          error: { code: 'SCRIPT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    let cursor = 0;
    const timeline = script.shots.map((shot, index) => {
      const duration = Number(shot.duration);
      const start = cursor;
      const end = this.roundToTwo(Math.max(start + duration, start + 0.1));
      cursor = end;
      const render = record.shotRenders.find((item) => item.shotIndex === shot.shotIndex);
      return {
        shot_index: shot.shotIndex,
        start_sec: start,
        end_sec: end,
        duration,
        slice_id: render?.sliceId ?? shot.selectedSliceId ?? undefined,
        render_path: render?.renderPath ?? undefined,
        cache_hash: render?.cacheHash ?? undefined,
      };
    });

    const subtitleTrack: SubtitleEntry[] = script.shots
      .map((shot, index) => {
        const currentSegment = timeline[index];
        if (!currentSegment) {
          this.logger.warn(`getPreviewComposition: timeline[${index}] missing, subtitle skipped`);
          return null;
        }
        const nextSegment = timeline[index + 1];
    const endSec = nextSegment?.start_sec ?? currentSegment.end_sec;
    return {
      start_sec: currentSegment.start_sec,
      end_sec: Math.max(endSec, currentSegment.start_sec + 0.1),
      text: shot.subtitleText,
    };
      })
      .filter((entry): entry is SubtitleEntry => entry !== null);

    const shotRenderSliceIds = record.shotRenders.map((item) => item.sliceId).filter((item): item is string => Boolean(item));
    const sfxUrlMap = await this.materialRepository.findSliceSfxUrls(shotRenderSliceIds);

    return {
      creation_id: record.id,
      task_id: record.taskId,
      status: record.status as PreviewCompositionResponse['status'],
      current_stage: record.currentStage as PreviewCompositionResponse['current_stage'],
      preview_version: record.updatedAt.toISOString(),
      total_duration_seconds: this.roundToTwo(cursor),
      timeline,
      video_tracks: script.shots.map((shot) => {
        const render = record.shotRenders.find((item) => item.shotIndex === shot.shotIndex);
        const renderPath = render?.renderPath;
        const source: 'CACHE_HIT' | 'AI_GENERATED' | 'PLACEHOLDER' = renderPath
          ? (shot.selectedSliceId ? 'CACHE_HIT' : 'AI_GENERATED')
          : (shot.selectedSliceId ? 'CACHE_HIT' : 'PLACEHOLDER');
        return {
          shot_index: shot.shotIndex,
          slice_id: render?.sliceId ?? shot.selectedSliceId ?? undefined,
          render_path: renderPath ?? undefined,
          source,
        };
      }),
      audio_tracks: {
        voiceover_track: {
          url: undefined,
          duration_seconds: this.roundToTwo(cursor),
          word_timestamps: [],
        },
        bgm_track: {
          url: this.getStaticAssetUrl(`/api/v1/demo/bgm/${this.pickBgmForStyle(script.styleVibe)}`),
          style: script.styleVibe,
          ducking_applied: true,
        },
        sfx_track: {
          urls: Object.values(sfxUrlMap),
          slices: shotRenderSliceIds,
        },
      },
      subtitle_track: {
        entries: subtitleTrack,
      },
      canvas: this.resolveCanvasDimensions(record.targetResolution),
      audio_mix_config: DEFAULT_AUDIO_MIX_CONFIG,
      updated_at: record.updatedAt.toISOString(),
    };
  }

  private resolveCanvasDimensions(targetResolution: string): CanvasParams {
    const MAP: Record<string, CanvasParams> = {
      '1080x1920': { width: 1080, height: 1920, aspect_ratio: '9:16', safe_zone: [0.08, 0.72, 0.92, 0.92] },
      '1920x1080': { width: 1920, height: 1080, aspect_ratio: '16:9', safe_zone: [0.05, 0.60, 0.95, 0.85] },
      '1080x1080': { width: 1080, height: 1080, aspect_ratio: '1:1',  safe_zone: [0.08, 0.65, 0.92, 0.90] },
      '720x1280':  { width: 720,  height: 1280, aspect_ratio: '9:16', safe_zone: [0.1,  0.72, 0.90, 0.92] },
    };
    return MAP[targetResolution] ?? MAP['1080x1920'];
  }

  async exportCreation(
    creationId: string,
    productId?: string,
    options?: { export_format?: string; target_resolution?: string; voice_enhance?: boolean },
  ): Promise<{
    creation_id: string;
    task_id: string;
    video_url: string | null;
    status: string;
    current_stage: string;
    progress: number;
    export_enqueued: boolean;
  }> {
    const record = await this.getRequiredCreationRecord(creationId);

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '创作任务不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (record.status !== 'FINISHED') {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.EXPORT_NOT_ALLOWED,
          error: {
            code: 'EXPORT_NOT_ALLOWED',
            details: { creation_id: creationId, current_status: record.status },
            retryable: false,
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    if (!record.videoUrl) {
      throw serviceException(
        {
          message: '创作任务未生成视频，无法导出',
          error: {
            code: 'NO_VIDEO_GENERATED',
            details: { creation_id: creationId },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const requestedFormat = options?.export_format?.toLowerCase();
    const requestedResolution = options?.target_resolution;
    const originalResolution = (record as { targetResolution?: string }).targetResolution;
    const originalFormat = (record as { exportFormat?: string }).exportFormat || 'mp4';

    const formatChanged = requestedFormat && requestedFormat !== originalFormat;
    const resolutionChanged = requestedResolution && requestedResolution !== originalResolution;
    const voiceEnhanceRequested = options?.voice_enhance === true;

    // 如果格式或分辨率与原始参数不同，或请求了语音增强，触发 restitch 重新导出
    if (formatChanged || resolutionChanged || voiceEnhanceRequested) {
      if (!requestedFormat && !requestedResolution && !voiceEnhanceRequested) {
        // 无实际变化，直接返回已有视频
      } else {
        this.logger.log(
          `Export with new params: creation_id=${creationId}, format=${requestedFormat || originalFormat}, resolution=${requestedResolution || originalResolution}, voice_enhance=${voiceEnhanceRequested}`,
        );

        // 更新 creation 的导出参数
        if (requestedFormat) {
          await this.repository.updateCreationExportFormat(creationId, requestedFormat);
        }
        if (requestedResolution) {
          await this.repository.updateCreationResolution(creationId, requestedResolution);
        }

        await this.restitchCreation(creationId, undefined, requestedFormat, requestedResolution, voiceEnhanceRequested);

        return {
          creation_id: record.id,
          task_id: record.taskId,
          video_url: null,
          status: 'PROCESSING',
          current_stage: 'FFMPEG_STITCHING',
          progress: 85,
          export_enqueued: true,
        };
      }
    }

    this.logger.log(`Export triggered for creation: creation_id=${creationId}, video_url=${record.videoUrl}`);

    return {
      creation_id: record.id,
      task_id: record.taskId,
      video_url: record.videoUrl,
      status: 'FINISHED',
      current_stage: 'EXPORTED',
      progress: 100,
      export_enqueued: false,
    };
  }

  async rerenderShot(creationId: string, shotIndex: number, forceRefresh = false, productId?: string): Promise<ShotRenderSummary> {
    const record = await this.getRequiredCreationRecord(creationId);

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '创作任务不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (record.status !== 'PROCESSING' && record.status !== 'FINISHED') {
      throw serviceException(
        {
          message: '创作任务必须处于处理中或已完成状态才能重渲染分镜',
          error: {
            code: 'INVALID_STATUS',
            details: { creation_id: creationId, current_status: record.status },
            retryable: false,
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const shotRender = record.shotRenders.find((sr) => sr.shotIndex === shotIndex);
    if (!shotRender) {
      throw serviceException(
        {
          message: `分镜 ${shotIndex} 不存在`,
          error: {
            code: 'SHOT_NOT_FOUND',
            details: { creation_id: creationId, shot_index: shotIndex },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const updated = await this.repository.updateShotRenderForCreation({
      creationId,
      shotIndex,
      status: 'PROCESSING',
      renderPath: null,
      incrementRetryCount: true,
      errorMessage: null,
    });

    // === 入队单分镜重渲染任务 ===
    await this.enqueueRerenderJob(record, shotIndex, forceRefresh);

    return this.mapToShotRenderSummary(updated);
  }

  /**
   * 为指定 creation 的指定分镜入队重渲染任务
   * 由 rerenderShot 和 replaceSlice 共用
   */
  private async enqueueRerenderJob(record: CreationDetailRecord, shotIndex: number, forceRefresh = false): Promise<void> {
    const rawScript = await this.repository.findScriptWithShots(record.scriptId);
    const product = await this.repository.findProductById(record.productId);

    if (!rawScript || !product) {
      const missing = !rawScript ? 'script' : 'product';
      throw serviceException(
        {
          message: `Cannot enqueue rerender: ${missing} ${!rawScript ? record.scriptId : record.productId} not found`,
          error: {
            code: !rawScript ? 'SCRIPT_NOT_FOUND' : 'PRODUCT_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const targetShot = rawScript.shots.find((s) => s.shotIndex === shotIndex);
    if (!targetShot) {
      throw serviceException(
        {
          message: `Shot ${shotIndex} not found in script ${record.scriptId} for rerender`,
          error: {
            code: 'SHOT_NOT_FOUND',
            details: { script_id: record.scriptId, shot_index: shotIndex },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const jobShot: CreationJobPayload['shots'][number] = {
      shot_id: targetShot.shotId ?? targetShot.id,
      shot_index: targetShot.shotIndex,
      duration: Number(targetShot.duration),
      visual_description: targetShot.visualDescription,
      voiceover: targetShot.voiceoverText,
      subtitle_text: targetShot.subtitleText || targetShot.voiceoverText,
      voice_profile: CREATION_CONSTANTS.DEFAULT_VOICE_PROFILE,
      image_url: this.resolveMediaUrl(product.coverImageUrl) ?? undefined,
      selected_slice_id: targetShot.selectedSliceId ?? undefined,
      selected_slice_url: undefined,
      scene_description_query: targetShot.sceneDescriptionQuery,
      camera_movement: targetShot.cameraMovement,
      transition_type: targetShot.transitionType,
    };

    // 尝试解析已绑定的切片 URL（用于兜底）
    if (targetShot.selectedSliceId) {
      try {
        const sliceRows = await this.materialRepository.findSlicesByIds([targetShot.selectedSliceId]);
        const sliceRow = (sliceRows as unknown as Array<{
          sliceId: string;
          keyFrameUrl: string | null;
          streamUrl: string | null;
        }>)[0];
        if (sliceRow) {
          jobShot.image_url = this.resolveMediaUrl(sliceRow.keyFrameUrl) ?? jobShot.image_url;
          jobShot.selected_slice_url = this.resolveMediaUrl(sliceRow.streamUrl) ?? undefined;
        }
      } catch {
        this.logger.warn(`Failed to resolve slice ${targetShot.selectedSliceId} for rerender shot ${shotIndex}`);
      }
    }

    await this.creationQueue.add(CREATION_CONSTANTS.QUEUE.CREATION_JOB_NAME, {
      creation_id: record.id,
      task_id: record.taskId,
      product_id: record.productId,
      script_id: record.scriptId,
      trace_id: record.traceId ?? randomUUID(),
      voice_profile: CREATION_CONSTANTS.DEFAULT_VOICE_PROFILE,
      bgm_policy: CREATION_CONSTANTS.DEFAULT_BGM_POLICY,
      force_refresh: forceRefresh,
      target_resolution: record.targetResolution,
      rerender_shot_indices: [shotIndex],
      shots: [jobShot],
    } as CreationJobPayload, {
      // ⚠️ jobId 添加随机后缀确保全局唯一，防止同毫秒碰撞
      jobId: `${record.taskId}_rerender_${shotIndex}_${Date.now()}_${randomUUID().slice(0, 8)}`,
    });

    this.logger.log(`Shot rerender job enqueued: creation_id=${record.id}, shot_index=${shotIndex}`);
  }

  async replaceSlice(creationId: string, shotIndex: number, sliceId: string, productId?: string): Promise<{ shot_render: ShotRenderSummary; rerender_enqueued: boolean }> {
    const record = await this.getRequiredCreationRecord(creationId);

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '创作任务不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (record.status !== 'PROCESSING' && record.status !== 'FINISHED') {
      throw serviceException(
        {
          message: '创作任务必须处于处理中或已完成状态才能替换切片',
          error: {
            code: 'INVALID_STATUS',
            details: { creation_id: creationId, current_status: record.status },
            retryable: false,
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const sliceRow = await this.materialRepository.findSlicesByIds([sliceId]);
    const sliceData = (sliceRow as unknown as Array<{ sliceId: string; material?: { productId: string } }>)[0];
    if (!sliceData) {
      throw serviceException(
        {
          message: `切片 ${sliceId} 不存在`,
          error: {
            code: 'SLICE_NOT_FOUND',
            details: { slice_id: sliceId },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // ⚠️ 验证切片的 material 归属于该 Creation 的 product，防止跨商品替换
    if (sliceData.material?.productId && sliceData.material.productId !== record.productId) {
      throw serviceException(
        {
          message: `切片 ${sliceId} 不属于当前商品`,
          error: {
            code: 'SLICE_PRODUCT_MISMATCH',
            details: { slice_id: sliceId, expected_product: record.productId, actual_product: sliceData.material.productId },
            retryable: false,
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const updated = await this.repository.updateShotRenderForCreation({
      creationId,
      shotIndex,
      sliceId,
      status: 'PROCESSING',
      renderPath: null,
      incrementRetryCount: true,
      errorMessage: null,
    });

    this.logger.log(`Slice replacement queued: creation_id=${creationId}, shot_index=${shotIndex}, slice_id=${sliceId}`);

    // 自动触发单分镜重渲染
    let rerenderEnqueued = false;
    try {
      await this.enqueueRerenderJob(record, shotIndex);
      rerenderEnqueued = true;
      this.logger.log(`Slice replacement auto-triggered rerender: creation_id=${creationId}, shot_index=${shotIndex}`);
    } catch (error) {
      this.logger.warn(`Slice replacement failed to auto-enqueue rerender: ${(error as Error).message}`);
    }

    return { shot_render: this.mapToShotRenderSummary(updated), rerender_enqueued: rerenderEnqueued };
  }

  /**
   * 快速重新合成完整视频（restitch）
   * 复用已缓存的 shot 视频，跳过 AI 生成 + TTS，直接 FFmpeg 拼接
   */
  async restitchCreation(
    creationId: string,
    productId?: string,
    exportFormat?: string,
    targetResolutionOverride?: string,
    voiceEnhance?: boolean,
    audioMixConfig?: AudioMixConfig,
  ): Promise<CreateCreationResponse> {
    const record = await this.getRequiredCreationRecord(creationId);

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '创作任务不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (record.status !== 'PROCESSING' && record.status !== 'FINISHED') {
      throw serviceException(
        {
          message: '创作任务必须处于处理中或已完成状态才能重新合成',
          error: {
            code: 'INVALID_STATUS',
            details: { creation_id: creationId, current_status: record.status },
            retryable: false,
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const rawScript = await this.repository.findScriptWithShots(record.scriptId);
    if (!rawScript) {
      throw serviceException(
        { message: '关联剧本不存在', error: { code: 'SCRIPT_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    // 收集所有 FINISHED 状态的 ShotRender renderPath
    const finishedShots = record.shotRenders.filter(
      (sr): sr is typeof sr & { renderPath: string } =>
        sr.status === 'FINISHED' && sr.renderPath !== null,
    );

    if (finishedShots.length === 0) {
      throw serviceException(
        {
          message: '没有已完成的视频分镜可供重新合成，请先完成渲染',
          error: { code: 'NO_FINISHED_SHOTS', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const restitchRenderPaths = finishedShots.map((sr) => {
      // Worker 本地 artifact 路径不需要 URL 转换，直接透传。
      // resolveMediaUrl 会把 /tmp/... 映射为 http://localhost:3000/tmp/...，
      // Worker 从 Gateway 下载该 URL 会得到损坏文件 → FFmpeg moov atom not found。
      const isLocalWorkerPath = sr.renderPath && (
        sr.renderPath.startsWith('/tmp/') ||
        sr.renderPath.startsWith('/workspace/') ||
        sr.renderPath.startsWith('/var/')
      );
      const resolved = isLocalWorkerPath ? sr.renderPath : this.resolveMediaUrl(sr.renderPath);
      return {
        shot_index: sr.shotIndex,
        render_path: resolved ?? sr.renderPath,
      };
    });

    // 构建简化版 jobShots（传递字幕信息供 FFmpeg 烧录）
    const jobShots = rawScript.shots.map((shot) => ({
      shot_id: shot.shotId ?? shot.id,
      shot_index: shot.shotIndex,
      duration: Number(shot.duration),
      visual_description: shot.visualDescription,
      voiceover: shot.voiceoverText,
      subtitle_text: shot.subtitleText || shot.voiceoverText,
      voice_profile: CREATION_CONSTANTS.DEFAULT_VOICE_PROFILE,
    }));

    const jobId = `${record.taskId}_restitch_${randomUUID().slice(0, 8)}`;
    // ⚠️ restitch 参数默认值补全，调用方未提供时回退到 Creation 原始值
    await this.creationQueue.add(CREATION_CONSTANTS.QUEUE.CREATION_JOB_NAME, {
      creation_id: record.id,
      task_id: record.taskId,
      product_id: record.productId,
      script_id: record.scriptId,
      trace_id: record.traceId ?? randomUUID(),
      voice_profile: CREATION_CONSTANTS.DEFAULT_VOICE_PROFILE,
      bgm_policy: CREATION_CONSTANTS.DEFAULT_BGM_POLICY,
      force_refresh: false,
      target_resolution: targetResolutionOverride || record.targetResolution || '1080p',
      restitch_only: true,
      restitch_render_paths: restitchRenderPaths,
      export_format: exportFormat || record.exportFormat || 'mp4',
      voice_enhancement: voiceEnhance === true
        ? { enabled: true, noiseReduction: 'medium', dynamicCompression: true, clarityBoost: true, deEssing: true, outputGain: 1.2 }
        : undefined,
      shots: jobShots, // restitch 模式：传递分镜信息（字幕/时长）供 Worker FFmpeg 烧录字幕及 BGM 匹配
      audio_mix_config: audioMixConfig,
      watermark: safeWatermarkConfig(record.watermarkConfig),
    } as CreationJobPayload, { jobId });

    this.logger.log(
      `Restitch job enqueued: creation_id=${creationId}, finished_shots=${finishedShots.length}, total_shots=${rawScript.shots.length}`,
    );

    return {
      creation_id: record.id,
      task_id: record.taskId,
      product_id: record.productId,
      script_id: record.scriptId,
      status: 'PROCESSING',
      current_stage: 'FFMPEG_STITCHING',
      progress: 85,
    };
  }

  /**
   * 在 Creation 层直接修改分镜时长/字幕（直写 ScriptShot + 重置 ShotRender）
   */
  async patchCreationShot(
    creationId: string,
    shotIndex: number,
    fields: { duration?: number; subtitle_text?: string },
    productId?: string,
  ): Promise<{ creation_id: string; shot_index: number; updated_fields: string[]; suggested_next_action: 'restitch' | 'none' }> {
    const record = await this.getRequiredCreationRecord(creationId);

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '创作任务不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (record.status !== 'PROCESSING' && record.status !== 'FINISHED') {
      throw serviceException(
        {
          message: '创作任务必须处于处理中或已完成状态才能编辑分镜',
          error: {
            code: 'INVALID_STATUS',
            details: { creation_id: creationId, current_status: record.status },
            retryable: false,
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const updatedFields: string[] = [];
    const updateData: { duration?: number; subtitleText?: string } = {};

    if (fields.duration !== undefined) {
      if (fields.duration < CREATION_CONSTANTS.MIN_SHOT_DURATION_SECONDS ||
          fields.duration > CREATION_CONSTANTS.MAX_SHOT_DURATION_SECONDS) {
        throw serviceException(
          {
            message: `分镜时长必须在 ${CREATION_CONSTANTS.MIN_SHOT_DURATION_SECONDS}s ~ ${CREATION_CONSTANTS.MAX_SHOT_DURATION_SECONDS}s 之间`,
            error: { code: 'INVALID_SHOT_DURATION', retryable: false },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      updateData.duration = fields.duration;
      updatedFields.push('duration');
    }

    if (fields.subtitle_text !== undefined) {
      updateData.subtitleText = fields.subtitle_text;
      updatedFields.push('subtitle_text');
    }

    if (updatedFields.length === 0) {
      return { creation_id: creationId, shot_index: shotIndex, updated_fields: [], suggested_next_action: 'none' };
    }

    // 直写 ScriptShot
    await this.repository.updateScriptShotFields(record.scriptId, shotIndex, updateData);

    // ⚠️ reset ShotRender 时仅 duration 变更才清空 renderPath，保留可复用缓存
    // 仅修改 subtitle_text 时，视频内容不变，保留 renderPath 避免不必要重渲染
    await this.repository.updateShotRenderForCreation({
      creationId,
      shotIndex,
      status: 'PROCESSING',
      renderPath: updatedFields.includes('duration') ? null : undefined,
      incrementRetryCount: false,
      errorMessage: null,
    });

    this.logger.log(
      `Creation shot patched: creation_id=${creationId}, shot_index=${shotIndex}, fields=${updatedFields.join(',')}`,
    );

    // 时长变更需要重渲染；字幕变更仅需 restitch（字幕在拼接阶段叠加，无需重新生成视频）
    const needsRerender = updatedFields.includes('duration');
    if (needsRerender) {
      try {
        await this.enqueueRerenderJob(record, shotIndex);
      } catch (error) {
        this.logger.warn(`Failed to auto-enqueue rerender after patch: ${(error as Error).message}`);
      }
    }

    const needsRestitch = updatedFields.includes('subtitle_text') || needsRerender;
    if (needsRestitch) {
      try {
        await this.restitchCreation(creationId);
      } catch (error) {
        this.logger.warn(`Failed to auto-enqueue restitch after patch: ${(error as Error).message}`);
      }
    }

    return {
      creation_id: creationId,
      shot_index: shotIndex,
      updated_fields: updatedFields,
      suggested_next_action: 'restitch',
    };
  }

  async retryCreation(creationId: string, productId?: string): Promise<CreateCreationResponse> {
    // ⚠️ 校验 creationId UUID 格式，与其他公开方法保持一致
    this.validateCreationId(creationId);
    const record = await this.getRequiredCreationRecord(creationId);

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '创作任务不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    this.validateCreationRetryable(record.status);
    const updated = await this.repository.resetCreationForRetry(creationId);
    await this.safelyRemoveBullMqJob(record.taskId, creationId);

    const product = await this.repository.findProductById(record.productId);
    if (!product) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.PRODUCT_NOT_FOUND,
          error: { code: 'PRODUCT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const rawScript = await this.repository.findScriptWithShots(record.scriptId);
    if (!rawScript) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.SCRIPT_NOT_FOUND,
          error: { code: 'SCRIPT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const scriptShots: ScriptShotInfo[] = rawScript.shots.map((shot) => ({
      id: shot.id,
      shotId: shot.shotId,
      shotIndex: shot.shotIndex,
      duration: Number(shot.duration),
      sceneDescriptionQuery: shot.sceneDescriptionQuery,
      visualDescription: shot.visualDescription,
      cameraMovement: shot.cameraMovement,
      transitionType: shot.transitionType,
      voiceoverText: shot.voiceoverText,
      subtitleText: shot.subtitleText,
      selectedSliceId: shot.selectedSliceId,
      complianceStatus: shot.complianceStatus,
      bgmSegment: (shot as Record<string, unknown>).bgmSegment as Record<string, unknown> ?? null,
    }));

    // === checkpoint 模式：查询已完成分镜，跳过其 AI 生成 ===
    type ShotRenderRecord = { shotIndex: number; status: string; renderPath: string | null };
    const completedRenders = ((record as {
      shotRenders: ShotRenderRecord[];
    }).shotRenders ?? []).filter(
      (sr): sr is { shotIndex: number; status: string; renderPath: string } =>
        sr.status === 'FINISHED' && sr.renderPath !== null,
    );

    const completedShotIndices = completedRenders.map((sr) => sr.shotIndex);
    const completedShotVideos = completedRenders.map((sr) => ({
      shot_index: sr.shotIndex,
      render_path: sr.renderPath,
    }));

    // 仅构建未完成分镜的 Job 数据
    const incompleteShots = scriptShots.filter(
      (s) => !completedShotIndices.includes(s.shotIndex),
    );

    const jobShots = await this.buildJobShots(
      incompleteShots,
      CREATION_CONSTANTS.DEFAULT_VOICE_PROFILE,
      product.id,
      product.coverImageUrl,
      record.preferAiVideo,
      rawScript.language ?? 'zh-CN',
      rawScript.language ?? 'zh-CN', // 重试时 targetLanguage 未持久化到 Creation 表，回退到脚本语言（已知局限）
      record.scriptId,
      undefined, // sliceMatchStrategy: use default AUTO
      undefined, // preferredMaterialIds
      undefined, // shotSliceBindings
      undefined, // materialImageUrl
      rawScript.generationMode,
    );

    const fallbackTargetLang = rawScript.language ?? 'zh-CN';
    this.logger.warn(
      `retryCreation: targetLanguage not persisted on Creation record, falling back to script language="${fallbackTargetLang}" (creation_id=${creationId})`,
    );

    const hasCheckpoint = completedShotIndices.length > 0;
    if (hasCheckpoint) {
      this.logger.log(
        `Retry with checkpoint: creation_id=${creationId}, completed=${completedShotIndices.length}, pending=${incompleteShots.length}`,
      );
    }

    await this.enqueueCreationJob({
      creation_id: record.id,
      task_id: record.taskId,
      product_id: record.productId,
      script_id: record.scriptId,
      trace_id: record.traceId ?? randomUUID(),
      voice_profile: CREATION_CONSTANTS.DEFAULT_VOICE_PROFILE,
      bgm_policy: CREATION_CONSTANTS.DEFAULT_BGM_POLICY,
      force_refresh: true,
      target_resolution: (record as { targetResolution: string }).targetResolution,
      style_vibe: rawScript.styleVibe,
      bgm_segments: scriptShots.map((shot) => ({
        shot_index: shot.shotIndex,
        style: (shot.bgmSegment as Record<string, unknown>)?.style as string || '',
        energy_level: ((shot.bgmSegment as Record<string, unknown>)?.energy_level as string || 'mid') as 'low' | 'mid' | 'high',
        beat_pattern: (shot.bgmSegment as Record<string, unknown>)?.beat_pattern as string || '',
      })).filter(s => s.style !== ''),
      retry_completed_shot_indices: hasCheckpoint ? completedShotIndices : undefined,
      retry_completed_shot_videos: hasCheckpoint ? completedShotVideos : undefined,
      shots: jobShots,
    });

    return this.mapToCreateCreationResponse(updated);
  }

  async listTasks(query: {
    product_id?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<TaskListResponse> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.page_size && query.page_size > 0 ? Math.min(query.page_size, 100) : 20;
    const { items, totalCount } = await this.repository.listTaskSummaries({
      productId: query.product_id,
      status: query.status,
      page,
      pageSize,
    });

    return {
      items: items.map((item) => this.mapToTaskSummary(item)),
      page,
      page_size: pageSize,
      total: totalCount,
      has_more: page * pageSize < totalCount,
    };
  }

  async getTask(taskId: string, productId?: string): Promise<TaskSummary> {
    const record = await this.repository.findTaskSummaryByTaskId(taskId);
    if (!record) {
      throw serviceException(
        {
          message: `任务不存在 (task_id=${taskId})`,
          error: { code: 'TASK_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (productId) {
      const creation = await this.repository.findCreationById(record.biz_id);
      if (!creation || creation.productId !== productId) {
        throw serviceException(
          {
            message: '任务不属于指定商品',
            error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    return this.mapToTaskSummary(record);
  }

  async handleStageCallback(body: {
    task_id: string;
    current_stage: string;
    progress: number;
    message: string;
    trace_id: string;
  }): Promise<void> {
    this.metricsService.creationStageTransitionsTotal.inc({ stage: body.current_stage });
    await this.repository.updateCreationStageByTaskId({
      taskId: body.task_id,
      currentStage: body.current_stage,
      progress: body.progress,
      message: body.message,
      traceId: body.trace_id,
    });
  }

  /**
   * 缺口4: AI 生成视频自动回收至 Material 库 (GENERATED)
   */
  private async ingestGeneratedVideo(creationId: string, videoUrl: string, productId: string): Promise<void> {
    try {
      const materialId = randomUUID();
      await this.materialRepository.createSimpleMaterial({
        id: materialId,
        productId,
        fileName: 'AI_Generated_' + creationId.slice(0, 8) + '.mp4',
        originUrl: videoUrl,
        type: 'VIDEO',
        sourceType: 'GENERATED',
        status: 'COMPLETED',
        fileSizeBytes: 0,
        mimeType: 'video/mp4',
      });
      this.logger.log('[Ingest] material=' + materialId + ' <- creation=' + creationId);
    } catch (error) {
      this.logger.warn('[Ingest] failed for ' + creationId + ': ' + ((error) as Error).message);
    }
  }

  async handleExportCallback(body: {
    task_id: string;
    video_url: string;
    file_size_bytes: number;
    trace_id: string;
  }): Promise<void> {
    await this.repository.markCreationExportedByTaskId({
      taskId: body.task_id,
      videoUrl: body.video_url,
      fileSizeBytes: body.file_size_bytes,
      traceId: body.trace_id,
    });

    // 缺口4: 自动入库
    const cr = await this.repository.findCreationByTaskId(body.task_id);
    if (cr) {
      if (cr.productId === null || cr.productId === undefined) {
        this.logger.warn(`Creation ${cr.id} has null/undefined productId, skipping auto-ingest`);
        return;
      }
      const pid = String(cr.productId);
      fireAndForget(this.logger, 'ingestGeneratedVideo', this.ingestGeneratedVideo(cr.id, body.video_url, pid));
    }
  }

  async handleShotCompletionCallback(body: {
    task_id: string;
    creation_id: string;
    shot_index: number;
    video_url: string;
    render_path: string;
    trace_id: string;
    source?: string;
    seedance_prompt?: string;
  }): Promise<void> {
    this.logger.log(
      `[SHOT_COMPLETION] creation_id=${body.creation_id} shot_index=${body.shot_index} render_path=${body.render_path}`,
    );
    await this.repository.updateShotRenderByTaskAndShot({
      taskId: body.task_id,
      shotIndex: body.shot_index,
      renderPath: body.render_path,
      status: 'FINISHED',
      source: body.source || 'RENDERED',
      seedancePrompt: body.seedance_prompt || null,
    });
  }

  async handleFailureCallback(body: {
    task_id: string;
    error_code: string;
    error_message: string;
    current_stage: string;
    trace_id: string;
  }): Promise<void> {
    this.metricsService.creationFailuresTotal.inc({ error_code: body.error_code || 'UNKNOWN' });
    await this.repository.markCreationFailedByTaskId({
      taskId: body.task_id,
      errorCode: body.error_code,
      errorMessage: body.error_message,
      currentStage: body.current_stage,
      traceId: body.trace_id,
    });
  }

  private async getRequiredCreationRecord(creationId: string): Promise<CreationDetailRecord> {
    this.validateCreationId(creationId);
    const record = await this.repository.findCreationById(creationId);
    if (!record) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.ERROR_MESSAGES.CREATION_NOT_FOUND(creationId),
          error: { code: 'CREATION_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }
    return record;
  }

  private mapToShotRenderSummary(record: {
    id: string;
    creationId: string;
    scriptShotId: string;
    shotId: string | null;
    shotIndex: number;
    cacheHash: string | null;
    sliceId: string | null;
    renderPath: string | null;
    renderDurationMs: number | null;
    retryCount: number;
    status: string;
    errorMessage: string | null;
    updatedAt: Date;
  }): ShotRenderSummary {
    return {
      shot_render_id: record.id,
      creation_id: record.creationId,
      script_shot_id: record.scriptShotId,
      shot_id: record.shotId ?? undefined,
      shot_index: record.shotIndex,
      cache_hash: record.cacheHash ?? undefined,
      slice_id: record.sliceId ?? undefined,
      render_path: record.renderPath ?? undefined,
      render_duration_ms: record.renderDurationMs ?? undefined,
      retry_count: record.retryCount,
      status: record.status as ShotRenderSummary['status'],
      error_message: record.errorMessage ?? undefined,
      updated_at: record.updatedAt.toISOString(),
    };
  }

  private mapToTaskSummary(record: {
    task_id: string;
    biz_id: string;
    status: string;
    current_stage: string;
    progress: number;
    trace_id: string | null;
    error_message: string | null;
    deleted_at?: string | null;
    created_at: Date;
    updated_at: Date;
  }): TaskSummary {
    return {
      task_id: record.task_id,
      biz_type: 'CREATION',
      biz_id: record.biz_id,
      status: record.status as TaskSummary['status'],
      current_stage: record.current_stage as TaskSummary['current_stage'],
      progress: record.progress,
      message: record.error_message ?? undefined,
      trace_id: record.trace_id ?? undefined,
      deleted_at: record.deleted_at ?? undefined,
      created_at: record.created_at.toISOString(),
      updated_at: record.updated_at.toISOString(),
    };
  }

  private roundToTwo(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private pickBgmForStyle(styleVibe: string): string {
    const styleMap: Record<string, string> = {
      energetic: 'energetic-upbeat-01.mp3',
      calm: 'calm-relax-01.mp3',
      playful: 'playful-cute-01.mp3',
      dramatic: 'dramatic-impact-01.mp3',
      elegant: 'beauty-elegant-01.mp3',
      fashion: 'fashion-trend-01.mp3',
    };
    const match = Object.entries(styleMap).find(([key]) =>
      styleVibe?.toLowerCase().includes(key),
    );
    return match?.[1] ?? 'energetic-upbeat-01.mp3';
  }

  // ===========================================================================
  // L1: resolveListDefaults — 默认值解析与基础校验
  // ===========================================================================

  private resolveListDefaults(dto: {
    product_id: string;
    status?: string;
    current_stage?: string;
    engine_mode?: string;
    export_format?: string;
    limit?: number;
    cursor?: string;
  }): {
    product_id: string;
    status?: string;
    current_stage?: string;
    engine_mode?: string;
    export_format?: string;
    limit: number;
    cursor?: string;
  } {
    if (!dto.product_id || typeof dto.product_id !== 'string' || dto.product_id.trim().length === 0) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.CREATION_LIST_ERROR_MESSAGES.PRODUCT_ID_REQUIRED,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
            details: [{ field: 'product_id', reason: 'product_id 为必填字段，上下文隔离边界' }],
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const limit = dto.limit ?? CREATION_CONSTANTS.CREATION_LIST_DEFAULTS.DEFAULT_LIMIT;

    if (!Number.isInteger(limit) || limit <= 0 || limit > CREATION_CONSTANTS.CREATION_LIST_DEFAULTS.MAX_LIMIT) {
      throw serviceException(
        {
          message: CREATION_CONSTANTS.CREATION_LIST_ERROR_MESSAGES.LIMIT_OUT_OF_RANGE(
            CREATION_CONSTANTS.CREATION_LIST_DEFAULTS.MAX_LIMIT,
            dto.limit,
          ),
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
            details: { field: 'limit', received: dto.limit },
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      product_id: dto.product_id,
      status: dto.status,
      current_stage: dto.current_stage,
      engine_mode: dto.engine_mode,
      export_format: dto.export_format,
      limit,
      cursor: dto.cursor,
    };
  }

  // ===========================================================================
  // L2: buildListFilter — 筛选校验与 where 组装
  // ===========================================================================

  private buildListFilter(params: {
    product_id: string;
    status?: string;
    current_stage?: string;
    engine_mode?: string;
    export_format?: string;
    limit: number;
    cursor?: string;
  }): CreationListFilter {
    const filter: CreationListFilter = {
      product_id: params.product_id,
    };

    if (params.status) {
      if (!CREATION_CONSTANTS.VALID_CREATION_STATUSES.has(params.status as never)) {
        throw serviceException(
          {
            message: CREATION_CONSTANTS.CREATION_LIST_ERROR_MESSAGES.STATUS_INVALID(params.status),
            error: {
              code: 'INVALID_REQUEST',
              retryable: false,
              details: { field: 'status', received: params.status },
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      filter.status = params.status;
    }

    if (params.current_stage) {
      if (!CREATION_CONSTANTS.VALID_CREATION_STAGES.has(params.current_stage as never)) {
        throw serviceException(
          {
            message: CREATION_CONSTANTS.CREATION_LIST_ERROR_MESSAGES.CURRENT_STAGE_INVALID(params.current_stage),
            error: {
              code: 'INVALID_REQUEST',
              retryable: false,
              details: { field: 'current_stage', received: params.current_stage },
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      filter.current_stage = params.current_stage;
    }

    if (params.engine_mode) {
      if (params.engine_mode !== CREATION_CONSTANTS.DEFAULT_ENGINE_MODE) {
        throw serviceException(
          {
            message: CREATION_CONSTANTS.CREATION_LIST_ERROR_MESSAGES.ENGINE_MODE_INVALID(params.engine_mode),
            error: {
              code: 'INVALID_REQUEST',
              retryable: false,
              details: { field: 'engine_mode', received: params.engine_mode },
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      filter.engine_mode = params.engine_mode;
    }

    if (params.export_format) {
      const validFormats: readonly string[] = CREATION_CONSTANTS.VALID_EXPORT_FORMATS;
      if (!(validFormats as readonly string[]).includes(params.export_format)) {
        throw serviceException(
          {
            message: CREATION_CONSTANTS.CREATION_LIST_ERROR_MESSAGES.EXPORT_FORMAT_INVALID(params.export_format),
            error: {
              code: 'INVALID_REQUEST',
              retryable: false,
              details: { field: 'export_format', received: params.export_format },
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      filter.export_format = params.export_format;
    }

    return filter;
  }

  // ===========================================================================
  // L4: mapToCreationListItem — Prisma camelCase → API snake_case
  // ===========================================================================

  private mapToCreationListItem(row: CreationRow): CreationListItem {
    return {
      creation_id: row.id,
      product_id: row.productId,
      script_id: row.scriptId,
      task_id: row.taskId,
      engine_mode: row.engineMode,
      target_resolution: row.targetResolution,
      export_format: row.exportFormat,
      status: row.status,
      progress: row.progress,
      current_stage: row.currentStage,
      video_url: row.videoUrl ?? null,
      file_size_bytes: row.fileSizeBytes !== null && row.fileSizeBytes !== undefined
        ? Number(row.fileSizeBytes)
        : null,
      trace_id: row.traceId ?? null,
      error_code: row.errorCode ?? null,
      error_message: row.errorMessage ?? null,
      started_at: row.startedAt ? row.startedAt.toISOString() : null,
      finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  // ===========================================================================
  // L5: buildPageInfo — 游标分页元数据组装
  // ===========================================================================

  private buildPageInfo(
    items: CreationListItem[],
    hasMore: boolean,
    nextCursor: string | null,
    totalCount: number | null,
  ): CursorPageInfo {
    return {
      cursor: nextCursor,
      has_more: hasMore,
      total_count: totalCount,
    };
  }

  // ===========================================================================
  // M: checkCreationHealth — 创作模块健康检查
  // ===========================================================================

  async checkCreationHealth(): Promise<{
    seedance: { ok: boolean; message: string; configured: boolean };
    worker: { ok: boolean; message: string; queue_waiting: number };
  }> {
    const apiKey = arkApiKey() || arkVideoApiKey();
    const configured = apiKey.length > 0;

    let seedanceOk = false;
    let seedanceMessage = '';

    if (!configured) {
      seedanceMessage = '视频生成 API Key 未配置 (ARK_API_KEY / ARK_VIDEO_API_KEY)';
    } else {
      try {
        const apiUrl = arkSeedanceBaseUrl();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`${apiUrl}/contents/generations/tasks`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          seedanceOk = true;
          seedanceMessage = `API 可达 (HTTP ${response.status})`;
        } else {
          const errorText = await response.text().catch(() => 'Unknown');
          this.logger.warn(`Seedance API returned non-OK status ${response.status}: ${errorText.slice(0, 200)}`);
          seedanceMessage = `API 返回异常 (HTTP ${response.status})`;
        }
      } catch (error) {
        this.logger.warn(`Seedance API connection failed: ${error instanceof Error ? error.message : String(error)}`);
        seedanceMessage = 'API 连接失败';
      }
    }

    // 检查队列积压情况
    let queueWaiting = 0;
    let workerOk = true;
    let workerMessage = '队列状态正常';

    try {
      const counts = await this.creationQueue.getJobCounts('waiting', 'active', 'delayed');
      queueWaiting = counts.waiting + (counts.delayed || 0);

      if (queueWaiting > 10) {
        workerOk = false;
        workerMessage = `队列积压严重 (等待 ${queueWaiting} 个任务)`;
      } else if (queueWaiting > 3) {
        workerMessage = `队列有 ${queueWaiting} 个任务等待中`;
      }
    } catch {
      workerOk = false;
      workerMessage = '无法连接队列 (Redis 可能不可用)';
    }

    return {
      seedance: {
        ok: seedanceOk,
        message: seedanceMessage,
        configured,
      },
      worker: {
        ok: workerOk,
        message: workerMessage,
        queue_waiting: queueWaiting,
      },
    };
  }

  // ===========================================================================
  // N: checkStuckCreations — 检测卡在 QUEUE_ALLOCATION 的任务
  // ===========================================================================

  async checkStuckCreations(productId: string): Promise<{
    stuck_count: number;
    stuck_creation_ids: string[];
    auto_failed_count: number;
  }> {
    const STUCK_THRESHOLD_MS = CREATION_CONSTANTS.STUCK_DETECTION.STUCK_THRESHOLD_MS;
    const AUTO_FAIL_THRESHOLD_MS = CREATION_CONSTANTS.STUCK_DETECTION.AUTO_FAIL_THRESHOLD_MS;
    const LOUDNORM_STUCK_THRESHOLD_MS = CREATION_CONSTANTS.STUCK_DETECTION.LOUDNORM_STUCK_THRESHOLD_MS;
    const LOUDNORM_AUTO_FAIL_MS = CREATION_CONSTANTS.STUCK_DETECTION.LOUDNORM_AUTO_FAIL_MS;

    // 检查 QUEUE_ALLOCATION 卡住
    const stuckCreations = await this.repository.findStuckQueueAllocations({
      stage: 'QUEUE_ALLOCATION',
      stuckThresholdMs: STUCK_THRESHOLD_MS,
      productId,
    });

    let autoFailedCount = 0;

    for (const creation of stuckCreations) {
      const elapsed = Date.now() - new Date(creation.created_at).getTime();

      if (elapsed > AUTO_FAIL_THRESHOLD_MS) {
        try {
          await this.repository.markCreationFailed(creation.creation_id, {
            errorCode: 'QUEUE_ALLOCATION_TIMEOUT',
            errorMessage: `任务在队列资源分配阶段超时 (已等待 ${Math.round(elapsed / 1000)}s)，Worker 可能未运行或不可达`,
            currentStage: 'QUEUE_ALLOCATION',
            traceId: `trc_stuck_${randomUUID().slice(0, 8)}`,
          });
          autoFailedCount++;
          this.logger.error(
            `[STUCK] Auto-failed creation ${creation.creation_id} after ${Math.round(elapsed / 1000)}s in QUEUE_ALLOCATION`,
          );
        } catch (error) {
          this.logger.error(
            `[STUCK] Failed to auto-fail creation ${creation.creation_id}: ${(error as Error).message}`,
          );
        }
      }
    }

    // 检查 LOUDNORM_COMPLIANCE 卡住（Worker stitch 完成但 export callback 失败导致废弃）
    // LOUDNORM 到达时 status 为 PROCESSING，非 PENDING
    const stuckLoudnormCreations = await this.repository.findStuckQueueAllocations({
      stage: 'LOUDNORM_COMPLIANCE',
      stuckThresholdMs: LOUDNORM_STUCK_THRESHOLD_MS,
      productId,
      status: 'PROCESSING',
    });

    for (const creation of stuckLoudnormCreations) {
      const elapsed = Date.now() - new Date(creation.updated_at || creation.created_at).getTime();

      if (elapsed > LOUDNORM_AUTO_FAIL_MS) {
        try {
          await this.repository.markCreationFailed(creation.creation_id, {
            errorCode: 'LOUDNORM_COMPLIANCE_STUCK',
            errorMessage: `创作卡在响度合规阶段 (已 ${Math.round(elapsed / 1000)}s)，可能为 Export 回调失败导致，请重试`,
            currentStage: 'LOUDNORM_COMPLIANCE',
            traceId: `trc_loudnorm_stuck_${randomUUID().slice(0, 8)}`,
          });
          autoFailedCount++;
          this.logger.error(
            `[STUCK] Auto-failed creation ${creation.creation_id} after ${Math.round(elapsed / 1000)}s in LOUDNORM_COMPLIANCE`,
          );
        } catch (error) {
          this.logger.error(
            `[STUCK] Failed to auto-fail LOUDNORM creation ${creation.creation_id}: ${(error as Error).message}`,
          );
        }
      }
    }

    const stillStuck = [
      ...stuckCreations.filter(
        (c: { creation_id: string; created_at: Date; updated_at: Date }) => Date.now() - new Date(c.created_at).getTime() <= AUTO_FAIL_THRESHOLD_MS,
      ),
      ...stuckLoudnormCreations.filter(
        (c: { creation_id: string; created_at: Date; updated_at: Date }) => Date.now() - new Date(c.updated_at || c.created_at).getTime() <= LOUDNORM_AUTO_FAIL_MS,
      ),
    ];

    return {
      stuck_count: stillStuck.length,
      stuck_creation_ids: stillStuck.map((c) => c.creation_id),
      auto_failed_count: autoFailedCount,
    };
  }

  // ===========================================================================
  // N.1: autoScanStuckCreations — @Cron 自动巡检（每2分钟）
  // 当 remotion-render-worker 宕机时，自动检测并标记超时创作，避免永久卡死
  // ===========================================================================

  @Cron('*/2 * * * *')
  async autoScanStuckCreations(): Promise<void> {
    const STUCK_THRESHOLD_MS = CREATION_CONSTANTS.STUCK_DETECTION.STUCK_THRESHOLD_MS;
    const AUTO_FAIL_THRESHOLD_MS = CREATION_CONSTANTS.STUCK_DETECTION.AUTO_FAIL_THRESHOLD_MS;

    try {
      // 查找所有存在卡在 QUEUE_ALLOCATION 的创作的商品（去重）
      const affectedProductIds = await this.repository.findDistinctProductIdsWithStuckQueueAllocations({
        stage: 'QUEUE_ALLOCATION',
        stuckThresholdMs: STUCK_THRESHOLD_MS,
      });

      if (affectedProductIds.length > 0) {
        this.logger.log(
          `[Cron/StuckScan] Found ${affectedProductIds.length} product(s) with stuck QUEUE_ALLOCATION creations, scanning...`,
        );

        for (const productId of affectedProductIds) {
          try {
            const result = await this.checkStuckCreations(productId);
            if (result.auto_failed_count > 0) {
              this.logger.warn(
                `[Cron/StuckScan] product=${productId} auto_failed=${result.auto_failed_count} stuck_ids=${result.stuck_creation_ids.join(',')}`,
              );
            }
          } catch (e) {
            // 单个商品扫描失败不影响其他商品
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `[Cron/StuckScan] QUEUE_ALLOCATION scan failed: ${(error as Error).message}`,
      );
    }

    // 同时检查 LOUDNORM_COMPLIANCE 卡住的任务
    const LOUDNORM_STUCK_THRESHOLD_MS = CREATION_CONSTANTS.STUCK_DETECTION.LOUDNORM_STUCK_THRESHOLD_MS;
    const LOUDNORM_AUTO_FAIL_MS = CREATION_CONSTANTS.STUCK_DETECTION.LOUDNORM_AUTO_FAIL_MS;

    try {
      const stuckLoudnormCreations = await this.repository.findStuckQueueAllocations({
        stage: 'LOUDNORM_COMPLIANCE',
        stuckThresholdMs: LOUDNORM_STUCK_THRESHOLD_MS,
        status: 'PROCESSING',
      });

      for (const creation of stuckLoudnormCreations) {
        const elapsed = Date.now() - new Date(creation.updated_at || creation.created_at).getTime();

        if (elapsed > LOUDNORM_AUTO_FAIL_MS) {
          try {
            await this.repository.markCreationFailed(creation.creation_id, {
              errorCode: 'LOUDNORM_COMPLIANCE_STUCK',
              errorMessage: `创作卡在响度合规阶段 (已 ${Math.round(elapsed / 1000)}s)，可能为 Export 回调失败导致，请重试`,
              currentStage: 'LOUDNORM_COMPLIANCE',
              traceId: `trc_loudnorm_cron_${randomUUID().slice(0, 8)}`,
            });
            this.logger.error(
              `[Cron/StuckScan] Auto-failed creation ${creation.creation_id} stuck at LOUDNORM_COMPLIANCE for ${Math.round(elapsed / 1000)}s`,
            );
          } catch (e) {
            this.logger.error(
              `[Cron/StuckScan] Failed to auto-fail LOUDNORM creation ${creation.creation_id}: ${(e as Error).message}`,
            );
          }
        }
      }
    } catch (error) {
      // LOUDNORM 扫描失败不影响 QUEUE_ALLOCATION 检测
    }
  }

  // ===========================================================================
  // 任务软删除 / 恢复 / 永久删除 / 批量删除 / 回收站
  // ===========================================================================

  async softDeleteTask(taskId: string, productId?: string): Promise<{ task_id: string; deleted_at: string }> {
    const row = await this.repository.findTaskSummaryByTaskId(taskId);
    if (!row) {
      throw serviceException(
        { message: `任务不存在 (task_id=${taskId})`, error: { code: 'TASK_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    if (productId) {
      const creation = await this.repository.findCreationById(row.biz_id);
      if (!creation || creation.productId !== productId) {
        throw serviceException(
          {
            message: '任务不属于指定商品',
            error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    if (row.status === 'PROCESSING' || row.status === 'PENDING') {
      throw serviceException(
        { message: '处理中的任务无法删除，请先取消任务', error: { code: 'TASK_STILL_PROCESSING', retryable: false } },
        HttpStatus.CONFLICT,
      );
    }

    const result = await this.repository.softDeleteTask(taskId);
    // 幂等处理：任务已在回收站中，返回成功
    if (!result) {
      return { task_id: taskId, deleted_at: new Date().toISOString() };
    }
    return result;
  }

  async restoreTask(taskId: string, productId?: string): Promise<{ task_id: string }> {
    const existing = await this.repository.findTaskSummaryByTaskId(taskId);
    if (!existing) {
      throw serviceException(
        { message: `任务不存在 (task_id=${taskId})`, error: { code: 'TASK_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    if (productId) {
      const creation = await this.repository.findCreationById(existing.biz_id);
      if (!creation || creation.productId !== productId) {
        throw serviceException(
          {
            message: '任务不属于指定商品',
            error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    const result = await this.repository.restoreTask(taskId);
    // 幂等处理：任务已处于恢复态（不在回收站），返回成功
    if (!result) {
      return { task_id: taskId };
    }
    return result;
  }

  async permanentDeleteTask(taskId: string, productId?: string): Promise<{ deleted: boolean }> {
    if (productId) {
      const task = await this.repository.findTaskSummaryByTaskId(taskId);
      if (task) {
        const creation = await this.repository.findCreationById(task.biz_id);
        if (!creation || creation.productId !== productId) {
          throw serviceException(
            {
              message: '任务不属于指定商品',
              error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
            },
            HttpStatus.FORBIDDEN,
          );
        }
      }
    }

    const result = await this.repository.permanentDeleteTask(taskId);
    if (!result) {
      throw serviceException(
        { message: '永久删除失败：任务不在回收站中或不存在', error: { code: 'TASK_NOT_IN_TRASH', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }
    return { deleted: true };
  }

  async batchSoftDeleteTasks(taskIds: string[], productId?: string): Promise<{ deleted_count: number; skipped_count: number; skipped_task_ids: string[] }> {
    let effectiveTaskIds = taskIds;
    const skippedForProduct: string[] = [];

    if (productId && taskIds.length > 0) {
      // 批量查询所有 task → creation 映射（替代原有 N+1 查询）
      const tasks = await this.repository.findTaskSummariesByTaskIds(taskIds);
      const taskMap = new Map(tasks.map((t) => [t.task_id, t]));

      const bizIds = [...new Set(tasks.map((t) => t.biz_id).filter(Boolean))];
      const creations = bizIds.length > 0
        ? await this.repository.findCreationsByIds(bizIds)
        : [];
      const creationMap = new Map(creations.map((c) => [c.id, c]));

      const valid: string[] = [];
      for (const tid of taskIds) {
        const task = taskMap.get(tid);
        if (!task) continue;
        const creation = creationMap.get(task.biz_id);
        if (creation && creation.productId === productId) {
          valid.push(tid);
        } else {
          skippedForProduct.push(tid);
        }
      }
      effectiveTaskIds = valid;
    }

    const result = await this.repository.batchSoftDeleteTasks(effectiveTaskIds);
    return {
      deleted_count: result.deleted_count,
      skipped_count: result.skipped_ids.length + skippedForProduct.length,
      skipped_task_ids: [...result.skipped_ids, ...skippedForProduct],
    };
  }

  async listTrashTasks(query: { product_id?: string; page?: number; page_size?: number }): Promise<TaskListResponse> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.page_size && query.page_size > 0 ? Math.min(query.page_size, 100) : 20;
    const { items, totalCount } = await this.repository.listTrashTasks({
      productId: query.product_id,
      page,
      pageSize,
    });

    return {
      items: items.map((item) => this.mapToTaskSummary({
        task_id: item.taskId,
        biz_id: item.bizId,
        status: item.status,
        current_stage: item.currentStage,
        progress: item.progress,
        trace_id: item.traceId,
        error_message: item.errorMessage,
        deleted_at: item.deletedAt,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      })),
      page,
      page_size: pageSize,
      total: totalCount,
      has_more: page * pageSize < totalCount,
    };
  }

  async emptyTrash(productId?: string): Promise<{ deleted_count: number }> {
    const count = await this.repository.emptyTrash(productId);
    return { deleted_count: count };
  }
}
