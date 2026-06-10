// =============================================================================
// TikStream AI — Creation Repository
// =============================================================================

import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { PrismaClient, Prisma, CreationStatus, CreationStage, EngineMode, ShotRenderStatus } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import { serviceException } from '../common/service-exception';

export interface CreateCreationParams {
  id: string;
  productId: string;
  scriptId: string;
  taskId: string;
  engineMode: string;
  targetResolution: string;
  exportFormat: string;
  traceId: string;
  preferAiVideo?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateShotRenderParams {
  id: string;
  creationId: string;
  scriptShotId: string;
  shotId: string | null;
  shotIndex: number;
  cacheHash: string | null;
  sliceId: string | null;
  renderPath: string | null;
  renderDurationMs: number | null;
  retryCount: number;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreationListFilter {
  product_id: string;
  status?: string;
  current_stage?: string;
  engine_mode?: string;
  export_format?: string;
}

export interface DecodedCreationCursor {
  id: string;
  sort_value: string;
}

export interface CreationRow {
  id: string;
  productId: string;
  scriptId: string;
  taskId: string;
  engineMode: string;
  targetResolution: string;
  exportFormat: string;
  status: string;
  progress: number;
  currentStage: string;
  videoUrl: string | null;
  fileSizeBytes: bigint | null;
  traceId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedCreationResult {
  items: CreationRow[];
  total_count: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface TaskSummaryRow {
  task_id: string;
  biz_id: string;
  status: string;
  current_stage: string;
  progress: number;
  trace_id: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class CreationRepository {
  private readonly logger = new Logger(CreationRepository.name);

  constructor(@InjectPrisma() private readonly prisma: PrismaClient) {}

  async findProductById(productId: string): Promise<{ id: string; title: string; coverImageUrl: string | null } | null> {
    try {
      return await this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, title: true, coverImageUrl: true },
      });
    } catch (error) {
      this.logger.error(`Failed to find product by id: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async findScriptWithShots(scriptId: string): Promise<{
    id: string;
    productId: string;
    title: string | null;
    language: string | null;
    videoDuration: Prisma.Decimal;
    aspectRatio: string;
    styleVibe: string;
    generationMode: string;
    shots: Array<{
      id: string;
      shotId: string | null;
      shotIndex: number;
      duration: Prisma.Decimal;
      sceneDescriptionQuery: string;
      visualDescription: string;
      cameraMovement: string;
      transitionType: string;
      voiceoverText: string;
      subtitleText: string;
      selectedSliceId: string | null;
      complianceStatus: string;
      bgmSegment: Prisma.JsonValue | null;
    }>;
  } | null> {
    try {
      return await this.prisma.script.findUnique({
        where: { id: scriptId },
        select: {
          id: true,
          productId: true,
          title: true,
          language: true,
          videoDuration: true,
          aspectRatio: true,
          styleVibe: true,
          generationMode: true,
          shots: {
            orderBy: { shotIndex: 'asc' },
            select: {
              id: true,
              shotId: true,
              shotIndex: true,
              duration: true,
              sceneDescriptionQuery: true,
              visualDescription: true,
              cameraMovement: true,
              transitionType: true,
              voiceoverText: true,
              subtitleText: true,
              selectedSliceId: true,
              complianceStatus: true,
              bgmSegment: true,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to find script with shots: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async createCreationWithShotRenders(
    creationParams: CreateCreationParams,
    shotRenderParams: CreateShotRenderParams[],
  ): Promise<{
    id: string;
    productId: string;
    scriptId: string;
    taskId: string;
    engineMode: string;
    targetResolution: string;
    exportFormat: string;
    status: string;
    progress: number;
    currentStage: string;
    videoUrl: string | null;
    fileSizeBytes: bigint | null;
    traceId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    preferAiVideo: boolean;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    try {
      return await this.prisma.creation.create({
        data: {
          id: creationParams.id,
          productId: creationParams.productId,
          scriptId: creationParams.scriptId,
          taskId: creationParams.taskId,
          engineMode: creationParams.engineMode as Prisma.EnumEngineModeFilter['equals'],
          targetResolution: creationParams.targetResolution,
          exportFormat: creationParams.exportFormat,
          traceId: creationParams.traceId,
          preferAiVideo: creationParams.preferAiVideo ?? false,
          status: 'PENDING',
          progress: 0,
          currentStage: 'QUEUE_ALLOCATION',
          createdAt: creationParams.createdAt,
          updatedAt: creationParams.updatedAt,
          shotRenders: {
            createMany: {
              data: shotRenderParams.map((sr) => ({
                id: sr.id,
                scriptShotId: sr.scriptShotId,
                shotId: sr.shotId,
                shotIndex: sr.shotIndex,
                cacheHash: sr.cacheHash,
                sliceId: sr.sliceId,
                renderPath: sr.renderPath,
                renderDurationMs: sr.renderDurationMs,
                retryCount: sr.retryCount,
                status: sr.status as Prisma.EnumShotRenderStatusFilter['equals'],
                errorMessage: sr.errorMessage,
                createdAt: sr.createdAt,
                updatedAt: sr.updatedAt,
              })),
            },
          },
        },
      }) as unknown as {
        id: string;
        productId: string;
        scriptId: string;
        taskId: string;
        engineMode: string;
        targetResolution: string;
        exportFormat: string;
        status: string;
        progress: number;
        currentStage: string;
        videoUrl: string | null;
        fileSizeBytes: bigint | null;
        traceId: string | null;
        errorCode: string | null;
        errorMessage: string | null;
        preferAiVideo: boolean;
        startedAt: Date | null;
        finishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      };
    } catch (error) {
      this.logger.error(`Failed to create creation with shot renders: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  private mapPrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      throw serviceException(
        {
          message: '数据库连接不可用，请稍后重试',
          error: {
            code: 'DATABASE_UNAVAILABLE',
            details: { prisma_code: 'INIT_ERROR' },
            retryable: true,
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (error instanceof Prisma.PrismaClientRustPanicError) {
      throw serviceException(
        {
          message: error.message,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { prisma_code: 'RUST_PANIC' },
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          throw serviceException(
            {
              message: error.message,
              error: {
                code: 'CONFLICT',
                details: { prisma_code: error.code },
                retryable: false,
              },
            },
            HttpStatus.CONFLICT,
          );
        case 'P2003':
          throw serviceException(
            {
              message: error.message,
              error: {
                code: 'FOREIGN_KEY_CONSTRAINT',
                details: { prisma_code: error.code },
                retryable: false,
              },
            },
            HttpStatus.NOT_FOUND,
          );
        case 'P2025':
          throw serviceException(
            {
              message: error.message,
              error: {
                code: 'NOT_FOUND',
                details: { prisma_code: error.code },
                retryable: false,
              },
            },
            HttpStatus.NOT_FOUND,
          );
        default:
          throw serviceException(
            {
              message: `数据库操作失败: ${error.message}`,
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                details: { prisma_code: error.code },
                retryable: true,
              },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
      }
    }
    throw serviceException(
      {
        message: error instanceof Error ? error.message : '未知数据库错误',
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          details: { original_error: String(error) },
          retryable: true,
        },
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async findCreationById(creationId: string): Promise<{
    id: string;
    productId: string;
    scriptId: string;
    taskId: string;
    engineMode: string;
    targetResolution: string;
    exportFormat: string;
    status: string;
    progress: number;
    currentStage: string;
    videoUrl: string | null;
    fileSizeBytes: bigint | null;
    traceId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    preferAiVideo: boolean;
    watermarkConfig?: unknown;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    shotRenders: Array<{
      id: string;
      creationId: string;
      scriptShotId: string;
      shotId: string | null;
      shotIndex: number;
      cacheHash: string | null;
      sliceId: string | null;
      renderPath: string | null;
      renderDurationMs: number | null;
      retryCount: number;
      source: string | null;
      seedancePrompt: string | null;
      status: string;
      errorMessage: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  } | null> {
    try {
      return await this.prisma.creation.findUnique({
        where: { id: creationId },
        include: {
          shotRenders: {
            orderBy: { shotIndex: 'asc' },
          },
        },
      }) as unknown as {
        id: string;
        productId: string;
        scriptId: string;
        taskId: string;
        engineMode: string;
        targetResolution: string;
        exportFormat: string;
        status: string;
        progress: number;
        currentStage: string;
        videoUrl: string | null;
        fileSizeBytes: bigint | null;
        traceId: string | null;
        errorCode: string | null;
        errorMessage: string | null;
        preferAiVideo: boolean;
        watermarkConfig?: unknown;
        startedAt: Date | null;
        finishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        shotRenders: Array<{
          id: string;
          creationId: string;
          scriptShotId: string;
          shotId: string | null;
          shotIndex: number;
          cacheHash: string | null;
          sliceId: string | null;
          renderPath: string | null;
          renderDurationMs: number | null;
          retryCount: number;
          source: string | null;
          seedancePrompt: string | null;
          status: string;
          errorMessage: string | null;
          createdAt: Date;
          updatedAt: Date;
        }>;
      } | null;
    } catch (error) {
      this.logger.error(`Failed to find creation by id: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async cancelCreationById(creationId: string): Promise<{
    id: string;
    taskId: string;
    status: string;
    currentStage: string;
    finishedAt: Date | null;
  }> {
    try {
      const result = await this.prisma.creation.update({
        where: { id: creationId },
        data: {
          status: 'CANCELED',
          finishedAt: new Date(),
        },
        select: {
          id: true,
          taskId: true,
          status: true,
          currentStage: true,
          finishedAt: true,
        },
      });

      return {
        id: result.id,
        taskId: result.taskId,
        status: result.status,
        currentStage: result.currentStage,
        finishedAt: result.finishedAt,
      };
    } catch (error) {
      this.logger.error(`Failed to cancel creation by id: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  // ===========================================================================
  // J1: findCreationsPaginated — 游标分页查询
  // ===========================================================================

  async findCreationsPaginated(
    filter: CreationListFilter,
    decodedCursor: DecodedCreationCursor | null,
    limit: number,
  ): Promise<PaginatedCreationResult> {
    const where = this.buildCreationListWhere(filter);
    const orderBy: Prisma.CreationOrderByWithRelationInput[] = [
      { createdAt: 'desc' },
      { id: 'desc' },
    ];
    const cursorClause = decodedCursor ? { id: decodedCursor.id } : undefined;
    const skip = cursorClause ? 1 : 0;
    const take = limit + 1;

    let items: CreationRow[] = [];
    try {
      const queryArgs: Prisma.CreationFindManyArgs = {
        where,
        orderBy,
        take,
        select: {
          id: true,
          productId: true,
          scriptId: true,
          taskId: true,
          engineMode: true,
          targetResolution: true,
          exportFormat: true,
          status: true,
          progress: true,
          currentStage: true,
          videoUrl: true,
          fileSizeBytes: true,
          traceId: true,
          errorCode: true,
          errorMessage: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      };

      if (cursorClause) {
        queryArgs.cursor = cursorClause;
        queryArgs.skip = skip;
      }

      items = (await this.prisma.creation.findMany(queryArgs)) as unknown as CreationRow[];
    } catch (error) {
      this.logger.error(`Failed to find creations paginated: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }

    let total_count = -1;
    try {
      total_count = await this.prisma.creation.count({ where });
    } catch (error) {
      this.logger.warn(`Creation count query failed (non-blocking): ${(error as Error).message}`);
      total_count = -1;
    }

    const has_more = items.length > limit;
    if (has_more) {
      items = items.slice(0, limit);
    }

    let next_cursor: string | null = null;
    if (has_more && items.length > 0) {
      const lastItem = items[items.length - 1];
      next_cursor = this.encodeCreationCursor(lastItem);
    }

    return { items, total_count, has_more, next_cursor };
  }

  async updateCreationStageByTaskId(params: {
    taskId: string;
    currentStage: string;
    progress: number;
    message?: string;
    traceId?: string;
  }): Promise<void> {
    try {
      await this.prisma.creation.updateMany({
        where: { taskId: params.taskId },
        data: {
          currentStage: params.currentStage as CreationStage,
          progress: params.progress,
          status: params.progress >= 100 ? 'FINISHED' : 'PROCESSING',
          errorMessage: params.message ?? null,
          traceId: params.traceId,
          startedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update creation stage by task id: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async markCreationExportedByTaskId(params: {
    taskId: string;
    videoUrl: string;
    fileSizeBytes: number;
    traceId?: string;
  }): Promise<void> {
    try {
      await this.prisma.creation.updateMany({
        where: { taskId: params.taskId },
        data: {
          status: 'FINISHED',
          currentStage: 'FINISHED',
          progress: 100,
          videoUrl: params.videoUrl,
          fileSizeBytes: BigInt(params.fileSizeBytes),
          traceId: params.traceId,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to mark creation exported by task id: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async markCreationFailedByTaskId(params: {
    taskId: string;
    errorCode: string;
    errorMessage: string;
    currentStage: string;
    traceId?: string;
  }): Promise<void> {
    try {
      await this.prisma.creation.updateMany({
        where: { taskId: params.taskId },
        data: {
          status: 'FAILED',
          currentStage: params.currentStage as CreationStage,
          errorCode: params.errorCode,
          errorMessage: params.errorMessage,
          traceId: params.traceId,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to mark creation failed by task id: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async updateShotRenderForCreation(params: {
    creationId: string;
    shotIndex: number;
    sliceId?: string | null;
    status?: string;
    renderPath?: string | null;
    incrementRetryCount?: boolean;
    errorMessage?: string | null;
  }): Promise<{
    id: string;
    creationId: string;
    scriptShotId: string;
    shotId: string | null;
    shotIndex: number;
    cacheHash: string | null;
    sliceId: string | null;
    renderPath: string | null;
    renderDurationMs: number | null;
    retryCount: number;
    status: string;
    errorMessage: string | null;
    updatedAt: Date;
  }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.shotRender.findFirst({
          where: { creationId: params.creationId, shotIndex: params.shotIndex },
        });

        if (!current) {
          throw serviceException(
            {
              message: `Shot render not found for creation ${params.creationId} shot ${params.shotIndex}`,
              error: { code: 'SHOT_RENDER_NOT_FOUND', retryable: false },
            },
            HttpStatus.NOT_FOUND,
          );
        }

        return await tx.shotRender.update({
          where: { id: current.id },
          data: {
            sliceId: params.sliceId ?? current.sliceId,
            status: (params.status ?? current.status) as ShotRenderStatus,
            renderPath: params.renderPath === undefined ? current.renderPath : params.renderPath,
            retryCount: params.incrementRetryCount ? current.retryCount + 1 : current.retryCount,
            errorMessage: params.errorMessage === undefined ? current.errorMessage : params.errorMessage,
            updatedAt: new Date(),
          },
        });
      }) as unknown as {
        id: string;
        creationId: string;
        scriptShotId: string;
        shotId: string | null;
        shotIndex: number;
        cacheHash: string | null;
        sliceId: string | null;
        renderPath: string | null;
        renderDurationMs: number | null;
        retryCount: number;
        status: string;
        errorMessage: string | null;
        updatedAt: Date;
      };
    } catch (error) {
      this.logger.error(`Failed to update shot render for creation: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async resetCreationForRetry(creationId: string): Promise<CreationRow> {
    try {
      const updated = await this.prisma.creation.update({
        where: { id: creationId },
        data: {
          status: 'PENDING',
          currentStage: 'QUEUE_ALLOCATION',
          progress: 0,
          videoUrl: null,
          fileSizeBytes: null,
          traceId: null,
          errorCode: null,
          errorMessage: null,
          finishedAt: null,
          startedAt: null,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          productId: true,
          scriptId: true,
          taskId: true,
          engineMode: true,
          targetResolution: true,
          exportFormat: true,
          status: true,
          progress: true,
          currentStage: true,
          videoUrl: true,
          fileSizeBytes: true,
          traceId: true,
          errorCode: true,
          errorMessage: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await this.prisma.shotRender.updateMany({
        where: { creationId },
        data: {
          status: 'PENDING',
          errorMessage: null,
          renderPath: null,
          renderDurationMs: null,
          retryCount: 0,
          updatedAt: new Date(),
        },
      });

      // 重置 ScriptShot 的 selectedSliceId，避免重试时复用旧切片绑定
      await this.prisma.scriptShot.updateMany({
        where: { scriptId: updated.scriptId },
        data: { selectedSliceId: null },
      });

      return updated as unknown as CreationRow;
    } catch (error) {
      this.logger.error(`Failed to reset creation for retry: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async findTaskSummaryByTaskId(taskId: string): Promise<TaskSummaryRow | null> {
    try {
      const row = await this.prisma.creation.findFirst({
        where: { taskId },
        select: {
          taskId: true,
          id: true,
          status: true,
          currentStage: true,
          progress: true,
          traceId: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!row) {
        return null;
      }

      return {
        task_id: row.taskId,
        biz_id: row.id,
        status: row.status,
        current_stage: row.currentStage,
        progress: row.progress,
        trace_id: row.traceId,
        error_message: row.errorMessage,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      };
    } catch (error) {
      this.logger.error(`Failed to find task summary by task id: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async listTaskSummaries(query: {
    productId?: string;
    status?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: TaskSummaryRow[]; totalCount: number }> {
    try {
      const where: Prisma.CreationWhereInput = {
        deletedAt: null, // 仅列出未删除（非回收站）任务
      };
      if (query.productId) {
        where.productId = query.productId;
      }
      if (query.status) {
        where.status = query.status as CreationStatus;
      }

      const [items, totalCount] = await Promise.all([
        this.prisma.creation.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            taskId: true,
            id: true,
            status: true,
            currentStage: true,
            progress: true,
            traceId: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.creation.count({ where }),
      ]);

      return {
        items: items.map((row) => ({
          task_id: row.taskId,
          biz_id: row.id,
          status: row.status,
          current_stage: row.currentStage,
          progress: row.progress,
          trace_id: row.traceId,
          error_message: row.errorMessage,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        })),
        totalCount,
      };
    } catch (error) {
      this.logger.error(`Failed to list task summaries: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async permanentDeleteTask(taskId: string): Promise<boolean> {
    try {
      // 先查出 Creation 记录以获取内部 ID（taskId 是业务 ID，creationId 是 FK 目标）
      const creation = await this.prisma.creation.findUnique({
        where: { taskId },
        select: { id: true },
      });
      if (!creation) return false;

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. 级联删除子表：ShotRender（无 onDelete: Cascade 约束）
        await tx.shotRender.deleteMany({
          where: { creationId: creation.id },
        });
        // 2. OriginalityCheck 已配置 onDelete: Cascade，Prisma 自动处理
        // 3. 删除 Creation 主记录（仅限软删除后的永久清除）
        return tx.creation.deleteMany({
          where: { taskId, deletedAt: { not: null } },
        });
      });

      return result.count > 0;
    } catch (error) {
      this.logger.error(`Failed to permanently delete task: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async batchSoftDeleteTasks(taskIds: string[]): Promise<{ deleted_count: number; skipped_ids: string[] }> {
    // 一次性批量软删除：仅处理非活跃且未删除的任务
    const result = await this.prisma.creation.updateMany({
      where: {
        taskId: { in: taskIds },
        deletedAt: null,
        status: { notIn: ['PROCESSING', 'PENDING'] },
      },
      data: { deletedAt: new Date() },
    });

    // 反查哪些 taskId 实际未被删除，推导 skipped_ids
    const deletedRows = await this.prisma.creation.findMany({
      where: { taskId: { in: taskIds }, deletedAt: { not: null } },
      select: { taskId: true },
    });
    const deletedSet = new Set(deletedRows.map((r) => r.taskId));
    const skippedIds = taskIds.filter((id) => !deletedSet.has(id));

    return { deleted_count: result.count, skipped_ids: skippedIds };
  }

  /**
   * 批量查询任务摘要（替代循环 N 次 findTaskSummaryByTaskId）
   */
  async findTaskSummariesByTaskIds(taskIds: string[]): Promise<TaskSummaryRow[]> {
    try {
      const rows = await this.prisma.creation.findMany({
        where: { taskId: { in: taskIds } },
        select: {
          taskId: true,
          id: true,
          status: true,
          currentStage: true,
          progress: true,
          traceId: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return rows.map((row) => ({
        task_id: row.taskId,
        biz_id: row.id,
        status: row.status,
        current_stage: row.currentStage,
        progress: row.progress,
        trace_id: row.traceId,
        error_message: row.errorMessage,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      }));
    } catch (error) {
      this.logger.error(`Failed to batch find task summaries: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  /**
   * 批量查询 Creation（仅返回 id + productId，用于 product_id 验权）
   */
  async findCreationsByIds(ids: string[]): Promise<Array<{ id: string; productId: string }>> {
    try {
      return await this.prisma.creation.findMany({
        where: { id: { in: ids } },
        select: { id: true, productId: true },
      });
    } catch (error) {
      this.logger.error(`Failed to batch find creations by ids: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  private buildCreationListWhere(filter: CreationListFilter): Prisma.CreationWhereInput {
    const where: Prisma.CreationWhereInput = {
      productId: filter.product_id,
    };

    if (filter.status) {
      where.status = filter.status as CreationStatus;
    }
    if (filter.current_stage) {
      where.currentStage = filter.current_stage as CreationStage;
    }
    if (filter.engine_mode) {
      where.engineMode = filter.engine_mode as EngineMode;
    }
    if (filter.export_format) {
      where.exportFormat = filter.export_format;
    }

    return where;
  }

  // ===========================================================================
  // K0: encodeCreationCursor — 构造游标 token
  // ===========================================================================

  encodeCreationCursor(item: CreationRow): string {
    const payload = { v: item.createdAt.toISOString(), i: item.id };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  // ===========================================================================
  // K1: decodeCreationCursor — 解码游标 token
  // ===========================================================================

  decodeCreationCursor(token: string): DecodedCreationCursor | null {
    try {
      const jsonStr = Buffer.from(token, 'base64url').toString('utf-8');
      const parsed = JSON.parse(jsonStr);

      if (!parsed || typeof parsed !== 'object') {
        this.logger.warn(`Cursor decode failed: payload is not a valid object`);
        return null;
      }
      if (!parsed.i || typeof parsed.i !== 'string') {
        this.logger.warn(`Cursor decode failed: missing or invalid 'i' field`);
        return null;
      }
      if (parsed.v === undefined || parsed.v === null) {
        this.logger.warn(`Cursor decode failed: missing 'v' field`);
        return null;
      }

      return {
        id: parsed.i,
        sort_value: parsed.v,
      };
    } catch (error) {
      this.logger.warn(
        `Cursor decode failed: token=${token.slice(0, 8)}..., error=${(error as Error).message}`,
      );
      return null;
    }
  }

  async updateCreationExportFormat(creationId: string, exportFormat: string): Promise<void> {
    try {
      await this.prisma.creation.update({
        where: { id: creationId },
        data: { exportFormat },
      });
    } catch (error) {
      this.logger.error(`Failed to update creation export format: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async updateCreationResolution(creationId: string, targetResolution: string): Promise<void> {
    try {
      await this.prisma.creation.update({
        where: { id: creationId },
        data: { targetResolution },
      });
    } catch (error) {
      this.logger.error(`Failed to update creation resolution: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async emptyTrash(productId?: string): Promise<number> {
    try {
      const where: Prisma.CreationWhereInput = {
        deletedAt: { not: null },
      };
      if (productId) {
        where.productId = productId;
      }

      // 先查出所有待删除 Creation 的内部 ID
      const creations = await this.prisma.creation.findMany({
        where,
        select: { id: true },
      });
      const creationIds = creations.map((c) => c.id);

      if (creationIds.length === 0) return 0;

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. 级联删除子表：ShotRender（无 onDelete: Cascade 约束）
        await tx.shotRender.deleteMany({
          where: { creationId: { in: creationIds } },
        });
        // 2. OriginalityCheck 已配置 onDelete: Cascade，Prisma 自动处理
        // 3. 删除 Creation 主记录
        return tx.creation.deleteMany({ where });
      });

      return result.count;
    } catch (error) {
      this.logger.error(`Failed to empty trash: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async listTrashTasks(params: { productId?: string; page: number; pageSize: number }): Promise<{
    items: Array<{
      taskId: string;
      bizId: string;
      status: string;
      currentStage: string;
      progress: number;
      traceId: string | null;
      errorMessage: string | null;
      deletedAt: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    totalCount: number;
  }> {
    try {
      const where: Prisma.CreationWhereInput = {
        deletedAt: { not: null },
      };
      if (params.productId) {
        where.productId = params.productId;
      }
      const [items, totalCount] = await Promise.all([
        this.prisma.creation.findMany({
          where,
          orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          select: {
            taskId: true,
            id: true,
            status: true,
            currentStage: true,
            progress: true,
            traceId: true,
            errorMessage: true,
            deletedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.creation.count({ where }),
      ]);
      return {
        items: items.map((row) => ({
          taskId: row.taskId,
          bizId: row.id,
          status: row.status,
          currentStage: row.currentStage,
          progress: row.progress,
          traceId: row.traceId,
          errorMessage: row.errorMessage,
          deletedAt: row.deletedAt?.toISOString() ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
        totalCount,
      };
    } catch (error) {
      this.logger.error(`Failed to list trash tasks: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async findCreationByTaskId(taskId: string): Promise<{
    id: string;
    productId: string;
    scriptId: string;
    taskId: string;
    engineMode: string;
    targetResolution: string;
    exportFormat: string;
    status: string;
    progress: number;
    currentStage: string;
    videoUrl: string | null;
    fileSizeBytes: bigint | null;
    traceId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    preferAiVideo: boolean;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    try {
      return await this.prisma.creation.findFirst({
        where: { taskId },
      }) as unknown as {
        id: string;
        productId: string;
        scriptId: string;
        taskId: string;
        engineMode: string;
        targetResolution: string;
        exportFormat: string;
        status: string;
        progress: number;
        currentStage: string;
        videoUrl: string | null;
        fileSizeBytes: bigint | null;
        traceId: string | null;
        errorCode: string | null;
        errorMessage: string | null;
        preferAiVideo: boolean;
        startedAt: Date | null;
        finishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      } | null;
    } catch (error) {
      this.logger.error(`Failed to find creation by task id: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async updateScriptShotFields(
    scriptId: string,
    shotIndex: number,
    data: { duration?: number; subtitleText?: string },
  ): Promise<void> {
    try {
      await this.prisma.scriptShot.updateMany({
        where: { scriptId, shotIndex, deletedAt: null },
        data: {
          ...(data.duration !== undefined ? { duration: data.duration } : {}),
          ...(data.subtitleText !== undefined ? { subtitleText: data.subtitleText } : {}),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update script shot fields: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async updateShotRenderByTaskAndShot(params: {
    taskId: string;
    shotIndex: number;
    renderPath?: string | null;
    status?: string;
    source?: string | null;
    seedancePrompt?: string | null;
  }): Promise<void> {
    try {
      const creation = await this.prisma.creation.findFirst({
        where: { taskId: params.taskId },
        select: { id: true },
      });
      if (!creation) {
        throw serviceException(
          { message: `Creation not found for task ${params.taskId}`, error: { code: 'NOT_FOUND', retryable: false } },
          HttpStatus.NOT_FOUND,
        );
      }
      await this.prisma.shotRender.updateMany({
        where: { creationId: creation.id, shotIndex: params.shotIndex },
        data: {
          ...(params.renderPath !== undefined ? { renderPath: params.renderPath } : {}),
          ...(params.status !== undefined ? { status: params.status as ShotRenderStatus } : {}),
          ...(params.source !== undefined ? { source: params.source } : {}),
          ...(params.seedancePrompt !== undefined ? { seedancePrompt: params.seedancePrompt } : {}),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update shot render by task and shot: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async findStuckQueueAllocations(params: {
    stage: string;
    stuckThresholdMs: number;
    productId?: string;
    status?: string;
  }): Promise<Array<{ creation_id: string; created_at: Date; updated_at: Date }>> {
    try {
      const where: Prisma.CreationWhereInput = {
        currentStage: params.stage as CreationStage,
      };
      if (params.productId) {
        where.productId = params.productId;
      }
      if (params.status) {
        where.status = params.status as CreationStatus;
      }
      const thresholdDate = new Date(Date.now() - params.stuckThresholdMs);
      where.createdAt = { lt: thresholdDate };

      const rows = await this.prisma.creation.findMany({
        where,
        select: { id: true, createdAt: true, updatedAt: true },
      });
      return rows.map((r) => ({ creation_id: r.id, created_at: r.createdAt, updated_at: r.updatedAt }));
    } catch (error) {
      this.logger.error(`Failed to find stuck queue allocations: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  /**
   * 查找所有存在卡在指定阶段的创作的 product_id（去重）
   * 用于 Cron 定时巡检，避免遍历所有商品
   */
  async findDistinctProductIdsWithStuckQueueAllocations(params: {
    stage: string;
    stuckThresholdMs: number;
  }): Promise<string[]> {
    try {
      const thresholdDate = new Date(Date.now() - params.stuckThresholdMs);

      const rows = await this.prisma.creation.findMany({
        where: {
          currentStage: params.stage as CreationStage,
          status: 'PENDING',
          createdAt: { lt: thresholdDate },
        },
        select: { productId: true },
        distinct: ['productId'],
      });

      return rows.map((r) => r.productId);
    } catch (error) {
      this.logger.error(`Failed to find distinct product IDs for stuck creations: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async markCreationFailed(
    creationId: string,
    params: { errorCode: string; errorMessage: string; currentStage: string; traceId?: string },
  ): Promise<void> {
    try {
      await this.prisma.creation.update({
        where: { id: creationId },
        data: {
          status: 'FAILED',
          currentStage: params.currentStage as CreationStage,
          errorCode: params.errorCode,
          errorMessage: params.errorMessage,
          traceId: params.traceId,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to mark creation failed: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async softDeleteTask(taskId: string): Promise<{ task_id: string; deleted_at: string } | null> {
    try {
      const creation = await this.prisma.creation.findFirst({
        where: { taskId, deletedAt: null },
        select: { taskId: true, deletedAt: true },
      });
      if (!creation) {
        return null;
      }
      if (creation.deletedAt) {
        return { task_id: creation.taskId, deleted_at: creation.deletedAt.toISOString() };
      }
      const updated = await this.prisma.creation.update({
        where: { taskId },
        data: { deletedAt: new Date() },
        select: { taskId: true, deletedAt: true },
      });
      return { task_id: updated.taskId, deleted_at: updated.deletedAt!.toISOString() };
    } catch (error) {
      this.logger.error(`Failed to soft delete task: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }

  async restoreTask(taskId: string): Promise<{ task_id: string } | null> {
    try {
      const creation = await this.prisma.creation.findFirst({
        where: { taskId, deletedAt: { not: null } },
        select: { taskId: true },
      });
      if (!creation) {
        return null;
      }
      await this.prisma.creation.update({
        where: { taskId },
        data: { deletedAt: null },
      });
      return { task_id: creation.taskId };
    } catch (error) {
      this.logger.error(`Failed to restore task: ${(error as Error).message}`);
      throw this.mapPrismaError(error);
    }
  }
}
