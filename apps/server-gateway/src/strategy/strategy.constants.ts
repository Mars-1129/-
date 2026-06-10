// =============================================================================
// TikStream AI — Strategy Module Constants
// =============================================================================

export const STRATEGY_CONSTANTS = {
  /** 预置策略 key */
  BUILTIN_STRATEGY_KEYS: [
    'first_person_immersion',
    'suspense_reveal',
    'rapid_cut_sensory',
    'storytelling_journey',
    'urgency_conversion',
  ] as const,

  /** 允许的策略类别 */
  ALLOWED_CATEGORIES: ['creative', 'narrative', 'conversion', 'branding'] as const,

  ERROR_MESSAGES: {
    STRATEGY_KEY_DUPLICATE: '策略 key 已存在',
    STRATEGY_NOT_FOUND: '策略不存在',
    STRATEGY_IS_BUILTIN: '内置策略不可修改',
    STRATEGY_KEY_REQUIRED: '策略 key 为必填字段',
    STRATEGY_NAME_REQUIRED: '策略名称为必填字段',
    STRATEGY_SUMMARY_REQUIRED: '策略摘要不可为空',
    CATEGORY_INVALID: '策略类别不在允许范围内',
    TEMPLATE_NOT_FOUND: '模板不存在',
  },
};
