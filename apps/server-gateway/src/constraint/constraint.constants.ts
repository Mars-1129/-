// =============================================================================
// TikStream AI — Constraint Module Constants
// =============================================================================

export const CONSTRAINT_CONSTANTS = {
  ALLOWED_CATEGORIES: ['compliance', 'creative', 'branding', 'platform'] as const,
  ALLOWED_RULE_TYPES: ['HARD', 'SOFT'] as const,

  ERROR_MESSAGES: {
    CONSTRAINT_KEY_DUPLICATE: '约束 key 已存在',
    CONSTRAINT_NOT_FOUND: '约束不存在',
    CONSTRAINT_IS_BUILTIN: '内置约束不可修改',
    CONSTRAINT_KEY_REQUIRED: '约束 key 为必填字段',
    CONSTRAINT_NAME_REQUIRED: '约束名称为必填字段',
    CONSTRAINT_RULE_TYPE_INVALID: '规则类型不在允许范围内（HARD/SOFT）',
    CONSTRAINT_RULE_CONFIG_REQUIRED: '规则配置为必填字段',
    CATEGORY_INVALID: '约束类别不在允许范围内',
  },
};
