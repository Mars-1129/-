// =============================================================================
// TikStream AI — Script Controller
// =============================================================================

import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, ParseArrayPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { ScriptService } from './script.service';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { ScriptQuickGenerateDto } from './dto/generate-quick.dto';
import { ScriptViralRewriteGenerateDto } from './dto/generate-viral-rewrite.dto';
import { ScriptTemplateGenerateDto } from './dto/generate-template.dto';
import { GenerateBatchDto } from './dto/generate-batch.dto';
import { GenerateComposedDto } from './dto/generate-composed.dto';
import { GenerateHybridDto } from './dto/generate-hybrid.dto';
import { ValidateTimingDto } from './dto/validate-timing.dto';
import { PatchOperationDTO } from './dto/patch-script.dto';
import { SaveScriptRequestDto } from './dto/save-script.dto';
import { RegenerateFeedbackDto } from './dto/regenerate-feedback.dto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  PaginatedData,
  Script,
  ScriptPatchResponse,
  ScriptSaveResponse,
  ScriptValidateTimingResponse,
} from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';
import { buildApiErrorResponse } from '../common/http-error-response';
import type { Response } from 'express';

import { ComplianceReviewDto } from './dto/compliance-review.dto';
import { RegenerateRestyleDto } from './dto/regenerate-restyle.dto';
import { FactorRemixDto } from './dto/factor-remix.dto';
import { PatchSuggestDto } from './dto/patch-suggest.dto';

@ApiTags('Script')
@Controller('api/v1/scripts')
export class ScriptController {
  constructor(
    private readonly scriptService: ScriptService,
    private readonly doubaoTextProvider: DoubaoTextProvider,
  ) {}

