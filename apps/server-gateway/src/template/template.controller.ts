// =============================================================================
// TikStream AI — Template Controller
// =============================================================================

import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { TemplateService } from './template.service';
import { ScriptService } from '../script/script.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ScriptTemplateGenerateDto } from '../script/dto/generate-template.dto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  Template,
  TemplateDetail,
  PaginatedData,
  Script,
  ClusterTemplatesRequest,
  ClusterTemplatesResponse,
} from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';
import { buildApiErrorResponse } from '../common/http-error-response';

@ApiTags('Template')
@Controller('api/v1/templates')
export class TemplateController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly scriptService: ScriptService,
  ) {}

  @Post()
  @ApiOperation({
    summary: '创建模板',
    description: '创建一个新的剧作模板，包含策略因子配置与可选的结构定义',
  })
  @ApiBody({ type: CreateTemplateDto })
  @ApiResponse({
    status: 201,
    description: '模板创建成功',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误（名称/分类/因子结构不合法）',
  })
  @ApiResponse({
    status: 409,
    description: '同名模板已存在',
  })
  async createTemplate(
    @Body() dto: CreateTemplateDto,
  ): Promise<ApiSuccessResponse<Template> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.templateService.createTemplate(dto);

      return {
        success: true,
        message: '模板创建成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get()
  @ApiOperation({
    summary: '查询模板列表',
    description: '分页查询模板列表，支持按分类和状态过滤',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码', example: 1 })
  @ApiQuery({ name: 'page_size', required: false, type: Number, description: '每页条数', example: 20 })
  @ApiQuery({ name: 'category', required: false, type: String, description: '模板分类过滤' })
  @ApiQuery({ name: 'status', required: false, type: String, description: '模板状态过滤' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: '按名称模糊搜索' })
  @ApiQuery({ name: 'sort_by', required: false, type: String, description: '排序字段: name/createdAt/updatedAt' })
  @ApiQuery({ name: 'sort_order', required: false, type: String, description: '排序方向: asc/desc' })
  @ApiResponse({
    status: 200,
    description: '查询成功',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  async getTemplateList(
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('sort_by') sortBy?: string,
    @Query('sort_order') sortOrder?: string,
  ): Promise<ApiSuccessResponse<PaginatedData<Template>> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.templateService.getTemplateList(
        Number(page) || 1,
        Number(pageSize) || 20,
        category,
        status,
        keyword,
        sortBy,
        sortOrder,
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

  @Get(':template_id')
  @ApiOperation({
    summary: '获取模板详情',
    description: '查询模板完整信息，包含策略因子配置与结构定义',
  })
  @ApiParam({ name: 'template_id', description: '模板ID', required: true })
  @ApiResponse({
    status: 200,
    description: '查询成功',
  })
  @ApiResponse({
    status: 404,
    description: '模板不存在',
  })
  async getTemplateDetail(
    @Param('template_id') templateId: string,
  ): Promise<ApiSuccessResponse<TemplateDetail> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.templateService.getTemplateDetail(templateId);

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

  @Patch(':template_id')
  @ApiOperation({
    summary: '更新模板',
    description: '部分更新模板字段，支持状态转换校验',
  })
  @ApiParam({ name: 'template_id', description: '模板ID', required: true })
  @ApiBody({ type: UpdateTemplateDto })
  @ApiResponse({
    status: 200,
    description: '模板更新成功',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  @ApiResponse({
    status: 404,
    description: '模板不存在',
  })
  @ApiResponse({
    status: 409,
    description: '已归档模板不可修改',
  })
  async updateTemplate(
    @Param('template_id') templateId: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<ApiSuccessResponse<Template> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.templateService.updateTemplate(templateId, dto);

      return {
        success: true,
        message: '模板更新成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Delete(':template_id')
  @ApiOperation({
    summary: '删除模板',
    description: '永久删除指定模板',
  })
  @ApiParam({ name: 'template_id', description: '模板ID', required: true })
  @ApiResponse({
    status: 200,
    description: '模板删除成功',
  })
  @ApiResponse({
    status: 404,
    description: '模板不存在',
  })
  async deleteTemplate(
    @Param('template_id') templateId: string,
  ): Promise<ApiSuccessResponse<{ template_id: string; deleted: boolean }> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.templateService.deleteTemplate(templateId);

      return {
        success: true,
        message: '模板删除成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':template_id/apply')
  @ApiOperation({
    summary: '套用模板生成剧本',
    description: '以指定模板为剧本生成策略骨架，驱动 AI 生成完整分镜剧本',
  })
  @ApiParam({ name: 'template_id', description: '模板ID', required: true })
  @ApiBody({ type: ScriptTemplateGenerateDto })
  @ApiResponse({
    status: 200,
    description: '模板驱动剧本生成成功',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误或模板未激活',
  })
  @ApiResponse({
    status: 404,
    description: '模板或商品不存在',
  })
  @ApiResponse({
    status: 409,
    description: '模板已归档不可套用',
  })
  @ApiResponse({
    status: 422,
    description: '生成结果校验失败',
  })
  async applyTemplate(
    @Param('template_id') templateId: string,
    @Body() dto: ScriptTemplateGenerateDto,
  ): Promise<ApiSuccessResponse<Script> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const mergedDto: ScriptTemplateGenerateDto = {
        ...dto,
        template_id: templateId,
      };

      const result = await this.scriptService.generateTemplateScript(mergedDto);

      return {
        success: true,
        message: '模板驱动剧本生成成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('cluster')
  @ApiOperation({
    summary: '聚类提炼模板',
    description: '从多条同套路爆款视频分析记录中自动聚类归纳为可复用的创作模板',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: '商品ID' },
        analysis_ids: { type: 'array', items: { type: 'string' }, description: '爆款分析ID列表（至少2条）' },
        name: { type: 'string', description: '模板名称' },
        category: { type: 'string', description: '模板分类' },
      },
      required: ['product_id', 'analysis_ids', 'name'],
    },
  })
  @ApiResponse({
    status: 201,
    description: '聚类提炼成功，模板已创建',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误（analysis_ids 不足或数据为空）',
  })
  @ApiResponse({
    status: 404,
    description: '部分爆款分析记录不存在',
  })
  @ApiResponse({
    status: 422,
    description: 'AI 聚类分析失败（策略摘要或因子配置为空）',
  })
  @ApiResponse({
    status: 503,
    description: 'AI 模型服务不可用',
  })
  async clusterTemplates(
    @Body() dto: ClusterTemplatesRequest,
  ): Promise<ApiSuccessResponse<ClusterTemplatesResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.templateService.clusterAndCreateTemplate(dto);

      return {
        success: true,
        message: '聚类提炼成功，模板已创建',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Patch(':template_id/publish')
  @ApiOperation({
    summary: '发布模板',
    description: '将模板状态更新为已发布。需 x-admin-key 请求头校验。',
  })
  @ApiParam({ name: 'template_id', description: '模板ID', required: true })
  @ApiResponse({ status: 200, description: '发布成功' })
  @ApiResponse({ status: 401, description: '缺少或无效的管理员 Key' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async publishTemplate(
    @Param('template_id') templateId: string,
    @Headers('x-admin-key') adminKey?: string,
  ): Promise<ApiSuccessResponse<Template> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const configuredKey = process.env.ADMIN_API_KEY;
      if (!configuredKey) {
        throw new HttpException('服务端管理员 Key 未配置', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      if (!adminKey || adminKey !== configuredKey) {
        throw new HttpException('缺少或无效的管理员 Key', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.templateService.updateTemplate(templateId, { status: 'PUBLISHED' } as UpdateTemplateDto);

      return {
        success: true,
        message: '模板已发布',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Patch(':template_id/unpublish')
  @ApiOperation({
    summary: '取消发布模板',
    description: '将模板状态更新为草稿。需 x-admin-key 请求头校验。',
  })
  @ApiParam({ name: 'template_id', description: '模板ID', required: true })
  @ApiResponse({ status: 200, description: '取消发布成功' })
  @ApiResponse({ status: 401, description: '缺少或无效的管理员 Key' })
  @ApiResponse({ status: 404, description: '模板不存在' })
  async unpublishTemplate(
    @Param('template_id') templateId: string,
    @Headers('x-admin-key') adminKey?: string,
  ): Promise<ApiSuccessResponse<Template> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
        throw new HttpException('缺少或无效的管理员 Key', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.templateService.updateTemplate(templateId, { status: 'DRAFT' } as UpdateTemplateDto);

      return {
        success: true,
        message: '模板已取消发布',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }
}
