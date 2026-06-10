// =============================================================================
// TikStream AI — Posting Time Controller
// POST /api/v1/posting-time/optimize   投放时段优化
// GET  /api/v1/posting-time/platforms  支持平台列表
// =============================================================================

import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { PostingTimeService } from './posting-time.service';
import { OptimizePostingTimeRequestDto } from './dto/optimize-posting-time.dto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  PostingTimeOptimization,
} from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';
import { buildApiErrorResponse } from '../common/http-error-response';

@ApiTags('Posting Time Optimizer')
@Controller('api/v1/posting-time')
export class PostingTimeController {
  constructor(
    private readonly postingTimeService: PostingTimeService,
  ) {}

  @Post('optimize')
  @ApiOperation({
    summary: '投放时段优化',
    description:
      '基于行业黄金时段规则 + 品类修正 + 竞争避让，为商品推荐最佳发布时间段。同一商品+平台组合缓存 24 小时。',
  })
  @ApiBody({ type: OptimizePostingTimeRequestDto })
  @ApiResponse({
    status: 200,
    description: '时段优化结果',
    schema: {
      example: {
        success: true,
        message: '优化完成',
        data: {
          product_id: 'uuid',
          platform: 'douyin',
          recommendations: [
            {
              day_of_week: '周一',
              time_range: { start: '21:00', end: '23:00' },
              score: 92,
              expected_ctr_boost: 0.42,
              competition_level: 'high',
              audience_activity: 'peak',
              reasoning: '抖音晚黄金档时段：全天流量顶点，完播率最高。',
            },
          ],
          avoid_slots: [
            {
              reason: '电商直播晚间大场（20:00-24:00），流量被大主播锁死',
              time_range: { start: '20:00', end: '24:00' },
              severity: 'must_avoid',
            },
          ],
          baseline_ctr: 0.05,
          expected_ctr_lift: 0.42,
          data_source: 'INDUSTRY_HEURISTIC',
          generated_at: '2026-01-01T00:00:00.000Z',
        },
        trace_id: 'uuid',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: '不支持的平台或参数错误' })
  @ApiResponse({ status: 404, description: '商品不存在' })
  async optimizePostingTime(
    @Body() body: OptimizePostingTimeRequestDto,
  ): Promise<ApiSuccessResponse<PostingTimeOptimization> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.postingTimeService.optimize(body);
      return {
        success: true,
        message: '优化完成',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('platforms')
  @ApiOperation({
    summary: '获取支持平台列表',
    description: '返回系统支持投放时段优化的全部平台及对应时区。',
  })
  @ApiResponse({ status: 200, description: '平台列表' })
  async getPlatforms(): Promise<ApiSuccessResponse<Array<{ platform: string; display_name: string; timezone: string }>> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const platforms = this.postingTimeService.getSupportedPlatforms();
      return {
        success: true,
        message: '支持平台列表',
        data: platforms,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }
}
