// =============================================================================
// TikStream AI — Auto A/B Controller
// 自动 A/B 出片对比 API 端点
// =============================================================================

import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, HttpException, Res } from '@nestjs/common';
import { AutoAbPipelineService, AutoAbRunInput, AutoAbRunOutput } from './auto-ab-pipeline.service';
import { buildApiErrorResponse } from '../common/http-error-response';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ApiSuccessResponse, ApiErrorResponse } from '@tikstream/shared-types';

@Controller({ path: 'api/v1/auto-ab', version: '1' })
export class AutoAbController {
  constructor(private readonly pipelineService: AutoAbPipelineService) {}

  /**
   * POST /api/v1/auto-ab/run
   *
   * 自动 A/B 出片对比：生成多风格变体 → 创建创作 → 轮询等待 → 对比分析 → 优胜推荐
   */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  async run(
    @Body() body: AutoAbRunInput,
    @Res({ passthrough: true }) response: { status(code: number): void },
  ): Promise<ApiSuccessResponse<AutoAbRunOutput> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      if (!body.product_id || !body.script_id) {
        response.status(HttpStatus.BAD_REQUEST);
        return buildApiErrorResponse(
          new HttpException('product_id 和 script_id 为必填参数', HttpStatus.BAD_REQUEST),
          traceId,
        );
      }

      const result = await this.pipelineService.runPipeline(body);
      response.status(HttpStatus.OK);
      return {
        success: true,
        message: 'A/B 对比分析完成',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(err, traceId);
    }
  }

  /**
   * GET /api/v1/auto-ab/status/:runId
   *
   * 查询 A/B 管道运行状态
   */
  @Get('status/:runId')
  async getStatus(
    @Param('runId') runId: string,
    @Res({ passthrough: true }) response: { status(code: number): void },
  ): Promise<ApiSuccessResponse<AutoAbRunOutput> | ApiErrorResponse> {
    const traceId = randomUUID();

    const status = this.pipelineService.getRunStatus(runId);
    if (!status) {
      response.status(HttpStatus.NOT_FOUND);
      return buildApiErrorResponse(
        new HttpException('运行记录不存在', HttpStatus.NOT_FOUND),
        traceId,
      );
    }

    response.status(HttpStatus.OK);
    return {
      success: true,
      message: '查询成功',
      data: status,
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }
}
