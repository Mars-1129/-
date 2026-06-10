// =============================================================================
// TikStream AI — Viral Video Analysis Repository
// =============================================================================

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { serviceException } from '../common/service-exception';
import { PrismaClient, ViralVideoAnalysis, Prisma } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';

export interface CreateViralAnalysisParams {
  sourcePlatform: string;
  sourceUrl: string;
  externalVideoId: string;
  productId?: string | null;
  declaredPublicSource?: boolean;
  initialReportJson?: Record<string, unknown>;
  initialSellingPoints?: unknown[];
  initialShotsDecomposition?: unknown[];
}

export interface SearchViralAnalysisParams {
  keyword?: string;
  category?: string;
  sourcePlatform?: string;
  productId?: string;
  page?: number;
  pageSize?: number;
}

export interface UpdateViralAnalysisParams {
  title?: string;
  hookType?: string;
  strategyJson?: Record<string, unknown>;
  factorJson?: Record<string, unknown>;
  reportJson?: Record<string, unknown>;
  sellingPoints?: unknown[];
  shotsDecomposition?: unknown[];
}

@Injectable()
export class ViralAnalysisRepository {
  private readonly logger = new Logger(ViralAnalysisRepository.name);

  constructor(@InjectPrisma() private prisma: PrismaClient) {}

