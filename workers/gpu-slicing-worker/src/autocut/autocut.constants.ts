// ============================================================================
// AutoCut — 语音驱动智能剪辑常量
// ============================================================================

import { resolve } from 'node:path';

export const AUTOCUT_CONSTANTS = {
  QUEUE_NAME: 'autocut',
  JOB_NAME_TRANSCRIBE: 'autocut-transcribe',
  JOB_NAME_CUT: 'autocut-cut',
  CONCURRENCY: 1,

  AUTOCUT_OUTPUT_PREFIX: 'autocut-outputs',

  // Python 脚本
  SPEECH_SLICER_SCRIPT: resolve(__dirname, '../../python_scripts/speech_slicer.py'),
  SPEECH_SLICER_TIMEOUT_MS: 180_000,

  // FFmpeg 剪切拼接
  FFMPEG_CUT_TIMEOUT_MS: 60_000,
  FFMPEG_CONCAT_TIMEOUT_MS: 120_000,

  // 回调
  CALLBACK_BASE_URL: process.env.GATEWAY_BASE_URL || 'http://localhost:3000',
  CALLBACK_TRANSCRIPT_READY_PATH: '/api/internal/v1/autocut/transcript-ready',
  CALLBACK_CUT_COMPLETE_PATH: '/api/internal/v1/autocut/cut-complete',
  CALLBACK_JOB_FAILED_PATH: '/api/internal/v1/autocut/job-failed',
  CALLBACK_TIMEOUT_MS: 10_000,
  CALLBACK_MAX_RETRIES: 3,

  // 进度阶段
  PROGRESS_STAGES: {
    STARTING: 0,
    DOWNLOADING: 5,
    AUDIO_EXTRACTING: 10,
    TRANSCRIBING: 30,
    TRANSCRIPTION_DONE: 80,
    CUTTING: 85,
    CONCATENATING: 90,
    UPLOADING: 95,
    COMPLETED: 100,
  },
} as const;
