// =============================================================================
// TikStream AI — Trend Tracker Repository
// =============================================================================

import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import { serviceException } from '../common/service-exception';

interface TrendSnapshotRow {
  id: string;
  productId: string;
  trendsJson: Prisma.JsonValue;
  recommendationsJson: Prisma.JsonValue;
  generatedBy: string;
  ttlSeconds: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTrendSnapshotParams {
  productId: string;
  trendsJson: Record<string, unknown>;
  recommendationsJson: Record<string, unknown>;
  ttlSeconds: number;
}

@Injectable()
export class TrendTrackerRepository {
  private readonly logger = new Logger(TrendTrackerRepository.name);

  constructor(
    @InjectPrisma() private readonly prisma: PrismaClient,
  ) {}

  /**
   * 查找指定商品的最新有效快照（未过期）
   */
  async findLatestValidSnapshot(
    productId: string,
  ): Promise<TrendSnapshotRow | null> {
    try {
      const snapshot = await this.prisma.trendSnapshot.findFirst({
        where: {
          productId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      return snapshot;
    } catch (error) {
      this.mapPrismaError(error);
    }
  }

  /**
   * 创建新的趋势快照
   */
  async createSnapshot(
    params: CreateTrendSnapshotParams,
  ): Promise<TrendSnapshotRow> {
    try {
      const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000);

      const snapshot = await this.prisma.trendSnapshot.create({
        data: {
          productId: params.productId,
          trendsJson: params.trendsJson as Prisma.InputJsonValue,
          recommendationsJson: params.recommendationsJson as Prisma.InputJsonValue,
          ttlSeconds: params.ttlSeconds,
          expiresAt,
        },
      });

      return snapshot;
    } catch (error) {
      this.mapPrismaError(error);
    }
  }

  /**
   * 删除过期的快照（可被定时任务调用清理）
   */
  async deleteExpiredSnapshots(): Promise<number> {
    try {
      const result = await this.prisma.trendSnapshot.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });
      return result.count;
    } catch (error) {
      this.mapPrismaError(error);
    }
  }

  // =========================================================================
  // Private: Error Mapping
  // =========================================================================

  private mapPrismaError(error: unknown): never {
    if (error instanceof Error) {
      const prismaError = error as Error & { code?: string };

      switch (prismaError.code) {
        case 'P1001':
          throw serviceException(
            {
              message: '数据库连接不可用，请稍后重试',
              error: {
                code: 'DATABASE_UNAVAILABLE',
                details: { prisma_code: prismaError.code },
                retryable: true,
              },
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        case 'P2002':
          throw serviceException(
            {
              message: '数据唯一约束冲突',
              error: {
                code: 'CONFLICT',
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
              message: '趋势快照数据不存在',
              error: {
                code: 'NOT_FOUND',
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
