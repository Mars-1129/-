// =============================================================================
// TikStream AI — Constraint Repository
// =============================================================================

import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { PrismaClient, Prisma, Constraint } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import { CreateConstraintDto } from './dto/create-constraint.dto';
import { UpdateConstraintDto } from './dto/update-constraint.dto';
import { CONSTRAINT_CONSTANTS } from './constraint.constants';
import { serviceException } from '../common/service-exception';

@Injectable()
export class ConstraintRepository {
  private readonly logger = new Logger(ConstraintRepository.name);

  constructor(@InjectPrisma() private prisma: PrismaClient) {}

  async seedBuiltinConstraints(): Promise<void> {
    const existingCount = await this.prisma.constraint.count({ where: { isBuiltin: true } });
    if (existingCount > 0) {
      this.logger.log(`Builtin constraints already seeded (${existingCount} present), skipping`);
      return;
    }

    const builtins: Array<{
      key: string;
      name: string;
      category: string;
      ruleType: 'HARD' | 'SOFT';
      ruleConfig: Prisma.InputJsonValue;
      description?: string;
      sortOrder: number;
    }> = [
      {
        key: 'no_competitor_logo', name: '禁止竞品logo', category: 'compliance', ruleType: 'HARD',
        ruleConfig: { check: 'visual_content', forbidden_items: ['竞品品牌名', '竞品logo', '竞品包装'], severity: 'block' },
        sortOrder: 1,
      },
      {
        key: 'cta_required', name: '必须包含CTA', category: 'compliance', ruleType: 'HARD',
        ruleConfig: { check: 'script_structure', required_phrases: ['点击', '购买', '下单', '关注', '了解更多'], min_occurrences: 1, severity: 'block' },
        sortOrder: 2,
      },
      {
        key: 'no_false_claims', name: '禁止虚假宣传', category: 'compliance', ruleType: 'HARD',
        ruleConfig: { check: 'voiceover_content', forbidden_patterns: ['绝对', '永远', '100%有效', '立竿见影', '永不'], severity: 'block' },
        sortOrder: 3,
      },
      {
        key: 'product_frontal_required', name: '产品正面展示', category: 'creative', ruleType: 'SOFT',
        ruleConfig: { check: 'visual_content', required_shots: ['产品正面特写', '产品使用场景'], min_duration_seconds: 3 },
        sortOrder: 5,
      },
      {
        key: 'brand_watermark', name: '品牌水印', category: 'branding', ruleType: 'SOFT',
        ruleConfig: { check: 'visual_content', watermark: { type: 'corner_overlay', position: 'bottom_right', opacity: 0.8 }, min_duration_seconds: 5 },
        sortOrder: 6,
      },
      {
        key: 'max_voiceover_speed', name: '旁白语速限制', category: 'compliance', ruleType: 'HARD',
        ruleConfig: { check: 'voiceover_content', max_chars_per_second: 6, rule: '每镜旁白文字不超过6字/秒' },
        sortOrder: 4,
      },
      {
        key: 'aspect_ratio_9_16', name: '竖屏9:16', category: 'platform', ruleType: 'HARD',
        ruleConfig: { check: 'config', aspect_ratio: '9:16', platforms: ['抖音', '快手', 'TikTok', 'Reels', 'Shorts'] },
        sortOrder: 7,
      },
      {
        key: 'bgm_must_not_override_voice', name: 'BGM不压旁白', category: 'creative', ruleType: 'SOFT',
        ruleConfig: { check: 'audio_mix', bgm_volume_ratio: 0.3, ducking_enabled: true },
        sortOrder: 8,
      },
    ];

    await this.prisma.$transaction(async (tx) => {
      for (const b of builtins) {
        await tx.constraint.upsert({
          where: { key: b.key },
          create: { ...b, isBuiltin: true },
          update: { name: b.name, category: b.category, ruleType: b.ruleType, ruleConfig: b.ruleConfig, description: b.description ?? null, sortOrder: b.sortOrder },
        });
      }
    });

    this.logger.log(`Seeded ${builtins.length} builtin constraints`);
  }

