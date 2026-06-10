// =============================================================================
// TikStream AI — Creation Controller (Public API)
// =============================================================================

import { Controller, Post, Get, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiUnprocessableEntityResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { CreationService, CreateCreationResponse, CreationDetailResponse, CancelCreationResponse, CreationListResponse } from './creation.service';
import type { AudioMixConfig } from '../../../../shared/api_types';
import { CreationTemplateService } from './creation-template.service';
import { CreateCreationDto } from './dto/create-creation.dto';
import { ListCreationsDto } from './dto/list-creations.dto';
import { ExportCreationDto } from './dto/export-creation.dto';
import { PatchCreationShotDto } from './dto/patch-creation-shot.dto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  TaskCreatedData,
  PreviewCompositionResponse,
  RerenderShotRequest,
  ReplaceSliceRequest,
  ReplaceSliceResponse,
  PatchCreationShotResponse,
  ExportCreationResponse,
  ShotRenderSummary,
  CreationTemplateDetail,
} from '@tikstream/shared-types';
import { buildApiErrorResponse } from '../common/http-error-response';

@ApiTags('Creation')
@Controller({ path: 'api/v1/creations', version: '1' })
export class CreationController {
  constructor(
    private readonly creationService: CreationService,
    private readonly creationTemplateService: CreationTemplateService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '一键成片创作任务发起',
    description:
      'P0 核心主链路入口：根据 script_id 发起一键成片创作任务。\n\n' +
      '流程：\n' +
      '1. 校验 script_id + product_id 存在性及归属关系\n' +
      '2. 创建 Creation 记录 status=PENDING\n' +
      '3. 异步启动长任务编排 (QUEUE_ALLOCATION → ... → FINISHED)\n' +
      '4. 返回 creation_id / task_id / status',
  })
  @ApiBody({
    type: CreateCreationDto,
    description: '创作任务请求体',
    examples: {
      minimal: {
        summary: '最小必填',
        value: {
          product_id: '00000000-0000-4000-a000-000000000001',
          script_id: '00000000-0000-4000-a000-000000000050',
        },
      },
      full: {
        summary: '全参数',
        value: {
          product_id: '00000000-0000-4000-a000-000000000001',
          script_id: '00000000-0000-4000-a000-000000000050',
          engine_mode: 'SCRIPT_DRIVEN',
          target_resolution: '1080x1920',
          export_format: 'MP4',
          voice_profile: 'default_female_zh',
          bgm_policy: 'auto_match',
          force_refresh: false,
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: '创作任务创建成功，异步编排已启动',
    schema: {
      example: {
        success: true,
        message: '创作任务创建成功',
        data: {
          creation_id: '00000000-0000-4000-a000-000000000100',
          task_id: 'tsk_20260527_000001',
          product_id: '00000000-0000-4000-a000-000000000001',
          script_id: '00000000-0000-4000-a000-000000000050',
          status: 'PENDING',
          current_stage: 'QUEUE_ALLOCATION',
          progress: 0,
        },
        trace_id: 'trc_20260527_creation_00000000',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: '请求参数错误、剧本归属不匹配或校验失败',
    schema: {
      example: {
        success: false,
        message: '剧本不属于指定商品 (script_id=xxx, product_id=yyy)',
        error: { code: 'CREATION_SCRIPT_PRODUCT_MISMATCH', retryable: false },
        trace_id: 'trc_20260527_creation_00000000',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({
    description: '商品或剧本不存在',
    schema: {
      example: {
        success: false,
        message: '商品不存在',
        error: { code: 'PRODUCT_NOT_FOUND', retryable: false },
        trace_id: 'trc_20260527_creation_00000000',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiUnprocessableEntityResponse({
    description: '剧本未包含任何分镜',
    schema: {
      example: {
        success: false,
        message: '剧本未包含任何分镜',
        error: { code: 'SCRIPT_NO_SHOTS_GENERATED', retryable: false },
        trace_id: 'trc_20260527_creation_00000000',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiConflictResponse({
    description: '创作任务已存在 (task_id 重复)',
    schema: {
      example: {
        success: false,
        message: '创作任务已存在，task_id 重复',
        error: { code: 'IDEMPOTENCY_CONFLICT', retryable: false },
        trace_id: 'trc_20260527_creation_00000000',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: '内部服务器错误 (数据库/BullMQ 不可达)',
    schema: {
      example: {
        success: false,
        message: '内部服务器错误',
        error: { code: 'INTERNAL_SERVER_ERROR', retryable: true },
        trace_id: 'trc_20260527_creation_00000000',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  async create(
    @Body() dto: CreateCreationDto,
  ): Promise<ApiSuccessResponse<TaskCreatedData> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.createCreation(dto);

      return {
        success: true,
        message: '创作任务创建成功',
        data: {
          creation_id: result.creation_id,
          task_id: result.task_id,
          status: result.status,
          current_stage: result.current_stage,
          progress: result.progress,
        },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '创作任务列表查询（游标分页）',
    description:
      'P1 任务列表查询端点：根据 product_id 上下文隔离，支持 cursor 游标分页和多维度筛选。\n\n' +
      '筛选维度：\n' +
      '1. product_id（必填，上下文隔离边界）\n' +
      '2. status（PENDING/PROCESSING/FINISHED/FAILED/CANCELED）\n' +
      '3. current_stage（QUEUE_ALLOCATION → ... → FAILED）\n' +
      '4. engine_mode（SCRIPT_DRIVEN）\n' +
      '5. export_format（MP4/MOV/WEBM）\n\n' +
      '排序：created_at DESC + id DESC（最新优先）\n' +
      '分页：base64url cursor token，首次不传',
  })
  @ApiQuery({
    name: 'product_id',
    required: true,
    type: String,
    description: '商品ID（必填，上下文隔离边界）',
    example: '00000000-0000-4000-a000-000000000001',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'PROCESSING', 'FINISHED', 'FAILED', 'CANCELED'],
    description: '创作任务状态筛选',
    example: 'PROCESSING',
  })
  @ApiQuery({
    name: 'current_stage',
    required: false,
    enum: [
      'QUEUE_ALLOCATION',
      'ASSET_MATCHING',
      'AI_VIDEO_GENERATING',
      'TTS_GENERATING',
      'FFMPEG_STITCHING',
      'LOUDNORM_COMPLIANCE',
      'FINISHED',
      'FAILED',
    ],
    description: '当前阶段筛选',
    example: 'AI_VIDEO_GENERATING',
  })
  @ApiQuery({
    name: 'engine_mode',
    required: false,
    enum: ['SCRIPT_DRIVEN'],
    description: '引擎模式筛选',
    example: 'SCRIPT_DRIVEN',
  })
  @ApiQuery({
    name: 'export_format',
    required: false,
    enum: ['MP4', 'MOV', 'WEBM'],
    description: '导出格式筛选',
    example: 'MP4',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: '每页条数 (1~100)',
    example: 20,
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: '游标分页 token (base64url)，首次查询不传',
    example: 'eyJ2IjoiMjAyNi0wNS0yN1QxMjowMDowMC4wMDBaIiwiaSI6IjAwMDAwMDAwLTAwMDAtNDAwMC1hMDAwLTAwMDAwMDAwMDAwMSJ9',
  })
  @ApiOkResponse({
    description: '查询成功，返回创作任务列表与分页元数据',
    schema: {
      example: {
        success: true,
        message: '查询成功',
        data: {
          items: [
            {
              creation_id: '00000000-0000-4000-a000-000000000100',
              product_id: '00000000-0000-4000-a000-000000000001',
              script_id: '00000000-0000-4000-a000-000000000050',
              task_id: 'tsk_20260527_000001',
              engine_mode: 'SCRIPT_DRIVEN',
              target_resolution: '1080x1920',
              export_format: 'MP4',
              status: 'PROCESSING',
              progress: 65,
              current_stage: 'TTS_GENERATING',
              video_url: null,
              file_size_bytes: null,
              trace_id: 'trc_20260527_creation_00000000',
              error_code: null,
              error_message: null,
              started_at: '2026-05-27T08:00:00.000Z',
              finished_at: null,
              created_at: '2026-05-27T12:00:00.000Z',
              updated_at: '2026-05-27T12:00:00.000Z',
            },
          ],
          page_info: {
            cursor: 'eyJ2IjoiMjAyNi0wNS0yN1QxMjowMDowMC4wMDBaIiwiaSI6IjAwMDAwMDAwLTAwMDAtNDAwMC1hMDAwLTAwMDAwMDAwMDAwMCJ9',
            has_more: false,
            total_count: 1,
          },
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: '参数校验失败：product_id缺失/limit越界/筛选值非法',
    schema: {
      example: {
        success: false,
        message: 'product_id 为必填字段，上下文隔离边界不可为空',
        error: {
          code: 'INVALID_REQUEST',
          retryable: false,
          details: [{ field: 'product_id', reason: 'product_id 为必填字段，上下文隔离边界' }],
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: '数据库查询失败 (P1001/P1017/P2024/P2028 等)',
    schema: {
      example: {
        success: false,
        message: '内部服务器错误',
        error: { code: 'INTERNAL_SERVER_ERROR', retryable: true },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  async list(
    @Query() dto: ListCreationsDto,
  ): Promise<ApiSuccessResponse<CreationListResponse> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.listCreations(dto);

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
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '创作模块健康检查',
    description:
      '检查视频生成 API (Seedance) 可用性与队列 Worker 状态。\n\n' +
      '返回内容：\n' +
      '1. seedance: 视频生成 API Key 配置状态与连通性\n' +
      '2. worker: BullMQ 队列积压状态\n' +
      '3. stuck: 卡在 QUEUE_ALLOCATION 阶段的任务 (需传 product_id 参数)',
  })
  @ApiQuery({
    name: 'product_id',
    required: false,
    type: String,
    description: '商品 ID，用于检测该商品下卡住的任务',
  })
  async checkHealth(
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<{
    seedance: { ok: boolean; message: string; configured: boolean };
    worker: { ok: boolean; message: string; queue_waiting: number };
    stuck?: { stuck_count: number; stuck_creation_ids: string[]; auto_failed_count: number };
  }> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const health = await this.creationService.checkCreationHealth();

      let stuck: { stuck_count: number; stuck_creation_ids: string[]; auto_failed_count: number } | undefined;

      if (productId) {
        stuck = await this.creationService.checkStuckCreations(productId);
      }

      return {
        success: true,
        message: '健康检查完成',
        data: { ...health, stuck },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get(':creation_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '创作任务详情查询',
    description:
      'P0 核心查询端点：根据 creation_id 查询创作任务完整详情。\n\n' +
      '返回内容：\n' +
      '1. Creation 记录全部 19 个字段 (status/stage/progress/video_url/error 等)\n' +
      '2. 关联的 ShotRender 列表 (按 shot_index ASC 排序)，每个含 12 个字段\n' +
      '3. status 不同时返回字段差异化：\n' +
      '   - PROCESSING: video_url/finished_at=null\n' +
      '   - FINISHED: video_url/finished_at/file_size_bytes 有值\n' +
      '   - FAILED: error_code/error_message/finished_at 有值',
  })
  @ApiParam({
    name: 'creation_id',
    required: true,
    type: String,
    description: '创作任务 UUID v4',
    example: '00000000-0000-4000-a000-000000000100',
  })
  @ApiOkResponse({
    description: '查询成功，返回创作任务完整详情含 ShotRender 列表',
    schema: {
      example: {
        success: true,
        message: '查询成功',
        data: {
          creation_id: '00000000-0000-4000-a000-000000000100',
          product_id: '00000000-0000-4000-a000-000000000001',
          script_id: '00000000-0000-4000-a000-000000000050',
          task_id: 'tsk_20260527_000001',
          engine_mode: 'SCRIPT_DRIVEN',
          target_resolution: '1080x1920',
          export_format: 'MP4',
          status: 'PROCESSING',
          progress: 65,
          current_stage: 'TTS_GENERATING',
          video_url: null,
          file_size_bytes: null,
          trace_id: 'trc_20260527_creation_00000000',
          error_code: null,
          error_message: null,
          started_at: '2026-05-27T08:00:00.000Z',
          finished_at: null,
          shot_renders: [
            {
              shot_render_id: 'render-uuid-000',
              creation_id: '00000000-0000-4000-a000-000000000100',
              script_shot_id: 'shot-uuid-000',
              shot_id: 'shot_01',
              shot_index: 0,
              cache_hash: 'sha256_abc0000',
              slice_id: 'slc_test_000',
              render_path: 's3://tikstream/renders/.../shot_0.mp4',
              render_duration_ms: 12500,
              retry_count: 0,
              status: 'FINISHED',
              error_message: null,
              updated_at: '2026-05-27T12:00:00.000Z',
            },
          ],
          created_at: '2026-05-27T12:00:00.000Z',
          updated_at: '2026-05-27T12:00:00.000Z',
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'creation_id 缺失、空字符串或非 UUID v4 格式',
    schema: {
      example: {
        success: false,
        message: '创作任务ID不是有效的UUID v4格式: abc123',
        error: {
          code: 'INVALID_REQUEST',
          retryable: false,
          details: [
            {
              field: 'creation_id',
              reason: 'creation_id 不是有效的 UUID v4 格式: abc123',
            },
          ],
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({
    description: '创建任务不存在 (CREATION_NOT_FOUND)',
    schema: {
      example: {
        success: false,
        message: '创作任务不存在 (creation_id=99999999-9999-4999-a999-999999999999)',
        error: {
          code: 'CREATION_NOT_FOUND',
          retryable: false,
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: '数据库查询失败 (P1001/P1017/P2024/P2028 等)',
    schema: {
      example: {
        success: false,
        message: '内部服务器错误',
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          retryable: true,
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  async getDetail(
    @Param('creation_id') creationId: string,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<CreationDetailResponse> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.getCreationDetail(creationId, productId);

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

  @Get(':creation_id/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '创作预览编排查询',
    description: '返回创作时间轴、轨道、字幕与画布参数，供 Remotion 预览工作台直接消费。',
  })
  @ApiParam({
    name: 'creation_id',
    required: true,
    type: String,
    description: '创作任务 UUID v4',
    example: '00000000-0000-4000-a000-000000000100',
  })
  async getPreview(
    @Param('creation_id') creationId: string,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<PreviewCompositionResponse> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.getPreviewComposition(creationId, productId);

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

  @Post(':creation_id/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '创作导出任务触发',
    description:
      '返回当前创作的导出任务上下文。若传入不同的 export_format 或 target_resolution，将触发 restitch 重新导出。',
  })
  @ApiParam({
    name: 'creation_id',
    required: true,
    type: String,
    description: '创作任务 UUID v4',
    example: '00000000-0000-4000-a000-000000000100',
  })
  @ApiBody({ type: ExportCreationDto, description: '可选导出参数: export_format (mp4/mov/webm), target_resolution (1080x1920 等)' })
  async export(
    @Param('creation_id') creationId: string,
    @Query('product_id') productId?: string,
    @Body() body?: ExportCreationDto,
  ): Promise<ApiSuccessResponse<ExportCreationResponse> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.exportCreation(creationId, productId, body);

      return {
        success: true,
        message: result.export_enqueued ? '导出任务已入队，请等待重新合成' : '导出已就绪',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':creation_id/rerender-shot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '分镜级重渲染',
    description: '按 shot_index 触发单分镜重渲染，并返回更新后的 shot render 摘要。',
  })
  @ApiParam({
    name: 'creation_id',
    required: true,
    type: String,
    description: '创作任务 UUID v4',
    example: '00000000-0000-4000-a000-000000000100',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['shot_index'],
      properties: {
        shot_index: { type: 'number', example: 1 },
        force_refresh: { type: 'boolean', example: true },
      },
    },
  })
  async rerenderShot(
    @Param('creation_id') creationId: string,
    @Body() body: RerenderShotRequest,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<ShotRenderSummary> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.rerenderShot(creationId, body.shot_index, body.force_refresh ?? false, productId);

      return {
        success: true,
        message: '分镜重渲染已触发',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':creation_id/replace-slice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '替换分镜素材切片',
    description: '替换指定分镜使用的素材切片，并返回更新后的 shot render 摘要。',
  })
  @ApiParam({
    name: 'creation_id',
    required: true,
    type: String,
    description: '创作任务 UUID v4',
    example: '00000000-0000-4000-a000-000000000100',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['shot_index', 'slice_id'],
      properties: {
        shot_index: { type: 'number', example: 1 },
        slice_id: { type: 'string', example: 'slc_test_0001' },
      },
    },
  })
  async replaceSlice(
    @Param('creation_id') creationId: string,
    @Body() body: ReplaceSliceRequest,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<ReplaceSliceResponse> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.replaceSlice(creationId, body.shot_index, body.slice_id, productId);

      return {
        success: true,
        message: result.rerender_enqueued ? '素材切片已替换，自动触发重渲染' : '素材切片替换已触发',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':creation_id/restitch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '快速重新合成完整视频（restitch）',
    description:
      '复用已缓存的各分镜视频，跳过 AI 生成和 TTS，直接 FFmpeg 拼接完整视频。\n\n' +
      '适用场景：修改分镜字幕 / 替换切片 / 调整时长后，一键获得最终视频。',
  })
  @ApiParam({
    name: 'creation_id',
    required: true,
    type: String,
    description: '创作任务 UUID v4',
  })
  async restitch(
    @Param('creation_id') creationId: string,
    @Query('product_id') productId?: string,
    @Body() body?: { audio_mix_config?: AudioMixConfig },
  ): Promise<ApiSuccessResponse<CreateCreationResponse> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.restitchCreation(
        creationId,
        productId,
        undefined,
        undefined,
        undefined,
        body?.audio_mix_config,
      );

      return {
        success: true,
        message: '快速重新合成已触发',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Patch(':creation_id/shots/:shot_index')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '分镜级编辑（时长/字幕）',
    description:
      '在创作层直接修改分镜时长或字幕文案，直写 ScriptShot 并重置对应 ShotRender。\n\n' +
      '修改时长后需调用 restitch 重新合成完整视频。',
  })
  @ApiParam({ name: 'creation_id', required: true, type: String, description: '创作任务 UUID v4' })
  @ApiParam({ name: 'shot_index', required: true, type: Number, description: '分镜索引', example: 0 })
  @ApiBody({ type: PatchCreationShotDto, description: '修改字段（duration 和/或 subtitle_text）' })
  async patchShot(
    @Param('creation_id') creationId: string,
    @Param('shot_index') shotIndex: number,
    @Body() body: PatchCreationShotDto,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<PatchCreationShotResponse> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.patchCreationShot(
        creationId,
        Number(shotIndex),
        body,
        productId,
      );

      return {
        success: true,
        message: `分镜 ${shotIndex} 已更新: ${result.updated_fields.join(', ')}`,
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':creation_id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '重试创作任务',
    description: '将失败或中断的创作任务重置为待处理状态，并返回同一 creation 的最新任务上下文。',
  })
  @ApiParam({
    name: 'creation_id',
    required: true,
    type: String,
    description: '创作任务 UUID v4',
    example: '00000000-0000-4000-a000-000000000100',
  })
  async retry(
    @Param('creation_id') creationId: string,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<CreateCreationResponse> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.retryCreation(creationId, productId);

      return {
        success: true,
        message: '创作任务已重试',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':creation_id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '主动取消创作任务',
    description:
      'P1 取消进行中的创作任务。\n\n' +
      '流程：\n' +
      '1. 校验 creation_id UUID v4 格式\n' +
      '2. 查询 Creation 记录存在性\n' +
      '3. 校验状态允许取消 (仅 PENDING/PROCESSING)\n' +
      '4. 更新 status=CANCELED + current_stage=FAILED + finished_at=now\n' +
      '5. BullMQ 移除队列任务 (最佳努力, 失败不阻断)\n' +
      '6. 返回 creation_id + status=CANCELED\n\n' +
      '幂等性：\n' +
      '- 已取消(CANCELED) → 409 "创作任务已经被取消"\n' +
      '- 已完成(FINISHED) → 409 "创作任务已完成，无法取消"\n' +
      '- 已失败(FAILED)  → 409 "创作任务已失败，请使用重试接口"',
  })
  @ApiParam({
    name: 'creation_id',
    required: true,
    type: String,
    description: '创作任务 UUID v4',
    example: '00000000-0000-4000-a000-000000000100',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: '取消成功，Creation 状态更新为 CANCELED',
    schema: {
      example: {
        success: true,
        message: '创作任务已取消',
        data: {
          creation_id: '00000000-0000-4000-a000-000000000100',
          status: 'CANCELED',
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'creation_id 缺失、空字符串或非 UUID v4 格式',
    schema: {
      example: {
        success: false,
        message: '创作任务ID不是有效的UUID v4格式: abc123',
        error: {
          code: 'INVALID_REQUEST',
          retryable: false,
          details: [
            {
              field: 'creation_id',
              reason: 'creation_id 不是有效的 UUID v4 格式: abc123',
            },
          ],
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({
    description: '创作任务不存在 (CREATION_NOT_FOUND)',
    schema: {
      example: {
        success: false,
        message: '创作任务不存在 (creation_id=99999999-9999-4999-a999-999999999999)',
        error: {
          code: 'CREATION_NOT_FOUND',
          retryable: false,
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiConflictResponse({
    description: '状态不允许取消 (TASK_STATUS_CONFLICT)',
    schema: {
      example: {
        success: false,
        message: '创作任务已完成，无法取消',
        error: {
          code: 'TASK_STATUS_CONFLICT',
          retryable: false,
          details: {
            creation_status: 'FINISHED',
            reason: 'already_finished',
          },
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: '数据库操作失败 (Prisma P1001/P1017/P2024/P2028 等)',
    schema: {
      example: {
        success: false,
        message: '内部服务器错误',
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          retryable: true,
        },
        trace_id: 'trc_12345678',
        timestamp: '2026-05-27T12:00:00.000Z',
      },
    },
  })
  async cancel(
    @Param('creation_id') creationId: string,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<CancelCreationResponse> | ApiErrorResponse> {
    const traceId = this.makeTraceId();

    try {
      const result = await this.creationService.cancelCreation(creationId, productId);

      return {
        success: true,
        message: '创作任务已取消',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ============================================================
  // 创作模板 (Phase 2)
  // ============================================================

  @Post(':creation_id/save-as-template')
  @HttpCode(HttpStatus.OK)
  async saveAsTemplate(
    @Param('creation_id') creationId: string,
    @Body() body: { name: string },
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<CreationTemplateDetail> | ApiErrorResponse> {
    const traceId = this.makeTraceId();
    try {
      const result = await this.creationTemplateService.saveAsTemplate(creationId, body.name, productId);
      return {
        success: true,
        message: '模板已保存',
        data: result as CreationTemplateDetail,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('templates/list')
  async listCreationTemplates(
    @Query('product_id') productId?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ): Promise<ApiSuccessResponse<{ templates: CreationTemplateDetail[]; totalCount: number }> | ApiErrorResponse> {
    const traceId = this.makeTraceId();
    try {
      const result = await this.creationTemplateService.listTemplates(
        productId,
        page ? Math.max(1, parseInt(page, 10) || 1) : 1,
        pageSize ? Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20)) : 20,
      );
      return {
        success: true,
        message: '模板列表',
        data: { templates: result.items as CreationTemplateDetail[], totalCount: result.total },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Delete('templates/:template_id')
  @HttpCode(HttpStatus.OK)
  async deleteCreationTemplate(
    @Param('template_id') templateId: string,
  ): Promise<ApiSuccessResponse<object> | ApiErrorResponse> {
    const traceId = this.makeTraceId();
    try {
      const result = await this.creationTemplateService.deleteTemplate(templateId);
      return {
        success: true,
        message: '模板已删除',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ===========================================================================
  // Private: helpers
  // ===========================================================================

  private makeTraceId(): string {
    return `trc_${randomUUID().slice(0, 8)}`;
  }
}
