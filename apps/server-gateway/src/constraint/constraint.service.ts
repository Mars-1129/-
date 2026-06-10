// =============================================================================
// TikStream AI — Constraint Service
// =============================================================================

import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { Constraint as PrismaConstraint } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import { ConstraintRepository } from './constraint.repository';
import { CreateConstraintDto } from './dto/create-constraint.dto';
import { UpdateConstraintDto } from './dto/update-constraint.dto';
import { CONSTRAINT_CONSTANTS } from './constraint.constants';
import { isValidUuid } from '../common/validators';
import type { Constraint } from '@tikstream/shared-types';

@Injectable()
export class ConstraintService implements OnModuleInit {
  private readonly logger = new Logger(ConstraintService.name);

  constructor(
    private readonly repository: ConstraintRepository,
    @InjectPrisma() private readonly prisma: PrismaClient,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('ConstraintService initialized, seeding builtin constraints...');
    try {
      await this.repository.seedBuiltinConstraints();
    } catch (error) {
      this.logger.warn(`Failed to seed builtin constraints: ${(error as Error)?.message || String(error)}`);
    }
  }

  // ===========================================================================
  // Constraint CRUD
  // ===========================================================================

  /**
   * 将 Prisma camelCase 约束对象映射为前端期望的 snake_case 格式
   */
  private mapConstraintToApi(c: PrismaConstraint): Constraint {
    return {
      constraint_id: c.id,
      key: c.key,
      name: c.name,
      description: c.description ?? undefined,
      category: c.category,
      rule_type: c.ruleType,
      rule_config: c.ruleConfig as Record<string, unknown>,
      is_builtin: c.isBuiltin,
      sort_order: c.sortOrder,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt.toISOString(),
    };
  }

