const CONTROL_CHARACTER_RANGE = `${String.fromCharCode(0)}-${String.fromCharCode(31)}`;

export const MATERIAL_CONSTANTS = {
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'] as const,

  IMAGE_MAX_BYTES: 10 * 1024 * 1024,
  VIDEO_MAX_BYTES: 200 * 1024 * 1024,
  REFERENCE_MAX_BYTES: 50 * 1024 * 1024,

  SLICE_MIN_DURATION_SECONDS: 1.5,
  SLICE_MAX_DURATION_SECONDS: 4.0,
  SLICE_TARGET_DURATION_SECONDS: 3.0,

  MAX_VIDEO_DURATION_SECONDS: 15.0,

  BATCH_UPLOAD_MAX_FILES: 10,

  FRONTEND_CHUNK_SIZE_BYTES: 5 * 1024 * 1024,
  FRONTEND_CONCURRENT_UPLOAD_LIMIT: 3,

  MATERIAL_TYPES: ['IMAGE', 'VIDEO', 'PRODUCT_MAIN_IMAGE'] as const,
  IMAGE_LIKE_TYPES: ['IMAGE', 'PRODUCT_MAIN_IMAGE'] as const,
  VIDEO_TYPES: ['VIDEO'] as const,
  MATERIAL_SOURCE_TYPES: ['UPLOAD', 'REFERENCE', 'GENERATED'] as const,
  REFERENCE_CATEGORIES: ['COMPETITOR_IMAGE', 'COMPETITOR_VIDEO', 'INSPIRATION', 'BENCHMARK'] as const,
  MATERIAL_STATUSES: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const,
  MATERIAL_SLICE_STATUSES: ['PENDING', 'CAPTIONING', 'EMBEDDING', 'COMPLETED', 'FAILED'] as const,

  THUMBNAIL_WIDTH: 360,
  THUMBNAIL_HEIGHT: 640,

  MINIO_RETRY_MAX_ATTEMPTS: 3,
  MINIO_RETRY_BASE_DELAY_MS: 1000,

  FFMPEG_PROBE_TIMEOUT_MS: 30_000,

  SLICE_ID_PREFIX: 'slc',

  OBJECT_KEY_PREFIX: 'materials',

  THUMBNAIL_EXTENSION: 'webp',

  CHARACTER_FILTER_REGEX: new RegExp(`[<>:"/\\\\|?*${CONTROL_CHARACTER_RANGE}]`, 'g'),
  EXTRA_CHARACTER_FILTER_REGEX: new RegExp("[#%&{}\\]\\[$@!`'=+~,\\s]+", 'g'),
  MULTI_UNDERSCORE_REGEX: /_+/g,
  LEADING_TRAILING_UNDERSCORE_REGEX: /^_|_$/g,

  ERROR_MESSAGES: {
    MATERIAL_FILE_MISSING: '未提供素材文件',
    FILE_FORMAT_NOT_SUPPORTED: '不支持的文件格式',
    FILE_SIZE_EXCEEDED: '文件大小超出上限',
    PRODUCT_NOT_FOUND: '商品不存在',
    OBJECT_STORAGE_WRITE_FAILED: '对象存储写入失败',
    INTERNAL_SERVER_ERROR: '内部服务器错误',
    MATERIAL_SLICE_COMPUTE_FAILED: '视频切片边界预计算失败',
    MIME_TYPE_MISMATCH: 'MIME 类型与声明类型不一致',
    INVALID_CURSOR_SORT_FIELD_MISMATCH: '游标排序字段与当前查询不匹配',
    INVALID_TIME_RANGE: '起始时间不能晚于截止时间',
    INVALID_ISO8601_FORMAT: '时间格式必须为 ISO8601',
  },

  MATERIAL_LIST_DEFAULTS: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    SORTABLE_FIELDS: ['created_at', 'file_size_bytes', 'duration_seconds'] as const,
    SORT_ORDERS: ['ASC', 'DESC'] as const,
    DEFAULT_SORT_BY: 'created_at' as const,
    DEFAULT_SORT_ORDER: 'DESC' as const,
  },

  /** 问题 5: 分片上传临时文件孤儿清理配置 */
  CHUNK: {
    /** 定时扫描间隔 (ms)，30 分钟 */
    CLEANUP_INTERVAL_MS: 30 * 60 * 1000,
    /** 超过此阈值的孤儿目录视为可清理 (ms)，1 小时 */
    ORPHAN_THRESHOLD_MS: 60 * 60 * 1000,
    /** 每次最多清理的孤儿目录数 */
    MAX_CLEANUP_PER_RUN: 50,
  },

  /** RRF（倒数排序融合）平滑常数 K，论文建议值 60 */
  RRF_FUSION_K: 60,
} as const;

export type AllowedMimeType = typeof MATERIAL_CONSTANTS.ALLOWED_MIME_TYPES[number];
export type MaterialTypeEnum = typeof MATERIAL_CONSTANTS.MATERIAL_TYPES[number];
export type ImageLikeTypeEnum = typeof MATERIAL_CONSTANTS.IMAGE_LIKE_TYPES[number];
export type VideoTypeEnum = typeof MATERIAL_CONSTANTS.VIDEO_TYPES[number];
export type MaterialSourceTypeEnum = typeof MATERIAL_CONSTANTS.MATERIAL_SOURCE_TYPES[number];
export type ReferenceCategoryEnum = typeof MATERIAL_CONSTANTS.REFERENCE_CATEGORIES[number];
export type MaterialStatusEnum = typeof MATERIAL_CONSTANTS.MATERIAL_STATUSES[number];
export type MaterialSliceStatusEnum = typeof MATERIAL_CONSTANTS.MATERIAL_SLICE_STATUSES[number];
