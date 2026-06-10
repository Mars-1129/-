// =============================================================================
// TikStream AI — Trend Tracker Service
//
// 趋势获取策略（双路径）：
//   1. LLM 路径：通过 Doubao 大模型生成趋势（优先）
//   2. 算法引擎路径：基于 TrendEngine + MockData 的纯算法分析（降级）
//
// 算法引擎提供：
//   - 多维度热度评分（体量/速度/互动/时效/创作者）
//   - 品类亲和度 + TF-IDF 关键词匹配 + 受众重叠度
//   - 速度/加速度/生命周期阶段分析
//   - 综合机会评分 + 行动建议
// =============================================================================

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { TrendTrackerRepository } from './trend-tracker.repository';
import { TrendTrackerPromptBuilder } from './trend-tracker.prompt-builder';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { ViralAnalysisRepository } from '../viral-analysis/viral-analysis.repository';
import { TrendEngineService } from './trend-engine.service';
import { TrendMockDataService } from './trend-mock-data.service';
import type { ProductInfo } from './algorithms';
import { TREND_TRACKER_CONSTANTS } from './trend-tracker.constants';
import { serviceException } from '../common/service-exception';
import {
  ErrorCode,
  TrendTrackerResponse,
  TrendItem,
  TrendRecommendation,
} from '@tikstream/shared-types';

interface LLMTrendOutput {
  trends: TrendItem[];
  recommendations: Array<{
    trend: TrendItem;
    product_match_score: number;
    adaptation_tips: string[];
    potential_reach: number;
  }>;
}

@Injectable()
export class TrendTrackerService {
  private readonly logger = new Logger(TrendTrackerService.name);

  constructor(
    private readonly repository: TrendTrackerRepository,
    private readonly promptBuilder: TrendTrackerPromptBuilder,
    private readonly doubaoText: DoubaoTextProvider,
    private readonly viralAnalysisRepository: ViralAnalysisRepository,
    private readonly trendEngine: TrendEngineService,
    private readonly mockDataService: TrendMockDataService,
  ) {}

  // =========================================================================
  // Public: Get Trends
  // =========================================================================

  /**
   * 获取商品的最新趋势快照。
   * 缓存策略：1 小时内复用已有快照，过期则自动刷新。
   */
  async getTrends(
    productId: string,
    productName?: string,
    productCategory?: string,
    sellingPoints: string[] = [],
  ): Promise<TrendTrackerResponse> {
    // 首先尝试读取有效缓存
    const cached = await this.repository.findLatestValidSnapshot(productId);
    if (cached) {
      this.logger.log(`Cache hit for product_id=${productId}, snapshot=${cached.id}`);
      return this.mapSnapshotToResponse(cached);
    }

    this.logger.log(`Cache miss for product_id=${productId}, generating new snapshot`);
    return this.refreshTrends(productId, productName, productCategory, sellingPoints);
  }

  /**
   * 强制刷新趋势快照（忽略缓存）
   */
  async refreshTrends(
    productId: string,
    productName?: string,
    productCategory?: string,
    sellingPoints: string[] = [],
  ): Promise<TrendTrackerResponse> {
    try {
      // 构建 KOL 上下文（基于已有 ViralAnalysis 数据聚合）
      const kolContext = await this.withTimeout(
        this.buildKOLContext(productId, productCategory),
        TREND_TRACKER_CONSTANTS.LLM_TIMEOUT_MS,
        'KOL context building',
      );

      const promptResult = this.promptBuilder.build({
        product_name: productName || '通用商品',
        product_category: productCategory,
        selling_points: sellingPoints,
        kolContext,
      });

      const llmRaw = await this.withTimeout(
        this.doubaoText.generateText(
          promptResult.systemPrompt,
          promptResult.userPrompt,
        ),
        TREND_TRACKER_CONSTANTS.LLM_TIMEOUT_MS,
        'Doubao text generation',
      );

      const output = this.parseLlmOutput(llmRaw);
      const filtered = this.filterAndSortOutput(output);

      const dataSource = kolContext ? 'KOL_BACKED' : 'LLM_INFERRED' as const;

      const snapshot = await this.repository.createSnapshot({
        productId,
        trendsJson: filtered.trends as unknown as Record<string, unknown>,
        recommendationsJson: filtered.recommendations as unknown as Record<string, unknown>,
        ttlSeconds: TREND_TRACKER_CONSTANTS.DEFAULT_TTL_SECONDS,
      });

      this.logger.log(
        `Trend snapshot created: id=${snapshot.id}, trends=${filtered.trends.length}, recommendations=${filtered.recommendations.length}, data_source=${dataSource}`,
      );

      return this.mapSnapshotToResponse(snapshot, dataSource);
    } catch (error) {
      this.logger.warn(`LLM trend generation failed, falling back to algorithm engine: ${error instanceof Error ? error.message : String(error)}`);
      return this.generateWithAlgorithmEngine(
        productId,
        productName || '通用商品',
        productCategory || 'lifestyle',
        sellingPoints,
      );
    }
  }

