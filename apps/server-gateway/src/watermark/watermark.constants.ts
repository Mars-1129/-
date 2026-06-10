// =============================================================================
// TikStream AI — Watermark Constants (Server side)
// =============================================================================

export const WATERMARK_CONSTANTS = {
  ALLOWED_WATERMARK_TYPES: ['visible', 'invisible', 'both'] as const,

  ALLOWED_POSITIONS: [
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ] as const,

  ALLOWED_TECHNIQUES: ['metadata', 'steganography'] as const,

  /** 水印文字最大长度 */
  MAX_CONTENT_LENGTH: 128,

  /** 透传 payload 最大长度 */
  MAX_PAYLOAD_LENGTH: 256,

  /** 版权持有人最大长度 */
  MAX_HOLDER_LENGTH: 128,

  /** 版权类型最大长度 */
  MAX_LICENSE_LENGTH: 64,

  /** 水印配置存储 TTL（秒）— 与 Creation 绑定，不限时 */
  CONFIG_TTL_SECONDS: 0,

  ERROR_MESSAGES: {
    WATERMARK_CONFIG_INVALID: '水印配置无效',
    WATERMARK_APPLY_FAILED: '水印应用失败',
    WATERMARK_VERIFY_FAILED: '水印验证失败',
    CREATION_NOT_FOUND: '创作不存在',
    CREATION_NOT_COMPLETED: '创作尚未完成',
  },
} as const;
