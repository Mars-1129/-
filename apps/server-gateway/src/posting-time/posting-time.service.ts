// =============================================================================
// TikStream AI — Posting Time Service
// 投放时段优化核心服务
//   1. 规则引擎：各平台行业黄金时段 + 品类修正
//   2. 竞争避让：检测高竞争时段并生成 avoid_slots
//   3. 缓存：同一 product+platform 组合 24h 内复用结果
// =============================================================================

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectPrisma } from '@nestjs/prisma';
import type { PrismaClient } from '@prisma/client';
import type { PostingTimeOptimization, PostingTimeSlot, PostingAvoidSlot } from '@tikstream/shared-types';
import {
  PLATFORM_GOLDEN_HOURS,
  CATEGORY_TIMING_ADJUSTMENTS,
  COMPETITION_RULES,
  POSTING_TIME_CACHE_TTL_MS,
  DEFAULT_PLATFORM,
  type TimeSlotTemplate,
  type PlatformGoldenHours,
} from './posting-time.constants';

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  result: PostingTimeOptimization;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PostingTimeService {
  private readonly logger = new Logger(PostingTimeService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectPrisma() private readonly prisma: PrismaClient,
  ) {}

  // ===========================================================================
  // Public API
  // ===========================================================================

  async optimize(dto: {
    product_id: string;
    platform?: string;
    content_type?: string;
    force_refresh?: boolean;
  }): Promise<PostingTimeOptimization> {
    const platform = dto.platform || DEFAULT_PLATFORM;
    const cacheKey = `${dto.product_id}:${platform}:${dto.content_type ?? 'any'}`;

    // 1. Check cache
    if (!dto.force_refresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        this.logger.log(`[PostingTime] Cache hit: ${cacheKey}`);
        return cached.result;
      }
    }

    // 2. Validate platform
    const platformData = PLATFORM_GOLDEN_HOURS.find((p) => p.platform === platform);
    if (!platformData) {
      throw new HttpException(
        `不支持的平台: ${platform}，可用平台: ${PLATFORM_GOLDEN_HOURS.map((p) => p.platform).join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 3. Load product data for category matching
    const product = await this.prisma.product.findUnique({
      where: { id: dto.product_id },
      select: { id: true, category: true, targetAudience: true, title: true },
    });

    if (!product) {
      throw new HttpException(`商品不存在: ${dto.product_id}`, HttpStatus.NOT_FOUND);
    }

    // 4. Determine day type (simplified: use weekday schedule by default)
    const slots = platformData.weekdays;
    const weekendSlots = platformData.weekends;

    // 5. Apply category adjustments
    const adjustments = this.matchCategoryAdjustments(product.category ?? '');

    // 6. Generate time slots
    const recommendations = this.buildRecommendations(
      platformData,
      slots,
      adjustments,
      product.category ?? '',
    );

    // 7. Generate weekend recommendations
    const weekendRecommendations = this.buildRecommendations(
      platformData,
      weekendSlots,
      adjustments,
      product.category ?? '',
    ).map((s) => ({ ...s, day_of_week: this.isWeekendDay(s.day_of_week) ? s.day_of_week : `${s.day_of_week}（周末）` }));

    const allRecommendations = [...recommendations, ...weekendRecommendations]
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    // 8. Generate avoid slots
    const avoidSlots = this.buildAvoidSlots(platform);

    // 9. 查询历史投放数据 (如果存在则增强推荐)
    let historyMap: Map<string, {
      engagements: number[]; ctrs: number[]; completions: number[]; conversions: number[];
      watches: number[]; impressions: number; videoCount: number;
    }> = new Map();
    try {
      historyMap = await this.loadHistoryData(
        dto.product_id,
        platform,
        dto.content_type ?? 'product_review',
      );
    } catch (err) {
      this.logger.warn(`[PostingTime] 历史数据加载失败，降级为纯规则引擎: ${(err as Error)?.message}`,);
    }

    // 10. 基于历史数据修正分数
    const enrichedRecommendations = this.enrichWithHistory(allRecommendations, historyMap);

    // 11. 计算基线CTR (基于历史数据或行业基准)
    const historyCtr = this.computeAvgHistoryCtr(historyMap);
    const baselineCtr = historyCtr ?? 0.05;
    const bestScore = enrichedRecommendations.length > 0 ? enrichedRecommendations[0].score : 50;
    const dataSource = historyCtr !== null && historyMap.size > 0 ? 'HISTORICAL_DATA' : 'INDUSTRY_HEURISTIC';

    // 12. Build heatmap data for frontend chart
    const heatmapData = this.buildHeatmapData(historyMap, allRecommendations);

    const result: any = {
      product_id: dto.product_id,
      platform,
      content_type: dto.content_type,
      recommendations: enrichedRecommendations,
      avoid_slots: avoidSlots,
      baseline_ctr: Math.round(baselineCtr * 10000) / 10000,
      expected_ctr_lift: Math.round((bestScore - 50) / 100 * 100) / 100,
      data_source: dataSource as 'INDUSTRY_HEURISTIC' | 'AI_ENRICHED' | 'HISTORICAL_DATA',
      generated_at: new Date().toISOString(),
      heatmap_data: heatmapData,
    };

    // 13. Cache and return
    this.cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + POSTING_TIME_CACHE_TTL_MS,
    });

    this.logger.log(
      `[PostingTime] product=${dto.product_id} platform=${platform} category=${product.category} → ${allRecommendations.length} slots`,
    );

    return result;
  }

  getSupportedPlatforms(): Array<{ platform: string; display_name: string; timezone: string }> {
    return PLATFORM_GOLDEN_HOURS.map((p) => ({
      platform: p.platform,
      display_name: p.display_name,
      timezone: p.timezone,
    }));
  }

  // ===========================================================================
  // Private: Slot Generation
  // ===========================================================================

  private buildRecommendations(
    platform: PlatformGoldenHours,
    slots: TimeSlotTemplate[],
    adjustments: { morning: number; noon: number; evening: number; weekend: number } | null,
    category: string,
  ): PostingTimeSlot[] {
    const days = ['周一', '周二', '周三', '周四', '周五'];
    const results: PostingTimeSlot[] = [];

    for (const slot of slots) {
      const baseScore = slot.base_score;

      // Apply category adjustments
      let adjustedScore = baseScore;
      let adjustmentNote = '';
      if (adjustments) {
        const hour = parseInt(slot.start.split(':')[0], 10);
        if (hour >= 6 && hour < 11) {
          adjustedScore += adjustments.morning * 100;
          adjustmentNote = '（品类晨间加成）';
        } else if (hour >= 11 && hour < 15) {
          adjustedScore += adjustments.noon * 100;
          adjustmentNote = '（品类午间加成）';
        } else if (hour >= 15 && hour < 24) {
          adjustedScore += adjustments.evening * 100;
          adjustmentNote = '（品类晚间加成）';
        }
      }

      const finalScore = Math.round(Math.min(100, Math.max(0, adjustedScore)));
      const ctrBoost = Math.round(((finalScore - 50) / 100) * 100) / 100;

      // One entry per weekday
      for (const day of days) {
        results.push({
          day_of_week: day,
          time_range: { start: slot.start, end: slot.end },
          score: finalScore,
          expected_ctr_boost: Math.max(0, ctrBoost),
          competition_level: slot.competition,
          audience_activity: slot.audience_activity,
          reasoning: `${platform.display_name}${slot.label}时段：${slot.audience_note}。${adjustmentNote ? `品类匹配度：${category}${adjustmentNote}` : ''}`,
        });
      }
    }

    return results;
  }

  private buildAvoidSlots(platform: string): PostingAvoidSlot[] {
    const avoids: PostingAvoidSlot[] = [];

    for (const rule of COMPETITION_RULES) {
      if (!rule.affected_platforms.includes(platform)) continue;

      if (rule.competition_factor >= 0.75) {
        avoids.push({
          reason: rule.description,
          time_range: { ...rule.time_slots },
          severity: 'must_avoid',
        });
      } else if (rule.competition_factor >= 0.55) {
        avoids.push({
          reason: rule.description,
          time_range: { ...rule.time_slots },
          severity: 'suggest_avoid',
        });
      }
    }

    return avoids;
  }

  // ===========================================================================
  // Private: Category Matching
  // ===========================================================================

  private matchCategoryAdjustments(category: string): {
    morning: number;
    noon: number;
    evening: number;
    weekend: number;
  } | null {
    if (!category) return null;

    const lowerCategory = category.toLowerCase();
    for (const adj of CATEGORY_TIMING_ADJUSTMENTS) {
      for (const keyword of adj.category_keywords) {
        if (lowerCategory.includes(keyword.toLowerCase())) {
          this.logger.debug(`[PostingTime] Category "${category}" matched: "${keyword}"`);
          return {
            morning: adj.morning_boost,
            noon: adj.noon_boost,
            evening: adj.evening_boost,
            weekend: adj.weekend_boost,
          };
        }
      }
    }

    return null;
  }

  private isWeekendDay(day: string): boolean {
    return day.includes('周末') || day.includes('周六') || day.includes('周日');
  }

  // ===========================================================================
  // Private: Historical Data Enrichment
  // ===========================================================================

  /**
   * 加载指定产品+平台+内容类型 的完整历史投放数据
   * 返回 Map<`${day}:${slot}`, 聚合指标>
   */
  private async loadHistoryData(
    productId: string,
    platform: string,
    contentType: string,
  ): Promise<Map<string, {
    engagements: number[];
    ctrs: number[];
    completions: number[];
    conversions: number[];
    watches: number[];
    impressions: number;
    videoCount: number;
  }>> {
    const records = await this.prisma.postingTimeAnalytics.findMany({
      where: { productId, platform, contentType },
      orderBy: { dayOfWeek: 'asc' },
    });

    const map = new Map<string, {
      engagements: number[];
      ctrs: number[];
      completions: number[];
      conversions: number[];
      watches: number[];
      impressions: number;
      videoCount: number;
    }>();

    for (const r of records) {
      const key = `${r.dayOfWeek}:${r.hourSlot}`;
      if (!map.has(key)) {
        map.set(key, { engagements: [], ctrs: [], completions: [], conversions: [], watches: [], impressions: 0, videoCount: 0 });
      }
      const entry = map.get(key)!;
      entry.engagements.push(r.engagementRate);
      entry.ctrs.push(r.ctr);
      entry.completions.push(r.completionRate);
      entry.conversions.push(r.conversionRate);
      entry.watches.push(r.avgWatchTime);
      entry.impressions += r.impressions;
      entry.videoCount += r.videoCount;
    }

    this.logger.log(
      `[PostingTime] Historical data loaded: ${records.length} records, ${map.size} unique slots for ${platform}/${contentType}`,
    );
    return map;
  }

  /**
   * 用历史数据修正规则引擎推荐的分数
   */
  private enrichWithHistory(
    recommendations: PostingTimeSlot[],
    historyMap: Map<string, {
      engagements: number[]; ctrs: number[]; completions: number[]; conversions: number[];
      watches: number[]; impressions: number; videoCount: number;
    }>,
  ): PostingTimeSlot[] {
    if (historyMap.size === 0) return recommendations;

    const avg = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

    return recommendations.map((rec) => {
      const key = `${rec.day_of_week}:${rec.time_range.start}-${rec.time_range.end}`;
      const hist = historyMap.get(key);

      if (!hist || hist.engagements.length === 0) return rec;

      const histEng = avg(hist.engagements);
      const histCtr = avg(hist.ctrs);
      const histComp = avg(hist.completions);

      // 加权: 规则引擎 40% + 历史数据 60%
      const histNorm = Math.min(100, Math.max(0, (histEng * 800 + histCtr * 800 + histComp * 60)));
      const blendedScore = Math.round(rec.score * 0.4 + histNorm * 0.6);

      const ctrBoost = Math.round(((histCtr - 0.03) * 100) * 100) / 100;

      return {
        ...rec,
        score: blendedScore,
        expected_ctr_boost: Math.max(0, Math.round(ctrBoost * 100) / 100),
        reasoning: `${rec.reasoning} | 历史数据：${hist.videoCount}条视频，互动率${(histEng * 100).toFixed(1)}%，平均观看${avg(hist.watches).toFixed(1)}s`,
      };
    });
  }

  /**
   * 计算全量历史数据的平均CTR
   */
  private computeAvgHistoryCtr(
    historyMap: Map<string, { ctrs: number[] }>,
  ): number | null {
    const allCtrs: number[] = [];
    for (const v of historyMap.values()) allCtrs.push(...v.ctrs);
    if (allCtrs.length === 0) return null;
    return allCtrs.reduce((s, v) => s + v, 0) / allCtrs.length;
  }

  /**
   * 构建热力图数据 (天×时段矩阵)
   * 有历史数据 → 真实 engagement_rate
   * 无历史数据 → 规则引擎 score 映射为模拟互动率 (0.02~0.10)
   */
  private buildHeatmapData(
    historyMap: Map<string, {
      engagements: number[]; ctrs: number[]; completions: number[];
      impressions: number; videoCount: number;
    }>,
    recommendations?: PostingTimeSlot[],
  ): Array<{ day: string; hour: string; value: number; metric: string }> {
    const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const HOURS = ['06-08', '08-10', '10-12', '12-14', '14-16', '16-18', '18-20', '20-22', '22-24'];

    // 有历史数据 → 使用真实值
    if (historyMap.size > 0) {
      const result: Array<{ day: string; hour: string; value: number; metric: string }> = [];
      const avg = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
      for (const [key, data] of historyMap) {
        const [day, hour] = key.split(':');
        const eng = avg(data.engagements);
        result.push({
          day: day || '未知',
          hour: hour || '00-00',
          value: Math.round(eng * 10000) / 10000,
          metric: 'engagement_rate',
        });
      }
      return result;
    }

    // 无历史数据 → 用规则引擎的推荐分数构建模拟热力图
    const scoreMap = new Map<string, number>();
    if (recommendations && recommendations.length > 0) {
      for (const rec of recommendations) {
        const slotKey = `${rec.day_of_week}:${rec.time_range.start}-${rec.time_range.end}`;
        // 直接映射为模拟互动率：score 50→0.02, score 100→0.10
        const simEng = Math.round((0.02 + ((rec.score - 50) / 50) * 0.08) * 10000) / 10000;
        scoreMap.set(slotKey, simEng);
      }
    }

    // 对推荐命中的相邻时段做平滑扩散
    const smoothed = new Map<string, number>();
    for (const day of DAYS) {
      for (let hi = 0; hi < HOURS.length; hi++) {
        const hour = HOURS[hi];
        const key = `${day}:${hour}`;

        let val = scoreMap.get(key) ?? 0;

        // 如果当前格子没有被推荐命中，取相邻格子的均值作为扩散值
        if (val === 0) {
          const neighbors: number[] = [];
          for (const h of HOURS) {
            const nk = `${day}:${h}`;
            const nv = scoreMap.get(nk);
            if (nv !== undefined && nv > 0) neighbors.push(nv);
          }
          if (neighbors.length > 0) {
            val = Math.round((neighbors.reduce((s, v) => s + v, 0) / neighbors.length) * 0.35);
          } else {
            // 完全没有推荐的日期，给一个低基线
            val = 0.015 + Math.random() * 0.015;
          }
        }

        smoothed.set(key, Math.round(val * 10000) / 10000);
      }
    }

    return Array.from(smoothed.entries()).map(([key, value]) => {
      const [day, hour] = key.split(':');
      return {
        day: day || '未知',
        hour: hour || '00-00',
        value,
        metric: 'simulated_score',
      };
    });
  }
}
