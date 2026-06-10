// =============================================================================
// TikStream AI — Trend Tracker Controller
// =============================================================================

import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { TrendTrackerService } from './trend-tracker.service';
import { SearchTrendDto } from './dto/search-trend.dto';
import { RefreshTrendDto } from './dto/refresh-trend.dto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  TrendTrackerResponse,
} from '@tikstream/shared-types';

@ApiTags('Trend Tracker')
@Controller('api/v1/trend-tracker')
export class TrendTrackerController {
  private readonly logger = new Logger(TrendTrackerController.name);

  constructor(private readonly trendTrackerService: TrendTrackerService) {}

  @Get()
  @ApiOperation({
    summary: '获取商品趋势快照',
    description: '返回当前 TikTok 热门趋势及与指定商品的匹配分析和蹭流量建议。支持 1 小时缓存复用。',
  })
  @ApiQuery({ name: 'product_id', required: true, type: String, description: '商品ID' })
  @ApiResponse({ status: 200, description: '趋势快照' })
  async getTrends(
    @Query() query: SearchTrendDto,
  ): Promise<ApiSuccessResponse<TrendTrackerResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.trendTrackerService.getTrends(query.product_id);

      return {
        success: true,
        message: '趋势快照获取成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[GET /trend-tracker] error: ${error instanceof Error ? error.message : String(error)}`);
      return this.buildApiErrorResponse(error, traceId);
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '强制刷新趋势快照',
    description: '忽略缓存，调用 AI 重新生成趋势分析',
  })
  @ApiResponse({ status: 200, description: '刷新后的趋势快照' })
  async refreshTrends(
    @Body() body: RefreshTrendDto,
  ): Promise<ApiSuccessResponse<TrendTrackerResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.trendTrackerService.refreshTrends(body.product_id);

      return {
        success: true,
        message: '趋势快照刷新成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[POST /trend-tracker/refresh] error: ${error instanceof Error ? error.message : String(error)}`);
      return this.buildApiErrorResponse(error, traceId);
    }
  }

  // =========================================================================
  // Private: Error Handling
  // =========================================================================

  private buildApiErrorResponse(
    error: unknown,
    traceId: string,
  ): ApiErrorResponse {
    if (error instanceof Error && 'getStatus' in error) {
      const httpError = error as Error & { getStatus(): number; getResponse(): object };
      const status = httpError.getStatus();
      const response = httpError.getResponse();

      if (status === 404) {
        return {
          success: false,
          message: '趋势快照不存在',
          error: { code: 'TREND_SNAPSHOT_NOT_FOUND', retryable: false },
          trace_id: traceId,
          timestamp: new Date().toISOString(),
        };
      }

      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? String((response as { message: unknown }).message)
          : '服务不可用';

      return {
        success: false,
        message,
        error: { code: 'INTERNAL_SERVER_ERROR', retryable: true },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : '内部服务器错误',
      error: { code: 'INTERNAL_SERVER_ERROR', retryable: false },
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }
}