  async listConstraints(category?: string, ruleType?: string, keyword?: string): Promise<Constraint[]> {
    this.logger.log(`Listing constraints: category=${category}, ruleType=${ruleType}, keyword=${keyword}`);

    if (category && !CONSTRAINT_CONSTANTS.ALLOWED_CATEGORIES.includes(category as typeof CONSTRAINT_CONSTANTS.ALLOWED_CATEGORIES[number])) {
      throw new HttpException(
        {
          message: `${CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CATEGORY_INVALID}: "${category}"`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (ruleType && !CONSTRAINT_CONSTANTS.ALLOWED_RULE_TYPES.includes(ruleType as typeof CONSTRAINT_CONSTANTS.ALLOWED_RULE_TYPES[number])) {
      throw new HttpException(
        {
          message: `${CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_RULE_TYPE_INVALID}: "${ruleType}"`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const records = await this.repository.findAll(category, ruleType, keyword);
    return records.map((c) => this.mapConstraintToApi(c));
  }

  async getConstraint(id: string): Promise<Constraint> {
    this.logger.log(`Getting constraint: id=${id}`);

    if (!this.isValidUuid(id)) {
      throw new HttpException(
        {
          message: `无效的约束 ID: ${id}`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const record = await this.repository.findById(id);
    if (!record) {
      throw new HttpException(
        {
          message: `${CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_NOT_FOUND}: ${id}`,
          error: { code: 'CONSTRAINT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return this.mapConstraintToApi(record);
  }

  async createConstraint(dto: CreateConstraintDto): Promise<Constraint> {
    this.logger.log(`Creating constraint: key=${dto.key}, name=${dto.name}`);

    this.validateCreateInput(dto);

    const existing = await this.repository.findByKey(dto.key);
    if (existing) {
      throw new HttpException(
        {
          message: `${CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_KEY_DUPLICATE}: ${dto.key}`,
          error: { code: 'CONSTRAINT_KEY_DUPLICATE', retryable: false },
        },
        HttpStatus.CONFLICT,
      );
    }

    const record = await this.repository.create(dto);
    this.logger.log(`Constraint created: id=${record.id}`);
    return this.mapConstraintToApi(record);
  }

  async updateConstraint(id: string, dto: UpdateConstraintDto): Promise<Constraint> {
    this.logger.log(`Updating constraint: id=${id}`);

    if (!id || id.trim().length === 0) {
      throw new HttpException(
        {
          message: '约束 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new HttpException(
        {
          message: `${CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_NOT_FOUND}: ${id}`,
          error: { code: 'CONSTRAINT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (existing.isBuiltin) {
      throw new HttpException(
        {
          message: CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_IS_BUILTIN,
          error: { code: 'CONSTRAINT_IS_BUILTIN', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (dto.category && !CONSTRAINT_CONSTANTS.ALLOWED_CATEGORIES.includes(dto.category as typeof CONSTRAINT_CONSTANTS.ALLOWED_CATEGORIES[number])) {
      throw new HttpException(
        {
          message: `${CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CATEGORY_INVALID}: "${dto.category}"`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.rule_type && !CONSTRAINT_CONSTANTS.ALLOWED_RULE_TYPES.includes(dto.rule_type as typeof CONSTRAINT_CONSTANTS.ALLOWED_RULE_TYPES[number])) {
      throw new HttpException(
        {
          message: `${CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_RULE_TYPE_INVALID}: "${dto.rule_type}"`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.repository.update(id, dto);
    this.logger.log(`Constraint updated: id=${updated.id}`);
    return this.mapConstraintToApi(updated);
  }

  async deleteConstraint(id: string): Promise<{ constraint_id: string; deleted: boolean }> {
    this.logger.log(`Deleting constraint: id=${id}`);

    if (!id || id.trim().length === 0) {
      throw new HttpException(
        {
          message: '约束 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new HttpException(
        {
          message: `${CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_NOT_FOUND}: ${id}`,
          error: { code: 'CONSTRAINT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (existing.isBuiltin) {
      throw new HttpException(
        {
          message: CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_IS_BUILTIN,
          error: { code: 'CONSTRAINT_IS_BUILTIN', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.repository.delete(id);
    this.logger.log(`Constraint deleted: id=${id}`);
    return { constraint_id: id, deleted: true };
  }

  // ===========================================================================
  // Template-Constraint Assignment
  // ===========================================================================

  async assignTemplateConstraints(
    templateId: string,
    constraintIds: string[],
  ): Promise<void> {
    this.logger.log(`Assigning constraints to template: templateId=${templateId}, count=${constraintIds.length}`);

    if (!templateId || templateId.trim().length === 0) {
      throw new HttpException(
        {
          message: '模板 ID 为必填字段',
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

    await this.repository.assignToTemplate(templateId, constraintIds);
    this.logger.log(`Constraints assigned to template: templateId=${templateId}, count=${constraintIds.length}`);
  }

  async getTemplateConstraints(templateId: string): Promise<Constraint[]> {
    this.logger.log(`Getting template constraints: templateId=${templateId}`);

    if (!templateId || templateId.trim().length === 0) {
      throw new HttpException(
        {
          message: '模板 ID 为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const records = await this.repository.getTemplateConstraints(templateId);
    return records.map((r) => this.mapConstraintToApi(r.constraint));
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private validateCreateInput(dto: CreateConstraintDto): void {
    if (!dto.key || dto.key.trim().length === 0) {
      throw new HttpException(
        {
          message: CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_KEY_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.key.length > 80) {
      throw new HttpException(
        {
          message: '约束 key 长度超出上限 80',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.name || dto.name.trim().length === 0) {
      throw new HttpException(
        {
          message: CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_NAME_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.name.length > 120) {
      throw new HttpException(
        {
          message: '约束名称长度超出上限 120',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.category || !CONSTRAINT_CONSTANTS.ALLOWED_CATEGORIES.includes(dto.category as typeof CONSTRAINT_CONSTANTS.ALLOWED_CATEGORIES[number])) {
      throw new HttpException(
        {
          message: CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CATEGORY_INVALID,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.rule_type || !CONSTRAINT_CONSTANTS.ALLOWED_RULE_TYPES.includes(dto.rule_type as typeof CONSTRAINT_CONSTANTS.ALLOWED_RULE_TYPES[number])) {
      throw new HttpException(
        {
          message: CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_RULE_TYPE_INVALID,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.rule_config) {
      throw new HttpException(
        {
          message: CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_RULE_CONFIG_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private isValidUuid(value: string): boolean {
    return isValidUuid(value);
  }
}
