// =============================================================================
// TikStream AI — Strategy Repository
// =============================================================================

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { serviceException } from '../common/service-exception';
import { PrismaClient, Prisma, Strategy } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import { STRATEGY_CONSTANTS } from './strategy.constants';

export interface CreateStrategyParams {
  key: string;
  name: string;
  category: string;
  description?: string;
  summary: string;
  summaryJson?: Record<string, unknown>;
  sortOrder?: number;
}

export interface UpdateStrategyParams {
  key?: string;
  name?: string;
  category?: string;
  description?: string;
  summary?: string;
  summaryJson?: Record<string, unknown>;
  sortOrder?: number;
}

@Injectable()
export class StrategyRepository {
  private readonly logger = new Logger(StrategyRepository.name);

  constructor(@InjectPrisma() private prisma: PrismaClient) {}

  async seedBuiltinStrategies(): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const existingCount = await tx.strategy.count({
          where: { isBuiltin: true },
        });

        if (existingCount > 0) {
          this.logger.log(`Builtin strategies already seeded (${existingCount} found), skipping.`);
          return;
        }

        this.logger.log('Seeding builtin strategies...');

        const builtinStrategies = STRATEGY_CONSTANTS.BUILTIN_STRATEGY_KEYS.map((key, index) => ({
          key,
          name: this.getBuiltinStrategyName(key),
          category: this.getBuiltinStrategyCategory(key),
          summary: this.getBuiltinStrategySummary(key),
          summaryJson: Prisma.JsonNull,
          sortOrder: index + 1,
          isBuiltin: true,
        }));

        await tx.strategy.createMany({
          data: builtinStrategies as Prisma.StrategyCreateManyInput[],
        });