  @Post('generate/quick')
  @ApiOperation({ summary: '快速模式剧本生成', description: '根据商品卖点生成结构化分镜剧本' })
  @ApiBody({ type: ScriptQuickGenerateDto })
  @ApiResponse({
    status: 200,
    description: '剧本生成成功',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误或校验失败',
  })
  @ApiResponse({
    status: 404,
    description: '商品不存在',
  })
  @ApiResponse({
    status: 422,
    description: 'AI返回内容无法解析',
  })
  async generateQuick(
    @Body() dto: ScriptQuickGenerateDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<Script> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.generateQuickScript(dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: '剧本生成成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('generate/viral-rewrite')
  @ApiOperation({ summary: '爆款仿写剧本生成', description: '指定已拆解的爆款视频，生成同类型叙事结构的全新带货剧本' })
  @ApiBody({ type: ScriptViralRewriteGenerateDto })
  @ApiResponse({
    status: 200,
    description: '爆款仿写剧本生成成功',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误、爆款分析不完整、Schema校验失败或合规拦截',
  })
  @ApiResponse({
    status: 404,
    description: '爆款视频分析不存在或商品不存在',
  })
  @ApiResponse({
    status: 422,
    description: 'AI返回内容无法解析',
  })
  async generateViralRewrite(
    @Body() dto: ScriptViralRewriteGenerateDto,
    @Res({ passthrough: true }) response: { status(code: number): void },
  ): Promise<ApiSuccessResponse<Script> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.generateViralRewriteScript(dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: '爆款仿写剧本生成成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('generate/template')
  @ApiOperation({ summary: '模板驱动剧本生成', description: '指定已验证的剧作模板，基于模板策略与因子配置生成全新带货剧本' })
  @ApiBody({ type: ScriptTemplateGenerateDto })
  @ApiResponse({
    status: 200,
    description: '模板驱动剧本生成成功',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误、模板未激活、模板数据不完整、Schema校验失败或合规拦截',
  })
  @ApiResponse({
    status: 404,
    description: '模板不存在或商品不存在',
  })
  @ApiResponse({
    status: 422,
    description: 'AI返回内容无法解析',
  })
  async generateTemplate(
    @Body() dto: ScriptTemplateGenerateDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<Script> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.generateTemplateScript(dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: '模板驱动剧本生成成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('generate/batch')
  @ApiOperation({ summary: '批量多风格剧本生成', description: '一次生成多套不同风格的剧本，并返回批量结果与风格对比' })
  @ApiBody({ type: GenerateBatchDto })
  @ApiResponse({ status: 200, description: '批量生成成功' })
  @ApiResponse({ status: 400, description: '请求参数错误或校验失败' })
  @ApiResponse({ status: 404, description: '商品不存在' })
  async generateBatch(
    @Body() dto: GenerateBatchDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.generateBatchScripts(dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: '批量剧本生成成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('generate/composed')
  @ApiOperation({ summary: '组合引擎剧本生成', description: '组合模板策略 + 爆款钩子 + 用户因子，生成高质量定制化剧本' })
  @ApiBody({ type: GenerateComposedDto })
  @ApiResponse({ status: 200, description: '组合引擎生成成功' })
  @ApiResponse({ status: 400, description: '请求参数错误或校验失败' })
  @ApiResponse({ status: 404, description: '商品或模板不存在' })
  async generateComposed(
    @Body() dto: GenerateComposedDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<Script> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.generateComposedScript(dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: '组合引擎剧本生成成功',
        data: result as Script,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('generate/hybrid')
  @ApiOperation({ summary: '混合创新剧本生成', description: '混合模板 + 爆款 + 用户自定义策略因子，生成创新剧本' })
  @ApiBody({ type: GenerateHybridDto })
  @ApiResponse({ status: 200, description: '混合创新生成成功' })
  @ApiResponse({ status: 400, description: '请求参数错误或校验失败' })
  @ApiResponse({ status: 404, description: '商品、模板或爆款分析不存在' })
  async generateHybrid(
    @Body() dto: GenerateHybridDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<Script> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.generateHybridScript(dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: '混合创新剧本生成成功',
        data: result as Script,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ========== SSE 进度推送端点 (POST) ==========

  @Post('generate/stream/quick')
  @ApiOperation({ summary: 'SSE快速模式剧本生成（带进度）', description: '通过 Server-Sent Events 实时推送剧本生成进度' })
  @ApiBody({ type: ScriptQuickGenerateDto })
  async generateQuickStream(
    @Body() dto: ScriptQuickGenerateDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.scriptService.generateQuickScriptWithProgress(dto, (progress) => {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        stage: progress.stage,
        message: progress.message,
        progress: progress.progress,
      })}\n\n`);
    }).then((result) => {
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        data: result,
      })}\n\n`);
      res.end();
    }).catch((error) => {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : '剧本生成失败',
      })}\n\n`);
      res.end();
    });
  }

  @Post('generate/stream/template')
  @ApiOperation({ summary: 'SSE模板模式剧本生成（带进度）' })
  @ApiBody({ type: ScriptTemplateGenerateDto })
  async generateTemplateStream(
    @Body() dto: ScriptTemplateGenerateDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.scriptService.generateTemplateScriptWithProgress(dto, (progress) => {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        stage: progress.stage,
        message: progress.message,
        progress: progress.progress,
      })}\n\n`);
    }).then((result) => {
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        data: result,
      })}\n\n`);
      res.end();
    }).catch((error) => {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : '剧本生成失败',
      })}\n\n`);
      res.end();
    });
  }

  @Post('generate/stream/viral-rewrite')
  @ApiOperation({ summary: 'SSE爆款仿写模式剧本生成（带进度）' })
  @ApiBody({ type: ScriptViralRewriteGenerateDto })
  async generateViralRewriteStream(
    @Body() dto: ScriptViralRewriteGenerateDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.scriptService.generateViralRewriteScriptWithProgress(dto, (progress) => {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        stage: progress.stage,
        message: progress.message,
        progress: progress.progress,
      })}\n\n`);
    }).then((result) => {
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        data: result,
      })}\n\n`);
      res.end();
    }).catch((error) => {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : '剧本生成失败',
      })}\n\n`);
      res.end();
    });
  }

  // ========== 健康检查端点 ==========

  @Get('health')
  @ApiOperation({ summary: '剧本 AI 模型健康检查', description: '检查 Doubao API 是否可用' })
  @ApiResponse({ status: 200, description: '健康检查结果' })
  async checkAIHealth(): Promise<{
    success: boolean;
    data: {
      doubao: { ok: boolean; message: string; configured: boolean };
    };
    trace_id: string;
    timestamp: string;
  }> {
    const traceId = randomUUID();

    try {
      const health = await this.doubaoTextProvider.checkHealth();

      return {
        success: true,
        data: { doubao: health },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: true,
        data: {
          doubao: {
            ok: false,
            message: error instanceof Error ? error.message : '健康检查失败',
            configured: !!(process.env.VOLC_ARK_API_KEY || process.env.DOUBAO_API_KEY),
          },
        },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get()
  @ApiOperation({
    summary: '按商品查询剧本列表',
    description: '分页查询指定商品下的剧本列表，返回每个剧本及其分镜数据',
  })
  @ApiQuery({ name: 'product_id', required: true, type: String, description: '商品ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码', example: 1 })
  @ApiQuery({ name: 'page_size', required: false, type: Number, description: '每页条数', example: 20 })
  async listScripts(
    @Query('product_id') productId?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<PaginatedData<Script>> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.listScriptsByProduct(
        productId || '',
        Number(page) || 1,
        Number(pageSize) || 20,
      );
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: '查询成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get(':scriptId')
  @ApiOperation({ summary: '获取剧本详情', description: '查询剧本及其完整分镜列表' })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiResponse({
    status: 200,
    description: '查询成功',
  })
  @ApiResponse({
    status: 404,
    description: '剧本不存在',
  })
  async getScriptDetail(
    @Param('scriptId') scriptId: string,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<Script> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.getScriptDetail(scriptId);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: '查询成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Patch(':scriptId')
  @ApiOperation({
    summary: '分镜局部编辑',
    description: '对剧本执行 JSON Patch 局部更新，并在更新后立即执行结构、时长、配时与合规校验',
  })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiBody({ type: [PatchOperationDTO] })
  @ApiResponse({
    status: 200,
    description: '局部更新成功',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误、Patch 路径不合法、结构/时长/合规校验失败',
  })
  @ApiResponse({
    status: 404,
    description: '剧本不存在',
  })
  async patchScript(
    @Param('scriptId') scriptId: string,
    @Body(new ParseArrayPipe({ items: PatchOperationDTO })) operations: PatchOperationDTO[],
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<ScriptPatchResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.patchScript(scriptId, operations);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: 'script updated',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':scriptId/validate-timing')
  @ApiOperation({
    summary: '音节配时校验',
    description: '台词时长与分镜时长实时匹配，超时阻断并给出修改建议',
  })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiBody({ type: ValidateTimingDto })
  @ApiResponse({
    status: 200,
    description: '配时校验完成',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误或配时校验失败',
  })
  @ApiResponse({
    status: 404,
    description: '剧本不存在',
  })
  async validateTiming(
    @Param('scriptId') scriptId: string,
    @Body() dto: ValidateTimingDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<ScriptValidateTimingResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.validateTiming(scriptId, dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: 'timing validated',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':scriptId/save')
  @ApiOperation({
    summary: '保存剧本',
    description: '对当前剧本状态执行最终校验并持久化为正式可创作输入',
  })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiBody({ type: SaveScriptRequestDto })
  @ApiResponse({
    status: 200,
    description: '保存成功',
  })
  @ApiResponse({
    status: 400,
    description: '保存阻断或请求参数错误',
  })
  @ApiResponse({
    status: 404,
    description: '剧本不存在',
  })
  async saveScript(
    @Param('scriptId') scriptId: string,
    @Body() dto: SaveScriptRequestDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<ScriptSaveResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.saveScript(scriptId, dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: 'script saved',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ========== 回收站功能 ==========

  @Delete(':scriptId')
  @ApiOperation({ summary: '删除剧本', description: '将剧本移入回收站（软删除）' })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '剧本不存在' })
  async deleteScript(
    @Param('scriptId') scriptId: string,
  ): Promise<ApiSuccessResponse<null> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      await this.scriptService.deleteScript(scriptId);

      return {
        success: true,
        message: '剧本已移入回收站',
        data: null,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('trash')
  @ApiOperation({ summary: '回收站剧本列表', description: '获取指定商品的已删除剧本列表' })
  @ApiQuery({ name: 'product_id', required: true, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'page_size', required: false, type: Number })
  async listTrash(
    @Query('product_id') productId?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ): Promise<ApiSuccessResponse<PaginatedData<Script>> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.listTrashScripts(
        productId || '',
        Number(page) || 1,
        Number(pageSize) || 20,
      );

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

  @Post(':scriptId/regenerate/feedback')
  @ApiOperation({
    summary: '反馈驱动重生成',
    description: '根据用户反馈重新生成剧本',
  })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiBody({ type: RegenerateFeedbackDto })
  @ApiResponse({ status: 200, description: '重生成成功' })
  @ApiResponse({ status: 404, description: '剧本不存在' })
  async regenerateFeedback(
    @Param('scriptId') scriptId: string,
    @Body() dto: RegenerateFeedbackDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<Script> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.regenerateWithFeedback(scriptId, dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: 'feedback-driven regeneration completed',
        data: result as Script,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':scriptId/restore')
  @ApiOperation({ summary: '恢复剧本', description: '从回收站恢复已删除的剧本' })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiResponse({ status: 200, description: '恢复成功' })
  @ApiResponse({ status: 404, description: '剧本不存在或未在回收站中' })
  async restoreScript(
    @Param('scriptId') scriptId: string,
  ): Promise<ApiSuccessResponse<{ success: boolean }> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.restoreScript(scriptId);

      return {
        success: true,
        message: '剧本已恢复',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':scriptId/compliance/review')
  @ApiOperation({ summary: '合规审查（完整链路）', description: '对剧本执行基础合规检查（正则+NLP+敏感词）+ AI 语义二审' })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiBody({ type: ComplianceReviewDto })
  @ApiResponse({ status: 200, description: '合规审查结果', type: Object })
  async reviewCompliance(
    @Param('scriptId') scriptId: string,
    @Body() dto: ComplianceReviewDto,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const script = await this.scriptService.getScript(scriptId);
      const shots = (script as any).shots || [];

      if (shots.length === 0) {
        return {
          success: true,
          message: '剧本无分镜内容，无需审查',
          data: {
            script_id: scriptId,
            compliance_passed: true,
            total_violations: 0,
            blocked_count: 0,
            warn_count: 0,
            false_positive_count: 0,
            review_results: [],
          },
          trace_id: traceId,
          timestamp: new Date().toISOString(),
        };
      }

      const result = await this.scriptService.fullComplianceReview(scriptId, shots, {
        enableAiReview: dto.enable_ai_review !== false,
        productCategory: dto.product_category,
      });

      return {
        success: true,
        message: result.compliance_passed
          ? '合规审查通过，未发现违规'
          : `发现 ${result.total_violations} 个违规问题（拦截 ${result.blocked_count}，警告 ${result.warn_count}）`,
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':scriptId/compliance/review/stream')
  @ApiOperation({ summary: '合规审查（SSE 实时进度）', description: 'SSE 流式推送合规审查进度和结果' })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiBody({ type: ComplianceReviewDto })
  async reviewComplianceStream(
    @Param('scriptId') scriptId: string,
    @Body() dto: ComplianceReviewDto,
    @Res() res: Response,
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send('progress', { stage: 'init', message: '正在加载剧本...', progress: 5 });

      const script = await this.scriptService.getScript(scriptId);
      const shots = (script as any).shots || [];

      if (shots.length === 0) {
        send('progress', { stage: 'complete', message: '剧本无分镜内容', progress: 100 });
        send('result', {
          script_id: scriptId,
          compliance_passed: true,
          total_violations: 0,
          blocked_count: 0,
          warn_count: 0,
          false_positive_count: 0,
          review_results: [],
        });
        send('done', {});
        res.end();
        return;
      }

      const result = await this.scriptService.fullComplianceReviewWithProgress(
        scriptId,
        shots,
        {
          enableAiReview: dto.enable_ai_review !== false,
          productCategory: dto.product_category,
        },
        (event) => {
          send('progress', event);
        },
      );

      send('result', result);
      send('done', {});
      res.end();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      send('error', { message: errMsg });
      send('done', {});
      res.end();
    }
  }

  @Delete(':scriptId/permanent')
  @ApiOperation({ summary: '永久删除剧本', description: '从回收站永久删除剧本' })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiResponse({ status: 200, description: '永久删除成功' })
  @ApiResponse({ status: 404, description: '剧本不存在' })
  async permanentDeleteScript(
    @Param('scriptId') scriptId: string,
  ): Promise<ApiSuccessResponse<null> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      await this.scriptService.permanentDeleteScript(scriptId);

      return {
        success: true,
        message: '剧本已永久删除',
        data: null,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ========== 高级重生成端点 ==========

  @Post(':scriptId/regenerate/restyle')
  @ApiOperation({
    summary: '视觉风格替换重生成',
    description: '保留剧本的叙事结构，替换视觉风格（色调、节奏、光影）并重新生成分镜',
  })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiBody({ type: RegenerateRestyleDto })
  @ApiResponse({ status: 200, description: '重生成成功' })
  @ApiResponse({ status: 404, description: '剧本不存在' })
  @ApiResponse({ status: 501, description: '功能开发中' })
  async regenerateRestyle(
    @Param('scriptId') scriptId: string,
    @Body() dto: RegenerateRestyleDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<Script> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.regenerateRestyle(scriptId, dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: '视觉风格替换重生成完成',
        data: result as Script,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':scriptId/regenerate/factor-remix')
  @ApiOperation({
    summary: '因子局部替换重生成',
    description: '基于因子覆盖映射（如 bgm_style、camera_patterns 等）局部重生成剧本分镜',
  })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiBody({ type: FactorRemixDto })
  @ApiResponse({ status: 200, description: '重生成成功' })
  @ApiResponse({ status: 404, description: '剧本不存在' })
  @ApiResponse({ status: 501, description: '功能开发中' })
  async regenerateFactorRemix(
    @Param('scriptId') scriptId: string,
    @Body() dto: FactorRemixDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<Script> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.regenerateFactorRemix(scriptId, dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: '因子替换重生成完成',
        data: result as Script,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':scriptId/patch/suggest')
  @ApiOperation({
    summary: 'AI 辅助 PATCH 建议',
    description: '对用户计划的 PATCH 操作进行 AI 审查，返回影响分析和改进建议',
  })
  @ApiParam({ name: 'scriptId', description: '剧本ID', required: true })
  @ApiBody({ type: PatchSuggestDto })
  @ApiResponse({ status: 200, description: '建议生成成功' })
  @ApiResponse({ status: 404, description: '剧本不存在' })
  @ApiResponse({ status: 501, description: '功能开发中' })
  async suggestPatchImprovements(
    @Param('scriptId') scriptId: string,
    @Body() dto: PatchSuggestDto,
    @Res({ passthrough: true }) response: { status(code: number): void } = { status: () => {} },
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.scriptService.suggestPatchImprovements(scriptId, dto);
      response.status(HttpStatus.OK);

      return {
        success: true,
        message: 'AI 建议生成完成',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      response.status(error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);
      return buildApiErrorResponse(error, traceId);
    }
  }
}
