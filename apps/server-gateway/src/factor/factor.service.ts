// =============================================================================
// TikStream AI — Factor Service
// =============================================================================

import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import { Factor } from '@prisma/client';
import { FactorRepository } from './factor.repository';
import { CreateFactorDto } from './dto/create-factor.dto';
import { UpdateFactorDto } from './dto/update-factor.dto';
import { AssignTemplateFactorsDto } from './dto/assign-template-factors.dto';
import { FACTOR_CONSTANTS } from './factor.constants';
import { isValidUuid } from '../common/validators';
import {
  Factor as FactorType,
  TemplateFactorAssignment,
} from '@tikstream/shared-types';

@Injectable()
export class FactorService implements OnModuleInit {
  private readonly logger = new Logger(FactorService.name);

  constructor(
    private readonly repository: FactorRepository,
    @InjectPrisma() private readonly prisma: PrismaClient,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('FactorService initialized, seeding builtin factors...');
    try {
      await this.repository.seedBuiltinFactors();
    } catch (error) {
      this.logger.warn(`Failed to seed builtin factors: ${(error as Error)?.message || String(error)}`);
    }
  }

  // ===========================================================================
  // Factor CRUD
  // ===========================================================================

  async listFactors(category?: string, keyword?: string): Promise<FactorType[]> {
    this.logger.log(`Listing factors: category=${category}, keyword=${keyword}`);

    if (category && !FACTOR_CONSTANTS.ALLOWED_CATEGORIES.includes(category as typeof FACTOR_CONSTANTS.ALLOWED_CATEGORIES[number])) {
      throw new HttpException(
        {
          message: `${FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_CATEGORY_INVALID}: "${category}"`,
          error: { code: 'FACTOR_CATEGORY_INVALID', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const records = await this.repository.findAll(category, keyword);
    return records.map((r) => this.mapToFactorType(r));
  }

  async getFactor(id: string): Promise<FactorType> {
    this.logger.log(`Getting factor: id=${id}`);

    if (!this.isValidUuid(id)) {
      throw new HttpException(
        {
          message: `无效的因子 ID: ${id}`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const record = await this.repository.findById(id);
    if (!record) {
      throw new HttpException(
        {
          message: `${FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_NOT_FOUND}: ${id}`,
          error: { code: 'FACTOR_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return this.mapToFactorType(record);
  }

  async createFactor(dto: CreateFactorDto): Promise<FactorType> {
    this.logger.log(`Creating factor: key=${dto.key}, name=${dto.name}`);

    this.validateCreateInput(dto);

    const existing = await this.repository.findByKey(dto.key);
    if (existing) {
      throw new HttpException(
        {
          message: `${FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_KEY_DUPLICATE}: ${dto.key}`,
          error: { code: 'FACTOR_KEY_DUPLICATE', retryable: false },
        },
        HttpStatus.CONFLICT,
      );
    }

    const record = await this.repository.create(dto);
    this.logger.log(`Factor created: id=${record.id}`);
    return this.mapToFactorType(record);
  }

  async updateFactor(id: string, dto: UpdateFactorDto): Promise<FactorType> {
    this.logger.log(`Updating factor: id=${id}`);

    if (!id || id.trim().length === 0) {
      throw new HttpException(
        {
          message: '因子 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new HttpException(
        {
          message: `${FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_NOT_FOUND}: ${id}`,
          error: { code: 'FACTOR_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (existing.isBuiltin) {
      throw new HttpException(
        {
          message: FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_IS_BUILTIN,
          error: { code: 'FACTOR_IS_BUILTIN', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (dto.category && !FACTOR_CONSTANTS.ALLOWED_CATEGORIES.includes(dto.category as typeof FACTOR_CONSTANTS.ALLOWED_CATEGORIES[number])) {
      throw new HttpException(
        {
          message: `${FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_CATEGORY_INVALID}: "${dto.category}"`,
          error: { code: 'FACTOR_CATEGORY_INVALID', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.repository.update(id, dto);
    this.logger.log(`Factor updated: id=${updated.id}`);
    return this.mapToFactorType(updated);
  }

  async deleteFactor(id: string): Promise<{ factor_id: string; deleted: boolean }> {
    this.logger.log(`Deleting factor: id=${id}`);

    if (!id || id.trim().length === 0) {
      throw new HttpException(
        {
          message: '因子 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new HttpException(
        {
          message: `${FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_NOT_FOUND}: ${id}`,
          error: { code: 'FACTOR_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (existing.isBuiltin) {
      throw new HttpException(
        {
          message: FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_IS_BUILTIN,
          error: { code: 'FACTOR_IS_BUILTIN', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.repository.delete(id);
    this.logger.log(`Factor deleted: id=${id}`);
    return { factor_id: id, deleted: true };
  }

  // ===========================================================================
  // Template-Factor Assignment
  // ===========================================================================

  async assignTemplateFactors(
    templateId: string,
    dto: AssignTemplateFactorsDto,
  ): Promise<void> {
    this.logger.log(`Assigning factors to template: templateId=${templateId}, count=${dto.factors.length}`);

    if (!templateId || templateId.trim().length === 0) {
      throw new HttpException(
        {
          message: '模板 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.factors || dto.factors.length === 0) {
      throw new HttpException(
        {
          message: FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_ASSIGN_VALUE_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 事务内验证因子存在性（见 FactorRepository.assignToTemplate），此处不再重复验证

    const assignments = dto.factors.map((item) => ({
      factor_id: item.factor_id,
      value: item.value,
    }));

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

    await this.repository.assignToTemplate(templateId, assignments);
    this.logger.log(`Factors assigned to template: templateId=${templateId}, count=${assignments.length}`);
  }

  async getTemplateFactors(templateId: string): Promise<TemplateFactorAssignment[]> {
    this.logger.log(`Getting template factors: templateId=${templateId}`);

    if (!templateId || templateId.trim().length === 0) {
      throw new HttpException(
        {
          message: '模板 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const records = await this.repository.getTemplateFactors(templateId);
    return records.map((r) => ({
      factor_id: r.factor.id,
      factor_key: r.factor.key,
      factor_name: r.factor.name,
      factor_category: r.factor.category as TemplateFactorAssignment['factor_category'],
      value: r.value as Record<string, unknown>,
    }));
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private validateCreateInput(dto: CreateFactorDto): void {
    if (!dto.key || dto.key.trim().length === 0) {
      throw new HttpException(
        {
          message: FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_KEY_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.key.length > 80) {
      throw new HttpException(
        {
          message: FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_KEY_TOO_LONG,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.name || dto.name.trim().length === 0) {
      throw new HttpException(
        {
          message: FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_NAME_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.name.length > 120) {
      throw new HttpException(
        {
          message: FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_NAME_TOO_LONG,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.category || !FACTOR_CONSTANTS.ALLOWED_CATEGORIES.includes(dto.category as typeof FACTOR_CONSTANTS.ALLOWED_CATEGORIES[number])) {
      throw new HttpException(
        {
          message: FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_CATEGORY_INVALID,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private isValidUuid(value: string): boolean {
    return isValidUuid(value);
  }

  private mapToFactorType(record: Factor): FactorType {
    return {
      factor_id: record.id,
      key: record.key,
      name: record.name,
      category: record.category as FactorType['category'],
      description: record.description ?? undefined,
      default_value: record.defaultValue as Record<string, unknown> | undefined,
      value_schema: record.valueSchema as Record<string, unknown> | undefined,
      sort_order: record.sortOrder,
      is_builtin: record.isBuiltin,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    };
  }
}
