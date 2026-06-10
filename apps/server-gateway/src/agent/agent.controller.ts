// =============================================================================
// TikStream AI — Agent Controller
// LangGraph Agent HTTP 端点
// =============================================================================

import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { AgentService, AgentGenerateInput, AgentGenerateOutput } from './agent.service';
import { buildApiErrorResponse } from '../common/http-error-response';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ApiSuccessResponse, ApiErrorResponse } from '@tikstream/shared-types';

@Controller({ path: 'api/v1/agent', version: '1' })
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * POST /api/v1/agent/generate
   *
   * 异步启动 LangGraph Agent 生成视频剧本（自迭代优化）。
   * 立即返回 { run_id, status: "ACCEPTED" }，前端通过 GET /status/:runId 轮询进度。
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(
    @Body() body: AgentGenerateInput,
    @Res({ passthrough: true }) response: { status(code: number): void },
  ): Promise<ApiSuccessResponse<AgentGenerateOutput> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.agentService.runAgent(body);
      response.status(HttpStatus.OK);
      return {
        success: true,
        message: 'Agent 生成完成',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const status =
        (err as { status?: number })?.status
        || (err as { statusCode?: number })?.statusCode
        || HttpStatus.INTERNAL_SERVER_ERROR;
      response.status(status);
      return buildApiErrorResponse(err, traceId);
    }
  }

  /**
   * GET /api/v1/agent/status/:runId
   *
   * 查询 Agent 运行状态和结果
   */
  @Get('status/:runId')
  async getStatus(
    @Param('runId') runId: string,
    @Res({ passthrough: true }) response: { status(code: number): void },
  ): Promise<ApiSuccessResponse<AgentGenerateOutput> | ApiErrorResponse> {
    const traceId = randomUUID();

    const status = this.agentService.getRunStatus(runId);
    if (!status) {
      response.status(HttpStatus.NOT_FOUND);
      return buildApiErrorResponse(
        { message: '运行记录不存在' } as unknown as Error,
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