  // =========================================================================
  // Private: Algorithm Engine Fallback
  // =========================================================================

  /**
   * 基于算法引擎 + Mock 数据生成趋势分析
   *
   * 流水线：
   *   1. 从 MockDataService 获取品类相关趋势数据点
   *   2. 生成历史快照（用于速度/加速度计算）
   *   3. 构建 ProductInfo
   *   4. 通过 TrendEngineService.analyze() 执行四阶段分析
   *   5. 将 TrendEngineReport 映射为 TrendTrackerResponse
   *   6. 存储快照到数据库
   */
  private async generateWithAlgorithmEngine(
    productId: string,
    productName: string,
    productCategory: string,
    sellingPoints: string[],
  ): Promise<TrendTrackerResponse> {
    this.logger.log(`[AlgorithmEngine] Generating trend analysis for product=${productName}, category=${productCategory}`);

    // 1. 获取 Mock 趋势数据
    const trendDataPoints = this.mockDataService.getTrendsForCategory(productCategory, 15);

    // 2. 生成历史快照（最近14天）
    const trendNames = trendDataPoints.map((t) => t.name);
    const historyPoints = this.mockDataService.generateHistoryBulk(trendNames, 14);

    // 3. 构建商品信息
    const productInfo: ProductInfo = {
      productId,
      name: productName,
      category: productCategory,
      sellingPoints: sellingPoints.length > 0 ? sellingPoints : this.getDefaultSellingPoints(productCategory),
      targetAudience: this.getDefaultAudience(productCategory),
      audienceTags: this.getDefaultAudienceTags(productCategory),
      scenarioTags: this.getDefaultScenarioTags(productCategory),
    };

    // 4. 执行算法分析流水线
    const report = this.trendEngine.analyze(trendDataPoints, productInfo, historyPoints);

    // 5. 映射为 API 响应格式
    const trends: TrendItem[] = report.trends.map((t) => ({
      type: t.type as TrendItem['type'],
      name: t.name,
      url: t.url || '',
      popularity_score: Math.round(t.heatScore),
      growth_rate: this.mapVelocityToGrowthRate(
        report.velocities.find((v) => v.trendName === t.name),
      ),
      expiration_days: Math.max(
        1,
        report.velocities.find((v) => v.trendName === t.name)?.remainingDays || 7,
      ),
    }));

    const recommendations: TrendRecommendation[] = report.opportunities.map((o) => {
      const matchedTrend = trends.find((t) => t.name === o.trendName);
      return {
        trend: matchedTrend || {
          type: o.trendType as TrendItem['type'],
          name: o.trendName,
          url: o.url || '',
          popularity_score: Math.round(o.heatScore),
          growth_rate: this.mapStageToGrowthRate(o.lifecycleStage),
          expiration_days: Math.max(1, Math.round(o.timingScore / 10)),
        },
        product_match_score: Math.round(o.matchScore),
        adaptation_tips: o.adaptationTips.slice(0, TREND_TRACKER_CONSTANTS.MAX_ADAPTATION_TIPS),
        potential_reach: o.potentialReach,
      };
    });

    const result: LLMTrendOutput = { trends, recommendations };
    const filtered = this.filterAndSortOutput(result);

    // 6. 尝试存储快照（持久化失败不阻塞数据返回——降级场景下数据仍可用）
    let snapshotId = productId;
    const expiresAt = new Date(Date.now() + TREND_TRACKER_CONSTANTS.DEFAULT_TTL_SECONDS * 1000);
    const createdAt = new Date();

    try {
      const snapshot = await this.repository.createSnapshot({
        productId,
        trendsJson: filtered.trends as unknown as Record<string, unknown>,
        recommendationsJson: filtered.recommendations as unknown as Record<string, unknown>,
        ttlSeconds: TREND_TRACKER_CONSTANTS.DEFAULT_TTL_SECONDS,
      });

      snapshotId = snapshot.id;

      this.logger.log(
        `[AlgorithmEngine] Snapshot created: id=${snapshot.id}, trends=${filtered.trends.length}, ` +
          `recommendations=${filtered.recommendations.length}, data_source=ALGORITHM_ONLY, engine=${report.meta.engineVersion}`,
      );
    } catch (persistError) {
      this.logger.warn(
        `[AlgorithmEngine] Snapshot persist failed (non-fatal), returning generated data in-memory: ` +
          `${persistError instanceof Error ? persistError.message : String(persistError)}`,
      );
    }

    return {
      snapshot_id: snapshotId,
      product_id: productId,
      trends: filtered.trends,
      recommendations: filtered.recommendations,
      data_source: 'LLM_INFERRED' as const,
      generated_by: `ALGORITHM_ENGINE_v${report.meta.engineVersion}`,
      expires_at: expiresAt.toISOString(),
      created_at: createdAt.toISOString(),
    };
  }

