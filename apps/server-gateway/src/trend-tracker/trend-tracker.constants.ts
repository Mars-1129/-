// =============================================================================
// TikStream AI — Trend Tracker Constants
// =============================================================================

export const TREND_TRACKER_CONSTANTS = {
  /** 趋势类型 */
  TREND_TYPES: ['hashtag', 'sound', 'effect', 'topic'] as const,

  /** 快照缓存 TTL（秒），默认 1 小时 */
  DEFAULT_TTL_SECONDS: 3600,

  /** AI 生成趋势最大条数 */
  MAX_TRENDS: 10,

  /** AI 生成推荐最大条数 */
  MAX_RECOMMENDATIONS: 5,

  /** 每个推荐的最大 adaption_tips 条数 */
  MAX_ADAPTATION_TIPS: 3,

  /** 匹配度最低阈值（低于此分数的推荐不返回） */
  MIN_MATCH_SCORE: 30,

  /** LLM 路径超时（毫秒），超时立即回退算法引擎 */
  LLM_TIMEOUT_MS: 15_000,

  /** 错误消息 */
  ERROR_MESSAGES: {
    TREND_SNAPSHOT_NOT_FOUND: '趋势快照不存在',
    TREND_GENERATION_FAILED: '趋势分析生成失败',
    TREND_PRODUCT_REQUIRED: '必须提供 product_id',
    PRODUCT_NOT_FOUND: '商品不存在',
  },
} as const;
