// =============================================================================
// TikStream AI — Product-Trend Matching Algorithm
//
// 三维度语义匹配模型：
//   1. 品类亲和度 (Category Affinity) - 基于预定义矩阵
//   2. 关键词相似度 (Keyword Similarity) - TF-IDF + Cosine Similarity
//   3. 受众重叠度 (Audience Overlap)   - Jaccard Similarity
// =============================================================================

import { Injectable } from '@nestjs/common';
import type { TrendDataPoint, ProductMatchResult, AlgorithmWeights } from './types';
import { DEFAULT_WEIGHTS, CATEGORY_AFFINITY_MATRIX } from './types';

/** 商品信息（匹配算法输入） */
export interface ProductInfo {
  productId: string;
  name: string;
  category: string;
  sellingPoints: string[];
  targetAudience: string;
  audienceTags: string[];
  scenarioTags: string[];
}

@Injectable()
export class ProductMatchingService {
  private readonly weights = DEFAULT_WEIGHTS.matching;

  /**
   * 计算单个趋势与商品的匹配度
   */
  matchTrendToProduct(
    trend: TrendDataPoint,
    product: ProductInfo,
    weights?: Partial<AlgorithmWeights['matching']>,
  ): ProductMatchResult {
    const w = { ...this.weights, ...weights };

    const categoryAffinity = this.calculateCategoryAffinity(trend.categories, product.category);
    const keywordSimilarity = this.calculateKeywordSimilarity(
      trend.keywords,
      [...product.sellingPoints, product.name, ...product.scenarioTags],
    );
    const audienceOverlap = this.calculateAudienceOverlap(
      trend.audienceTags,
      product.audienceTags,
    );

    const matchScore = this.clamp(
      w.categoryAffinity * categoryAffinity +
        w.keywordSimilarity * keywordSimilarity +
        w.audienceOverlap * audienceOverlap,
      0,
      100,
    );

    return {
      trendName: trend.name,
      trendType: trend.type,
      matchScore: Math.round(matchScore * 100) / 100,
      categoryAffinity: Math.round(categoryAffinity * 100) / 100,
      keywordSimilarity: Math.round(keywordSimilarity * 100) / 100,
      audienceOverlap: Math.round(audienceOverlap * 100) / 100,
    };
  }

  /**
   * 批量计算趋势与商品的匹配度并排序
   */
  matchTrendsToProduct(
    trends: TrendDataPoint[],
    product: ProductInfo,
  ): ProductMatchResult[] {
    return trends
      .map((t) => this.matchTrendToProduct(t, product))
      .sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * 计算趋势与多个品类的最佳匹配商品品类
   * 返回趋势最适配的商品品类排序
   */
  findBestProductCategories(trendCategories: string[]): Array<{ category: string; affinity: number }> {
    const scores: Array<{ category: string; affinity: number }> = [];

    for (const [productCategory, row] of Object.entries(CATEGORY_AFFINITY_MATRIX)) {
      let totalAffinity = 0;
      let count = 0;
      for (const trendCat of trendCategories) {
        const affinity = row[trendCat] ?? 0.1;
        totalAffinity += affinity;
        count++;
      }
      const avgAffinity = count > 0 ? totalAffinity / count : 0;
      scores.push({ category: productCategory, affinity: Math.round(avgAffinity * 10000) / 100 });
    }

    return scores.sort((a, b) => b.affinity - a.affinity);
  }

  // =========================================================================
  // Sub-score Calculators
  // =========================================================================

  /**
   * 品类亲和度：基于预定义矩阵的加权匹配
   *
   * 公式: 100 * sum(affinity(trend_cat, product_cat)) / len(trend_categories)
   */
  private calculateCategoryAffinity(trendCategories: string[], productCategory: string): number {
    if (!trendCategories || trendCategories.length === 0) return 10; // 无品类信息给低分

    const row = CATEGORY_AFFINITY_MATRIX[productCategory];
    if (!row) {
      // 商品品类不在矩阵中，使用默认亲和度
      let total = 0;
      for (const cat of trendCategories) {
        total += CATEGORY_AFFINITY_MATRIX[cat]?.[productCategory] ?? 0.15;
      }
      return (total / trendCategories.length) * 100;
    }

    let totalAffinity = 0;
    for (const trendCat of trendCategories) {
      totalAffinity += row[trendCat] ?? 0.15;
    }

    return (totalAffinity / trendCategories.length) * 100;
  }

  /**
   * 关键词相似度：基于 TF-IDF 风格的余弦相似度
   *
   * 步骤：
   *   1. 构建词袋（中英文混合分词）
   *   2. 计算 TF（词频）
   *   3. 计算 IDF 权重（基于商品关键词的重要性）
   *   4. 余弦相似度
   */
  private calculateKeywordSimilarity(trendKeywords: string[], productKeywords: string[]): number {
    if (!trendKeywords.length || !productKeywords.length) return 0;

    // 分词处理：中文字符级 + 英文词级
    const tokenize = (text: string): string[] => {
      const tokens: string[] = [];
      // 中文按字符切分
      const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
      tokens.push(...chineseChars);
      // 英文按词切分（2字符以上的词）
      const englishWords = text.match(/[a-zA-Z]{2,}/g) || [];
      tokens.push(...englishWords.map((w) => w.toLowerCase()));
      return tokens;
    };

    // 为每个关键词集合构建 TF 向量
    const buildTFVector = (keywords: string[]): Map<string, number> => {
      const tf = new Map<string, number>();
      for (const kw of keywords) {
        const tokens = tokenize(kw);
        for (const token of tokens) {
          tf.set(token, (tf.get(token) || 0) + 1);
        }
      }
      // 归一化
      const total = keywords.length || 1;
      for (const [key, val] of tf) {
        tf.set(key, val / total);
      }
      return tf;
    };

    const trendTF = buildTFVector(trendKeywords);
    const productTF = buildTFVector(productKeywords);

    // 收集所有 token 用于向量对齐
    const allTokens = new Set([...trendTF.keys(), ...productTF.keys()]);

    // 计算余弦相似度
    let dotProduct = 0;
    let trendNorm = 0;
    let productNorm = 0;

    for (const token of allTokens) {
      const a = trendTF.get(token) || 0;
      const b = productTF.get(token) || 0;
      dotProduct += a * b;
      trendNorm += a * a;
      productNorm += b * b;
    }

    if (trendNorm === 0 || productNorm === 0) return 0;

    const cosine = dotProduct / (Math.sqrt(trendNorm) * Math.sqrt(productNorm));

    // 映射到 0-100
    return this.clamp(cosine * 100, 0, 100);
  }

  /**
   * 受众重叠度：Jaccard 相似系数
   *
   * 公式: 100 * |A ∩ B| / |A ∪ B|
   */
  private calculateAudienceOverlap(trendAudience: string[], productAudience: string[]): number {
    if (!trendAudience.length || !productAudience.length) return 0;

    const trendSet = new Set(trendAudience.map((t) => t.toLowerCase()));
    const productSet = new Set(productAudience.map((t) => t.toLowerCase()));

    let intersection = 0;
    for (const tag of trendSet) {
      if (productSet.has(tag)) intersection++;
    }

    const union = trendSet.size + productSet.size - intersection;
    if (union === 0) return 0;

    return (intersection / union) * 100;
  }

  // =========================================================================
  // Utility
  // =========================================================================

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