  // =========================================================================
  // Private: Default Product Info (when not provided by controller)
  // =========================================================================

  private getDefaultSellingPoints(category: string): string[] {
    const defaults: Record<string, string[]> = {
      beauty: ['补水保湿', '成分温和', '性价比高', '包装精致'],
      fitness: ['数据精准', '续航持久', '佩戴舒适', '功能全面'],
      food: ['味道超赞', '配料干净', '包装严实', '性价比高'],
      tech: ['降噪效果好', '音质出色', '连接稳定', '续航长'],
      home: ['颜值高', '静音', '氛围灯', '做工精细'],
      pet: ['猫咪喜欢', '自动清洁', '噪音低', '除臭效果好'],
    };
    return defaults[category] || ['品质好', '服务好', '价格优'];
  }

  private getDefaultAudience(category: string): string {
    const defaults: Record<string, string> = {
      beauty: '18-35岁女性',
      fitness: '20-40岁健身爱好者',
      food: '18-45岁美食爱好者',
      tech: '18-40岁数码爱好者',
      home: '20-40岁家居爱好者',
      pet: '20-45岁养宠人群',
    };
    return defaults[category] || '全年龄段消费者';
  }

  private getDefaultAudienceTags(category: string): string[] {
    const defaults: Record<string, string[]> = {
      beauty: ['18-35女性', '护肤爱好者', '学生党', '上班族'],
      fitness: ['健身爱好者', '减脂人群', '运动达人', '自律党'],
      food: ['美食爱好者', '吃货', '学生党', '上班族'],
      tech: ['数码爱好者', '学生', '通勤族', '极客'],
      home: ['租房党', '独居', '新家装修', '收纳达人'],
      pet: ['猫奴', '狗主', '科学养宠', '上班族铲屎官'],
    };
    return defaults[category] || ['Z世代', '网购族'];
  }

  private getDefaultScenarioTags(category: string): string[] {
    const defaults: Record<string, string[]> = {
      beauty: ['daily', 'skincare', 'makeup'],
      fitness: ['workout', 'daily', 'outdoor'],
      food: ['daily', 'party', 'home'],
      tech: ['daily', 'work', 'commute'],
      home: ['daily', 'relax', 'decorate'],
      pet: ['daily', 'home', 'indoor'],
    };
    return defaults[category] || ['daily'];
  }

