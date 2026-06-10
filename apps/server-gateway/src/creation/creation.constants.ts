// =============================================================================
// TikStream AI — Creation Module Constants
// =============================================================================

import { CreationStage, CreationStatus } from '@tikstream/shared-types';

export const CREATION_CONSTANTS = {
  CREATION_STATUSES: ['PENDING', 'PROCESSING', 'FINISHED', 'FAILED', 'CANCELED'] as const,

  CREATION_STAGES: [
    'QUEUE_ALLOCATION',
    'ASSET_MATCHING',
    'AI_VIDEO_GENERATING',
    'TTS_GENERATING',
    'FFMPEG_STITCHING',
    'LOUDNORM_COMPLIANCE',
    'FINISHED',
    'FAILED',
  ] as const,

  VALID_CREATION_STATUSES: new Set<CreationStatus>([
    'PENDING',
    'PROCESSING',
    'FINISHED',
    'FAILED',
    'CANCELED',
  ]),

  VALID_CREATION_STAGES: new Set<CreationStage>([
    'QUEUE_ALLOCATION',
    'ASSET_MATCHING',
    'AI_VIDEO_GENERATING',
    'TTS_GENERATING',
    'FFMPEG_STITCHING',
    'LOUDNORM_COMPLIANCE',
    'FINISHED',
    'FAILED',
  ]),

  DEFAULT_ENGINE_MODE: 'SCRIPT_DRIVEN' as const,

  VALID_ENGINE_MODES: ['SCRIPT_DRIVEN', 'IMAGE_DRIVEN', 'PROMPT_DRIVEN'] as const,

  DEFAULT_TARGET_RESOLUTION: '1080x1920' as const,

  VALID_TARGET_RESOLUTIONS: ['1080x1920', '1920x1080', '720x1280'] as const,

  DEFAULT_EXPORT_FORMAT: 'MP4' as const,

  VALID_EXPORT_FORMATS: ['MP4', 'MOV', 'WEBM'] as const,

  DEFAULT_VOICE_PROFILE: 'zh-CN-female-optimized' as const,

  DEFAULT_BGM_POLICY: 'auto' as const,

  VALID_BGM_POLICIES: ['auto', 'auto_match', 'none', 'custom'] as const,

  DEFAULT_TARGET_LANGUAGE: 'zh-CN' as const,

  TRANSLATION_SYSTEM_PROMPT: (langName: string, targetLang: string): string =>
    `你是一名专业电商翻译。将用户输入的中文文案翻译成${langName}（语种代码：${targetLang}）。
翻译要求：
1. 保持原文的营销调性和感染力
2. 翻译自然流畅，符合母语者表达习惯
3. 仅返回翻译后的文本，不要添加任何解释或前缀`,

  SLICE_MATCH_SCORE_THRESHOLD: 0.3,

  MAX_SHOTS_PER_CREATION: 30,

  // 字段长度限制
  MAX_VOICE_PROFILE_LENGTH: 100,
  MAX_BGM_POLICY_LENGTH: 20,
  MAX_PRODUCT_URL_LENGTH: 2048,
  MAX_PRODUCT_TITLE_LENGTH: 500,
  MAX_PRODUCT_CATEGORY_LENGTH: 100,
  MAX_STYLE_VIBE_LENGTH: 100,
  MAX_ASPECT_RATIO_LENGTH: 20,
  MAX_REMARK_LENGTH: 500,
  MAX_KEYWORD_EXTRACTION_TEXT_LENGTH: 10000,

  SUPPORTED_TARGET_LANGUAGES: ['zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'th-TH', 'id-ID', 'es-ES'] as const,

  MIN_SHOT_DURATION_SECONDS: 1.5,

  MAX_SHOT_DURATION_SECONDS: 5.0,

  MAX_VIDEO_DURATION_SECONDS: 15.0,

  INITIAL_PROGRESS: 0,

  INITIAL_STATUS: 'PENDING' as CreationStatus,

  INITIAL_STAGE: 'QUEUE_ALLOCATION' as CreationStage,

  TASK_ID_PREFIX: 'tsk',

  TRACE_ID_PREFIX: 'trc',

  TASK_ID_SEQ_PADDING: 6,

  TASK_ID_SEQ_MODULO: 1000000,

  REDIS_SEQ_KEY_PREFIX: 'tikstream:creation:seq',

  REDIS_SEQ_KEY_TTL_SECONDS: 172800,

  SHOT_RENDER_STATUS_INITIAL: 'PENDING' as const,

  SHOT_RENDER_RETRY_COUNT_INITIAL: 0,

  UUID_V4_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i as RegExp,

  CANCELABLE_STATUSES: new Set<CreationStatus>(['PENDING', 'PROCESSING']),

  NON_CANCELABLE_REASONS: {
    FINISHED: '创作任务已完成，无法取消',
    FAILED: '创作任务已失败，无需取消，请使用重试接口',
    CANCELED: '创作任务已经被取消，无需重复操作',
  } as const,

  ERROR_MESSAGES: {
    PRODUCT_NOT_FOUND: '商品不存在',
    SCRIPT_NOT_FOUND: '剧本不存在',
    CREATION_SCRIPT_PRODUCT_MISMATCH: (scriptId: string, productId: string): string =>
      `剧本不属于指定商品 (script_id=${scriptId}, product_id=${productId})`,
    SCRIPT_NO_SHOTS_GENERATED: '剧本未包含任何分镜',
    IDEMPOTENCY_CONFLICT: '创作任务已存在，task_id 重复',
    INTERNAL_SERVER_ERROR: '内部服务器错误',
    BULLMQ_ENQUEUE_FAILED: '任务队列入队失败',
    PRISMA_CONNECTION_ERROR: '数据库连接异常',
    PRISMA_FOREIGN_KEY_ERROR: '外键约束失败，关联记录不存在',
    PRISMA_RECORD_NOT_FOUND: '关联记录不存在',
    PRODUCT_ID_INVALID: '商品ID无效',
    SCRIPT_ID_INVALID: '剧本ID无效',
    CREATION_NOT_FOUND: (creationId: string): string =>
      `创作任务不存在 (creation_id=${creationId})`,
    CREATION_ID_INVALID: '创作任务ID无效',
    CREATION_ID_NOT_UUID: (creationId: string): string =>
      `创作任务ID不是有效的UUID v4格式: ${creationId}`,
    CREATION_CANCEL_CONFLICT: (status: string): string =>
      `创作任务状态 ${status} 不允许取消，仅 PENDING 或 PROCESSING 状态可取消`,
    BULLMQ_JOB_NOT_FOUND: (taskId: string): string =>
      `BullMQ 任务 ${taskId} 不在队列中 (可能已完成或被移除)`,
    EXPORT_NOT_ALLOWED: '创作任务未完成，无法导出视频',
  },

  PRISMA_ERROR_CODES: {
    UNIQUE_CONSTRAINT: 'P2002',
    FOREIGN_KEY_CONSTRAINT: 'P2003',
    RECORD_NOT_FOUND: 'P2025',
    CONNECTION_REFUSED: 'P1001',
    CONNECTION_CLOSED: 'P1017',
    CONNECTION_POOL_EXHAUSTED: 'P2024',
    TRANSACTION_TIMEOUT: 'P2028',
  } as const,

  RETRYABLE_PRISMA_CODES: new Set<string>([
    'P2003',
    'P2025',
    'P1001',
    'P1017',
    'P2024',
    'P2028',
  ]),

  CREATION_LIST_DEFAULTS: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    DEFAULT_SORT_BY: 'created_at' as const,
    DEFAULT_SORT_ORDER: 'DESC' as const,
    LIST_ITEM_FIELD_COUNT: 19,
  },

  CREATION_LIST_ERROR_MESSAGES: {
    PRODUCT_ID_REQUIRED: 'product_id 为必填字段，上下文隔离边界不可为空',
    LIMIT_OUT_OF_RANGE: (max: number, received: unknown): string =>
      `limit 必须为 1~${max} 的正整数，当前为 ${received}`,
    STATUS_INVALID: (received: string): string =>
      `status 无效: ${received}，允许值: PENDING/PROCESSING/FINISHED/FAILED/CANCELED`,
    CURRENT_STAGE_INVALID: (received: string): string =>
      `current_stage 无效: ${received}`,
    ENGINE_MODE_INVALID: (received: string): string =>
      `engine_mode 无效: ${received}，允许值: SCRIPT_DRIVEN/IMAGE_DRIVEN/PROMPT_DRIVEN`,
    EXPORT_FORMAT_INVALID: (received: string): string =>
      `export_format 无效: ${received}，允许值: MP4/MOV/WEBM`,
    CURSOR_DECODE_FAILED: '游标解码失败，已退化为首页查询',
  },

  /** BullMQ 队列配置（从 services/queue/ 提取，消除跨 src 目录导入） */
  QUEUE: {
    CREATION_QUEUE: process.env.CREATION_QUEUE_NAME || 'tikstream:creation-queue',
    CREATION_JOB_NAME: process.env.CREATION_JOB_NAME || 'creation-job',
  },

  /** 卡住检测阈值（毫秒），便于根据环境调优 */
  STUCK_DETECTION: {
    STUCK_THRESHOLD_MS: 120_000,
    AUTO_FAIL_THRESHOLD_MS: 300_000,
    LOUDNORM_STUCK_THRESHOLD_MS: 180_000,
    LOUDNORM_AUTO_FAIL_MS: 600_000,
  },

  /** validateCreationCancelable 状态→原因文案映射 */
  NON_CANCELABLE_STATUS_REASONS: {
    FINISHED: '创作任务已完成，无法取消',
    FAILED: '创作任务已失败，无需取消，请使用重试接口',
    CANCELED: '创作任务已经被取消，无需重复操作',
    UNKNOWN: '当前创作任务状态不允许取消',
  } as Record<string, string>,
} as const;
