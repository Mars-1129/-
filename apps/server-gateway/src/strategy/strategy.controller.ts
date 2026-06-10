// =============================================================================
// TikStream AI — Strategy Controller
// =============================================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { StrategyService, ApiStrategy, ApiTemplateStrategy } from './strategy.service';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { AssignTemplateStrategiesDto } from './dto/assign-template-strategies.dto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
} from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';
import { buildApiErrorResponse } from '../common/http-error-response';

@ApiTags('Strategy Library')
@Controller('api/v1')
export class StrategyController {
  constructor(private readonly strategyService: StrategyService) {}

  // ===========================================================================
  // Strategy CRUD Endpoints
  // ===========================================================================

  @Get('strategies')
  @ApiOperation({
    summary: '查询策略列表',
    description: '获取所有策略，支持按类别和关键字过滤',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    type: String,
    description: '策略类别: creative / narrative / conversion / branding',
  })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: '按 key 或名称模糊搜索',
  })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async listStrategies(
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
  ): Promise<ApiSuccessResponse<ApiStrategy[]> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.strategyService.listStrategies(category, keyword);

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

  @Post('strategies')
  @ApiOperation({
    summary: '创建策略',
    description: '创建一个新的策略定义',
  })
  @ApiBody({ type: CreateStrategyDto })
  @ApiResponse({ status: 201, description: '策略创建成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 409, description: '策略 key 已存在' })
  async createStrategy(
    @Body() dto: CreateStrategyDto,
  ): Promise<ApiSuccessResponse<ApiStrategy> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.strategyService.createStrategy(dto);

      return {
        success: true,
        message: '策略创建成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('strategies/:strategy_id')
  @ApiOperation({
    summary: '获取策略详情',
    description: '根据 ID 获取单个策略完整信息',
  })
  @ApiParam({ name: 'strategy_id', description: '策略 ID', required: true })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 400, description: '无效的策略 ID' })
  @ApiResponse({ status: 404, description: '策略不存在' })
  async getStrategy(
    @Param('strategy_id') strategyId: string,
  ): Promise<ApiSuccessResponse<ApiStrategy> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.strategyService.getStrategy(strategyId);

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

  @Patch('strategies/:strategy_id')
  @ApiOperation({
    summary: '更新策略',
    description: '部分更新策略字段（内置策略不可修改）',
  })
  @ApiParam({ name: 'strategy_id', description: '策略 ID', required: true })
  @ApiBody({ type: UpdateStrategyDto })
  @ApiResponse({ status: 200, description: '策略更新成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 403, description: '内置策略不可修改' })
  @ApiResponse({ status: 404, description: '策略不存在' })
  async updateStrategy(
    @Param('strategy_id') strategyId: string,
    @Body() dto: UpdateStrategyDto,
  ): Promise<ApiSuccessResponse<ApiStrategy> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.strategyService.updateStrategy(strategyId, dto);

      return {
        success: true,
        message: '策略更新成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Delete('strategies/:strategy_id')
  @ApiOperation({
    summary: '删除策略',
    description: '永久删除策略（内置策略不可删除）',
  })
  @ApiParam({ name: 'strategy_id', description: '策略 ID', required: true })
  @ApiResponse({ status: 200, description: '策略删除成功' })
  @ApiResponse({ status: 400, description: '无效的策略 ID' })
  @ApiResponse({ status: 403, description: '内置策略不可删除' })
  @ApiResponse({ status: 404, description: '策略不存在' })
  async deleteStrategy(
    @Param('strategy_id') strategyId: string,
  ): Promise<
    ApiSuccessResponse<{ strategy_id: string; deleted: boolean }> | ApiErrorResponse
  > {
    const traceId = randomUUID();

    try {
      const result = await this.strategyService.deleteStrategy(strategyId);

      return {
        success: true,
        message: '策略删除成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ===========================================================================
  // Template-Strategy Assignment Endpoints
  // ===========================================================================

  @Put('templates/:template_id/strategies')
  @ApiOperation({
    summary: '分配模板策略',
    description: '批量设置模板的策略分配（全量覆盖，先删除后创建）',
  })
  @ApiParam({ name: 'template_id', description: '模板 ID', required: true })
  @ApiBody({ type: AssignTemplateStrategiesDto })
  @ApiResponse({ status: 200, description: '模板策略分配成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 404, description: '模板或策略不存在' })
  async assignTemplateStrategies(
    @Param('template_id') templateId: string,
    @Body() dto: AssignTemplateStrategiesDto,
  ): Promise<ApiSuccessResponse<null> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      await this.strategyService.assignTemplateStrategies(templateId, dto);

      return {
        success: true,
        message: '模板策略分配成功',
        data: null,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('templates/:template_id/strategies')
  @ApiOperation({
    summary: '获取模板的策略分配',
    description: '查询模板关联的所有策略',
  })
  @ApiParam({ name: 'template_id', description: '模板 ID', required: true })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 400, description: '无效的模板 ID' })
  async getTemplateStrategies(
    @Param('template_id') templateId: string,
  ): Promise<ApiSuccessResponse<ApiTemplateStrategy[]> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.strategyService.getTemplateStrategies(templateId);

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
