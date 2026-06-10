// =============================================================================
// TikStream AI — Opportunity Ranking Algorithm
//
// 综合机会评分 = 趋势热度 × 商品匹配度 × 时机优势
// 输出每个趋势的：
//   1. 综合机会分 (Opportunity Score)
//   2. 推荐行动 (Recommended Action)
//   3. 预估触达人数 (Potential Reach)
//   4. 操作建议 (Adaptation Tips)
// =============================================================================

import { Injectable } from '@nestjs/common';
import type {
  TrendHeatResult,
  ProductMatchResult,
  TrendVelocityResult,
  OpportunityResult,
  RecommendedAction,
  TrendLifecycleStage,
  AlgorithmWeights,
} from './types';
import { DEFAULT_WEIGHTS } from './types';

@Injectable()
export class OpportunityRankingService {
  private readonly weights = DEFAULT_WEIGHTS.opportunity;

  /**
   * 综合计算单个趋势的机会评分
   */
  evaluate(
    heat: TrendHeatResult,
    match: ProductMatchResult,
    velocity: TrendVelocityResult,
    weights?: Partial<AlgorithmWeights['opportunity']>,
  ): OpportunityResult {
    const w = { ...this.weights, ...weights };

    const timingScore = this.calculateTimingScore(velocity.lifecycleStage, velocity.daysToPeak);
    const opportunityScore = this.clamp(
      w.heat * heat.heatScore +
        w.match * match.matchScore +
        w.timing * timingScore,
      0,
      100,
    );

    const recommendedAction = this.determineAction(
      opportunityScore,
      heat.heatScore,
      match.matchScore,
      velocity.lifecycleStage,
    );

    const potentialReach = this.estimatePotentialReach(heat.heatScore, match.matchScore, velocity.lifecycleStage);

    const adaptationTips = this.generateAdaptationTips(
      heat,
      match,
      velocity,
      recommendedAction,
    );

    return {
      trendName: heat.name,
      trendType: heat.type,
      url: heat.url,
      opportunityScore: Math.round(opportunityScore * 100) / 100,
      heatScore: heat.heatScore,
      matchScore: match.matchScore,
      timingScore: Math.round(timingScore * 100) / 100,
      lifecycleStage: velocity.lifecycleStage,
      recommendedAction,
      potentialReach,
      adaptationTips,
    };
  }

