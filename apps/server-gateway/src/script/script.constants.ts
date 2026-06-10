// =============================================================================
// TikStream AI — Script Module Constants
// =============================================================================

export const SCRIPT_CONSTANTS = {
  // Video duration constraints
  MAX_VIDEO_DURATION_SECONDS: 15.0,
  MIN_SHOT_DURATION_SECONDS: 1.5,
  MAX_SHOT_DURATION_SECONDS: 5.0,

  // Shot count constraints
  MIN_SHOTS_COUNT: 4,
  MAX_SHOTS_COUNT: 6,

  // JSON Patch whitelist roots (文档 9.4 节)
  PATCH_ALLOWED_ROOT_PATHS: [
    '/title',
    '/language',
    '/target_audience',
    '/style_vibe',
    '/constraint_list',
  ] as const,

  PATCH_ALLOWED_SHOT_FIELDS: [
    'duration',
    'scene_description_query',
    'visual_description',
    'camera_movement',
    'transition_type',
    'voiceover_text',
    'subtitle_text',
    'safe_zone_bounding_box',
    'selected_slice_id',
    'render_prompt',
    'local_factor_patch',
  ] as const,

  // Default values
  DEFAULT_LANGUAGE: 'zh-CN',
  DEFAULT_ASPECT_RATIO: '9:16',

  // Copy Preference Alignment (FR-9)
  PREFERENCE_TYPES: ['WINNER', 'LOSER'] as const,
  PREFERENCE_MAX_PAIRS: 5,
  PREFERENCE_EXAMPLE_MAX_LENGTH: 300,

  // Camera movement allowed values
  CAMERA_MOVEMENTS: ['Static', 'Dolly_In_Fast', 'Dolly_Out', 'Pan_Left', 'Tilt_Up'] as const,

  // Transition type allowed values
  TRANSITION_TYPES: ['None', 'Cut', 'Fade_In', 'Dissolve', 'Wipe'] as const,

  // Transition type aliases — normalize LLM common outputs to valid enum values
  TRANSITION_ALIASES: {
    'Cut': 'Cut' as const,
    'Crossfade': 'Dissolve' as const,
    'Cross_Fade': 'Dissolve' as const,
    'CrossFade': 'Dissolve' as const,
    'Fade': 'Fade_In' as const,
    'FadeOut': 'Fade_In' as const,
    'Hard_Cut': 'Cut' as const,
    'HardCut': 'Cut' as const,
    'Normal': 'None' as const,
  } as Record<string, string>,

  // Compliance rules - Absolute terms
  ABSOLUTE_TERMS: [
    { pattern: /最好/g, reason: '绝对化用语"最好"不可用于广告文案' },
    { pattern: /第一/g, reason: '绝对化用语"第一"须有客观数据支撑' },
    { pattern: /全网/g, reason: '绝对化用语"全网"属于夸大宣传' },
    { pattern: /唯一/g, reason: '绝对化用语"唯一"不可使用' },
    { pattern: /顶级/g, reason: '绝对化用语"顶级"不可用于广告文案' },
    { pattern: /最高/g, reason: '绝对化用语"最高"须有客观数据支撑' },
    { pattern: /永久/g, reason: '绝对化用语"永久"不可用于普通消费品' },
    { pattern: /万能/g, reason: '绝对化用语"万能"属于夸大宣传' },
  ],

  // Compliance rules - Prohibited promotions
  PROHIBITED_PROMOTIONS: [
    { pattern: /免费送/g, reason: '禁止性促销表达"免费送"' },
    { pattern: /点击领取/g, reason: '禁止性CTA表达"点击领取"' },
    { pattern: /限时抢购/g, reason: '禁止性紧迫感表达"限时抢购"（TikTok Shop 官方口径）' },
    { pattern: /马上抢/g, reason: '禁止性紧迫感表达"马上抢"' },
  ],

  // Required shot fields for validation
  REQUIRED_SHOT_FIELDS: [
    'shot_index',
    'duration',
    'scene_description_query',
    'visual_description',
    'camera_movement',
    'transition_type',
    'voiceover_text',
    'subtitle_text',
    'safe_zone_bounding_box',
  ],

  // Error messages
  ERROR_MESSAGES: {
    PRODUCT_ID_REQUIRED: 'product_id 为必填字段',
    PRODUCT_NOT_FOUND: '商品不存在',
    VIRAL_VIDEO_ANALYSIS_NOT_FOUND: '爆款视频分析不存在',
    VIRAL_ANALYSIS_NOT_PUBLIC: '爆款视频未声明为公开来源或拆解数据不完整',
    TEMPLATE_NOT_FOUND: '模板不存在',
    TEMPLATE_NOT_ACTIVE: '模板状态非 ACTIVATED，不可用于生成',
    TEMPLATE_FACTOR_EMPTY: '模板策略数据不完整，因子配置或策略摘要为空',
    SCRIPT_NOT_FOUND: '剧本不存在',
    SCRIPT_PARSE_FAILED: 'AI 返回内容无法解析为 JSON',
    SCRIPT_NO_SHOTS_GENERATED: 'AI 未生成任何有效分镜',
    SCRIPT_SCHEMA_INVALID: '剧本 Schema 校验失败',
    SCRIPT_DURATION_EXCEEDED: '分镜或总时长超出约束范围',
    COMPLIANCE_CHECK_FAILED: '合规词法拦截未通过',
    MODEL_PROVIDER_FAILED: 'AI 模型服务不可用',
    TIMING_ESTIMATION_FAILED: '台词时长估算失败',
    INVALID_VOICEOVER_TEXT: '台词文本为空但分镜有时长',
    INTERNAL_ERROR: '内部服务器错误',
  },

  // Safe zone bounding box defaults
  DEFAULT_SAFE_ZONE: [0.1, 0.72, 0.9, 0.9] as readonly [number, number, number, number],
  SAFE_ZONE_RANGE: { min: 0, max: 1, exclusive: true } as const,

  // Fallback script generation defaults
  FALLBACK_SCRIPT: {
    VIDEO_DURATION: 15,
    SHOT_DURATIONS: [3, 3.5, 3.5, 3, 2] as readonly number[],
    SAFE_ZONE_ALT: [0.08, 0.7, 0.92, 0.88] as readonly [number, number, number, number],
    SAFE_ZONE_3: [0.05, 0.68, 0.95, 0.92] as readonly [number, number, number, number],
    SAFE_ZONE_4: [0.1, 0.74, 0.9, 0.92] as readonly [number, number, number, number],
    SAFE_ZONE_5: [0.15, 0.75, 0.85, 0.9] as readonly [number, number, number, number],
  } as const,

  // 请求超时配置
  REQUEST_TIMEOUT: {
    DOUBAO_API_MS: 30_000,
    SCRIPT_GENERATION_MS: 120_000,
    COMPLIANCE_CHECK_MS: 15_000,
    PREFERENCE_VALIDATION_MS: 10_000,
    BATCH_GENERATION_MS: 180_000,
  } as const,

  // API Rate Limits
  RATE_LIMIT: {
    DOUBAO_TEXT_RPM: (() => {
      const parsed = parseInt(process.env.DOUBAO_RPM || '80', 10);
      return Number.isNaN(parsed) ? 80 : parsed;
    })(),
    RETRY_DELAY_MS: 2000,
    MAX_RETRY_ATTEMPTS: 3,
    TIMEOUT_MS: 180_000,  // 180 秒 — LLM DNA提取/趋势分析需要 60-120 秒，预留足够时间
  },

  // Generation modes
  GENERATION_MODES: ['PROMPT_DRIVEN', 'VIRAL_REWRITE', 'TEMPLATE_DRIVEN', 'BATCH', 'COMPOSED', 'HYBRID'] as const,

  // Aspect ratios
  ASPECT_RATIOS: ['9:16', '16:9'] as const,

  // Timing validation constants (音节配时校验)
  TIMING: {
    CHINESE_ESTIMATE_RATIO: 0.35,
    ENGLISH_ESTIMATE_RATIO: 0.25,
    SAFETY_MARGIN_RATIO: 0.95,
    MIN_SHOT_DURATION: 1.5,
    MAX_SHOT_DURATION: 5.0,
    MAX_VIDEO_DURATION: 15.0,
  },

  VIRAL_REWRITE: {
    MAX_REFERENCE_FACTOR_COUNT: 6,
    PROMPT_TOKEN_BUDGET: 8192,
    MAX_STRATEGY_JSON_DEPTH: 3,
    MIN_FACTOR_KEYS: 1,
    REQUIRED_ANALYSIS_FIELDS: ['strategy_json', 'factor_json'] as const,
  },

  TEMPLATE: {
    MAX_FACTOR_KEYS: 6,
    PROMPT_TOKEN_BUDGET: 8192,
    FACTOR_PRIORITY: [
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
    REQUIRED_TEMPLATE_FIELDS: ['strategy_summary', 'factor_json'] as const,
    MIN_FACTOR_KEYS: 1,
  },
};

export const SCRIPT_CONSTRAINTS = {
  SHOT_DURATION_MIN_SEC: SCRIPT_CONSTANTS.MIN_SHOT_DURATION_SECONDS,
  SHOT_DURATION_MAX_SEC: SCRIPT_CONSTANTS.MAX_SHOT_DURATION_SECONDS,
  TITLE_MAX_LENGTH: 200,
} as const;

export const VALID_CAMERA_MOVEMENTS = SCRIPT_CONSTANTS.CAMERA_MOVEMENTS;
export const VALID_TRANSITION_TYPES = SCRIPT_CONSTANTS.TRANSITION_TYPES;

export type CameraMovementType = typeof SCRIPT_CONSTANTS.CAMERA_MOVEMENTS[number];
export type TransitionType = typeof SCRIPT_CONSTANTS.TRANSITION_TYPES[number];
export type AspectRatioType = typeof SCRIPT_CONSTANTS.ASPECT_RATIOS[number];
export type GenerationModeType = typeof SCRIPT_CONSTANTS.GENERATION_MODES[number];

export interface TimingViolation {
  shot_index: number;
  reason: string;
  estimated_duration: number;
  max_allowed: number;
}

export interface TimingValidationResult {
  valid: boolean;
  violations: TimingViolation[];
}
