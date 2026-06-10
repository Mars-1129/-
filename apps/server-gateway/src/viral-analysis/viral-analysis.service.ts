// =============================================================================
// TikStream AI — Viral Video Analysis Service
// =============================================================================

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ViralVideoAnalysis } from '@prisma/client';
import { ViralAnalysisRepository } from './viral-analysis.repository';
import { CreateViralAnalysisDto } from './dto/create-viral-analysis.dto';
import { SearchViralAnalysisDto } from './dto/search-viral-analysis.dto';
import { FromMaterialDto } from './dto/from-material.dto';
import { serviceException } from '../common/service-exception';
import { VIRAL_ANALYSIS_CONSTANTS } from './viral-analysis.constants';
import { ViralVideoAnalysisProvider, AnalysisContext } from '../../services/ai/viral-video-analysis.provider';
import {
  ViralVideoAnalysis as ViralVideoAnalysisType,
  ViralVideoAnalysisDetail,
  ViralVideoAnalysisSearchResponse,
} from '@tikstream/shared-types';
import {
  normalizeViralVideoReport,
  normalizeViralVideoShots,
} from '../../../../shared/viral-video-schema';
import * as crypto from 'node:crypto';

@Injectable()
export class ViralAnalysisService {
  private readonly logger = new Logger(ViralAnalysisService.name);

  constructor(
    private readonly repository: ViralAnalysisRepository,
    private readonly analysisProvider: ViralVideoAnalysisProvider,
  ) {}

  // =========================================================================
  // Public: Create
  // =========================================================================

  async createViralAnalysis(
    dto: CreateViralAnalysisDto,
  ): Promise<{ analysis: ViralVideoAnalysisType; potential_duplicate: boolean; duplicate_of?: string }> {
    this.logger.log(
      `Creating viral analysis: platform=${dto.source_platform}, url=${dto.source_url.substring(0, 80)}`,
    );

    this.validateCreateInput(dto);

    const sourceUrl = dto.source_url.trim();
    const sourcePlatform = dto.source_platform.trim();
    const externalVideoId = this.deriveExternalVideoId(sourceUrl, sourcePlatform);
    const declaredPublicSource = dto.declared_public_source ?? true;

    // 内容去重检测
    const contentFingerprint = this.computeContentFingerprint(sourceUrl, dto.title || null);
    const duplicate = await this.repository.findDuplicateByFingerprint(contentFingerprint);

    if (duplicate) {
      this.logger.warn(
        `Potential content duplicate detected: fingerprint=${contentFingerprint}, existing=${duplicate.id}`,
      );
      return {
        analysis: this.mapToViralAnalysisType(duplicate),
        potential_duplicate: true,
        duplicate_of: duplicate.id,
      };
    }

    const record = await this.repository.createViralAnalysis({
      sourcePlatform,
      sourceUrl,
      externalVideoId,
      productId: dto.product_id || null,
      declaredPublicSource,
      initialReportJson: { content_fingerprint: contentFingerprint },
    });

    this.logger.log(`Viral analysis created: id=${record.id}`);

    // 异步触发 AI 分析（fire-and-forget）
    this.triggerAsyncAnalysis(record, dto.product_id || undefined);

    return {
      analysis: {
        ...this.mapToViralAnalysisType(record),
        analyzing: true,
      },
      potential_duplicate: false,
    };
  }

  // =========================================================================
  // Public: Analyze
  // =========================================================================

