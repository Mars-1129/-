// =============================================================================
// TikStream AI — Prompt Template Controller
// 管理员 Prompt 模板管理 API
// =============================================================================

import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { PromptTemplateService } from './prompt-template.service';
import { ApiSuccessResponse, ApiErrorResponse } from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';
import { buildApiErrorResponse } from '../common/http-error-response';

@ApiTags('Prompt Templates')
@Controller('api/v1/prompt-templates')
export class PromptTemplateController {
  constructor(private readonly promptTemplateService: PromptTemplateService) {}

  @Get()
  @ApiOperation({
    summary: '列出 Prompt 模板',
    description: '分页获取所有 Prompt 模板及其最新版本号',
  })
  @ApiQuery({ name: 'page', required: false, description: '页码 (default 1)' })
  @ApiQuery({ name: 'page_size', required: false, description: '每页数量 (default 20)' })
  async listTemplates(
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.promptTemplateService.listTemplates(
        page ? parseInt(page, 10) : 1,
        pageSize ? parseInt(pageSize, 10) : 20,
      );
      return { success: true, message: '查询成功', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post()
  @ApiOperation({
    summary: '创建 Prompt 模板',
    description: '创建新的 Prompt 模板，同时创建第一个版本',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '模板名称 (如 script-quick)', example: 'script-quick' },
        description: { type: 'string', description: '模板描述', example: '快速生成短视频剧本的 Prompt 模板' },
        system_prompt: { type: 'string', description: 'System Prompt 文本' },
        user_prompt: { type: 'string', description: 'User Prompt 文本' },
      },
      required: ['name'],
    },
  })
  async createTemplate(
    @Body() body: { name: string; description?: string; system_prompt?: string; user_prompt?: string },
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.promptTemplateService.createTemplate(
        body.name, body.description, body.system_prompt, body.user_prompt,
      );
      return { success: true, message: '模板创建成功', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get(':templateId')
  @ApiOperation({
    summary: '获取 Prompt 模板详情',
    description: '获取指定模板的完整信息及所有历史版本',
  })
  @ApiParam({ name: 'templateId', description: '模板ID', required: true })
  async getTemplate(
    @Param('templateId') templateId: string,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.promptTemplateService.getTemplate(templateId);
      return { success: true, message: '查询成功', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Patch(':templateId/toggle-active')
  @ApiOperation({
    summary: '切换模板启用状态',
    description: '启用或禁用 Prompt 模板',
  })
  @ApiParam({ name: 'templateId', description: '模板ID', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        is_active: { type: 'boolean', description: '是否启用' },
      },
      required: ['is_active'],
    },
  })
  async toggleActive(
    @Param('templateId') templateId: string,
    @Body() body: { is_active: boolean },
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.promptTemplateService.toggleActive(templateId, body.is_active);
      return { success: true, message: '状态更新成功', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':templateId/versions')
  @ApiOperation({
    summary: '添加 Prompt 版本',
    description: '为指定模板创建新的版本',
  })
  @ApiParam({ name: 'templateId', description: '模板ID', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        system_prompt: { type: 'string', description: 'System Prompt 文本' },
        user_prompt: { type: 'string', description: 'User Prompt 文本' },
      },
      required: ['system_prompt', 'user_prompt'],
    },
  })
  async addVersion(
    @Param('templateId') templateId: string,
    @Body() body: { system_prompt: string; user_prompt: string },
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.promptTemplateService.addVersion(templateId, body.system_prompt, body.user_prompt);
      return { success: true, message: '版本添加成功', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':templateId/ab-test')
  @ApiOperation({
    summary: 'Prompt A/B 自动优化（占位）',
    description: '自动对比不同 Prompt 版本的效果。当前需接入真实投放渠道与数据回流。',
  })
  @ApiParam({ name: 'templateId', description: '模板ID', required: true })
  @ApiResponse({ status: 200, description: 'A/B 测试状态（占位）' })
  async startAbTest(
    @Param('templateId') templateId: string,
  ): Promise<ApiSuccessResponse<{ status: string; message: string }> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      return {
        success: true,
        message: 'A/B 测试状态（占位）',
        data: {
          status: 'NOT_AVAILABLE',
          message: 'Prompt A/B 自动优化需接入真实投放渠道与数据回流。',
        },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }
}
