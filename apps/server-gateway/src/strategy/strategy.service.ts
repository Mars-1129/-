// =============================================================================
// TikStream AI — Strategy Service
// =============================================================================

import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import { Strategy } from '@prisma/client';
import { StrategyRepository } from './strategy.repository';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { AssignTemplateStrategiesDto } from './dto/assign-template-strategies.dto';
import { STRATEGY_CONSTANTS } from './strategy.constants';
import { isValidUuid } from '../common/validators';

// =============================================================================
// API 响应类型
// =============================================================================

export type StrategyCategory = 'creative' | 'narrative' | 'conversion' | 'branding';

export interface ApiStrategy {
  strategy_id: string;
  key: string;
  name: string;
  category: StrategyCategory;
  description?: string;
  summary: string;
  summary_json?: Record<string, unknown>;
  sort_order: number;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiTemplateStrategy {
  strategy_id: string;
  strategy_key: string;
  strategy_name: string;
  strategy_category: StrategyCategory;
}

// =============================================================================

@Injectable()
export class StrategyService implements OnModuleInit {
  private readonly logger = new Logger(StrategyService.name);

  constructor(
    private readonly repository: StrategyRepository,
    @InjectPrisma() private readonly prisma: PrismaClient,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('StrategyService initialized, seeding builtin strategies...');
    try {
      await this.repository.seedBuiltinStrategies();
    } catch (error) {
      this.logger.warn(`Failed to seed builtin strategies: ${(error as Error)?.message || String(error)}`);
    }
  }

  // ===========================================================================
  // Strategy CRUD
  // ===========================================================================

