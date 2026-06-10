// =============================================================================
// TikStream AI — Analytics Repository
// 数据访问层: 查询 Creation + Script + ScriptShot 嵌套结构
// 七层 Prisma 异常分类映射
// =============================================================================

import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import {
  Creation,
  CreationStage,
  CreationStatus,
  EngineMode,
  PrismaClient,
  Prisma,
} from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import { ANALYTICS_CONSTANTS } from './analytics.constants';
import { serviceException } from '../common/service-exception';

export interface CreationRecord {
  id: string;
  productId: string;
  scriptId: string;
  taskId: string;
  engineMode: EngineMode;
  targetResolution: string;
  exportFormat: string;
  status: CreationStatus;
  progress: number;
  currentStage: CreationStage;
  videoUrl: string | null;
  fileSizeBytes: bigint | null;
  traceId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  script: {
    id: string;
    productId: string;
    title: string | null;
    language: string;
    targetAudience: string | null;
    videoDuration: number;
    aspectRatio: string;
    styleVibe: string;
    generationMode: string;
    templateId: string | null;
    viralVideoId: string | null;
    constraintList: unknown;
    rawJson: unknown;
    createdAt: Date;
    updatedAt: Date;
    shots: Array<{
      id: string;
      scriptId: string;
      shotId: string | null;
      shotIndex: number;
      duration: number;
      sceneDescriptionQuery: string;
      visualDescription: string;
      cameraMovement: string;
      transitionType: string;
      voiceoverText: string;
      subtitleText: string;
      safeZoneBoundingBox: unknown;
      selectedSliceId: string | null;
      renderPrompt: string | null;
      localFactorPatch: unknown;
      complianceStatus: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
  };
}

@Injectable()
export class AnalyticsRepository {
  private readonly logger = new Logger(AnalyticsRepository.name);

  constructor(@InjectPrisma() private prisma: PrismaClient) {}

  async findCreationWithScriptAndShots(
    creationId: string,
  ): Promise<(CreationRecord & { script: CreationRecord['script'] | null }) | null> {
    try {
      const record = await this.prisma.creation.findUnique({
        where: { id: creationId },
        include: {
          script: {
            include: {
              shots: {
                orderBy: { shotIndex: 'asc' },
              },
            },
          },
        },
      });

      if (!record) {
        return null;
      }

      if (!record.script) {
        this.logger.warn(
          `Creation ${creationId} 关联的 Script 记录不存在，可能已被级联删除`,
        );
      }

      return record as unknown as (CreationRecord & { script: CreationRecord['script'] | null });
    } catch (error) {
      this.logger.error(`查询 Creation 失败: creationId=${creationId}, error=${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findProductById(productId: string): Promise<{ id: string; title: string; category: string; sellingPoints?: string[]; targetAudience?: string } | null> {
    try {
      const record = await this.prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          title: true,
          category: true,
          sellingPoints: true,
          targetAudience: true,
        },
      });

      if (!record) {
        return null;
      }

      return {
        id: record.id,
        title: record.title,
        category: record.category,
        sellingPoints: (record.sellingPoints as string[]) ?? [],
        targetAudience: record.targetAudience ?? undefined,
      };
    } catch (error) {
      this.logger.error(`查询 Product 失败: productId=${productId}, error=${error}`);
      throw this.mapRepositoryError(error, {
        p2025Code: 'PRODUCT_NOT_FOUND',
        p2025Message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.PRODUCT_NOT_FOUND,
      });
    }
  }

  async validateProductExists(productId: string): Promise<void> {
    const product = await this.findProductById(productId);
    if (!product) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.PRODUCT_NOT_FOUND,
          error: { code: 'PRODUCT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async findCreationWithScriptOnly(creationId: string): Promise<Prisma.CreationGetPayload<{ include: { script: { include: { shots: true } } } }> | null> {
    try {
      const record = await this.prisma.creation.findUnique({
        where: { id: creationId },
        include: {
          script: {
            include: {
              shots: {
                orderBy: { shotIndex: 'asc' },
              },
            },
          },
        },
      });

      if (!record) {
        return null;
      }

      return record;
    } catch (error) {
      this.logger.error(
        `查询 Creation (轻量版) 失败: creationId=${creationId}, error=${error}`,
      );
      throw this.mapPrismaError(error);
    }
  }

  async findCreationWithScriptShotsAndRenders(creationId: string): Promise<unknown | null> {
    try {
      const record = await this.prisma.creation.findUnique({
        where: { id: creationId },
        include: {
          script: {
            include: {
              shots: {
                orderBy: { shotIndex: 'asc' },
              },
            },
          },
          shotRenders: {
            orderBy: { shotIndex: 'asc' },
          },
        },
      });

      if (!record) {
        return null;
      }

      return record;
    } catch (error) {
      this.logger.error(
        `查询 Creation (含渲染状态) 失败: creationId=${creationId}, error=${error}`,
      );
      throw this.mapPrismaError(error);
    }
  }

  async createHealedCreationTask(params: {
    productId: string;
    scriptId: string;
    taskId: string;
    engineMode?: EngineMode;
    targetResolution?: string;
    exportFormat?: string;
    traceId?: string | null;
  }): Promise<Creation> {
    try {
      return await this.prisma.creation.create({
        data: {
          productId: params.productId,
          scriptId: params.scriptId,
          taskId: params.taskId,
          engineMode: params.engineMode ?? EngineMode.SCRIPT_DRIVEN,
          targetResolution: params.targetResolution ?? '1080x1920',
          exportFormat: params.exportFormat ?? 'MP4',
          status: CreationStatus.PENDING,
          progress: 0,
          currentStage: CreationStage.QUEUE_ALLOCATION,
          traceId: params.traceId ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `创建自愈 Creation 任务失败: taskId=${params.taskId}, productId=${params.productId}, scriptId=${params.scriptId}, error=${error}`,
      );
      throw this.mapPrismaError(error);
    }
  }

  private mapPrismaError(error: unknown): never {
    this.mapRepositoryError(error, {
      p2025Code: 'CREATION_NOT_FOUND',
      p2025Message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.CREATION_NOT_FOUND,
    });
  }

  private mapRepositoryError(
    error: unknown,
    p2025Mapping: { p2025Code: string; p2025Message: string },
  ): never {
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
        case 'P1008':
          throw serviceException(
            {
              message: '数据库查询超时',
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                details: { prisma_code: prismaError.code },
                retryable: true,
              },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        case 'P2025':
          throw serviceException(
            {
              message: p2025Mapping.p2025Message,
              error: {
                code: p2025Mapping.p2025Code,
                details: { prisma_code: prismaError.code },
                retryable: false,
              },
            },
            HttpStatus.NOT_FOUND,
          );
        case 'P2024':
          throw serviceException(
            {
              message: '数据库连接池耗尽',
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                details: { prisma_code: prismaError.code },
                retryable: true,
              },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
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
