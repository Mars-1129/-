// =============================================================================
// TikStream AI — Watermark Controller
// =============================================================================

import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { WatermarkService } from './watermark.service';
import { ApplyWatermarkDto } from './dto/apply-watermark.dto';
import { VerifyWatermarkDto } from './dto/verify-watermark.dto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  WatermarkApplyResponse,
  WatermarkVerifyResult,
  WatermarkConfig,
} from '@tikstream/shared-types';

@ApiTags('Watermark')
@Controller('api/v1')
export class WatermarkController {
  private readonly logger = new Logger(WatermarkController.name);

  constructor(private readonly watermarkService: WatermarkService) {}

  @Post('creations/:creation_id/watermark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '为创作视频应用水印',
    description: '设置水印配置并触发带水印的重新合成。支持可见文字水印 + 隐水印元数据 + 版权信息注入。',
  })
  @ApiParam({ name: 'creation_id', required: true, type: String, description: '创作ID' })
  @ApiResponse({ status: 200, description: '水印已应用' })
  async applyWatermark(
    @Param('creation_id') creationId: string,
    @Body() dto: ApplyWatermarkDto,
  ): Promise<ApiSuccessResponse<WatermarkApplyResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const config: WatermarkConfig = {
        enabled: dto.enabled,
        type: dto.type as WatermarkConfig['type'],
        visible: dto.visible as WatermarkConfig['visible'],
        invisible: dto.invisible as WatermarkConfig['invisible'],
        copyright: dto.copyright as WatermarkConfig['copyright'],
      };

      const result = await this.watermarkService.applyWatermark(
        creationId,
        config,
        dto.force_render ?? false,
      );

      return {
        success: true,
        message: result.watermark_applied
          ? '水印配置已保存并触发重新合成'
          : '水印配置已保存',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[POST watermark] error: ${error instanceof Error ? error.message : String(error)}`);
      return this.buildApiErrorResponse(error, traceId);
    }
  }

  @Delete('creations/:creation_id/watermark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '移除创作视频的水印',
    description: '清除水印配置并触发无 watermark 的重新合成',
  })
  @ApiParam({ name: 'creation_id', required: true, type: String, description: '创作ID' })
  @ApiResponse({ status: 200, description: '水印已移除' })
  async removeWatermark(
    @Param('creation_id') creationId: string,
  ): Promise<ApiSuccessResponse<{ success: boolean }> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.watermarkService.removeWatermark(creationId);
      return {
        success: true,
        message: '水印已移除',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[DELETE watermark] error: ${error instanceof Error ? error.message : String(error)}`);
      return this.buildApiErrorResponse(error, traceId);
    }
  }

  @Post('watermark/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '验证视频水印',
    description: '使用 ffprobe 提取视频的版权元数据和水印 payload，验证水印完整性',
  })
  @ApiResponse({ status: 200, description: '水印验证结果' })
  async verifyWatermark(
    @Body() dto: VerifyWatermarkDto,
  ): Promise<ApiSuccessResponse<WatermarkVerifyResult> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.watermarkService.verifyWatermark(dto.video_url);
      return {
        success: true,
        message: '水印验证完成',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`[POST watermark/verify] error: ${error instanceof Error ? error.message : String(error)}`);
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