  async analyzeViralVideo(analysisId: string, productId?: string): Promise<ViralVideoAnalysisDetail> {
    this.logger.log(`Analyzing viral video: id=${analysisId}`);

    const record = await this.validateViralAnalysisExists(analysisId);

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '爆款视频分析不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // 检查是否已完成分析（已存在 ai_generated 标记的视为已完成）
    const existingReport = record.reportJson as Record<string, unknown> | null;
    if (
      existingReport !== null &&
      existingReport.analysis_source === 'ai_generated'
    ) {
      this.logger.log(`Analysis already complete for id=${analysisId}`);
      return this.mapToViralAnalysisDetailType(record);
    }

    const productContext = await this.loadProductContext(record.productId);
    const thumbnailUrl = this.extractThumbnailFromReport(
      record.reportJson as Record<string, unknown> | null,
    );

    const result = await this.analysisProvider.analyze({
      source_url: record.sourceUrl,
      source_platform: record.sourcePlatform,
      title: record.title || undefined,
      thumbnail_url: thumbnailUrl,
      product_context: productContext,
    });

    // 标准化 report_json 结构
    const normalizedReport = normalizeViralVideoReport(result.report_json);

    // 合并内容指纹到 report
    const contentFingerprint = (record.reportJson as Record<string, unknown>)?.content_fingerprint as string;
    const reportJson = {
      ...result.report_json,
      ...normalizedReport,
      ...(contentFingerprint && { content_fingerprint: contentFingerprint }),
      analysis_source: 'ai_generated',
    };

    const updated = await this.repository.updateViralAnalysis(analysisId, {
      title: result.title,
      hookType: result.hook_type,
      strategyJson: result.strategy_json,
      factorJson: result.factor_json,
      reportJson,
      sellingPoints: result.selling_points,
      shotsDecomposition: result.shots,
    });

    this.logger.log(`Viral analysis completed: id=${analysisId}`);
    return this.mapToViralAnalysisDetailType(updated);
  }

  // =========================================================================
  // Public: Search
  // =========================================================================

