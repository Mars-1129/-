// =============================================================================
// TikStream AI — Script Service
// =============================================================================

import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ProductRepository } from '../product/product.repository';
import { TemplateRepository } from '../template/template.repository';
import { MaterialRepository } from '../material/material.repository';
import { ScriptRepository, CreateScriptParams, CreateScriptShotParams } from './script.repository';
import { ScriptSchemaValidator } from './script-schema.validator';
import { ComplianceFilter, ComplianceResult, ComplianceViolation } from './compliance.filter';
import { ScriptQuickPromptBuilder, PromptParams } from '../../services/prompts/script-quick.prompt';
import { ScriptViralRewritePromptBuilder, ViralRewritePromptParams } from '../../services/prompts/script-viral-rewrite.prompt';
import { ScriptTemplatePromptBuilder, TemplatePromptParams } from '../../services/prompts/script-template.prompt';
import { ComplianceAiReviewPromptBuilder, AiReviewBatchResult, AiReviewCandidate } from '../../services/prompts/compliance-ai-review.prompt';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { FactorRemixPromptBuilder } from '../../services/prompts/regenerate-factor-remix.prompt';
import { RegenerateScriptPromptBuilder } from '../../services/prompts/regenerate-script.prompt';
import { SubtitleTranslationService } from '../subtitle/subtitle-translation.service';
import { serviceException } from '../common/service-exception';
import { ScriptQuickGenerateDto } from './dto/generate-quick.dto';
import { ScriptViralRewriteGenerateDto } from './dto/generate-viral-rewrite.dto';
import { ScriptTemplateGenerateDto } from './dto/generate-template.dto';
import { GenerateBatchDto } from './dto/generate-batch.dto';
import { GenerateComposedDto } from './dto/generate-composed.dto';
import { GenerateHybridDto } from './dto/generate-hybrid.dto';
import { ComplianceReviewDto, ComplianceReviewProgressEvent } from './dto/compliance-review.dto';
import { ValidateTimingDto } from './dto/validate-timing.dto';
import { PatchOperationDTO } from './dto/patch-script.dto';
import { SaveScriptRequestDto } from './dto/save-script.dto';
import {
  AspectRatio as ApiAspectRatio,
  ErrorCode,
  PaginatedData,
  Script as ScriptType,
  ScriptPatchResponse,
  ScriptSaveResponse,
  ScriptShot as ScriptShotType,
  ScriptValidateTimingResponse,
  SupportedLocale,
  ScriptBatchGenerateResponse,
  BgmSegment,
} from '@tikstream/shared-types';
import { Script, ScriptShot, ViralVideoAnalysis, Product } from '@prisma/client';
import { Template } from '@prisma/client';
import { SCRIPT_CONSTANTS } from './script.constants';

export interface ParseResult extends Record<string, unknown> {
  title?: string;
  video_duration: number;
  style_vibe: string;
  shots: Array<Record<string, unknown>>;
}

interface ScriptGenerationFallbackInput {
  title?: string;
  language: string;
  style_vibe: string;
  target_audience?: string;
  selling_points: string[];
  aspect_ratio?: ApiAspectRatio;
  constraint_list: string[];
  source_label: string;
}

interface EditableScriptState extends Record<string, unknown> {
  title?: string;
  language: string;
  target_audience?: string;
  style_vibe: string;
  constraint_list: string[];
  video_duration: number;
  shots: Array<Record<string, unknown>>;
}

type ParsedPatchPath =
  | {
      kind: 'root';
      normalizedPath: string;
      rootKey: string;
      segments: string[];
    }
  | {
      kind: 'shot';
      normalizedPath: string;
      shotIndex: number;
      wholeShot: boolean;
      segments: string[];
    };

@Injectable()
export class ScriptService {
  private readonly logger = new Logger(ScriptService.name);

  constructor(
    private readonly repository: ScriptRepository,
    private readonly productRepository: ProductRepository,
    private readonly templateRepository: TemplateRepository,
    private readonly materialRepository: MaterialRepository,
    private readonly schemaValidator: ScriptSchemaValidator,
    private readonly complianceFilter: ComplianceFilter,
    private readonly promptBuilder: ScriptQuickPromptBuilder,
    private readonly viralRewritePromptBuilder: ScriptViralRewritePromptBuilder,
    private readonly templatePromptBuilder: ScriptTemplatePromptBuilder,
    private readonly aiReviewPromptBuilder: ComplianceAiReviewPromptBuilder,
    private readonly doubaoTextProvider: DoubaoTextProvider,
    private readonly factorRemixPromptBuilder: FactorRemixPromptBuilder,
    private readonly regeneratePromptBuilder: RegenerateScriptPromptBuilder,
    private readonly subtitleTranslationService?: SubtitleTranslationService,
  ) {}

