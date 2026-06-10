// =============================================================================
// TikStream AI — Viral Video Analysis Module Constants
// =============================================================================

export const VIRAL_ANALYSIS_CONSTANTS = {
  ALLOWED_PLATFORMS: [
    'tiktok',
    'youtube',
    'instagram',
    'facebook',
    'other',
  ] as const,

  MAX_URL_LENGTH: 2000,

  PLATFORM_VIDEO_ID_PATTERNS: {
    tiktok: /\/video\/(\d+)/,
    youtube: /[?&]v=([a-zA-Z0-9_-]{11})/,
    instagram: /\/(?:reel|p|tv)\/([a-zA-Z0-9_-]+)/,
    facebook: /\/videos\/(\d+)/,
  } as const,

  ERROR_MESSAGES: {
    SOURCE_URL_REQUIRED: 'source_url 为必填字段',
    SOURCE_URL_INVALID: 'source_url 格式不合法，必须为 http/https 开头的合法 URL',
    SOURCE_URL_TOO_LONG: 'source_url 长度超出上限',
    SOURCE_PLATFORM_REQUIRED: 'source_platform 为必填字段',
    SOURCE_PLATFORM_INVALID: 'source_platform 不在允许的平台范围内',
    ANALYSIS_ID_REQUIRED: 'analysis_id 为必填字段',
    ANALYSIS_DUPLICATE: '该平台下的同源视频已存在拆解记录',
    ANALYSIS_NOT_FOUND: '爆款视频分析记录不存在',
    PRODUCT_ID_INVALID_FORMAT: 'product_id 格式非法',
    SEARCH_KEYWORD_TOO_SHORT: '搜索关键词至少需要 2 个字符',
    MATERIAL_NOT_FOUND: '指定的素材不存在',
    MATERIAL_NOT_VIDEO: '指定的素材不是视频类型',
    MATERIAL_HAS_NO_THUMBNAIL: '指定素材没有可用的缩略图',
    CONTENT_DUPLICATE_DETECTED: '检测到可能的内容重复',
    ANALYSIS_IN_PROGRESS: '视频分析正在进行中',
    ANALYSIS_ALREADY_COMPLETE: '该分析已完成，无需重复分析',
    SELF_UPLOADED_NOT_REMIXABLE: '自有上传视频的结构化分析结果不可用于爆款仿写/混剪，仅可供研究参考',
    SHOTS_DECOMPOSITION_INVALID: '分镜拆解结果不合法，至少需要 1 个分镜',
    SUGGEST_KEYWORDS_CATEGORY_REQUIRED: 'product_category 和 product_title 至少需要提供一个',
  },

  /** 分镜拆解最少数量 */
  SHOT_MIN_COUNT: 1,
};

export type AllowedPlatformType = (typeof VIRAL_ANALYSIS_CONSTANTS.ALLOWED_PLATFORMS)[number];
