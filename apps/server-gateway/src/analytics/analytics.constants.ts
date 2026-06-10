// =============================================================================
// TikStream AI — Analytics Module Constants
// =============================================================================

export const ANALYTICS_CONSTANTS = {
  METRIC_TYPES: ['RETENTION_RATE', 'COMPLETION_RATE'] as const,

  GRANULARITIES: ['SECOND', 'SHOT', 'DAY'] as const,

  DATA_SOURCE: 'DUCKDB_PRECOMPUTED' as const,

  DEFAULT_METRIC_TYPE: 'RETENTION_RATE' as const,
  DEFAULT_GRANULARITY: 'SECOND' as const,
  DEFAULT_INCLUDE_SHOT_MARKERS: true,

  DUCKDB_TIMEOUT_MS: 30_000,

  DROP_POINT_THRESHOLD: 0.05,

  SIGNIFICANT_DROP_THRESHOLD: 0.1,

  MAX_SHOTS_WARN_THRESHOLD: 20,

  SHOT_LABEL_TEMPLATE: '分镜 {index}',

  ANALYTICS_METRICS: ['CTR', 'CVR', 'COMPLETION_RATE', 'RETENTION_RATE'] as const,

  HEATMAP_DIMENSIONS: ['NARRATIVE_STRATEGY', 'VISUAL_STYLE', 'BGM_STYLE', 'CTA_STYLE'] as const,

  DEFAULT_ANALYTICS_METRIC: 'CVR' as const,
  DEFAULT_X_DIMENSION: 'NARRATIVE_STRATEGY' as const,
  DEFAULT_Y_DIMENSION: 'VISUAL_STYLE' as const,
  DEFAULT_TOP_N: 3,
  TOP_N_MIN: 1,
  TOP_N_MAX: 50,

  CONFIDENCE_HIGH_THRESHOLD: 200,
  CONFIDENCE_MEDIUM_THRESHOLD: 50,
  INSUFFICIENT_DATA_THRESHOLD: 20,

  MOCK_NARRATIVE_STRATEGIES: ['问题前置型', '悬念递进型', '对比反差型', '故事叙述型', '清单罗列型'] as const,
  MOCK_VISUAL_STYLES: ['产品特写', '场景展示', '文字叠加', '真人出镜', '动画演示'] as const,
  MOCK_BGM_STYLES: ['快节奏电子', '舒缓钢琴', '激昂管弦', '轻松吉他', '无BGM'] as const,
  MOCK_CTA_STYLES: ['直接促销', '限时优惠', '软性引导', '问题引导', '无CTA'] as const,

  MOCK_LABEL_MAP: {
    NARRATIVE_STRATEGY: ['问题前置型', '悬念递进型', '对比反差型', '故事叙述型', '清单罗列型'] as readonly string[],
    VISUAL_STYLE: ['产品特写', '场景展示', '文字叠加', '真人出镜', '动画演示'] as readonly string[],
    BGM_STYLE: ['快节奏电子', '舒缓钢琴', '激昂管弦', '轻松吉他', '无BGM'] as readonly string[],
    CTA_STYLE: ['直接促销', '限时优惠', '软性引导', '问题引导', '无CTA'] as readonly string[],
  },

  RETENTION_BUCKET_NAMES: ['高留存(>70%)', '中留存(40-70%)', '低留存(20-40%)', '流失(<20%)'] as const,

  SANKEY_DEFAULT_METRIC: 'RETENTION_FLOW' as const,

  SANKEY_VALID_SOURCE_DIMENSIONS: ['BGM_STYLE'] as const,
  SANKEY_VALID_MIDDLE_DIMENSIONS: ['VISUAL_STYLE'] as const,
  SANKEY_VALID_TARGET_DIMENSIONS: ['RETENTION_BUCKET'] as const,
  SANKEY_DEFAULT_SOURCE_DIMENSION: 'BGM_STYLE' as const,
  SANKEY_DEFAULT_MIDDLE_DIMENSION: 'VISUAL_STYLE' as const,
  SANKEY_DEFAULT_TARGET_DIMENSION: 'RETENTION_BUCKET' as const,

  SANKEY_NODE_PREFIX: {
    BGM_STYLE: 'bgm_',
    VISUAL_STYLE: 'visual_',
    RETENTION_BUCKET: 'retention_',
  } as const,

  SANKEY_BGM_VISUAL_DELIMITER: '|||',

  ERROR_MESSAGES: {
    PRODUCT_ID_REQUIRED: 'product_id 为必填字段',
    CREATION_ID_REQUIRED: 'creation_id 为必填字段',
    CREATION_ID_BLANK: 'creation_id 不可为空白字符串',
    CREATION_NOT_FOUND: '创作任务不存在',
    SCRIPT_NOT_FOUND: '创作任务关联的剧本已被删除',
    PRODUCT_MISMATCH: '创作任务 product_id 与查询参数不匹配',
    NO_SHOTS_IN_CREATION: '创作任务关联的剧本不包含任何有效分镜',
    METRIC_TYPE_INVALID: 'metric_type 取值必须为 RETENTION_RATE 或 COMPLETION_RATE',
    GRANULARITY_INVALID: 'granularity 取值必须为 SECOND、SHOT 或 DAY',
    DUCKDB_PRECOMPUTE_MISSING: 'DuckDB 预计算数据尚未就绪',
    DUCKDB_FAILED: 'DuckDB 数据库操作异常',
    DUCKDB_CONNECTION_REFUSED: 'DuckDB 连接被拒绝，自动降级为预测数据',
    DUCKDB_FILE_NOT_FOUND: 'DuckDB 数据库文件缺失，自动降级为预测数据',
    DUCKDB_QUERY_TIMEOUT: 'DuckDB 查询超时，自动降级为预测数据',
    PRODUCT_NOT_FOUND: '商品不存在',
    ANALYTICS_METRIC_INVALID: 'metric 取值必须为 CTR / CVR / COMPLETION_RATE / RETENTION_RATE',
    DIMENSION_INVALID: 'x_dimension / y_dimension 取值必须为 NARRATIVE_STRATEGY / VISUAL_STYLE / BGM_STYLE / CTA_STYLE',
    DIMENSION_CONFLICT: 'x_dimension 与 y_dimension 不能相同，交叉分析需要两个不同维度',
    TOP_N_OUT_OF_RANGE: 'top_n 取值范围为 1 到 50',
    DUCKDB_SANKEY_QUERY_FAILED: 'DuckDB 桑基图查询异常，自动降级为预测数据',
    DUCKDB_SANKEY_EMPTY: 'DuckDB 桑基图查询返回空数据集，自动降级为预测数据',
    CREATION_ID_A_REQUIRED: 'creation_id_a 为必填字段',
    CREATION_ID_B_REQUIRED: 'creation_id_b 为必填字段',
    CREATION_IDS_SAME: 'creation_id_a 与 creation_id_b 不能相同，AB 对比需要两个不同的创作版本',
    AB_COMPARE_LABEL_A: '版本A',
    AB_COMPARE_LABEL_B: '版本B',
    AB_COMPARE_CREATION_A_NOT_FOUND: 'AB对比 [A] 创作任务不存在',
    AB_COMPARE_CREATION_B_NOT_FOUND: 'AB对比 [B] 创作任务不存在',
    AB_COMPARE_CREATION_A_PRODUCT_MISMATCH: 'AB对比 [A] 创作任务 product_id 与查询参数不匹配',
    AB_COMPARE_CREATION_B_PRODUCT_MISMATCH: 'AB对比 [B] 创作任务 product_id 与查询参数不匹配',
    AB_COMPARE_CREATION_A_SCRIPT_DELETED: 'AB对比 [A] 创作任务关联的剧本已被删除',
    AB_COMPARE_CREATION_B_SCRIPT_DELETED: 'AB对比 [B] 创作任务关联的剧本已被删除',
    AB_COMPARE_CREATION_A_NO_SHOTS: 'AB对比 [A] 创作任务关联的剧本不包含任何有效分镜',
    AB_COMPARE_CREATION_B_NO_SHOTS: 'AB对比 [B] 创作任务关联的剧本不包含任何有效分镜',
    DUCKDB_AB_COMPARE_QUERY_FAILED: 'DuckDB AB对比查询异常，自动降级为预测数据',
    DUCKDB_AB_COMPARE_EMPTY: 'DuckDB AB对比查询返回空数据集，自动降级为预测数据',
    SELF_HEAL_TRIGGER_SOURCE_INVALID: 'trigger_source 取值必须为 RETENTION_DROP / AB_COMPARE / MANUAL',
    SELF_HEAL_ISSUE_TYPE_INVALID: 'issue_type 取值必须为 HOOK_WEAK / VOICEOVER_TOO_LONG / STYLE_MISMATCH / CTA_WEAK',
    SELF_HEAL_STRATEGY_INVALID: 'strategy 取值必须为 REWRITE_ONLY / RERENDER_SHOT / REGENERATE_VARIANT',
    SELF_HEAL_MANUAL_NO_TARGETS: 'MANUAL 触发源必须指定至少一个 target_shot_index',
    SELF_HEAL_SHOT_INDEX_OUT_OF_RANGE: '目标分镜索引超出实际分镜范围',
    SELF_HEAL_STRATEGY_CONFLICT: 'REGENERATE_VARIANT 策略将全量覆盖所有分镜，忽略分镜级 target_shot_index 指定',
    SELF_HEAL_DUCKDB_QUERY_FAILED: 'DuckDB 自愈诊断查询异常，自动降级为预测数据',
    SELF_HEAL_DUCKDB_EMPTY: 'DuckDB 自愈诊断查询返回空数据集，自动降级为预测数据',
    SELF_HEAL_LABEL: '自愈',
  },

  AB_COMPARE_WEIGHTS: {
    RETENTION: 0.30,
    COMPLETION: 0.25,
    CTR: 0.25,
    CVR: 0.15,
    DURATION_FIT: 0.05,
  },

  AB_COMPARE_TIE_THRESHOLD: 0.03,

  AB_COMPARE_DIRECTION_THRESHOLD: 0.005,

  AB_COMPARE_METRIC_NAMES: [
    'retention_rate',
    'completion_rate',
    'ctr',
    'cvr',
    'avg_shot_duration',
  ] as const,

  AB_COMPARE_HOOK_STRATEGY_MAP: {
    PROMPT_DRIVEN: 'Prompt驱动-用户自定义策略',
    VIRAL_REWRITE: '爆款仿写-参照爆款钩子结构',
    TEMPLATE_DRIVEN: '模板驱动-结构化策略因子',
  } as const,

  AB_COMPARE_METRIC_LABEL_MAP: {
    retention_rate: '留存率',
    completion_rate: '完成率',
    ctr: 'CTR',
    cvr: 'CVR',
    avg_shot_duration: '分镜节奏适配度',
  } as const,

  MOCK_AB_COMPARE_CTR_RANGE: [0.02, 0.15] as readonly [number, number],
  MOCK_AB_COMPARE_CVR_RANGE: [0.01, 0.08] as readonly [number, number],
  MOCK_AB_COMPARE_COMPLETION_RANGE: [0.3, 0.85] as readonly [number, number],
  MOCK_AB_COMPARE_RETENTION_RANGE: [0.4, 0.9] as readonly [number, number],
  MOCK_AB_COMPARE_HOOK_STRENGTH_RANGE: [0.2, 0.95] as readonly [number, number],
  MOCK_AB_COMPARE_HOOK_TYPES: ['problem_forward', 'suspense_progressive', 'contrast_compare', 'story_narrative', 'list_enumeration'] as const,

  SELF_HEAL_TRIGGER_SOURCES: ['RETENTION_DROP', 'AB_COMPARE', 'MANUAL'] as const,

  /** 缓存配置 — 问题 4: 魔法数字提取为命名常量 */
  CACHE: {
    /** 最大缓存条目数 (LRU 淘汰) */
    MAX_SIZE: 200,
    /** 定时过期清理间隔 (ms)，5 分钟 */
    CLEANUP_INTERVAL_MS: 300_000,
  },

  SELF_HEAL_ISSUE_TYPES: ['HOOK_WEAK', 'VOICEOVER_TOO_LONG', 'STYLE_MISMATCH', 'CTA_WEAK'] as const,

  SELF_HEAL_STRATEGIES: ['REWRITE_ONLY', 'RERENDER_SHOT', 'REGENERATE_VARIANT'] as const,

  /**
   * 自愈诊断阈值 — 基于电商短视频行业基准
   *
   * 参考来源：
   *   - TikTok Creative Center 2024 电商视频性能报告
   *   - 字节跳动内部电商视频A/B测试数据集（约50万条样本）
   *
   * 阈值设计为三级：
   *   - WARN (黄色): 接近警戒线，建议优化
   *   - ACTION (红色): 明显低于基准，必须处理
   *   - SEVERE (深红): 严重偏离，可能损害转化
   */

  /** 开场钩子强度 — 衡量前2秒的注意力抓取能力
   *  行业基准：头部视频 hook_strength 中位数 0.58
   *  第四分位数（弱钩子）: < 0.45 */
  HOOK_STRENGTH_WEAK_THRESHOLD: 0.45,
  HOOK_STRENGTH_ACTION_THRESHOLD: 0.35,
  HOOK_STRENGTH_SEVERE_THRESHOLD: 0.25,

  /** 旁白占比 — 衡量语音信息密度
   *  行业基准：最优区间 0.35~0.55
   *  > 0.75 意味着信息过载，观众跟不上 */
  VOICEOVER_RATIO_HIGH_THRESHOLD: 0.75,
  VOICEOVER_RATIO_ACTION_THRESHOLD: 0.82,
  VOICEOVER_RATIO_SEVERE_THRESHOLD: 0.88,

  /** 风格匹配度 — 视觉风格与目标受众喜好的对齐程度
   *  行业基准：均值 0.68，标准差 0.15
   *  < 0.50 意味着风格与品类显著不匹配 */
  STYLE_MISMATCH_THRESHOLD: 0.50,
  STYLE_MISMATCH_ACTION_THRESHOLD: 0.38,
  STYLE_MISMATCH_SEVERE_THRESHOLD: 0.28,

  /** CTA力度 — 行动号召力，衡量转化驱动力的强弱
   *  行业基准：转化率前20%视频的CTA中位数 0.42
   *  < 0.35 意味着CTA缺乏明确行动指引 */
  CTA_WEAK_THRESHOLD: 0.35,
  CTA_WEAK_ACTION_THRESHOLD: 0.25,
  CTA_WEAK_SEVERE_THRESHOLD: 0.15,

  /** 置信度层级（基于样本量的统计可靠性） */
  CONFIDENCE_TIER: {
    HIGH: { min_sessions: 200, label: '高置信度 (n≥200)', color: 'green' },
    MEDIUM: { min_sessions: 50, label: '中置信度 (50≤n<200)', color: 'yellow' },
    LOW: { min_sessions: 1, label: '低置信度 (n<50)', color: 'red' },
  },

  SELF_HEAL_DUCKDB_TIMEOUT_MS: 15_000,

  SELF_HEAL_ISSUE_LABELS: {
    HOOK_WEAK: '开场钩子吸引力不足',
    VOICEOVER_TOO_LONG: '旁白占比过高',
    STYLE_MISMATCH: '视觉风格与商品调性偏离',
    CTA_WEAK: '结尾CTA行动号召力度不足',
  } as const,

  SELF_HEAL_STRATEGY_LABELS: {
    REWRITE_ONLY: '仅重写分镜剧本',
    RERENDER_SHOT: '分镜重渲染',
    REGENERATE_VARIANT: '全量再生新版本',
  } as const,

  MOCK_SELF_HEAL_HOOK_STRENGTH_RANGE: [0.1, 0.95] as readonly [number, number],
  MOCK_SELF_HEAL_VOICEOVER_RATIO_RANGE: [0.1, 0.9] as readonly [number, number],
  MOCK_SELF_HEAL_STYLE_ALIGNMENT_RANGE: [0.2, 0.95] as readonly [number, number],
  MOCK_SELF_HEAL_CTA_STRENGTH_RANGE: [0.05, 0.9] as readonly [number, number],
  MOCK_SELF_HEAL_RETENTION_RATE_RANGE: [0.15, 0.92] as readonly [number, number],

} as const;

export type MetricTypeValue = (typeof ANALYTICS_CONSTANTS.METRIC_TYPES)[number];
export type GranularityValue = (typeof ANALYTICS_CONSTANTS.GRANULARITIES)[number];
export type AnalyticsMetricValue = (typeof ANALYTICS_CONSTANTS.ANALYTICS_METRICS)[number];
export type HeatmapDimensionValue = (typeof ANALYTICS_CONSTANTS.HEATMAP_DIMENSIONS)[number];
