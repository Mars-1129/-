// =============================================================================
// TikStream AI — Internal Creation Controller (Worker → Gateway Callback)
// =============================================================================

import { Controller, Post, Body, HttpCode, HttpStatus, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiOkResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  StageCallbackRequest,
  ExportCallbackRequest,
  FailureCallbackRequest,
  ShotCompletionCallbackRequest,
} from '@tikstream/shared-types';
import { CreationService } from './creation.service';
import { CreationRepository } from './creation.repository';
import { OriginalityService } from '../originality/originality.service';
import { AsrSubtitleService } from '../asr-subtitle/asr-subtitle.service';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';

@ApiTags('Internal / Creation')
@UseGuards(InternalAuthGuard)
@Controller({ path: 'api/internal/v1/creations', version: '1' })
export class InternalCreationController {
  private readonly logger = new Logger(InternalCreationController.name);

  /** 校验并解析 Worker 回调的 trace_id，防止日志注入和伪造 */
  private resolveTraceId(raw: string | undefined): string {
    if (raw && raw.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(raw)) {
      return raw;
    }
    return randomUUID();
  }

  constructor(
    private readonly creationService: CreationService,
    private readonly creationRepository: CreationRepository,
    private readonly originalityService: OriginalityService,
    private readonly asrSubtitleService: AsrSubtitleService,
  ) {}

