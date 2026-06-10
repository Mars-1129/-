// =============================================================================
// TikStream AI — Multi-Agent Controller
// 多 Agent 协作 HTTP 端点
// =============================================================================

import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { MultiAgentOrchestratorService, MultiAgentGenerateInput, MultiAgentGenerateOutput } from './orchestrator.service';
import { buildApiErrorResponse } from '../../common/http-error-response';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ApiSuccessResponse, ApiErrorResponse } from '@tikstream/shared-types';

@Controller({ path: 'api/v1/agent/multi', version: '1' })
export class MultiAgentController {
  constructor(private readonly orchestrator: MultiAgentOrchestratorService) {}

  /**
   * POST /api/v1/agent/multi/generate
   *
   * 触发多 Agent 协作：Copywriter → Director → Composer → Compliance → Optimizer
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(
    @Body() body: MultiAgentGenerateInput,
    @Res({ passthrough: true }) response: { status(code: number): void },
  ): Promise<ApiSuccessResponse<MultiAgentGenerateOutput> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.orchestrator.runMultiAgent(body);
      response.status(HttpStatus.OK);
      return {
        success: true,
        message: `多 Agent 协作完成 — ${result.agent_traces.length} 个 Agent 参与，剧本共 ${result.script_shots_count} 个分镜`,
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
   * GET /api/v1/agent/multi/status/:runId
   *
   * 查询多 Agent 运行状态
   */
  @Get('status/:runId')
  async getStatus(
    @Param('runId') runId: string,
    @Res({ passthrough: true }) response: { status(code: number): void },
  ): Promise<ApiSuccessResponse<MultiAgentGenerateOutput> | ApiErrorResponse> {
    const traceId = randomUUID();

    const status = this.orchestrator.getRunStatus(runId);
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