  async createViralAnalysis(params: CreateViralAnalysisParams): Promise<ViralVideoAnalysis> {
    try {
      return await this.prisma.viralVideoAnalysis.create({
        data: {
          sourcePlatform: params.sourcePlatform,
          sourceUrl: params.sourceUrl,
          externalVideoId: params.externalVideoId,
          productId: params.productId || null,
          declaredPublicSource: params.declaredPublicSource ?? true,
          strategyJson: {},
          factorJson: {},
          reportJson: params.initialReportJson as Prisma.InputJsonValue || {},
          sellingPoints: (params.initialSellingPoints as Prisma.InputJsonValue) || undefined,
          shotsDecomposition: (params.initialShotsDecomposition as Prisma.InputJsonValue) || undefined,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create viral analysis: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findViralAnalysisById(analysisId: string): Promise<ViralVideoAnalysis | null> {
    try {
      return await this.prisma.viralVideoAnalysis.findUnique({
        where: { id: analysisId },
      });
    } catch (error) {
      this.logger.error(`Failed to find viral analysis by id: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findViralAnalysesByIds(analysisIds: string[]): Promise<ViralVideoAnalysis[]> {
    // 守卫：过滤无效 ID 和空数组，避免不必要的数据库查询
    const validIds = analysisIds.filter((id) => id && id.trim().length > 0);
    if (validIds.length === 0) return [];

    try {
      return await this.prisma.viralVideoAnalysis.findMany({
        where: { id: { in: validIds } },
      });
    } catch (error) {
      this.logger.error(`Failed to find viral analyses by ids: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findViralAnalysesByProductId(productId: string): Promise<ViralVideoAnalysis[]> {
    try {
      return await this.prisma.viralVideoAnalysis.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(`Failed to find viral analyses by productId: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async countViralAnalysesByProductId(productId: string): Promise<number> {
    try {
      return await this.prisma.viralVideoAnalysis.count({
        where: { productId },
      });
    } catch (error) {
      this.logger.error(`Failed to count viral analyses by productId: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findByCategory(
    category: string,
    limit = 100,
  ): Promise<ViralVideoAnalysis[]> {
    try {
      return await this.prisma.viralVideoAnalysis.findMany({
        where: {
          product: { category },
        },
        include: { product: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (error) {
      this.logger.error(`Failed to find viral analyses by category: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async countByCategory(category: string): Promise<number> {
    try {
      return await this.prisma.viralVideoAnalysis.count({
        where: {
          product: { category },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to count viral analyses by category: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findBestViralAnalysisByProduct(productId: string): Promise<ViralVideoAnalysis | null> {
    if (!productId || productId.trim().length === 0) return null;

    try {
      // 1. 精确匹配同商品
      let record = await this.prisma.viralVideoAnalysis.findFirst({
        where: { productId },
        orderBy: { createdAt: 'desc' },
      });

      if (record) return record;

      // 2. 降级：按 Product 的 category 匹配同品类爆款
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { category: true, title: true },
      });

      if (product?.category) {
        record = await this.prisma.viralVideoAnalysis.findFirst({
          where: {
            product: { category: product.category },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (record) return record;
      }

      // 3. 降级：按商品标题关键词模糊匹配
      if (product?.title && product.title.trim().length > 0) {
        const keywords = product.title
          .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
          .split(/\s+/)
          .filter((k) => k.length >= 2)
          .slice(0, 3);

        if (keywords.length > 0) {
          record = await this.prisma.viralVideoAnalysis.findFirst({
            where: {
              OR: keywords.flatMap((kw) => [
                { title: { contains: kw } },
                // 同时匹配关联商品的标题（通过 product 关系），增加命中概率
                { product: { title: { contains: kw } } },
              ]),
            },
            orderBy: { createdAt: 'desc' },
          });

          if (record) return record;
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to find best viral analysis: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async searchViralAnalyses(
    params: SearchViralAnalysisParams,
  ): Promise<{ items: ViralVideoAnalysis[]; total: number }> {
    try {
      const { keyword, category, sourcePlatform, productId, page = 1, pageSize = 20 } = params;

      const where: Prisma.ViralVideoAnalysisWhereInput = {};

      if (keyword && keyword.trim().length >= 2) {
        where.title = { contains: keyword.trim(), mode: 'insensitive' };
      }

      if (category) {
        where.product = { category };
      }

      if (sourcePlatform) {
        where.sourcePlatform = sourcePlatform;
      }

      if (productId) {
        where.productId = productId;
      }

      const [items, total] = await Promise.all([
        this.prisma.viralVideoAnalysis.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.viralVideoAnalysis.count({ where }),
      ]);

      return { items, total };
    } catch (error) {
      this.logger.error(`Failed to search viral analyses: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async updateViralAnalysis(
    analysisId: string,
    data: UpdateViralAnalysisParams,
  ): Promise<ViralVideoAnalysis> {
    try {
      const updateData: Prisma.ViralVideoAnalysisUpdateInput = {};

      if (data.title !== undefined) updateData.title = data.title;
      if (data.hookType !== undefined) updateData.hookType = data.hookType;
      if (data.strategyJson !== undefined) updateData.strategyJson = data.strategyJson as Prisma.InputJsonValue;
      if (data.factorJson !== undefined) updateData.factorJson = data.factorJson as Prisma.InputJsonValue;
      if (data.reportJson !== undefined) updateData.reportJson = data.reportJson as Prisma.InputJsonValue;
      if (data.sellingPoints !== undefined) updateData.sellingPoints = data.sellingPoints as Prisma.InputJsonValue;
      if (data.shotsDecomposition !== undefined) updateData.shotsDecomposition = data.shotsDecomposition as Prisma.InputJsonValue;

      return await this.prisma.viralVideoAnalysis.update({
        where: { id: analysisId },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(`Failed to update viral analysis: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findDuplicateByFingerprint(
    fingerprint: string,
    excludeId?: string,
  ): Promise<ViralVideoAnalysis | null> {
    try {
      const where: Prisma.ViralVideoAnalysisWhereInput = {
        reportJson: {
          path: ['content_fingerprint'],
          equals: fingerprint,
        },
      };

      if (excludeId) {
        where.id = { not: excludeId };
      }

      return await this.prisma.viralVideoAnalysis.findFirst({ where });
    } catch (error) {
      this.logger.error(`Failed to find duplicate by fingerprint: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findMaterialById(materialId: string): Promise<{
    type: string;
    productId: string;
    originUrl: string;
    thumbnailUrl: string | null;
  } | null> {
    try {
      return await this.prisma.material.findUnique({
        where: { id: materialId },
        select: {
          type: true,
          productId: true,
          originUrl: true,
          thumbnailUrl: true,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to find material by id: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findProductContextById(productId: string): Promise<{
    category: string;
    title: string;
  } | null> {
    try {
      return await this.prisma.product.findUnique({
        where: { id: productId },
        select: { category: true, title: true },
      });
    } catch (error) {
      this.logger.error(`Failed to find product by id: ${error}`);
      throw this.mapPrismaError(error);
    }
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
              message: '该平台下的同源视频已存在拆解记录',
              error: { code: 'VIRAL_ANALYSIS_DUPLICATE', details: { prisma_code: prismaError.code }, retryable: false },
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
              message: '爆款视频分析记录不存在',
              error: { code: 'VIRAL_VIDEO_ANALYSIS_NOT_FOUND', details: { prisma_code: prismaError.code }, retryable: false },
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
