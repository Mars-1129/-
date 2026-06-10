// =============================================================================
// TikStream AI — Template Service
// =============================================================================

import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { Template } from '@prisma/client';
import { TemplateRepository } from './template.repository';
import { FactorRepository } from '../factor/factor.repository';
import { StrategyRepository } from '../strategy/strategy.repository';
import { ConstraintRepository } from '../constraint/constraint.repository';
import { ViralAnalysisService } from '../viral-analysis/viral-analysis.service';
import { ClusterTemplateProvider, ClusterOutput } from '../../services/ai/cluster-template.provider';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { serviceException } from '../common/service-exception';
import { TEMPLATE_CONSTANTS } from './template.constants';
import {
  Template as TemplateType,
  TemplateDetail,
  TemplateFactorAssignment,
  ViralVideoAnalysisSummary,
  ClusterTemplatesRequest,
  ClusterTemplatesResponse,
  PaginatedData,
} from '@tikstream/shared-types';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    private readonly repository: TemplateRepository,
    private readonly factorRepository: FactorRepository,
    private readonly strategyRepository: StrategyRepository,
    private readonly constraintRepository: ConstraintRepository,
    private readonly viralAnalysisService: ViralAnalysisService,
    private readonly clusterTemplateProvider: ClusterTemplateProvider,
  ) {}

  // ===========================================================================
  // Public API
  // ===========================================================================

  async createTemplate(dto: CreateTemplateDto): Promise<TemplateType> {
    this.logger.log(`Creating template: name=${dto.name}, category=${dto.category}`);

    this.validateCreateInput(dto);

    // 原子操作：事务内名称查重 + 写入，消除并发竞态
    let record: Template;
    try {
      record = await this.repository.createTemplateAtomic({
        name: dto.name.trim(),
        category: dto.category,
        strategySummary: dto.strategy_summary.trim(),
        factorJson: dto.factor_json,
        schemaJson: dto.schema_json ?? null,
        productId: dto.product_id || null,
        status: dto.status || 'ACTIVE',
      });
    } catch (error) {
      const err = error as Error & { code?: string; existing_id?: string };
      if (err.code === 'TEMPLATE_NAME_DUPLICATE') {
        throw serviceException(
          {
            message: `模板名称 "${dto.name.trim()}" 已存在`,
            error: {
              code: 'TEMPLATE_NAME_DUPLICATE',
              details: { name: dto.name.trim(), existing_id: err.existing_id },
              retryable: false,
            },
          },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    this.logger.log(`Template created: id=${record.id}`);
    return this.mapToTemplateType(record);
  }

  async getTemplateList(
    page: number,
    pageSize: number,
    category?: string,
    status?: string,
    keyword?: string,
    sortBy?: string,
    sortOrder?: string,
  ): Promise<PaginatedData<TemplateType>> {
    this.logger.log(
      `Querying template list: page=${page}, pageSize=${pageSize}, category=${category}, status=${status}, keyword=${keyword}, sortBy=${sortBy}, sortOrder=${sortOrder}`,
    );

    this.validateListParams(page, pageSize);

    if (category) {
      this.validateTemplateCategory(category);
    }
    if (status) {
      this.validateStatusEnum(status);
    }

    if (sortBy && !['name', 'createdAt', 'updatedAt'].includes(sortBy)) {
      throw serviceException(
        {
          message: `无效的排序字段: ${sortBy}。允许值: name, createdAt, updatedAt`,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
      throw serviceException(
        {
          message: `无效的排序方向: ${sortOrder}。允许值: asc, desc`,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { items, total } = await this.repository.findTemplatesPaginated({
      page,
      pageSize,
      category,
      status,
      keyword,
      sortBy,
      sortOrder,
    });

    return {
      items: items.map((record) => this.mapToTemplateType(record)),
      page,
      page_size: pageSize,
      total,
      has_more: page * pageSize < total,
    };
  }

  async getTemplateDetail(templateId: string): Promise<TemplateDetail> {
    this.logger.log(`Querying template detail: id=${templateId}`);

    const template = await this.validateTemplateExists(templateId);

    const viralLinks = await this.repository.findTemplatesWithViralLinks(templateId);
    const viralVideoAnalyses: ViralVideoAnalysisSummary[] = viralLinks.map((link) => ({
      analysis_id: link.analysis.id,
      source_platform: link.analysis.sourcePlatform,
      source_url: link.analysis.sourceUrl,
      title: link.analysis.title || undefined,
      hook_type: link.analysis.hookType || undefined,
    }));

    return await this.mapToTemplateDetailType(template, viralVideoAnalyses);
  }

  async updateTemplate(templateId: string, dto: UpdateTemplateDto): Promise<TemplateType> {
    this.logger.log(`Updating template: id=${templateId}`);

    if (!templateId || templateId.trim().length === 0) {
      throw serviceException(
        {
          message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_ID_REQUIRED,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.validateTemplateExists(templateId);
    this.validateTemplateNotArchived(existing);

    const updateData = this.buildUpdateData(dto, existing);

    if (Object.keys(updateData).length === 0) {
      this.logger.log(`No fields to update for template: id=${templateId}`);
      return this.mapToTemplateType(existing);
    }

    const updated = await this.repository.updateTemplate(templateId, updateData);

    this.logger.log(`Template updated: id=${updated.id}`);
    return this.mapToTemplateType(updated);
  }

  async deleteTemplate(templateId: string): Promise<{ template_id: string; deleted: boolean }> {
    this.logger.log(`Deleting template: id=${templateId}`);

    if (!templateId || templateId.trim().length === 0) {
      throw serviceException(
        {
          message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_ID_REQUIRED,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.validateTemplateExists(templateId);

    await this.repository.deleteTemplate(templateId);

    this.logger.log(`Template deleted: id=${templateId}`);
    return { template_id: templateId, deleted: true };
  }

  async clusterAndCreateTemplate(
    dto: ClusterTemplatesRequest,
  ): Promise<ClusterTemplatesResponse> {
    this.logger.log(
      `Clustering templates: product_id=${dto.product_id}, analysis_ids=[${dto.analysis_ids.join(',')}]`,
    );

    this.validateClusterInput(dto);

    const analyses = await this.viralAnalysisService.getViralAnalysesByIds(dto.analysis_ids);

    if (analyses.length !== dto.analysis_ids.length) {
      const foundIds = new Set(analyses.map((a) => a.analysis_id));
      const missingIds = dto.analysis_ids.filter((id) => !foundIds.has(id));
      throw serviceException(
        {
          message: `部分爆款分析记录不存在: ${missingIds.join(', ')}`,
          error: {
            code: 'VIRAL_VIDEO_ANALYSIS_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    for (const analysis of analyses) {
      const strategyKeys = Object.keys(analysis.strategy_json || {});
      const factorKeys = Object.keys(analysis.factor_json || {});
      if (strategyKeys.length === 0 && factorKeys.length === 0) {
        throw serviceException(
          {
            message: `爆款视频 ${analysis.analysis_id} (${analysis.title || '未知'}) 的策略和因子数据均为空，无法参与聚类`,
            error: {
              code: 'VIRAL_ANALYSIS_EMPTY_DATA',
              retryable: false,
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    const clusterResult: ClusterOutput =
      await this.clusterTemplateProvider.cluster(analyses);

    this.validateClusterFactorJson(clusterResult.factor_json);

    const category = dto.category || 'custom';

    const record = await this.repository.createTemplate({
      name: dto.name.trim(),
      category,
      strategySummary: clusterResult.strategy_summary,
      factorJson: clusterResult.factor_json,
      schemaJson: null,
      productId: dto.product_id || null,
      source: 'CLUSTERED',
      status: 'ACTIVE',
    });

    await this.repository.createTemplateViralLinks(
      record.id,
      clusterResult.clustered_analysis_ids,
    );

    this.logger.log(
      `Template clustered and created: id=${record.id}, linked ${clusterResult.clustered_analysis_ids.length} analyses`,
    );

    const templateType = this.mapToTemplateType(record);

    const viralVideoAnalyses: ViralVideoAnalysisSummary[] = analyses.map((a) => ({
      analysis_id: a.analysis_id,
      source_platform: a.source_platform,
      source_url: a.source_url,
      title: a.title || undefined,
      hook_type: a.hook_type || undefined,
    }));

    return {
      template: templateType,
      strategy_summary: clusterResult.strategy_summary,
      factor_json: clusterResult.factor_json,
      viral_video_analyses: viralVideoAnalyses,
    };
  }

  // ===========================================================================
  // Private Validators
  // ===========================================================================

  private validateCreateInput(dto: CreateTemplateDto): void {
    const name = dto.name?.trim();
    if (!name || name.length === 0) {
      throw serviceException(
        {
          message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_NAME_EMPTY,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (name.length > TEMPLATE_CONSTANTS.MAX_NAME_LENGTH) {
      throw serviceException(
        {
          message: `${TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_NAME_TOO_LONG}: 当前长度 ${name.length}`,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const summary = dto.strategy_summary?.trim();
    if (!summary || summary.length === 0) {
      throw serviceException(
        {
          message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_STRATEGY_SUMMARY_EMPTY,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.validateTemplateCategory(dto.category);
    this.validateFactorJsonStructure(dto.factor_json);

    if (dto.schema_json !== undefined && dto.schema_json !== null) {
      if (typeof dto.schema_json !== 'object' || Array.isArray(dto.schema_json)) {
        throw serviceException(
          {
            message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_SCHEMA_INVALID,
            error: {
              code: 'TEMPLATE_SCHEMA_INVALID',
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  private validateTemplateCategory(category: string): void {
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      throw serviceException(
        {
          message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_CATEGORY_EMPTY,
          error: {
            code: 'TEMPLATE_CATEGORY_INVALID',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const trimmed = category.trim();
    const allowed = TEMPLATE_CONSTANTS.ALLOWED_CATEGORIES as readonly string[];

    if (!allowed.includes(trimmed)) {
      throw serviceException(
        {
          message: `${TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_CATEGORY_INVALID}: "${trimmed}"。允许值: ${allowed.join(', ')}`,
          error: {
            code: 'TEMPLATE_CATEGORY_INVALID',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private validateFactorJsonStructure(factorJson: unknown): void {
    if (
      !factorJson ||
      typeof factorJson !== 'object' ||
      Array.isArray(factorJson)
    ) {
      throw serviceException(
        {
          message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_FACTOR_STRUCTURE_INVALID,
          error: {
            code: 'TEMPLATE_FACTOR_STRUCTURE_INVALID',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const keys = Object.keys(factorJson);

    if (keys.length === 0) {
      throw serviceException(
        {
          message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_FACTOR_STRUCTURE_INVALID,
          error: {
            code: 'TEMPLATE_FACTOR_STRUCTURE_INVALID',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 允许自定义因子键（超出预置键的因子通过因子库扩展）
    const knownKeys = TEMPLATE_CONSTANTS.FACTOR_PRIORITY as readonly string[];
    const hasCustomKeys = keys.some((key) => !knownKeys.includes(key));
    if (hasCustomKeys) {
      this.logger.log(
        `${TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_FACTOR_CUSTOM_KEY_WARNING}: keys=${keys.join(', ')}`,
      );
    }

    for (const key of keys) {
      const value = (factorJson as Record<string, unknown>)[key];
      if (value === null || value === undefined) {
        throw serviceException(
          {
            message: `${TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_FACTOR_NULL_VALUE}: "${key}"`,
            error: {
              code: 'TEMPLATE_FACTOR_STRUCTURE_INVALID',
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  private async validateTemplateExists(templateId: string): Promise<Template> {
    // Validate UUID format to prevent Prisma UUID parsing errors (HTTP 500)
    if (!this.isValidUuid(templateId)) {
      throw serviceException(
        {
          message: `无效的模板 ID: ${templateId}`,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const record = await this.repository.findTemplateById(templateId);

    if (!record) {
      throw serviceException(
        {
          message: `${TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_NOT_FOUND}: ${templateId}`,
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return record;
  }

  private isValidUuid(value: string): boolean {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return UUID_REGEX.test(value);
  }

  private validateTemplateNotArchived(template: Template): void {
    if (template.status === 'ARCHIVED') {
      throw serviceException(
        {
          message: `${TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_STATUS_IMMUTABLE}: 模板 ${template.id} 已归档`,
          error: {
            code: 'TEMPLATE_STATUS_IMMUTABLE',
            retryable: false,
          },
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  private validateListParams(page: number, pageSize: number): void {
    if (!Number.isInteger(page) || page < 1) {
      throw serviceException(
        {
          message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.PAGE_INVALID,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > TEMPLATE_CONSTANTS.MAX_PAGE_SIZE
    ) {
      throw serviceException(
        {
          message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.PAGE_SIZE_INVALID,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private validateStatusEnum(status: string): void {
    const allowed = TEMPLATE_CONSTANTS.TEMPLATE_STATUSES as readonly string[];

    if (!allowed.includes(status)) {
      throw serviceException(
        {
          message: `${TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_STATUS_INVALID}: "${status}"。允许值: ${allowed.join(', ')}`,
          error: {
            code: 'TEMPLATE_STATUS_INVALID',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private buildUpdateData(
    dto: UpdateTemplateDto,
    existing: Template,
  ): Record<string, unknown> {
    const updateData: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length === 0) {
        throw serviceException(
          {
            message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_NAME_EMPTY,
            error: {
              code: 'INVALID_REQUEST',
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (name.length > TEMPLATE_CONSTANTS.MAX_NAME_LENGTH) {
        throw serviceException(
          {
            message: `${TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_NAME_TOO_LONG}: 当前长度 ${name.length}`,
            error: {
              code: 'INVALID_REQUEST',
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      updateData.name = name;
    }

    if (dto.category !== undefined) {
      this.validateTemplateCategory(dto.category);
      updateData.category = dto.category.trim();
    }

    if (dto.strategy_summary !== undefined) {
      const summary = dto.strategy_summary.trim();
      if (summary.length === 0) {
        throw serviceException(
          {
            message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_STRATEGY_SUMMARY_EMPTY,
            error: {
              code: 'INVALID_REQUEST',
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      updateData.strategySummary = summary;
    }

    if (dto.factor_json !== undefined) {
      this.validateFactorJsonStructure(dto.factor_json);
      updateData.factorJson = dto.factor_json;
    }

    if (dto.schema_json !== undefined) {
      if (
        dto.schema_json !== null &&
        (typeof dto.schema_json !== 'object' || Array.isArray(dto.schema_json))
      ) {
        throw serviceException(
          {
            message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_SCHEMA_INVALID,
            error: {
              code: 'TEMPLATE_SCHEMA_INVALID',
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      updateData.schemaJson = dto.schema_json;
    }

    if (dto.status !== undefined) {
      const newStatus = dto.status;
      this.validateStatusEnum(newStatus);

      const transitions = TEMPLATE_CONSTANTS.ALLOWED_STATUS_TRANSITIONS as Record<string, readonly string[]>;
      const allowedTransitions = transitions[existing.status];

      if (allowedTransitions === undefined) {
        throw serviceException(
          {
            message: `模板当前状态 ${existing.status} 未配置允许的转换规则`,
            error: {
              code: 'TEMPLATE_STATUS_UNCONFIGURED',
              details: { current_status: existing.status },
              retryable: false,
            },
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      if (!allowedTransitions.includes(newStatus)) {
        throw serviceException(
          {
            message: `不允许从 ${existing.status} 转换为 ${newStatus}，允许的目标状态: ${allowedTransitions.join(', ')}`,
            error: {
              code: 'TEMPLATE_STATUS_TRANSITION_INVALID',
              details: { from: existing.status, to: newStatus, allowed: allowedTransitions },
              retryable: false,
            },
          },
          HttpStatus.CONFLICT,
        );
      }
      updateData.status = newStatus;
    }

    return updateData;
  }

  // ===========================================================================
  // Private Mappers
  // ===========================================================================

  private mapToTemplateType(record: Template): TemplateType {
    return {
      template_id: record.id,
      product_id: record.productId || undefined,
      name: record.name,
      category: record.category,
      strategy_summary: record.strategySummary,
      source: (record.source as TemplateType['source']) || 'MANUAL',
      status: record.status as TemplateType['status'],
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    };
  }

  private async mapToTemplateDetailType(
    record: Template,
    viralVideoAnalyses?: ViralVideoAnalysisSummary[],
  ): Promise<TemplateDetail> {
    const factors = await this.factorRepository.getTemplateFactors(record.id);
    const strategies = await this.strategyRepository.getTemplateStrategies(record.id);
    const constraints = await this.constraintRepository.getTemplateConstraints(record.id);

    return {
      ...this.mapToTemplateType(record),
      viral_video_analyses: viralVideoAnalyses,
      factors: factors.map(
        (tf): TemplateFactorAssignment => ({
          factor_id: tf.factorId,
          factor_key: tf.factor.key,
          factor_name: tf.factor.name,
          factor_category: tf.factor.category as TemplateFactorAssignment['factor_category'],
          value: tf.value as Record<string, unknown>,
        }),
      ),
      strategies: strategies.map((ts) => ({
        strategy_id: ts.strategy.id,
        key: ts.strategy.key,
        name: ts.strategy.name,
        description: ts.strategy.description ?? undefined,
        category: ts.strategy.category,
        summary: ts.strategy.summary,
        summary_json: ts.strategy.summaryJson as Record<string, unknown> | undefined,
        is_builtin: ts.strategy.isBuiltin,
        sort_order: ts.strategy.sortOrder,
        created_at: ts.strategy.createdAt.toISOString(),
        updated_at: ts.strategy.updatedAt.toISOString(),
      })),
      constraints: constraints.map((tc) => ({
        constraint_id: tc.constraint.id,
        key: tc.constraint.key,
        name: tc.constraint.name,
        description: tc.constraint.description ?? undefined,
        category: tc.constraint.category,
        rule_type: tc.constraint.ruleType as 'HARD' | 'SOFT',
        rule_config: tc.constraint.ruleConfig as Record<string, unknown>,
        is_builtin: tc.constraint.isBuiltin,
        sort_order: tc.constraint.sortOrder,
        created_at: tc.constraint.createdAt.toISOString(),
        updated_at: tc.constraint.updatedAt.toISOString(),
      })),
    };
  }

  private validateClusterInput(dto: ClusterTemplatesRequest): void {
    if (!dto.product_id || dto.product_id.trim().length === 0) {
      throw serviceException(
        {
          message: 'product_id 为必填字段',
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.analysis_ids || !Array.isArray(dto.analysis_ids) || dto.analysis_ids.length < 2) {
      throw serviceException(
        {
          message: '至少需要 2 条爆款分析记录才能进行聚类',
          error: {
            code: 'CLUSTER_INPUT_EMPTY',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const name = dto.name?.trim();
    if (!name || name.length === 0) {
      throw serviceException(
        {
          message: TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_NAME_EMPTY,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (name.length > TEMPLATE_CONSTANTS.MAX_NAME_LENGTH) {
      throw serviceException(
        {
          message: `${TEMPLATE_CONSTANTS.ERROR_MESSAGES.TEMPLATE_NAME_TOO_LONG}: 当前长度 ${name.length}`,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.category) {
      this.validateTemplateCategory(dto.category);
    }
  }

  private validateClusterFactorJson(factorJson: Record<string, unknown>): void {
    if (
      !factorJson ||
      typeof factorJson !== 'object' ||
      Array.isArray(factorJson)
    ) {
      throw serviceException(
        {
          message: 'AI 聚类返回的因子配置结构不合法',
          error: {
            code: 'CLUSTER_FACTOR_EMPTY',
            retryable: false,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const keys = Object.keys(factorJson);
    if (keys.length === 0) {
      throw serviceException(
        {
          message: 'AI 聚类返回的因子配置为空',
          error: {
            code: 'CLUSTER_FACTOR_EMPTY',
            retryable: false,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
