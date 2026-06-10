// =============================================================================
// TikStream AI — Analytics Controller
// 协议适配层: GET /api/v1/analytics/retention-curve, style-factors, audio-visual-sankey, ab-compare
//             POST /api/v1/analytics/self-heal
// =============================================================================

import { Controller, Get, Post, Body, Param, Query, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody, ApiParam } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AutoAbService } from './auto-ab.service';
import { ColdStartService } from './cold-start.service';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  RetentionCurveResponse,
  StyleFactorHeatmapResponse,
  AudioVisualSankeyResponse,
  AbCompareReportResponse,
  AnalyticsMetric,
  HeatmapDimension,
  SelfHealResultResponse,
  PerformancePrediction,
} from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';
import { buildApiErrorResponse } from '../common/http-error-response';
import { AnalyticsSelfHealRequestDto } from './dto/self-heal.dto';
import { PredictPerformanceRequestDto } from './dto/cold-start.dto';
import { Observable, Subject } from 'rxjs';

@ApiTags('Analytics')
@Controller('api/v1/analytics')
export class AnalyticsController {

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly autoAbService: AutoAbService,
    private readonly coldStartService: ColdStartService,
  ) {}

  @Get('retention-curve')
  @ApiOperation({
    summary: '查询留存曲线',
    description:
      '根据创作任务 ID 查询分镜级用户留存率曲线与完成率曲线，数据来源于 DuckDB 预计算结果。支持 SECOND/SHOT 两种粒度，自动检测显著掉点并标注相关分镜。',
  })
  @ApiQuery({
    name: 'product_id',
    required: true,
    type: String,
    description: '商品 ID (UUID)',
  })
  @ApiQuery({
    name: 'creation_id',
    required: true,
    type: String,
    description: '创作任务 ID (UUID)',
  })
  @ApiQuery({
    name: 'metric_type',
    required: false,
    type: String,
    description: '指标类型: RETENTION_RATE (留存率) | COMPLETION_RATE (完成率)',
    example: 'RETENTION_RATE',
    enum: ['RETENTION_RATE', 'COMPLETION_RATE'],
  })
  @ApiQuery({
    name: 'granularity',
    required: false,
    type: String,
    description: '粒度: SECOND (逐秒) | SHOT (分镜级聚合)',
    example: 'SECOND',
    enum: ['SECOND', 'SHOT'],
  })
  @ApiQuery({
    name: 'include_shot_markers',
    required: false,
    type: Boolean,
    description: '是否包含分镜分界标记，默认 true',
    example: 'true',
  })
  @ApiQuery({
    name: 'time_range',
    required: false,
    type: String,
    description: '日级模式的时间范围: 7d | 30d | 90d，默认 90d',
    example: '30d',
    enum: ['7d', '30d', '90d'],
  })
  @ApiResponse({
    status: 200,
    description: '查询成功，返回留存曲线数据 (可能为 DuckDB 实时数据或模拟预测数据)',
  })
  @ApiResponse({
    status: 400,
    description:
      '请求参数错误: product_id/creation_id 缺失, metric_type/granularity 非法值',
  })
  @ApiResponse({
    status: 404,
    description: '创作任务不存在 / 关联剧本已删除 / product_id 不匹配',
  })
  @ApiResponse({
    status: 422,
    description: '创作任务关联的剧本不含有效分镜',
  })
  @ApiResponse({
    status: 500,
    description: '内部服务器错误 (数据库 / DuckDB 异常)',
  })
  async getRetentionCurve(
    @Query('product_id') productId: string,
    @Query('creation_id') creationId: string,
    @Query('metric_type') metricType?: string,
    @Query('granularity') granularity?: string,
    @Query('include_shot_markers') includeShotMarkers?: string,
    @Query('time_range') timeRange?: string,
  ): Promise<ApiSuccessResponse<RetentionCurveResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.analyticsService.getRetentionCurve({
        product_id: productId,
        creation_id: creationId,
        metric_type: metricType as 'RETENTION_RATE' | 'COMPLETION_RATE' | undefined,
        granularity: granularity as 'SECOND' | 'SHOT' | 'DAY' | undefined,
        include_shot_markers:
          includeShotMarkers !== undefined
            ? includeShotMarkers === 'true'
            : undefined,
        time_range: timeRange as '7d' | '30d' | '90d' | undefined,
      });

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

  @Get('style-factors')
  @ApiOperation({
    summary: '查询风格因子热力图',
    description:
      '根据商品 ID 查询多因子归因热力图，支持 CTR/CVR/COMPLETION_RATE/RETENTION_RATE 四种度量指标在 NARRATIVE_STRATEGY × VISUAL_STYLE / BGM_STYLE / CTA_STYLE 交叉维度的得分分布。数据来源于 DuckDB 预计算结果，若不可用自动降级为确定性预测数据。',
  })
  @ApiQuery({
    name: 'product_id',
    required: true,
    type: String,
    description: '商品 ID (UUID)',
  })
  @ApiQuery({
    name: 'metric',
    required: false,
    type: String,
    description: '度量指标: CTR | CVR | COMPLETION_RATE | RETENTION_RATE，默认 CVR',
    example: 'CVR',
    enum: ['CTR', 'CVR', 'COMPLETION_RATE', 'RETENTION_RATE'],
  })
  @ApiQuery({
    name: 'x_dimension',
    required: false,
    type: String,
    description: 'X 轴维度: NARRATIVE_STRATEGY | VISUAL_STYLE | BGM_STYLE | CTA_STYLE',
    example: 'NARRATIVE_STRATEGY',
    enum: ['NARRATIVE_STRATEGY', 'VISUAL_STYLE', 'BGM_STYLE', 'CTA_STYLE'],
  })
  @ApiQuery({
    name: 'y_dimension',
    required: false,
    type: String,
    description: 'Y 轴维度: NARRATIVE_STRATEGY | VISUAL_STYLE | BGM_STYLE | CTA_STYLE',
    example: 'VISUAL_STYLE',
    enum: ['NARRATIVE_STRATEGY', 'VISUAL_STYLE', 'BGM_STYLE', 'CTA_STYLE'],
  })
  @ApiQuery({
    name: 'top_n',
    required: false,
    type: Number,
    description: 'Top N 正/负贡献因子数量，默认 3，范围 [1, 50]',
    example: '3',
  })
  @ApiResponse({
    status: 200,
    description: '查询成功，返回热力图矩阵数据 (可能为 DuckDB 实时数据或模拟预测数据)',
  })
  @ApiResponse({
    status: 400,
    description:
      '请求参数错误: product_id 缺失 / metric 非法值 / x_dimension 非法值 / y_dimension 非法值 / 维度冲突 / top_n 超出范围',
  })
  @ApiResponse({
    status: 404,
    description: '商品不存在',
  })
  @ApiResponse({
    status: 500,
    description: '内部服务器错误 (数据库异常)',
  })
  async getStyleFactors(
    @Query('product_id') productId: string,
    @Query('metric') metric?: string,
    @Query('x_dimension') xDimension?: string,
    @Query('y_dimension') yDimension?: string,
    @Query('top_n') topN?: string,
    @Query('time_range') timeRange?: string,
  ): Promise<ApiSuccessResponse<StyleFactorHeatmapResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const parsedMetric = (metric ?? 'CVR') as AnalyticsMetric;
      const parsedXDim = (xDimension ?? 'NARRATIVE_STRATEGY') as HeatmapDimension;
      const parsedYDim = (yDimension ?? 'VISUAL_STYLE') as HeatmapDimension;
      const parsedTopN = topN !== undefined ? parseInt(topN, 10) : 3;
      const parsedTimeRange = (timeRange ?? '30d') as '7d' | '30d' | '90d';
      if (Number.isNaN(parsedTopN)) {
        return {
          success: false,
          message: `top_n 参数格式错误，必须为整数`,
          error: { code: 'INVALID_REQUEST', retryable: false },
          trace_id: traceId,
          timestamp: new Date().toISOString(),
        };
      }

      const result = await this.analyticsService.getStyleFactors({
        product_id: productId,
        metric: parsedMetric,
        x_dimension: parsedXDim,
        y_dimension: parsedYDim,
        top_n: parsedTopN,
        time_range: parsedTimeRange,
      });

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

  @Get('audio-visual-sankey')
  @ApiOperation({
    summary: '查询视听留存桑基图',
    description:
      '根据商品 ID 和可选的创作任务 ID 查询 BGM_STYLE → VISUAL_STYLE → RETENTION_BUCKET 三层级用户流转桑基图。透视不同风格维度下用户的留存路径（流失模式），支撑分析看板首页。数据来源于 DuckDB 预计算结果，若不可用自动降级为确定性预测数据。',
  })
  @ApiQuery({
    name: 'product_id',
    required: true,
    type: String,
    description: '商品 ID (UUID)',
  })
  @ApiQuery({
    name: 'creation_id',
    required: false,
    type: String,
    description: '创作任务 ID (UUID)，不传则查询全商品聚合桑基图',
  })
  @ApiQuery({
    name: 'metric',
    required: false,
    type: String,
    description: '指标类型，默认 RETENTION_FLOW',
    example: 'RETENTION_FLOW',
  })
  @ApiQuery({
    name: 'source_dimension',
    required: false,
    type: String,
    description: '源维度，默认 BGM_STYLE',
    example: 'BGM_STYLE',
  })
  @ApiQuery({
    name: 'middle_dimension',
    required: false,
    type: String,
    description: '中间维度，默认 VISUAL_STYLE',
    example: 'VISUAL_STYLE',
  })
  @ApiQuery({
    name: 'target_dimension',
    required: false,
    type: String,
    description: '目标维度，默认 RETENTION_BUCKET',
    example: 'RETENTION_BUCKET',
  })
  @ApiResponse({
    status: 200,
    description: '查询成功，返回三层节点、链接及汇总统计 (可能为 DuckDB 实时数据或模拟预测数据)',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误: product_id 缺失 / creation_id 为空白字符串',
  })
  @ApiResponse({
    status: 404,
    description: '商品不存在',
  })
  @ApiResponse({
    status: 500,
    description: '内部服务器错误 (数据库异常)',
  })
  async getAudioVisualSankey(
    @Query('product_id') productId: string,
    @Query('creation_id') creationId?: string,
    @Query('metric') metric?: string,
    @Query('source_dimension') sourceDimension?: string,
    @Query('middle_dimension') middleDimension?: string,
    @Query('target_dimension') targetDimension?: string,
    @Query('time_range') timeRange?: string,
  ): Promise<ApiSuccessResponse<AudioVisualSankeyResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const parsedTimeRange = (timeRange ?? '30d') as '7d' | '30d' | '90d';

      const result = await this.analyticsService.getAudioVisualSankey({
        product_id: productId,
        creation_id: creationId,
        metric,
        source_dimension: sourceDimension as HeatmapDimension | undefined,
        middle_dimension: middleDimension as HeatmapDimension | undefined,
        target_dimension: targetDimension,
        time_range: parsedTimeRange,
      });

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

  @Get('ab-compare')
  @ApiOperation({
    summary: 'AB 对比查询',
    description:
      '对同一商品的任意两个创作版本进行多维度 AB 对比分析，输出留存率、完成率、CTR、CVR 及分镜节奏五项指标对比结果，结合 DuckDB 预计算数据驱动自适应加权评分判定优胜者 A/B/TIE，并自动生成诊断文本与改进建议。',
  })
  @ApiQuery({
    name: 'product_id',
    required: true,
    type: String,
    description: '商品 ID (UUID)',
  })
  @ApiQuery({
    name: 'creation_id_a',
    required: true,
    type: String,
    description: '创作版本 A 的 ID (UUID)',
  })
  @ApiQuery({
    name: 'creation_id_b',
    required: true,
    type: String,
    description: '创作版本 B 的 ID (UUID)',
  })
  @ApiQuery({
    name: 'metric_set',
    required: false,
    type: String,
    description: '可选指标集合标识，用于筛选对比指标子集',
    example: 'default',
  })
  @ApiResponse({
    status: 200,
    description: '查询成功，返回完整 AB 对比报告 (可能为 DuckDB 实时数据或模拟预测数据，见 is_mock 字段)',
  })
  @ApiResponse({
    status: 400,
    description:
      '参数校验失败: product_id / creation_id_a / creation_id_b 为必填字段；creation_id_a 与 creation_id_b 不能相同',
    schema: {
      example: {
        error: {
          errorCode: 'ANALYTICS_AB_COMPARE_SAME_CREATION',
          message: 'creation_id_a 与 creation_id_b 不能相同，AB 对比需要两个不同的创作版本',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: '资源不存在: 商品不存在 / 创作任务不存在 / 剧本已被删除',
    schema: {
      example: {
        error: {
          errorCode: 'CREATION_NOT_FOUND',
          message: 'AB对比 [A] 创作任务不存在',
        },
      },
    },
  })
  @ApiResponse({
    status: 422,
    description: '业务语义错误: 创作任务所关联剧本不含任何有效分镜',
    schema: {
      example: {
        error: {
          errorCode: 'ANALYTICS_NO_SHOTS_IN_CREATION',
          message: 'AB对比 [A] 创作任务关联的剧本不包含任何有效分镜',
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: '内部服务器错误 (数据库异常)',
  })
  async getAbCompare(
    @Query('product_id') productId: string,
    @Query('creation_id_a') creationIdA: string,
    @Query('creation_id_b') creationIdB: string,
    @Query('metric_set') metricSet?: string,
  ): Promise<ApiSuccessResponse<AbCompareReportResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.analyticsService.getAbCompare({
        product_id: productId,
        creation_id_a: creationIdA,
        creation_id_b: creationIdB,
        metric_set: metricSet,
      });

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

  @Post('self-heal')
  @ApiOperation({
    summary: '一键自愈诊断',
    description:
      '基于 Retention Drop / AB Compare 触发源，自动诊断分镜级问题（Hook弱/旁白过长/风格不匹配/CTA弱），输出自愈策略（REWRITE_ONLY/RERENDER_SHOT/REGENERATE_VARIANT），支持 dry_run 预览模式。数据来源于 DuckDB 预计算结果，若不可用自动降级为确定性预测数据。',
  })
  @ApiBody({ type: AnalyticsSelfHealRequestDto })
  @ApiResponse({
    status: 200,
    description: '诊断完成，返回 affected_shots 及自愈建议；当 dry_run=false 时会真实创建创作任务',
  })
  @ApiResponse({
    status: 400,
    description:
      '请求参数错误: product_id/creation_id 缺失、trigger_source/issue_type/strategy 非法值、MANUAL 触发源未指定 target_shot_indexes',
  })
  @ApiResponse({
    status: 404,
    description:
      '创作任务不存在 / 关联剧本已删除 / product_id 不匹配 / 商品不存在',
  })
  @ApiResponse({
    status: 422,
    description: '创作任务关联的剧本不含有效分镜',
  })
  @ApiResponse({
    status: 500,
    description: '内部服务器错误 (数据库异常)',
  })
  async postSelfHeal(
    @Body() dto: AnalyticsSelfHealRequestDto,
  ): Promise<ApiSuccessResponse<SelfHealResultResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const result = await this.analyticsService.getSelfHealDiagnosis(dto);

      return {
        success: true,
        message: result.dry_run ? 'ok' : 'task created',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  /**
   * SSE 流式自愈诊断 — 实时推送进度
   *
   * 通过 Query 参数传递诊断请求，Server-Sent Events 推送各阶段进度：
   *   step: validating | fetching_product | fetching_creation | fetching_data | diagnosing | ai_generating | completing
   *   type:  progress | ai_chunk | done | error
   */
  @Sse('self-heal/stream')
  @ApiOperation({
    summary: '一键自愈诊断 SSE 流',
    description: '通过 Server-Sent Events 实时推送自愈诊断进度，包含各阶段状态、AI 生成内容分段和最终结果。',
  })
  @ApiQuery({ name: 'product_id', required: true, type: String })
  @ApiQuery({ name: 'creation_id', required: true, type: String })
  @ApiQuery({ name: 'trigger_source', required: false, type: String, description: '触发来源: RETENTION_DROP | AB_COMPARE | MANUAL' })
  @ApiQuery({ name: 'issue_type', required: false, type: String, description: '问题类型: HOOK_WEAK | VOICEOVER_TOO_LONG | STYLE_MISMATCH | CTA_WEAK' })
  @ApiQuery({ name: 'strategy', required: false, type: String, description: '策略: REWRITE_ONLY | RERENDER_SHOT | REGENERATE_VARIANT' })
  @ApiQuery({ name: 'dry_run', required: false, type: String, description: '预览模式: true | false' })
  @ApiQuery({ name: 'target_shot_indexes', required: false, type: String, description: '目标分镜索引，逗号分隔' })
  selfHealStream(
    @Query('product_id') productId: string,
    @Query('creation_id') creationId: string,
    @Query('trigger_source') triggerSource?: string,
    @Query('issue_type') issueType?: string,
    @Query('strategy') strategy?: string,
    @Query('dry_run') dryRun?: string,
    @Query('target_shot_indexes') targetShotIndexesStr?: string,
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    const traceId = randomUUID();

    const targetShotIndexes = targetShotIndexesStr
      ? targetShotIndexesStr.split(',').map(Number).filter((n) => !isNaN(n))
      : undefined;

    const dto: AnalyticsSelfHealRequestDto = {
      product_id: productId,
      creation_id: creationId,
      trigger_source: (triggerSource as AnalyticsSelfHealRequestDto['trigger_source']) || 'RETENTION_DROP',
      issue_type: (issueType as AnalyticsSelfHealRequestDto['issue_type']) || 'HOOK_WEAK',
      strategy: (strategy as AnalyticsSelfHealRequestDto['strategy']) || 'REWRITE_ONLY',
      dry_run: dryRun === 'true',
      target_shot_indexes: targetShotIndexes,
    };

    void (async () => {
      try {
        const onProgress = (event: { step: string; message: string; data?: unknown }) => {
          subject.next({
            data: JSON.stringify({
              type: 'progress',
              step: event.step,
              message: event.message,
              trace_id: traceId,
              timestamp: new Date().toISOString(),
              ...(event.data ? { data: event.data } : {}),
            }),
          } as MessageEvent);
        };

        const result = await this.analyticsService.getSelfHealDiagnosisWithProgress(dto, onProgress);

        subject.next({
          data: JSON.stringify({
            type: 'done',
            result,
            trace_id: traceId,
            timestamp: new Date().toISOString(),
          }),
        } as MessageEvent);

        subject.complete();
      } catch (error) {
        subject.next({
          data: JSON.stringify({
            type: 'error',
            message: (error as Error)?.message || '自愈诊断失败',
            trace_id: traceId,
            timestamp: new Date().toISOString(),
          }),
        } as MessageEvent);
        subject.complete();
      }
    })();

    return subject.asObservable();
  }

  // ============================================================
  // 自动 A/B 对比 (Phase 3)
  // ============================================================

  @Post('auto-ab')
  async createAutoAb(
    @Body() body: { script_id: string; style_variants: Array<{ label: string; style_vibe: string }> },
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.autoAbService.createSession(body);
      return { success: true, message: 'A/B 会话已创建', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('auto-ab/:sessionId')
  async getAutoAb(
    @Param('sessionId') sessionId: string,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.autoAbService.getSession(sessionId);
      return { success: true, message: '会话状态', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('auto-ab')
  async listAutoAb(
    @Query('script_id') scriptId?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ): Promise<ApiSuccessResponse<unknown> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.autoAbService.listSessions(
        scriptId,
        page ? parseInt(page, 10) : 1,
        pageSize ? parseInt(pageSize, 10) : 20,
      );
      return { success: true, message: '会话列表', data: result, trace_id: traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  // ============================================================
  // 投放效果预测（冷启动加速）
  // ============================================================

  @Post('predict-performance')
  @ApiOperation({
    summary: '投放效果预测',
    description:
      '冷启动投放效果预测：大模型深度分析 → DuckDB 预计算 → 同类爆款 DNA → 增强启发式模型，四级降级输出 CTR/CVR/留存率预测、置信度、风险因素和优化建议。',
  })
  @ApiBody({ type: PredictPerformanceRequestDto })
  @ApiResponse({
    status: 200,
    description: '预测结果',
    schema: {
      example: {
        success: true,
        message: '预测完成',
        data: {
          script_id: 'uuid',
          predicted_ctr: 0.058,
          predicted_cvr: 0.025,
          predicted_retention: 0.62,
          predicted_completion: 0.55,
          confidence: 0.45,
          data_source: 'HEURISTIC_FALLBACK',
          risk_factors: ['开场吸引力不足'],
          improvement_suggestions: [
            {
              shot_index: 0,
              shot_order: '第1镜',
              suggestion: '将开场改为问题前置型钩子...',
              expected_boost: 0.06,
              category: 'HOOK',
            },
          ],
          predicted_at: '2026-01-01T00:00:00.000Z',
        },
        trace_id: 'uuid',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: '参数错误' })
  @ApiResponse({ status: 422, description: '剧本无分镜数据' })
  async predictPerformance(
    @Body() body: PredictPerformanceRequestDto,
  ): Promise<ApiSuccessResponse<PerformancePrediction> | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const result = await this.coldStartService.predictPerformance(
        body.script_id,
        body.product_id,
        body.force_source,
      );
      return {
        success: true,
        message: '预测完成',
        data: result,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  /**
   * SSE 流式冷启动预测 — 实时推送进度
   *
   * 6 阶段实时进度：
   *   loading_script → extracting_features → checking_viral_dna → llm_analyzing → synthesizing → completed
   *   type: progress | done | error
   */
  @Sse('predict-performance/stream')
  @ApiOperation({
    summary: '冷启动预测 SSE 流',
    description: '通过 Server-Sent Events 实时推送冷启动预测进度，包含特征提取、DNA比对、大模型分析、结果综合各阶段。',
  })
  @ApiQuery({ name: 'script_id', required: true, type: String })
  @ApiQuery({ name: 'product_id', required: false, type: String })
  predictPerformanceStream(
    @Query('script_id') scriptId: string,
    @Query('product_id') productId?: string,
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    const traceId = randomUUID();

    void (async () => {
      try {
        const onProgress = (event: { step: string; message: string; data?: unknown }) => {
          subject.next({
            data: JSON.stringify({
              type: 'progress',
              step: event.step,
              message: event.message,
              trace_id: traceId,
              timestamp: new Date().toISOString(),
              ...(event.data ? { data: event.data } : {}),
            }),
          } as MessageEvent);
        };

        const result = await this.coldStartService.predictPerformanceStream(
          scriptId,
          productId ?? '',
          onProgress,
        );

        subject.next({
          data: JSON.stringify({
            type: 'done',
            result,
            trace_id: traceId,
            timestamp: new Date().toISOString(),
          }),
        } as MessageEvent);

        subject.complete();
      } catch (error) {
        subject.next({
          data: JSON.stringify({
            type: 'error',
            message: (error as Error)?.message || '预测失败',
            trace_id: traceId,
            timestamp: new Date().toISOString(),
          }),
        } as MessageEvent);
        subject.complete();
      }
    })();

    return subject.asObservable();
  }
}
