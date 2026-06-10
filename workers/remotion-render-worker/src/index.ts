import { loadWorkspaceEnv } from './workspace-root';

loadWorkspaceEnv();

import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, stat, copyFile, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { basename, resolve, sep, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import {
  seedanceApiCallsTotal,
  seedanceApiErrorsTotal,
  ttsGenerateDurationSeconds,
  ffmpegStitchDurationSeconds,
  creationJobsTotal,
  creationStageCurrent,
  getMetrics,
} from './prometheus-metrics';

import { DoubaoSeedanceClient, getSeedanceClient, SeedanceGenerateOptions } from './doubao-seedance-client';
import { TtsService, getTtsService, LANGUAGE_DEFAULT_VOICE, TTS_VOICES } from './tts-service';
import { BgmService, getBgmService } from './bgm-service';
import { FfmpegStitchService, getStitchService, SubtitleEntry, VoiceEnhancementConfig } from './ffmpeg-stitch-service';
import { resolveVideoToLocalPath, trimVideoToDuration } from './media-resolver';
import { applyOriginalityOptimizations } from './originality-optimizer';

const seedanceInterShotDelayMs = Number(process.env.SEEDANCE_INTER_SHOT_DELAY_MS || 3000);
const seedanceShotMaxRetries = Number(process.env.SEEDANCE_SHOT_MAX_RETRIES || 3);

const execFileAsync = promisify(execFile);
const port = Number(process.env.REMOTION_RENDER_WORKER_PORT || 3102);
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisPassword = process.env.REDIS_PASSWORD || undefined;
const redisDb = Number(process.env.REDIS_QUEUE_DB || 1);
const queueName = 'creation';
const gatewayBaseUrl = (process.env.GATEWAY_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const publicBaseUrl = (process.env.REMOTION_RENDER_PUBLIC_BASE_URL || 'http://localhost:3102').replace(/\/$/, '');
const artifactRoot = resolve(process.env.REMOTION_RENDER_ARTIFACT_DIR || '/tmp/tikstream-artifacts');
const creationWorkerConcurrency = Number(process.env.CREATION_WORKER_CONCURRENCY || 1);
const internalApiToken = process.env.INTERNAL_API_TOKEN || '';

type Status = 'ok' | 'error';
type CreationStage =
  | 'QUEUE_ALLOCATION'
  | 'ASSET_MATCHING'
  | 'AI_VIDEO_GENERATING'
  | 'TTS_GENERATING'
  | 'FFMPEG_STITCHING'
  | 'LOUDNORM_COMPLIANCE'
  | 'ORIGINALITY_CHECK'
  | 'ORIGINALITY_OPTIMIZE'
  | 'FINISHED'
  | 'FAILED';

type CreationJobPayload = {
  creation_id: string;
  task_id: string;
  product_id: string;
  script_id: string;
  trace_id: string;
  voice_profile: string;
  bgm_policy: string;
  force_refresh: boolean;
  target_resolution?: string;
  /** 风格调性（来自剧本 style_vibe，用于 BGM 智能匹配） */
  style_vibe?: string;
  /** 剧本标题 */
  script_title?: string;
  /** 目标配音语种（如 ja-JP / ko-KR 等，默认 zh-CN） */
  target_language?: string;
  /** ASR 语音识别语言（如 zh / en / ja 等） */
  asr_language?: string;
  /** restitch 模式：跳过 AI 生成 + TTS，直接 FFmpeg 拼接已缓存的 shot 视频 */
  restitch_only?: boolean;
  /** restitch 模式下各分镜的已渲染视频路径 */
  restitch_render_paths?: Array<{ shot_index: number; render_path: string }>;
  /** 导出格式: mp4 / mov / webm（默认 mp4） */
  export_format?: string;
  /** 逐镜 BGM 配置（从剧本 bgm_segment 传递） */
  bgm_segments?: Array<{
    shot_index: number;
    style: string;
    energy_level: 'low' | 'mid' | 'high';
    beat_pattern: string;
  }>;
  /** 仅渲染指定分镜索引的列表（单分镜重渲染场景）；不传则渲染全部 */
  rerender_shot_indices?: number[];
  /** 水印配置 */
  watermark?: {
    enabled: boolean;
    type: 'visible' | 'invisible' | 'both';
    visible?: { content: string; logo_url?: string; position: string; opacity: number; font_size: number; include_timestamp: boolean; include_user_id: boolean };
    invisible?: { technique: 'metadata' | 'steganography'; robustness: 'basic'; payload: string };
    copyright?: { holder: string; license_type: string; attribution_required: boolean; copyright_year: number };
  };
  /** 重试时已完成的 shot_index 列表（checkpoint 模式），Worker 跳过这些分镜的 AI 生成，直接复用已有视频 */
  retry_completed_shot_indices?: number[];
  /** checkpoint 模式下已完成分镜的视频文件信息，用于复用已有视频 */
  retry_completed_shot_videos?: Array<{ shot_index: number; render_path: string }>;
  /** 分镜数据（可选，用于真实渲染） */
  shots?: Array<{
    shot_id: string;
    shot_index: number;
    duration: number;
    visual_description?: string;
    voiceover?: string;
    /** 字幕文本（独立于旁白，用于烧录到视频） */
    subtitle_text?: string;
    voice_profile?: string;
    image_url?: string;
    /** 剧本描述文本 */
    script?: string;
    /** 场景描述 */
    scene_description?: string;
    selected_slice_id?: string;
    selected_slice_url?: string;
    /** YOLO 主体检测裁切区域（归一化到原始视频坐标），用于 9:16 自适应裁切 */
    crop_region?: { x: number; y: number; width: number; height: number };
    scene_description_query?: string;
    /** 运镜类型 */
    camera_movement?: string;
    /** 转场类型 */
    transition_type?: string;
  }>;
  /** 语音增强配置（降噪/压缩/清晰度/齿音消除） */
  voice_enhancement?: VoiceEnhancementConfig;
  /** 音频混音控制配置 */
  audio_mix_config?: {
    keep_original_video_audio: boolean;
    enable_tts_voiceover: boolean;
    enable_bgm: boolean;
    bgm_volume: number;
    voiceover_volume: number;
  };
};

type WorkerHealth = {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  worker: 'remotion-render-worker';
  dependencies: {
    redis: Status;
    bullmq: Status;
    chromium: Status;
    ffmpeg: Status;
  };
  queues: {
    creation_waiting: number;
    creation_active: number;
    creation_completed: number;
    creation_failed: number;
  };
};

const stagePlan: Array<{ current_stage: Exclude<CreationStage, 'QUEUE_ALLOCATION' | 'FINISHED' | 'FAILED'>; progress: number; message: string; delayMs: number }> = [
  // Stage transitions are now handled by processCreationJob directly
  // This plan is kept for backward compatibility
];

function createRedisConnection(): Redis {
  return new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    db: redisDb,
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
  });
}