  async listStrategies(category?: string, keyword?: string): Promise<ApiStrategy[]> {
    this.logger.log(`Listing strategies: category=${category}, keyword=${keyword}`);

    if (
      category &&
      !STRATEGY_CONSTANTS.ALLOWED_CATEGORIES.includes(
        category as (typeof STRATEGY_CONSTANTS.ALLOWED_CATEGORIES)[number],
      )
    ) {
      throw new HttpException(
        {
          message: `${STRATEGY_CONSTANTS.ERROR_MESSAGES.CATEGORY_INVALID}: "${category}"`,
          error: { code: 'CATEGORY_INVALID', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const records = await this.repository.findAll(category, keyword);
    return records.map((r) => this.mapToApiStrategy(r));
  }

  async getStrategy(id: string): Promise<ApiStrategy> {
    this.logger.log(`Getting strategy: id=${id}`);

    if (!this.isValidUuid(id)) {
      throw new HttpException(
        {
          message: `无效的策略 ID: ${id}`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const record = await this.repository.findById(id);
    if (!record) {
      throw new HttpException(
        {
          message: `${STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_NOT_FOUND}: ${id}`,
          error: { code: 'STRATEGY_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return this.mapToApiStrategy(record);
  }

  async createStrategy(dto: CreateStrategyDto): Promise<ApiStrategy> {
    this.logger.log(`Creating strategy: key=${dto.key}, name=${dto.name}`);

    this.validateCreateInput(dto);

    const existing = await this.repository.findByKey(dto.key);
    if (existing) {
      throw new HttpException(
        {
          message: `${STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_KEY_DUPLICATE}: ${dto.key}`,
          error: { code: 'STRATEGY_KEY_DUPLICATE', retryable: false },
        },
        HttpStatus.CONFLICT,
      );
    }

    const record = await this.repository.create({
      key: dto.key,
      name: dto.name,
      category: dto.category,
      description: dto.description,
      summary: dto.summary,
      summaryJson: dto.summary_json,
      sortOrder: dto.sort_order,
    });
    this.logger.log(`Strategy created: id=${record.id}`);
    return this.mapToApiStrategy(record);
  }

  async updateStrategy(id: string, dto: UpdateStrategyDto): Promise<ApiStrategy> {
    this.logger.log(`Updating strategy: id=${id}`);

    if (!id || id.trim().length === 0) {
      throw new HttpException(
        {
          message: '策略 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new HttpException(
        {
          message: `${STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_NOT_FOUND}: ${id}`,
          error: { code: 'STRATEGY_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (existing.isBuiltin) {
      throw new HttpException(
        {
          message: STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_IS_BUILTIN,
          error: { code: 'STRATEGY_IS_BUILTIN', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      dto.category &&
      !STRATEGY_CONSTANTS.ALLOWED_CATEGORIES.includes(
        dto.category as (typeof STRATEGY_CONSTANTS.ALLOWED_CATEGORIES)[number],
      )
    ) {
      throw new HttpException(
        {
          message: `${STRATEGY_CONSTANTS.ERROR_MESSAGES.CATEGORY_INVALID}: "${dto.category}"`,
          error: { code: 'CATEGORY_INVALID', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.repository.update(id, {
      name: dto.name,
      category: dto.category,
      description: dto.description,
      summary: dto.summary,
      summaryJson: dto.summary_json,
      sortOrder: dto.sort_order,
    });
    this.logger.log(`Strategy updated: id=${updated.id}`);
    return this.mapToApiStrategy(updated);
  }

  async deleteStrategy(
    id: string,
  ): Promise<{ strategy_id: string; deleted: boolean }> {
    this.logger.log(`Deleting strategy: id=${id}`);

    if (!id || id.trim().length === 0) {
      throw new HttpException(
        {
          message: '策略 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new HttpException(
        {
          message: `${STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_NOT_FOUND}: ${id}`,
          error: { code: 'STRATEGY_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (existing.isBuiltin) {
      throw new HttpException(
        {
          message: STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_IS_BUILTIN,
          error: { code: 'STRATEGY_IS_BUILTIN', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.repository.delete(id);
    this.logger.log(`Strategy deleted: id=${id}`);
    return { strategy_id: id, deleted: true };
  }

  // ===========================================================================
  // Template-Strategy Assignment
  // ===========================================================================

  async assignTemplateStrategies(
    templateId: string,
    dto: AssignTemplateStrategiesDto,
  ): Promise<void> {
    this.logger.log(
      `Assigning strategies to template: templateId=${templateId}, count=${dto.strategy_ids.length}`,
    );

    if (!templateId || templateId.trim().length === 0) {
      throw new HttpException(
        {
          message: '模板 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.strategy_ids || dto.strategy_ids.length === 0) {
      throw new HttpException(
        {
          message: '策略 ID 列表不可为空',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const templateExists = await this.prisma.template.count({ where: { id: templateId } });
    if (templateExists === 0) {
      throw new HttpException(
        {
          message: `模板 ${templateId} 不存在`,
          error: { code: 'TEMPLATE_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.repository.assignToTemplate(templateId, dto.strategy_ids);
    this.logger.log(
      `Strategies assigned to template: templateId=${templateId}, count=${dto.strategy_ids.length}`,
    );
  }

  async getTemplateStrategies(
    templateId: string,
  ): Promise<ApiTemplateStrategy[]> {
    this.logger.log(`Getting template strategies: templateId=${templateId}`);

    if (!templateId || templateId.trim().length === 0) {
      throw new HttpException(
        {
          message: '模板 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const records = await this.repository.getTemplateStrategies(templateId);
    return records.map((r) => ({
      strategy_id: r.strategy.id,
      strategy_key: r.strategy.key,
      strategy_name: r.strategy.name,
      strategy_category: r.strategy.category as StrategyCategory,
    }));
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private validateCreateInput(dto: CreateStrategyDto): void {
    if (!dto.key || dto.key.trim().length === 0) {
      throw new HttpException(
        {
          message: STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_KEY_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.key.length > 80) {
      throw new HttpException(
        {
          message: '策略 key 长度超出上限 80',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.name || dto.name.trim().length === 0) {
      throw new HttpException(
        {
          message: STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_NAME_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.name.length > 120) {
      throw new HttpException(
        {
          message: '策略名称长度超出上限 120',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      !dto.category ||
      !STRATEGY_CONSTANTS.ALLOWED_CATEGORIES.includes(
        dto.category as (typeof STRATEGY_CONSTANTS.ALLOWED_CATEGORIES)[number],
      )
    ) {
      throw new HttpException(
        {
          message: STRATEGY_CONSTANTS.ERROR_MESSAGES.CATEGORY_INVALID,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.summary || dto.summary.trim().length === 0) {
      throw new HttpException(
        {
          message: STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_SUMMARY_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private isValidUuid(value: string): boolean {
    return isValidUuid(value);
  }

  private mapToApiStrategy(record: Strategy): ApiStrategy {
    return {
      strategy_id: record.id,
      key: record.key,
      name: record.name,
      category: record.category as StrategyCategory,
      description: record.description ?? undefined,
      summary: record.summary,
      summary_json: record.summaryJson as Record<string, unknown> | undefined,
      sort_order: record.sortOrder,
      is_builtin: record.isBuiltin,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    };
  }
}
