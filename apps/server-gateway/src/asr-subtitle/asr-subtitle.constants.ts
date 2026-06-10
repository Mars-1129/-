// =============================================================================
// TikStream AI — ASR 字幕自动时间轴 - 常量
// =============================================================================

export const ASR_SUBTITLE_CONSTANTS = {
  /** 对齐算法选择 */
  ALIGNMENT_ALGORITHM: 'smith-waterman' as const,

  /** 字符对齐匹配得分 */
  ALIGNMENT_SCORES: {
    match: 2,
    mismatch: -1,
    gap: -1,
  },

  /** 最小对齐置信度 (低于此值使用分镜时长兜底) */
  MIN_ALIGNMENT_CONFIDENCE: 0.5,

  /** 每句字幕最大字符数 (超出则拆分) */
  MAX_CHARS_PER_SUBTITLE: 40,

  /** 字幕最小显示时长 (秒) */
  MIN_DISPLAY_DURATION: 0.5,

  /** 字幕最大显示时长 (秒) */
  MAX_DISPLAY_DURATION: 10.0,

  /** TTS 语速估算: 中文 (字/秒) */
  TTS_SPEED_CN: 4.5,

  /** TTS 语速估算: 英文 (词/秒) */
  TTS_SPEED_EN: 3.5,

  /** ASS 字幕样式 */
  ASS_STYLES: {
    font_name: 'Arial',
    font_size: 48,
    primary_color: '&H00FFFFFF',
    outline_color: '&H00000000',
    back_color: '&H80000000',
    bold: 1,
    alignment: 2,  // 底部居中
    margin_v: 40,
  },
} as const;

/** 支持标点恢复的语言 */
export const PUNCTUATION_SUPPORTED_LANGUAGES = ['zh', 'zh-CN', 'zh-TW', 'en', 'en-US'] as const;

/** 分词器类型 */
export type TokenizerType = 'char' | 'word' | 'jieba';