function withCors(headers: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    ...headers,
  };
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, withCors({ 'Content-Type': 'application/json; charset=utf-8' }));
  response.end(JSON.stringify(body));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

type CreationShotPayload = NonNullable<CreationJobPayload['shots']>[number];

/** 根据 shot 的 voice_profile、payload 的 target_language 解析最终使用的 TTS 音色 ID */
function resolveVoiceForShot(shot: CreationShotPayload, payload: CreationJobPayload): string {
  // 如果 shot 明确指定了音色，优先使用
  if (shot.voice_profile && TTS_VOICES[shot.voice_profile]) {
    return shot.voice_profile;
  }
  // 如果 payload 指定了目标语种，使用对应默认音色
  if (payload.target_language && LANGUAGE_DEFAULT_VOICE[payload.target_language]) {
    return LANGUAGE_DEFAULT_VOICE[payload.target_language];
  }
  // 回退到 payload 的 voice_profile 或默认中文女声
  return payload.voice_profile || 'zh-CN-female-optimized';
}

/** 将剧本分镜文案与检索 query 合并为 Seedance 提示词 */
function buildSeedancePrompt(shot: CreationShotPayload): string {
  const parts: string[] = [];
  if (shot.scene_description_query?.trim()) {
    parts.push(shot.scene_description_query.trim());
  }
  if (shot.visual_description?.trim()) {
    parts.push(shot.visual_description.trim());
  }
  if (shot.camera_movement?.trim() && shot.camera_movement !== 'None' && shot.camera_movement !== 'Static') {
    const movement = shot.camera_movement.replace(/_/g, ' ').toLowerCase();
    parts.push(`运镜: ${movement}`);
  }
  if (shot.voiceover?.trim()) {
    parts.push(`旁白语境: ${shot.voiceover.trim()}`);
  }
  if (parts.length === 0) {
    return '电商产品展示视频，流畅运镜，专业光影';
  }
  return parts.join('。');
}

async function generateShotVideoWithSeedance(
  shot: CreationShotPayload,
  seedanceClient: DoubaoSeedanceClient,
  shotIndex: number,
  totalShots: number,
  aspectRatio: '9:16' | '16:9' = '9:16',
): Promise<string> {
  const prompt = buildSeedancePrompt(shot);

  if (shot.image_url) {
    let seedanceResult = null;

    for (let attempt = 1; attempt <= seedanceShotMaxRetries; attempt++) {
      console.log(`[CreationJob] Shot ${shot.shot_id}: Seedance I2V attempt ${attempt}/${seedanceShotMaxRetries}`);
      seedanceApiCallsTotal.inc({ type: 'i2v', status: 'attempt' });
      seedanceResult = await seedanceClient.generate({
        imageUrl: shot.image_url,
        prompt,
        duration: shot.duration,
        aspectRatio,
      });

      if (seedanceResult.success && seedanceResult.videoUrl) {
        break;
      }

      const errMsg = seedanceResult.error || 'Unknown Seedance error';
      const isRateLimit = errMsg.includes('429') || errMsg.includes('RateLimit') || errMsg.includes('RPM');
      if (attempt < seedanceShotMaxRetries) {
        const delay = isRateLimit ? seedanceInterShotDelayMs * attempt : 2000;
        console.warn(
          `[CreationJob] Shot ${shot.shot_id}: I2V attempt ${attempt} failed (${errMsg}), waiting ${delay}ms before retry`,
        );
        await sleep(delay);
      }
    }

    if (seedanceResult?.success && seedanceResult.videoUrl) {
      const videoPath = await trimVideoToDuration(seedanceResult.videoUrl, shot.duration);
      console.log(
        `[CreationJob] Shot ${shot.shot_id}: Seedance I2V OK → ${videoPath} (trimmed to ${shot.duration}s)`,
      );
      return videoPath;
    }

    console.warn(
      `[CreationJob] Shot ${shot.shot_id}: I2V exhausted, trying T2V fallback with prompt: "${prompt.substring(0, 80)}..."`,
    );

    seedanceApiCallsTotal.inc({ type: 't2v_fallback', status: 'attempt' });
    const t2vResult = await seedanceClient.generateTextToVideo({
      prompt,
      duration: shot.duration,
      aspectRatio,
    });

    if (t2vResult.success && t2vResult.videoUrl) {
      const videoPath = await trimVideoToDuration(t2vResult.videoUrl, shot.duration);
      console.log(
        `[CreationJob] Shot ${shot.shot_id}: T2V fallback OK → ${videoPath} (trimmed to ${shot.duration}s)`,
      );
      return videoPath;
    }

    throw Object.assign(
      new Error(`Seedance I2V+T2V both failed: ${seedanceResult?.error || t2vResult.error || 'Unknown'}`),
      { errorCode: 'SEEDANCE_ALL_FAILED' },
    );
  }

  console.log(
    `[CreationJob] Shot ${shot.shot_id}: no base image, trying text-to-video`,
  );

  seedanceApiCallsTotal.inc({ type: 't2v', status: 'attempt' });
  const t2vResult = await seedanceClient.generateTextToVideo({
    prompt,
    duration: shot.duration,
    aspectRatio,
  });

  if (t2vResult.success && t2vResult.videoUrl) {
    const videoPath = await trimVideoToDuration(t2vResult.videoUrl, shot.duration);
    console.log(
      `[CreationJob] Shot ${shot.shot_id}: T2V OK → ${videoPath} (trimmed to ${shot.duration}s)`,
    );
    return videoPath;
  }

  throw Object.assign(
    new Error(`Seedance T2V failed: ${t2vResult.error || 'Unknown'} (no base image available for I2V)`),
    { errorCode: 'SEEDANCE_T2V_FAILED' },
  );
}

function sanitizeArtifactName(creationId: string): string {
  return `${creationId.replace(/[^a-zA-Z0-9._-]/g, '_')}.mp4`;
}

function escapeDrawText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function resolveArtifactPath(fileName: string): string {
  const safeName = basename(fileName);
  const resolved = resolve(artifactRoot, safeName);
  if (!resolved.startsWith(`${artifactRoot}${sep}`) && resolved !== artifactRoot) {
    throw new Error(`Invalid artifact path: ${fileName}`);
  }
  return resolved;
}

async function ensureArtifactRoot(): Promise<void> {
  await mkdir(artifactRoot, { recursive: true });
}

