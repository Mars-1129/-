// =============================================================================
// TikStream AI — Trend Heat Scoring Algorithm
//
// 多维度加权评分模型，综合考虑：
//   1. 体量 (Volume)     - 提及量对数归一化
//   2. 速度 (Velocity)   - 7日复合增长率
//   3. 互动 (Engagement) - 加权互动率（点赞:分享:评论 = 1:2:3）
//   4. 时效 (Recency)    - 指数衰减
//   5. 创作者 (Creator)  - 创作者采用率
// =============================================================================

import { Injectable } from '@nestjs/common';
import type { TrendDataPoint, TrendHeatResult, AlgorithmWeights } from './types';
import { DEFAULT_WEIGHTS } from './types';

@Injectable()
export class TrendScoringService {
  private readonly weights = DEFAULT_WEIGHTS.heat;

  /**
   * 计算单个趋势的热度评分
   */
  scoreTrend(dataPoint: TrendDataPoint, weights?: Partial<AlgorithmWeights['heat']>): TrendHeatResult {
    const w = { ...this.weights, ...weights };

    const volumeScore = this.calculateVolumeScore(dataPoint.mentionCount7d);
    const velocityScore = this.calculateVelocityScore(
      dataPoint.mentionCount24h,
      dataPoint.mentionCount7d,
    );
    const engagementScore = this.calculateEngagementScore(
      dataPoint.likeCount,
      dataPoint.shareCount,
      dataPoint.commentCount,
      dataPoint.videoCount,
    );
    const recencyScore = this.calculateRecencyScore(dataPoint.timestamp);
    const creatorScore = this.calculateCreatorScore(dataPoint.creatorAdoptionRate);

    // 加权综合分数
    const heatScore = this.clamp(
      w.volume * volumeScore +
        w.velocity * velocityScore +
        w.engagement * engagementScore +
        w.recency * recencyScore +
        w.creator * creatorScore,
      0,
      100,
    );

    return {
      name: dataPoint.name,
      type: dataPoint.type,
      url: dataPoint.url,
      heatScore: Math.round(heatScore * 100) / 100,
      volumeScore: Math.round(volumeScore * 100) / 100,
      velocityScore: Math.round(velocityScore * 100) / 100,
      engagementScore: Math.round(engagementScore * 100) / 100,
      recencyScore: Math.round(recencyScore * 100) / 100,
      creatorScore: Math.round(creatorScore * 100) / 100,
    };
  }

  /**
   * 批量计算多个趋势的热度评分并排序
   */
  scoreTrends(dataPoints: TrendDataPoint[]): TrendHeatResult[] {
    return dataPoints
      .map((dp) => this.scoreTrend(dp))
      .sort((a, b) => b.heatScore - a.heatScore);
  }

  // =========================================================================
  // Sub-score Calculators
  // =========================================================================

  /**
   * 体量评分：对数归一化，避免头部趋势垄断
   *
   * 公式: 100 * log10(1 + mentions) / log10(1 + MAX_MENTIONS)
   * 参照值: 1M 提及 ≈ 100分, 100K ≈ 83分, 10K ≈ 67分, 1K ≈ 50分, 100 ≈ 33分
   */
  private calculateVolumeScore(mentions: number): number {
    const MAX_MENTIONS = 1_000_000; // 百万级为满分基准
    if (mentions <= 0) return 0;
    const normalized = Math.log10(1 + mentions) / Math.log10(1 + MAX_MENTIONS);
    return this.clamp(normalized * 100, 0, 100);
  }

  /**
   * 速度评分：基于 7日 vs 24h 的日化增长率
   *
   * 公式: 100 * tanh(10 * growth_rate)
   * - 日化增长率 > 10%: 高分（爆发中）
   * - 日化增长率 ≈ 0%: 中等（平稳）
   * - 日化增长率 < 0%: 低分（衰退）
   */
  private calculateVelocityScore(mentions24h: number, mentions7d: number): number {
    if (mentions7d <= 0) return 0;

    // 估算日化增长率 (CAGR)
    // daily_avg_7d = mentions7d / 7
    // growth_rate = (mentions24h - daily_avg_7d) / daily_avg_7d
    const dailyAvg = mentions7d / 7;
    if (dailyAvg <= 0) return mentions24h > 0 ? 80 : 0;

    const growthRate = (mentions24h - dailyAvg) / dailyAvg;

    // 使用 tanh 非线性映射，增长率 10% → ~76分, 50% → ~100分
    const score = 50 + 50 * Math.tanh(10 * growthRate);
    return this.clamp(score, 0, 100);
  }

  /**
   * 互动评分：加权互动率
   *
   * 公式: 100 * (加权互动 / 视频数) / MAX_ENGAGEMENT_RATE
   * 权重: 点赞:分享:评论 = 1:2:3
   * MAX_ENGAGEMENT_RATE = 5000 (高于此值满分)
   */
  private calculateEngagementScore(
    likes: number,
    shares: number,
    comments: number,
    videos: number,
  ): number {
    if (videos <= 0) return 0;

    // 加权互动值（评论权重最高，分享次之）
    const weighted = likes * 1 + shares * 2 + comments * 3;
    const engagementRate = weighted / videos;

    // 对数归一化
    const MAX_RATE = 5000;
    const normalized = Math.log10(1 + engagementRate) / Math.log10(1 + MAX_RATE);
    return this.clamp(normalized * 100, 0, 100);
  }

  /**
   * 时效评分：指数衰减模型
   *
   * 公式: 100 * exp(-age_days / HALF_LIFE)
   * 半衰期 = 7天（7天后分数降至50%）
   */
  private calculateRecencyScore(timestamp: Date): number {
    const now = Date.now();
    const ageMs = now - timestamp.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    if (ageDays < 0) return 100; // 未来数据视作最新
    if (ageDays > 30) return 0;  // 超过30天失效

    const HALF_LIFE = 7; // 7天半衰期
    const score = 100 * Math.exp((-Math.LN2 * ageDays) / HALF_LIFE);
    return this.clamp(score, 0, 100);
  }

  /**
   * 创作者评分：创作者采用率映射
   *
   * 公式: 100 * adoption_rate^0.5
   * 平方根变换，使低采用率也有一定分数
   */
  private calculateCreatorScore(adoptionRate: number): number {
    const rate = this.clamp(adoptionRate, 0, 1);
    // 平方根变换 + 线性缩放
    return 100 * Math.sqrt(rate);
  }

  // =========================================================================
  // Utility
  // =========================================================================

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
