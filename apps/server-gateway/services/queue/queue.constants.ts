export const QUEUE_CONSTANTS = {
  GPU_SLICING_QUEUE: 'gpu-slicing',

  SLICING_JOB_NAME: 'slice',

  CREATION_QUEUE: 'creation',

  CREATION_JOB_NAME: 'compose-video',

  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  REDIS_DB: Number(process.env.REDIS_QUEUE_DB || 1),

  REDIS_CONNECTION_NAME: 'tikstream-queue-connection',

  JOB_ATTEMPTS: 3,
  JOB_BACKOFF_DELAY_MS: 5000,
  JOB_REMOVE_ON_COMPLETE_AGE_SECONDS: 86400,
  JOB_REMOVE_ON_FAIL_AGE_SECONDS: 604800,

  AUTOCUT_QUEUE: 'autocut',
  AUTOCUT_JOB_NAME_TRANSCRIBE: 'autocut-transcribe',
  AUTOCUT_JOB_NAME_CUT: 'autocut-cut',
} as const;