  async searchViralAnalyses(
    dto: SearchViralAnalysisDto,
  ): Promise<ViralVideoAnalysisSearchResponse> {
    this.logger.log(`Searching viral analyses: keyword=${dto.keyword}, platform=${dto.source_platform}`);

    if (dto.keyword && dto.keyword.trim().length < 2) {
      throw serviceException(
        {
          message: VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SEARCH_KEYWORD_TOO_SHORT,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { items, total } = await this.repository.searchViralAnalyses({
      keyword: dto.keyword,
      category: dto.category,
      sourcePlatform: dto.source_platform,
      productId: dto.product_id,
      page: dto.page || 1,
      pageSize: dto.page_size || 20,
    });

    return {
      items: items.map((r) => this.mapToViralAnalysisDetailType(r)),
      total,
      page: dto.page || 1,
      page_size: dto.page_size || 20,
    };
  }

  // =========================================================================
  // Public: From Material
  // =========================================================================

  async createFromMaterial(
    dto: FromMaterialDto,
  ): Promise<{ analysis: ViralVideoAnalysisType; analyzing: boolean }> {
    this.logger.log(`Creating viral analysis from material: materialId=${dto.material_id}`);

    // 查找 Material
    const material = await this.findMaterialById(dto.material_id);

    if (!material) {
      throw serviceException(
        {
          message: VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.MATERIAL_NOT_FOUND,
          error: { code: 'MATERIAL_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (material.type !== 'VIDEO') {
      throw serviceException(
        {
          message: VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.MATERIAL_NOT_VIDEO,
          error: { code: 'MATERIAL_NOT_VIDEO', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const productId = dto.product_id || material.productId;
    const sourceUrl = material.originUrl;

    // 内容去重
    const contentFingerprint = this.computeContentFingerprint(sourceUrl, null);
    const duplicate = await this.repository.findDuplicateByFingerprint(contentFingerprint);

    if (duplicate) {
      this.logger.warn(
        `Potential duplicate from material: fingerprint=${contentFingerprint}, existing=${duplicate.id}`,
      );
      return {
        analysis: {
          ...this.mapToViralAnalysisType(duplicate),
          analyzing: false,
        },
        analyzing: false,
      };
    }

    const record = await this.repository.createViralAnalysis({
      sourcePlatform: 'self_uploaded',
      sourceUrl,
      externalVideoId: `material_${dto.material_id}`,
      productId: productId || null,
      declaredPublicSource: false,
      initialReportJson: {
        content_fingerprint: contentFingerprint,
        source_material_id: dto.material_id,
      },
    });

    this.logger.log(`Viral analysis from material created: id=${record.id}`);

    // 异步触发 AI 分析
    const thumbnailUrl = material.thumbnailUrl || undefined;
    this.triggerAsyncAnalysis(record, productId, thumbnailUrl);

    return {
      analysis: {
        ...this.mapToViralAnalysisType(record),
        analyzing: true,
      },
      analyzing: true,
    };
  }

  // =========================================================================
  // Public: Query
  // =========================================================================

  async getViralAnalysisDetail(analysisId: string, productId?: string): Promise<ViralVideoAnalysisDetail> {
    this.logger.log(`Querying viral analysis detail: id=${analysisId}`);

    const record = await this.validateViralAnalysisExists(analysisId);

    if (productId && record.productId !== productId) {
      throw serviceException(
        {
          message: '爆款视频分析不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return this.mapToViralAnalysisDetailType(record);
  }

  async getViralAnalysesByIds(analysisIds: string[], productId?: string): Promise<ViralVideoAnalysisDetail[]> {
    this.logger.log(`Querying viral analyses by ids: count=${analysisIds.length}`);

    if (!analysisIds || analysisIds.length === 0) {
      return [];
    }

    const records = await this.repository.findViralAnalysesByIds(analysisIds);

    return records
      .filter((record) => !productId || record.productId === productId)
      .map((record) => this.mapToViralAnalysisDetailType(record));
  }

  async getViralAnalysesByProductId(productId: string): Promise<ViralVideoAnalysisDetail[]> {
    this.logger.log(`Querying viral analyses by productId: ${productId}`);

    if (!productId || productId.trim().length === 0) {
      throw serviceException(
        {
          message: 'product_id 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const records = await this.repository.findViralAnalysesByProductId(productId);

    return records.map((record) => this.mapToViralAnalysisDetailType(record));
  }

  async matchBestViralAnalysis(productId: string): Promise<ViralVideoAnalysisDetail> {
    this.logger.log(`Matching best viral analysis for product: ${productId}`);

    if (!productId || productId.trim().length === 0) {
      throw serviceException(
        {
          message: 'product_id 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const record = await this.repository.findBestViralAnalysisByProduct(productId);

    if (!record) {
      throw serviceException(
        {
          message: `未找到与商品 ${productId} 及其品类相关的爆款视频分析记录`,
          error: { code: 'VIRAL_ANALYSIS_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return this.mapToViralAnalysisDetailType(record);
  }

  // =========================================================================
  // Public: Suggest Keywords
  // =========================================================================

  async suggestViralKeywords(
    dto: { product_category?: string; product_title?: string },
  ): Promise<{
    platform_suggestions: Array<{
      platform: string;
      hashtags: string[];
      search_terms: string[];
    }>;
  }> {
    this.logger.log(`Suggesting viral keywords: category=${dto.product_category}, title=${dto.product_title}`);

    const systemPrompt = `你是一个社交媒体搜索专家。你需要根据商品信息为各个短视频平台推荐搜索关键词和标签。
输出格式（严格 JSON）：
{
  "platform_suggestions": [
    {
      "platform": "tiktok",
      "hashtags": ["#tag1", "#tag2"],
      "search_terms": ["search query 1", "search query 2"]
    }
  ]
}
平台支持: tiktok, youtube, instagram, facebook. 每个平台推荐 3-5 个 hashtag 和 2-3 个搜索词。`;

    const userPrompt = [
      '请为以下商品推荐各平台的爆款视频搜索关键词：',
      dto.product_title ? `商品名称: ${dto.product_title}` : '',
      dto.product_category ? `商品类目: ${dto.product_category}` : '',
      '',
      '输出 ONLY valid JSON。',
    ].filter(Boolean).join('\n');

    const rawResponse = await this.analysisProvider.generateText(
      systemPrompt,
      userPrompt,
    );

    let cleaned = rawResponse.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
      return JSON.parse(cleaned) as {
        platform_suggestions: Array<{
          platform: string;
          hashtags: string[];
          search_terms: string[];
        }>;
      };
    } catch {
      // 降级模板
      return {
        platform_suggestions: [
          {
            platform: 'tiktok',
            hashtags: dto.product_category ? [`#${dto.product_category}`, '#review', '#viral'] : ['#product', '#review', '#viral'],
            search_terms: dto.product_title ? [`${dto.product_title} review`, `${dto.product_title} unboxing`] : ['product review', 'product unboxing'],
          },
        ],
      };
    }
  }

  // =========================================================================
  // Private: Async Analysis Trigger
  // =========================================================================

  private triggerAsyncAnalysis(
    record: ViralVideoAnalysis,
    productId?: string | null,
    thumbnailUrl?: string | null,
  ): void {
    // Fire-and-forget: 不阻塞主流程
    (async () => {
      try {
        const productContext = productId ? await this.loadProductContext(productId) : undefined;
        const thumbUrl = thumbnailUrl || this.extractThumbnailFromReport(
          record.reportJson as Record<string, unknown> | null,
        );

        const result = await this.analysisProvider.analyze({
          source_url: record.sourceUrl,
          source_platform: record.sourcePlatform,
          title: record.title || undefined,
          thumbnail_url: thumbUrl,
          product_context: productContext,
        });

        const contentFingerprint = (
          record.reportJson as Record<string, unknown>
        )?.content_fingerprint as string;

        const normalizedReport = normalizeViralVideoReport(result.report_json);

        const reportJson = {
          ...result.report_json,
          ...normalizedReport,
          ...(contentFingerprint && { content_fingerprint: contentFingerprint }),
          analysis_source: 'ai_generated',
        };

        await this.repository.updateViralAnalysis(record.id, {
          title: result.title,
          hookType: result.hook_type,
          strategyJson: result.strategy_json,
          factorJson: result.factor_json,
          reportJson,
          sellingPoints: result.selling_points,
          shotsDecomposition: result.shots,
        });

        this.logger.log(`Async viral analysis completed: id=${record.id}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Async viral analysis failed for id=${record.id}: ${msg}`);
        // 持久化失败状态到 DB，使调用方可感知分析失败
        try {
          await this.repository.updateViralAnalysis(record.id, {
            reportJson: {
              ...((record.reportJson as Record<string, unknown>) || {}),
              analysis_error: msg,
              analysis_error_at: new Date().toISOString(),
              analysis_source: 'ai_failed',
            },
          });
        } catch (dbError) {
          this.logger.error(
            `Failed to persist analysis error for id=${record.id}: ${String(dbError)}`,
          );
        }
      }
    })().catch((error) => {
      // 兜底：防止 try-catch 自身抛异常导致的 unhandled rejection
      this.logger.error(
        `Unhandled error in triggerAsyncAnalysis for id=${record.id}: ${String(error)}`,
      );
    });
  }

  // =========================================================================
  // Private: Utility
  // =========================================================================

  private async loadProductContext(
    productId: string | null,
  ): Promise<{ category?: string; title?: string } | undefined> {
    if (!productId) return undefined;

    const attemptLoad = async (): Promise<{ category?: string; title?: string } | undefined> => {
      try {
        const product = await this.findProductById(productId);
        if (product) {
          return {
            category: product.category || undefined,
            title: product.title || undefined,
          };
        }
      } catch {
        // 首次尝试失败，外层重试或降级
        throw new Error(`Failed to load product context for ${productId}`);
      }
      return undefined;
    };

    try {
      return await attemptLoad();
    } catch {
      this.logger.warn(`First attempt to load product context failed for ${productId}, retrying...`);
      try {
        // 重试一次（间隔 500ms，应对临时网络波动）
        await new Promise((r) => setTimeout(r, 500));
        return await attemptLoad();
      } catch {
        this.logger.warn(
          `Product context loading failed after retry for ${productId}, analysis will proceed without product context`,
        );
        return undefined;
      }
    }
  }

  private computeContentFingerprint(sourceUrl: string, _title: string | null): string {
    // 内容级去重仅基于 sourceUrl（去参数/hash）。
    // 标题属于用户自定义元数据，同一视频的不同标题不应导致指纹不同。
    const normalized = sourceUrl.toLowerCase().trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .replace(/[?#].*$/, '');
    return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 16);
  }

  private extractThumbnailFromReport(report: Record<string, unknown> | null): string | undefined {
    const thumb = report?.thumbnail_url;
    return typeof thumb === 'string' ? thumb : undefined;
  }

  // =========================================================================
  // Private: External Data Access
  // =========================================================================

  private async findMaterialById(materialId: string): Promise<{
    type: string;
    productId: string;
    originUrl: string;
    thumbnailUrl: string | null;
  } | null> {
    return this.repository.findMaterialById(materialId);
  }

  private async findProductById(productId: string): Promise<{
    category: string;
    title: string;
  } | null> {
    return this.repository.findProductContextById(productId);
  }

  // =========================================================================
  // Private Validators
  // =========================================================================

  private validateCreateInput(dto: CreateViralAnalysisDto): void {
    const sourceUrl = dto.source_url;
    const sourcePlatform = dto.source_platform;

    if (!sourceUrl || (typeof sourceUrl === 'string' && sourceUrl.trim().length === 0)) {
      throw serviceException(
        {
          message: VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SOURCE_URL_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.validateSourceUrl(sourceUrl);

    if (!sourcePlatform || (typeof sourcePlatform === 'string' && sourcePlatform.trim().length === 0)) {
      throw serviceException(
        {
          message: VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SOURCE_PLATFORM_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.validateSourcePlatform(sourcePlatform);

    if (dto.product_id !== undefined && dto.product_id !== null) {
      const productId = dto.product_id;
      if (typeof productId !== 'string' || productId.trim().length === 0) {
        throw serviceException(
          {
            message: VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.PRODUCT_ID_INVALID_FORMAT,
            error: { code: 'INVALID_REQUEST', retryable: false },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  private validateSourcePlatform(platform: string): void {
    if (!platform || typeof platform !== 'string' || platform.trim().length === 0) {
      throw serviceException(
        {
          message: VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SOURCE_PLATFORM_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const trimmed = platform.trim();
    const allowed = VIRAL_ANALYSIS_CONSTANTS.ALLOWED_PLATFORMS as readonly string[];

    if (!allowed.includes(trimmed)) {
      throw serviceException(
        {
          message: `${VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SOURCE_PLATFORM_INVALID}: "${trimmed}"。允许值: ${allowed.join(', ')}`,
          error: { code: 'VIRAL_ANALYSIS_PLATFORM_INVALID', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private validateSourceUrl(url: string): void {
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      throw serviceException(
        {
          message: VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SOURCE_URL_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const trimmed = url.trim();
    if (/^https?:\/\/\//i.test(trimmed)) {
      throw serviceException(
        {
          message: `${VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SOURCE_URL_INVALID}: 缺少域名`,
          error: { code: 'VIRAL_ANALYSIS_URL_INVALID', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw serviceException(
          {
            message: `${VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SOURCE_URL_INVALID}: 仅支持 http/https 协议`,
            error: { code: 'VIRAL_ANALYSIS_URL_INVALID', retryable: false },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!parsed.hostname || parsed.hostname.length === 0) {
        throw serviceException(
          {
            message: `${VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SOURCE_URL_INVALID}: 缺少域名`,
            error: { code: 'VIRAL_ANALYSIS_URL_INVALID', retryable: false },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      this.logger.error(
        `URL validation error: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw serviceException(
        {
          message: VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SOURCE_URL_INVALID,
          error: { code: 'VIRAL_ANALYSIS_URL_INVALID', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (trimmed.length > VIRAL_ANALYSIS_CONSTANTS.MAX_URL_LENGTH) {
      throw serviceException(
        {
          message: `${VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.SOURCE_URL_TOO_LONG}: 当前 ${trimmed.length} 超出上限 ${VIRAL_ANALYSIS_CONSTANTS.MAX_URL_LENGTH}`,
          error: { code: 'VIRAL_ANALYSIS_URL_INVALID', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async validateViralAnalysisExists(analysisId: string): Promise<ViralVideoAnalysis> {
    if (!analysisId || analysisId.trim().length === 0) {
      throw serviceException(
        {
          message: VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.ANALYSIS_ID_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const record = await this.repository.findViralAnalysisById(analysisId);

    if (!record) {
      throw serviceException(
        {
          message: `${VIRAL_ANALYSIS_CONSTANTS.ERROR_MESSAGES.ANALYSIS_NOT_FOUND}: ${analysisId}`,
          error: { code: 'VIRAL_VIDEO_ANALYSIS_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return record;
  }

  private deriveExternalVideoId(sourceUrl: string, sourcePlatform: string): string {
    // 使用 URL 构造函数解析，比正则更鲁棒地处理各种 URL 格式
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      this.logger.warn(`[viral-analysis] 无法解析源 URL: ${sourceUrl.substring(0, 100)}，回退 hash`);
      return this.hashVideoId(sourceUrl, sourcePlatform);
    }

    if (sourcePlatform === 'tiktok') {
      const match = parsed.pathname.match(/\/video\/(\d+)/);
      if (match) return match[1];
    }
    if (sourcePlatform === 'youtube') {
      const v = parsed.searchParams.get('v');
      if (v) return v;
      // YouTube Shorts: /shorts/{id}
      const shortsMatch = parsed.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];
    }
    if (sourcePlatform === 'instagram') {
      const match = parsed.pathname.match(/\/(?:reel|p|tv)\/([a-zA-Z0-9_-]+)/);
      if (match) return match[1];
    }
    if (sourcePlatform === 'facebook') {
      const match = parsed.pathname.match(/\/videos\/(\d+)/);
      if (match) return match[1];
    }

    this.logger.warn(
      `[viral-analysis] 无法从 ${sourcePlatform} URL 提取视频 ID: ${sourceUrl.substring(0, 100)}，回退 hash`,
    );
    return this.hashVideoId(sourceUrl, sourcePlatform);
  }

  private hashVideoId(sourceUrl: string, sourcePlatform: string): string {
    const hashInput = `${sourcePlatform}:${sourceUrl}`;
    let hash = 5381;
    for (let i = 0; i < hashInput.length; i++) {
      hash = ((hash << 5) + hash + hashInput.charCodeAt(i)) >>> 0;
    }
    return `${sourcePlatform}_${hash.toString(16).padStart(8, '0')}`;
  }

  // =========================================================================
  // Private Mappers
  // =========================================================================

  private mapToViralAnalysisType(record: ViralVideoAnalysis): ViralVideoAnalysisType {
    return {
      analysis_id: record.id,
      product_id: record.productId || undefined,
      source_platform: record.sourcePlatform,
      source_url: record.sourceUrl,
      external_video_id: record.externalVideoId,
      title: record.title || undefined,
      hook_type: record.hookType || undefined,
      declared_public_source: record.declaredPublicSource,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    };
  }

  private mapToViralAnalysisDetailType(record: ViralVideoAnalysis): ViralVideoAnalysisDetail {
    return {
      ...this.mapToViralAnalysisType(record),
      strategy_json: (record.strategyJson as Record<string, unknown>) ?? {},
      factor_json: (record.factorJson as Record<string, unknown>) ?? {},
      report_json: (record.reportJson as Record<string, unknown>) ?? {},
      selling_points: (record.sellingPoints as unknown as string[]) || [],
      shots: (record.shotsDecomposition as unknown as ViralVideoAnalysisDetail['shots']) || [],
    };
  }
}