async function checkRedis(): Promise<Status> {
  const redis = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    db: redisDb,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000,
  });

  try {
    await redis.connect();
    const result = await redis.ping();
    return result === 'PONG' ? 'ok' : 'error';
  } catch {
    return 'error';
  } finally {
    redis.disconnect();
  }
}

async function checkBullMq(): Promise<{ status: Status; waiting: number; active: number; completed: number; failed: number }> {
  const connection = createRedisConnection();
  const queue = new Queue(queueName, { connection });

  try {
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
    return {
      status: 'ok',
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
    };
  } catch {
    return { status: 'error', waiting: 0, active: 0, completed: 0, failed: 0 };
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

async function checkCommand(command: string, args: string[]): Promise<Status> {
  try {
    await execFileAsync(command, args, { timeout: 3000 });
    return 'ok';
  } catch {
    return 'error';
  }
}

async function getHealth(): Promise<WorkerHealth> {
  const [redis, bullmq, chromium, ffmpeg] = await Promise.all([
    checkRedis(),
    checkBullMq(),
    checkCommand(process.env.CHROMIUM_BINARY || 'chromium', ['--version']),
    checkCommand('ffmpeg', ['-version']),
  ]);

  const statuses = [redis, bullmq.status, chromium, ffmpeg];
  const healthyCount = statuses.filter((status) => status === 'ok').length;

  return {
    status: healthyCount === statuses.length ? 'ok' : healthyCount === 0 ? 'down' : 'degraded',
    timestamp: new Date().toISOString(),
    worker: 'remotion-render-worker',
    dependencies: {
      redis,
      bullmq: bullmq.status,
      chromium,
      ffmpeg,
    },
    queues: {
      creation_waiting: bullmq.waiting,
      creation_active: bullmq.active,
      creation_completed: bullmq.completed,
      creation_failed: bullmq.failed,
    },
  };
}

const CALLBACK_TIMEOUT_MS = 15000;

async function postCallback(path: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS);
  try {
    const response = await fetch(`${gatewayBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(internalApiToken ? { 'x-internal-token': internalApiToken } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Callback ${path} failed: ${response.status} ${responseText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function emitStage(payload: CreationJobPayload, currentStage: CreationStage, progress: number, message: string): Promise<void> {
  creationStageCurrent.set({ stage: currentStage }, progress / 100);
  await postCallback('/api/internal/v1/creations/stage-callback', {
    task_id: payload.task_id,
    creation_id: payload.creation_id,
    current_stage: currentStage,
    progress,
    message,
    trace_id: payload.trace_id,
  });
}

async function emitExport(payload: CreationJobPayload, videoUrl: string, fileSizeBytes: number, durationSeconds: number): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await postCallback('/api/internal/v1/creations/export-callback', {
        task_id: payload.task_id,
        creation_id: payload.creation_id,
        video_url: videoUrl,
        file_size_bytes: fileSizeBytes,
        duration_seconds: durationSeconds,
        trace_id: payload.trace_id,
      });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < 5) {
        const delay = attempt * 5000;
        console.warn(`[CreationJob] emitExport attempt ${attempt}/5 failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

async function emitShotComplete(
  payload: CreationJobPayload,
  shotIndex: number,
  shotId: string,
  videoUrl: string,
  renderPath: string,
  durationSeconds: number,
  seedancePrompt?: string,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await postCallback('/api/internal/v1/creations/shot-completion-callback', {
        task_id: payload.task_id,
        creation_id: payload.creation_id,
        shot_index: shotIndex,
        shot_id: shotId,
        video_url: videoUrl,
        render_path: renderPath,
        source: 'RENDERED',
        duration_seconds: durationSeconds,
        trace_id: payload.trace_id,
        seedance_prompt: seedancePrompt || null,
      });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        const delay = attempt * 2000;
        console.warn(`[CreationJob] Shot ${shotIndex} completion callback attempt ${attempt} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`);
        await sleep(delay);
      }
    }
  }
  console.warn(`[CreationJob] Shot ${shotIndex} completion callback failed after 3 attempts: ${lastError instanceof Error ? (lastError as Error).message : String(lastError)}`);
}

async function emitFailure(payload: CreationJobPayload, errorCode: string, errorMessage: string): Promise<void> {
  await postCallback('/api/internal/v1/creations/failure-callback', {
    task_id: payload.task_id,
    creation_id: payload.creation_id,
    error_code: errorCode,
    error_message: errorMessage,
    current_stage: 'FAILED',
    trace_id: payload.trace_id,
  });
}

async function generateBuiltinBgmTrack(durationSeconds: number): Promise<string> {
  await ensureArtifactRoot();

  const fileName = `bgm-${randomUUID()}.mp3`;
  const filePath = resolveArtifactPath(fileName);
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=' + durationSeconds,
      '-filter:a', 'volume=0.12',
      '-q:a', '6',
      filePath,
    ],
    { timeout: 20000 },
  );

  return filePath;
}

async function renderPlaceholderArtifact(payload: CreationJobPayload): Promise<{ fileName: string; filePath: string; publicUrl: string; fileSizeBytes: number }> {
  await ensureArtifactRoot();

  const fileName = sanitizeArtifactName(payload.creation_id);
  const filePath = resolveArtifactPath(fileName);
  const titleText = escapeDrawText(`TikStream ${payload.creation_id.slice(0, 8)}`);
  const subtitleText = escapeDrawText('Local render fallback');
  const filter = [
    `drawtext=fontfile=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc:text='${titleText}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2-40`,
    `drawtext=fontfile=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc:text='${subtitleText}':fontcolor=0x9CA3AF:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2+36`,
  ].join(',');

  const resolution = payload.target_resolution || '1080x1920';

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=0x111827:s=${resolution}:d=15`,
      '-vf',
      filter,
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      filePath,
    ],
    { timeout: 120000 },
  );

  const fileInfo = await stat(filePath);
  return {
    fileName,
    filePath,
    publicUrl: `${publicBaseUrl}/artifacts/${fileName}`,
    fileSizeBytes: fileInfo.size,
  };
}

async function generatePlaceholderClip(durationSeconds: number, label: string): Promise<string> {
  await ensureArtifactRoot();
  const fileName = `placeholder_${randomUUID()}.mp4`;
  const filePath = resolveArtifactPath(fileName);
  const labelSafe = escapeDrawText(label || 'AI Generated');

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=0x1a1a2e:s=1080x1920:d=${durationSeconds}:r=30`,
      '-f', 'lavfi',
      '-i', `sine=frequency=440:sample_rate=44100:duration=${durationSeconds}`,
      '-vf', `drawtext=fontsize=32:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-20:text='\\''${labelSafe}'\\'',drawtext=fontsize=20:fontcolor=gray:x=(w-text_w)/2:y=(h-text_h)/2+20:text='Placeholder'`,
      '-c:v', 'libx264', '-crf', '28', '-preset', 'fast',
      '-c:a', 'aac', '-b:a', '64k',
      '-pix_fmt', 'yuv420p',
      '-shortest',
      filePath,
    ],
    { timeout: 30000 },
  );

  console.log(`[CreationJob] Placeholder clip generated: ${filePath} (${durationSeconds}s)`);
  return filePath;
}

