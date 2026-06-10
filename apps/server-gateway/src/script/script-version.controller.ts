// =============================================================================
// TikStream AI — Script Version Controller
// 剧本版本历史 API 端点
// =============================================================================

import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  HttpStatus,
  HttpException,
  ParseIntPipe,
  DefaultValuePipe,
  Logger,
} from '@nestjs/common';
import { ScriptVersionService } from './script-version.service';
import { randomUUID } from 'crypto';

@Controller('api/v1/scripts')
export class ScriptVersionController {
  private readonly logger = new Logger(ScriptVersionController.name);

  constructor(private readonly scriptVersionService: ScriptVersionService) {}

  /**
   * GET /api/v1/scripts/:scriptId/versions
   * 列出某剧本的所有版本
   */
  @Get(':scriptId/versions')
  async listVersions(
    @Param('scriptId') scriptId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('page_size', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    const traceId = randomUUID();
    try {
      const result = await this.scriptVersionService.listVersions(scriptId, page, pageSize);
      return {
        success: true,
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${traceId}] listVersions 失败: ${msg}`);
      throw new HttpException(
        { success: false, message: msg, trace_id: traceId, timestamp: new Date().toISOString() },
        error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/v1/scripts/:scriptId/versions/:versionId
   * 获取某版本详情（含完整 snapshot）
   */
  @Get(':scriptId/versions/:versionId')
  async getVersion(
    @Param('scriptId') scriptId: string,
    @Param('versionId') versionId: string,
  ) {
    const traceId = randomUUID();
    try {
      const result = await this.scriptVersionService.getVersion(scriptId, versionId);
      return {
        success: true,
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${traceId}] getVersion 失败: ${msg}`);
      throw new HttpException(
        { success: false, message: msg, trace_id: traceId, timestamp: new Date().toISOString() },
        error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/v1/scripts/:scriptId/versions/:versionId/rollback
   * 回滚到指定版本
   */
  @Post(':scriptId/versions/:versionId/rollback')
  async rollback(
    @Param('scriptId') scriptId: string,
    @Param('versionId') versionId: string,
  ) {
    const traceId = randomUUID();
    try {
      await this.scriptVersionService.rollback(scriptId, versionId);
      return {
        success: true,
        message: '已回滚到指定版本',
        data: { script_id: scriptId },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${traceId}] rollback 失败: ${msg}`);
      throw new HttpException(
        { success: false, message: msg, trace_id: traceId, timestamp: new Date().toISOString() },
        error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