  // =========================================================================
  // Private: Timeout Helper
  // =========================================================================

  /**
   * 为异步操作添加超时保护。
   * 超时后抛出明确的 TimeoutError，由上游 try/catch 统一回退算法引擎。
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`[${label}] timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  // =========================================================================
  // Private: Mapping Helpers
  // =========================================================================

  private mapVelocityToGrowthRate(velocity?: { velocity: number }): number {
    if (!velocity) return 0;
    return this.clamp(velocity.velocity / 50, -1, 1);
  }

  private mapStageToGrowthRate(stage: string): number {
    const rates: Record<string, number> = {
      emerging: 0.5,
      rising: 0.3,
      peak: 0.0,
      declining: -0.3,
      dying: -0.7,
    };
    return rates[stage] ?? 0;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  // =========================================================================
  // Private: KOL Context Builder
  // =========================================================================

  /**
   * 聚合已有 ViralAnalysis 数据作为 KOL 上下文，提升 LLM 趋势推断的准确性。
   *
   * 数据来源：
   *   1. 同品类 ViralAnalysis 中的 trending_hashtags / trending_sounds
   *   2. 该 Product 下高互动的 ViralAnalysis 统计
   *
   * 返回 null 表示无可用的 KOL 数据，此时 LLM 将基于训练知识推断趋势。
   */
  private async buildKOLContext(
    productId: string,
    productCategory?: string,
  ): Promise<string | null> {
    try {
      // 1. 获取该 Product 的最优 ViralAnalysis
      const productAnalysis = await this.viralAnalysisRepository.findBestViralAnalysisByProduct(productId);

      // 2. 聚合同品类 ViralAnalysis（最多 5 条）
      let categoryAnalyses: Array<Record<string, unknown>> = [];
      if (productCategory) {
        try {
          const result = await (this.viralAnalysisRepository as unknown as {
            findViralAnalyses: (params: { category?: string; pageSize?: number }) => Promise<Array<Record<string, unknown>>>;
          }).findViralAnalyses?.({ category: productCategory, pageSize: 5 });
          if (result) categoryAnalyses = result;
        } catch {
          // 品类查询降级
        }
      }

      const hasData = productAnalysis || categoryAnalyses.length > 0;
      if (!hasData) {
        this.logger.log(`[KOL] No ViralAnalysis data available for product=${productId}, using LLM inference`);
        return null;
      }

      // 构建结构化 KOL 上下文
      const parts: string[] = [];

      if (productAnalysis) {
        const v = productAnalysis as Record<string, unknown>;
        const strategy = v.strategyJson as Record<string, unknown> | undefined;
        parts.push(`【商品已有爆款分析】`);
        if (v.id) parts.push(`- 分析ID: ${v.id}`);
        if (strategy?.hook_type) parts.push(`- 钩子类型: ${strategy.hook_type}`);
        if (typeof strategy?.hook_strength === 'number') {
          parts.push(`- 钩子强度: ${strategy.hook_strength}`);
        }
        if (typeof strategy?.quality_score === 'number') {
          parts.push(`- 质量分: ${strategy.quality_score}`);
        }
        if (Array.isArray(strategy?.trending_hashtags)) {
          const tags = (strategy.trending_hashtags as string[]).slice(0, 5);
          if (tags.length > 0) parts.push(`- 关联热门标签: ${tags.join(', ')}`);
        }
        if (Array.isArray(strategy?.trending_sounds)) {
          const sounds = (strategy.trending_sounds as string[]).slice(0, 3);
          if (sounds.length > 0) parts.push(`- 关联热门音效: ${sounds.join(', ')}`);
        }
      }

      if (categoryAnalyses.length > 0) {
        parts.push(`\n【同品类(${productCategory || '未知'})其他爆款参考】`);
        for (let i = 0; i < Math.min(categoryAnalyses.length, 5); i++) {
          const ca = categoryAnalyses[i];
          const strategy = ca.strategyJson as Record<string, unknown> | undefined;
          if (strategy?.hook_type) {
            parts.push(`  ${i + 1}. 钩子类型="${strategy.hook_type}", 强度=${typeof strategy.hook_strength === 'number' ? strategy.hook_strength : '?'}`);
          }
        }
      }

      return parts.join('\n');
    } catch (err) {
      this.logger.warn(`[KOL] Context building failed, falling back to LLM inference: ${(err as Error).message}`);
      return null;
    }
  }