async function processCreationJob(job: Job<CreationJobPayload>): Promise<{ video_url: string }> {
  const payload = job.data;

  const seedanceClient = getSeedanceClient();
  const ttsService = getTtsService();
  const bgmService = getBgmService();
  const stitchService = getStitchService();

  const errorLogs: Array<{ shot_id: string; stage: string; error: string; errorCode?: string }> = [];

  try {
    console.log(`[CreationJob] Starting: task_id=${payload.task_id} creation_id=${payload.creation_id}`);

    // 解析目标分辨率和宽高比
    const targetResolution = payload.target_resolution || '1080x1920';
    const aspectRatio = targetResolution.includes('1920x1080') ? '16:9' : '9:16';
    console.log(`[CreationJob] Target resolution: ${targetResolution}, aspectRatio: ${aspectRatio}`);

    await emitStage(payload, 'ASSET_MATCHING', 20, '正在匹配素材切片');

    const shots = payload.shots || [];
    console.log(`[CreationJob] Processing ${shots.length} shots`);

    // 确定需要渲染的分镜列表：重渲染模式仅处理指定索引，否则全量处理
    const rerenderIndices = payload.rerender_shot_indices;
    const isRerenderOnly = Array.isArray(rerenderIndices) && rerenderIndices.length > 0;
    const activeShots = isRerenderOnly
      ? shots.filter((s) => rerenderIndices.includes(s.shot_index))
      : shots;
    const activeCount = activeShots.length;
    const totalCount = shots.length;

    // checkpoint 模式：已完成的 shot_index 跳过 AI 生成，直接拼接
    const retryCompleted = Array.isArray(payload.retry_completed_shot_indices)
      ? new Set(payload.retry_completed_shot_indices)
      : new Set<number>();
    const isCheckpointMode = retryCompleted.size > 0;

    if (isRerenderOnly) {
      console.log(`[CreationJob] Rerender-only mode: indices=${JSON.stringify(rerenderIndices)} → ${activeCount} shot(s)`);
    }
    if (isCheckpointMode) {
      console.log(`[CreationJob] Checkpoint mode: skipping completed shots ${JSON.stringify([...retryCompleted])}`);
    }

    await emitStage(payload, 'AI_VIDEO_GENERATING', 55, `正在生成画面与转场 (0/${totalCount})`);

    const videoPaths: string[] = [];
    const voiceoverPaths: string[] = [];
    const subtitles: SubtitleEntry[] = [];
    // 旁白显式延迟与时长（与 voiceoverPaths 有效条目一一对应）
    let voiceoverDelays: number[] = [];
    let voiceoverDurations: number[] = [];
    let currentTime = 0;
    let artifact: { fileName: string; filePath: string; publicUrl: string; fileSizeBytes: number } | null = null;

    // === restitch_only 模式：跳过 AI 生成 + TTS，直接收集已有视频路径 ===
    if (payload.restitch_only) {
      const renderPathMap = new Map<number, string>();
      if (payload.restitch_render_paths) {
        for (const entry of payload.restitch_render_paths) {
          renderPathMap.set(entry.shot_index, entry.render_path);
        }
      }

      for (const shot of shots) {
        const dbShotIndex = shot.shot_index;
        const savedPath = renderPathMap.get(dbShotIndex) || shot.selected_slice_url;
        if (!savedPath) {
          console.error(`[CreationJob] Restitch: no render path for shot_index=${dbShotIndex}`);
          throw new Error(`Restitch failed: missing video for shot_index=${dbShotIndex}`);
        }
        try {
          const localPath = await resolveVideoToLocalPath(savedPath);
          videoPaths.push(localPath);
        } catch {
          videoPaths.push(savedPath);
        }

        // 字幕（来自 shot 数据，无需 TTS）
        const subtitleText = shot.subtitle_text?.trim() || shot.voiceover?.trim() || '';
        if (subtitleText) {
          subtitles.push({ start: currentTime, end: currentTime + shot.duration, text: subtitleText });
        }
        currentTime += shot.duration;
      }

      console.log(`[CreationJob] Restitch mode: ${videoPaths.length} shots, skipping AI/TTS → stitching directly`);
    } else {

    const shotResults: Array<{
      videoPath: string;
      voiceoverPath: string;
      subtitleEntry: SubtitleEntry | null;
      duration: number;
    }> = [];

    for (let activeIndex = 0; activeIndex < activeShots.length; activeIndex++) {
      const shot = activeShots[activeIndex];
      const dbShotIndex = shot.shot_index;
      let videoPath: string;
      let voiceoverPath = '';
      let subtitleEntry: SubtitleEntry | null = null;

      console.log(
        `[CreationJob] Shot ${shot.shot_id} (db_index=${dbShotIndex}): slice_id=${shot.selected_slice_id ?? 'none'} base_image=${shot.image_url ? 'yes' : 'no'} fallback_slice_video=${shot.selected_slice_url ? 'yes' : 'no'}${retryCompleted.has(dbShotIndex) ? ' [CHECKPOINT-SKIP]' : ''}`,
      );

      // === checkpoint 模式：已完成的 shot 跳过 AI 生成，复用已有视频 ===
      if (retryCompleted.has(dbShotIndex)) {
        const completedInfo = payload.retry_completed_shot_videos?.find(
          (v) => v.shot_index === dbShotIndex,
        );
        const savedRenderPath = completedInfo?.render_path;
        if (savedRenderPath) {
          // 尝试本地 artifact 目录查找
          const localPath = resolveArtifactPath(
            savedRenderPath.split('/').pop() || savedRenderPath.split('\\').pop() || savedRenderPath,
          );
          try {
            await access(localPath, constants.F_OK);
            videoPath = localPath;
            console.log(`[CreationJob] Shot ${shot.shot_id}: checkpoint reuse — local artifact found`);
          } catch {
            // 本地不存在，下载远程
            try {
              videoPath = await resolveVideoToLocalPath(
                savedRenderPath.startsWith('http')
                  ? savedRenderPath
                  : `${process.env.ARTIFACTS_BASE_URL || 'http://localhost:3102'}/artifacts/${savedRenderPath.split('/').pop()}`,
              );
              console.log(`[CreationJob] Shot ${shot.shot_id}: checkpoint reuse — downloaded from remote`);
            } catch (downloadErr) {
              console.warn(
                `[CreationJob] Shot ${shot.shot_id}: checkpoint video unavailable, generating fallback`,
              );
              videoPath = await resolveVideoToLocalPath('builtin://fallback_video');
            }
          }
        } else {
          console.warn(
            `[CreationJob] Shot ${shot.shot_id}: checkpoint no video path, generating fallback`,
          );
          videoPath = await resolveVideoToLocalPath('builtin://fallback_video');
        }
        shotResults.push({ videoPath, voiceoverPath, subtitleEntry: null, duration: shot.duration });
        continue;
      }

      // 发送每个分镜的"开始生成"消息，避免前端在 API 等待期间无反馈
      const shotStartProgress = 55 + Math.round((activeIndex / activeCount) * 17);
      await emitStage(
        payload,
        'AI_VIDEO_GENERATING',
        shotStartProgress,
        `正在生成第 ${activeIndex + 1}/${activeCount} 个画面与转场...`,
      );

      try {
        videoPath = await generateShotVideoWithSeedance(
          shot,
          seedanceClient,
          dbShotIndex,
          totalCount,
          aspectRatio,
        );
      } catch (seedanceError) {
        const errMsg = seedanceError instanceof Error ? seedanceError.message : String(seedanceError);
        const errCode = (seedanceError as { errorCode?: string }).errorCode || 'SEEDANCE_FAILED';
        console.error(`[CreationJob] Shot ${shot.shot_id}: AI video FAILED — ${errMsg}`);
        errorLogs.push({ shot_id: shot.shot_id, stage: 'AI_VIDEO_GENERATING', error: errMsg, errorCode: errCode });
        throw new Error(`Seedance generation failed for shot ${shot.shot_id}: ${errMsg}`);
      }

      if (shot.voiceover) {
        try {
          // 根据 target_language 自动选择对应语种音色
          const resolvedVoice = resolveVoiceForShot(shot, payload);
          const ttsEndTimer = ttsGenerateDurationSeconds.startTimer({ provider: resolvedVoice });
          const ttsResult = await ttsService.synthesize(
            shot.voiceover,
            resolvedVoice,
          );
          ttsEndTimer();

          if (ttsResult.success && ttsResult.audioUrl) {
            voiceoverPath = ttsResult.audioUrl;
            const estimatedDuration = ttsResult.duration || shot.duration;
            const subtitleText = shot.subtitle_text?.trim() || shot.voiceover.trim();
            subtitleEntry = {
              start: 0,
              end: estimatedDuration,
              text: subtitleText,
            };
            console.log(`[CreationJob] Shot ${shot.shot_id}: TTS OK, subtitle="${subtitleText.substring(0, 30)}..."`);
          } else {
            const errMsg = ttsResult.error || 'Unknown TTS error';
            console.error(`[CreationJob] Shot ${shot.shot_id}: TTS FAILED — ${errMsg}`);
            errorLogs.push({ shot_id: shot.shot_id, stage: 'TTS_GENERATING', error: errMsg, errorCode: 'TTS_FAILED' });
          }
        } catch (ttsError) {
          const errMsg = ttsError instanceof Error ? ttsError.message : String(ttsError);
          console.error(`[CreationJob] Shot ${shot.shot_id}: TTS exception — ${errMsg}`);
          errorLogs.push({ shot_id: shot.shot_id, stage: 'TTS_GENERATING', error: errMsg, errorCode: 'TTS_EXCEPTION' });
        }
      } else if (shot.subtitle_text?.trim()) {
        // 无旁白但有点字幕：仍生成字幕条目（用于纯画面+字幕的场景）
        subtitleEntry = {
          start: 0,
          end: shot.duration,
          text: shot.subtitle_text.trim(),
        };
      }

      shotResults.push({ videoPath, voiceoverPath, subtitleEntry, duration: shot.duration });

      // 每个分镜完成后：将视频复制到 artifact 目录，然后发送回调（供前端逐镜预览）
      const shotArtifactName = `shot_${payload.creation_id.slice(0, 8)}_${dbShotIndex}_${randomUUID()}.mp4`;
      const shotArtifactPath = resolveArtifactPath(shotArtifactName);
      const shotPublicUrl = `${publicBaseUrl}/artifacts/${shotArtifactName}`;
      const seedancePrompt = buildSeedancePrompt(shot);
      try {
        await copyFile(videoPath, shotArtifactPath);
        console.log(`[CreationJob] Shot ${shot.shot_id}: copied video to artifact ${shotArtifactName}`);
        // render_path 存本地文件路径，前端 toArtifactUrl 提取文件名走 Vite 代理 /artifacts/* → artifact server
        await emitShotComplete(payload, dbShotIndex, shot.shot_id, shotPublicUrl, shotArtifactPath, shot.duration, seedancePrompt);
      } catch (copyErr) {
        console.warn(`[CreationJob] Shot ${shot.shot_id}: failed to copy video to artifact dir, callback with original path: ${copyErr instanceof Error ? copyErr.message : String(copyErr)}`);
        // 兜底：artifact 目录写入失败时使用原始路径
        await emitShotComplete(payload, dbShotIndex, shot.shot_id, videoPath, videoPath, shot.duration, seedancePrompt);
      }

      // 每个分镜完成后更新进度
      const completedShots = activeIndex + 1;
      const aiProgress = 55 + Math.round((completedShots / activeCount) * 17);
      await emitStage(
        payload,
        'AI_VIDEO_GENERATING',
        aiProgress,
        `正在生成画面与转场 (${completedShots}/${activeCount})`,
      );

      if (activeIndex < activeShots.length - 1) {
        console.log(`[CreationJob] Waiting ${seedanceInterShotDelayMs}ms before next shot`);
        await sleep(seedanceInterShotDelayMs);
      }
    }

    if (errorLogs.length > 0) {
      console.warn(`[CreationJob] ${errorLogs.length} non-fatal issue(s): ${JSON.stringify(errorLogs)}`);
    }

    // === 重渲染模式：仅更新单分镜 render_path，跳过拼接与导出 ===
    if (isRerenderOnly) {
      console.log(`[CreationJob] Rerender-only complete: ${activeCount} shot(s) re-rendered, skipping stitch & export`);
      await emitStage(payload, 'FINISHED', 100, `分镜重渲染完成 (${activeCount} 个)`);
      return { video_url: shotResults[0]?.videoPath || '' };
    }

    for (const result of shotResults) {
      videoPaths.push(result.videoPath);
      voiceoverPaths.push(result.voiceoverPath);

      if (result.subtitleEntry) {
        // 使用分镜时长而非 TTS 估算时长，防止字幕溢出到下一分镜
        const subtitleDuration = result.subtitleEntry.end - result.subtitleEntry.start;
        const cappedDuration = Math.min(subtitleDuration, result.duration || subtitleDuration);
        subtitles.push({
          ...result.subtitleEntry,
          start: currentTime,
          end: currentTime + cappedDuration,
        });
      }

      currentTime += result.duration;
    }

    // 构建旁白显式延迟和时长（与 voiceoverPaths 有效条目一一对应），防止 TTS 音频超长或索引错位
    voiceoverDelays = [];
    voiceoverDurations = [];
    let cumDelay = 0;
    for (const result of shotResults) {
      if (result.voiceoverPath?.trim()) {
        voiceoverDelays.push(cumDelay);
        voiceoverDurations.push(result.duration);
      }
      cumDelay += result.duration;
    }
    } // end else (non-restitch_only AI generation block)

    if (!payload.restitch_only) {
      await emitStage(payload, 'TTS_GENERATING', 75, '正在生成旁白音频');
    }
    await emitStage(payload, 'FFMPEG_STITCHING', 85, payload.restitch_only ? '正在快速重新合成全片' : '正在拼接音视频轨道');

    // Per-shot BGM 优先
    let perShotBgmMood: string | undefined;
    if (payload.bgm_segments && payload.bgm_segments.length > 0) {
      const firstShotBgm = payload.bgm_segments.find(s => s.shot_index === 1) || payload.bgm_segments[0];
      console.log(`[CreationJob] Per-shot BGM detected: style=${firstShotBgm.style}, energy=${firstShotBgm.energy_level}, beat=${firstShotBgm.beat_pattern}`);
      console.log(`[CreationJob] BGM segments (${payload.bgm_segments.length} shots):`, JSON.stringify(payload.bgm_segments));
      perShotBgmMood = firstShotBgm.style;
    }

    const bgmResult = bgmService.select({
      policy: (payload.bgm_policy as 'auto' | 'upbeat' | 'calm' | 'dramatic' | 'none') || 'auto',
      styleVibe: perShotBgmMood || payload.style_vibe,
      videoDuration: Math.max(1, Math.round(currentTime || 15)),
    });

    let bgmPath: string | undefined;
    if (bgmResult.url) {
      if (bgmService.hasLocalBgmFile(bgmResult.url)) {
        bgmPath = bgmResult.url;
      } else if (bgmResult.url.startsWith('http://') || bgmResult.url.startsWith('https://')) {
        bgmPath = bgmResult.url;
      } else if (bgmResult.url.startsWith('builtin://')) {
        try {
          console.log(`[CreationJob] Generating builtin BGM track (${Math.round(currentTime)}s)...`);
          bgmPath = await generateBuiltinBgmTrack(Math.max(5, Math.round(currentTime)));
        } catch (bgmError) {
          console.warn(`[CreationJob] Builtin BGM generation failed: ${bgmError instanceof Error ? bgmError.message : String(bgmError)}`);
          errorLogs.push({ shot_id: 'BGM', stage: 'FFMPEG_STITCHING', error: 'BGM generation failed, continuing without BGM', errorCode: 'BGM_FAILED' });
        }
      }
    }

    console.log(`[CreationJob] BGM: ${bgmPath ? 'enabled' : 'disabled'}`);

    // 拼接前报告状态
    const statusMessage = `正在拼接（${videoPaths.length} 个视频片段）`;
    await emitStage(payload, 'FFMPEG_STITCHING', 92, statusMessage);

    console.log(`[CreationJob] Stitching ${videoPaths.length} clips (expected total: ${Math.round(currentTime)}s)...`);

    // === 分镜实际时长校验：探测每个分镜视频的真实时长，与预期时长对比 ===
    // 若差异 > 0.5s，记录告警并强制重新裁剪，防止拼接后总时长异常
    for (let vi = 0; vi < videoPaths.length; vi++) {
      try {
        const actualDuration = await stitchService.getDuration(videoPaths[vi]);
        if (actualDuration !== undefined) {
          const expectedShotDuration = vi < shots.length ? (shots[vi]?.duration ?? 0) : 0;
          if (expectedShotDuration > 0 && Math.abs(actualDuration - expectedShotDuration) > 0.5) {
            console.warn(
              `[CreationJob] Shot ${vi} duration mismatch: expected=${expectedShotDuration}s, actual=${actualDuration}s, re-trimming...`,
            );
            const { trimVideoToDuration } = await import('./media-resolver');
            try {
              videoPaths[vi] = await trimVideoToDuration(videoPaths[vi], expectedShotDuration);
              console.log(`[CreationJob] Shot ${vi} re-trimmed to ${expectedShotDuration}s`);
            } catch (trimErr) {
              console.warn(`[CreationJob] Shot ${vi} re-trim failed: ${(trimErr as Error).message}, keeping original`);
            }
          }
        }
      } catch (probeErr) {
        // ffprobe 可能因文件不存在/损坏而失败，不阻断流程
        console.warn(`[CreationJob] Shot ${vi} duration probe failed: ${(probeErr as Error).message}`);
      }
    }
    // =======================================================================

    // 构建转场配置（shots 间转场对应 videoPaths 相邻片段之间）
    const transitions = shots.length > 1
      ? shots.slice(0, -1).map((shot) => ({
          type: (shot.transition_type || 'None') as 'None' | 'Fade_In' | 'Dissolve' | 'Wipe',
          duration_sec: 0.5,
        }))
      : [];

    // 构建裁切区域数组（与 videoPaths 同顺序）
    const cropRegions = shots.map((shot) => {
      const cr = shot.crop_region;
      return cr ? { x: cr.x, y: cr.y, w: cr.width, h: cr.height } : undefined;
    });

    const stitchEndTimer = ffmpegStitchDurationSeconds.startTimer();
    const stitchResult = await stitchService.stitch({
      videoPaths,
      voiceoverPaths,
      voiceoverDelays,
      voiceoverDurations,
      bgmPath,
      bgmVolume: payload.audio_mix_config?.bgm_volume,
      voiceoverVolume: payload.audio_mix_config?.voiceover_volume,
      keepOriginalVideoAudio: payload.audio_mix_config?.keep_original_video_audio,
      enableTtsVoiceover: payload.audio_mix_config?.enable_tts_voiceover,
      enableBgm: payload.audio_mix_config?.enable_bgm,
      subtitles,
      transitions,
      resolution: targetResolution,
      format: payload.export_format || 'mp4',
      enableLoudnorm: true,
      cropRegions,
      voiceEnhancement: payload.voice_enhancement,
      expectedTotalDuration: currentTime > 0 ? currentTime : undefined,
    });
    stitchEndTimer();

    if (!stitchResult.success || !stitchResult.outputPath) {
      throw new Error(`FFmpeg stitch failed: ${stitchResult.error}`);
    }

    const fileName = basename(stitchResult.outputPath);
    artifact = {
      fileName,
      filePath: stitchResult.outputPath,
      publicUrl: `${publicBaseUrl}/artifacts/${fileName}`,
      fileSizeBytes: stitchResult.fileSize || 0,
    };

    // 原创度检测阶段：拼接完成后检查视频是否与已有素材高度相似
    await emitStage(payload, 'ORIGINALITY_CHECK', 93, '正在进行原创度检测...');

    try {
      const rawOriginalityResult = await postCallback('/api/internal/v1/creations/originality-check-callback', {
        task_id: payload.task_id,
        creation_id: payload.creation_id,
        video_description: payload.style_vibe || payload.script_title || `创作视频 ${payload.creation_id}`,
        scene_descriptions: payload.shots?.map((s) => s.script || s.scene_description || '').filter(Boolean) || [],
        trace_id: payload.trace_id,
      }) as unknown;
      const originalityResult = rawOriginalityResult as { data?: { passed: boolean; optimizer?: { optimization_suggestions?: Array<{ section: number; technique: string; expected_impact: number; description: string }> } } } | null;

      if (originalityResult?.data && !originalityResult.data.passed && originalityResult.data.optimizer) {
        const suggestions = originalityResult.data.optimizer.optimization_suggestions || [];
        if (suggestions.length > 0) {
          console.log(`[CreationJob] Originality check FAILED — ${suggestions.length} optimization suggestions`);
          await emitStage(payload, 'ORIGINALITY_OPTIMIZE', 94, `正在优化原创度 (${suggestions.length} 项建议)...`);

          const debugOptimize = process.env.ORIGINALITY_DEBUG_OPTIMIZE;
          if (debugOptimize === 'true') {
            const typedSuggestions = suggestions as Array<{
              section: number;
              technique: 'reorder' | 'recolor' | 'respeed' | 'revoice' | 'resubtitle';
              expected_impact: number;
              description: string;
            }>;
            const { optimizedPath, appliedCount, failedSuggestions } = await applyOriginalityOptimizations(
              stitchResult.outputPath,
              typedSuggestions,
            );
            console.log(`[CreationJob] Optimization applied: ${appliedCount}/${suggestions.length}, path=${optimizedPath}`);
            if (failedSuggestions.length > 0) {
              errorLogs.push({
                shot_id: 'OPTIMIZE',
                stage: 'ORIGINALITY_OPTIMIZE',
                error: `${failedSuggestions.length} optimization(s) failed: ${failedSuggestions.map((s) => s.technique).join(', ')}`,
                errorCode: 'OPTIMIZE_PARTIAL_FAILED',
              });
            }
            // 更新 artifact 为优化后的视频
            artifact = {
              fileName: basename(optimizedPath),
              filePath: optimizedPath,
              publicUrl: `${publicBaseUrl}/artifacts/${basename(optimizedPath)}`,
              fileSizeBytes: (await stat(optimizedPath)).size,
            };
          } else {
            console.log(
              `[CreationJob] Optimization suggestions received but ORIGINALITY_DEBUG_OPTIMIZE not set — ` +
              `skipping automatic re-stitch. Suggestions: ${JSON.stringify(suggestions.map((s) => s.technique))}`,
            );
          }

          await emitStage(payload, 'ORIGINALITY_OPTIMIZE', 95, '原创度优化完成');
        }
      } else {
        console.log(`[CreationJob] Originality check PASSED or bypassed`);
      }
    } catch (origErr) {
      const origMsg = origErr instanceof Error ? origErr.message : String(origErr);
      console.warn(`[CreationJob] Originality check failed (non-blocking): ${origMsg}`);
      errorLogs.push({ shot_id: 'ORIGINALITY', stage: 'ORIGINALITY_CHECK', error: origMsg, errorCode: 'ORIGINALITY_CHECK_FAILED' });
    }

    // ASR 字幕时间轴对齐阶段：对拼接后视频的音频做 ASR 转录，获取精确时间戳
    const enableAsrSubtitleAlign = process.env.ASR_SUBTITLE_ALIGN === 'true';
    if (enableAsrSubtitleAlign && stitchResult.outputPath) {
      try {
        await emitStage(payload, 'LOUDNORM_COMPLIANCE', 95, '正在进行 ASR 字幕时间轴对齐...');

        const audioDir = join(tmpdir(), `asr-audio-${payload.creation_id}`);
        await mkdir(audioDir, { recursive: true });
        const audioPath = join(audioDir, 'output.wav');

        // 从拼接视频提取音频 (16kHz mono WAV)
        console.log(`[CreationJob] Extracting audio for ASR: ${stitchResult.outputPath}`);
        let audioExtracted = false;
        try {
          await execFileAsync(
            'ffmpeg',
            ['-y', '-i', stitchResult.outputPath, '-ar', '16000', '-ac', '1', '-f', 'wav', audioPath],
            { timeout: 60_000, maxBuffer: 1024 * 1024 },
          );
          audioExtracted = true;
        } catch {
          console.warn(`[CreationJob] Audio extraction failed, skipping ASR alignment`);
        }
        if (audioExtracted) {
          // 委托 GPU Worker 的 ASR 转录
          console.log(`[CreationJob] Running ASR transcription on extracted audio...`);
          const asrPayload = {
            task_id: payload.task_id,
            creation_id: payload.creation_id,
            audio_path: audioPath,
            language: payload.asr_language || payload.target_language || 'zh',
            trace_id: payload.trace_id,
          };

          const rawResult = await postCallback('/api/internal/v1/creations/asr-subtitle-callback', asrPayload) as unknown;
          const asrResult = rawResult as {
            data?: {
              success: boolean;
              asr_segments?: Array<{ start_sec: number; end_sec: number; text: string; confidence?: number; word_timestamps?: Array<{ word: string; start_sec: number; end_sec: number }> }>;
              aligned_entries?: Array<{ shot_index: number; text: string; start_sec: number; end_sec: number }>;
              subtitle_srt?: string;
            };
          } | null;

          if (asrResult?.data?.success && asrResult.data.asr_segments) {
            console.log(
              `[CreationJob] ASR alignment complete: ${asrResult.data.asr_segments.length} segments, ` +
              `${asrResult.data.aligned_entries?.length || 0} aligned subtitles`,
            );

            // 将 ASR 对齐后的字幕时间戳保存到 payload，供后续使用
            if (asrResult.data.aligned_entries) {
              (payload as Record<string, unknown>).asr_aligned_subtitles = asrResult.data.aligned_entries;
              console.log(`[CreationJob] ASR timestamps saved for subtitle export`);
            }
          } else {
            console.warn(`[CreationJob] ASR alignment returned no data, continuing without refinement`);
          }
        }

        // 清理临时音频文件
        try { await rm(audioDir, { recursive: true, force: true }); } catch { /* ignore */ }

        await emitStage(payload, 'LOUDNORM_COMPLIANCE', 96, 'ASR 字幕对齐完成');
      } catch (asrErr) {
        const asrMsg = asrErr instanceof Error ? asrErr.message : String(asrErr);
        console.warn(`[CreationJob] ASR subtitle alignment failed (non-blocking): ${asrMsg}`);
        errorLogs.push({ shot_id: 'ASR', stage: 'LOUDNORM_COMPLIANCE', error: asrMsg, errorCode: 'ASR_ALIGN_FAILED' });
      }
    }

    await emitStage(payload, 'LOUDNORM_COMPLIANCE', 96, '正在进行最终导出...');

    // 保守校验：确保 artifact 已赋值（正常流程中一定非 null，此处防止未来的代码重构引入空指针）
    if (!artifact) {
      throw new Error('Artifact not generated: stitch phase did not produce output');
    }

    // 如果存在非致命警告，在日志中保留摘要
    const warningSummary = errorLogs.length > 0
      ? ` (${errorLogs.length} warning(s): ${errorLogs.map((entry) => `${entry.stage}:${entry.errorCode}`).join(', ')})`
      : '';
    console.log(`[CreationJob] Exporting: ${artifact.publicUrl}${warningSummary}`);

    // 最终导出回调：将视频 URL 和 FINISHED 状态写入数据库
    try {
      await emitExport(payload, artifact.publicUrl, artifact.fileSizeBytes, Math.round(currentTime));
    } catch (exportError) {
      const errMsg = exportError instanceof Error ? exportError.message : String(exportError);
      console.error(`[CreationJob] Export callback exhausted retries: ${errMsg}`);
      console.warn(`[CreationJob] Video generated successfully but export callback failed. Video: ${artifact.publicUrl}`);
      // 视频已生成成功，仅回调失败不应标记为 FAILED
      // 尝试最后一次阶段更新，让前端显示完成状态
      try {
        await emitStage(payload, 'LOUDNORM_COMPLIANCE', 99, '视频生成完成(状态同步异常，可刷新页面查看)');
      } catch (stageErr) {
        console.error(`[CreationJob] Final stage update also failed: ${stageErr instanceof Error ? (stageErr as Error).message : String(stageErr)}`);
      }
      errorLogs.push({ shot_id: 'EXPORT', stage: 'LOUDNORM_COMPLIANCE', error: errMsg, errorCode: 'EXPORT_CALLBACK_FAILED' });
      return { video_url: artifact.publicUrl };
    }

    return { video_url: artifact.publicUrl };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallbackInfo = errorLogs.length > 0
      ? ` | Fallbacks: ${errorLogs.map(e => `${e.stage}:${e.errorCode}`).join(', ')}`
      : '';

    console.error(`[CreationJob] FATAL: task_id=${payload.task_id} — ${message}${fallbackInfo}`);

    try {
      await emitFailure(payload, 'RENDER_WORKER_FAILED', `${message}${fallbackInfo}`);
    } catch (callbackError) {
      console.error(`[CreationJob] Failed to send failure callback: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`);
    }

    throw error;
  }
}

