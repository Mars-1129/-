// =============================================================================
// TikStream AI — Factor Module Constants
// =============================================================================

export const FACTOR_CONSTANTS = {
  /** 叙事层阶段类型 */
  STAGE_TYPES: [
    'opening',
    'hook_body',
    'product_showcase',
    'social_proof',
    'cta_closing',
  ] as const,

  /** 预置叙事因子 key */
  BUILTIN_NARRATIVE_FACTOR_KEYS: [
    'opening',
    'hook_body',
    'product_showcase',
    'social_proof',
    'cta_closing',
  ] as const,

  /** 预置参数因子 key */
  BUILTIN_PARAMETER_FACTOR_KEYS: [
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

  /** 预置指令因子 key */
  BUILTIN_INSTRUCTION_FACTOR_KEYS: [
    'opening_instruction',
    'closing_instruction',
    'visual_focus_instruction',
    'voiceover_tone_instruction',
    'bgm_atmosphere_instruction',
    'product_display_instruction',
    'pacing_rhythm_instruction',
    'subtitle_style_instruction',
    'transition_style_instruction',
  ] as const,

  /** 允许的因子类别 */
  ALLOWED_CATEGORIES: ['NARRATIVE', 'PARAMETER', 'INSTRUCTION'] as const,

  /** 允许的叙事阶段子键（stage_factors 的子键，默认子键，同时允许自定义子键） */
  ALLOWED_STAGE_FACTOR_SUBKEYS: [
    'music_style',
    'visual_style',
    'pacing',
    'text_overlay',
    'transition',
    'voiceover_tone',
    'emotional_tone',
    'hook_mechanism',
  ] as const,

  ERROR_MESSAGES: {
    FACTOR_KEY_REQUIRED: '因子 key 为必填字段',
    FACTOR_KEY_TOO_LONG: '因子 key 长度超出上限 80',
    FACTOR_KEY_DUPLICATE: '因子 key 已存在',
    FACTOR_NAME_REQUIRED: '因子名称为必填字段',
    FACTOR_NAME_TOO_LONG: '因子名称长度超出上限 120',
    FACTOR_CATEGORY_INVALID: '因子类别不在允许范围内（NARRATIVE / PARAMETER / INSTRUCTION）',
    FACTOR_NOT_FOUND: '因子不存在',
    FACTOR_IS_BUILTIN: '内置因子不可修改',
    TEMPLATE_NOT_FOUND: '模板不存在',
    FACTOR_ASSIGN_VALUE_REQUIRED: '每个分配项必须包含 factor_id 和 value',
  },
};
