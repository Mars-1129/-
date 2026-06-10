// =============================================================================
// TikStream AI — Viral Video Analysis Controller
// =============================================================================

import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { ViralAnalysisService } from './viral-analysis.service';
import { ViralDnaService } from './viral-dna.service';
import { ViralSubscriptionService } from './viral-subscription.service';
import { CreateViralAnalysisDto } from './dto/create-viral-analysis.dto';
import { SearchViralAnalysisDto } from './dto/search-viral-analysis.dto';
import { FromMaterialDto } from './dto/from-material.dto';
import { ExtractDnaDto } from './dto/extract-dna.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  ViralVideoAnalysis,
  ViralVideoAnalysisDetail,
  ViralVideoAnalysisCreateResponse,
  ViralVideoAnalysisSearchResponse,
  ViralVideoAnalysisListResponse,
  ViralVideoAnalysisSuggestKeywordsRequest,
  ViralVideoAnalysisSuggestKeywordsResponse,
} from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';
import { buildApiErrorResponse } from '../common/http-error-response';

export interface ViralDNAExtractData {
  patterns: unknown[];
  total_samples: number;
  confidence: number;
}

@ApiTags('Viral Video Analysis')
@Controller('api/v1/viral-video-analyses')
export class ViralAnalysisController {
  constructor(
    private readonly viralAnalysisService: ViralAnalysisService,
    private readonly viralDnaService: ViralDnaService,
    private readonly viralSubscriptionService: ViralSubscriptionService,
  ) {}

