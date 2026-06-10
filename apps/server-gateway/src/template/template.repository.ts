// =============================================================================
// TikStream AI — Template Repository
// =============================================================================

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { serviceException } from '../common/service-exception';
import { Prisma, PrismaClient, Template, TemplateStatus } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';

export interface CreateTemplateParams {
  name: string;
  category: string;
  strategySummary: string;
  factorJson: Record<string, unknown>;
  schemaJson?: Record<string, unknown> | null;
  productId?: string | null;
  source?: string;
  status?: string;
}

export interface UpdateTemplateData {
  name?: string;
  category?: string;
  strategySummary?: string;
  factorJson?: Record<string, unknown>;
  schemaJson?: Record<string, unknown> | null;
  status?: string;
}

export interface TemplateListParams {
  page: number;
  pageSize: number;
  category?: string;
  status?: string;
  keyword?: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface TemplateWithItemCount {
  items: Template[];
  total: number;
}

@Injectable()
export class TemplateRepository {
  private readonly logger = new Logger(TemplateRepository.name);

  constructor(@InjectPrisma() private prisma: PrismaClient) {}

  async createTemplate(params: CreateTemplateParams): Promise<Template> {
    try {
      return await this.prisma.template.create({
        data: {
          productId: params.productId || null,
          name: params.name,
          category: params.category,
          strategySummary: params.strategySummary,
          factorJson: params.factorJson as Prisma.InputJsonValue,
          schemaJson: this.toNullableJson(params.schemaJson),
          source: params.source || 'MANUAL',
          status: this.mapTemplateStatus(params.status),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create template: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  /**
   * 原子性创建模板（事务内完成名称查重 + 写入），消除并发竞态。
   */
  async createTemplateAtomic(params: CreateTemplateParams): Promise<Template> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.template.findFirst({
        where: { name: params.name },
        select: { id: true },
      });
      if (existing) {
        throw Object.assign(
          new Error(`模板名称 "${params.name}" 已存在`),
          { code: 'TEMPLATE_NAME_DUPLICATE', existing_id: existing.id },
        );
      }
      return tx.template.create({
        data: {
          productId: params.productId || null,
          name: params.name,
          category: params.category,
          strategySummary: params.strategySummary,
          factorJson: params.factorJson as Prisma.InputJsonValue,
          schemaJson: this.toNullableJson(params.schemaJson),
          source: params.source || 'MANUAL',
          status: this.mapTemplateStatus(params.status),
        },
      });
    });
  }

  async findTemplateByName(name: string): Promise<Pick<Template, 'id' | 'name'> | null> {
    try {
      return await this.prisma.template.findFirst({
        where: { name },
        select: { id: true, name: true },
      });
    } catch (error) {
      this.logger.error(`Failed to find template by name: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findTemplateById(templateId: string): Promise<Template | null> {
    try {
      return await this.prisma.template.findUnique({
        where: { id: templateId },
        include: { templateViralVideos: { include: { analysis: true } } },
      });
    } catch (error) {
      this.logger.error(`Failed to find template by id: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findTemplatesPaginated(params: TemplateListParams): Promise<TemplateWithItemCount> {
    try {
      const where: Prisma.TemplateWhereInput = {};
      if (params.category) {
        where.category = params.category;
      }
      if (params.status) {
        where.status = this.mapTemplateStatus(params.status);
      }
      if (params.keyword) {
        where.name = { startsWith: params.keyword, mode: 'insensitive' };
      }

      const orderBy = this.buildOrderBy(params.sortBy, params.sortOrder);

      const [items, total] = await this.prisma.$transaction([
        this.prisma.template.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
        }),
        this.prisma.template.count({ where }),
      ]);

      return { items, total };
    } catch (error) {
      this.logger.error(`Failed to find templates paginated: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  private buildOrderBy(
    sortBy?: string,
    sortOrder?: string,
  ): Prisma.TemplateOrderByWithRelationInput {
    const direction = sortOrder === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
      case 'name':
        return { name: direction };
      case 'updatedAt':
        return { updatedAt: direction };
      case 'createdAt':
      default:
        return { createdAt: direction };
    }
  }

  async updateTemplate(templateId: string, data: UpdateTemplateData): Promise<Template> {
    try {
      return await this.prisma.template.update({
        where: { id: templateId },
        data: this.toTemplateUpdateInput(data),
      });
    } catch (error) {
      this.logger.error(`Failed to update template: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async deleteTemplate(templateId: string): Promise<Template> {
    try {
      return await this.prisma.template.delete({
        where: { id: templateId },
      });
    } catch (error) {
      this.logger.error(`Failed to delete template: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async countTemplatesByProductId(productId: string): Promise<number> {
    try {
      return await this.prisma.template.count({
        where: { productId },
      });
    } catch (error) {
      this.logger.error(`Failed to count templates by productId: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async createTemplateViralLinks(
    templateId: string,
    analysisIds: string[],
  ): Promise<number> {
    try {
      const data = analysisIds.map((analysisId) => ({
        templateId,
        analysisId,
      }));
      const result = await this.prisma.templateViralVideo.createMany({
        data,
        skipDuplicates: true,
      });

      if (result.count !== analysisIds.length) {
        this.logger.warn(
          `Template viral links partially created: expected ${analysisIds.length}, created ${result.count} (some may be duplicates)`,
        );
      }

      return result.count;
    } catch (error) {
      this.logger.error(`Failed to create template viral links: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findTemplatesWithViralLinks(templateId: string): Promise<Array<{
    analysis: { id: string; sourcePlatform: string; sourceUrl: string; title: string | null; hookType: string | null };
  }>> {
    try {
      const links = await this.prisma.templateViralVideo.findMany({
        where: { templateId },
        include: {
          analysis: {
            select: {
              id: true,
              sourcePlatform: true,
              sourceUrl: true,
              title: true,
              hookType: true,
            },
          },
        },
      });
      return links.map((link) => ({
        analysis: {
          id: link.analysis.id,
          sourcePlatform: link.analysis.sourcePlatform,
          sourceUrl: link.analysis.sourceUrl,
          title: link.analysis.title,
          hookType: link.analysis.hookType,
        },
      }));
    } catch (error) {
      this.logger.error(`Failed to find template viral links: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  private toTemplateUpdateInput(data: UpdateTemplateData): Prisma.TemplateUpdateInput {
    const updateInput: Prisma.TemplateUpdateInput = {};

    if (data.name !== undefined) {
      updateInput.name = data.name;
    }
    if (data.category !== undefined) {
      updateInput.category = data.category;
    }
    if (data.strategySummary !== undefined) {
      updateInput.strategySummary = data.strategySummary;
    }
    if (data.factorJson !== undefined) {
      updateInput.factorJson = data.factorJson as Prisma.InputJsonValue;
    }
    if (data.schemaJson !== undefined) {
      updateInput.schemaJson = this.toNullableJson(data.schemaJson);
    }
    if (data.status !== undefined) {
      updateInput.status = this.mapTemplateStatus(data.status);
    }

    return updateInput;
  }

  private toNullableJson(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return Prisma.DbNull;
    }
    return value as Prisma.InputJsonValue;
  }

  private mapTemplateStatus(status: string | undefined): TemplateStatus {
    if (status === undefined) {
      return TemplateStatus.ACTIVE;
    }
    if (status === TemplateStatus.ACTIVE) {
      return TemplateStatus.ACTIVE;
    }
    if (status === TemplateStatus.INACTIVE) {
      return TemplateStatus.INACTIVE;
    }
    if (status === TemplateStatus.ARCHIVED) {
      return TemplateStatus.ARCHIVED;
    }
    this.logger.warn(`mapTemplateStatus 收到未知状态值: "${status}"，已拒绝映射`);
    throw Object.assign(
      new Error(`无效的模板状态: ${status}`),
      { code: 'TEMPLATE_STATUS_INVALID' },
    );
  }

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
              message: '模板名称已存在',
              error: { code: 'TEMPLATE_NAME_DUPLICATE', details: { prisma_code: prismaError.code }, retryable: false },
            },
            HttpStatus.CONFLICT,
          );
        case 'P2003':
          throw serviceException(
            {
              message: '关联商品不存在',
              error: { code: 'PRODUCT_NOT_FOUND', details: { prisma_code: prismaError.code }, retryable: false },
            },
            HttpStatus.NOT_FOUND,
          );
        case 'P2025':
          throw serviceException(
            {
              message: '模板不存在',
              error: { code: 'TEMPLATE_NOT_FOUND', details: { prisma_code: prismaError.code }, retryable: false },
            },
            HttpStatus.NOT_FOUND,
          );
        case 'P1008':
          throw serviceException(
            {
              message: '数据库查询超时',
              error: { code: 'INTERNAL_SERVER_ERROR', details: { prisma_code: prismaError.code }, retryable: true },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        case 'P2024':
          throw serviceException(
            {
              message: '数据库连接池耗尽',
              error: { code: 'INTERNAL_SERVER_ERROR', details: { prisma_code: prismaError.code }, retryable: true },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
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