  // =========================================================================
  // Private: LLM Output Parsing
  // =========================================================================

  /**
   * 解析 LLM 返回的 JSON，兜底返回空趋势列表
   */
  private parseLlmOutput(raw: string): LLMTrendOutput {
    try {
      // 移除可能的 markdown 代码块包裹
      let json = raw.trim();
      if (json.startsWith('```')) {
        const firstNewline = json.indexOf('\n');
        json = json.slice(firstNewline + 1);
        const lastBacktick = json.lastIndexOf('```');
        if (lastBacktick > -1) json = json.slice(0, lastBacktick);
        json = json.trim();
      }

      const parsed = JSON.parse(json) as LLMTrendOutput;

      if (!parsed.trends || !Array.isArray(parsed.trends)) {
        this.logger.warn('LLM output missing trends array, using empty list');
        parsed.trends = [];
      }
      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        this.logger.warn('LLM output missing recommendations array, using empty list');
        parsed.recommendations = [];
      }

      return parsed;
    } catch {
      this.logger.warn('Failed to parse LLM output as JSON, returning empty trends');
      return { trends: [], recommendations: [] };
    }
  }

  /**
   * 过滤和排序：
   * - 趋势按 popularity_score 降序
   * - 推荐按 product_match_score 降序，过滤低分匹配
   * - 数量上限控制
   */
  private filterAndSortOutput(output: LLMTrendOutput): LLMTrendOutput {
    const trends = output.trends
      .filter(
        (t) =>
          t.type &&
          t.name &&
          typeof t.popularity_score === 'number' &&
          !Number.isNaN(t.popularity_score),
      )
      .sort((a, b) => b.popularity_score - a.popularity_score)
      .slice(0, TREND_TRACKER_CONSTANTS.MAX_TRENDS);

    const recommendations = output.recommendations
      .filter(
        (r) =>
          r.trend &&
          r.trend.name &&
          typeof r.product_match_score === 'number' &&
          r.product_match_score >= TREND_TRACKER_CONSTANTS.MIN_MATCH_SCORE,
      )
      .sort((a, b) => b.product_match_score - a.product_match_score)
      .slice(0, TREND_TRACKER_CONSTANTS.MAX_RECOMMENDATIONS)
      .map((r) => ({
        ...r,
        adaptation_tips: (r.adaptation_tips || []).slice(
          0,
          TREND_TRACKER_CONSTANTS.MAX_ADAPTATION_TIPS,
        ),
      }));

    return { trends, recommendations };
  }

  // =========================================================================
  // Private: Mapping
  // =========================================================================

  private mapSnapshotToResponse(
    snapshot: { id: string; productId: string; trendsJson: unknown; recommendationsJson: unknown; generatedBy: string; expiresAt: Date; createdAt: Date },
    dataSource: TrendTrackerResponse['data_source'] = 'LLM_INFERRED',
  ): TrendTrackerResponse {
    const trends = (snapshot.trendsJson as unknown as TrendItem[]) || [];
    const recommendations =
      (snapshot.recommendationsJson as unknown as TrendRecommendation[]) || [];

    return {
      snapshot_id: snapshot.id,
      product_id: snapshot.productId,
      trends,
      recommendations,
      data_source: dataSource,
      generated_by: snapshot.generatedBy,
      expires_at: snapshot.expiresAt.toISOString(),
      created_at: snapshot.createdAt.toISOString(),
    };
  }
}