  @Post()
  @ApiOperation({
    summary: '创建爆款视频结构化拆解',
    description: '提交一个爆款视频来源 URL，系统自动提取视频标识、去重检测，并异步触发 AI 拆解分析',
  })
  @ApiBody({ type: CreateViralAnalysisDto })
  @ApiResponse({ status: 201, description: '爆款视频分析创建成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 409, description: '该平台下的同源视频已存在拆解记录' })
  async createViralAnalysis(
    @Body() dto: CreateViralAnalysisDto,
  ): Promise<ApiSuccessResponse<ViralVideoAnalysisCreateResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.viralAnalysisService.createViralAnalysis(dto);

      const isDuplicate = result.potential_duplicate;

      return {
        success: true,
        message: isDuplicate ? '检测到可能的内容重复，已返回已有分析结果' : '爆款视频分析创建成功，AI 分析已启动',
        data: result as ViralVideoAnalysisCreateResponse,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':analysis_id/analyze')
  @ApiOperation({
    summary: '触发/重试 AI 视频拆解分析',
    description: '对指定的爆款视频记录执行 AI 结构化拆解，返回分析后的完整详情',
  })
  @ApiParam({ name: 'analysis_id', description: '爆款视频分析ID', required: true })
  @ApiResponse({ status: 200, description: 'AI 分析完成' })
  @ApiResponse({ status: 404, description: '爆款视频分析记录不存在' })
  async analyzeViralVideo(
    @Param('analysis_id') analysisId: string,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<ViralVideoAnalysisDetail> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.viralAnalysisService.analyzeViralVideo(analysisId, productId);

      return {
        success: true,
        message: 'AI 视频拆解分析完成',
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
    summary: '检索爆款视频分析列表',
    description: '按关键词、类目、平台、商品ID等维度检索爆款视频分析记录',
  })
  @ApiQuery({ name: 'keyword', required: false, description: '标题关键词搜索' })
  @ApiQuery({ name: 'category', required: false, description: '商品类目筛选' })
  @ApiQuery({ name: 'source_platform', required: false, description: '来源平台筛选' })
  @ApiQuery({ name: 'product_id', required: false, description: '商品ID筛选' })
  @ApiQuery({ name: 'page', required: false, description: '页码 (default 1)' })
  @ApiQuery({ name: 'page_size', required: false, description: '每页数量 (default 20)' })
  @ApiResponse({ status: 200, description: '检索成功' })
  async searchViralAnalyses(
    @Query() dto: SearchViralAnalysisDto,
  ): Promise<ApiSuccessResponse<ViralVideoAnalysisSearchResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.viralAnalysisService.searchViralAnalyses(dto);

      return {
        success: true,
        message: '检索成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('from-material')
  @ApiOperation({
    summary: '从自有素材创建爆款视频拆解',
    description: '将已上传的视频素材转换为爆款视频分析记录，自动触发 AI 拆解',
  })
  @ApiBody({ type: FromMaterialDto })
  @ApiResponse({ status: 201, description: '从素材创建成功，AI 分析已启动' })
  @ApiResponse({ status: 404, description: '素材不存在' })
  @ApiResponse({ status: 400, description: '素材不是视频类型' })
  async createFromMaterial(
    @Body() dto: FromMaterialDto,
  ): Promise<ApiSuccessResponse<ViralVideoAnalysisCreateResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.viralAnalysisService.createFromMaterial(dto);

      return {
        success: true,
        message: '已从素材创建爆款视频分析记录，AI 拆解已启动',
        data: {
          analysis: result.analysis,
          potential_duplicate: false,
        },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('batch')
  @ApiOperation({
    summary: '批量查询爆款视频拆解详情',
    description: '根据 analysis_ids 批量查询爆款视频结构化拆解的完整数据',
  })
  @ApiQuery({ name: 'ids', required: true, type: String, description: '分析ID列表，逗号分隔 (e.g. id1,id2,id3)' })
  @ApiResponse({ status: 200, description: '批量查询成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async getViralAnalysesByIds(
    @Query('ids') ids: string,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<ViralVideoAnalysisListResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const idArray = ids
        ? ids.split(',').map((id) => id.trim()).filter((id) => UUID_REGEX.test(id))
        : [];
      const result = await this.viralAnalysisService.getViralAnalysesByIds(idArray, productId);

      return {
        success: true,
        message: '批量查询成功',
        data: { items: result },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('by-product/:productId')
  @ApiOperation({
    summary: '按商品 ID 查询所有爆款视频拆解',
    description: '根据商品 ID 查询该商品关联的所有爆款视频结构化拆解记录',
  })
  @ApiParam({ name: 'productId', description: '商品ID', required: true })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 404, description: '未找到该商品的爆款视频分析' })
  async getViralAnalysesByProductId(
    @Param('productId') productId: string,
  ): Promise<ApiSuccessResponse<ViralVideoAnalysisListResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.viralAnalysisService.getViralAnalysesByProductId(productId);

      return {
        success: true,
        message: '查询成功',
        data: { items: result },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('match')
  @ApiOperation({
    summary: '自动匹配最佳爆款视频',
    description: '根据商品 ID 自动匹配最佳的爆款视频拆解记录（三级降级：同商品→同品类→关键词）',
  })
  @ApiQuery({ name: 'product_id', required: true, type: String, description: '商品ID' })
  @ApiResponse({ status: 200, description: '匹配成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 404, description: '未找到匹配的爆款视频分析' })
  async matchBestViralAnalysis(
    @Query('product_id') productId: string,
  ): Promise<ApiSuccessResponse<ViralVideoAnalysisDetail> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.viralAnalysisService.matchBestViralAnalysis(productId);

      return {
        success: true,
        message: '匹配成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('suggest-keywords')
  @ApiOperation({
    summary: '推荐爆款视频搜索关键词',
    description: '根据商品类目和标题，为各社交媒体平台推荐搜索关键词和 hashtag，帮助用户高效找到爆款视频素材',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        product_category: { type: 'string', description: '商品类目', example: '美妆工具' },
        product_title: { type: 'string', description: '商品标题', example: '便携旅行电动牙刷' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '关键词推荐成功' })
  @ApiResponse({ status: 400, description: '请求参数不合法' })
  async suggestViralKeywords(
    @Body() dto: ViralVideoAnalysisSuggestKeywordsRequest,
  ): Promise<ApiSuccessResponse<ViralVideoAnalysisSuggestKeywordsResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.viralAnalysisService.suggestViralKeywords(dto);

      return {
        success: true,
        message: '关键词推荐成功',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ============================================================
  // DNA 提取与查询 (Phase 3)
  // ============================================================

  @Post('dna/extract')
  @ApiOperation({
    summary: '提取爆款 DNA 模式',
    description: '根据商品类目，通过 LLM 聚类分析提取爆款视频的共性 DNA 模式（Hook/视觉/BGM/节奏/CTA）',
  })
  @ApiBody({ type: ExtractDnaDto })
  @ApiResponse({ status: 200, description: 'DNA 提取成功' })
  @ApiResponse({ status: 400, description: '样本不足或参数错误' })
  async extractDna(
    @Body() dto: ExtractDnaDto,
  ): Promise<ApiSuccessResponse<ViralDNAExtractData> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.viralDnaService.extractDNA({
        product_category: dto.product_category,
        market: dto.market,
        min_samples: dto.min_samples,
      });
      return { success: true, message: 'DNA 提取完成', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('dna')
  @ApiOperation({
    summary: 'DNA 列表',
    description: '分页查询已提取的爆款 DNA 模式列表，可按商品类目和市场筛选',
  })
  @ApiQuery({ name: 'product_category', required: false, description: '商品类目筛选' })
  @ApiQuery({ name: 'market', required: false, description: '市场区域筛选' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码 (default 1)' })
  @ApiQuery({ name: 'page_size', required: false, type: Number, description: '每页数量 (default 20)' })
  @ApiResponse({ status: 200, description: 'DNA 列表查询成功' })
  async listDna(
    @Query('product_category') productCategory?: string,
    @Query('market') market?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const { page: p, pageSize: ps } = this.parsePagination(page, pageSize);
      const result = await this.viralDnaService.listDna(
        productCategory,
        market,
        isNaN(p) ? 1 : Math.max(1, p),
        isNaN(ps) ? 20 : Math.min(100, Math.max(1, ps)),
      );
      return { success: true, message: 'DNA 列表', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('dna/:dnaId')
  @ApiOperation({
    summary: 'DNA 详情',
    description: '根据 DNA ID 查询爆款 DNA 模式的详细信息',
  })
  @ApiParam({ name: 'dnaId', description: 'DNA 记录 ID', required: true })
  @ApiResponse({ status: 200, description: 'DNA 详情查询成功' })
  @ApiResponse({ status: 404, description: 'DNA 记录不存在' })
  async getDna(
    @Param('dnaId') dnaId: string,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.viralDnaService.getDna(dnaId);
      return { success: true, message: 'DNA 详情', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ============================================================
  // 爆款账号订阅管理
  // ============================================================

  @Get('subscriptions')
  @ApiOperation({
    summary: '订阅列表',
    description: '分页获取爆款账号订阅列表',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码' })
  @ApiQuery({ name: 'page_size', required: false, type: Number, description: '每页条数' })
  @ApiResponse({ status: 200, description: '订阅列表' })
  async listSubscriptions(
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const { page: p, pageSize: ps } = this.parsePagination(page, pageSize);
      const result = await this.viralSubscriptionService.listSubscriptions(p, ps);
      return { success: true, message: '查询成功', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('subscriptions')
  @ApiOperation({
    summary: '创建订阅',
    description: '订阅指定平台的爆款账号，定期扫描其最新视频',
  })
  @ApiBody({ type: CreateSubscriptionDto })
  @ApiResponse({ status: 201, description: '订阅创建成功' })
  async createSubscription(
    @Body() dto: CreateSubscriptionDto,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.viralSubscriptionService.createSubscription(dto);
      return { success: true, message: '订阅创建成功', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Delete('subscriptions/:id')
  @ApiOperation({
    summary: '取消订阅',
    description: '取消指定账号订阅（软删除）',
  })
  @ApiParam({ name: 'id', description: '订阅ID', required: true })
  @ApiResponse({ status: 200, description: '取消成功' })
  @ApiResponse({ status: 404, description: '订阅不存在' })
  async cancelSubscription(
    @Param('id') id: string,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.viralSubscriptionService.cancelSubscription(id);
      return { success: true, message: '订阅已取消', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post('subscriptions/:id/scan-now')
  @ApiOperation({
    summary: '立即扫描',
    description: '立即扫描指定订阅账号的最新视频',
  })
  @ApiParam({ name: 'id', description: '订阅ID', required: true })
  @ApiResponse({ status: 200, description: '扫描已触发' })
  @ApiResponse({ status: 404, description: '订阅不存在' })
  async scanSubscriptionNow(
    @Param('id') id: string,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.viralSubscriptionService.scanNow(id);
      return { success: true, message: '扫描已触发', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get(':analysis_id')
  @ApiOperation({
    summary: '获取爆款视频拆解详情',
    description: '查询爆款视频结构化拆解的完整数据，包含策略、因子与报告 JSON',
  })
  @ApiParam({ name: 'analysis_id', description: '爆款视频分析ID', required: true })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: '爆款视频分析记录不存在' })
  async getViralAnalysisDetail(
    @Param('analysis_id') analysisId: string,
    @Query('product_id') productId?: string,
  ): Promise<ApiSuccessResponse<ViralVideoAnalysisDetail> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.viralAnalysisService.getViralAnalysisDetail(analysisId, productId);

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

  // ===========================================================================
  // Private: helpers
  // ===========================================================================

  private parsePagination(page?: string, pageSize?: string): { page: number; pageSize: number } {
    const p = parseInt(page ?? '1', 10);
    const ps = parseInt(pageSize ?? '20', 10);
    return {
      page: isNaN(p) ? 1 : Math.max(1, p),
      pageSize: isNaN(ps) ? 20 : Math.min(100, Math.max(1, ps)),
    };
  }
}
