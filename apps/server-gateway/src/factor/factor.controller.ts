// =============================================================================
// TikStream AI — Factor Controller
// =============================================================================

import { Controller, Get, Post, Patch, Delete, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { FactorService } from './factor.service';
import { CreateFactorDto } from './dto/create-factor.dto';
import { UpdateFactorDto } from './dto/update-factor.dto';
import { AssignTemplateFactorsDto } from './dto/assign-template-factors.dto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  Factor,
  TemplateFactorAssignment,
} from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';
import { buildApiErrorResponse } from '../common/http-error-response';

@ApiTags('Factor Library')
@Controller('api/v1')
export class FactorController {
  constructor(private readonly factorService: FactorService) {}

  // ===========================================================================
  // Factor CRUD Endpoints
  // ===========================================================================

  @Get('factors')
  @ApiOperation({
    summary: '查询因子列表',
    description: '获取所有因子，支持按类别和关键字过滤',
  })
  @ApiQuery({ name: 'category', required: false, type: String, description: '因子类别: NARRATIVE / PARAMETER' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: '按 key 或名称模糊搜索' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async listFactors(
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
  ): Promise<ApiSuccessResponse<Factor[]> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.factorService.listFactors(category, keyword);

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

  @Post('factors')
  @ApiOperation({
    summary: '创建因子',
    description: '创建一个新的因子定义',
  })
  @ApiBody({ type: CreateFactorDto })
  @ApiResponse({ status: 201, description: '因子创建成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 409, description: '因子 key 已存在' })
  async createFactor(
    @Body() dto: CreateFactorDto,
  ): Promise<ApiSuccessResponse<Factor> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.factorService.createFactor(dto);

      return {
        success: true,
        message: '因子创建成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('factors/:factor_id')
  @ApiOperation({
    summary: '获取因子详情',
    description: '根据 ID 获取单个因子完整信息',
  })
  @ApiParam({ name: 'factor_id', description: '因子 ID', required: true })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 400, description: '无效的因子 ID' })
  @ApiResponse({ status: 404, description: '因子不存在' })
  async getFactor(
    @Param('factor_id') factorId: string,
  ): Promise<ApiSuccessResponse<Factor> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.factorService.getFactor(factorId);

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

  @Patch('factors/:factor_id')
  @ApiOperation({
    summary: '更新因子',
    description: '部分更新因子字段（内置因子不可修改）',
  })
  @ApiParam({ name: 'factor_id', description: '因子 ID', required: true })
  @ApiBody({ type: UpdateFactorDto })
  @ApiResponse({ status: 200, description: '因子更新成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 403, description: '内置因子不可修改' })
  @ApiResponse({ status: 404, description: '因子不存在' })
  async updateFactor(
    @Param('factor_id') factorId: string,
    @Body() dto: UpdateFactorDto,
  ): Promise<ApiSuccessResponse<Factor> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.factorService.updateFactor(factorId, dto);

      return {
        success: true,
        message: '因子更新成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Delete('factors/:factor_id')
  @ApiOperation({
    summary: '删除因子',
    description: '永久删除因子（内置因子不可删除）',
  })
  @ApiParam({ name: 'factor_id', description: '因子 ID', required: true })
  @ApiResponse({ status: 200, description: '因子删除成功' })
  @ApiResponse({ status: 400, description: '无效的因子 ID' })
  @ApiResponse({ status: 403, description: '内置因子不可删除' })
  @ApiResponse({ status: 404, description: '因子不存在' })
  async deleteFactor(
    @Param('factor_id') factorId: string,
  ): Promise<ApiSuccessResponse<{ factor_id: string; deleted: boolean }> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.factorService.deleteFactor(factorId);

      return {
        success: true,
        message: '因子删除成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ===========================================================================
  // Template-Factor Assignment Endpoints
  // ===========================================================================

  @Put('templates/:template_id/factors')
  @ApiOperation({
    summary: '分配模板因子',
    description: '批量设置模板的因子分配（全量覆盖，先删除后创建）',
  })
  @ApiParam({ name: 'template_id', description: '模板 ID', required: true })
  @ApiBody({ type: AssignTemplateFactorsDto })
  @ApiResponse({ status: 200, description: '模板因子分配成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 404, description: '模板或因子不存在' })
  async assignTemplateFactors(
    @Param('template_id') templateId: string,
    @Body() dto: AssignTemplateFactorsDto,
  ): Promise<ApiSuccessResponse<null> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      await this.factorService.assignTemplateFactors(templateId, dto);

      return {
        success: true,
        message: '模板因子分配成功',
        data: null,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('templates/:template_id/factors')
  @ApiOperation({
    summary: '获取模板的因子分配',
    description: '查询模板关联的所有因子及其值',
  })
  @ApiParam({ name: 'template_id', description: '模板 ID', required: true })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 400, description: '无效的模板 ID' })
  async getTemplateFactors(
    @Param('template_id') templateId: string,
  ): Promise<ApiSuccessResponse<TemplateFactorAssignment[]> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.factorService.getTemplateFactors(templateId);

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
}
