import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  MessageEvent,
  Param,
  Post,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiExcludeEndpoint,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { Observable, catchError, distinctUntilChanged, filter, from, interval, mergeMap, of, startWith, switchMap, takeWhile, timeout, takeUntil } from 'rxjs';
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  SSEEventPayload,
  SSEShotRenderEventPayload,
  SSEEventType,
  TaskSummary,
} from '@tikstream/shared-types';
import { buildApiErrorResponse } from '../common/http-error-response';
import { CreationService, TaskListResponse } from '../creation/creation.service';
import { ListTasksDto } from './dto/list-tasks.dto';
import { TASK_CONSTANTS } from './task.constants';

@ApiTags('Task')
@Controller({ path: 'api/v1/tasks', version: '1' })
export class TaskController {
  private readonly logger = new Logger(TaskController.name);

  constructor(private readonly creationService: CreationService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '任务列表查询',
    description: '返回创作任务投影列表，支持按商品与状态筛选。',
  })
  @ApiOkResponse({ description: '查询成功' })
  @ApiInternalServerErrorResponse({ description: '内部服务器错误' })
  async list(
    @Query() dto: ListTasksDto,
  ): Promise<ApiSuccessResponse<TaskListResponse> | ApiErrorResponse> {
    const traceId = `trc_${randomUUID().slice(0, 8)}`;

    try {
      const result = await this.creationService.listTasks(dto);

      return {
        success: true,
        message: '查询成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get(':task_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '任务详情查询',
    description: '按 task_id 查询单个创作任务的当前投影状态。',
  })
  @ApiParam({
    name: 'task_id',
    required: true,
    type: String,
    description: '任务ID',
    example: 'tsk_20260527_000001',
  })
  @ApiOkResponse({ description: '查询成功' })
  @ApiNotFoundResponse({ description: '任务不存在' })
  @ApiInternalServerErrorResponse({ description: '内部服务器错误' })
  async getDetail(
    @Param('task_id') taskId: string,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<TaskSummary> | ApiErrorResponse> {
    const traceId = `trc_${randomUUID().slice(0, 8)}`;

    try {
      const result = await this.creationService.getTask(taskId, productId);

      return {
        success: true,
        message: '查询成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Delete(':task_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '删除任务（移入回收站）',
    description: '软删除任务，仅终态任务可删除。处理中的任务需先取消。',
  })
  @ApiParam({ name: 'task_id', required: true, type: String, example: 'tsk_20260527_000001' })
  async softDelete(@Param('task_id') taskId: string, @Query('product_id') productId?: string): Promise<ApiSuccessResponse<object> | ApiErrorResponse> {
    const traceId = `trc_${randomUUID().slice(0, 8)}`;
    try {
      const result = await this.creationService.softDeleteTask(taskId, productId);
      return { success: true, message: '任务已移入回收站', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':task_id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复任务', description: '从回收站恢复任务。' })
  @ApiParam({ name: 'task_id', required: true, type: String, example: 'tsk_20260527_000001' })
  async restore(@Param('task_id') taskId: string, @Query('product_id') productId?: string): Promise<ApiSuccessResponse<object> | ApiErrorResponse> {
    const traceId = `trc_${randomUUID().slice(0, 8)}`;
    try {
      const result = await this.creationService.restoreTask(taskId, productId);
      return { success: true, message: '任务已恢复', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Delete(':task_id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '永久删除任务', description: '物理删除任务，仅回收站中的任务可永久删除。' })
  @ApiParam({ name: 'task_id', required: true, type: String, example: 'tsk_20260527_000001' })
  async permanentDelete(@Param('task_id') taskId: string, @Query('product_id') productId?: string): Promise<ApiSuccessResponse<object> | ApiErrorResponse> {
    const traceId = `trc_${randomUUID().slice(0, 8)}`;
    try {
      const result = await this.creationService.permanentDeleteTask(taskId, productId);
      return { success: true, message: '任务已永久删除', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('batch-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量删除任务', description: '批量软删除任务，处理中的任务自动跳过。' })
  async batchSoftDelete(@Query('task_ids') taskIdsRaw: string, @Query('product_id') productId?: string): Promise<ApiSuccessResponse<object> | ApiErrorResponse> {
    const traceId = `trc_${randomUUID().slice(0, 8)}`;
    try {
      const taskIds = taskIdsRaw ? taskIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
      if (taskIds.length === 0) {
        return { success: true, message: '无待删除任务', data: { deleted_count: 0, skipped_count: 0, skipped_task_ids: [] }, trace_id: traceId, timestamp: new Date().toISOString() };
      }
      const result = await this.creationService.batchSoftDeleteTasks(taskIds, productId);
      return { success: true, message: `成功删除 ${result.deleted_count} 个任务`, data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('trash/list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '回收站列表', description: '查询已删除的任务列表。' })
  async listTrash(@Query() dto: ListTasksDto): Promise<ApiSuccessResponse<TaskListResponse> | ApiErrorResponse> {
    const traceId = `trc_${randomUUID().slice(0, 8)}`;
    try {
      const result = await this.creationService.listTrashTasks(dto);
      return { success: true, message: '查询成功', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Delete('trash/empty')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清空回收站', description: '永久删除所有回收站中的任务。' })
  async emptyTrash(@Query('product_id') productId?: string): Promise<ApiSuccessResponse<object> | ApiErrorResponse> {
    const traceId = `trc_${randomUUID().slice(0, 8)}`;

    // 参数校验：product_id 如果传入不能是空字符串
    if (productId !== undefined && productId.trim().length === 0) {
      return {
        success: false,
        message: 'product_id 不能为空字符串',
        error: { code: 'INVALID_REQUEST', retryable: false },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const result = await this.creationService.emptyTrash(productId);
      return { success: true, message: `已永久删除 ${result.deleted_count} 个任务`, data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  /** null-safe 等值比较：将 null 与 undefined 归一化为 '' 后比较 */
  private static readonly nullSafeEq = (a: unknown, b: unknown): boolean =>
    (a ?? '') === (b ?? '');

  @Sse(':task_id/events')
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: '任务进度 SSE 订阅',
    description: '持续推送任务阶段、进度、分镜与终态事件，支持刷新后恢复与实时追踪。',
  })
  @ApiParam({
    name: 'task_id',
    required: true,
    type: String,
    description: '任务ID',
    example: 'tsk_20260527_000001',
  })
  async subscribe(
    @Param('task_id') taskId: string,
    @Query('product_id') productId: string | undefined,
    @Req() req: Request,
  ): Promise<Observable<MessageEvent>> {
    // 预验证任务存在（不存在直接抛 404）
    await this.creationService.getTask(taskId, productId);

    // 防御性 fallback：确保异常路径中 task_id 始终有效
    const effectiveTaskId = taskId || `unknown_${randomUUID().slice(0, 8)}`;

    // 闭包状态：跨轮询周期保持
    let isFirstEmission = true;
    let lastHeartbeatAt = Date.now();
    const prevShotStatus = new Map<number, string>(); // shot_index → status
    let latestSequence = 0; // 序列号防竞态，丢弃比已处理数据更旧的结果
    let sequenceCounter = 0; // 原子递增计数器，避免 Date.now() 回拨/碰撞

    return interval(2000).pipe(
      startWith(0),
      switchMap(async () => {
        const seq = Date.now(); // 单调递增序列号
        const task = await this.creationService.getTask(taskId, productId);
        // Bug 5: biz_id 防御校验
        if (!task.biz_id) {
          throw new Error(`任务 ${taskId} 的 biz_id 为空，无法查询关联创作`);
        }
        const creation = await this.creationService.getCreationDetail(task.biz_id, productId);
        return { task, creation, _seq: seq };
      }),
      // Bug 9: 丢弃迟到/过时数据
      filter(({ _seq }) => {
        if (_seq < latestSequence) {
          return false;
        }
        latestSequence = _seq;
        return true;
      }),
      // Bug 4: null-safe 比较 — 同时比较 creation.shot_renders 状态，确保单镜完成时不被过滤
      distinctUntilChanged(
        (prev, next) => {
          // task 级字段比较
          const taskUnchanged =
            TaskController.nullSafeEq(prev.task.updated_at, next.task.updated_at) &&
            TaskController.nullSafeEq(prev.task.status, next.task.status) &&
            TaskController.nullSafeEq(prev.task.current_stage, next.task.current_stage) &&
            TaskController.nullSafeEq(prev.task.progress, next.task.progress) &&
            TaskController.nullSafeEq(prev.task.message, next.task.message);
          if (!taskUnchanged) return false;

          // shot_renders 状态比较：任一镜状态变化即视为有变更
          const prevShots = (prev.creation as { shot_renders?: Array<{ shot_index: number; status: string }> }).shot_renders ?? [];
          const nextShots = (next.creation as { shot_renders?: Array<{ shot_index: number; status: string }> }).shot_renders ?? [];
          if (prevShots.length !== nextShots.length) return false;
          const prevStatusHash = prevShots.map((s) => `${s.shot_index}:${s.status}`).join(',');
          const nextStatusHash = nextShots.map((s) => `${s.shot_index}:${s.status}`).join(',');
          return prevStatusHash === nextStatusHash;
        },
      ),
      mergeMap(({ task, creation }) => {
        const events: MessageEvent[] = [];
        const basePayload: SSEEventPayload = {
          task_id: task.task_id,
          status: task.status,
          current_stage: task.current_stage,
          progress: task.progress,
          message: task.message ?? task.current_stage,
          trace_id: task.trace_id ?? `trc_${randomUUID().slice(0, 8)}`,
          timestamp: task.updated_at,
        };

        // --- 分镜级事件 ---
        // Bug 10: 增加 PROCESSING 与 fallback 状态变更检测
        const shotRenders = creation.shot_renders ?? [];
        for (const shot of shotRenders) {
          const prevStatus = prevShotStatus.get(shot.shot_index);
          if (prevStatus !== shot.status) {
            if (shot.status === 'FINISHED') {
              const shotPayload: SSEShotRenderEventPayload = {
                ...basePayload,
                shot_index: shot.shot_index,
                shot_render_id: shot.shot_render_id,
                render_path: shot.render_path ?? undefined,
              };
              events.push({
                id: `${task.task_id}:shot:${shot.shot_index}:${Date.now()}`,
                type: 'shot.render.completed',
                data: shotPayload,
              });
            } else if (shot.status === 'FAILED') {
              const shotPayload: SSEShotRenderEventPayload = {
                ...basePayload,
                shot_index: shot.shot_index,
                shot_render_id: shot.shot_render_id,
                error_message: shot.error_message ?? undefined,
              };
              events.push({
                id: `${task.task_id}:shot:${shot.shot_index}:${Date.now()}`,
                type: 'shot.render.failed',
                data: shotPayload,
              });
            } else if (shot.status === 'PROCESSING') {
              // Bug 10 新增: 分镜开始处理事件
              const shotPayload: SSEShotRenderEventPayload = {
                ...basePayload,
                shot_index: shot.shot_index,
                shot_render_id: shot.shot_render_id,
              };
              events.push({
                id: `${task.task_id}:shot:${shot.shot_index}:${Date.now()}`,
                type: 'shot.render.processing',
                data: shotPayload,
              });
            } else {
              // Bug 10 新增: 未知状态变更也发出兜底事件
              const shotPayload: SSEShotRenderEventPayload = {
                ...basePayload,
                shot_index: shot.shot_index,
                shot_render_id: shot.shot_render_id,
              };
              events.push({
                id: `${task.task_id}:shot:${shot.shot_index}:${Date.now()}`,
                type: 'shot.render.changed',
                data: shotPayload,
              });
            }
          }
          prevShotStatus.set(shot.shot_index, shot.status);
        }

        // 清理不在当前创作中的旧 shot_index，防止 Map 持续增长
        const currentShotIndices = new Set(shotRenders.map((s) => s.shot_index));
        for (const idx of prevShotStatus.keys()) {
          if (!currentShotIndices.has(idx)) {
            prevShotStatus.delete(idx);
          }
        }

        // --- 任务级事件（末尾发出，作为 takeWhile 终态断连锚点） ---
        const eventType: SSEEventType =
          isFirstEmission && task.status === 'PENDING'
            ? 'task.created'
            : this.resolveEventType(task);
        isFirstEmission = false;

        events.push({
          id: `${task.task_id}:${task.updated_at}`,
          type: eventType,
          data: basePayload,
        });

        // 心跳事件放在最后：确保业务事件先被前端消费
        const now = Date.now();
        if (now - lastHeartbeatAt > TASK_CONSTANTS.SSE_HEARTBEAT_INTERVAL_MS) {
          lastHeartbeatAt = now;
          events.push({
            id: `hb:${task.task_id}:${now}`,
            type: 'heartbeat',
            data: { heartbeat: true },
          } as MessageEvent);
        }

        return from(events);
      }),
      // Bug 5 & Bug 8: 统一异常处理，避免 SSE 连接静默断开
      catchError((err: Error) => {
        const errMsg = err.message || String(err);
        this.logger.warn(`SSE stream terminated for task ${effectiveTaskId}: ${errMsg}`);
        // 将数据库级异常映射为友好错误码
        const mappedMessage = errMsg.includes('TASK_NOT_FOUND') || errMsg.includes('biz_id 为空')
          ? 'TASK_NOT_FOUND'
          : errMsg;
        const errorPayload: SSEEventPayload = {
          task_id: effectiveTaskId,
          status: 'FAILED',
          current_stage: 'FAILED',
          progress: 0,
          message: mappedMessage,
          trace_id: `trc_${randomUUID().slice(0, 8)}`,
          timestamp: new Date().toISOString(),
        };
        const errorEvent: MessageEvent = {
          id: `err:${effectiveTaskId}:${Date.now()}`,
          type: 'task.failed',
          data: errorPayload,
        };
        return of(errorEvent);
      }),
      timeout({
        each: 300_000,
        with: () => {
          const timeoutPayload: SSEEventPayload = {
            task_id: effectiveTaskId,
            status: 'FAILED',
            current_stage: 'FAILED',
            progress: 0,
            message: 'SSE 连接已超过最大生命周期 (5分钟)，任务可能处于长期卡死状态',
            trace_id: `trc_${randomUUID().slice(0, 8)}`,
            timestamp: new Date().toISOString(),
          };
          return of({
            id: `timeout:${effectiveTaskId}:${Date.now()}`,
            type: 'task.failed',
            data: timeoutPayload,
          } as MessageEvent);
        },
      }),
      takeWhile(
        (event) => {
          // 心跳事件不参与终态判断
          if ((event.type as string) === 'heartbeat') return true;
          return !this.isTerminalStatus((event.data as SSEEventPayload).status);
        },
        true,
      ),
      takeUntil(
        new Observable<void>((subscriber) => {
          req.on('close', () => {
            subscriber.next();
            subscriber.complete();
          });
        }),
      ),
    );
  }

  private resolveEventType(task: TaskSummary): SSEEventType {
    if (task.status === 'FAILED') {
      return 'task.failed';
    }
    if (task.status === 'CANCELED') {
      return 'task.canceled';
    }
    if (task.status === 'FINISHED') {
      return 'task.completed';
    }
    if (task.progress > 0) {
      return 'task.progress.updated';
    }
    return 'task.stage.changed';
  }

  private isTerminalStatus(status: TaskSummary['status']): boolean {
    return status === 'FINISHED' || status === 'FAILED' || status === 'CANCELED';
  }
}
