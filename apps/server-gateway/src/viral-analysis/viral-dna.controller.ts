// =============================================================================
// TikStream AI — Viral DNA Controller
// =============================================================================

import {
  Controller,
  Post,
  Get,
  Sse,
  Param,
  Body,
  Query,
  Res,
  Logger,
  MessageEvent,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { ViralDnaService } from './viral-dna.service';
import { ScriptService } from '../script/script.service';
import { ProductService } from '../product/product.service';
import { ViralDNAExtractDto, ViralDNAListQueryDto, GenerateFromDNADto } from './viral-dna.dto';
import { ErrorCode } from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';

@Controller('api/v1')
export class ViralDnaController {
  private readonly logger = new Logger(ViralDnaController.name);

  constructor(
    private readonly viralDnaService: ViralDnaService,
    private readonly scriptService: ScriptService,
    private readonly productService: ProductService,
  ) {}

  /** SSE: 实时推送 DNA 提取进度 (统计聚类 + 语义标签) */
  @Sse('viral-dna/extract/stream')
  extractPatternsStream(
    @Query('category') category: string,
    @Query('market') market?: string,
    @Query('min_samples') min_samples?: string,
  ): Observable<MessageEvent> {
    const traceId = randomUUID();
    const dto: ViralDNAExtractDto = {
      category,
      market: market || 'GLOBAL',
      min_samples: min_samples ? parseInt(min_samples, 10) : 5,
    };

    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        try {
          const result = await this.viralDnaService.extractDNAPatterns(dto, (phase, progress, detail) => {
            subscriber.next({
              id: traceId,
              type: phase,
              data: JSON.stringify({ phase, progress, detail }),
              retry: 3000,
            } as MessageEvent);
          });

          subscriber.next({
            id: traceId,
            type: 'result',
            data: JSON.stringify({
              success: true,
              patterns: result.patterns,
              total_samples: result.total_samples,
              confidence: result.confidence,
              statistics: result.statistics,
            }),
            retry: 0,
          } as MessageEvent);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.error(`[DNA SSE] 提取失败: ${errMsg}`, error instanceof Error ? error.stack : undefined);
          subscriber.next({
            id: traceId,
            type: 'error',
            data: JSON.stringify({ phase: 'error', success: false, message: `DNA 提取失败: ${errMsg}`, detail: errMsg }),
            retry: 0,
          } as MessageEvent);
        } finally {
          subscriber.complete();
        }
      })();

      return () => {
        // cleanup on unsubscribe
      };
    });
  }

  @Post('viral-dna/extract')
  async extractPatterns(@Body() dto: ViralDNAExtractDto) {
    const traceId = randomUUID();

    try {
      const result = await this.viralDnaService.extractDNAPatterns(dto);

      return {
        success: true,
        message: `DNA 提取完成：${result.patterns.length} 个模式，基于 ${result.total_samples} 个样本`,
        data: {
          patterns: result.patterns,
          total_samples: result.total_samples,
          confidence: result.confidence,
          statistics: result.statistics,
        },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errCode = (error as { code?: string })?.code || 'INTERNAL_SERVER_ERROR';
      const errStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`DNA 提取失败: ${errMsg}`, errStack);
      return {
        success: false,
        message: `DNA 提取失败: ${errMsg}`,
        error: {
          code: errCode,
          retryable: false,
        },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('viral-dna')
  async listPatterns(@Query() query: ViralDNAListQueryDto) {
    const traceId = randomUUID();

    const filtered = await this.viralDnaService.listDnaPatterns(
      query.category,
      query.market,
    );

    return {
      success: true,
      message: `共 ${filtered.length} 个 DNA 模式`,
      data: filtered,
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('viral-dna/:dnaId')
  async getPattern(@Param('dnaId') dnaId: string) {
    const traceId = randomUUID();

    const pattern = await this.viralDnaService.getPattern(dnaId);

    if (!pattern) {
      return {
        success: false,
        message: `DNA 模式不存在: ${dnaId}`,
        error: { code: 'VIRAL_DNA_NOT_FOUND', retryable: false },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      message: 'OK',
      data: pattern,
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('scripts/generate/from-dna')
  async generateFromDNA(@Body() dto: GenerateFromDNADto) {
    const traceId = randomUUID();

    try {
      // 1. 获取产品完整信息
      const product = await this.productService.getProductDetail(dto.product_id);
      const productTitle = product.title || '';
      const productSellingPoints = product.selling_points || [];
      const productConstraintList: string[] = [];
      if (product.category) productConstraintList.push(`product_category: ${product.category}`);
      if (product.usage_scenario) productConstraintList.push(`usage_scenario: ${product.usage_scenario}`);
      if (product.brand) productConstraintList.push(`brand: ${product.brand}`);
      if (product.color) productConstraintList.push(`product_color: ${product.color}`);
      if (product.material_type) productConstraintList.push(`material: ${product.material_type}`);

      // 2. 从 DNA 提取策略/因子/约束覆盖（传入产品数据以增强 DNA 上下文）
      const overrides = await this.viralDnaService.generateFromDNA(
        dto.dna_id,
        dto.product_id,
        {
          style_vibe: dto.style_vibe,
          aspect_ratio: dto.aspect_ratio,
          language: dto.language,
          product_title: productTitle,
          product_selling_points: productSellingPoints,
        },
      );

      // 3. 构建产品简介文本，注入到 strategy_overrides
      const productBrief = this.buildProductBrief(product);
      const enrichedStrategyOverrides = {
        ...overrides.strategy_overrides,
        product_brief: productBrief,
      };

      // 4. 合并所有约束：产品约束 + DNA 约束覆盖
      const mergedConstraints = [
        ...productConstraintList,
        ...(overrides.constraint_overrides || []),
      ];

      // 5. 将 DNA overrides + 产品数据传入 Composed 模式执行实际剧本生成
      const script = await this.scriptService.generateComposedScript({
        product_id: overrides.product_id,
        title: productTitle || undefined,
        selling_points: productSellingPoints,
        target_audience: product.target_audience,
        strategy_overrides: enrichedStrategyOverrides,
        factor_overrides: overrides.factor_overrides,
        constraint_overrides: mergedConstraints,
        style_vibe: overrides.style_vibe,
        aspect_ratio: overrides.aspect_ratio,
        language: overrides.language,
        material_ids: dto.material_ids,
        enable_vision_analysis: dto.enable_vision_analysis,
      });

      return {
        success: true,
        message: 'DNA 驱动剧本生成成功',
        data: { script_id: script.script_id },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`DNA 驱动生成失败: ${errMsg}`, stack);

      const isHttpException = error instanceof Error && 'getStatus' in error;
      const statusCode = isHttpException
        ? (error as unknown as { getStatus: () => number }).getStatus()
        : 500;
      const businessCode =
        error instanceof Error && 'code' in error
          ? (error as Error & { code?: string }).code
          : undefined;

      return {
        success: false,
        message: errMsg,
        error: {
          code: businessCode || ErrorCode.INTERNAL_SERVER_ERROR,
          retryable: statusCode < 500,
          trace_id: traceId,
        },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 构建产品简介文本，供 LLM 理解产品全貌
   */
  private buildProductBrief(product: {
    title: string;
    selling_points: string[];
    target_audience?: string;
    category?: string;
    usage_scenario?: string;
    brand?: string;
    color?: string;
    material_type?: string;
    size_desc?: string;
    rich_features?: Record<string, unknown>;
  }): string {
    const lines: string[] = [];
    lines.push(`产品名称: ${product.title}`);
    if (product.category) lines.push(`类目: ${product.category}`);
    if (product.brand) lines.push(`品牌: ${product.brand}`);
    if (product.selling_points?.length) {
      lines.push(`核心卖点: ${product.selling_points.join('；')}`);
    }
    if (product.target_audience) lines.push(`目标受众: ${product.target_audience}`);
    if (product.usage_scenario) lines.push(`使用场景: ${product.usage_scenario}`);
    if (product.color) lines.push(`颜色: ${product.color}`);
    if (product.material_type) lines.push(`材质: ${product.material_type}`);
    if (product.size_desc) lines.push(`尺寸: ${product.size_desc}`);
    if (product.rich_features && Object.keys(product.rich_features).length > 0) {
      lines.push(`产品特性: ${JSON.stringify(product.rich_features)}`);
    }
    return lines.join('\n');
  }
}
