// =============================================================================
// TikStream AI — Constraint Controller
// =============================================================================

import { Controller, Get, Post, Patch, Delete, Put, Body, Param, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { ConstraintService } from './constraint.service';
import { ComplianceFilter } from '../script/compliance.filter';
import { CreateConstraintDto } from './dto/create-constraint.dto';
import { UpdateConstraintDto } from './dto/update-constraint.dto';
import { AssignTemplateConstraintsDto } from './dto/assign-template-constraints.dto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  Constraint,
} from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';
import { buildApiErrorResponse } from '../common/http-error-response';

@ApiTags('Constraint Library')
@Controller('api/v1')
export class ConstraintController {
  private readonly logger = new Logger(ConstraintController.name);

  constructor(
    private readonly constraintService: ConstraintService,
    private readonly complianceFilter: ComplianceFilter,
  ) {}

  // ===========================================================================
  // Constraint CRUD Endpoints
  // ===========================================================================

  @Get('constraints')
  @ApiOperation({
    summary: '查询约束列表',
    description: '获取所有约束，支持按类别、规则类型和关键字过滤',
  })
  @ApiQuery({ name: 'category', required: false, type: String, description: '约束类别: compliance / creative / branding / platform' })
  @ApiQuery({ name: 'rule_type', required: false, type: String, description: '规则类型: HARD / SOFT' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: '按 key 或名称模糊搜索' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async listConstraints(
    @Query('category') category?: string,
    @Query('rule_type') ruleType?: string,
    @Query('keyword') keyword?: string,
  ): Promise<ApiSuccessResponse<Constraint[]> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.constraintService.listConstraints(category, ruleType, keyword);

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

  @Post('constraints')
  @ApiOperation({
    summary: '创建约束',
    description: '创建一个新的约束规则定义',
  })
  @ApiBody({ type: CreateConstraintDto })
  @ApiResponse({ status: 201, description: '约束创建成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 409, description: '约束 key 已存在' })
  async createConstraint(
    @Body() dto: CreateConstraintDto,
  ): Promise<ApiSuccessResponse<Constraint> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.constraintService.createConstraint(dto);
      this.complianceFilter.reload().catch((err) => {
        this.logger.error('合规过滤器缓存刷新失败 (createConstraint)', err);
      });

      return {
        success: true,
        message: '约束创建成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('constraints/:constraint_id')
  @ApiOperation({
    summary: '获取约束详情',
    description: '根据 ID 获取单个约束完整信息',
  })
  @ApiParam({ name: 'constraint_id', description: '约束 ID', required: true })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 400, description: '无效的约束 ID' })
  @ApiResponse({ status: 404, description: '约束不存在' })
  async getConstraint(
    @Param('constraint_id') constraintId: string,
  ): Promise<ApiSuccessResponse<Constraint> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.constraintService.getConstraint(constraintId);

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

  @Patch('constraints/:constraint_id')
  @ApiOperation({
    summary: '更新约束',
    description: '部分更新约束字段（内置约束不可修改）',
  })
  @ApiParam({ name: 'constraint_id', description: '约束 ID', required: true })
  @ApiBody({ type: UpdateConstraintDto })
  @ApiResponse({ status: 200, description: '约束更新成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 403, description: '内置约束不可修改' })
  @ApiResponse({ status: 404, description: '约束不存在' })
  async updateConstraint(
    @Param('constraint_id') constraintId: string,
    @Body() dto: UpdateConstraintDto,
  ): Promise<ApiSuccessResponse<Constraint> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.constraintService.updateConstraint(constraintId, dto);
      this.complianceFilter.reload().catch((err) => {
        this.logger.error('合规过滤器缓存刷新失败 (updateConstraint)', err);
      });

      return {
        success: true,
        message: '约束更新成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Delete('constraints/:constraint_id')
  @ApiOperation({
    summary: '删除约束',
    description: '永久删除约束（内置约束不可删除）',
  })
  @ApiParam({ name: 'constraint_id', description: '约束 ID', required: true })
  @ApiResponse({ status: 200, description: '约束删除成功' })
  @ApiResponse({ status: 400, description: '无效的约束 ID' })
  @ApiResponse({ status: 403, description: '内置约束不可删除' })
  @ApiResponse({ status: 404, description: '约束不存在' })
  async deleteConstraint(
    @Param('constraint_id') constraintId: string,
  ): Promise<ApiSuccessResponse<{ constraint_id: string; deleted: boolean }> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.constraintService.deleteConstraint(constraintId);
      this.complianceFilter.reload().catch((err) => {
        this.logger.error('合规过滤器缓存刷新失败 (deleteConstraint)', err);
      });

      return {
        success: true,
        message: '约束删除成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ===========================================================================
  // Template-Constraint Assignment Endpoints
  // ===========================================================================

  @Put('templates/:template_id/constraints')
  @ApiOperation({
    summary: '分配模板约束',
    description: '批量设置模板的约束分配（全量覆盖，先删除后创建）',
  })
  @ApiParam({ name: 'template_id', description: '模板 ID', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        constraint_ids: {
          type: 'array',
          items: { type: 'string' },
          description: '约束 ID 列表',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: '模板约束分配成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async assignTemplateConstraints(
    @Param('template_id') templateId: string,
    @Body() dto: AssignTemplateConstraintsDto,
  ): Promise<ApiSuccessResponse<null> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      await this.constraintService.assignTemplateConstraints(templateId, dto.constraint_ids);

      return {
        success: true,
        message: '模板约束分配成功',
        data: null,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('templates/:template_id/constraints')
  @ApiOperation({
    summary: '获取模板的约束分配',
    description: '查询模板关联的所有约束',
  })
  @ApiParam({ name: 'template_id', description: '模板 ID', required: true })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 400, description: '无效的模板 ID' })
  async getTemplateConstraints(
    @Param('template_id') templateId: string,
  ): Promise<ApiSuccessResponse<Constraint[]> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.constraintService.getTemplateConstraints(templateId);

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