        this.logger.log(`Seeded ${builtinStrategies.length} builtin strategies successfully.`);
      });
    } catch (error) {
      this.logger.error(`Failed to seed builtin strategies: ${error}`);
      throw error;
    }
  }

  private getBuiltinStrategyName(key: string): string {
    const names: Record<string, string> = {
      first_person_immersion: '第一人称沉浸式',
      suspense_reveal: '悬念揭示式',
      rapid_cut_sensory: '快速剪辑感官冲击',
      storytelling_journey: '故事化旅程',
      urgency_conversion: '紧迫感转化',
    };
    return names[key] ?? key;
  }

  private getBuiltinStrategyCategory(key: string): string {
    const categories: Record<string, string> = {
      first_person_immersion: 'creative',
      suspense_reveal: 'creative',
      rapid_cut_sensory: 'creative',
      storytelling_journey: 'narrative',
      urgency_conversion: 'conversion',
    };
    return categories[key] ?? 'creative';
  }

  private getBuiltinStrategySummary(key: string): string {
    const summaries: Record<string, string> = {
      first_person_immersion: '以第一人称视角呈现产品使用场景，增强代入感与信任度',
      suspense_reveal: '通过制造悬念逐步揭示产品功能，提高观看完播率',
      rapid_cut_sensory: '快节奏剪辑配合强感官刺激，适配短视频平台的注意力竞争',
      storytelling_journey: '将产品卖点融入完整叙事弧线，建立情感连接',
      urgency_conversion: '通过限时、限量等紧迫感元素驱动即时转化行为',
    };
    return summaries[key] ?? '';
  }

  async findAll(category?: string, keyword?: string): Promise<Strategy[]> {
    try {
      const where: Prisma.StrategyWhereInput = {};
      if (category) {
        where.category = category;
      }
      if (keyword) {
        where.OR = [
          { key: { contains: keyword, mode: 'insensitive' } },
          { name: { contains: keyword, mode: 'insensitive' } },
        ];
      }
      return await this.prisma.strategy.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      this.logger.error(`Failed to find all strategies: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findById(id: string): Promise<Strategy | null> {
    try {
      return await this.prisma.strategy.findUnique({ where: { id } });
    } catch (error) {
      this.logger.error(`Failed to find strategy by id: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findByKey(key: string): Promise<Strategy | null> {
    try {
      return await this.prisma.strategy.findUnique({ where: { key } });
    } catch (error) {
      this.logger.error(`Failed to find strategy by key: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async create(params: CreateStrategyParams): Promise<Strategy> {
    try {
      return await this.prisma.strategy.create({
        data: {
          key: params.key,
          name: params.name,
          category: params.category,
          description: params.description ?? null,
          summary: params.summary,
          summaryJson: (params.summaryJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          sortOrder: params.sortOrder ?? 0,
          isBuiltin: false,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create strategy: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async update(id: string, params: UpdateStrategyParams): Promise<Strategy> {
    try {
      const data: Prisma.StrategyUpdateInput = {};
      if (params.key !== undefined) data.key = params.key;
      if (params.name !== undefined) data.name = params.name;
      if (params.category !== undefined) data.category = params.category;
      if (params.description !== undefined) data.description = params.description;
      if (params.summary !== undefined) data.summary = params.summary;
      if (params.summaryJson !== undefined) data.summaryJson = params.summaryJson as Prisma.InputJsonValue;
      if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;

      return await this.prisma.strategy.update({ where: { id }, data });
    } catch (error) {
      this.logger.error(`Failed to update strategy: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async delete(id: string): Promise<Strategy> {
    try {
      return await this.prisma.strategy.delete({ where: { id } });
    } catch (error) {
      this.logger.error(`Failed to delete strategy: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async assignToTemplate(templateId: string, strategyIds: string[]): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.templateStrategy.deleteMany({ where: { templateId } });
        if (strategyIds.length > 0) {
          await tx.templateStrategy.createMany({
            data: strategyIds.map((strategyId) => ({ templateId, strategyId })),
          });
        }
      });
    } catch (error) {
      this.logger.error(`Failed to assign strategies to template: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async getTemplateStrategies(
    templateId: string,
  ): Promise<Array<{ strategy: Strategy }>> {
    try {
      const links = await this.prisma.templateStrategy.findMany({
        where: { templateId },
        include: { strategy: true },
        orderBy: { strategy: { sortOrder: 'asc' } },
      });
      return links.map((link) => ({ strategy: link.strategy }));
    } catch (error) {
      this.logger.error(`Failed to get template strategies: ${error}`);
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
              error: { code: 'INTERNAL_SERVER_ERROR', details: { prisma_code: prismaError.code }, retryable: true },
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        case 'P2002':
          throw serviceException(
            {
              message: STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_KEY_DUPLICATE,
              error: { code: 'STRATEGY_KEY_DUPLICATE', details: { prisma_code: prismaError.code }, retryable: false },
            },
            HttpStatus.CONFLICT,
          );
        case 'P2003':
          throw serviceException(
            {
              message: '关联数据不存在',
              error: { code: 'FOREIGN_KEY_CONSTRAINT', details: { prisma_code: prismaError.code }, retryable: false },
            },
            HttpStatus.NOT_FOUND,
          );
        case 'P2025':
          throw serviceException(
            {
              message: STRATEGY_CONSTANTS.ERROR_MESSAGES.STRATEGY_NOT_FOUND,
              error: { code: 'STRATEGY_NOT_FOUND', details: { prisma_code: prismaError.code }, retryable: false },
            },
            HttpStatus.NOT_FOUND,
          );
        default:
          throw serviceException(
            {
              message: `数据库操作失败: ${prismaError.message}`,
              error: { code: 'INTERNAL_SERVER_ERROR', details: { prisma_code: prismaError.code, prisma_message: prismaError.message }, retryable: true },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
      }
    }
    throw serviceException(
      {
        message: '未知数据库错误',
        error: { code: 'INTERNAL_SERVER_ERROR', details: { original_error: String(error) }, retryable: true },
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