  async findAll(category?: string, ruleType?: string, keyword?: string): Promise<Constraint[]> {
    try {
      const where: Prisma.ConstraintWhereInput = {};
      if (category) {
        where.category = category;
      }
      if (ruleType) {
        where.ruleType = ruleType as Prisma.EnumConstraintRuleTypeFilter['equals'];
      }
      if (keyword) {
        where.OR = [
          { key: { contains: keyword, mode: 'insensitive' } },
          { name: { contains: keyword, mode: 'insensitive' } },
        ];
      }
      return await this.prisma.constraint.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      this.logger.error(`Failed to find all constraints: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findById(id: string): Promise<Constraint | null> {
    try {
      return await this.prisma.constraint.findUnique({ where: { id } });
    } catch (error) {
      this.logger.error(`Failed to find constraint by id: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findByKey(key: string): Promise<Constraint | null> {
    try {
      return await this.prisma.constraint.findUnique({ where: { key } });
    } catch (error) {
      this.logger.error(`Failed to find constraint by key: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async create(dto: CreateConstraintDto): Promise<Constraint> {
    try {
      return await this.prisma.constraint.create({
        data: {
          key: dto.key,
          name: dto.name,
          category: dto.category,
          ruleType: dto.rule_type,
          ruleConfig: dto.rule_config as Prisma.InputJsonValue,
          description: dto.description ?? null,
          sortOrder: dto.sort_order ?? 0,
          isBuiltin: false,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create constraint: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async update(id: string, dto: UpdateConstraintDto): Promise<Constraint> {
    try {
      const data: Prisma.ConstraintUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.category !== undefined) data.category = dto.category;
      if (dto.rule_type !== undefined) data.ruleType = dto.rule_type;
      if (dto.rule_config !== undefined) data.ruleConfig = dto.rule_config as Prisma.InputJsonValue;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.sort_order !== undefined) data.sortOrder = dto.sort_order;

      return await this.prisma.constraint.update({ where: { id }, data });
    } catch (error) {
      this.logger.error(`Failed to update constraint: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async delete(id: string): Promise<Constraint> {
    try {
      return await this.prisma.constraint.delete({ where: { id } });
    } catch (error) {
      this.logger.error(`Failed to delete constraint: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async assignToTemplate(templateId: string, constraintIds: string[]): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.templateConstraint.deleteMany({ where: { templateId } });
        if (constraintIds.length > 0) {
          await tx.templateConstraint.createMany({
            data: constraintIds.map((constraintId) => ({ templateId, constraintId })),
          });
        }
      });
    } catch (error) {
      this.logger.error(`Failed to assign constraints to template: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async getTemplateConstraints(
    templateId: string,
  ): Promise<Array<{ constraint: Constraint }>> {
    try {
      const links = await this.prisma.templateConstraint.findMany({
        where: { templateId },
        include: { constraint: true },
        orderBy: { constraint: { sortOrder: 'asc' } },
      });
      return links.map((link) => ({ constraint: link.constraint }));
    } catch (error) {
      this.logger.error(`Failed to get template constraints: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private mapPrismaError(error: unknown): never {
    if (error instanceof Error) {
      const prismaError = error as Error & { code?: string; meta?: Record<string, unknown> };

      switch (prismaError.code) {
        case 'P1001':
          throw serviceException(
            {
              message: '数据库连接失败',
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                details: { prisma_code: prismaError.code },
                retryable: true,
              },
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        case 'P2002':
          throw serviceException(
            {
              message: CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_KEY_DUPLICATE,
              error: {
                code: 'CONSTRAINT_KEY_DUPLICATE',
                details: { prisma_code: prismaError.code },
                retryable: false,
              },
            },
            HttpStatus.CONFLICT,
          );
        case 'P2003':
          throw serviceException(
            {
              message: '关联数据不存在',
              error: {
                code: 'FOREIGN_KEY_CONSTRAINT',
                details: { prisma_code: prismaError.code },
                retryable: false,
              },
            },
            HttpStatus.NOT_FOUND,
          );
        case 'P2025':
          throw serviceException(
            {
              message: CONSTRAINT_CONSTANTS.ERROR_MESSAGES.CONSTRAINT_NOT_FOUND,
              error: {
                code: 'CONSTRAINT_NOT_FOUND',
                details: { prisma_code: prismaError.code },
                retryable: false,
              },
            },
            HttpStatus.NOT_FOUND,
          );
        default:
          throw serviceException(
            {
              message: `数据库操作失败: ${prismaError.message}`,
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                details: { prisma_code: prismaError.code, prisma_message: prismaError.message },
                retryable: true,
              },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
      }
    }
    throw serviceException(
      {
        message: '未知数据库错误',
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          details: { original_error: String(error) },
          retryable: true,
        },
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
