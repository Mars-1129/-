// =============================================================================
// TikStream AI — Trend Engine Algorithm Types
// =============================================================================

/** 趋势生命周期阶段 */
export type TrendLifecycleStage = 'emerging' | 'rising' | 'peak' | 'declining' | 'dying';

/** 趋势类型 */
export type TrendType = 'hashtag' | 'sound' | 'effect' | 'topic';

/** 原始趋势数据点（用于算法输入） */
export interface TrendDataPoint {
  /** 趋势名称 */
  name: string;
  /** 趋势类型 */
  type: TrendType;
  /** 趋势 URL */
  url?: string;
  /** 提及量（最近 24h） */
  mentionCount24h: number;
  /** 提及量（最近 7d） */
  mentionCount7d: number;
  /** 点赞数 */
  likeCount: number;
  /** 分享数 */
  shareCount: number;
  /** 评论数 */
  commentCount: number;
  /** 视频使用数 */
  videoCount: number;
  /** 创作者采用率 0-1 */
  creatorAdoptionRate: number;
  /** 关联品类 */
  categories: string[];
  /** 关联关键词 */
  keywords: string[];
  /** 目标受众标签 */
  audienceTags: string[];
  /** 数据时间戳 */
  timestamp: Date;
}

/** 历史快照（用于速度计算） */
export interface TrendHistoryPoint {
  name: string;
  type: TrendType;
  heatScore: number;
  mentionCount: number;
  videoCount: number;
  timestamp: Date;
}

/** 趋势热度评分结果 */
export interface TrendHeatResult {
  name: string;
  type: TrendType;
  url?: string;
  /** 综合热度分 0-100 */
  heatScore: number;
  /** 体量子分 0-100 */
  volumeScore: number;
  /** 速度子分 0-100 */
  velocityScore: number;
  /** 互动子分 0-100 */
  engagementScore: number;
  /** 时效子分 0-100 */
  recencyScore: number;
  /** 创作者子分 0-100 */
  creatorScore: number;
}

/** 商品-趋势匹配结果 */
export interface ProductMatchResult {
  trendName: string;
  trendType: TrendType;
  /** 综合匹配分 0-100 */
  matchScore: number;
  /** 品类亲和度 0-100 */
  categoryAffinity: number;
  /** 关键词相似度 0-100 */
  keywordSimilarity: number;
  /** 受众重叠度 0-100 */
  audienceOverlap: number;
}

/** 趋势速度与生命周期分析结果 */
export interface TrendVelocityResult {
  trendName: string;
  trendType: TrendType;
  /** 当前热度 */
  currentHeat: number;
  /** 速度（热度变化/天） */
  velocity: number;
  /** 加速度（速度变化/天²） */
  acceleration: number;
  /** 生命周期阶段 */
  lifecycleStage: TrendLifecycleStage;
  /** 距峰值天数估算（负数表示已过峰） */
  daysToPeak: number;
  /** 剩余有效天数估算 */
  remainingDays: number;
  /** 趋势确定性 0-100 */
  confidence: number;
}

/** 综合机会排名结果 */
export interface OpportunityResult {
  trendName: string;
  trendType: TrendType;
  url?: string;
  /** 综合机会分 0-100 */
  opportunityScore: number;
  /** 趋势热度分 */
  heatScore: number;
  /** 商品匹配分 */
  matchScore: number;
  /** 时机优势分 */
  timingScore: number;
  /** 生命周期阶段 */
  lifecycleStage: TrendLifecycleStage;
  /** 建议行动 */
  recommendedAction: RecommendedAction;
  /** 预估触达人数 */
  potentialReach: number;
  /** 适应建议 */
  adaptationTips: string[];
}

/** 推荐行动类型 */
export type RecommendedAction =
  | 'jump_in_immediately'   // 立即入场
  | 'prepare_content'       // 准备内容
  | 'monitor_closely'       // 密切观察
  | 'cautious_test'         // 谨慎测试
  | 'wait_and_see'          // 观望
  | 'avoid';                // 避免

