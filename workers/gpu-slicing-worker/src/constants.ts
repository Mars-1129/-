import { resolve } from 'node:path';
import { loadWorkspaceEnv } from './workspace-root';

// 确保 .env 在常量求值前加载（解决 ESM import hoisting 问题）
loadWorkspaceEnv();

export const SLICING_CONSTANTS = {
  SLICE_MIN_DURATION_SEC: 1.5,
  SLICE_MAX_DURATION_SEC: 4.0,
  SLICE_TARGET_DURATION_SEC: 3.0,
  SCENE_CUT_TOLERANCE_SEC: 0.3,
  MAX_VIDEO_DURATION_SEC: 300,

  QUEUE_NAME: 'gpu-slicing',
  JOB_NAME: 'slice',

  WORKER_PORT: Number(process.env.GPU_SLICING_WORKER_PORT) || 3101,
  CONCURRENCY: 1,

  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  REDIS_DB: Number(process.env.REDIS_QUEUE_DB) || 1,
  REDIS_URL: process.env.REDIS_URL || '',

  FFMPEG_CUT_TIMEOUT_MS: 30_000,
  FFMPEG_NORMALIZE_TIMEOUT_MS: 180_000,
  FFMPEG_KEYFRAME_TIMEOUT_MS: 10_000,
  FFMPEG_VIDEO_CODEC: 'libx264',
  FFMPEG_CRF: 18,

  PYTHON_INTERPRETER: process.env.PYTHON_INTERPRETER || (process.platform === 'win32' ? 'python' : 'python3'),
  PYTHON_SCRIPT_TIMEOUT_MS: 120_000,
  PYTHON_SCRIPT_PATH: resolve(__dirname, '../python_scripts/scene_detector.py'),

  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'localhost',
  MINIO_PORT: Number(process.env.MINIO_PORT) || 9000,
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || 'tikstream_minio',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || 'tikstream_minio_password',
  MINIO_SSL: process.env.MINIO_SSL === 'true',
  MINIO_BUCKET: process.env.MINIO_BUCKET || 'tikstream-assets',
  MINIO_DOWNLOAD_TIMEOUT_MS: 120_000,
  MINIO_UPLOAD_TIMEOUT_MS: 60_000,
  MINIO_UPLOAD_MAX_RETRIES: 3,
  MINIO_UPLOAD_RETRY_BASE_DELAY_MS: 1000,

  DOUBAO_API_URL:
    process.env.VOLC_ARK_API_URL ||
    process.env.DOUBAO_API_URL ||
    'https://api.siliconflow.cn/v1/chat/completions',
  DOUBAO_API_KEY:
    process.env.SILICONFLOW_API_KEY ||
    process.env.VOLC_ARK_API_KEY ||
    process.env.DOUBAO_API_KEY ||
    '',
  DOUBAO_MODEL: process.env.VOLC_ARK_DOUBAO_PRO_ENDPOINT || process.env.SILICONFLOW_VISION_MODEL || 'Qwen/Qwen3-VL-32B-Instruct',
  DOUBAO_MAX_TOKENS: 2048,
  DOUBAO_TEMPERATURE: 0.7,
  DOUBAO_TOP_P: 0.9,
  DOUBAO_TIMEOUT_MS: 30_000,
  DOUBAO_RPM: 50,
  DOUBAO_MAX_RETRIES: 2,
  DOUBAO_RETRY_BASE_DELAY_MS: 2000,

  GATEWAY_BASE_URL: process.env.GATEWAY_BASE_URL || 'http://localhost:3000',
  GATEWAY_SLICE_CALLBACK_PATH: '/api/internal/v1/materials/slice-callback',
  GATEWAY_JOB_FAILURE_CALLBACK_PATH: '/api/internal/v1/materials/job-failure',
  GATEWAY_MATERIAL_FETCH_PATH: (materialId: string) =>
    `/api/internal/v1/materials/${materialId}`,
  GATEWAY_TIMEOUT_MS: 10_000,
  CALLBACK_MAX_RETRIES: 3,
  CALLBACK_RETRY_BASE_DELAY_MS: 500,

  JOB_TOTAL_TIMEOUT_MS: 600_000,

  PROGRESS_STAGES: {
    DOWNLOADING: 5,
    DOWNLOADED: 12,
    YOLO_CROPPING: 13,
    NORMALIZED: 15,
    SCENE_DETECTION: 30,
    BOUNDARY_OPTIMIZED: 35,
    FFMPEG_SLICING: 55,
    KEYFRAME_EXTRACTED: 60,
    CAPTIONING_BASE: 60,
    CAPTIONING_RANGE: 30,
    CALLBACK_SYNC: 95,
    COMPLETED: 100,
  },

  YOLO_MODEL_PATH: process.env.YOLO_MODEL_PATH || 'yolov8n.pt',
  YOLO_TARGET_RATIO: 9 / 16, // 竖版 9:16
  YOLO_SAMPLE_INTERVAL: 30,
  YOLO_MIN_CONFIDENCE: 0.3,

  TEMP_DIR_PREFIX: 'tikstream-slice',
} as const;

export const ERROR_MESSAGES = {
  PYTHON_NOT_FOUND: 'Python binary not found or not executable',
  DECORD_IMPORT_FAILED: 'decord python module not installed',
  TRANSNET_IMPORT_FAILED: 'transnetv2 python module not installed',
  FFMPEG_NOT_FOUND: 'ffmpeg binary not found or not executable',
  FFMPEG_SCENE_DETECTION_FAILED: 'FFmpeg scdet scene detection failed',
  DOUBAO_API_KEY_MISSING: 'VOLC_ARK_API_KEY environment variable is required',
  MATERIAL_FETCH_FAILED: 'Failed to fetch material data from gateway',
  MINIO_DOWNLOAD_FAILED: 'Failed to download source video from MinIO',
  MINIO_EMPTY_BUFFER: 'Downloaded video buffer is empty',
  DECORD_DECODE_FAILED: 'Video scene detection failed (ffprobe or decode error)',
  TRANSNET_CUDA_OOM: 'TransNetV2 ran out of GPU memory',
  TRANSNET_INFERENCE_FAILED: 'TransNetV2 inference failed',
  FFMPEG_CUT_FAILED: 'FFmpeg video slicing failed',
  FFMPEG_KEYFRAME_FAILED: 'FFmpeg keyframe extraction failed',
  CAPTION_API_EMPTY_RESPONSE: 'Doubao caption API returned empty response',
  CAPTION_PARSE_FAILED: 'Failed to parse Doubao caption API response',
  CAPTION_API_FAILED: 'Doubao caption API call failed',
  CALLBACK_FAILED: 'Slice status callback to gateway failed',
  NO_VALID_SLICES: 'No valid slice segments produced',
  JOB_TIMEOUT: 'Job exceeded maximum execution time',
  VRAM_EXCEEDED: 'GPU VRAM usage exceeded safety threshold',
} as const;
