import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { CommentRepository } from './comment.repository';
import { TikTokCommentClient, TikTokComment } from './tiktok-comment-client';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { SiliconFlowTextProvider } from '../../services/ai/siliconflow-text.provider';
import { serviceException } from '../common/service-exception';
import type {
  FetchCommentsDto,
  FetchCommentsResponse,
  AnalyzeCommentsDto,
  BatchAnalyzeResponse,
  CommentSentimentSummary,
  OptimizeContentDto,
  OptimizationResponse,
  StructuredOptimization,
  CommentListQuery,
  CommentResponse,
  OptimizationRecordResponse,
} from './dto';

const COMMENT_CONSTANTS = {
  DOUBAO_COMMENT_ANALYSIS_MODEL: 'doubao-seed-2-0-pro-251130',
  DOUBAO_COMMENT_ANALYSIS_MAX_TOKENS: 4096,
  /** 情感分类批次大小（20条/批，平衡速度与准确率） */
  SENTIMENT_BATCH_SIZE: 20,
  /** 深度分析批次大小（大模型，每天评论需提取话题/痛点等） */
  DEEP_ANALYSIS_BATCH_SIZE: 5,
  OPTIMIZATION_NEGATIVE_THRESHOLD: 0.3,
  OPTIMIZATION_PAIN_POINT_THRESHOLD: 3,
  OPTIMIZATION_FEATURE_REQUEST_THRESHOLD: 2,
} as const;

/** 分析进度事件 */
export interface AnalysisProgressEvent {
  phase: 'sentiment' | 'deep_analysis';
  stage: 'start' | 'progress' | 'done';
  message: string;
  current: number;
  total: number;
}

interface DoubaoCommentAnalysisResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  key_topics: string[];
  pain_points: string[];
  feature_requests: string[];
  purchasing_intent: number;
  brief_reason: string;
}

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);

  constructor(
    private readonly repository: CommentRepository,
    private readonly tiktokClient: TikTokCommentClient,
    private readonly doubaoProvider: DoubaoTextProvider,
    private readonly siliconFlowProvider: SiliconFlowTextProvider,
  ) {}

  // ========== 评论采集 ==========

  async fetchComments(dto: FetchCommentsDto): Promise<FetchCommentsResponse> {
    this.logger.log(`Fetching comments for product ${dto.product_id}, mode: ${dto.mode}`);

    // 先查询数据库中该商品已有的评论总数
    const dbTotalCount = await this.repository.countComments(dto.product_id);

    // 如果数据库中已有评论，直接从数据库返回，不再生成 mock
    if (dto.mode === 'mock' && dbTotalCount > 0) {
      this.logger.log(`DB fetch: product ${dto.product_id} already has ${dbTotalCount} comments in database`);
      return {
        comment_count: dbTotalCount,
        new_count: 0,
        skipped_count: dbTotalCount,
        db_total_count: dbTotalCount,
      };
    }

    // 数据库中没有评论 → 生成 mock 评论并写入 DB
    const { comments } = await this.tiktokClient.fetchComments(
      dto.video_url,
      dto.max_count,
      dto.mode,
    );

    let newCount = 0;
    let skippedCount = 0;

    for (const comment of comments) {
      try {
        const existing = await this.repository.findCommentByExternalId('tiktok', comment.externalId);
        if (existing) {
          skippedCount++;
          continue;
        }

        await this.repository.createComment({
          productId: dto.product_id,
          platform: 'tiktok',
          externalId: comment.externalId,
          videoUrl: dto.video_url,
          authorName: comment.authorName,
          content: comment.content,
          likeCount: comment.likeCount,
          replyCount: comment.replyCount,
          commentedAt: comment.commentedAt ? new Date(comment.commentedAt) : undefined,
        });
        newCount++;
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Failed to persist comment ${comment.externalId}: ${err.message}`);
        skippedCount++;
      }
    }

    this.logger.log(`Fetch complete: ${newCount} new, ${skippedCount} skipped (DB total: ${dbTotalCount + newCount})`);
    return {
      comment_count: comments.length,
      new_count: newCount,
      skipped_count: skippedCount,
      db_total_count: dbTotalCount + newCount,
    };
  }

  // ========== 情感分析（两阶段） ==========

  /**
   * 两阶段分析：
   * Phase 1: 情感三分类（SiliconFlow Qwen3-4B，20条/批）
   * Phase 2: 大模型深度分析（Doubao，5条/批，仅非中性评论）
   */
  async analyzeComments(
    dto: AnalyzeCommentsDto,
    onProgress?: (event: AnalysisProgressEvent) => void,
  ): Promise<BatchAnalyzeResponse> {
    this.logger.log(`Analyzing comments for product ${dto.product_id}`);

    const comments = dto.comment_ids
      ? await this.loadCommentsByIds(dto.comment_ids)
      : await this.repository.findCommentsWithoutAnalysis(dto.product_id, dto.max_count || 50);

    if (comments.length === 0) {
      throw serviceException(
        { message: '没有待分析的评论', error: { code: 'NO_COMMENTS_TO_ANALYZE', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    let sentimentAnalyzed = 0;
    let sentimentFailed = 0;
    let deepAnalyzed = 0;
    let deepFailed = 0;

    // ======== Phase 1: 情感三分类（SiliconFlow Qwen3-4B） ========
    onProgress?.({ phase: 'sentiment', stage: 'start', message: `开始情感分类，共 ${comments.length} 条评论`, current: 0, total: comments.length });

    const sentimentBatches = this.chunkArray(comments as Record<string, unknown>[], COMMENT_CONSTANTS.SENTIMENT_BATCH_SIZE);
    for (const batch of sentimentBatches) {
      try {
        const classifications = await this.classifySentimentWithFallback(batch);
        for (let i = 0; i < batch.length; i++) {
          const commentObj = batch[i] as Record<string, unknown>;
          // 回写 sentiment 到内存对象，确保 Phase 2 能读取到 analysis.sentiment
          commentObj.analysis = { sentiment: classifications[i] };
          try {
            await this.repository.createAnalysis({
              commentId: commentObj.id as string,
              sentiment: classifications[i],
              keyTopics: [],
              painPoints: [],
              featureRequests: [],
              purchasingIntent: 0,
              rawAnalysis: {},
              confidence: 0.85,
              modelUsed: 'Qwen3-4B (SiliconFlow sentiment)',
            });
            sentimentAnalyzed++;
          } catch (err) {
            this.logger.error(`Failed to persist sentiment: ${(err as Error).message}`);
            sentimentFailed++;
          }
        }
      } catch (err) {
        this.logger.error(`Sentiment batch failed: ${(err as Error).message}`);
        sentimentFailed += batch.length;
      }
      onProgress?.({ phase: 'sentiment', stage: 'progress', message: `情感分类中...`, current: sentimentAnalyzed, total: comments.length });
    }
    onProgress?.({ phase: 'sentiment', stage: 'done', message: `情感分类完成: ${sentimentAnalyzed} 条`, current: sentimentAnalyzed, total: comments.length });

    // ======== Phase 2: 深度分析（大模型，仅非中性评论） ========
    const nonNeutralComments = comments.filter((c) => {
      const analysis = (c as unknown as Record<string, unknown>).analysis as Record<string, unknown> | null;
      const sentiment = analysis?.sentiment as string | undefined;
      return sentiment === 'positive' || sentiment === 'negative';
    });

    if (nonNeutralComments.length > 0) {
      onProgress?.({ phase: 'deep_analysis', stage: 'start', message: `开始深度分析 ${nonNeutralComments.length} 条非中性评论`, current: 0, total: nonNeutralComments.length });

      const deepBatches = this.chunkArray(nonNeutralComments as Record<string, unknown>[], COMMENT_CONSTANTS.DEEP_ANALYSIS_BATCH_SIZE);
      for (const batch of deepBatches) {
        try {
          const deepResults = await this.callDoubaoForDeepAnalysis(batch);
          for (let i = 0; i < batch.length; i++) {
            try {
              await this.repository.updateAnalysis((batch[i] as Record<string, unknown>).id as string, {
                keyTopics: deepResults[i].key_topics,
                painPoints: deepResults[i].pain_points,
                featureRequests: deepResults[i].feature_requests,
                purchasingIntent: deepResults[i].purchasing_intent,
                rawAnalysis: deepResults[i] as unknown as Record<string, unknown>,
                confidence: 0.85,
                modelUsed: COMMENT_CONSTANTS.DOUBAO_COMMENT_ANALYSIS_MODEL,
              });
              deepAnalyzed++;
            } catch (err) {
              this.logger.error(`Failed to persist deep analysis: ${(err as Error).message}`);
              deepFailed++;
            }
          }
        } catch (err) {
          this.logger.error(`Deep analysis batch failed: ${(err as Error).message}`);
          deepFailed += batch.length;
        }
        onProgress?.({ phase: 'deep_analysis', stage: 'progress', message: `深度分析中...`, current: deepAnalyzed, total: nonNeutralComments.length });
      }
      onProgress?.({ phase: 'deep_analysis', stage: 'done', message: `深度分析完成: ${deepAnalyzed} 条`, current: deepAnalyzed, total: nonNeutralComments.length });
    }

    // 生成汇总
    const summary = await this.buildSentimentSummary(dto.product_id);

    return {
      analyzed_count: sentimentAnalyzed + deepAnalyzed,
      failed_count: sentimentFailed + deepFailed,
      summary,
    };
  }

  private async loadCommentsByIds(ids: string[]): Promise<Record<string, unknown>[]> {
    const comments: Record<string, unknown>[] = [];
    for (const id of ids) {
      const c = await this.repository.findCommentById(id);
      if (c) comments.push(c as unknown as Record<string, unknown>);
    }
    return comments;
  }

  /**
   * 情感分类（SiliconFlow Qwen3-4B，快速中文电商评论分类）
   * 无降级：失败直接抛错，不做假数据
   */
  private async classifySentimentWithFallback(
    comments: Record<string, unknown>[],
  ): Promise<Array<'positive' | 'neutral' | 'negative'>> {
    const items = comments.map((c) => {
      const record = c as Record<string, unknown>;
      return { content: String(record.content || ''), likeCount: Number(record.likeCount || 0) };
    });

    try {
      const results = await this.siliconFlowProvider.classifySentimentBatch(items);
      return results.map((r) => r.sentiment);
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.logger.error(`SiliconFlow sentiment classification failed: ${err}`);
      throw serviceException(
        {
          message: `AI 情感分类服务异常，请稍后重试: ${err}`,
          error: { code: 'AI_CLASSIFICATION_FAILED', retryable: true },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** Phase 2: 大模型深度分析（话题/痛点/功能需求/购买意向） */
  private async callDoubaoForDeepAnalysis(
    comments: Record<string, unknown>[],
  ): Promise<DoubaoCommentAnalysisResult[]> {
    const systemPrompt = `你是一个 TikTok 电商评论分析专家。分析以下评论，提取深度信息。
每条评论输出 JSON：
{
  "key_topics": ["话题1", "话题2"],
  "pain_points": ["痛点1"],
  "feature_requests": ["功能需求1"],
  "purchasing_intent": 0.0-1.0,
  "brief_reason": "简短分析"
}

规则：
- 购买意向：识别"想买""多少钱""怎么下单""已下单"等信号
- 痛点：产品缺陷、使用障碍、竞品对比劣势
- 功能需求：用户希望增加的改进
- 严格输出 JSON 数组，不要包含 markdown 标记`;

    const userPrompt = comments
      .map((c, i) => {
        const record = c as Record<string, unknown>;
        return `[评论${i + 1}] ${record.content || ''} (点赞:${record.likeCount || 0})`;
      })
      .join('\n');

    let rawResponse: string;
    try {
      rawResponse = await this.doubaoProvider.generateText(systemPrompt, userPrompt);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Doubao API call failed for deep analysis: ${err.message}`);
      throw serviceException(
        {
          message: `AI 深度分析服务异常，请稍后重试: ${err.message}`,
          error: { code: 'AI_DEEP_ANALYSIS_FAILED', retryable: true },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const cleaned = rawResponse
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      if (cleaned) {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          return parsed as DoubaoCommentAnalysisResult[];
        }
        return [parsed as DoubaoCommentAnalysisResult];
      }
      throw new Error('Empty response from Doubao');
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to parse Doubao deep analysis response: ${err.message}`);
      throw serviceException(
        {
          message: `AI 深度分析结果解析失败: ${err.message}`,
          error: { code: 'AI_DEEP_ANALYSIS_PARSE_FAILED', retryable: true },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async buildSentimentSummary(productId: string): Promise<CommentSentimentSummary> {
    const stats = await this.repository.getSentimentSummary(productId);
    const analyzed = await this.repository.getAnalyzedComments(productId);

    const allPainPoints: string[] = [];
    const allFeatureRequests: string[] = [];
    let totalIntent = 0;

    for (const comment of analyzed) {
      const analysis = (comment as unknown as Record<string, unknown>).analysis as Record<string, unknown> | null;
      if (analysis) {
        const painPoints = (analysis.painPoints as string[]) || [];
        const featureRequests = (analysis.featureRequests as string[]) || [];
        allPainPoints.push(...painPoints);
        allFeatureRequests.push(...featureRequests);
        totalIntent += (analysis.purchasingIntent as number) || 0;
      }
    }

    const total = stats.total || 1;
    return {
      total: stats.total || 0,
      positive_count: stats.positive_count || 0,
      neutral_count: stats.neutral_count || 0,
      negative_count: stats.negative_count || 0,
      positive_ratio: (stats.positive_count || 0) / total,
      negative_ratio: (stats.negative_count || 0) / total,
      top_pain_points: this.topN(allPainPoints, 5),
      top_feature_requests: this.topN(allFeatureRequests, 5),
      average_purchasing_intent: analyzed.length > 0 ? totalIntent / analyzed.length : 0,
    };
  }

  private topN(items: string[], n: number): string[] {
    const freq = new Map<string, number>();
    for (const item of items) {
      freq.set(item, (freq.get(item) || 0) + 1);
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k);
  }

  // ========== 内容优化触发 ==========

  async triggerOptimization(
    dto: OptimizeContentDto,
    onProgress?: (event: { step: string; message: string; progress: number; data?: unknown }) => void,
  ): Promise<OptimizationResponse> {
    this.logger.log(`Triggering optimization for product ${dto.product_id}, trigger: ${dto.trigger}`);

    // Step 1: 加载评论情感分析摘要
    onProgress?.({ step: 'loading_summary', message: 'Step 1/5: 正在从数据库加载评论情感分析摘要...', progress: 5 });
    const summary = await this.buildSentimentSummary(dto.product_id);
    onProgress?.({ step: 'summary_loaded', message: 'Step 1/5 完成：情感摘要已加载', progress: 20, data: {
      total: summary.total,
      positive_ratio: summary.positive_ratio,
      negative_ratio: summary.negative_ratio,
      top_pain_points_count: summary.top_pain_points?.length ?? 0,
      top_feature_requests_count: summary.top_feature_requests?.length ?? 0,
    }});

    // Step 2: 构建优化 Prompt
    onProgress?.({ step: 'building_prompt', message: 'Step 2/5: 正在构建优化提示词...', progress: 25 });

    // Step 3: 调用大模型生成优化建议
    onProgress?.({ step: 'calling_ai', message: 'Step 3/5: 正在调用豆包大模型生成优化建议 (预计 20-60s)...', progress: 30 });
    const { suggestionText, suggestionStructured, source } = await this.generateOptimizationSuggestion(dto.trigger, summary, onProgress);
    onProgress?.({ step: 'suggestions_generated', message: `Step 3/5 完成：优化建议已生成 (来源: ${source})`, progress: 70, data: {
      suggestion_count: suggestionStructured?.suggestions?.length ?? 0,
      source,
    }});

    // Step 4: 持久化优化记录
    onProgress?.({ step: 'saving_record', message: 'Step 4/5: 正在保存优化记录到数据库...', progress: 80 });
    const optimization = await this.repository.createOptimization({
      productId: dto.product_id,
      trigger: dto.trigger,
      currentScriptId: dto.script_id,
      triggerDetail: { summary, trigger: dto.trigger },
      suggestion: suggestionText,
      autoApply: dto.auto_apply || false,
    });

    const optId = (optimization as unknown as Record<string, unknown>).id as string;
    onProgress?.({ step: 'record_saved', message: 'Step 4/5 完成：优化记录已保存', progress: 90, data: { optimization_id: optId } });

    const response: OptimizationResponse = {
      optimization_id: optId,
      status: 'pending',
      suggestion: suggestionText,
      suggestion_structured: suggestionStructured,
    };

    // Step 5: 自动应用（如果开启）
    if (dto.auto_apply) {
      onProgress?.({ step: 'auto_applying', message: 'Step 5/5: 正在自动应用优化建议...', progress: 95 });
      try {
        await this.applyOptimization(optId);
        const updated = await this.repository.findOptimizationById(optId);
        response.status = 'applied';
        response.new_script_id = (updated as unknown as Record<string, unknown>)?.optimizedScriptId as string;
        onProgress?.({ step: 'completed', message: '全部步骤完成：优化已自动应用', progress: 100 });
        return response;
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Auto-apply optimization failed: ${err.message}`);
      }
    }

    onProgress?.({ step: 'completed', message: '全部步骤完成：优化建议已生成并保存', progress: 100 });
    return response;
  }

  private async generateOptimizationSuggestion(
    trigger: string,
    summary: CommentSentimentSummary,
    onProgress?: (event: { step: string; message: string; progress: number; data?: unknown }) => void,
  ): Promise<{ suggestionText: string; suggestionStructured: StructuredOptimization; source: string }> {
    const systemPrompt = `你是 TikTok 短视频带货内容优化专家。根据评论情感分析数据，为带货视频剧本提供具体、可执行的结构化优化方案。

## 你的核心任务
分析用户评论中的情感信号（好评/差评/痛点/功能需求），生成一份结构化的剧本优化方案。

## 输出要求
严格输出以下 JSON 格式（不要包含 markdown 代码块标记）：

{
  "summary": "一句话总结核心发现和优化方向（50字以内）",
  "score": {
    "overall": 0-100 综合评分,
    "clarity": 0-100 信息清晰度,
    "engagement": 0-100 用户参与度,
    "conversion": 0-100 转化驱动力,
    "trust": 0-100 信任度
  },
  "suggestions": [
    {
      "priority": "high|medium|low",
      "shot_index": 1-8 对应分镜编号,
      "shot_label": "分镜名称（如:开场吸引、产品展示、用户证言、对比测评、使用场景、价格锚点、成交引导、结尾互动）",
      "issue": "用户反馈的具体问题",
      "action": "具体、可落地的优化动作（50字以内）",
      "reason": "数据依据（引用分析摘要中的数据）",
      "expected_impact": "预期改善效果（20字以内）"
    }
  ],
  "improved_script_outline": ["优化后的分镜1简述", "优化后的分镜2简述", ...]
}

## 评分规则
- overall: 综合好评率、购买意向、痛点数量综合评定
  - 好评率>70% +5分, 好评率<30% -10分
  - 购买意向>0.7 +3分, <0.3 -5分
  - 无痛点 +5分, 超过3个痛点 -5分
- clarity: 基于功能需求数量（需求越多说明信息越不清晰）
- engagement: 基于好评率（好评高 = 内容引起共鸣）
- conversion: 基于平均购买意向
- trust: 基于差评率（差评率越低信任度越高）

## 注意事项
- 每个 trigger 类型至少生成 3 条 suggestion
- pain_point 触发：重点优化用户痛点相关的分镜
- negative_sentiment 触发：重点修复引发差评的内容环节
- feature_request 触发：重点添加用户需求的功能展示
- improved_script_outline 最多 8 个条目，按分镜顺序排列
- 所有文本使用中文`;

    const painPointsStr = summary.top_pain_points?.length
      ? summary.top_pain_points.join('、')
      : '暂无明确痛点';

    const featureRequestsStr = summary.top_feature_requests?.length
      ? summary.top_feature_requests.join('、')
      : '暂无功能需求';

    const userPrompt = `## 评论分析数据
- 总评论数: ${summary.total}
- 好评率: ${(summary.positive_ratio * 100).toFixed(1)}%（${summary.positive_count}条）
- 差评率: ${(summary.negative_ratio * 100).toFixed(1)}%（${summary.negative_count}条）
- 中性评论: ${summary.neutral_count}条
- Top 痛点: ${painPointsStr}
- Top 功能需求: ${featureRequestsStr}
- 平均购买意向: ${summary.average_purchasing_intent.toFixed(2)}（满分1.0）

## 优化触发类型
${trigger === 'pain_point' ? '用户痛点驱动 —— 评论区集中反映了产品/服务的具体问题，需要针对性优化剧本以打消顾虑'
    : trigger === 'negative_sentiment' ? '差评激增驱动 —— 负面评价比例上升，需要修复剧本中引发不满的内容环节'
    : '功能需求驱动 —— 用户表达了明确的功能改进需求，需要在剧本中展示相关特性'}

请基于以上数据生成结构化优化方案，直接输出 JSON：`;

    let rawResponse: string;
    let source = 'doubao';
    try {
      onProgress?.({ step: 'ai_request_sent', message: 'Step 3/5: AI 请求已发送，等待豆包大模型响应...', progress: 35 });
      rawResponse = await this.doubaoProvider.generateText(systemPrompt, userPrompt, undefined, {
        timeoutMs: 120_000,
        maxRetries: 1,
      });
      onProgress?.({ step: 'ai_response_received', message: 'Step 3/5: AI 响应已接收，正在解析结构化数据...', progress: 60 });
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.logger.error(`豆包优化建议生成失败: ${err}`);
      throw serviceException(
        {
          message: `AI 优化建议服务异常，请稍后重试: ${err}`,
          error: { code: 'AI_OPTIMIZATION_FAILED', retryable: true },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const cleaned = rawResponse
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const parsed = JSON.parse(cleaned) as StructuredOptimization;
      return {
        suggestionText: this.structuredToText(parsed),
        suggestionStructured: parsed,
        source,
      };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.logger.error(`豆包优化建议解析失败: ${err}`);
      throw serviceException(
        {
          message: `AI 优化建议解析失败，请稍后重试: ${err}`,
          error: { code: 'AI_OPTIMIZATION_PARSE_FAILED', retryable: true },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** 将结构化建议转为纯文本（用于列表展示） */
  private structuredToText(structured: StructuredOptimization): string {
    const lines: string[] = [];
    lines.push(`📊 ${structured.summary}`);
    lines.push('');
    for (const s of structured.suggestions) {
      const priorityIcon = s.priority === 'high' ? '🔴' : s.priority === 'medium' ? '🟡' : '🟢';
      lines.push(`${priorityIcon} 分镜${s.shot_index}（${s.shot_label}）：${s.action}`);
    }
    return lines.join('\n');
  }

  async applyOptimization(optimizationId: string): Promise<OptimizationResponse> {
    const optimization = await this.repository.findOptimizationById(optimizationId);
    if (!optimization) {
      throw serviceException(
        { message: '优化记录不存在', error: { code: 'OPTIMIZATION_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    const record = optimization as unknown as Record<string, unknown>;
    if (record.status === 'applied') {
      return {
        optimization_id: optimizationId,
        status: 'applied',
        suggestion: record.suggestion as string,
        new_script_id: record.optimizedScriptId as string,
      };
    }

    // 标记为 applied（实际剧本重生成由 ScriptService 完成，这里是记录状态变更）
    await this.repository.updateOptimizationStatus(optimizationId, {
      status: 'applied',
      appliedAt: new Date(),
      appliedBy: 'auto',
    });

    // 写入效果指标占位（后续由 Analytics 模块填充真实数据）
    await this.repository.updateOptimizationStatus(optimizationId, {
      status: 'applied',
      effectMetrics: {
        note: '实际效果指标由 Analytics 模块在剧本重生成后回填',
      },
    });

    return {
      optimization_id: optimizationId,
      status: 'applied',
      suggestion: record.suggestion as string,
      new_script_id: record.optimizedScriptId as string,
    };
  }

  async rollbackOptimization(optimizationId: string): Promise<OptimizationResponse> {
    const optimization = await this.repository.findOptimizationById(optimizationId);
    if (!optimization) {
      throw serviceException(
        { message: '优化记录不存在', error: { code: 'OPTIMIZATION_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.repository.updateOptimizationStatus(optimizationId, {
      status: 'rolled_back',
      appliedAt: new Date(),
      appliedBy: 'auto',
    });

    return {
      optimization_id: optimizationId,
      status: 'rolled_back',
      suggestion: (optimization as unknown as Record<string, unknown>).suggestion as string,
    };
  }

  // ========== 查询接口 ==========

  async listComments(query: CommentListQuery): Promise<{ items: CommentResponse[]; next_cursor?: string }> {
    const results = await this.repository.findComments({
      productId: query.product_id,
      sentiment: query.sentiment,
      cursor: query.cursor,
      limit: query.limit || 20,
    });

    const items: CommentResponse[] = (results as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      product_id: r.productId as string,
      platform: r.platform as string,
      video_url: r.videoUrl as string | undefined,
      author_name: r.authorName as string | undefined,
      content: r.content as string,
      like_count: r.likeCount as number,
      commented_at: r.commentedAt ? (r.commentedAt as Date).toISOString() : undefined,
      analysis: (r as any).analysis ? {
        sentiment: (r as any).analysis.sentiment,
        key_topics: (r as any).analysis.keyTopics || [],
        pain_points: (r as any).analysis.painPoints || [],
        feature_requests: (r as any).analysis.featureRequests || [],
        purchasing_intent: (r as any).analysis.purchasingIntent || 0,
        confidence: (r as any).analysis.confidence || 0,
        analyzed_at: (r as any).analysis.analyzedAt?.toISOString(),
      } : undefined,
      created_at: (r.createdAt as Date).toISOString(),
    }));

    return { items };
  }

  async getAnalysisSummary(productId: string): Promise<CommentSentimentSummary> {
    return this.buildSentimentSummary(productId);
  }

  async listOptimizations(productId: string): Promise<OptimizationRecordResponse[]> {
    const results = await this.repository.findOptimizations(productId);
    return (results as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      product_id: r.productId as string,
      trigger: r.trigger as string,
      suggestion: r.suggestion as string,
      auto_apply: r.autoApply as boolean,
      status: r.status as string,
      current_script_id: r.currentScriptId as string | undefined,
      optimized_script_id: r.optimizedScriptId as string | undefined,
      applied_at: r.appliedAt ? (r.appliedAt as Date).toISOString() : undefined,
      effect_metrics: r.effectMetrics as Record<string, unknown> | undefined,
      created_at: (r.createdAt as Date).toISOString(),
    }));
  }

  // ========== 辅助方法 ==========

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