/** 算法权重配置 */
export interface AlgorithmWeights {
  /** 热度评分权重 */
  heat: {
    volume: number;
    velocity: number;
    engagement: number;
    recency: number;
    creator: number;
  };
  /** 匹配评分权重 */
  matching: {
    categoryAffinity: number;
    keywordSimilarity: number;
    audienceOverlap: number;
  };
  /** 机会评分权重 */
  opportunity: {
    heat: number;
    match: number;
    timing: number;
  };
}

/** 默认算法权重 */
export const DEFAULT_WEIGHTS: AlgorithmWeights = {
  heat: {
    volume: 0.30,
    velocity: 0.25,
    engagement: 0.20,
    recency: 0.15,
    creator: 0.10,
  },
  matching: {
    categoryAffinity: 0.45,
    keywordSimilarity: 0.35,
    audienceOverlap: 0.20,
  },
  opportunity: {
    heat: 0.35,
    match: 0.40,
    timing: 0.25,
  },
};

/** 品类亲和度矩阵（行=趋势品类, 列=商品品类, 值=亲和度 0-1） */
export const CATEGORY_AFFINITY_MATRIX: Record<string, Record<string, number>> = {
  beauty: {
    beauty: 1.0, fitness: 0.2, food: 0.1, tech: 0.1, home: 0.3, pet: 0.1,
    fashion: 0.8, health: 0.6, lifestyle: 0.5, entertainment: 0.3,
  },
  fitness: {
    beauty: 0.3, fitness: 1.0, food: 0.4, tech: 0.3, home: 0.2, pet: 0.1,
    fashion: 0.3, health: 0.8, lifestyle: 0.6, entertainment: 0.2,
  },
  food: {
    beauty: 0.1, fitness: 0.3, food: 1.0, tech: 0.1, home: 0.4, pet: 0.1,
    fashion: 0.2, health: 0.5, lifestyle: 0.6, entertainment: 0.4,
  },
  tech: {
    beauty: 0.1, fitness: 0.4, food: 0.1, tech: 1.0, home: 0.5, pet: 0.2,
    fashion: 0.2, health: 0.3, lifestyle: 0.4, entertainment: 0.5,
  },
  home: {
    beauty: 0.2, fitness: 0.1, food: 0.3, tech: 0.3, home: 1.0, pet: 0.3,
    fashion: 0.3, health: 0.2, lifestyle: 0.7, entertainment: 0.2,
  },
  pet: {
    beauty: 0.1, fitness: 0.1, food: 0.3, tech: 0.1, home: 0.3, pet: 1.0,
    fashion: 0.1, health: 0.2, lifestyle: 0.5, entertainment: 0.3,
  },
  fashion: {
    beauty: 0.7, fitness: 0.3, food: 0.1, tech: 0.1, home: 0.3, pet: 0.1,
    fashion: 1.0, health: 0.3, lifestyle: 0.6, entertainment: 0.5,
  },
  health: {
    beauty: 0.5, fitness: 0.8, food: 0.5, tech: 0.2, home: 0.3, pet: 0.2,
    fashion: 0.3, health: 1.0, lifestyle: 0.6, entertainment: 0.2,
  },
  lifestyle: {
    beauty: 0.5, fitness: 0.5, food: 0.5, tech: 0.3, home: 0.7, pet: 0.4,
    fashion: 0.5, health: 0.5, lifestyle: 1.0, entertainment: 0.5,
  },
  entertainment: {
    beauty: 0.3, fitness: 0.3, food: 0.3, tech: 0.4, home: 0.3, pet: 0.3,
    fashion: 0.4, health: 0.2, lifestyle: 0.5, entertainment: 1.0,
  },
};

/** 默认通用品类亲和度 */
export const DEFAULT_CATEGORY_AFFINITY: Record<string, number> = {
  beauty: 0.2, fitness: 0.2, food: 0.2, tech: 0.2, home: 0.2, pet: 0.2,
  fashion: 0.2, health: 0.2, lifestyle: 0.3, entertainment: 0.3,
};
