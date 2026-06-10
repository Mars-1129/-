// =============================================================================
// TikStream AI — Trend Engine Service (Orchestrator)
//
// 集成四大算法模块的编排引擎：
//   1. TrendScoringService       — 多维度热度评分
//   2. ProductMatchingService    — 商品-趋势语义匹配
//   3. TrendVelocityService      — 速度/加速度/生命周期
//   4. OpportunityRankingService — 综合机会评分 + 行动建议
//
// 输入: 原始趋势数据 + 商品信息 + 历史快照
// 输出: 结构化的趋势分析报告
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import {
  TrendScoringService,
  ProductMatchingService,
  TrendVelocityService,
  OpportunityRankingService,
} from './algorithms';
import type {
  TrendDataPoint,
  ProductInfo,
  TrendHistoryPoint,
  OpportunityResult,
  TrendHeatResult,
  ProductMatchResult,
  TrendVelocityResult,
} from './algorithms';

/** 趋势引擎完整分析报告 */
export interface TrendEngineReport {
  /** 趋势列表（按热度降序） */
  trends: TrendHeatResult[];
  /** 匹配结果（按匹配度降序） */
  matches: ProductMatchResult[];
  /** 速度分析 */
  velocities: TrendVelocityResult[];
  /** 机会排名（按机会分降序） */
  opportunities: OpportunityResult[];
  /** 分析元信息 */
  meta: {
    /** 输入趋势数量 */
    inputTrends: number;
    /** 历史数据点数 */
    historyPoints: number;
    /** 算法生成时间 */
    generatedAt: string;
    /** 数据来源 */
    dataSource: 'ALGORITHM_ONLY' | 'ALGORITHM_ENRICHED';
    /** 使用的算法版本 */
    engineVersion: string;
  };
}

@Injectable()
export class TrendEngineService {
  private readonly logger = new Logger(TrendEngineService.name);
  private readonly ENGINE_VERSION = '2.0.0';

  constructor(
    private readonly scoringService: TrendScoringService,
    private readonly matchingService: ProductMatchingService,
    private readonly velocityService: TrendVelocityService,
    private readonly opportunityService: OpportunityRankingService,
  ) {}

  /**
   * 执行完整的趋势分析流水线
   *
   * @param trendDataPoints 当前趋势数据点
   * @param productInfo 目标商品信息
   * @param historyPoints 趋势历史快照（用于速度计算）
   * @returns 完整分析报告
   */
  analyze(
    trendDataPoints: TrendDataPoint[],
    productInfo: ProductInfo,
    historyPoints: TrendHistoryPoint[] = [],
  ): TrendEngineReport {
    const startedAt = Date.now();

    this.logger.log(
      `[TrendEngine] Starting analysis: ${trendDataPoints.length} trends, ` +
        `${historyPoints.length} history points, product=${productInfo.name}`,
    );

    // Phase 1: Heat Scoring (独立于其他阶段，可并行)
    const trends = this.scoringService.scoreTrends(trendDataPoints);

    // Phase 2: Product Matching (独立于其他阶段)
    const matches = this.matchingService.matchTrendsToProduct(trendDataPoints, productInfo);

    // Phase 3: Velocity & Lifecycle Analysis
    // 为每个趋势计算速度（基于历史数据）
    const velocities = this.analyzeVelocities(trends, historyPoints);

    // Phase 4: Opportunity Ranking (依赖前三阶段结果)
    const opportunities = this.opportunityService.rankOpportunities(
      trends,
      matches,
      velocities,
    );

    const elapsed = Date.now() - startedAt;
    this.logger.log(
      `[TrendEngine] Analysis complete in ${elapsed}ms: ` +
        `${opportunities.length} actionable opportunities found`,
    );

    return {
      trends,
      matches,
      velocities,
      opportunities,
      meta: {
        inputTrends: trendDataPoints.length,
        historyPoints: historyPoints.length,
        generatedAt: new Date().toISOString(),
        dataSource: historyPoints.length > 0 ? 'ALGORITHM_ENRICHED' : 'ALGORITHM_ONLY',
        engineVersion: this.ENGINE_VERSION,
      },
    };
  }

  /**
   * 快速评分：仅执行热度 + 匹配，跳过历史分析
   * 适用于无历史数据的快速评估场景
   */
  quickScore(
    trendDataPoints: TrendDataPoint[],
    productInfo: ProductInfo,
  ): { trends: TrendHeatResult[]; matches: ProductMatchResult[] } {
    return {
      trends: this.scoringService.scoreTrends(trendDataPoints),
      matches: this.matchingService.matchTrendsToProduct(trendDataPoints, productInfo),
    };
  }

  /**
   * 趋势发现：评估哪些品类最适合当前趋势
   * 用于新品类的趋势机会发现
   */
  discoverTrendCategories(
    trendDataPoints: TrendDataPoint[],
  ): Array<{
    trend: TrendHeatResult;
    bestCategories: Array<{ category: string; affinity: number }>;
  }> {
    const heatResults = this.scoringService.scoreTrends(trendDataPoints);

    return heatResults.map((h) => {
      const originalTrend = trendDataPoints.find((t) => t.name === h.name);
      const bestCategories = this.matchingService.findBestProductCategories(
        originalTrend?.categories || [],
      );
      return { trend: h, bestCategories: bestCategories.slice(0, 5) };
    });
  }

  /**
   * 趋势预警：识别即将爆发的趋势（emerging + high velocity）
   */
  detectEmergingTrends(
    trendDataPoints: TrendDataPoint[],
    historyPoints: TrendHistoryPoint[],
  ): Array<{ trend: TrendHeatResult; velocity: TrendVelocityResult }> {
    const heatResults = this.scoringService.scoreTrends(trendDataPoints);

    return heatResults
      .map((h) => {
        const relatedHistory = historyPoints.filter((hp) => hp.name === h.name);
        const velocity = this.velocityService.analyze(
          h.name,
          h.type,
          relatedHistory,
          h.heatScore,
        );
        return { trend: h, velocity };
      })
      .filter(
        ({ velocity }) =>
          velocity.lifecycleStage === 'emerging' || velocity.lifecycleStage === 'rising',
      )
      .sort((a, b) => b.velocity.velocity - a.velocity.velocity)
      .slice(0, 10);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private analyzeVelocities(
    heatResults: TrendHeatResult[],
    historyPoints: TrendHistoryPoint[],
  ): TrendVelocityResult[] {
    return heatResults.map((h) => {
      const relatedHistory = historyPoints
        .filter((hp) => hp.name === h.name)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return this.velocityService.analyze(h.name, h.type, relatedHistory, h.heatScore);
    });
  }
}
