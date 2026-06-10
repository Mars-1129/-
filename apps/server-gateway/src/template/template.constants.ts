// =============================================================================
// TikStream AI — Template Module Constants
// =============================================================================

export const TEMPLATE_CONSTANTS = {
  ALLOWED_CATEGORIES: [
    'promo',
    'unboxing',
    'tutorial',
    'review',
    'story',
    'comparison',
    'custom',
  ] as const,

  TEMPLATE_STATUSES: ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const,

  ALLOWED_STATUS_TRANSITIONS: {
    ACTIVE: ['INACTIVE', 'ARCHIVED'],
    INACTIVE: ['ACTIVE', 'ARCHIVED'],
    ARCHIVED: ['ACTIVE'],
  } as const,

  STAGE_TYPES: [
    'opening',
    'hook_body',
    'product_showcase',
    'social_proof',
    'cta_closing',
  ] as const,

  FACTOR_PRIORITY: [
    'stage_factors',
    'optimal_shot_count',
    'optimal_total_duration',
    'camera_patterns',
    'transition_preference',
    'bgm_style',
    'cta_placement',
    'hook_style',
    'narrative_tone',
    'caption_density',
  ] as const,

  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  MIN_NAME_LENGTH: 1,
  MAX_NAME_LENGTH: 120,

  MAX_STRATEGY_SUMMARY_LENGTH: 5000,

  ERROR_MESSAGES: {
    TEMPLATE_NAME_DUPLICATE: '同名模板已存在',
    TEMPLATE_NAME_EMPTY: '模板名称不可为空',
    TEMPLATE_NAME_TOO_LONG: '模板名称长度超出上限 120',
    TEMPLATE_CATEGORY_EMPTY: '模板分类不可为空',
    TEMPLATE_CATEGORY_INVALID: '模板分类不在允许范围内',
    TEMPLATE_FACTOR_STRUCTURE_INVALID:
      '策略因子配置结构不合法，须为非空 JSON 对象',
    TEMPLATE_FACTOR_NULL_VALUE: '因子键的值不可为 null/undefined',
    TEMPLATE_FACTOR_NO_KNOWN_KEY: '因子配置不含任何已知因子键',
    TEMPLATE_FACTOR_CUSTOM_KEY_WARNING: '因子配置包含自定义键（非预置因子），将通过因子库扩展',
    TEMPLATE_STATUS_IMMUTABLE: '已归档模板不可修改或套用',
    TEMPLATE_STATUS_INVALID: '无效的模板状态',
    TEMPLATE_STATUS_TRANSITION_INVALID: '不允许的状态转换',
    TEMPLATE_STRATEGY_SUMMARY_EMPTY: '策略摘要不可为空',
    TEMPLATE_NOT_FOUND: '模板不存在',
    TEMPLATE_SCHEMA_INVALID: '模板结构定义 schema_json 须为合法 JSON 对象',
    TEMPLATE_ID_REQUIRED: 'template_id 为必填字段',
    PAGE_INVALID: 'page 必须为正整数',
    PAGE_SIZE_INVALID: 'page_size 必须在 1-100 之间',
  },
};

export type AllowedCategoryType = (typeof TEMPLATE_CONSTANTS.ALLOWED_CATEGORIES)[number];
export type TemplateStatusType = (typeof TEMPLATE_CONSTANTS.TEMPLATE_STATUSES)[number];
export type StageType = (typeof TEMPLATE_CONSTANTS.STAGE_TYPES)[number];
export type FactorPriorityType = (typeof TEMPLATE_CONSTANTS.FACTOR_PRIORITY)[number];