  /**
   * 批量评估并排名
   */
  rankOpportunities(
    heatResults: TrendHeatResult[],
    matchResults: ProductMatchResult[],
    velocityResults: TrendVelocityResult[],
  ): OpportunityResult[] {
    const matchMap = new Map(matchResults.map((m) => [m.trendName, m]));
    const velocityMap = new Map(velocityResults.map((v) => [v.trendName, v]));

    return heatResults
      .map((h) => {
        const m = matchMap.get(h.name);
        const v = velocityMap.get(h.name);
        if (!m || !v) return null;
        return this.evaluate(h, m, v);
      })
      .filter((r): r is OpportunityResult => r !== null)
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  // =========================================================================
  // Timing Score
  // =========================================================================

  /**
   * 时机优势评分
   *
   * 基于生命周期阶段和距峰值天数：
   *   - emerging (距峰 5+ 天): 95分 — 最佳入场时机
   *   - emerging (距峰 3-5天): 85分
   *   - rising (距峰 1-3天): 70分 — 仍有空间
   *   - peak (距峰 0天):   40分 — 竞争激烈
   *   - declining:         20分 — 不建议
   *   - dying:              5分 — 避免
   */
  private calculateTimingScore(stage: TrendLifecycleStage, daysToPeak: number): number {
    switch (stage) {
      case 'emerging':
        if (daysToPeak >= 5) return 95;
        if (daysToPeak >= 3) return 85;
        return 75;
      case 'rising':
        if (daysToPeak >= 3) return 70;
        if (daysToPeak >= 1) return 55;
        return 45;
      case 'peak':
        return 40;
      case 'declining':
        return 20;
      case 'dying':
        return 5;
      default:
        return 50;
    }
  }

  // =========================================================================
  // Action Determination
  // =========================================================================

  /**
   * 基于多维输入确定推荐行动
   *
   * 决策矩阵：
   *   Opportunity ≥ 70 + Heat ≥ 60 + Match ≥ 50 → jump_in_immediately
   *   Opportunity ≥ 60 + Heat ≥ 50               → prepare_content
   *   Opportunity ≥ 40 + Emerging/Rising          → monitor_closely
   *   Opportunity ≥ 30 + Match ≥ 40               → cautious_test
   *   Opportunity ≥ 20                            → wait_and_see
   *   else                                         → avoid
   */
  private determineAction(
    opportunityScore: number,
    heatScore: number,
    matchScore: number,
    stage: TrendLifecycleStage,
  ): RecommendedAction {
    // 立即入场：高机会 + 高热度 + 高匹配
    if (opportunityScore >= 70 && heatScore >= 60 && matchScore >= 50) {
      return 'jump_in_immediately';
    }

    // 准备内容：机会较高 + 趋势在上升期
    if (opportunityScore >= 60 && heatScore >= 50 && (stage === 'emerging' || stage === 'rising')) {
      return 'prepare_content';
    }

    // 准备内容（备选）：机会高但匹配一般
    if (opportunityScore >= 65 && matchScore >= 40) {
      return 'prepare_content';
    }

    // 密切观察：中等机会 + 趋势在上升
    if (opportunityScore >= 40 && (stage === 'emerging' || stage === 'rising')) {
      return 'monitor_closely';
    }

    // 谨慎测试：低机会但有匹配度
    if (opportunityScore >= 30 && matchScore >= 40) {
      return 'cautious_test';
    }

    // 观望：低机会
    if (opportunityScore >= 20) {
      return 'wait_and_see';
    }

    return 'avoid';
  }

  // =========================================================================
  // Potential Reach Estimation
  // =========================================================================

  /**
   * 预估触达人数
   *
   * 公式：base_audience × heat_factor × match_factor × stage_factor
   *   base_audience = 10000 (TikTok 基线)
   *   heat_factor = heat_score / 50
   *   match_factor = match_score / 50
   *   stage_factor = based on lifecycle
   */
  private estimatePotentialReach(
    heatScore: number,
    matchScore: number,
    stage: TrendLifecycleStage,
  ): number {
    const BASE_AUDIENCE = 10000;

    const stageFactors: Record<TrendLifecycleStage, number> = {
      emerging: 0.3,   // 受众尚未完全形成
      rising: 0.8,     // 快速增长期
      peak: 1.0,       // 最大受众
      declining: 0.5,  // 衰减中
      dying: 0.1,      // 残量
    };

    const stageFactor = stageFactors[stage] || 0.5;
    const heatFactor = Math.max(0.1, heatScore / 50);
    const matchFactor = Math.max(0.1, matchScore / 50);

    const reach = BASE_AUDIENCE * heatFactor * matchFactor * stageFactor;

    // 取整到千位
    return Math.round(reach / 1000) * 1000;
  }

  // =========================================================================
  // Adaptation Tips Generation
  // =========================================================================

  /**
   * 基于趋势特征和匹配情况生成操作建议
   */
  private generateAdaptationTips(
    heat: TrendHeatResult,
    match: ProductMatchResult,
    velocity: TrendVelocityResult,
    action: RecommendedAction,
  ): string[] {
    const tips: string[] = [];

    // 基于行动类型的基础建议
    const actionTips: Record<RecommendedAction, string[]> = {
      jump_in_immediately: [
        `立即围绕「${heat.name}」创作内容，抢占流量窗口`,
        `使用趋势相关标签和音效，最大化曝光`,
        `准备多版素材进行 A/B 测试，快速迭代`,
      ],
      prepare_content: [
        `开始策划与「${heat.name}」相关的内容脚本`,
        `调研对标账号在类似趋势下的表现数据`,
        `准备 3-5 版不同风格的素材预案`,
      ],
      monitor_closely: [
        `持续监测「${heat.name}」的热度变化和竞争态势`,
        `关注同类商品在趋势下的转化数据`,
        `提前储备相关素材和脚本模板`,
      ],
      cautious_test: [
        `低预算测试「${heat.name}」与商品的结合效果`,
        `重点观察 CTR 和转化率指标`,
        `控制投放预算，验证 ROI 后决定是否加码`,
      ],
      wait_and_see: [
        `将「${heat.name}」加入观察列表`,
        `关注趋势演变方向和相关子趋势`,
        `优化自身商品卖点，等待更好的匹配时机`,
      ],
      avoid: [
        `不建议跟随「${heat.name}」，趋势匹配度过低`,
        `将资源投入到与商品更匹配的其他趋势`,
        `关注是否有新兴替代趋势出现`,
      ],
    };

    tips.push(...actionTips[action]);

    // 基于趋势类型的补充建议
    const typeTips: Record<string, string[]> = {
      hashtag: [`在视频标题和描述中合理使用 #${heat.name} 标签`],
      sound: [`在视频中使用「${heat.name}」作为背景音乐`],
      effect: [`在视频制作中应用「${heat.name}」特效增强视觉效果`],
      topic: [`围绕「${heat.name}」话题策划系列内容`],
    };

    if (heat.type && typeTips[heat.type]) {
      tips.push(...typeTips[heat.type]);
    }

    // 基于生命周期阶段的时机建议
    if (velocity.lifecycleStage === 'emerging') {
      tips.push('趋势处于萌芽期，早期进入可获得最大流量红利');
    } else if (velocity.lifecycleStage === 'peak') {
      tips.push('趋势已到高峰期，建议差异化切入而非简单跟风');
    } else if (velocity.lifecycleStage === 'declining') {
      tips.push('趋势正在衰退，如有库存压力可降价促销清仓');
    }

    // 去重并限制数量
    return [...new Set(tips)].slice(0, 5);
  }

  // =========================================================================
  // Utility
  // =========================================================================

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