async function serveArtifact(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (!url.pathname.startsWith('/artifacts/')) {
    return false;
  }

  const fileName = decodeURIComponent(url.pathname.slice('/artifacts/'.length));
  if (!fileName || basename(fileName) !== fileName) {
    sendJson(response, 400, { message: 'Invalid artifact path' });
    return true;
  }

  const filePath = resolveArtifactPath(fileName);

  try {
    await stat(filePath);
    response.writeHead(200, withCors({ 'Content-Type': 'video/mp4' }));
    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { message: 'Artifact not found' });
  }

  return true;
}

const workerConnection = createRedisConnection();
const creationWorker = new Worker<CreationJobPayload>(queueName, processCreationJob, {
  connection: workerConnection,
  concurrency: creationWorkerConcurrency,
});

creationWorker.on('ready', () => {
  console.log(`creation worker listening on queue=${queueName} concurrency=${creationWorkerConcurrency}`);
});

creationWorker.on('completed', (job, result) => {
  console.log(`creation job completed: task_id=${job.id} result=${JSON.stringify(result)}`);
});

creationWorker.on('completed', () => {
  creationJobsTotal.inc({ status: 'completed' });
});

creationWorker.on('failed', (job, error) => {
  console.error(`creation job failed: task_id=${job?.id} error=${error.message}`);
  creationJobsTotal.inc({ status: 'failed' });
});

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, withCors());
    response.end();
    return;
  }

  if (request.url === '/health' && request.method === 'GET') {
    void getHealth()
      .then((health) => sendJson(response, 200, health))
      .catch((error) => sendJson(response, 500, { status: 'down', error: error instanceof Error ? error.message : String(error) }));
    return;
  }

  if (request.url === '/metrics' && request.method === 'GET') {
    void getMetrics()
      .then((metrics) => {
        response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', ...withCors() });
        response.end(metrics);
      })
      .catch((error) => sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) }));
    return;
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    void serveArtifact(request, response).then((served) => {
      if (!served) {
        sendJson(response, 404, { message: 'Not Found' });
      }
    });
    return;
  }

  sendJson(response, 404, { message: 'Not Found' });
});

void ensureArtifactRoot().then(async () => {
  const seedanceClient = getSeedanceClient();
  const health = await seedanceClient.checkHealth();
  console.log(`[Seedance] Startup health: ${health.ok ? 'OK' : 'FAILED'} — ${health.message}`);

  server.listen(port, '0.0.0.0', () => {
    console.log(`remotion-render-worker listening on ${port}`);
  });
});

async function shutdown(): Promise<void> {
  await creationWorker.close();
  workerConnection.disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => {
  void shutdown();
});

process.on('SIGINT', () => {
  void shutdown();
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  void shutdown();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  void shutdown();
});