  @Post('stage-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[内部] 创作阶段变更回调 (Worker → Gateway)',
    description: 'Worker 每次阶段推进时回调 Gateway 更新 Creation 状态和进度',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务ID' },
        creation_id: { type: 'string', description: '创作ID' },
        current_stage: { type: 'string', description: '当前阶段' },
        progress: { type: 'number', description: '进度 0-100' },
        message: { type: 'string', description: '阶段消息' },
        trace_id: { type: 'string', description: '追踪ID' },
      },
    },
  })
  @ApiOkResponse({ description: '回调已接受' })
  @ApiInternalServerErrorResponse({ description: '内部服务器错误' })
  async handleStageCallback(
    @Body() body: StageCallbackRequest,
  ): Promise<ApiSuccessResponse<{ accepted: boolean }> | ApiErrorResponse> {
    const traceId = this.resolveTraceId(body.trace_id);

    this.logger.log(
      `[STAGE_CALLBACK] creation_id=${body.creation_id} task_id=${body.task_id} stage=${body.current_stage} progress=${body.progress}`,
    );

    await this.creationService.handleStageCallback({
      task_id: body.task_id,
      current_stage: body.current_stage,
      progress: body.progress,
      message: body.message,
      trace_id: traceId,
    });

    return {
      success: true,
      message: 'Stage callback accepted',
      data: { accepted: true },
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('export-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[内部] 导出完成回调 (Worker → Gateway)',
    description: 'Worker 导出视频完成后回调 Gateway 更新 video_url 和 file_size',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务ID' },
        creation_id: { type: 'string', description: '创作ID' },
        video_url: { type: 'string', description: '视频URL' },
        file_size_bytes: { type: 'number', description: '文件大小(字节)' },
        duration_seconds: { type: 'number', description: '视频时长(秒)' },
        trace_id: { type: 'string', description: '追踪ID' },
      },
    },
  })
  @ApiOkResponse({ description: '回调已接受' })
  @ApiInternalServerErrorResponse({ description: '内部服务器错误' })
  async handleExportCallback(
    @Body() body: ExportCallbackRequest,
  ): Promise<ApiSuccessResponse<{ accepted: boolean }> | ApiErrorResponse> {
    const traceId = this.resolveTraceId(body.trace_id);

    this.logger.log(
      `[EXPORT_CALLBACK] creation_id=${body.creation_id} task_id=${body.task_id} video_url=${body.video_url} size=${body.file_size_bytes}`,
    );

    await this.creationService.handleExportCallback({
      task_id: body.task_id,
      video_url: body.video_url,
      file_size_bytes: body.file_size_bytes,
      trace_id: traceId,
    });

    return {
      success: true,
      message: 'Export callback accepted',
      data: { accepted: true },
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('shot-completion-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[内部] 分镜完成回调 (Worker → Gateway)',
    description: 'Worker 完成单分镜视频生成后回调 Gateway 更新分镜渲染状态和视频路径',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务ID' },
        creation_id: { type: 'string', description: '创作ID' },
        shot_index: { type: 'number', description: '分镜索引' },
        shot_id: { type: 'string', description: '分镜ID' },
        video_url: { type: 'string', description: '分镜视频URL' },
        render_path: { type: 'string', description: '分镜渲染路径' },
        duration_seconds: { type: 'number', description: '视频时长(秒)' },
        trace_id: { type: 'string', description: '追踪ID' },
        source: { type: 'string', description: '生成来源: RENDERED (AI生成) 或 CACHE_HIT (缓存)' },
        seedance_prompt: { type: 'string', description: 'Seedance 使用的图文 Prompt' },
      },
    },
  })
  @ApiOkResponse({ description: '分镜完成回调已接受' })
  @ApiInternalServerErrorResponse({ description: '内部服务器错误' })
  async handleShotCompletionCallback(
    @Body() body: ShotCompletionCallbackRequest,
  ): Promise<ApiSuccessResponse<{ accepted: boolean }> | ApiErrorResponse> {
    const traceId = this.resolveTraceId(body.trace_id);

    this.logger.log(
      `[SHOT_COMPLETION] creation_id=${body.creation_id} shot_index=${body.shot_index} render_path=${body.render_path}`,
    );

    await this.creationService.handleShotCompletionCallback({
      task_id: body.task_id,
      creation_id: body.creation_id,
      shot_index: body.shot_index,
      video_url: body.video_url,
      render_path: body.render_path,
      trace_id: traceId,
      source: body.source,
      seedance_prompt: body.seedance_prompt,
    });

    return {
      success: true,
      message: 'Shot completion callback accepted',
      data: { accepted: true },
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('failure-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[内部] 任务失败回调 (Worker → Gateway)',
    description: 'Worker 任务失败时回调 Gateway 更新 Creation 失败状态和错误信息',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务ID' },
        creation_id: { type: 'string', description: '创作ID' },
        error_code: { type: 'string', description: '错误码' },
        error_message: { type: 'string', description: '错误消息' },
        current_stage: { type: 'string', description: '失败时所在阶段' },
        shot_index: { type: 'number', description: '失败分镜索引(可选)' },
        trace_id: { type: 'string', description: '追踪ID' },
      },
    },
  })
  @ApiOkResponse({ description: '回调已接受' })
  @ApiInternalServerErrorResponse({ description: '内部服务器错误' })
  async handleFailureCallback(
    @Body() body: FailureCallbackRequest,
  ): Promise<ApiSuccessResponse<{ accepted: boolean }> | ApiErrorResponse> {
    const traceId = this.resolveTraceId(body.trace_id);

    this.logger.error(
      `[FAILURE_CALLBACK] creation_id=${body.creation_id} task_id=${body.task_id} error=${body.error_code} stage=${body.current_stage}`,
    );

    await this.creationService.handleFailureCallback({
      task_id: body.task_id,
      error_code: body.error_code,
      error_message: body.error_message,
      current_stage: body.current_stage,
      trace_id: traceId,
    });

    return {
      success: true,
      message: 'Failure callback accepted',
      data: { accepted: true },
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('originality-check-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[内部] 原创度检测回调 (Worker → Gateway)',
    description: 'Worker 拼接触发完成后回调 Gateway 检查视频原创度，返回相似度分析和优化建议',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务ID' },
        creation_id: { type: 'string', description: '创作ID' },
        video_description: { type: 'string', description: '视频整体描述文本' },
        scene_descriptions: { type: 'array', items: { type: 'string' }, description: '逐分镜场景描述' },
        trace_id: { type: 'string', description: '追踪ID' },
      },
    },
  })
  @ApiOkResponse({ description: '原创度检测结果' })
  @ApiInternalServerErrorResponse({ description: '检测服务异常' })
  async handleOriginalityCheckCallback(
    @Body() body: { task_id: string; creation_id: string; video_description: string; scene_descriptions?: string[]; trace_id?: string },
  ): Promise<ApiSuccessResponse<{ passed: boolean; optimizer?: unknown }> | ApiErrorResponse> {
    const traceId = this.resolveTraceId(body.trace_id);

    this.logger.log(`[ORIGINALITY_CHECK] creation_id=${body.creation_id} task_id=${body.task_id}`);

    const result = await this.originalityService.checkOriginality(
      body.creation_id,
      body.video_description,
      body.scene_descriptions,
    );

    return {
      success: true,
      message: result.passed ? '原创度检测通过' : '检测到疑似重复视频',
      data: {
        passed: result.passed,
        optimizer: result.optimizer ?? undefined,
      },
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('asr-subtitle-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[内部] ASR 字幕时间轴回调 (Worker → Gateway)',
    description: 'Worker 拼接触发完成后回调 Gateway 执行 ASR 转录 + 时间轴对齐，返回精确字幕时间戳',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务ID' },
        creation_id: { type: 'string', description: '创作ID' },
        audio_path: { type: 'string', description: '提取的音频文件路径 (WAV, 16kHz, mono)' },
        language: { type: 'string', description: '语种代码 (zh/en/auto)' },
        trace_id: { type: 'string', description: '追踪ID' },
      },
    },
  })
  @ApiOkResponse({ description: 'ASR 转录与对齐结果' })
  @ApiInternalServerErrorResponse({ description: 'ASR 服务异常' })
  async handleAsrSubtitleCallback(
    @Body() body: { task_id: string; creation_id: string; audio_path: string; language?: string; trace_id?: string },
  ): Promise<ApiSuccessResponse<{
    success: boolean;
    asr_segments?: Array<{ start_sec: number; end_sec: number; text: string; confidence?: number }>;
    aligned_entries?: Array<{ shot_index: number; text: string; start_sec: number; end_sec: number }>;
    subtitle_srt?: string;
  }> | ApiErrorResponse> {
    const traceId = this.resolveTraceId(body.trace_id);
    const lang = body.language || 'auto';

    this.logger.log(`[ASR_SUBTITLE] creation_id=${body.creation_id} lang=${lang} audio=${body.audio_path}`);

    // 使用 AsrSubtitleService 的对齐功能生成精确时间轴
    // 注意：ASR 转录由 GPU Worker 的 audio_analyzer.py 完成，Gateway 只做对齐
    const asrSegments = await this.fetchAsrSegments(body.audio_path, lang);

    if (!asrSegments || asrSegments.length === 0) {
      return {
        success: true,
        message: 'ASR 转录返回空结果，使用默认时间轴',
        data: { success: false },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    }

    // 获取该创作的脚本字幕
    let scriptSubtitles: Array<{ shot_index: number; text: string }> = [];
    try {
      const creation = await this.creationRepository.findCreationById(body.creation_id);
      if (creation) {
        const script = await this.creationRepository.findScriptWithShots(creation.scriptId);
        if (script?.shots) {
          scriptSubtitles = script.shots.map((shot, idx) => ({
            shot_index: idx + 1,
            text: shot.subtitleText || shot.voiceoverText || '',
          })).filter(s => s.text.length > 0);
        }
      }
    } catch {
      this.logger.warn(`[ASR_SUBTITLE] Could not fetch script subtitles for creation ${body.creation_id}`);
    }

    // 时间轴对齐
    const alignResult = await this.asrSubtitleService.alignTimeline({
      script_subtitles: scriptSubtitles,
      asr_segments: asrSegments,
    });

    // 生成 SRT 字幕文件
    const srtResult = this.asrSubtitleService.generateSubtitleFile({
      entries: alignResult.entries,
      format: 'srt',
      language: lang,
    });

    return {
      success: true,
      message: alignResult.success ? `ASR 对齐完成 (${alignResult.entries.length} 条, 置信度 ${alignResult.average_confidence})` : 'ASR 对齐降级',
      data: {
        success: alignResult.success,
        asr_segments: asrSegments.map(s => ({
          start_sec: s.start_sec,
          end_sec: s.end_sec,
          text: s.text,
          confidence: s.confidence,
        })),
        aligned_entries: alignResult.entries.map(e => ({
          shot_index: e.shot_index,
          text: e.text,
          start_sec: e.start_sec,
          end_sec: e.end_sec,
        })),
        subtitle_srt: srtResult.content,
      },
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 从 GPU Worker 获取 ASR 转录结果
   * 通过 HTTP 调用 audio_analyzer.py transcribe 命令
   */
  private async fetchAsrSegments(
    audioPath: string,
    language: string,
  ): Promise<Array<{ start_sec: number; end_sec: number; text: string; confidence?: number; word_timestamps?: Array<{ word: string; start_sec: number; end_sec: number }> }> | null> {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);

      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const scriptPath = require('path').resolve(
        __dirname,
        '..', '..', '..', '..',
        'workers', 'gpu-slicing-worker', 'python_scripts', 'audio_analyzer.py',
      );

      const { stdout } = await execFileAsync(
        pythonCmd,
        [scriptPath, 'transcribe', audioPath, language],
        { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 },
      );

      const result = JSON.parse(stdout.trim());
      if (result.success && result.segments) {
        return result.segments as Array<{
          start_sec: number; end_sec: number; text: string; confidence?: number;
          word_timestamps?: Array<{ word: string; start_sec: number; end_sec: number }>;
        }>;
      }
      return null;
    } catch (error) {
      this.logger.warn(`[ASR_SUBTITLE] fetchAsrSegments failed: ${(error as Error).message}`);
      return null;
    }
  }
}