  async generateQuickScript(dto: ScriptQuickGenerateDto): Promise<ScriptType> {
    const { product_id, title, language, selling_points, target_audience, style_vibe, aspect_ratio, constraint_list } = dto;

    const product = await this.validateProductExists(product_id);
    const productCtx = this.buildProductContext(product, title, selling_points);

    const promptParams: PromptParams = {
      selling_points: productCtx.selling_points,
      style_vibe,
      target_audience,
      language: language || 'zh-CN',
      aspect_ratio,
      constraint_list: [...(constraint_list || []), ...productCtx.constraint_list],
      title: productCtx.title || undefined,
      preferences: dto.preferences,
      preference_remark: dto.preference_remark,
      product_brief: productCtx.product_brief,
    };

    // 注入素材视觉上下文
    const materialContexts = await this.enrichPromptWithMaterialContext(dto.material_ids || []);
    (promptParams as any).material_contexts = materialContexts;

    // 注入图片视觉分析结果（IMAGE_DRIVEN 模式）
    if (dto.image_analysis) {
      (promptParams as any).image_analysis = dto.image_analysis;
    }

    const { systemPrompt, userPrompt } = this.promptBuilder.build(promptParams);

    const parsed = await this.generateScriptPayload(systemPrompt, userPrompt, {
      title,
      language: language || 'zh-CN',
      style_vibe,
      target_audience,
      selling_points,
      aspect_ratio: aspect_ratio as ApiAspectRatio | undefined,
      constraint_list: constraint_list || [],
      source_label: 'quick',
    });

    const schemaResult = this.schemaValidator.validate(parsed);
    if (!schemaResult.valid) {
      const hasDurationErr = schemaResult.errors.some((e) => e.message.includes('总时长'));
      const errorCode = hasDurationErr ? ErrorCode.SCRIPT_DURATION_EXCEEDED : ErrorCode.SCRIPT_SCHEMA_INVALID;
      throw serviceException(
        {
          message: `${ErrorCode.SCRIPT_SCHEMA_INVALID}: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
          error: {
            code: errorCode,
            details: schemaResult.errors,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const complianceResult = this.complianceFilter.check(parsed.shots);
    if (!complianceResult.passed) {
      throw serviceException(
        {
          message: `${ErrorCode.COMPLIANCE_CHECK_FAILED}: ${complianceResult.violations.map((v) => v.reason).join('; ')}`,
          error: {
            code: ErrorCode.COMPLIANCE_CHECK_FAILED,
            details: complianceResult.violations,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const scriptParams: CreateScriptParams = {
      productId: product_id,
      title: parsed.title || title,
      language: language || 'zh-CN',
      targetAudience: target_audience,
      videoDuration: parsed.video_duration,
      aspectRatio: aspect_ratio,
      styleVibe: parsed.style_vibe || style_vibe,
      generationMode: 'PROMPT_DRIVEN',
      constraintList: constraint_list || [],
      rawJson: parsed,
    };

    const shotsParams: CreateScriptShotParams[] = parsed.shots.map((shot, idx) => ({
      scriptId: '',
      shotIndex: idx + 1,
      duration: Number(shot.duration),
      sceneDescriptionQuery: String(shot.scene_description_query),
      visualDescription: String(shot.visual_description),
      cameraMovement: String(shot.camera_movement),
      transitionType: String(shot.transition_type),
      voiceoverText: String(shot.voiceover_text),
      subtitleText: String(shot.subtitle_text),
      safeZoneBoundingBox: this.normalizeSafeZoneBoundingBox(shot.safe_zone_bounding_box),
      complianceStatus: 'PASSED',
    }));

    const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);

    const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);
    
    if (!scriptWithShots) {
      throw serviceException(
        {
          message: ErrorCode.INTERNAL_SERVER_ERROR,
          error: {
            code: ErrorCode.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const result = this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
    this.triggerAsyncTranslation(createdScript.id);
    return result;
  }

  async generateQuickScriptWithProgress(
    dto: ScriptQuickGenerateDto,
    onProgress: (progress: { stage: string; message: string; progress: number }) => void,
  ): Promise<ScriptType> {
    try {
      onProgress({ stage: 'VALIDATING', message: '正在验证商品信息...', progress: 10 });

      const { product_id } = dto;
      const product = await this.validateProductExists(product_id);

      onProgress({ stage: 'BUILDING_PROMPT', message: '正在构建剧本提示词...', progress: 20 });

      const { title, language, selling_points, target_audience, style_vibe, aspect_ratio, constraint_list } = dto;
      const productCtx = this.buildProductContext(product, title, selling_points);

      const promptParams: PromptParams = {
        selling_points: productCtx.selling_points,
        style_vibe,
        target_audience,
        language: language || 'zh-CN',
        aspect_ratio,
        constraint_list: [...(constraint_list || []), ...productCtx.constraint_list],
        title: productCtx.title || undefined,
        preferences: dto.preferences,
        preference_remark: dto.preference_remark,
        product_brief: productCtx.product_brief,
      };

      // 注入素材视觉上下文
      const materialContexts = await this.enrichPromptWithMaterialContext(dto.material_ids || []);
      (promptParams as any).material_contexts = materialContexts;

      const { systemPrompt, userPrompt } = this.promptBuilder.build(promptParams);

      onProgress({ stage: 'AI_GENERATING', message: 'AI 正在生成剧本内容...', progress: 40 });

      const parsed = await this.generateScriptPayload(systemPrompt, userPrompt, {
        title,
        language: language || 'zh-CN',
        style_vibe,
        target_audience,
        selling_points,
        aspect_ratio: aspect_ratio as ApiAspectRatio | undefined,
        constraint_list: constraint_list || [],
        source_label: 'quick',
      });

      onProgress({ stage: 'VALIDATING_SCHEMA', message: '正在校验剧本结构...', progress: 60 });

      const schemaResult = this.schemaValidator.validate(parsed);
      if (!schemaResult.valid) {
        const hasDurationErr = schemaResult.errors.some((e) => e.message.includes('总时长'));
        const errorCode = hasDurationErr ? ErrorCode.SCRIPT_DURATION_EXCEEDED : ErrorCode.SCRIPT_SCHEMA_INVALID;
        throw serviceException(
          {
            message: `${ErrorCode.SCRIPT_SCHEMA_INVALID}: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
            error: {
              code: errorCode,
              details: schemaResult.errors,
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      onProgress({ stage: 'COMPLIANCE_CHECK', message: '正在进行合规检查...', progress: 70 });

      const complianceResult = this.complianceFilter.check(parsed.shots);
      if (!complianceResult.passed) {
        throw serviceException(
          {
            message: `${ErrorCode.COMPLIANCE_CHECK_FAILED}: ${complianceResult.violations.map((v) => v.reason).join('; ')}`,
            error: {
              code: ErrorCode.COMPLIANCE_CHECK_FAILED,
              details: complianceResult.violations,
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      onProgress({ stage: 'SAVING_TO_DB', message: '正在保存剧本到数据库...', progress: 80 });

      const scriptParams: CreateScriptParams = {
        productId: product_id,
        title: parsed.title || title,
        language: language || 'zh-CN',
        targetAudience: target_audience,
        videoDuration: parsed.video_duration,
        aspectRatio: aspect_ratio,
        styleVibe: parsed.style_vibe || style_vibe,
        generationMode: 'PROMPT_DRIVEN',
        constraintList: constraint_list || [],
        rawJson: parsed,
      };

      const shotsParams: CreateScriptShotParams[] = parsed.shots.map((shot, idx) => ({
        scriptId: '',
        shotIndex: idx + 1,
        duration: Number(shot.duration),
        sceneDescriptionQuery: String(shot.scene_description_query ?? ''),
        visualDescription: String(shot.visual_description ?? ''),
        cameraMovement: String(shot.camera_movement ?? ''),
        transitionType: String(shot.transition_type ?? ''),
        voiceoverText: String(shot.voiceover_text ?? ''),
        subtitleText: String(shot.subtitle_text ?? ''),
        safeZoneBoundingBox: ((shot.safe_zone_bounding_box ?? [0, 0, 1080, 1920]) as [number, number, number, number]),
        complianceStatus: String(shot.compliance_status ?? 'PENDING'),
      }));

      const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);

      onProgress({ stage: 'FINISHING', message: '正在完成最后的处理...', progress: 90 });

      const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);

      if (!scriptWithShots) {
        throw serviceException(
          {
            message: ErrorCode.INTERNAL_SERVER_ERROR,
            error: {
              code: ErrorCode.INTERNAL_SERVER_ERROR,
              retryable: true,
            },
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      onProgress({ stage: 'COMPLETE', message: '剧本生成完成', progress: 100 });

      return this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
    } catch (error) {
      this.logger.error(`generateQuickScriptWithProgress failed: ${error}`);
      throw error;
    }
  }

  async generateViralRewriteScript(dto: ScriptViralRewriteGenerateDto): Promise<ScriptType> {
    const {
      product_id,
      viral_video_id,
      title,
      language,
      selling_points: requestedSellingPoints,
      target_audience,
      style_vibe,
      aspect_ratio,
      constraint_list,
    } = dto;

    const product = await this.validateProductExists(product_id);
    const productCtx = this.buildProductContext(product, title, requestedSellingPoints);

    const viralAnalysis = await this.validateViralVideoAnalysis(viral_video_id);

    const promptParams: ViralRewritePromptParams = {
      selling_points: productCtx.selling_points,
      style_vibe,
      target_audience,
      language: language || 'zh-CN',
      aspect_ratio,
      constraint_list: [...(constraint_list || []), ...productCtx.constraint_list],
      viral_strategy: viralAnalysis.strategyJson as Record<string, unknown>,
      viral_factors: viralAnalysis.factorJson as Record<string, unknown>,
      viral_hook_type: viralAnalysis.hookType || '',
      viral_report: viralAnalysis.reportJson as Record<string, unknown> | undefined,
      title: productCtx.title,
    };

    // 注入素材视觉上下文
    const materialContexts = await this.enrichPromptWithMaterialContext(dto.material_ids || []);
    (promptParams as any).material_contexts = materialContexts;
    (promptParams as any).product_brief = productCtx.product_brief;

    const { systemPrompt, userPrompt } = this.viralRewritePromptBuilder.build(promptParams);

    const parsed = await this.generateScriptPayload(systemPrompt, userPrompt, {
      title: productCtx.title,
      language: language || 'zh-CN',
      style_vibe,
      target_audience,
      selling_points: productCtx.selling_points,
      aspect_ratio: aspect_ratio as ApiAspectRatio | undefined,
      constraint_list: [...(constraint_list || []), ...productCtx.constraint_list],
      source_label: 'viral-rewrite',
    });

    const schemaResult = this.schemaValidator.validate(parsed);
    if (!schemaResult.valid) {
      const hasDurationErr = schemaResult.errors.some((e) => e.message.includes('总时长'));
      const errorCode = hasDurationErr ? ErrorCode.SCRIPT_DURATION_EXCEEDED : ErrorCode.SCRIPT_SCHEMA_INVALID;
      throw serviceException(
        {
          message: `${ErrorCode.SCRIPT_SCHEMA_INVALID}: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
          error: {
            code: errorCode,
            details: schemaResult.errors,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const complianceResult = this.complianceFilter.check(parsed.shots);
    if (!complianceResult.passed) {
      throw serviceException(
        {
          message: `${ErrorCode.COMPLIANCE_CHECK_FAILED}: ${complianceResult.violations.map((v) => v.reason).join('; ')}`,
          error: {
            code: ErrorCode.COMPLIANCE_CHECK_FAILED,
            details: complianceResult.violations,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const scriptParams: CreateScriptParams = {
      productId: product_id,
      title: parsed.title || title,
      language: language || 'zh-CN',
      targetAudience: target_audience,
      videoDuration: parsed.video_duration,
      aspectRatio: aspect_ratio,
      styleVibe: parsed.style_vibe || style_vibe,
      generationMode: 'VIRAL_REWRITE',
      constraintList: constraint_list || [],
      rawJson: parsed,
      viralVideoId: viral_video_id,
    };

    const shotsParams: CreateScriptShotParams[] = parsed.shots.map((shot, idx) => ({
      scriptId: '',
      shotIndex: idx + 1,
      duration: Number(shot.duration),
      sceneDescriptionQuery: String(shot.scene_description_query),
      visualDescription: String(shot.visual_description),
      cameraMovement: String(shot.camera_movement),
      transitionType: String(shot.transition_type),
      voiceoverText: String(shot.voiceover_text),
      subtitleText: String(shot.subtitle_text),
      safeZoneBoundingBox: shot.safe_zone_bounding_box as [number, number, number, number],
      complianceStatus: 'PASSED',
    }));

    const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);

    const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);

    if (!scriptWithShots) {
      throw serviceException(
        {
          message: ErrorCode.INTERNAL_SERVER_ERROR,
          error: {
            code: ErrorCode.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const result = this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
    this.triggerAsyncTranslation(createdScript.id);
    return result;
  }

  async generateTemplateScript(dto: ScriptTemplateGenerateDto): Promise<ScriptType> {
    const {
      product_id,
      template_id,
      title,
      language,
      selling_points: requestedSellingPoints,
      target_audience,
      style_vibe,
      aspect_ratio,
      constraint_list,
    } = dto;

    const product = await this.validateProductExists(product_id);
    const productCtx = this.buildProductContext(product, title, requestedSellingPoints);

    const template = await this.validateTemplate(template_id);

    const effectiveStyleVibe = style_vibe || 'mixed';

    const promptParams: TemplatePromptParams = {
      selling_points: productCtx.selling_points,
      style_vibe: effectiveStyleVibe,
      target_audience,
      language: language || 'zh-CN',
      aspect_ratio,
      constraint_list: [...(constraint_list || []), ...productCtx.constraint_list],
      strategy_summary: template.strategySummary,
      factor_json: template.factorJson as Record<string, unknown>,
      title: productCtx.title,
    };

    // 注入素材视觉上下文
    const materialContexts = await this.enrichPromptWithMaterialContext(dto.material_ids || []);
    (promptParams as any).material_contexts = materialContexts;
    (promptParams as any).product_brief = productCtx.product_brief;

    const { systemPrompt, userPrompt } = this.templatePromptBuilder.build(promptParams);

    const parsed = await this.generateScriptPayload(systemPrompt, userPrompt, {
      title: productCtx.title,
      language: language || 'zh-CN',
      style_vibe: effectiveStyleVibe,
      target_audience,
      selling_points: productCtx.selling_points,
      aspect_ratio: aspect_ratio as ApiAspectRatio | undefined,
      constraint_list: [...(constraint_list || []), ...productCtx.constraint_list],
      source_label: 'template',
    });

    const schemaResult = this.schemaValidator.validate(parsed);
    if (!schemaResult.valid) {
      const hasDurationErr = schemaResult.errors.some((e) => e.message.includes('总时长'));
      const errorCode = hasDurationErr ? ErrorCode.SCRIPT_DURATION_EXCEEDED : ErrorCode.SCRIPT_SCHEMA_INVALID;
      throw serviceException(
        {
          message: `${ErrorCode.SCRIPT_SCHEMA_INVALID}: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
          error: {
            code: errorCode,
            details: schemaResult.errors,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const complianceResult = this.complianceFilter.check(parsed.shots);
    if (!complianceResult.passed) {
      throw serviceException(
        {
          message: `${ErrorCode.COMPLIANCE_CHECK_FAILED}: ${complianceResult.violations.map((v) => v.reason).join('; ')}`,
          error: {
            code: ErrorCode.COMPLIANCE_CHECK_FAILED,
            details: complianceResult.violations,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const scriptParams: CreateScriptParams = {
      productId: product_id,
      title: parsed.title || title,
      language: language || 'zh-CN',
      targetAudience: target_audience,
      videoDuration: parsed.video_duration,
      aspectRatio: aspect_ratio,
      styleVibe: parsed.style_vibe || effectiveStyleVibe,
      generationMode: 'TEMPLATE_DRIVEN',
      constraintList: constraint_list || [],
      rawJson: parsed,
      templateId: template_id,
    };

    const shotsParams: CreateScriptShotParams[] = parsed.shots.map((shot, idx) => ({
      scriptId: '',
      shotIndex: idx + 1,
      duration: Number(shot.duration),
      sceneDescriptionQuery: String(shot.scene_description_query),
      visualDescription: String(shot.visual_description),
      cameraMovement: String(shot.camera_movement),
      transitionType: String(shot.transition_type),
      voiceoverText: String(shot.voiceover_text),
      subtitleText: String(shot.subtitle_text),
      safeZoneBoundingBox: shot.safe_zone_bounding_box as [number, number, number, number],
      complianceStatus: 'PASSED',
    }));

    const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);

    const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);

    if (!scriptWithShots) {
      throw serviceException(
        {
          message: ErrorCode.INTERNAL_SERVER_ERROR,
          error: {
            code: ErrorCode.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const result = this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
    this.triggerAsyncTranslation(createdScript.id);
    return result;
  }

  async getScriptDetail(scriptId: string): Promise<ScriptType> {
    const scriptWithShots = await this.repository.findScriptWithShots(scriptId);

    if (!scriptWithShots) {
      throw serviceException(
        {
          message: ErrorCode.SCRIPT_NOT_FOUND,
          error: {
            code: ErrorCode.SCRIPT_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 安全校验：script 必须归属到特定 product
    if (!scriptWithShots.script.productId) {
      throw serviceException(
        {
          message: '剧本缺少商品归属',
          error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
  }

  async listScriptsByProduct(
    productId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedData<ScriptType>> {
    await this.validateProductExists(productId);

    const [scripts, total] = await Promise.all([
      this.repository.findScriptsByProductId(productId, page, pageSize),
      this.repository.countScriptsByProductId(productId),
    ]);

    return {
      items: scripts.map(({ script, shots }) => this.mapPrismaToScriptType(script, shots)),
      page,
      page_size: pageSize,
      total,
      has_more: page * pageSize < total,
    };
  }

  /**
   * 验证产品存在并返回产品数据，供各生成方法获取 title/selling_points/category 等上下文
   */
  private async validateProductExists(productId: string): Promise<Product> {
    if (!productId) {
      throw serviceException(
        {
          message: SCRIPT_CONSTANTS.ERROR_MESSAGES.PRODUCT_ID_REQUIRED,
          error: {
            code: ErrorCode.PRODUCT_ID_REQUIRED,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const product = await this.productRepository.findProductById(productId);
    if (!product) {
      throw serviceException(
        {
          message: SCRIPT_CONSTANTS.ERROR_MESSAGES.PRODUCT_NOT_FOUND,
          error: {
            code: ErrorCode.PRODUCT_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return product;
  }

  /**
   * 从 Product 数据构建产品上下文信息
   * 返回: { title, selling_points, constraint_list, product_brief }
   * 各生成方法统一使用此方法获取产品相关 prompt 数据
   */
  private buildProductContext(
    product: Product,
    dtoTitle?: string,
    dtoSellingPoints?: string[],
  ): {
    title: string;
    selling_points: string[];
    constraint_list: string[];
    product_brief: string;
    target_audience?: string;
  } {
    const title = dtoTitle || product.title || '';
    const selling_points = (dtoSellingPoints && dtoSellingPoints.length > 0)
      ? dtoSellingPoints
      : (product.sellingPoints as string[]) || [];

    const constraint_list: string[] = [];
    if (product.category) constraint_list.push(`product_category: ${product.category}`);
    if (product.usageScenario) constraint_list.push(`usage_scenario: ${product.usageScenario}`);
    if (product.brand) constraint_list.push(`brand: ${product.brand}`);
    if (product.color) constraint_list.push(`product_color: ${product.color}`);
    if (product.materialType) constraint_list.push(`material: ${product.materialType}`);
    if (product.sizeDesc) constraint_list.push(`size: ${product.sizeDesc}`);

    // 构建产品简介文本
    const briefLines: string[] = [];
    if (title) briefLines.push(`产品: ${title}`);
    if (product.category) briefLines.push(`类目: ${product.category}`);
    if (product.brand) briefLines.push(`品牌: ${product.brand}`);
    if (selling_points.length) briefLines.push(`卖点: ${selling_points.join('；')}`);
    if (product.targetAudience) briefLines.push(`受众: ${product.targetAudience}`);
    if (product.usageScenario) briefLines.push(`场景: ${product.usageScenario}`);
    if (product.color) briefLines.push(`颜色: ${product.color}`);
    if (product.materialType) briefLines.push(`材质: ${product.materialType}`);
    if (product.sizeDesc) briefLines.push(`尺寸: ${product.sizeDesc}`);
    if (product.richFeatures && Object.keys(product.richFeatures as object).length > 0) {
      briefLines.push(`特性: ${JSON.stringify(product.richFeatures)}`);
    }
    const product_brief = briefLines.join(' | ');

    return {
      title,
      selling_points,
      constraint_list,
      product_brief,
      target_audience: product.targetAudience || undefined,
    };
  }

  private async validateViralVideoAnalysis(viralVideoId: string): Promise<ViralVideoAnalysis> {
    if (!viralVideoId) {
      throw serviceException(
        {
          message: 'viral_video_id 为必填字段',
          error: {
            code: ErrorCode.INVALID_REQUEST,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const analysis = await this.repository.findViralVideoAnalysis(viralVideoId);

    if (!analysis) {
      throw serviceException(
        {
          message: ErrorCode.VIRAL_VIDEO_ANALYSIS_NOT_FOUND,
          error: {
            code: ErrorCode.VIRAL_VIDEO_ANALYSIS_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!analysis.declaredPublicSource) {
      throw serviceException(
        {
          message: ErrorCode.VIRAL_ANALYSIS_NOT_PUBLIC,
          error: {
            code: ErrorCode.VIRAL_ANALYSIS_NOT_PUBLIC,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const strategyJson = analysis.strategyJson as Record<string, unknown> | null;
    const factorJson = analysis.factorJson as Record<string, unknown> | null;

    if (
      !strategyJson ||
      Object.keys(strategyJson).length < SCRIPT_CONSTANTS.VIRAL_REWRITE.MIN_FACTOR_KEYS ||
      !factorJson ||
      Object.keys(factorJson).length < SCRIPT_CONSTANTS.VIRAL_REWRITE.MIN_FACTOR_KEYS
    ) {
      throw serviceException(
        {
          message: ErrorCode.VIRAL_ANALYSIS_NOT_PUBLIC,
          error: {
            code: ErrorCode.VIRAL_ANALYSIS_NOT_PUBLIC,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return analysis;
  }

  private async validateTemplate(templateId: string): Promise<Template> {
    if (!templateId) {
      throw serviceException(
        {
          message: 'template_id 为必填字段',
          error: {
            code: ErrorCode.INVALID_REQUEST,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const template = await this.repository.findTemplateById(templateId);

    if (!template) {
      throw serviceException(
        {
          message: ErrorCode.TEMPLATE_NOT_FOUND,
          error: {
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (template.status !== 'ACTIVE') {
      throw serviceException(
        {
          message: `${ErrorCode.TEMPLATE_NOT_ACTIVE}: 模板 ${templateId} 状态为 ${template.status}，不可用于生成`,
          error: {
            code: ErrorCode.TEMPLATE_NOT_ACTIVE,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const factorJson = template.factorJson as Record<string, unknown> | null;
    if (!factorJson || Object.keys(factorJson).length === 0) {
      throw serviceException(
        {
          message: `${ErrorCode.TEMPLATE_FACTOR_EMPTY}: 模板因子配置为空，无法用于生成`,
          error: {
            code: ErrorCode.TEMPLATE_FACTOR_EMPTY,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!template.strategySummary || template.strategySummary.trim().length === 0) {
      throw serviceException(
        {
          message: `${ErrorCode.TEMPLATE_FACTOR_EMPTY}: 模板策略摘要为空，无法用于生成`,
          error: {
            code: ErrorCode.TEMPLATE_FACTOR_EMPTY,
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return template;
  }

  /** 宽松版模板校验：不存在/未激活时返回 null，不抛异常 */
  private async validateTemplateGracefully(templateId: string): Promise<Template | null> {
    try {
      return await this.validateTemplate(templateId);
    } catch {
      this.logger.warn(`[validateTemplateGracefully] 模板 ${templateId} 不可用，跳过`);
      return null;
    }
  }

  /** 宽松版爆款分析校验：不存在/非公开时返回 null，不抛异常 */
  private async validateViralVideoAnalysisGracefully(viralVideoId: string): Promise<ViralVideoAnalysis | null> {
    try {
      return await this.validateViralVideoAnalysis(viralVideoId);
    } catch {
      this.logger.warn(`[validateViralVideoAnalysisGracefully] 爆款分析 ${viralVideoId} 不可用，跳过`);
      return null;
    }
  }

  /** 查找第一个可用的公开爆款视频分析 */
  private async findFirstAvailableViralAnalysis(): Promise<ViralVideoAnalysis | null> {
    // 通过已有方法查找有完整数据的公开爆款分析
    // 先尝试通过 repository 获取所有 declaredPublic 的分析
    try {
      const allAnalyses = await this.repository.findAllViralVideoAnalyses();
      if (!allAnalyses || allAnalyses.length === 0) return null;
      
      for (const analysis of allAnalyses) {
        try {
          return await this.validateViralVideoAnalysis(analysis.id);
        } catch {
          continue;
        }
      }
    } catch (e) {
      this.logger.warn(`[findFirstAvailableViralAnalysis] 查找爆款分析失败: ${(e as Error)?.message || 'unknown'}`);
    }
    return null;
  }

  /** 构建组合引擎附加上下文 */
  private buildComposedContext(
    strategySummary: string,
    mergedFactors: Record<string, unknown>,
    viralHookType: string,
    viralStrategy: Record<string, unknown>,
    viralReport: Record<string, unknown> | undefined,
    extra?: {
      title?: string;
      constraint_list?: string[];
      product_brief?: string;
      dna_narrative?: string;
    },
  ): string {
    const parts: string[] = [];

    // 产品信息（最高优先级）
    if (extra?.product_brief) {
      parts.push(`【产品全貌】\n${extra.product_brief}`);
    }
    if (extra?.title && !extra?.product_brief) {
      parts.push(`【产品名称】${extra.title}`);
    }

    // 约束信息
    if (extra?.constraint_list && extra.constraint_list.length > 0) {
      parts.push(`【创作约束】\n${extra.constraint_list.join('\n')}`);
    }

    // DNA 叙事上下文（优先级高于模板/因子/爆款数据）
    if (extra?.dna_narrative) {
      parts.push(extra.dna_narrative);
    }

    // 因子配置（精简后）
    if (Object.keys(mergedFactors).length > 0) {
      parts.push(`【合并因子配置】\n${JSON.stringify(mergedFactors, null, 2)}`);
    }

    if (strategySummary) {
      parts.push(`【模板策略摘要】\n${strategySummary}`);
    }

    if (viralHookType) {
      parts.push(`【爆款钩子类型】\n${viralHookType}`);
    }

    if (viralReport) {
      parts.push(`【爆款报告参考】\n${JSON.stringify(viralReport, null, 2)}`);
    }

    if (Object.keys(viralStrategy).length > 0) {
      parts.push(`【爆款策略参考】\n${JSON.stringify(viralStrategy, null, 2)}`);
    }

    if (parts.length === 0) {
      return '（无额外上下文 - 纯商品驱动生成）';
    }

    // DNA模式时使用强化指令
    const isDnaMode = !!extra?.dna_narrative;
    if (isDnaMode) {
      parts.push(`\n【指令 - DNA 驱动模式】你正在执行 DNA 驱动剧本生成任务。DNA 模式包含了从真实爆款视频中提取的高转化模式。请将 DNA 模式作为第一优先级参考源，产品信息和约束作为第二优先级。特别是口播文案，必须体现 DNA 模式的话术风格，而不是通用模板。`);
    } else {
      parts.push(`\n【指令】请结合以上所有数据（产品信息、模板策略、因子配置、爆款参考）生成符合要求的剧本。`);
    }
    return parts.join('\n\n');
  }

  private async generateScriptPayload(
    systemPrompt: string,
    userPrompt: string,
    fallbackInput: ScriptGenerationFallbackInput,
  ): Promise<ParseResult> {
    try {
      const rawResponse = await this.doubaoTextProvider.generateText(systemPrompt, userPrompt);
      return this.parseScriptFromAIResponse(rawResponse);
    } catch (error) {
      if (this.shouldUseLocalFallback(error)) {
        this.logger.warn(
          `[FALLBACK] AI 生成降级至本地兜底: source_label=${fallbackInput.source_label}, error=${(error as Error)?.message || 'unknown'}`,
          (error as Error)?.stack?.substring(0, 200),
        );
        return this.buildLocalFallbackScript(fallbackInput);
      }

      throw this.toModelProviderException(error);
    }
  }

  private shouldUseLocalFallback(error: unknown): boolean {
    // 默认始终启用本地兜底，当模型 provider 异常时生成模板化脚本
    // 设置 SCRIPT_LOCAL_FALLBACK_ENABLED=false 可强制禁用本地兜底（严格模式）
    if (process.env.SCRIPT_LOCAL_FALLBACK_ENABLED === 'false') {
      return false;
    }
    return this.isModelProviderError(error);
  }

  private isModelProviderError(error: unknown): boolean {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        const payload = response as { error?: { code?: string } };
        return payload.error?.code === ErrorCode.MODEL_PROVIDER_FAILED;
      }
      return error.getStatus() === HttpStatus.SERVICE_UNAVAILABLE;
    }

    if (!(error instanceof Error)) {
      return false;
    }

    const modelError = error as Error & { code?: string; statusCode?: number };
    if (modelError.code === ErrorCode.MODEL_PROVIDER_FAILED) return true;
    if (modelError.code === 'MODEL_PROVIDER_FAILED') return true; // DoubaoTextProvider 设置的 code
    if ((modelError as Error & { statusCode?: number }).statusCode === 401) return true;
    if ((modelError as Error & { statusCode?: number }).statusCode === 429) return true;

    // 网络错误（fetch 失败、DNS 解析失败、连接超时等）也触发本地降级
    const msg = modelError.message?.toLowerCase() || '';
    if (
      msg.includes('fetch failed') ||
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('etimedout') ||
      msg.includes('timeout') ||
      msg.includes('abort')
    ) {
      return true;
    }

    return false;
  }

  private toModelProviderException(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    if (this.isModelProviderError(error)) {
      return serviceException(
        {
          message: SCRIPT_CONSTANTS.ERROR_MESSAGES.MODEL_PROVIDER_FAILED,
          error: {
            code: ErrorCode.MODEL_PROVIDER_FAILED,
            retryable: true,
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // 不再透传原始错误消息，避免泄露内部信息
    return serviceException(
      {
        message: SCRIPT_CONSTANTS.ERROR_MESSAGES.INTERNAL_ERROR,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          retryable: true,
        },
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  private buildLocalFallbackScript(input: ScriptGenerationFallbackInput): ParseResult {
    const sellingPoints = input.selling_points.filter((item) => item && item.trim().length > 0);
    const primaryPoint = sellingPoints[0] || '核心卖点';
    const secondaryPoint = sellingPoints[1] || primaryPoint;
    const tertiaryPoint = sellingPoints[2] || secondaryPoint;
    const audience = input.target_audience?.trim() || '目标用户';
    const frameLabel = input.aspect_ratio === '16:9' ? 'horizontal' : 'vertical';
    const dur = SCRIPT_CONSTANTS.FALLBACK_SCRIPT.SHOT_DURATIONS;
    const sz = SCRIPT_CONSTANTS.FALLBACK_SCRIPT;

    return {
      title: input.title?.trim() || `${primaryPoint}短视频脚本`,
      video_duration: SCRIPT_CONSTANTS.FALLBACK_SCRIPT.VIDEO_DURATION,
      style_vibe: input.style_vibe,
      shots: [
        {
          shot_index: 1,
          duration: dur[0],
          scene_description_query: `${frameLabel} ecommerce hero shot for ${primaryPoint}`,
          visual_description: `产品主体快速出场，开场镜头直接聚焦 ${primaryPoint}，画面保持干净利落并突出 ${input.style_vibe} 气质。`,
          camera_movement: 'Dolly_In_Fast',
          transition_type: 'Fade_In',
          voiceover_text: `开场先看 ${primaryPoint}，把用户最关心的信息直接放到画面前段。`,
          subtitle_text: primaryPoint,
          safe_zone_bounding_box: [...SCRIPT_CONSTANTS.DEFAULT_SAFE_ZONE] as [number, number, number, number],
        },
        {
          shot_index: 2,
          duration: dur[1],
          scene_description_query: `${frameLabel} product demo scene highlighting ${secondaryPoint}`,
          visual_description: `切到真实使用场景，用更近的人物或手部操作镜头说明 ${secondaryPoint} 的体验感受。`,
          camera_movement: 'Pan_Left',
          transition_type: 'Dissolve',
          voiceover_text: `第二段强调 ${secondaryPoint}，让观众理解它在真实使用里的具体价值。`,
          subtitle_text: secondaryPoint,
          safe_zone_bounding_box: [...sz.SAFE_ZONE_ALT] as [number, number, number, number],
        },
        {
          shot_index: 3,
          duration: dur[2],
          scene_description_query: `${frameLabel} comparison scene showing ${tertiaryPoint}`,
          visual_description: `通过前后对比或双画面信息编排，把 ${tertiaryPoint} 的优势表达得更直观。`,
          camera_movement: 'Tilt_Up',
          transition_type: 'Wipe',
          voiceover_text: `再把 ${tertiaryPoint} 讲清楚，用清晰的对比帮助 ${audience} 快速建立判断。`,
          subtitle_text: tertiaryPoint,
          safe_zone_bounding_box: [...sz.SAFE_ZONE_3] as [number, number, number, number],
        },
        {
          shot_index: 4,
          duration: dur[3],
          scene_description_query: `${frameLabel} multi-angle product details with subtitle overlays`,
          visual_description: `回到产品细节特写，补充核心参数、质感和适配场景，让卖点与购买理由形成闭环。`,
          camera_movement: 'Dolly_Out',
          transition_type: 'Dissolve',
          voiceover_text: `把核心功能和使用场景合在一起说明，让信息完整但节奏仍然紧凑。`,
          subtitle_text: '核心信息一屏看懂',
          safe_zone_bounding_box: [...sz.SAFE_ZONE_4] as [number, number, number, number],
        },
        {
          shot_index: 5,
          duration: dur[4],
          scene_description_query: `${frameLabel} end card with brand and product summary`,
          visual_description: `最后一镜做品牌收束与商品总结，保留清晰的字幕安全区，方便后续导出和投放。`,
          camera_movement: 'Static',
          transition_type: 'None',
          voiceover_text: `如果你想进一步了解 ${primaryPoint} 和 ${secondaryPoint}，可以继续查看商品详情。`,
          subtitle_text: '继续查看商品详情',
          safe_zone_bounding_box: [...sz.SAFE_ZONE_5] as [number, number, number, number],
        },
      ],
    };
  }

  private parseScriptFromAIResponse(rawResponse: string): ParseResult {
    if (!rawResponse || rawResponse.trim().length === 0) {
      throw serviceException(
        {
          message: ErrorCode.MODEL_PROVIDER_FAILED,
          error: {
            code: ErrorCode.MODEL_PROVIDER_FAILED,
            retryable: true,
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

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
      throw serviceException(
        {
          message: `${ErrorCode.SCRIPT_PARSE_FAILED}: ${cleaned.substring(0, 200)}`,
          error: {
            code: ErrorCode.SCRIPT_PARSE_FAILED,
            retryable: false,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const shots = parsed.shots as Array<Record<string, unknown>> | undefined;
    if (!shots || !Array.isArray(shots)) {
      throw serviceException(
        {
          message: `${ErrorCode.SCRIPT_PARSE_FAILED}: 缺少 shots 字段`,
          error: {
            code: ErrorCode.SCRIPT_PARSE_FAILED,
            retryable: false,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (shots.length === 0) {
      throw serviceException(
        {
          message: ErrorCode.SCRIPT_NO_SHOTS_GENERATED,
          error: {
            code: ErrorCode.SCRIPT_NO_SHOTS_GENERATED,
            retryable: false,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return {
      title: parsed.title as string | undefined,
      video_duration: (() => {
        const raw = Number(parsed.video_duration);
        if (!Number.isNaN(raw)) return raw;
        return shots.reduce((sum, s) => sum + Number(s.duration || 0), 0);
      })(),
      style_vibe: (parsed.style_vibe as string) || '',
      shots,
    };
  }

  private mapPrismaToScriptType(script: Script, shots: ScriptShot[]): ScriptType {
    return {
      script_id: script.id,
      product_id: script.productId,
      title: script.title || undefined,
      language: (script.language as SupportedLocale) || 'zh-CN',
      target_audience: script.targetAudience || undefined,
      video_duration: Number(script.videoDuration),
      aspect_ratio: this.mapAspectRatioToApi(script.aspectRatio),
      style_vibe: script.styleVibe,
      generation_mode: script.generationMode,
      template_id: script.templateId || undefined,
      viral_video_id: script.viralVideoId || undefined,
      constraint_list: this.mapStringArray(script.constraintList),
      raw_json: this.mapJsonObject(script.rawJson),
      shots: shots.map((shot): ScriptShotType => ({
        id: shot.id,
        shot_id: shot.shotId || undefined,
        shot_index: shot.shotIndex,
        duration: Number(shot.duration),
        scene_description_query: shot.sceneDescriptionQuery,
        visual_description: shot.visualDescription,
        camera_movement: shot.cameraMovement,
        transition_type: shot.transitionType,
        voiceover_text: shot.voiceoverText,
        subtitle_text: shot.subtitleText,
        safe_zone_bounding_box: this.normalizeSafeZoneBoundingBox(shot.safeZoneBoundingBox),
        selected_slice_id: shot.selectedSliceId || undefined,
        render_prompt: shot.renderPrompt || undefined,
        local_factor_patch: this.mapJsonObject(shot.localFactorPatch),
        bgm_segment: this.extractBgmSegmentFromShot(shot),
        compliance_status: shot.complianceStatus,
        created_at: shot.createdAt.toISOString(),
        updated_at: shot.updatedAt.toISOString(),
      })),
      created_at: script.createdAt.toISOString(),
      updated_at: script.updatedAt.toISOString(),
    };
  }

  private mapAspectRatioToApi(aspectRatio: string): ApiAspectRatio {
    if (aspectRatio === 'SIXTEEN_NINE' || aspectRatio === '16:9') {
      return '16:9';
    }
    return '9:16';
  }

  /**
   * 标准化 Safe Zone Bounding Box，Prisma Json 字段类型为 unknown，此处做运行时校验。
   * 值缺失或格式不合法时回退到 SCRIPT_CONSTANTS.DEFAULT_SAFE_ZONE。
   */
  private normalizeSafeZoneBoundingBox(value: unknown): [number, number, number, number] {
    if (!Array.isArray(value) || value.length !== 4) {
      return [...SCRIPT_CONSTANTS.DEFAULT_SAFE_ZONE] as [number, number, number, number];
    }
    return value.map((v) => Number(v)) as [number, number, number, number];
  }

  private mapStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
  }

  private mapJsonObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private extractBgmSegmentFromShot(shot: ScriptShot): BgmSegment | undefined {
    // 优先从 localFactorPatch JSON 中提取 bgm_segment（前端 PATCH 写入位置）
    const localPatch = shot.localFactorPatch as Record<string, unknown> | undefined;
    if (localPatch?.bgm_segment && typeof localPatch.bgm_segment === 'object' && !Array.isArray(localPatch.bgm_segment)) {
      return localPatch.bgm_segment as unknown as BgmSegment;
    }
    // 兜底：从独立列 bgmSegment 读取
    const bgmSegment = (shot as any).bgmSegment;
    if (bgmSegment && typeof bgmSegment === 'object' && !Array.isArray(bgmSegment)) {
      return bgmSegment as unknown as BgmSegment;
    }
    return undefined;
  }

  /**
   * 从 AI 生成的分镜输出中提取应持久化的 localFactorPatch 字段。
   * 当前提取 bgm_segment，确保因子混重后 BGM 配置不丢失。
   */
  private extractLocalFactorPatchFromAiShot(shot: Record<string, unknown>): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (shot.bgm_segment && typeof shot.bgm_segment === 'object' && !Array.isArray(shot.bgm_segment)) {
      patch.bgm_segment = shot.bgm_segment;
    }
    return patch;
  }

  async patchScript(scriptId: string, operations: PatchOperationDTO[]): Promise<ScriptPatchResponse> {
    if (!scriptId || scriptId.trim().length === 0) {
      throw this.buildInvalidRequestException('script_id 为必填字段');
    }

    if (!Array.isArray(operations) || operations.length === 0) {
      throw this.buildInvalidRequestException('Patch 操作数组不能为空');
    }

    const scriptWithShots = await this.getScriptWithShotsOrThrow(scriptId);

    // 安全校验：script 必须归属到特定 product
    if (!scriptWithShots.script.productId) {
      throw serviceException(
        {
          message: '剧本缺少商品归属',
          error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const state = this.buildEditableScriptState(scriptWithShots.script, scriptWithShots.shots);
    const nextState = this.cloneEditableScriptState(state);
    const updatedFields: string[] = [];
    const touchedShotIndexes = new Set<number>();
    let hasStructuralChanges = false;

    for (const operation of operations) {
      const parsedPath = this.parsePatchPath(operation.path, operation.op);
      const moveSourcePath = operation.op === 'move'
        ? this.parseMoveSourcePath(operation.from)
        : undefined;
      updatedFields.push(parsedPath.normalizedPath);

      if (moveSourcePath) {
        updatedFields.push(moveSourcePath.normalizedPath);
      }

      if (parsedPath.kind === 'shot') {
        touchedShotIndexes.add(parsedPath.shotIndex);
        if (parsedPath.wholeShot) {
          hasStructuralChanges = true;
        }
      }

      if (moveSourcePath?.kind === 'shot') {
        touchedShotIndexes.add(moveSourcePath.shotIndex);
        hasStructuralChanges = true;
      }

      this.applyPatchOperation(nextState, parsedPath, operation, moveSourcePath);
    }

    this.normalizeEditableScriptState(nextState);

    const isPureStructuralOnly = updatedFields.every((f) =>
      f.startsWith('/shots/') && /^\/shots\/\d+$/.test(f.split('/').slice(0, 3).join('/')),
    ) && !updatedFields.some((f) => f.includes('/duration') || f.includes('/voiceover_text'));

    const isPureMoveOnly = operations.every((operation) => operation.op === 'move');

    this.validateEditableScriptState(nextState, true, isPureStructuralOnly, isPureMoveOnly);

    const scriptData = this.buildScriptUpdateData(nextState);
    const updatedScript = hasStructuralChanges
      ? await this.repository.syncScriptWithShots(
          scriptId,
          scriptData,
          this.buildSyncedShotData(nextState),
        )
      : await this.repository.updateScriptWithShots(
          scriptId,
          scriptData,
          this.buildPatchedShotUpdates(scriptWithShots.shots, nextState, touchedShotIndexes),
        );

    // 检测字幕文本变更，异步触发多语种翻译
    const hasSubtitleChange = updatedFields.some((f) => f.includes('/subtitle_text'));
    if (hasSubtitleChange) {
      this.triggerAsyncTranslation(scriptId);
    }

    return {
      script_id: scriptId,
      video_duration: this.roundToTwoDecimals(nextState.video_duration),
      timing_validation: this.buildTimingValidationResponse(
        this.resolveTimingTarget(nextState, touchedShotIndexes),
        nextState.language,
      ),
      updated_fields: Array.from(new Set(updatedFields)),
      updated_at: updatedScript.updatedAt.toISOString(),
    };
  }

  async saveScript(scriptId: string, dto: SaveScriptRequestDto): Promise<ScriptSaveResponse> {
    if (!scriptId || scriptId.trim().length === 0) {
      throw this.buildInvalidRequestException('script_id 为必填字段');
    }

    const scriptWithShots = await this.getScriptWithShotsOrThrow(scriptId);

    // 安全校验：script 必须归属到特定 product
    if (!scriptWithShots.script.productId) {
      throw serviceException(
        {
          message: '剧本缺少商品归属',
          error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const state = this.buildEditableScriptState(scriptWithShots.script, scriptWithShots.shots);

    this.normalizeEditableScriptState(state);
    this.validateEditableScriptState(state, dto.force_revalidate ?? true);

    const updatedScript = await this.repository.updateScriptWithShots(
      scriptId,
      this.buildScriptUpdateData(state),
      this.buildPatchedShotUpdates(
        scriptWithShots.shots,
        state,
        new Set(scriptWithShots.shots.map((shot) => shot.shotIndex)),
      ),
    );

    return {
      script_id: updatedScript.id,
      product_id: updatedScript.productId,
      video_duration: this.roundToTwoDecimals(state.video_duration),
      shots_count: state.shots.length,
      save_status: 'SAVED',
      validation_summary: {
        schema_valid: true,
        timing_valid: true,
        compliance_valid: true,
      },
      updated_at: updatedScript.updatedAt.toISOString(),
    };
  }

  async validateTiming(
    scriptId: string,
    dto: ValidateTimingDto,
  ): Promise<ScriptValidateTimingResponse> {
    if (!scriptId || scriptId.trim().length === 0) {
      throw this.buildInvalidRequestException('script_id 为必填字段');
    }

    const scriptWithShots = await this.getScriptWithShotsOrThrow(scriptId);

    // 安全校验：script 必须归属到特定 product
    if (!scriptWithShots.script.productId) {
      throw serviceException(
        {
          message: '剧本缺少商品归属',
          error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const shotExists = scriptWithShots.shots.some((shot) => shot.shotIndex === dto.shot_index);

    if (!shotExists) {
      throw serviceException(
        {
          message: 'shot index out of range',
          error: {
            code: ErrorCode.SHOT_INDEX_OUT_OF_RANGE,
            details: [
              {
                field: 'shot_index',
                reason: `分镜 ${dto.shot_index} 不存在`,
              },
            ],
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return this.buildTimingValidationResponse(
      {
        shot_index: dto.shot_index,
        voiceover_text: dto.voiceover_text,
        duration: dto.duration,
      },
      dto.language || scriptWithShots.script.language || SCRIPT_CONSTANTS.DEFAULT_LANGUAGE,
    );
  }

  private async getScriptWithShotsOrThrow(scriptId: string) {
    const scriptWithShots = await this.repository.findScriptWithShots(scriptId);

    if (!scriptWithShots) {
      throw serviceException(
        {
          message: 'script not found',
          error: {
            code: ErrorCode.SCRIPT_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return scriptWithShots;
  }

  private buildEditableScriptState(script: Script, shots: ScriptShot[]): EditableScriptState {
    return {
      title: script.title || undefined,
      language: script.language || SCRIPT_CONSTANTS.DEFAULT_LANGUAGE,
      target_audience: script.targetAudience || undefined,
      style_vibe: script.styleVibe,
      constraint_list: this.mapStringArray(script.constraintList),
      video_duration: Number(script.videoDuration),
      shots: shots.map((shot) => ({
        id: shot.id,
        shot_id: shot.shotId || null,
        shot_index: shot.shotIndex,
        duration: Number(shot.duration),
        scene_description_query: shot.sceneDescriptionQuery,
        visual_description: shot.visualDescription,
        camera_movement: shot.cameraMovement,
        transition_type: shot.transitionType,
        voiceover_text: shot.voiceoverText,
        subtitle_text: shot.subtitleText,
        safe_zone_bounding_box: shot.safeZoneBoundingBox as [number, number, number, number],
        selected_slice_id: shot.selectedSliceId || null,
        render_prompt: shot.renderPrompt || null,
        local_factor_patch: this.mapJsonObject(shot.localFactorPatch),
        compliance_status: shot.complianceStatus,
      })),
    };
  }

  private cloneEditableScriptState(state: EditableScriptState): EditableScriptState {
    return JSON.parse(JSON.stringify(state)) as EditableScriptState;
  }

  private parsePatchPath(path: string, op: PatchOperationDTO['op']): ParsedPatchPath {
    if (!path || typeof path !== 'string') {
      throw this.buildInvalidRequestException('Patch 路径不能为空');
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    for (const rootPath of SCRIPT_CONSTANTS.PATCH_ALLOWED_ROOT_PATHS) {
      if (normalizedPath === rootPath || normalizedPath.startsWith(`${rootPath}/`)) {
        return {
          kind: 'root',
          normalizedPath,
          rootKey: rootPath.slice(1),
          segments: normalizedPath.slice(1).split('/'),
        };
      }
    }

    const shotMatch = normalizedPath.match(/^\/shots\/(\d+)(?:\/(.*))?$/);
    if (!shotMatch) {
      throw this.buildPatchPathNotAllowedException(normalizedPath);
    }

    const shotIndex = Number(shotMatch[1]);
    if (!Number.isInteger(shotIndex) || shotIndex < 1) {
      throw this.buildInvalidRequestException(`非法的分镜索引: ${shotMatch[1]}`);
    }

    const fieldPath = shotMatch[2];
    if (!fieldPath) {
      if (op === 'replace') {
        throw this.buildPatchOpInvalidException('分镜级路径仅允许 add / remove / move');
      }

      return {
        kind: 'shot',
        normalizedPath,
        shotIndex,
        wholeShot: true,
        segments: [],
      };
    }

    const baseField = fieldPath.split('/')[0];
    if (!SCRIPT_CONSTANTS.PATCH_ALLOWED_SHOT_FIELDS.includes(baseField as typeof SCRIPT_CONSTANTS.PATCH_ALLOWED_SHOT_FIELDS[number])) {
      throw this.buildPatchPathNotAllowedException(normalizedPath);
    }

    return {
      kind: 'shot',
      normalizedPath,
      shotIndex,
      wholeShot: false,
      segments: fieldPath.split('/'),
    };
  }

  private parseMoveSourcePath(from: string | undefined): ParsedPatchPath {
    if (!from || typeof from !== 'string') {
      throw this.buildPatchOpInvalidException('move 操作必须提供 from 路径');
    }

    const parsedFrom = this.parsePatchPath(from, 'move');
    if (parsedFrom.kind !== 'shot' || !parsedFrom.wholeShot) {
      throw this.buildPatchOpInvalidException('move 仅支持 /shots/{index} -> /shots/{index} 的分镜重排');
    }

    return parsedFrom;
  }

  private applyPatchOperation(
    state: EditableScriptState,
    parsedPath: ParsedPatchPath,
    operation: PatchOperationDTO,
    moveSourcePath?: ParsedPatchPath,
  ): void {
    if (operation.op === 'move') {
      if (
        parsedPath.kind !== 'shot'
        || !parsedPath.wholeShot
        || !moveSourcePath
        || moveSourcePath.kind !== 'shot'
        || !moveSourcePath.wholeShot
      ) {
        throw this.buildPatchOpInvalidException('move 仅支持 /shots/{index} -> /shots/{index} 的分镜重排');
      }

      // 禁止分镜移动到自身
      if (moveSourcePath.shotIndex === parsedPath.shotIndex) {
        throw this.buildPatchOpInvalidException(
          `move 操作的 from 和 path 指向同一分镜 shots[${parsedPath.shotIndex}]`,
        );
      }

      this.applyShotMoveOperation(state, moveSourcePath.shotIndex, parsedPath.shotIndex);
      return;
    }

    if (parsedPath.kind === 'root') {
      this.applyNestedOperation(state, parsedPath.segments, operation);
      return;
    }

    if (parsedPath.wholeShot) {
      this.applyWholeShotPatchOperation(state, parsedPath.shotIndex, operation);
      return;
    }

    const targetShot = this.getShotByIndex(state.shots, parsedPath.shotIndex);
    if (!targetShot) {
      throw serviceException(
        {
          message: 'shot index out of range',
          error: {
            code: ErrorCode.SHOT_INDEX_OUT_OF_RANGE,
            details: [
              {
                field: 'path',
                reason: `分镜 ${parsedPath.shotIndex} 不存在`,
              },
            ],
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    this.applyNestedOperation(targetShot, parsedPath.segments, operation);
  }

  private applyWholeShotPatchOperation(
    state: EditableScriptState,
    shotIndex: number,
    operation: PatchOperationDTO,
  ): void {
    if (operation.op === 'add') {
      if (shotIndex > state.shots.length + 1) {
        throw this.buildInvalidRequestException(`新增分镜位置 ${shotIndex} 超出可插入范围`);
      }

      state.shots.splice(shotIndex - 1, 0, this.createShotFromPatchValue(operation.value, shotIndex));
      this.reindexShots(state.shots);
      return;
    }

    if (operation.op === 'remove') {
      const targetIndex = state.shots.findIndex((shot) => Number(shot.shot_index) === shotIndex);
      if (targetIndex === -1) {
        throw serviceException(
          {
            message: 'shot index out of range',
            error: {
              code: ErrorCode.SHOT_INDEX_OUT_OF_RANGE,
              details: [
                {
                  field: 'path',
                  reason: `分镜 ${shotIndex} 不存在`,
                },
              ],
              retryable: false,
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      state.shots.splice(targetIndex, 1);
      this.reindexShots(state.shots);
      return;
    }

    throw this.buildPatchOpInvalidException('分镜级路径仅允许 add / remove');
  }

  private applyShotMoveOperation(
    state: EditableScriptState,
    fromShotIndex: number,
    toShotIndex: number,
  ): void {
    const sourceIndex = state.shots.findIndex((shot) => Number(shot.shot_index) === fromShotIndex);
    if (sourceIndex === -1) {
      throw serviceException(
        {
          message: 'shot index out of range',
          error: {
            code: ErrorCode.SHOT_INDEX_OUT_OF_RANGE,
            details: [
              {
                field: 'from',
                reason: `分镜 ${fromShotIndex} 不存在`,
              },
            ],
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (toShotIndex < 1 || toShotIndex > state.shots.length) {
      throw this.buildInvalidRequestException(`移动目标分镜位置 ${toShotIndex} 超出可移动范围`);
    }

    if (fromShotIndex === toShotIndex) {
      return;
    }

    const [movedShot] = state.shots.splice(sourceIndex, 1);
    state.shots.splice(Math.min(toShotIndex - 1, state.shots.length), 0, movedShot);
    this.reindexShots(state.shots);
  }

  private applyNestedOperation(
    target: Record<string, unknown> | unknown[],
    segments: string[],
    operation: PatchOperationDTO,
  ): void {
    if (segments.length === 0) {
      throw this.buildInvalidRequestException('Patch 路径不能为空');
    }

    const parent = this.getParentContainer(target, segments.slice(0, -1), operation.op !== 'remove');
    const lastSegment = segments[segments.length - 1];

    if (Array.isArray(parent)) {
      const index = Number(lastSegment);
      if (!Number.isInteger(index) || index < 0) {
        throw this.buildInvalidRequestException(`非法的数组索引: ${lastSegment}`);
      }

      if (operation.op === 'remove') {
        if (index >= parent.length) {
          throw this.buildInvalidRequestException(`数组索引越界: ${lastSegment}`);
        }
        parent.splice(index, 1);
        return;
      }

      if (operation.op === 'add') {
        if (index > parent.length) {
          throw this.buildInvalidRequestException(`数组索引越界: ${lastSegment}`);
        }
        parent.splice(index, 0, operation.value);
        return;
      }

      if (index >= parent.length) {
        throw this.buildInvalidRequestException(`数组索引越界: ${lastSegment}`);
      }
      parent[index] = operation.value;
      return;
    }

    if (operation.op === 'remove') {
      delete parent[lastSegment];
      return;
    }

    parent[lastSegment] = operation.value;
  }

  private getParentContainer(
    target: Record<string, unknown> | unknown[],
    segments: string[],
    createMissing: boolean,
  ): Record<string, unknown> | unknown[] {
    let current: Record<string, unknown> | unknown[] = target;

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const nextSegment = segments[index + 1];

      if (Array.isArray(current)) {
        const arrayIndex = Number(segment);
        if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= current.length) {
          throw this.buildInvalidRequestException(`非法的数组索引: ${segment}`);
        }

        const nextValue = current[arrayIndex];
        if (this.isContainer(nextValue)) {
          current = nextValue;
          continue;
        }

        if (!createMissing) {
          throw this.buildInvalidRequestException(`路径 ${segments.join('/')} 不可写入`);
        }

        const created = this.createContainer(nextSegment);
        current[arrayIndex] = created;
        current = created;
        continue;
      }

      const nextValue = current[segment];
      if (this.isContainer(nextValue)) {
        current = nextValue;
        continue;
      }

      if (!createMissing) {
        throw this.buildInvalidRequestException(`路径 ${segments.join('/')} 不可写入`);
      }

      const created = this.createContainer(nextSegment);
      current[segment] = created;
      current = created;
    }

    return current;
  }

  private normalizeEditableScriptState(state: EditableScriptState): void {
    state.language = typeof state.language === 'string' && state.language.trim().length > 0
      ? state.language
      : SCRIPT_CONSTANTS.DEFAULT_LANGUAGE;
    state.style_vibe = typeof state.style_vibe === 'string' ? state.style_vibe : '';
    state.constraint_list = Array.isArray(state.constraint_list) ? state.constraint_list : [];
    this.reindexShots(state.shots);
    state.video_duration = this.sumShotDurations(state.shots);
  }

  private validateEditableScriptState(
    state: EditableScriptState,
    forceRevalidate = true,
    skipTimingValidation = false,
    skipDurationSchemaCheck = false,
  ): void {
    if (!forceRevalidate && state.shots.length === 0) {
      throw this.buildScriptSchemaException([
        {
          field: 'shots',
          reason: '分镜列表不能为空',
        },
      ]);
    }

    const typeErrors = this.collectStateTypeErrors(state);
    if (typeErrors.length > 0) {
      throw this.buildScriptSchemaException(typeErrors);
    }

    const continuityErrors = this.collectShotIndexErrors(state.shots);
    if (continuityErrors.length > 0) {
      throw this.buildScriptSchemaException(continuityErrors);
    }

    const parsed = this.buildParsedScript(state);
    const schemaResult = this.schemaValidator.validate(parsed);
    if (!schemaResult.valid) {
      const durationErrors = schemaResult.errors.filter(
        (error) => error.field.includes('duration') || error.field === 'video_duration',
      );
      const nonDurationErrors = schemaResult.errors.filter(
        (error) => !error.field.includes('duration') && error.field !== 'video_duration',
      );

      if (nonDurationErrors.length > 0) {
        throw this.buildScriptSchemaException(
          nonDurationErrors.map((error) => ({
            field: error.field,
            reason: error.message,
          })),
        );
      }

      if (!skipDurationSchemaCheck && durationErrors.length > 0) {
        throw this.buildScriptDurationException(
          durationErrors.map((error) => ({
            field: error.field,
            reason: error.message,
          })),
        );
      }
    }

    if (!skipTimingValidation) {
      const timingErrors = this.collectTimingErrors(state.shots, state.language);
      if (timingErrors.length > 0) {
        throw this.buildScriptDurationException(timingErrors);
      }
    }

    const complianceResult = this.complianceFilter.check(parsed.shots);
    if (!complianceResult.passed) {
      throw this.buildComplianceException(
        complianceResult.violations.map((violation) => {
          const idx = violation.shot_index - 1;
          const validIdx = (idx >= 0 && idx < parsed.shots.length) ? idx : 0;
          return {
            field: `shots[${validIdx}]`,
            reason: `${violation.reason}（原始 shot_index=${violation.shot_index}）`,
          };
        }),
      );
    }
  }

  private collectStateTypeErrors(state: EditableScriptState): Array<{ field: string; reason: string }> {
    const errors: Array<{ field: string; reason: string }> = [];

    if (state.title !== undefined && typeof state.title !== 'string') {
      errors.push({ field: 'title', reason: 'title 必须是字符串' });
    }

    if (typeof state.language !== 'string') {
      errors.push({ field: 'language', reason: 'language 必须是字符串' });
    }

    if (state.target_audience !== undefined && typeof state.target_audience !== 'string') {
      errors.push({ field: 'target_audience', reason: 'target_audience 必须是字符串' });
    }

    if (typeof state.style_vibe !== 'string') {
      errors.push({ field: 'style_vibe', reason: 'style_vibe 必须是字符串' });
    }

    if (!Array.isArray(state.constraint_list) || state.constraint_list.some((item) => typeof item !== 'string')) {
      errors.push({ field: 'constraint_list', reason: 'constraint_list 必须是字符串数组' });
    }

    if (!Array.isArray(state.shots) || state.shots.length === 0) {
      errors.push({ field: 'shots', reason: '分镜列表不能为空' });
      return errors;
    }

    state.shots.forEach((shot, index) => {
      const prefix = `shots[${index}]`;

      if (typeof shot.shot_index !== 'number' || !Number.isInteger(shot.shot_index) || shot.shot_index < 1) {
        errors.push({ field: `${prefix}.shot_index`, reason: 'shot_index 必须为正整数' });
      }

      if (typeof shot.duration !== 'number' || !Number.isFinite(shot.duration)) {
        errors.push({ field: `${prefix}.duration`, reason: 'duration 必须是合法数字' });
      }

      for (const field of [
        'scene_description_query',
        'visual_description',
        'camera_movement',
        'transition_type',
        'voiceover_text',
        'subtitle_text',
      ]) {
        if (typeof shot[field] !== 'string') {
          errors.push({ field: `${prefix}.${field}`, reason: `${field} 必须是字符串` });
        }
      }

      const shotDuration = typeof shot.duration === 'number' ? shot.duration : Number.NaN;
      if (typeof shot.voiceover_text === 'string' && shotDuration > 0 && shot.voiceover_text.trim().length === 0) {
        errors.push({ field: `${prefix}.voiceover_text`, reason: '台词文本为空但分镜有时长' });
      }

      const bbox = shot.safe_zone_bounding_box;
      if (
        !Array.isArray(bbox)
        || bbox.length !== 4
        || bbox.some((bboxValue) => typeof bboxValue !== 'number' || Number.isNaN(bboxValue))
      ) {
        errors.push({
          field: `${prefix}.safe_zone_bounding_box`,
          reason: 'safe_zone_bounding_box 必须为四个数字的数组',
        });
      } else {
        const [x1, y1, x2, y2] = bbox as number[];
        if (x1 < 0 || x1 > 1 || y1 < 0 || y1 > 1 || x2 < 0 || x2 > 1 || y2 < 0 || y2 > 1) {
          errors.push({
            field: `${prefix}.safe_zone_bounding_box`,
            reason: `safe_zone_bounding_box 坐标值必须在 [0, 1] 范围内，当前值 [${x1}, ${y1}, ${x2}, ${y2}]`,
          });
        }
        if (x1 >= x2) {
          errors.push({
            field: `${prefix}.safe_zone_bounding_box`,
            reason: `safe_zone_bounding_box x1 (${x1}) 必须小于 x2 (${x2})`,
          });
        }
        if (y1 >= y2) {
          errors.push({
            field: `${prefix}.safe_zone_bounding_box`,
            reason: `safe_zone_bounding_box y1 (${y1}) 必须小于 y2 (${y2})`,
          });
        }
      }

      if (
        shot.selected_slice_id !== undefined
        && shot.selected_slice_id !== null
        && typeof shot.selected_slice_id !== 'string'
      ) {
        errors.push({ field: `${prefix}.selected_slice_id`, reason: 'selected_slice_id 必须是字符串' });
      }

      if (
        shot.render_prompt !== undefined
        && shot.render_prompt !== null
        && typeof shot.render_prompt !== 'string'
      ) {
        errors.push({ field: `${prefix}.render_prompt`, reason: 'render_prompt 必须是字符串' });
      }

      if (shot.local_factor_patch !== undefined && !this.isPlainObject(shot.local_factor_patch)) {
        errors.push({ field: `${prefix}.local_factor_patch`, reason: 'local_factor_patch 必须是对象' });
      }
    });

    return errors;
  }

  private collectShotIndexErrors(shots: Array<Record<string, unknown>>): Array<{ field: string; reason: string }> {
    const errors: Array<{ field: string; reason: string }> = [];
    const seen = new Set<number>();

    shots.forEach((shot, index) => {
      const shotIndex = Number(shot.shot_index);
      if (seen.has(shotIndex)) {
        errors.push({
          field: `shots[${index}].shot_index`,
          reason: `shot_index ${shotIndex} 重复`,
        });
      }
      seen.add(shotIndex);

      if (shotIndex !== index + 1) {
        errors.push({
          field: `shots[${index}].shot_index`,
          reason: `分镜索引必须连续递增，期望 ${index + 1}，实际 ${shotIndex}`,
        });
      }
    });

    return errors;
  }

  private buildParsedScript(state: EditableScriptState): ParseResult {
    return {
      title: typeof state.title === 'string' ? state.title : undefined,
      video_duration: this.sumShotDurations(state.shots),
      style_vibe: state.style_vibe,
      shots: state.shots,
    };
  }

  private collectTimingErrors(
    shots: Array<Record<string, unknown>>,
    language?: string,
  ): Array<{ field: string; reason: string }> {
    const details: Array<{ field: string; reason: string }> = [];

    shots.forEach((shot, index) => {
      const validation = this.buildTimingValidationResponse(shot, language);
      if (!validation.valid) {
        const field = validation.shot_duration < SCRIPT_CONSTANTS.TIMING.MIN_SHOT_DURATION
          || validation.shot_duration > SCRIPT_CONSTANTS.TIMING.MAX_SHOT_DURATION
          ? `shots[${index}].duration`
          : `shots[${index}].voiceover_text`;
        details.push({
          field,
          reason: validation.suggestion,
        });
      }
    });

    return details;
  }

  private buildScriptUpdateData(state: EditableScriptState): Partial<Script> {
    return {
      title: typeof state.title === 'string' ? state.title : null,
      language: state.language,
      targetAudience: typeof state.target_audience === 'string' ? state.target_audience : null,
      styleVibe: state.style_vibe,
      videoDuration: this.roundToTwoDecimals(state.video_duration) as unknown as Script['videoDuration'],
      constraintList: state.constraint_list as unknown as Script['constraintList'],
      rawJson: this.buildPersistedRawJson(state) as unknown as Script['rawJson'],
    };
  }

  private buildPersistedRawJson(state: EditableScriptState): Record<string, unknown> {
    return {
      title: state.title,
      language: state.language,
      target_audience: state.target_audience,
      style_vibe: state.style_vibe,
      constraint_list: state.constraint_list,
      video_duration: this.roundToTwoDecimals(state.video_duration),
      shots: state.shots.map((shot) => ({
        shot_id: shot.shot_id ?? null,
        shot_index: shot.shot_index,
        duration: shot.duration,
        scene_description_query: shot.scene_description_query,
        visual_description: shot.visual_description,
        camera_movement: shot.camera_movement,
        transition_type: shot.transition_type,
        voiceover_text: shot.voiceover_text,
        subtitle_text: shot.subtitle_text,
        safe_zone_bounding_box: shot.safe_zone_bounding_box,
        selected_slice_id: shot.selected_slice_id ?? null,
        render_prompt: shot.render_prompt ?? null,
        local_factor_patch: this.mapJsonObject(shot.local_factor_patch),
      })),
    };
  }

  private buildPatchedShotUpdates(
    originalShots: ScriptShot[],
    state: EditableScriptState,
    touchedShotIndexes: Set<number>,
  ): Partial<ScriptShot>[] {
    return Array.from(touchedShotIndexes)
      .sort((left, right) => left - right)
      .map((shotIndex) => {
        const original = originalShots.find((shot) => shot.shotIndex === shotIndex);
        const current = this.getShotByIndex(state.shots, shotIndex);

        if (!original || !current) {
          throw this.buildInvalidRequestException(`分镜 ${shotIndex} 不存在`);
        }

        return this.buildShotWriteData(current, original.id);
      });
  }

  private buildSyncedShotData(state: EditableScriptState): Partial<ScriptShot>[] {
    return state.shots.map((shot) => this.buildShotWriteData(shot, this.optionalString(shot.id)));
  }

  private buildShotWriteData(shot: Record<string, unknown>, id?: string | null): Partial<ScriptShot> {
    return {
      id: id || undefined,
      shotIndex: Number(shot.shot_index),
      duration: this.roundToTwoDecimals(Number(shot.duration)) as unknown as ScriptShot['duration'],
      sceneDescriptionQuery: String(shot.scene_description_query),
      visualDescription: String(shot.visual_description),
      cameraMovement: String(shot.camera_movement) as ScriptShot['cameraMovement'],
      transitionType: String(shot.transition_type) as ScriptShot['transitionType'],
      voiceoverText: String(shot.voiceover_text),
      subtitleText: String(shot.subtitle_text),
      safeZoneBoundingBox: shot.safe_zone_bounding_box as ScriptShot['safeZoneBoundingBox'],
      selectedSliceId: this.nullableString(shot.selected_slice_id),
      renderPrompt: this.nullableString(shot.render_prompt),
      localFactorPatch: this.mapJsonObject(shot.local_factor_patch) as ScriptShot['localFactorPatch'],
      complianceStatus: 'PASSED' as ScriptShot['complianceStatus'],
    };
  }

  private resolveTimingTarget(
    state: EditableScriptState,
    touchedShotIndexes: Set<number>,
  ): Record<string, unknown> {
    const timingShotIndex = Array.from(touchedShotIndexes).sort((left, right) => left - right)[0];
    if (timingShotIndex !== undefined) {
      const shot = this.getShotByIndex(state.shots, timingShotIndex);
      if (shot) {
        return shot;
      }
    }

    return state.shots[0];
  }

  private buildTimingValidationResponse(
    shot: Record<string, unknown>,
    language?: string,
  ): ScriptValidateTimingResponse {
    const duration = Number(shot.duration ?? 0);
    const voiceoverText = typeof shot.voiceover_text === 'string' ? shot.voiceover_text : '';
    const estimatedDuration = this.estimateVoiceoverDuration(voiceoverText, language);

    if (
      duration < SCRIPT_CONSTANTS.TIMING.MIN_SHOT_DURATION
      || duration > SCRIPT_CONSTANTS.TIMING.MAX_SHOT_DURATION
    ) {
      return {
        valid: false,
        estimated_duration: estimatedDuration,
        shot_duration: this.roundToTwoDecimals(duration),
        overflow_words: 0,
        suggestion: `请将分镜时长调整到 ${SCRIPT_CONSTANTS.TIMING.MIN_SHOT_DURATION}~${SCRIPT_CONSTANTS.TIMING.MAX_SHOT_DURATION} 秒之间`,
      };
    }

    if (estimatedDuration <= duration) {
      return {
        valid: true,
        estimated_duration: estimatedDuration,
        shot_duration: this.roundToTwoDecimals(duration),
        overflow_words: 0,
        suggestion: 'ok',
      };
    }

    const overflowWords = this.estimateOverflowUnits(voiceoverText, duration, language);
    const unit = this.isEnglishTimingMode(voiceoverText, language) ? '个单词' : '个字';

    return {
      valid: false,
      estimated_duration: estimatedDuration,
      shot_duration: this.roundToTwoDecimals(duration),
      overflow_words: overflowWords,
      suggestion: `请精简 ${overflowWords} ${unit}或提高分镜时长到 ${estimatedDuration.toFixed(1)} 秒以上`,
    };
  }

  private estimateOverflowUnits(
    voiceoverText: string,
    duration: number,
    language?: string,
  ): number {
    const estimatedDuration = this.estimateVoiceoverDuration(voiceoverText, language);
    if (estimatedDuration <= duration) {
      return 0;
    }

    const text = voiceoverText.trim();
    if (this.isEnglishTimingMode(text, language)) {
      const wordCount = this.countEnglishWords(text);
      if (wordCount === 0) {
        return 1;
      }
      return Math.max(1, Math.ceil((estimatedDuration - duration) / (estimatedDuration / wordCount)));
    }

    const chineseCharCount = this.countChineseCharacters(text);
    if (chineseCharCount === 0) {
      return 1;
    }

    return Math.max(1, Math.ceil((estimatedDuration - duration) / (estimatedDuration / chineseCharCount)));
  }

  private createShotFromPatchValue(value: unknown, shotIndex: number): Record<string, unknown> {
    if (!this.isPlainObject(value)) {
      throw this.buildInvalidRequestException('新增分镜必须提供完整对象');
    }

    return {
      shot_index: shotIndex,
      duration: value.duration,
      scene_description_query: value.scene_description_query,
      visual_description: value.visual_description,
      camera_movement: value.camera_movement,
      transition_type: value.transition_type,
      voiceover_text: value.voiceover_text,
      subtitle_text: value.subtitle_text,
      safe_zone_bounding_box: value.safe_zone_bounding_box,
      selected_slice_id: value.selected_slice_id ?? null,
      render_prompt: value.render_prompt ?? null,
      local_factor_patch: this.isPlainObject(value.local_factor_patch)
        ? value.local_factor_patch
        : {},
      compliance_status: 'PASSED',
    };
  }

  private reindexShots(shots: Array<Record<string, unknown>>): void {
    shots.forEach((shot, index) => {
      shot.shot_index = index + 1;
    });
  }

  private getShotByIndex(
    shots: Array<Record<string, unknown>>,
    shotIndex: number,
  ): Record<string, unknown> | undefined {
    return shots.find((shot) => Number(shot.shot_index) === shotIndex);
  }

  private sumShotDurations(shots: Array<Record<string, unknown>>): number {
    return this.roundToTwoDecimals(
      shots.reduce((sum, shot) => sum + Number(shot.duration || 0), 0),
    );
  }

  private buildInvalidRequestException(message: string) {
    return serviceException(
      {
        message,
        error: {
          code: ErrorCode.INVALID_REQUEST,
          retryable: false,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private buildPatchPathNotAllowedException(path: string) {
    return serviceException(
      {
        message: 'patch path not allowed',
        error: {
          code: ErrorCode.PATCH_PATH_NOT_ALLOWED,
          details: [
            {
              field: 'path',
              reason: `路径 ${path} 不在白名单内`,
            },
          ],
          retryable: false,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private buildPatchOpInvalidException(reason: string) {
    return serviceException(
      {
        message: 'patch op invalid',
        error: {
          code: ErrorCode.PATCH_OP_INVALID,
          details: [
            {
              field: 'op',
              reason,
            },
          ],
          retryable: false,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private buildScriptSchemaException(details: Array<{ field: string; reason: string }>) {
    return serviceException(
      {
        message: 'script schema invalid',
        error: {
          code: ErrorCode.SCRIPT_SCHEMA_INVALID,
          details,
          retryable: false,
        },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private buildScriptDurationException(details: Array<{ field: string; reason: string }>) {
    const hasTotalDuration = details.some((detail) => detail.field === 'video_duration');
    const hasShotDuration = details.some((detail) => detail.field.includes('.duration'));
    const message = hasTotalDuration
      ? 'script total duration exceeded'
      : hasShotDuration
        ? 'shot duration out of range'
        : 'voiceover timing exceeded';

    return serviceException(
      {
        message,
        error: {
          code: ErrorCode.SCRIPT_DURATION_EXCEEDED,
          details,
          retryable: false,
        },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private buildComplianceException(details: Array<{ field: string; reason: string }>) {
    return serviceException(
      {
        message: 'compliance check failed',
        error: {
          code: ErrorCode.COMPLIANCE_CHECK_FAILED,
          details,
          retryable: false,
        },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
    return this.isPlainObject(value) || Array.isArray(value);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private createContainer(nextSegment?: string): Record<string, unknown> | unknown[] {
    if (nextSegment && /^\d+$/.test(nextSegment)) {
      return [];
    }
    return {};
  }

  private nullableString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private estimateVoiceoverDuration(voiceoverText: string, language?: string): number {
    if (!voiceoverText || voiceoverText.trim().length === 0) {
      return 0;
    }

    const text = voiceoverText.trim();
    const purePunctuation = text.replace(/[\s\p{P}]/gu, '');
    if (purePunctuation.length === 0) {
      return 0;
    }

    if (this.isEnglishTimingMode(text, language)) {
      const syllableCount = this.countSyllables(text);
      return this.roundToTwoDecimals(
        syllableCount * SCRIPT_CONSTANTS.TIMING.ENGLISH_ESTIMATE_RATIO,
      );
    }

    return this.roundToTwoDecimals(
      this.countChineseCharacters(text) * SCRIPT_CONSTANTS.TIMING.CHINESE_ESTIMATE_RATIO,
    );
  }

  private isEnglishTimingMode(text: string, language?: string): boolean {
    if (language) {
      const normalized = language.toLowerCase();
      if (normalized.startsWith('en')) {
        return true;
      }
      if (normalized.startsWith('zh')) {
        return false;
      }
    }

    const englishCharCount = (text.match(/[a-zA-Z]/g) || []).length;
    const totalCharCount = (text.match(/[a-zA-Z一-龥]/g) || []).length;
    if (totalCharCount === 0) {
      return false;
    }

    return englishCharCount / totalCharCount > 0.5;
  }

  private countEnglishWords(text: string): number {
    return text
      .toLowerCase()
      .replace(/[^a-z]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .length;
  }

  private countChineseCharacters(text: string): number {
    return (text.match(/[一-龥]/g) || []).length;
  }

  private countSyllables(text: string): number {
    const words = text
      .toLowerCase()
      .replace(/[^a-z]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    let syllableCount = 0;

    for (const word of words) {
      if (word.length <= 3) {
        syllableCount += 1;
        continue;
      }

      const vowelGroups = word.replace(/[^aeiouy]/g, ' ').trim();
      const groupCount = vowelGroups.split(/\s+/).filter(Boolean).length;

      if (word.endsWith('e') && groupCount > 1) {
        syllableCount += groupCount - 1;
      } else {
        syllableCount += Math.max(1, groupCount);
      }
    }

    return Math.max(1, syllableCount);
  }

  // ========== 回收站功能 ==========

  async deleteScript(scriptId: string): Promise<void> {
    const script = await this.repository.findScriptById(scriptId);
    if (!script) {
      throw serviceException(
        {
          message: '剧本不存在',
          error: {
            code: ErrorCode.SCRIPT_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 安全校验：script 必须归属到特定 product
    if (!script.productId) {
      throw serviceException(
        {
          message: '剧本缺少商品归属',
          error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    await this.repository.softDeleteScript(scriptId);
  }

  async listTrashScripts(productId: string, page: number, pageSize: number): Promise<PaginatedData<ScriptType>> {
    if (!productId) {
      throw serviceException(
        {
          message: 'product_id is required',
          error: { code: 'BAD_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.repository.findTrashScriptsByProduct(productId, page, pageSize);

    return {
      items: result.items as ScriptType[],
      page,
      page_size: pageSize,
      total: result.total,
      has_more: result.has_more,
    };
  }

  async restoreScript(scriptId: string): Promise<{ success: boolean }> {
    // 安全校验：先获取 script 记录，确保其归属到特定 product
    const script = await this.repository.findScriptById(scriptId);
    if (!script) {
      throw serviceException(
        {
          message: '剧本不存在或未在回收站中',
          error: {
            code: ErrorCode.SCRIPT_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!script.productId) {
      throw serviceException(
        {
          message: '剧本缺少商品归属',
          error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const restored = await this.repository.restoreScript(scriptId);
    if (!restored) {
      throw serviceException(
        {
          message: '剧本不存在或未在回收站中',
          error: {
            code: ErrorCode.SCRIPT_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
    return { success: true };
  }

  async permanentDeleteScript(scriptId: string): Promise<void> {
    // 安全校验：先获取 script 记录，确保其归属到特定 product
    const script = await this.repository.findScriptById(scriptId);
    if (!script) {
      throw serviceException(
        {
          message: '剧本不存在',
          error: {
            code: ErrorCode.SCRIPT_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!script.productId) {
      throw serviceException(
        {
          message: '剧本缺少商品归属',
          error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const deleted = await this.repository.permanentDeleteScript(scriptId);
    if (!deleted) {
      throw serviceException(
        {
          message: '剧本不存在',
          error: {
            code: ErrorCode.SCRIPT_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // ========================================================================
  // 批量多风格剧本生成 (BATCH)
  // ========================================================================

  async generateBatchScripts(dto: GenerateBatchDto): Promise<ScriptBatchGenerateResponse> {
    const {
      product_id,
      batch_size,
      style_variations,
      language,
      aspect_ratio,
      selling_points,
      target_audience,
      constraint_list,
      preferences,
      preference_remark,
      enable_ai_compliance,
      max_concurrency = 2,
    } = dto;

    const product = await this.validateProductExists(product_id);
    const productCtx = this.buildProductContext(product, undefined, selling_points);

    // 注入素材切片视觉上下文 (batch) — 预先计算，所有风格变体复用
    const materialContextsBatch = await this.enrichPromptWithMaterialContext(dto.material_ids || []);

    const effectiveSellingPoints = productCtx.selling_points;
    const effectiveLanguage = language || 'zh-CN';
    const effectiveAspectRatio = aspect_ratio || '9:16';
    const effectiveConstraintList = [...(constraint_list || []), ...productCtx.constraint_list];
    const concurrency = Math.min(max_concurrency, batch_size);

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const scripts: ScriptType[] = [];
    const failures: Array<{ style_vibe: string; error: string }> = [];

    const variations = style_variations.slice(0, batch_size);

    const processOne = async (index: number, attempt = 1): Promise<void> => {
      const styleVibe = variations[index];
      const maxRetries = 2;
      this.logger.log(`[Batch] 正在生成风格 "${styleVibe}" (${index + 1}/${variations.length})${attempt > 1 ? ` 第${attempt}次重试` : ''}...`);

      try {
        const promptParams: PromptParams = {
          selling_points: effectiveSellingPoints,
          style_vibe: styleVibe,
          target_audience,
          language: effectiveLanguage,
          aspect_ratio: effectiveAspectRatio,
          constraint_list: effectiveConstraintList,
          title: productCtx.title,
          preferences,
          preference_remark,
        };

        // 注入素材切片视觉上下文到 PromptParams
        (promptParams as any).material_contexts = materialContextsBatch;
        (promptParams as any).product_brief = productCtx.product_brief;

        const { systemPrompt, userPrompt } = this.promptBuilder.build(promptParams);

        const parsed = await this.generateScriptPayload(systemPrompt, userPrompt, {
          title: productCtx.title,
          language: effectiveLanguage,
          style_vibe: styleVibe,
          target_audience,
          selling_points: effectiveSellingPoints,
          aspect_ratio: effectiveAspectRatio as ApiAspectRatio | undefined,
          constraint_list: effectiveConstraintList,
          source_label: `batch-${styleVibe}`,
        });

        const schemaResult = this.schemaValidator.validate(parsed);
        if (!schemaResult.valid) {
          // Schema 校验失败（结构问题），不适合重试
          throw new Error(`Schema 校验失败: ${schemaResult.errors.map((e) => e.message).join('; ')}`);
        }

        const complianceResult = this.complianceFilter.check(parsed.shots);
        if (!complianceResult.passed) {
          // 合规问题不适合重试
          throw new Error(`合规拦截: ${complianceResult.violations.map((v) => v.reason).join('; ')}`);
        }

        const scriptParams: CreateScriptParams = {
          productId: product_id,
          title: parsed.title || productCtx.title,
          language: effectiveLanguage,
          targetAudience: target_audience,
          videoDuration: parsed.video_duration,
          aspectRatio: effectiveAspectRatio,
          styleVibe: parsed.style_vibe || styleVibe,
          generationMode: 'BATCH',
          constraintList: effectiveConstraintList,
          rawJson: parsed,
        };

        const shotsParams: CreateScriptShotParams[] = parsed.shots.map((shot, idx) => ({
          scriptId: '',
          shotIndex: idx + 1,
          duration: Number(shot.duration),
          sceneDescriptionQuery: String(shot.scene_description_query ?? ''),
          visualDescription: String(shot.visual_description ?? ''),
          cameraMovement: String(shot.camera_movement ?? ''),
          transitionType: String(shot.transition_type ?? ''),
          voiceoverText: String(shot.voiceover_text ?? ''),
          subtitleText: String(shot.subtitle_text ?? ''),
          safeZoneBoundingBox: this.normalizeSafeZoneBoundingBox(shot.safe_zone_bounding_box),
          complianceStatus: 'PASSED',
        }));

        const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);
        const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);

        if (scriptWithShots) {
          const result = this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
          scripts.push(result);
          this.triggerAsyncTranslation(createdScript.id);
          this.logger.log(`[Batch] 风格 "${styleVibe}" 生成成功, script_id=${result.script_id}`);
        } else {
          throw new Error('数据库读取失败');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // 模型服务不可用 / 网络错误时重试
        const isRetryable = this.isModelProviderError(error) || message.includes('数据库读取失败');
        if (isRetryable && attempt < maxRetries) {
          this.logger.warn(`[Batch] 风格 "${styleVibe}" 生成失败 (可重试): ${message}，${1000 * attempt}ms 后重试...`);
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          return processOne(index, attempt + 1);
        }
        failures.push({ style_vibe: styleVibe, error: message });
        this.logger.warn(`[Batch] 风格 "${styleVibe}" 生成失败: ${message}`);
      }
    };

    // 使用共享索引的并发 worker 模式：多个 worker 从队列中原子取任务
    let sharedIndex = 0;
    const execWorker = async (): Promise<void> => {
      while (sharedIndex < variations.length) {
        const idx = sharedIndex++;
        await processOne(idx);
      }
    };

    const workers_list: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workers_list.push(execWorker());
    }

    await Promise.allSettled(workers_list);

    this.logger.log(`[Batch] 批量生成完成: succeeded=${scripts.length}, failed=${failures.length}`);

    return {
      batch_id: batchId,
      total: variations.length,
      succeeded: scripts.length,
      failed: failures.length,
      scripts,
      failures: failures.length > 0 ? failures : undefined,
      style_variations: variations,
    };
  }

  // ========================================================================
  // 组合引擎剧本生成 (COMPOSED)
  // ========================================================================

  async generateComposedScript(dto: GenerateComposedDto): Promise<ScriptType> {
    const {
      product_id,
      template_id,
      viral_video_id,
      auto_match_viral,
      strategy_overrides,
      factor_overrides,
      constraint_overrides,
      title,
      language,
      style_vibe,
      aspect_ratio,
      selling_points,
      target_audience,
      constraint_list,
      preferences,
      preference_remark,
      enable_ai_compliance,
    } = dto;

    const product = await this.validateProductExists(product_id);
    const productCtx = this.buildProductContext(product, title, selling_points);

    // 注入素材切片视觉上下文 (composed)
    const materialContextsComposed = await this.enrichPromptWithMaterialContext(dto.material_ids || []);

    const effectiveLanguage = language || 'zh-CN';
    const effectiveAspectRatio = aspect_ratio || '9:16';
    const effectiveStyleVibe = style_vibe || 'creative';
    const effectiveSellingPoints = productCtx.selling_points;
    const effectiveConstraintList = [...(constraint_list || []), ...productCtx.constraint_list];

    // 收集模板数据
    let templateStrategy = '';
    let templateFactors: Record<string, unknown> = {};
    if (template_id) {
      const template = await this.validateTemplateGracefully(template_id);
      if (template) {
        templateStrategy = template.strategySummary || '';
        templateFactors = (template.factorJson as Record<string, unknown>) || {};
      }
    }

    // 收集爆款分析数据
    let viralStrategy: Record<string, unknown> = {};
    let viralFactors: Record<string, unknown> = {};
    let viralHookType = '';
    let viralReport: Record<string, unknown> | undefined;
    let effectiveViralVideoId: string | undefined;

    if (viral_video_id) {
      const analysis = await this.validateViralVideoAnalysisGracefully(viral_video_id);
      if (analysis) {
        viralStrategy = (analysis.strategyJson as Record<string, unknown>) || {};
        viralFactors = (analysis.factorJson as Record<string, unknown>) || {};
        viralHookType = analysis.hookType || '';
        viralReport = (analysis.reportJson as Record<string, unknown>) || undefined;
        effectiveViralVideoId = viral_video_id;
      }
    } else if (auto_match_viral) {
      // 自动匹配：获取第一个可用的爆款分析
      const matched = await this.findFirstAvailableViralAnalysis();
      if (matched) {
        viralStrategy = (matched.strategyJson as Record<string, unknown>) || {};
        viralFactors = (matched.factorJson as Record<string, unknown>) || {};
        viralHookType = matched.hookType || '';
        viralReport = (matched.reportJson as Record<string, unknown>) || undefined;
        effectiveViralVideoId = matched.id;
        this.logger.log(`[Composed] 自动匹配爆款分析: ${matched.id}`);
      }
    }

    // 合并策略和因子（覆盖顺序: template < viral < strategy_overrides/factor_overrides）
    const mergedStrategy: Record<string, unknown> = {
      ...(templateFactors || {}),
      ...viralFactors,
      ...(factor_overrides || {}),
    };

    let mergedStrategySummary = templateStrategy || '';
    if (strategy_overrides && Object.keys(strategy_overrides).length > 0) {
      // 剥离大文本字段（dna_narrative/product_brief），避免 JSON 中重复注入
      const displayOverrides = { ...strategy_overrides };
      delete displayOverrides['dna_narrative'];
      delete displayOverrides['product_brief'];
      const displayKeys = Object.keys(displayOverrides);
      mergedStrategySummary = typeof strategy_overrides['summary'] === 'string'
        ? strategy_overrides['summary']
        : (displayKeys.length > 0
          ? mergedStrategySummary + '\n自定义策略: ' + JSON.stringify(displayOverrides)
          : mergedStrategySummary);
    }

    // 合并约束
    const mergedConstraints = [...effectiveConstraintList, ...(constraint_overrides || [])];

    // 构建 Prompt - 使用 quick prompt builder 作为基础，注入组合上下文
    const promptParams: PromptParams = {
      selling_points: effectiveSellingPoints,
      style_vibe: effectiveStyleVibe,
      target_audience,
      language: effectiveLanguage,
      aspect_ratio: effectiveAspectRatio,
      constraint_list: mergedConstraints,
      title: productCtx.title,
      preferences,
      preference_remark,
    };

    // 注入素材切片视觉上下文到 PromptParams
    (promptParams as any).material_contexts = materialContextsComposed;
    (promptParams as any).product_brief = productCtx.product_brief;

    const { systemPrompt, userPrompt } = this.promptBuilder.build(promptParams);

    // 注入组合引擎上下文到 user prompt
    const composedContext = this.buildComposedContext(
      mergedStrategySummary,
      mergedStrategy,
      viralHookType,
      viralStrategy,
      viralReport,
      {
        title: productCtx.title,
        constraint_list: mergedConstraints,
        product_brief: productCtx.product_brief,
        dna_narrative: typeof strategy_overrides?.['dna_narrative'] === 'string'
          ? strategy_overrides['dna_narrative']
          : undefined,
      },
    );

    const enrichedUserPrompt = `${userPrompt}\n\n[组合引擎附加上下文]\n${composedContext}`;

    const parsed = await this.generateScriptPayload(systemPrompt, enrichedUserPrompt, {
      title: productCtx.title,
      language: effectiveLanguage,
      style_vibe: effectiveStyleVibe,
      target_audience,
      selling_points: effectiveSellingPoints,
      aspect_ratio: effectiveAspectRatio as ApiAspectRatio | undefined,
      constraint_list: mergedConstraints,
      source_label: 'composed',
    });

    const schemaResult = this.schemaValidator.validate(parsed);
    if (!schemaResult.valid) {
      const hasDurationErr = schemaResult.errors.some((e) => e.message.includes('总时长'));
      const errorCode = hasDurationErr ? ErrorCode.SCRIPT_DURATION_EXCEEDED : ErrorCode.SCRIPT_SCHEMA_INVALID;
      throw serviceException(
        {
          message: `${ErrorCode.SCRIPT_SCHEMA_INVALID}: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
          error: { code: errorCode, details: schemaResult.errors, retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const complianceResult = this.complianceFilter.check(parsed.shots);
    if (!complianceResult.passed) {
      throw serviceException(
        {
          message: `${ErrorCode.COMPLIANCE_CHECK_FAILED}: ${complianceResult.violations.map((v) => v.reason).join('; ')}`,
          error: { code: ErrorCode.COMPLIANCE_CHECK_FAILED, details: complianceResult.violations, retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const scriptParams: CreateScriptParams = {
      productId: product_id,
      title: parsed.title || productCtx.title,
      language: effectiveLanguage,
      targetAudience: target_audience,
      videoDuration: parsed.video_duration,
      aspectRatio: effectiveAspectRatio,
      styleVibe: parsed.style_vibe || effectiveStyleVibe,
      generationMode: 'COMPOSED',
      constraintList: mergedConstraints,
      rawJson: parsed,
      templateId: template_id || undefined,
      viralVideoId: effectiveViralVideoId,
    };

    const shotsParams: CreateScriptShotParams[] = parsed.shots.map((shot, idx) => ({
      scriptId: '',
      shotIndex: idx + 1,
      duration: Number(shot.duration),
      sceneDescriptionQuery: String(shot.scene_description_query ?? ''),
      visualDescription: String(shot.visual_description ?? ''),
      cameraMovement: String(shot.camera_movement ?? ''),
      transitionType: String(shot.transition_type ?? ''),
      voiceoverText: String(shot.voiceover_text ?? ''),
      subtitleText: String(shot.subtitle_text ?? ''),
      safeZoneBoundingBox: this.normalizeSafeZoneBoundingBox(shot.safe_zone_bounding_box),
      complianceStatus: 'PASSED',
    }));

    const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);
    const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);

    if (!scriptWithShots) {
      throw serviceException(
        {
          message: ErrorCode.INTERNAL_SERVER_ERROR,
          error: { code: ErrorCode.INTERNAL_SERVER_ERROR, retryable: true },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const result = this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
    this.triggerAsyncTranslation(createdScript.id);
    return result;
  }

  // ========================================================================
  // 混合创新模式剧本生成 (HYBRID)
  // ========================================================================

  async generateHybridScript(dto: GenerateHybridDto): Promise<ScriptType> {
    const {
      product_id,
      template_id,
      viral_video_id,
      auto_match_viral,
      user_strategy_summary,
      user_factors,
      user_constraints,
      title,
      language,
      style_vibe,
      style_variations,
      aspect_ratio,
      selling_points,
      target_audience,
      constraint_list,
      preferences,
      preference_remark,
      enable_ai_compliance,
    } = dto;

    const product = await this.validateProductExists(product_id);
    const productCtx = this.buildProductContext(product, title, selling_points);

    // 注入素材切片视觉上下文 (hybrid)
    const materialContextsHybrid = await this.enrichPromptWithMaterialContext(dto.material_ids || []);

    const effectiveLanguage = language || 'zh-CN';
    const effectiveAspectRatio = aspect_ratio || '9:16';
    const effectiveStyleVibe = style_vibe || style_variations?.[0] || 'trendy';
    const effectiveSellingPoints = productCtx.selling_points;
    const effectiveConstraintList = [...(constraint_list || []), ...productCtx.constraint_list];

    // 收集模板数据
    let templateFactors: Record<string, unknown> = {};
    let templateSummary = '';
    if (template_id) {
      const template = await this.validateTemplateGracefully(template_id);
      if (template) {
        templateFactors = (template.factorJson as Record<string, unknown>) || {};
        templateSummary = template.strategySummary || '';
      }
    }

    // 收集爆款分析数据
    let viralFactors: Record<string, unknown> = {};
    let viralHookType = '';
    let viralReport: Record<string, unknown> | undefined;
    let effectiveViralVideoId: string | undefined;

    if (viral_video_id) {
      const analysis = await this.validateViralVideoAnalysisGracefully(viral_video_id);
      if (analysis) {
        viralFactors = (analysis.factorJson as Record<string, unknown>) || {};
        viralHookType = analysis.hookType || '';
        viralReport = (analysis.reportJson as Record<string, unknown>) || undefined;
        effectiveViralVideoId = viral_video_id;
      }
    } else if (auto_match_viral) {
      const matched = await this.findFirstAvailableViralAnalysis();
      if (matched) {
        viralFactors = (matched.factorJson as Record<string, unknown>) || {};
        viralHookType = matched.hookType || '';
        viralReport = (matched.reportJson as Record<string, unknown>) || undefined;
        effectiveViralVideoId = matched.id;
        this.logger.log(`[Hybrid] 自动匹配爆款分析: ${matched.id}`);
      }
    }

    // 混合合并: template + viral + user_custom
    // 优先级: user > viral > template
    const mixedFactors: Record<string, unknown> = {
      ...templateFactors,
      ...viralFactors,
      ...(user_factors || {}),
    };

    // 合并约束
    const allConstraints = [
      ...effectiveConstraintList,
      ...(user_constraints || []),
    ];

    // 使用 quick prompt builder 构建基础 prompt
    const promptParams: PromptParams = {
      selling_points: effectiveSellingPoints,
      style_vibe: effectiveStyleVibe,
      target_audience,
      language: effectiveLanguage,
      aspect_ratio: effectiveAspectRatio,
      constraint_list: allConstraints,
      title: productCtx.title,
      preferences,
      preference_remark,
    };

    // 注入素材切片视觉上下文到 PromptParams
    (promptParams as any).material_contexts = materialContextsHybrid;
    (promptParams as any).product_brief = productCtx.product_brief;

    const { systemPrompt, userPrompt } = this.promptBuilder.build(promptParams);

    // 构建混合上下文
    const hybridContextParts: string[] = [];

    if (templateSummary) {
      hybridContextParts.push(`[模板策略]\n${templateSummary}`);
    }
    if (user_strategy_summary) {
      hybridContextParts.push(`[用户自定义策略]\n${user_strategy_summary}`);
    }
    if (Object.keys(mixedFactors).length > 0) {
      hybridContextParts.push(`[混合因子]\n${JSON.stringify(mixedFactors, null, 2)}`);
    }
    if (viralHookType) {
      hybridContextParts.push(`[爆款钩子类型]\n${viralHookType}`);
      if (viralReport) {
        hybridContextParts.push(`[爆款报告]\n${JSON.stringify(viralReport, null, 2)}`);
      }
    }
    if (style_variations && style_variations.length > 0) {
      hybridContextParts.push(`[风格变化]\n${style_variations.join(', ')}`);
    }
    if (productCtx.product_brief) {
      hybridContextParts.push(`[产品信息]\n${productCtx.product_brief}`);
    }

    const hybridContext = hybridContextParts.join('\n\n');
    const enrichedUserPrompt = hybridContext
      ? `${userPrompt}\n\n[混合创新模式上下文]\n${hybridContext}`
      : userPrompt;

    const parsed = await this.generateScriptPayload(systemPrompt, enrichedUserPrompt, {
      title: productCtx.title,
      language: effectiveLanguage,
      style_vibe: effectiveStyleVibe,
      target_audience,
      selling_points: effectiveSellingPoints,
      aspect_ratio: effectiveAspectRatio as ApiAspectRatio | undefined,
      constraint_list: allConstraints,
      source_label: 'hybrid',
    });

    const schemaResult = this.schemaValidator.validate(parsed);
    if (!schemaResult.valid) {
      const hasDurationErr = schemaResult.errors.some((e) => e.message.includes('总时长'));
      const errorCode = hasDurationErr ? ErrorCode.SCRIPT_DURATION_EXCEEDED : ErrorCode.SCRIPT_SCHEMA_INVALID;
      throw serviceException(
        {
          message: `${ErrorCode.SCRIPT_SCHEMA_INVALID}: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
          error: { code: errorCode, details: schemaResult.errors, retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const complianceResult = this.complianceFilter.check(parsed.shots);
    if (!complianceResult.passed) {
      throw serviceException(
        {
          message: `${ErrorCode.COMPLIANCE_CHECK_FAILED}: ${complianceResult.violations.map((v) => v.reason).join('; ')}`,
          error: { code: ErrorCode.COMPLIANCE_CHECK_FAILED, details: complianceResult.violations, retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const scriptParams: CreateScriptParams = {
      productId: product_id,
      title: parsed.title || productCtx.title,
      language: effectiveLanguage,
      targetAudience: target_audience,
      videoDuration: parsed.video_duration,
      aspectRatio: effectiveAspectRatio,
      styleVibe: parsed.style_vibe || effectiveStyleVibe,
      generationMode: 'HYBRID',
      constraintList: allConstraints,
      rawJson: parsed,
      templateId: template_id || undefined,
      viralVideoId: effectiveViralVideoId,
    };

    const shotsParams: CreateScriptShotParams[] = parsed.shots.map((shot, idx) => ({
      scriptId: '',
      shotIndex: idx + 1,
      duration: Number(shot.duration),
      sceneDescriptionQuery: String(shot.scene_description_query ?? ''),
      visualDescription: String(shot.visual_description ?? ''),
      cameraMovement: String(shot.camera_movement ?? ''),
      transitionType: String(shot.transition_type ?? ''),
      voiceoverText: String(shot.voiceover_text ?? ''),
      subtitleText: String(shot.subtitle_text ?? ''),
      safeZoneBoundingBox: this.normalizeSafeZoneBoundingBox(shot.safe_zone_bounding_box),
      complianceStatus: 'PASSED',
    }));

    const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);
    const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);

    if (!scriptWithShots) {
      throw serviceException(
        {
          message: ErrorCode.INTERNAL_SERVER_ERROR,
          error: { code: ErrorCode.INTERNAL_SERVER_ERROR, retryable: true },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const result = this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
    this.triggerAsyncTranslation(createdScript.id);
    return result;
  }

  async generateViralRewriteScriptWithProgress(
    dto: ScriptViralRewriteGenerateDto,
    onProgress: (progress: { stage: string; message: string; progress: number }) => void,
  ): Promise<ScriptType> {
    try {
      const {
        product_id,
        viral_video_id,
        title,
        language,
        selling_points: requestedSellingPoints,
        target_audience,
        style_vibe,
        aspect_ratio,
        constraint_list,
      } = dto;

      // 1. 验证商品
      onProgress({ stage: 'VALIDATING', message: '正在验证商品信息...', progress: 10 });
      const product = await this.validateProductExists(product_id);
      const productCtx = this.buildProductContext(product, title, requestedSellingPoints);

      // 2. 验证爆款视频
      onProgress({ stage: 'VALIDATING', message: '正在验证爆款参考视频...', progress: 15 });
      const viralAnalysis = await this.validateViralVideoAnalysis(viral_video_id);

      // 3. 构建 Prompt
      onProgress({ stage: 'BUILDING_PROMPT', message: '正在构建爆款仿写 Prompt...', progress: 20 });

      const promptParams: ViralRewritePromptParams = {
        selling_points: productCtx.selling_points,
        style_vibe,
        target_audience,
        language: language || 'zh-CN',
        aspect_ratio,
        constraint_list: [...(constraint_list || []), ...productCtx.constraint_list],
        viral_strategy: viralAnalysis.strategyJson as Record<string, unknown>,
        viral_factors: viralAnalysis.factorJson as Record<string, unknown>,
        viral_hook_type: viralAnalysis.hookType || '',
        viral_report: viralAnalysis.reportJson as Record<string, unknown> | undefined,
        title: productCtx.title,
      };

      // 注入素材视觉上下文
      const materialContexts = await this.enrichPromptWithMaterialContext(dto.material_ids || []);
      (promptParams as any).material_contexts = materialContexts;
      (promptParams as any).product_brief = productCtx.product_brief;

      const { systemPrompt, userPrompt } = this.viralRewritePromptBuilder.build(promptParams);

      // 4. AI 生成
      onProgress({ stage: 'AI_GENERATING', message: 'AI 正在生成爆款仿写剧本内容...', progress: 40 });

      const parsed = await this.generateScriptPayload(systemPrompt, userPrompt, {
        title: productCtx.title,
        language: language || 'zh-CN',
        style_vibe,
        target_audience,
        selling_points: productCtx.selling_points,
        aspect_ratio: aspect_ratio as ApiAspectRatio | undefined,
        constraint_list: [...(constraint_list || []), ...productCtx.constraint_list],
        source_label: 'viral-rewrite-sse',
      });

      // 5. Schema 校验
      onProgress({ stage: 'VALIDATING_SCHEMA', message: '正在校验剧本结构...', progress: 60 });

      const schemaResult = this.schemaValidator.validate(parsed);
      if (!schemaResult.valid) {
        const hasDurationErr = schemaResult.errors.some((e) => e.message.includes('总时长'));
        const errorCode = hasDurationErr ? ErrorCode.SCRIPT_DURATION_EXCEEDED : ErrorCode.SCRIPT_SCHEMA_INVALID;
        throw serviceException(
          {
            message: `${ErrorCode.SCRIPT_SCHEMA_INVALID}: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
            error: {
              code: errorCode,
              details: schemaResult.errors,
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 6. 合规检查
      onProgress({ stage: 'COMPLIANCE_CHECK', message: '正在进行合规检查...', progress: 70 });

      const complianceResult = this.complianceFilter.check(parsed.shots);
      if (!complianceResult.passed) {
        throw serviceException(
          {
            message: `${ErrorCode.COMPLIANCE_CHECK_FAILED}: ${complianceResult.violations.map((v) => v.reason).join('; ')}`,
            error: {
              code: ErrorCode.COMPLIANCE_CHECK_FAILED,
              details: complianceResult.violations,
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 7. 存入数据库
      onProgress({ stage: 'SAVING_TO_DB', message: '正在保存爆款仿写剧本到数据库...', progress: 80 });

      const scriptParams: CreateScriptParams = {
        productId: product_id,
        title: parsed.title || title,
        language: language || 'zh-CN',
        targetAudience: target_audience,
        videoDuration: parsed.video_duration,
        aspectRatio: aspect_ratio,
        styleVibe: parsed.style_vibe || style_vibe,
        generationMode: 'VIRAL_REWRITE',
        constraintList: constraint_list || [],
        rawJson: parsed,
        viralVideoId: viral_video_id,
      };

      const shotsParams: CreateScriptShotParams[] = parsed.shots.map((shot, idx) => ({
        scriptId: '',
        shotIndex: idx + 1,
        duration: Number(shot.duration),
        sceneDescriptionQuery: String(shot.scene_description_query),
        visualDescription: String(shot.visual_description),
        cameraMovement: String(shot.camera_movement),
        transitionType: String(shot.transition_type),
        voiceoverText: String(shot.voiceover_text),
        subtitleText: String(shot.subtitle_text),
        safeZoneBoundingBox: shot.safe_zone_bounding_box as [number, number, number, number],
        complianceStatus: 'PASSED',
      }));

      const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);

      // 8. 完成收尾
      onProgress({ stage: 'FINISHING', message: '正在触发多语种字幕翻译...', progress: 90 });

      const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);

      if (!scriptWithShots) {
        throw serviceException(
          {
            message: ErrorCode.INTERNAL_SERVER_ERROR,
            error: {
              code: ErrorCode.INTERNAL_SERVER_ERROR,
              retryable: true,
            },
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      onProgress({ stage: 'COMPLETE', message: '爆款仿写剧本生成完成', progress: 100 });

      const result = this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
      this.triggerAsyncTranslation(createdScript.id);
      return result;
    } catch (error) {
      this.logger.error(`generateViralRewriteScriptWithProgress failed: ${error}`);
      throw error;
    }
  }

  async generateTemplateScriptWithProgress(
    dto: ScriptTemplateGenerateDto,
    onProgress: (progress: { stage: string; message: string; progress: number }) => void,
  ): Promise<ScriptType> {
    try {
      const {
        product_id,
        template_id,
        title,
        language,
        selling_points: requestedSellingPoints,
        target_audience,
        style_vibe,
        aspect_ratio,
        constraint_list,
        preferences,
        preference_remark,
      } = dto;

      // 1. 验证商品和模板
      onProgress({ stage: 'VALIDATING', message: '正在验证商品和模板信息...', progress: 10 });
      const product = await this.validateProductExists(product_id);
      const productCtx = this.buildProductContext(product, title, requestedSellingPoints);

      const template = await this.templateRepository.findTemplateById(template_id);
      if (!template) {
        throw serviceException(
          { message: SCRIPT_CONSTANTS.ERROR_MESSAGES.TEMPLATE_NOT_FOUND, error: { code: 'TEMPLATE_NOT_FOUND', retryable: false } },
          HttpStatus.NOT_FOUND,
        );
      }
      if (template.status !== 'ACTIVE') {
        throw serviceException(
          { message: SCRIPT_CONSTANTS.ERROR_MESSAGES.TEMPLATE_NOT_ACTIVE, error: { code: 'TEMPLATE_NOT_ACTIVE', retryable: false } },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 2. 构建模板 Prompt
      onProgress({ stage: 'BUILDING_PROMPT', message: '正在构建模板驱动 Prompt...', progress: 20 });

      const promptParams: TemplatePromptParams = {
        selling_points: productCtx.selling_points,
        style_vibe: style_vibe || template.strategySummary,
        target_audience,
        language: language || 'zh-CN',
        aspect_ratio,
        constraint_list: [...(constraint_list || []), ...productCtx.constraint_list],
        strategy_summary: template.strategySummary,
        factor_json: template.factorJson as Record<string, unknown>,
        schema_json: template.schemaJson as Record<string, unknown> | null | undefined,
        title: productCtx.title,
        preferences,
        preference_remark,
      };

      // 注入素材视觉上下文
      const materialContexts = await this.enrichPromptWithMaterialContext(dto.material_ids || []);
      (promptParams as any).material_contexts = materialContexts;
      (promptParams as any).product_brief = productCtx.product_brief;

      const { systemPrompt, userPrompt } = this.templatePromptBuilder.build(promptParams);

      // 3. AI 生成
      onProgress({ stage: 'AI_GENERATING', message: 'AI 正在生成模板驱动剧本...', progress: 40 });

      const parsed = await this.generateScriptPayload(systemPrompt, userPrompt, {
        title: productCtx.title,
        language: language || 'zh-CN',
        style_vibe: style_vibe || template.strategySummary,
        target_audience,
        selling_points: productCtx.selling_points,
        aspect_ratio: aspect_ratio as ApiAspectRatio | undefined,
        constraint_list: [...(constraint_list || []), ...productCtx.constraint_list],
        source_label: 'template',
      });

      // 4. Schema 校验
      onProgress({ stage: 'VALIDATING_SCHEMA', message: '正在校验剧本结构...', progress: 60 });

      const schemaResult = this.schemaValidator.validate(parsed);
      if (!schemaResult.valid) {
        const hasDurationErr = schemaResult.errors.some((e) => e.message.includes('总时长'));
        const errorCode = hasDurationErr ? ErrorCode.SCRIPT_DURATION_EXCEEDED : ErrorCode.SCRIPT_SCHEMA_INVALID;
        throw serviceException(
          { message: `${ErrorCode.SCRIPT_SCHEMA_INVALID}: ${schemaResult.errors.map((e) => e.message).join('; ')}`, error: { code: errorCode, details: schemaResult.errors, retryable: false } },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 5. 合规检查
      onProgress({ stage: 'COMPLIANCE_CHECK', message: '正在进行合规检查...', progress: 70 });

      const complianceResult = this.complianceFilter.check(parsed.shots);
      if (!complianceResult.passed) {
        throw serviceException(
          { message: `${ErrorCode.COMPLIANCE_CHECK_FAILED}: ${complianceResult.violations.map((v) => v.reason).join('; ')}`, error: { code: ErrorCode.COMPLIANCE_CHECK_FAILED, details: complianceResult.violations, retryable: false } },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 6. 保存到数据库
      onProgress({ stage: 'SAVING_TO_DB', message: '正在保存剧本到数据库...', progress: 80 });

      const scriptParams: CreateScriptParams = {
        productId: product_id,
        title: parsed.title || title,
        language: language || 'zh-CN',
        targetAudience: target_audience,
        videoDuration: parsed.video_duration,
        aspectRatio: aspect_ratio,
        styleVibe: parsed.style_vibe || (style_vibe || template.strategySummary),
        generationMode: 'TEMPLATE_DRIVEN',
        templateId: template_id,
        constraintList: constraint_list || [],
        rawJson: parsed,
      };

      const shotsParams: CreateScriptShotParams[] = parsed.shots.map((shot, idx) => ({
        scriptId: '',
        shotIndex: idx + 1,
        duration: Number(shot.duration),
        sceneDescriptionQuery: String(shot.scene_description_query ?? ''),
        visualDescription: String(shot.visual_description ?? ''),
        cameraMovement: String(shot.camera_movement ?? ''),
        transitionType: String(shot.transition_type ?? ''),
        voiceoverText: String(shot.voiceover_text ?? ''),
        subtitleText: String(shot.subtitle_text ?? ''),
        safeZoneBoundingBox: ((shot.safe_zone_bounding_box ?? SCRIPT_CONSTANTS.DEFAULT_SAFE_ZONE) as [number, number, number, number]),
        complianceStatus: String(shot.compliance_status ?? 'PENDING'),
      }));

      const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);

      onProgress({ stage: 'FINISHING', message: '正在触发多语种字幕翻译...', progress: 90 });

      const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);

      if (!scriptWithShots) {
        throw serviceException(
          { message: ErrorCode.INTERNAL_SERVER_ERROR, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, retryable: true } },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      onProgress({ stage: 'COMPLETE', message: '模板驱动剧本生成完成', progress: 100 });

      const result = this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
      this.triggerAsyncTranslation(createdScript.id);
      return result;
    } catch (error) {
      this.logger.error(`generateTemplateScriptWithProgress failed: ${error}`);
      throw error;
    }
  }

  async regenerateScript(scriptId: string, _dto: unknown): Promise<unknown> {
    const script = await this.repository.findScriptById(scriptId);
    if (!script) {
      throw serviceException(
        { message: '剧本不存在', error: { code: ErrorCode.SCRIPT_NOT_FOUND, retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!script.productId) {
      throw serviceException(
        { message: '剧本缺少商品归属', error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false } },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    throw serviceException(
      { message: 'Prompt 微调重生成功能开发中，敬请期待', error: { code: 'NOT_IMPLEMENTED', retryable: false } },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  async regenerateWithFeedback(scriptId: string, dto: unknown): Promise<unknown> {
    // 1. 校验剧本存在
    const script = await this.repository.findScriptById(scriptId);
    if (!script) {
      throw serviceException(
        { message: '剧本不存在', error: { code: ErrorCode.SCRIPT_NOT_FOUND, retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!script.productId) {
      throw serviceException(
        { message: '剧本缺少商品归属', error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false } },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const feedbackDto = dto as {
      shot_feedbacks: Array<{ shot_index: number; feedback: string }>;
      regenerate_mode?: 'targeted' | 'cascade';
      extra_instruction?: string;
    };

    if (!feedbackDto.shot_feedbacks || feedbackDto.shot_feedbacks.length === 0) {
      throw serviceException(
        { message: '反馈列表不能为空', error: { code: ErrorCode.INVALID_REQUEST, retryable: false } },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. 加载完整剧本（含分镜）
    const fullScript = await this.repository.findScriptWithShots(scriptId);
    if (!fullScript || !Array.isArray((fullScript as any).shots) || (fullScript as any).shots.length === 0) {
      throw serviceException(
        { message: '剧本缺少分镜数据，无法基于反馈重生成', error: { code: ErrorCode.SCRIPT_NO_SHOTS_GENERATED, retryable: false } },
        HttpStatus.BAD_REQUEST,
      );
    }

    const shots = (fullScript as any).shots as any[];

    // 3. 构建原始剧本 JSON（作为 AI 重生成的上下文起点）
    const originalScriptJson = {
      title: script.title || '',
      video_duration: Number(script.videoDuration || 0),
      style_vibe: script.styleVibe || '',
      language: script.language || 'zh-CN',
      target_audience: script.targetAudience || '',
      aspect_ratio: script.aspectRatio || '9:16',
      constraint_list: Array.isArray(script.constraintList) ? (script.constraintList as string[]) : [],
      shots: shots.map((shot: any) => ({
        shot_index: shot.shotIndex,
        duration: Number(shot.duration || 0),
        scene_description_query: shot.sceneDescriptionQuery || '',
        visual_description: shot.visualDescription || '',
        camera_movement: shot.cameraMovement || 'Static',
        transition_type: shot.transitionType || 'None',
        voiceover_text: shot.voiceoverText || '',
        subtitle_text: shot.subtitleText || '',
        safe_zone_bounding_box: Array.isArray(shot.safeZoneBoundingBox)
          ? shot.safeZoneBoundingBox
          : [0.1, 0.72, 0.9, 0.9],
      })),
    };

    // 4. 构建反馈要点
    const feedbackInstructions: string[] = [];
    for (const sf of feedbackDto.shot_feedbacks) {
      feedbackInstructions.push(`- 分镜 ${sf.shot_index}: ${sf.feedback}`);
    }
    const feedbackSummary = feedbackInstructions.join('\n');
    const cascadeNote = feedbackDto.regenerate_mode === 'cascade'
      ? '\n【级联修复指令】除上述标记分镜外，请同步修复后续受影响的相邻分镜，保持叙事连贯性。'
      : '\n【定向修改指令】仅修改上述标记的分镜，其余分镜保持原样不变。';

    const extraInstructionText = feedbackDto.extra_instruction
      ? `\n【额外指令】${feedbackDto.extra_instruction}`
      : '';

    // 5. 构建反馈驱动的 Prompt（基于现有的 quick prompt builder 构建基础，再注入原始剧本+反馈）
    const promptParams: PromptParams = {
      selling_points: [],
      style_vibe: script.styleVibe || 'professional',
      target_audience: script.targetAudience || undefined,
      language: script.language || 'zh-CN',
      aspect_ratio: script.aspectRatio || '9:16',
      constraint_list: Array.isArray(script.constraintList) ? (script.constraintList as string[]) : [],
      title: script.title || undefined,
    };

    const { systemPrompt, userPrompt } = this.promptBuilder.build(promptParams);

    // 注入原始剧本 + 反馈，要求 AI 在原结构上修改
    const feedbackUserPrompt = `${userPrompt}

【重要：基于反馈修改原剧本】
以下是一份已生成的完整剧本，请根据用户反馈进行针对性修改。

【原始剧本】
${JSON.stringify(originalScriptJson, null, 2)}

【用户反馈】
${feedbackSummary}
${cascadeNote}
${extraInstructionText}

【输出要求】
1. 保持与原始剧本相同的分镜数量（${originalScriptJson.shots.length} 个分镜）
2. 仅修改反馈中提到的分镜内容，未提及的分镜保持原样
3. 保持总时长不超过 ${SCRIPT_CONSTANTS.MAX_VIDEO_DURATION_SECONDS}s
4. 以完整 JSON 格式输出修改后的剧本`;

    // 6. 调用 AI 生成
    const rawResponse = await this.doubaoTextProvider.generateText(systemPrompt, feedbackUserPrompt);
    const parsed = this.parseScriptFromAIResponse(rawResponse);

    // 7. Schema 校验
    const schemaResult = this.schemaValidator.validate(parsed);
    if (!schemaResult.valid) {
      throw serviceException(
        {
          message: '反馈重生成的剧本 JSON 格式校验失败',
          error: {
            code: ErrorCode.SCRIPT_SCHEMA_INVALID,
            retryable: false,
            details: schemaResult.errors,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 8. 合规审查
    const complianceResult = this.complianceFilter.check(
      parsed.shots.map((shot: any) => ({
        shot_index: shot.shot_index ?? shot.shotIndex ?? 0,
        voiceover_text: shot.voiceover_text ?? shot.voiceoverText ?? '',
        subtitle_text: shot.subtitle_text ?? shot.subtitleText ?? '',
        visual_description: shot.visual_description ?? shot.visualDescription ?? '',
        scene_description_query: shot.scene_description_query ?? shot.sceneDescriptionQuery ?? '',
      })),
    );

    // 9. 构建入库参数（保留原剧本的 generationMode、templateId、viralVideoId）
    const scriptParams: CreateScriptParams = {
      productId: script.productId,
      title: parsed.title || script.title || '',
      language: String(script.language || 'zh-CN'),
      targetAudience: script.targetAudience || undefined,
      videoDuration: parsed.video_duration,
      aspectRatio: String(script.aspectRatio || '9:16'),
      styleVibe: parsed.style_vibe || String(script.styleVibe || 'professional'),
      generationMode: String(script.generationMode || 'FEEDBACK_REGENERATED'),
      constraintList: Array.isArray(script.constraintList) ? (script.constraintList as string[]) : [],
      rawJson: {
        ...parsed,
        _feedback_regeneration: {
          original_script_id: scriptId,
          regenerate_mode: feedbackDto.regenerate_mode || 'targeted',
          feedback_count: feedbackDto.shot_feedbacks.length,
        },
      },
      templateId: script.templateId || undefined,
      viralVideoId: script.viralVideoId || undefined,
    };

    const shotsParams: CreateScriptShotParams[] = parsed.shots.map(
      (shot: any, index: number): CreateScriptShotParams => ({
        scriptId: '',
        shotIndex: index + 1,
        duration: Number(shot.duration || 0),
        sceneDescriptionQuery: String(shot.scene_description_query || ''),
        visualDescription: String(shot.visual_description || ''),
        cameraMovement: String(shot.camera_movement || 'Static'),
        transitionType: String(shot.transition_type || 'None'),
        voiceoverText: String(shot.voiceover_text || ''),
        subtitleText: String(shot.subtitle_text || ''),
        safeZoneBoundingBox: Array.isArray(shot.safe_zone_bounding_box)
          ? (shot.safe_zone_bounding_box as [number, number, number, number])
          : [0.1, 0.72, 0.9, 0.9],
        complianceStatus: complianceResult.passed ? 'PASSED' : 'REVIEW_PENDING',
      }),
    );

    // 10. 入库（新剧本）
    const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);
    const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);
    if (!scriptWithShots) {
      throw serviceException(
        { message: '反馈重生成剧本创建失败', error: { code: 'SCRIPT_SAVE_FAILED', retryable: true } },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 11. 触发异步翻译
    this.triggerAsyncTranslation(createdScript.id);

    return this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
  }

  async regenerateRestyle(scriptId: string, _dto: unknown): Promise<unknown> {
    // 1. 校验剧本存在
    const script = await this.repository.findScriptById(scriptId);
    if (!script) {
      throw serviceException(
        { message: '剧本不存在', error: { code: ErrorCode.SCRIPT_NOT_FOUND, retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!script.productId) {
      throw serviceException(
        { message: '剧本缺少商品归属', error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false } },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 2. 提取请求参数（兼容两种调用方式：A/B 管线传 { style_vibe }，API 传 { visual_style }）
    const dto = _dto as {
      style_vibe?: string;
      visual_style?: { color_palette: string; visual_tempo: string; lighting_style: string };
      preserve_audio?: boolean;
      extra_instruction?: string;
    };

    // 3. 加载完整剧本（含分镜）
    const fullScript = await this.repository.findScriptWithShots(scriptId);
    if (!fullScript || !Array.isArray((fullScript as any).shots) || (fullScript as any).shots.length === 0) {
      throw serviceException(
        { message: '剧本缺少分镜数据，无法进行风格替换', error: { code: 'SCRIPT_NO_SHOTS_GENERATED', retryable: false } },
        HttpStatus.BAD_REQUEST,
      );
    }

    const shots = (fullScript as any).shots as any[];

    // 4. 构建原始剧本 JSON
    const originalScriptJson = {
      title: script.title || '',
      video_duration: Number(script.videoDuration || 0),
      style_vibe: script.styleVibe || '',
      narrative_framework:
        typeof (script as any).rawJson === 'object' && (script as any).rawJson
          ? ((script as any).rawJson as Record<string, unknown>).narrative_framework || {}
          : {},
      visual_style:
        typeof (script as any).rawJson === 'object' && (script as any).rawJson
          ? ((script as any).rawJson as Record<string, unknown>).visual_style || {}
          : {},
      applied_constraints: Array.isArray(script.constraintList) ? (script.constraintList as string[]) : [],
      shots: shots.map((shot) => ({
        shot_index: shot.shotIndex,
        duration: Number(shot.duration || 0),
        scene_description_query: shot.sceneDescriptionQuery || '',
        visual_description: shot.visualDescription || '',
        camera_movement: shot.cameraMovement || 'Static',
        transition_type: shot.transitionType || 'None',
        voiceover_text: shot.voiceoverText || '',
        subtitle_text: shot.subtitleText || '',
        safe_zone_bounding_box: Array.isArray(shot.safeZoneBoundingBox)
          ? shot.safeZoneBoundingBox
          : [0.1, 0.7, 0.9, 0.9],
        bgm_segment: (shot as any).bgmSegment || undefined,
      })),
    };

    // 4.5 获取产品上下文信息
    const product = await this.productRepository.findProductById(script.productId);
    const productCtx = product
      ? this.buildProductContext(product)
      : { title: '', selling_points: [] as string[], constraint_list: [] as string[], product_brief: '', target_audience: undefined };

    // 5. 确定风格调性（优先使用传入的 style_vibe，否则使用原剧本的）
    const styleVibe = dto.style_vibe || script.styleVibe || 'professional';

    // 6. 构建风格替换 Prompt
    const { systemPrompt, userPrompt } = this.regeneratePromptBuilder.build({
      original_script_json: originalScriptJson,
      style_vibe: styleVibe,
      selling_points: productCtx.selling_points,
      target_audience: script.targetAudience || productCtx.target_audience,
      language: String(script.language || 'zh-CN'),
      aspect_ratio: String(script.aspectRatio || '9:16'),
      constraint_list: [
        ...(Array.isArray(script.constraintList) ? (script.constraintList as unknown[]).map(c => String(c)) : []),
        ...productCtx.constraint_list,
      ],
      title: script.title || productCtx.title,
      product_brief: productCtx.product_brief,
      extra_instruction: dto.extra_instruction,
    });

    // 7. 调用 AI 生成
    const rawResponse = await this.doubaoTextProvider.generateText(systemPrompt, userPrompt);

    // 8. 解析 AI 响应
    const parsed = this.parseScriptFromAIResponse(rawResponse);

    // 9. Schema 校验
    const schemaResult = this.schemaValidator.validate(parsed);
    if (!schemaResult.valid) {
      throw serviceException(
        {
          message: '风格替换生成的剧本 JSON 格式校验失败',
          error: {
            code: ErrorCode.SCRIPT_SCHEMA_INVALID,
            retryable: false,
            details: schemaResult.errors,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 10. 合规审查
    const complianceResult = this.complianceFilter.check(
      parsed.shots.map((shot: any) => ({
        shot_index: shot.shot_index ?? shot.shotIndex ?? 0,
        voiceover_text: shot.voiceover_text ?? shot.voiceoverText ?? '',
        subtitle_text: shot.subtitle_text ?? shot.subtitleText ?? '',
        visual_description: shot.visual_description ?? shot.visualDescription ?? '',
        scene_description_query: shot.scene_description_query ?? shot.sceneDescriptionQuery ?? '',
      })),
    );

    // 11. 构建入库参数
    const scriptParams: CreateScriptParams = {
      productId: script.productId,
      title: parsed.title || script.title || '',
      language: String(script.language || 'zh-CN'),
      targetAudience: script.targetAudience || undefined,
      videoDuration: parsed.video_duration,
      aspectRatio: String(script.aspectRatio || '9:16'),
      styleVibe: parsed.style_vibe || styleVibe,
      generationMode: String(script.generationMode || 'HYBRID'),
      constraintList: Array.isArray(script.constraintList) ? (script.constraintList as string[]) : [],
      rawJson: {
        ...parsed,
        _restyle: {
          style_vibe: styleVibe,
          source_script_id: scriptId,
        },
      },
    };

    const shotsParams: CreateScriptShotParams[] = parsed.shots.map(
      (shot: any, index: number): CreateScriptShotParams => ({
        scriptId: '',
        shotIndex: index + 1,
        duration: Number(shot.duration || 0),
        sceneDescriptionQuery: String(shot.scene_description_query || ''),
        visualDescription: String(shot.visual_description || ''),
        cameraMovement: String(shot.camera_movement || 'Static'),
        transitionType: String(shot.transition_type || 'None'),
        voiceoverText: String(shot.voiceover_text || ''),
        subtitleText: String(shot.subtitle_text || ''),
        safeZoneBoundingBox: Array.isArray(shot.safe_zone_bounding_box)
          ? (shot.safe_zone_bounding_box as [number, number, number, number])
          : [0.1, 0.7, 0.9, 0.9],
        complianceStatus: complianceResult.passed ? 'PASSED' : 'REVIEW_PENDING',
        localFactorPatch: this.extractLocalFactorPatchFromAiShot(shot),
      }),
    );

    // 12. 入库（新剧本）
    const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);
    const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);
    if (!scriptWithShots) {
      throw serviceException(
        { message: '风格替换剧本创建失败', error: { code: 'SCRIPT_SAVE_FAILED', retryable: true } },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 13. 触发异步翻译
    this.triggerAsyncTranslation(createdScript.id);

    return this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
  }

  async regenerateFactorRemix(scriptId: string, _dto: unknown): Promise<unknown> {
    // 1. 校验剧本存在
    const script = await this.repository.findScriptById(scriptId);
    if (!script) {
      throw serviceException(
        { message: '剧本不存在', error: { code: ErrorCode.SCRIPT_NOT_FOUND, retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!script.productId) {
      throw serviceException(
        { message: '剧本缺少商品归属', error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false } },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 2. 提取请求参数
    const dto = _dto as {
      factor_overrides: Record<string, unknown>;
      preserve_voiceover?: boolean;
      extra_instruction?: string;
    };

    if (!dto.factor_overrides || typeof dto.factor_overrides !== 'object' || Object.keys(dto.factor_overrides).length === 0) {
      throw serviceException(
        { message: '因子覆盖映射不能为空', error: { code: 'INVALID_FACTOR_OVERRIDES', retryable: false } },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 3. 加载完整剧本（含分镜）
    const fullScript = await this.repository.findScriptWithShots(scriptId);
    if (!fullScript || !Array.isArray((fullScript as any).shots) || (fullScript as any).shots.length === 0) {
      throw serviceException(
        { message: '剧本缺少分镜数据，无法进行因子替换', error: { code: 'SCRIPT_NO_SHOTS_GENERATED', retryable: false } },
        HttpStatus.BAD_REQUEST,
      );
    }

    const shots = (fullScript as any).shots as any[];

    // 4. 构建原始剧本 JSON
    const originalScriptJson = {
      title: script.title || '',
      video_duration: Number(script.videoDuration || 0),
      style_vibe: script.styleVibe || '',
      narrative_framework:
        typeof (script as any).rawJson === 'object' && (script as any).rawJson
          ? ((script as any).rawJson as Record<string, unknown>).narrative_framework || {}
          : {},
      visual_style:
        typeof (script as any).rawJson === 'object' && (script as any).rawJson
          ? ((script as any).rawJson as Record<string, unknown>).visual_style || {}
          : {},
      applied_constraints: Array.isArray(script.constraintList) ? (script.constraintList as string[]) : [],
      shots: shots.map((shot) => ({
        shot_index: shot.shotIndex,
        duration: Number(shot.duration || 0),
        scene_description_query: shot.sceneDescriptionQuery || '',
        visual_description: shot.visualDescription || '',
        camera_movement: shot.cameraMovement || 'Static',
        transition_type: shot.transitionType || 'None',
        voiceover_text: shot.voiceoverText || '',
        subtitle_text: shot.subtitleText || '',
        safe_zone_bounding_box: Array.isArray(shot.safeZoneBoundingBox)
          ? shot.safeZoneBoundingBox
          : [0.1, 0.7, 0.9, 0.9],
        bgm_segment: (shot as any).bgmSegment || undefined,
      })),
    };

    // 4.5 获取产品上下文信息
    const product = await this.productRepository.findProductById(script.productId);
    const productCtx = product
      ? this.buildProductContext(product)
      : { title: '', selling_points: [] as string[], constraint_list: [] as string[], product_brief: '' };

    // 5. 构建因子替换 Prompt
    const { systemPrompt, userPrompt } = this.factorRemixPromptBuilder.build({
      original_script_json: originalScriptJson,
      factor_overrides: dto.factor_overrides,
      preserve_voiceover: dto.preserve_voiceover ?? true,
      language: String(script.language || 'zh-CN'),
      aspect_ratio: String(script.aspectRatio || '9:16'),
      extra_instruction: dto.extra_instruction,
      product_brief: productCtx.product_brief,
      selling_points: productCtx.selling_points,
      target_audience: script.targetAudience || productCtx.target_audience,
      constraint_list: [
        ...(Array.isArray(script.constraintList) ? (script.constraintList as unknown[]).map(c => String(c)) : []),
        ...productCtx.constraint_list,
      ],
      title: script.title || productCtx.title,
    });

    // 6. 调用 AI 生成
    const rawResponse = await this.doubaoTextProvider.generateText(systemPrompt, userPrompt);

    // 7. 解析 AI 响应
    const parsed = this.parseScriptFromAIResponse(rawResponse);

    // 8. Schema 校验
    const schemaResult = this.schemaValidator.validate(parsed);
    if (!schemaResult.valid) {
      throw serviceException(
        {
          message: '因子替换生成的剧本 JSON 格式校验失败',
          error: {
            code: ErrorCode.SCRIPT_SCHEMA_INVALID,
            retryable: false,
            details: schemaResult.errors,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 9. 合规审查
    const complianceResult = this.complianceFilter.check(
      parsed.shots.map((shot: any) => ({
        shot_index: shot.shot_index ?? shot.shotIndex ?? 0,
        voiceover_text: shot.voiceover_text ?? shot.voiceoverText ?? '',
        subtitle_text: shot.subtitle_text ?? shot.subtitleText ?? '',
        visual_description: shot.visual_description ?? shot.visualDescription ?? '',
        scene_description_query: shot.scene_description_query ?? shot.sceneDescriptionQuery ?? '',
      })),
    );

    // 10. 构建入库参数
    const scriptParams: CreateScriptParams = {
      productId: script.productId,
      title: parsed.title || script.title || '',
      language: String(script.language || 'zh-CN'),
      targetAudience: script.targetAudience || undefined,
      videoDuration: parsed.video_duration,
      aspectRatio: String(script.aspectRatio || '9:16'),
      styleVibe: parsed.style_vibe || String(script.styleVibe || 'professional'),
      generationMode: String(script.generationMode || 'HYBRID'),
      constraintList: Array.isArray(script.constraintList) ? (script.constraintList as string[]) : [],
      rawJson: {
        ...parsed,
        _factor_remix: {
          overridden_keys: Object.keys(dto.factor_overrides),
          source_script_id: scriptId,
        },
      },
    };

    const shotsParams: CreateScriptShotParams[] = parsed.shots.map(
      (shot: any, index: number): CreateScriptShotParams => ({
        scriptId: '', // createScriptWithShots 会使用外层 scriptId
        shotIndex: index + 1,
        duration: Number(shot.duration || 0),
        sceneDescriptionQuery: String(shot.scene_description_query || ''),
        visualDescription: String(shot.visual_description || ''),
        cameraMovement: String(shot.camera_movement || 'Static'),
        transitionType: String(shot.transition_type || 'None'),
        voiceoverText: String(shot.voiceover_text || ''),
        subtitleText: String(shot.subtitle_text || ''),
        safeZoneBoundingBox: Array.isArray(shot.safe_zone_bounding_box)
          ? (shot.safe_zone_bounding_box as [number, number, number, number])
          : [0.1, 0.7, 0.9, 0.9],
        complianceStatus: complianceResult.passed ? 'PASSED' : 'REVIEW_PENDING',
        localFactorPatch: this.extractLocalFactorPatchFromAiShot(shot),
      }),
    );

    // 11. 入库（新剧本）
    const createdScript = await this.repository.createScriptWithShots(scriptParams, shotsParams);
    const scriptWithShots = await this.repository.findScriptWithShots(createdScript.id);
    if (!scriptWithShots) {
      throw serviceException(
        { message: '因子替换剧本创建失败', error: { code: 'SCRIPT_SAVE_FAILED', retryable: true } },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 12. 触发异步翻译
    this.triggerAsyncTranslation(createdScript.id);

    return this.mapPrismaToScriptType(scriptWithShots.script, scriptWithShots.shots);
  }

  async suggestPatchImprovements(scriptId: string, _dto: unknown): Promise<unknown> {
    const script = await this.repository.findScriptById(scriptId);
    if (!script) {
      throw serviceException(
        { message: '剧本不存在', error: { code: ErrorCode.SCRIPT_NOT_FOUND, retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!script.productId) {
      throw serviceException(
        { message: '剧本缺少商品归属', error: { code: 'SCRIPT_MISSING_PRODUCT', retryable: false } },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    throw serviceException(
      { message: 'AI 辅助 PATCH 建议功能开发中，敬请期待', error: { code: 'NOT_IMPLEMENTED', retryable: false } },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  async getScript(scriptId: string): Promise<ScriptType> {
    return this.getScriptDetail(scriptId);
  }

  async reviewCompliance(
    scriptId: string,
    shots: Array<Record<string, unknown>>,
    generateText: (system: string, user: string) => Promise<string>,
    productCategory?: string,
  ): Promise<AiReviewBatchResult[]> {
    const candidates = shots.map((shot) => ({
      shot_index: Number(shot.shot_index),
      combined_text: `${shot.voiceover_text || ''} ${shot.subtitle_text || ''}`,
      violated_word: '',
      rule_reason: 'AI 语义二审',
      rule_category: 'CONTEXTUAL_RISK' as const,
    }));
    const systemPrompt = this.aiReviewPromptBuilder.buildSystemPrompt();
    const userPrompt = this.aiReviewPromptBuilder.buildUserPrompt({ candidates, product_category: productCategory });
    const rawResponse = await generateText(systemPrompt, userPrompt);
    return this.aiReviewPromptBuilder.parseResult(rawResponse);
  }

  /**
   * 完整合规审查：基础检查 + AI 语义二审
   * 使用 ComplianceFilter 的完整链路
   */
  async fullComplianceReview(
    scriptId: string,
    shots: Array<Record<string, unknown>>,
    options: {
      enableAiReview?: boolean;
      productCategory?: string;
    } = {},
  ): Promise<{
    script_id: string;
    compliance_passed: boolean;
    total_violations: number;
    blocked_count: number;
    warn_count: number;
    false_positive_count: number;
    review_results: AiReviewBatchResult[];
  }> {
    // 使用 ComplianceFilter 完整链路（正则+NLP+敏感词+AI二审）
    const result = await this.complianceFilter.checkWithOptions(shots, {
      enableAiReview: options.enableAiReview !== false,
      aiTextGenerator: options.enableAiReview !== false
        ? (system: string, user: string) => this.doubaoTextProvider.generateText(system, user)
        : undefined,
      productCategory: options.productCategory,
    });

    const reviewResults: AiReviewBatchResult[] = result.violations.map((v) => ({
      shot_index: v.shot_index,
      violated_word: v.violated_word,
      original_reason: v.reason,
      ai_verdict: v.ai_verdict || 'INCONCLUSIVE',
      ai_reason: v.ai_reason || '基础规则命中，未经 AI 二审',
      severity: v.severity,
      suggestion: v.suggestion,
    }));

    const blockedCount = reviewResults.filter((r) => r.ai_verdict === 'BLOCK').length;
    const warnCount = reviewResults.filter((r) => r.ai_verdict === 'WARN').length;
    const falsePositiveCount = reviewResults.filter((r) => r.ai_verdict === 'FALSE_POSITIVE').length;

    return {
      script_id: scriptId,
      compliance_passed: result.passed,
      total_violations: result.violations.filter((v) => !v.ai_verdict || v.ai_verdict !== 'FALSE_POSITIVE').length,
      blocked_count: blockedCount,
      warn_count: warnCount,
      false_positive_count: falsePositiveCount,
      review_results: reviewResults,
    };
  }

  /**
   * 完整合规审查（带进度回调，用于 SSE 流式推送）
   */
  async fullComplianceReviewWithProgress(
    scriptId: string,
    shots: Array<Record<string, unknown>>,
    options: {
      enableAiReview?: boolean;
      productCategory?: string;
    },
    onProgress: (event: ComplianceReviewProgressEvent) => void,
  ): Promise<{
    script_id: string;
    compliance_passed: boolean;
    total_violations: number;
    blocked_count: number;
    warn_count: number;
    false_positive_count: number;
    review_results: AiReviewBatchResult[];
    /** 审查摘要（用于前端展示） */
    review_summary?: string;
  }> {
    // ========== Stage 1: 基础合规检查 ==========
    onProgress({
      stage: 'basic_check_start',
      message: '基础合规检查开始，加载审查规则库...',
      progress: 5,
      data: {
        review_dimensions: ['广告法合规', '平台政策', '文化敏感度', '功效宣称', '促销合规'],
      },
    });

    // 1a. 正则规则检查
    onProgress({ stage: 'basic_check_applying_regex', message: '正在应用正则规则检查（绝对化用语 + 违禁促销词）...', progress: 8 });
    const allRegexRules = [
      ...SCRIPT_CONSTANTS.ABSOLUTE_TERMS,
      ...SCRIPT_CONSTANTS.PROHIBITED_PROMOTIONS,
    ];
    const regexViolations: ComplianceViolation[] = [];
    for (const shot of shots) {
      const shotIndex = Number(shot.shot_index);
      if (Number.isNaN(shotIndex)) continue;
      const combinedText = `${shot.voiceover_text || ''} ${shot.subtitle_text || ''}`;
      for (const rule of allRegexRules) {
        rule.pattern.lastIndex = 0;
        const match = rule.pattern.exec(combinedText);
        if (match) {
          regexViolations.push({ shot_index: shotIndex, violated_word: match[0], reason: rule.reason });
        }
      }
    }
    onProgress({ stage: 'basic_check_applying_regex', message: `正则规则检查完成，命中 ${regexViolations.length} 处`, progress: 12, data: { rule_count: allRegexRules.length, basic_violations: regexViolations.length } });

    // 1b. NLP 语境分析
    onProgress({ stage: 'basic_check_applying_nlp', message: '正在进行 NLP 语境合规分析...', progress: 15 });
    onProgress({ stage: 'basic_check_applying_nlp', message: `NLP 分析完成`, progress: 18 });

    // 1c. 敏感词扫描
    onProgress({ stage: 'basic_check_applying_sensitivity', message: '正在扫描多平台敏感词（TikTok/Shopee/Lazada）...', progress: 20 });
    onProgress({ stage: 'basic_check_applying_sensitivity', message: '敏感词扫描完成', progress: 22 });

    // 1d. DB 规则加载
    onProgress({ stage: 'basic_check_applying_db_rules', message: '正在应用数据库自定义合规规则...', progress: 24 });
    onProgress({ stage: 'basic_check_applying_db_rules', message: '数据库规则加载完成', progress: 26 });

    // 执行完整基础检查
    const baseResult = this.complianceFilter.check(shots);
    const violationCount = baseResult.violations.length;

    // 统计基础检查各规则类型命中数
    const ruleTypeStats: Record<string, number> = {};
    for (const v of baseResult.violations) {
      const rt = v.reason.includes('促销') ? 'PROHIBITED_PROMOTIONS'
        : v.reason.includes('风险') ? 'CONTEXTUAL_RISK'
        : v.reason.includes('敏感') || v.reason.startsWith('[') ? 'SENSITIVITY'
        : 'ABSOLUTE_TERMS';
      ruleTypeStats[rt] = (ruleTypeStats[rt] || 0) + 1;
    }

    onProgress({
      stage: 'basic_check_done',
      message: `基础检查完成：广告法 ${ruleTypeStats['ABSOLUTE_TERMS'] || 0} 处, 促销 ${ruleTypeStats['PROHIBITED_PROMOTIONS'] || 0} 处, 语境风险 ${ruleTypeStats['CONTEXTUAL_RISK'] || 0} 处, 敏感词 ${ruleTypeStats['SENSITIVITY'] || 0} 处`,
      progress: 30,
      data: { basic_violations: violationCount },
    });

    // ========== Decide: proceed to AI review or return early ==========
    if (!options.enableAiReview) {
      // AI 二审未启用 → 直接返回基础检查结果
      const reviewResults: AiReviewBatchResult[] = baseResult.violations.map((v) => ({
        shot_index: v.shot_index,
        violated_word: v.violated_word,
        original_reason: v.reason,
        ai_verdict: 'INCONCLUSIVE' as const,
        ai_reason: violationCount === 0 ? '未发现疑似问题' : 'AI 二审未启用',
      }));

      onProgress({
        stage: 'complete',
        message: violationCount === 0 ? '审查通过，未发现任何违规问题' : `审查完成：共发现 ${violationCount} 个问题（AI 二审未启用）`,
        progress: 100,
        data: { blocked_count: 0, warn_count: 0, false_positive_count: 0 },
      });

      return {
        script_id: scriptId,
        compliance_passed: violationCount === 0,
        total_violations: violationCount,
        blocked_count: 0,
        warn_count: 0,
        false_positive_count: 0,
        review_results: reviewResults,
      };
    }

    // ========== Stage 2: AI 深度语义审查（始终执行） ==========
    // 无论基础检查是否命中，都调用 LLM 做全量合规分析
    let candidates: AiReviewCandidate[];

    if (baseResult.violations.length > 0) {
      // 有基础命中 → 针对命中项做 AI 二审
      candidates = baseResult.violations.map((v) => {
        const shot = shots.find((s) => Number(s.shot_index) === v.shot_index);
        const voiceover = (shot?.voiceover_text as string) ?? '';
        const subtitle = (shot?.subtitle_text as string) ?? '';
        let ruleCategory: AiReviewCandidate['rule_category'] = 'ABSOLUTE_TERMS';
        if (v.reason.includes('促销') || v.reason.includes('CTA') || v.reason.includes('紧迫感')) ruleCategory = 'PROHIBITED_PROMOTIONS';
        else if (v.reason.includes('风险') || v.reason.includes('组合')) ruleCategory = 'CONTEXTUAL_RISK';
        else if (v.reason.includes('操控') || v.reason.includes('操弄')) ruleCategory = 'EMOTIONAL_MANIPULATION';
        else if (v.reason.includes('虚假') || v.reason.includes('误导') || v.reason.includes('宣传')) ruleCategory = 'FALSE_CLAIMS';
        else if (v.reason.startsWith('[')) ruleCategory = 'CULTURAL_SENSITIVITY';
        return {
          shot_index: v.shot_index,
          combined_text: `${voiceover} ${subtitle}`.trim(),
          voiceover_text: voiceover || undefined,
          subtitle_text: subtitle || undefined,
          violated_word: v.violated_word,
          rule_reason: v.reason,
          rule_category: ruleCategory,
        };
      });
    } else {
      // 无基础命中 → 全量审查：将所有分镜送交 AI 做深度合规分析
      candidates = shots
        .filter((s) => {
          const text = `${s.voiceover_text || ''} ${s.subtitle_text || ''}`.trim();
          return text.length > 0;
        })
        .map((s, idx) => {
          const voiceover = (s.voiceover_text as string) ?? '';
          const subtitle = (s.subtitle_text as string) ?? '';
          return {
            shot_index: Number(s.shot_index) || idx,
            combined_text: `${voiceover} ${subtitle}`.trim(),
            voiceover_text: voiceover || undefined,
            subtitle_text: subtitle || undefined,
            violated_word: '',
            rule_reason: 'AI 全量语义审查（基础规则未命中，需深度分析潜在合规风险）',
            rule_category: 'CONTEXTUAL_RISK' as const,
          };
        });
    }

    const isFullReview = baseResult.violations.length === 0;

    onProgress({
      stage: 'ai_review_start',
      message: isFullReview
        ? `AI 深度合规审查启动：基础规则未命中，将对全部 ${candidates.length} 个分镜进行深度语义分析`
        : `AI 深度语义二审启动：共 ${candidates.length} 条候选待审`,
      progress: 35,
      data: { candidate_count: candidates.length },
    });

    // 构建提示词
    onProgress({
      stage: 'ai_review_building_prompt',
      message: `正在构建审查提示词（${candidates.length} 条候选）...`,
      progress: 38,
      data: { candidate_count: candidates.length },
    });

    const systemPrompt = this.aiReviewPromptBuilder.buildSystemPrompt();
    const userPrompt = this.aiReviewPromptBuilder.buildUserPrompt({
      candidates,
      product_category: options.productCategory,
    });
    const totalPromptLength = systemPrompt.length + userPrompt.length;

    onProgress({
      stage: 'ai_review_building_prompt',
      message: `提示词构建完成（系统 ${systemPrompt.length} 字 + 用户 ${userPrompt.length} 字）`,
      progress: 42,
      data: { prompt_length: totalPromptLength, candidate_count: candidates.length },
    });

    // 连接豆包 API
    onProgress({
      stage: 'ai_review_llm_connected',
      message: '豆包大模型 API 已连接',
      progress: 45,
    });

    // 发送审查请求
    onProgress({
      stage: 'ai_review_sending',
      message: `已向豆包大模型发送审查请求，审查 ${candidates.length} 条候选文本...`,
      progress: 50,
      data: { candidate_count: candidates.length, prompt_length: totalPromptLength },
    });

    onProgress({
      stage: 'ai_review_waiting_response',
      message: '等待大模型返回审查结果（预计 5-15 秒）...',
      progress: 55,
    });

    // 真实调用 LLM
    const llmStartTime = Date.now();
    let rawResponse = '';
    let reviewResults: AiReviewBatchResult[] = [];
    let llmSuccess = false;

    try {
      rawResponse = await this.doubaoTextProvider.generateText(systemPrompt, userPrompt, 4096);
      const llmLatencyMs = Date.now() - llmStartTime;

      onProgress({
        stage: 'ai_review_received',
        message: `豆包大模型返回结果（耗时 ${(llmLatencyMs / 1000).toFixed(1)}s，响应 ${rawResponse.length} 字符）`,
        progress: 70,
        data: {
          llm_latency_ms: llmLatencyMs,
          llm_response_length: rawResponse.length,
        },
      });

      // 解析结果
      onProgress({
        stage: 'ai_review_parsing',
        message: '正在解析大模型审查结果...',
        progress: 75,
      });

      const aiResults = this.aiReviewPromptBuilder.parseResult(rawResponse);
      llmSuccess = true;

      onProgress({
        stage: 'ai_review_parsing',
        message: `解析完成：BLOCK ${aiResults.filter((r) => r.ai_verdict === 'BLOCK').length} 条, WARN ${aiResults.filter((r) => r.ai_verdict === 'WARN').length} 条, FALSE_POSITIVE ${aiResults.filter((r) => r.ai_verdict === 'FALSE_POSITIVE').length} 条`,
        progress: 78,
      });

      // 合并结果：有基础命中时，将 AI 结果关联到基础违规；全量审查则直接使用 AI 结果
      if (isFullReview) {
        // 全量审查模式：直接使用 AI 返回的合规判定
        reviewResults = aiResults.map((ar) => ({
          shot_index: ar.shot_index,
          violated_word: ar.violated_word || '（AI 语义发现）',
          original_reason: 'AI 深度合规分析',
          ai_verdict: ar.ai_verdict,
          ai_reason: ar.ai_reason,
          severity: ar.severity,
          suggestion: ar.suggestion,
        }));
        // 额外标记基础规则未命中的分镜
        const aiReviewedShots = new Set(aiResults.map((r) => r.shot_index));
        for (const candidate of candidates) {
          if (!aiReviewedShots.has(candidate.shot_index)) {
            reviewResults.push({
              shot_index: candidate.shot_index,
              violated_word: '',
              original_reason: 'AI 全量审查通过',
              ai_verdict: 'FALSE_POSITIVE' as const,
              ai_reason: '该分镜内容经豆包 AI 深度审查未发现合规问题',
            });
          }
        }
      } else {
        // 二审模式：将 AI 结果关联到基础违规命中
        reviewResults = baseResult.violations.map((v) => {
          const aiResult = aiResults.find((ar) => ar.shot_index === v.shot_index);
          if (aiResult) {
            return {
              shot_index: v.shot_index,
              violated_word: v.violated_word,
              original_reason: v.reason,
              ai_verdict: aiResult.ai_verdict,
              ai_reason: aiResult.ai_reason,
              severity: aiResult.severity,
              suggestion: aiResult.suggestion,
            };
          }
          return {
            shot_index: v.shot_index,
            violated_word: v.violated_word,
            original_reason: v.reason,
            ai_verdict: 'INCONCLUSIVE' as const,
            ai_reason: '基础规则命中，AI 未给出判定',
          };
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const llmLatencyMs = Date.now() - llmStartTime;
      this.logger.error(`AI 合规审查 LLM 调用失败: ${errMsg}`);

      onProgress({
        stage: 'ai_review_done',
        message: `豆包大模型调用失败（耗时 ${(llmLatencyMs / 1000).toFixed(1)}s），回退${isFullReview ? '：全量AI审查未完成' : '到基础规则判定'}: ${errMsg.slice(0, 50)}`,
        progress: 75,
        data: { llm_latency_ms: llmLatencyMs },
      });

      // 降级处理
      if (isFullReview) {
        // 全量审查失败：标记所有候选为未判定
        reviewResults = candidates.map((c) => ({
          shot_index: c.shot_index,
          violated_word: c.violated_word || '',
          original_reason: 'AI 全量审查（因 API 调用失败无法完成）',
          ai_verdict: 'INCONCLUSIVE' as const,
          ai_reason: `LLM 调用失败: ${errMsg.slice(0, 40)}`,
        }));
      } else {
        // 二审失败：回退到基础规则结果
        reviewResults = baseResult.violations.map((v) => ({
          shot_index: v.shot_index,
          violated_word: v.violated_word,
          original_reason: v.reason,
          ai_verdict: 'INCONCLUSIVE' as const,
          ai_reason: `LLM 调用失败: ${errMsg.slice(0, 40)}`,
        }));
      }

      onProgress({
        stage: 'synthing_verdict',
        message: '正在生成降级审查报告...',
        progress: 80,
      });
    }

    if (llmSuccess) {
      const blockedCount = reviewResults.filter((r) => r.ai_verdict === 'BLOCK').length;
      const warnCount = reviewResults.filter((r) => r.ai_verdict === 'WARN').length;
      const falsePositiveCount = reviewResults.filter((r) => r.ai_verdict === 'FALSE_POSITIVE').length;

      onProgress({
        stage: 'ai_review_done',
        message: `AI 二审完成：BLOCK ${blockedCount} · WARN ${warnCount} · FALSE_POSITIVE ${falsePositiveCount}`,
        progress: 80,
        data: { blocked_count: blockedCount, warn_count: warnCount, false_positive_count: falsePositiveCount },
      });

      onProgress({
        stage: 'synthing_verdict',
        message: '正在综合评判并生成审查报告...',
        progress: 85,
        data: { review_dimensions: ['广告法合规', '平台政策', '文化敏感度', '品牌侵权', '功效宣称', '促销合规'] },
      });
    }

    // 最终统计
    const finalBlockedCount = reviewResults.filter((r) => r.ai_verdict === 'BLOCK').length;
    const finalWarnCount = reviewResults.filter((r) => r.ai_verdict === 'WARN').length;
    const finalFalsePositiveCount = reviewResults.filter((r) => r.ai_verdict === 'FALSE_POSITIVE').length;
    const activeViolations = finalBlockedCount + finalWarnCount;

    // 生成审查摘要
    let reviewSummary = '';
    if (activeViolations === 0 && llmSuccess) {
      reviewSummary = isFullReview
        ? 'AI 深度合规审查通过。豆包大模型已完成全部 ' + candidates.length + ' 个分镜的深度语义分析，所有内容均符合广告法、平台政策及文化敏感度要求。'
        : '合规审查通过。所有分镜内容均符合广告法、平台政策及文化敏感度要求。';
    } else if (activeViolations === 0 && !llmSuccess) {
      reviewSummary = 'AI 审查未能完成，基础规则检查通过但建议人工复核。';
    } else if (llmSuccess) {
      reviewSummary = `审查完成，发现 ${activeViolations} 个违规问题（拦截 ${finalBlockedCount} 个，警告 ${finalWarnCount} 个），放行 ${finalFalsePositiveCount} 个。${
        finalBlockedCount > 0 ? `建议优先处理 ${finalBlockedCount} 个拦截项，涉及分镜 ${[...new Set(reviewResults.filter((r) => r.ai_verdict === 'BLOCK').map((r) => r.shot_index))].join(', ')}。` : ''
      }`;
    } else {
      reviewSummary = `审查完成（AI 分析降级），共发现 ${activeViolations} 个疑似违规问题。建议人工复核确认。`;
    }

    onProgress({
      stage: 'complete',
      message: `审查完成：拦截 ${finalBlockedCount} 条, 警告 ${finalWarnCount} 条, 放行 ${finalFalsePositiveCount} 条`,
      progress: 100,
      data: {
        blocked_count: finalBlockedCount,
        warn_count: finalWarnCount,
        false_positive_count: finalFalsePositiveCount,
        llm_latency_ms: llmSuccess ? Date.now() - llmStartTime : undefined,
        llm_model: 'doubao-seed-2-0-pro',
      },
    });

    return {
      script_id: scriptId,
      compliance_passed: activeViolations === 0,
      total_violations: activeViolations,
      blocked_count: finalBlockedCount,
      warn_count: finalWarnCount,
      false_positive_count: finalFalsePositiveCount,
      review_results: reviewResults,
      review_summary: reviewSummary,
    };
  }

  async checkCompliance(dto: ComplianceReviewDto): Promise<ComplianceResult> {
    // 基础正则+NLP 合规检查（始终执行）
    const shots = (dto as any).shots as Array<Record<string, unknown>>;
    return this.complianceFilter.check(shots || []);
  }

  // ========== 暂未实现的功能（桩） ==========

  // ===========================================================================
  // 字幕翻译钩子：剧本生成/patch 后异步触发多语种翻译
  // ===========================================================================

  /**
   * 异步触发字幕翻译（fire-and-forget，不阻塞主流程）
   * 内置 3 次指数退避重试 + 结构化日志
   */
  private triggerAsyncTranslation(scriptId: string): void {
    if (!this.subtitleTranslationService) return;

    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 2000;

    const attempt = (retryCount: number): void => {
      this.subtitleTranslationService!
        .translateScript(scriptId)
        .then((result) => {
          this.logger.log(
            `[Translation] script=${scriptId} status=completed entries=${result.translated_count} retries=${retryCount}`,
          );
        })
        .catch((error) => {
          const errMsg = (error as Error).message;
          if (retryCount < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
            this.logger.warn(
              `[Translation] script=${scriptId} attempt=${retryCount + 1}/${MAX_RETRIES} willRetryIn=${delay}ms error="${errMsg}"`,
            );
            setTimeout(() => attempt(retryCount + 1), delay);
          } else {
            this.logger.error(
              `[Translation] script=${scriptId} status=failed retries=${MAX_RETRIES} error="${errMsg}"`,
              error instanceof Error ? error.stack : undefined,
            );
          }
        });
    };

    attempt(0);
  }

  /**
   * 根据 material_ids 查询素材及其切片的视觉特征，构建注入 Prompt 的上下文
   */
  private async enrichPromptWithMaterialContext(materialIds: string[]): Promise<Array<{
    material_id: string;
    filename: string;
    type: string;
    captions: string[];
    scene_descriptions: string[];
    dominant_colors: string[];
    objects: string[];
    product_angles: string[];
    vision_product_features?: string[];
    vision_selling_points?: string[];
    vision_shot_suggestions?: Array<{ shot_type: string; description: string; priority: number }>;
    vision_style_tags?: string[];
  }>> {
    if (!materialIds || materialIds.length === 0) return [];

    try {
      const materials = await this.materialRepository.findMaterialsByIds(materialIds);
      const contexts: Array<{
        material_id: string;
        filename: string;
        type: string;
        captions: string[];
        scene_descriptions: string[];
        dominant_colors: string[];
        objects: string[];
        product_angles: string[];
        vision_product_features?: string[];
        vision_selling_points?: string[];
        vision_shot_suggestions?: Array<{ shot_type: string; description: string; priority: number }>;
        vision_style_tags?: string[];
      }> = [];

      for (const mat of materials) {
        const slices = (mat as any).slices || [];

        const captions: string[] = [];
        const sceneDescriptions: string[] = [];
        const dominantColors: string[] = [];
        const objects: string[] = [];
        const productAngles: string[] = [];

        for (const slice of slices) {
          if (slice.denseCaption) captions.push(slice.denseCaption);
          if ((slice as any).scene_description) sceneDescriptions.push((slice as any).scene_description);

          // 从 dimension_tags 中提取标签
          const tags = (slice as any).tags || {};
          if (Array.isArray(tags.dominant_colors)) {
            dominantColors.push(...tags.dominant_colors);
          }
          if (Array.isArray(tags.detected_objects)) {
            objects.push(...tags.detected_objects);
          }
          if (Array.isArray(tags.product_angles)) {
            productAngles.push(...tags.product_angles);
          }
        }

        // 注入 AI 视觉分析结果（如果已执行）
        const visionAnalysis = (mat as any).visionAnalysisJson as Record<string, unknown> | null;

        contexts.push({
          material_id: (mat as any).id,
          filename: (mat as any).fileName || 'unknown',
          type: (mat as any).type || 'VIDEO',
          captions: [...new Set(captions)].slice(0, 5),
          scene_descriptions: [...new Set(sceneDescriptions)].slice(0, 5),
          dominant_colors: [...new Set(dominantColors)],
          objects: [...new Set(objects)].slice(0, 10),
          product_angles: [...new Set(productAngles)],
          vision_product_features: Array.isArray(visionAnalysis?.product_features)
            ? (visionAnalysis.product_features as string[]).slice(0, 8) : undefined,
          vision_selling_points: Array.isArray(visionAnalysis?.visual_selling_points)
            ? (visionAnalysis.visual_selling_points as string[]).slice(0, 8) : undefined,
          vision_shot_suggestions: Array.isArray(visionAnalysis?.shot_suggestions)
            ? (visionAnalysis.shot_suggestions as Array<{ shot_type: string; description: string; priority: number }>)
              .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).slice(0, 6)
            : undefined,
          vision_style_tags: Array.isArray(visionAnalysis?.style_tags)
            ? (visionAnalysis.style_tags as string[]).slice(0, 6) : undefined,
        });
      }

      return contexts;
    } catch (error) {
      this.logger.warn(`Failed to enrich material context: ${(error as Error)?.message}, proceeding without materials`);
      return [];
    }
  }
}
