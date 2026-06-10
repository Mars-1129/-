/**
 * Doubao-Seedance-1.5-pro Video Generation Client
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { get as httpsGet } from 'node:https';
import { promisify } from 'node:util';
import { resolveImageForSeedance } from './media-resolver';

function env(name: string, legacy?: string, def?: string): string {
  if (process.env[name]) return process.env[name]!;
  if (legacy && process.env[legacy]) {
    console.warn(`[ENV] ${legacy} is deprecated, use ${name}`);
    return process.env[legacy]!;
  }
  return def ?? '';
}

const execFileAsync = promisify(execFile);
const ffprobePath = process.env.FFPROBE_BINARY || 'ffprobe';

export interface SeedanceGenerateOptions {
  imageUrl: string;
  prompt: string;
  duration?: number;
  aspectRatio?: '9:16' | '16:9' | '1:1' | 'adaptive';
  negativePrompt?: string;
}

export interface SeedanceTextToVideoOptions {
  prompt: string;
  duration?: number;
  aspectRatio?: '9:16' | '16:9' | '1:1' | 'adaptive';
  negativePrompt?: string;
}

export interface SeedanceGenerateResult {
  success: boolean;
  videoUrl?: string;
  localPath?: string;
  error?: string;
  errorCode?: string;
  taskId?: string;
  duration?: number;
}

export interface SeedanceConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  maxRetries: number;
  pollIntervalMs: number;
  pollMaxAttempts: number;
  outputDir: string;
}

const SEEDANCE_MIN_DURATION_SECONDS = 4;
const SEEDANCE_MAX_DURATION_SECONDS = 12;
const SEEDANCE_DEFAULT_DURATION_SECONDS = 5;

const RATE_LIMIT_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000];

/** Seedance 1.5 Pro i2v accepts integer seconds in [4, 12] only. */
export function normalizeSeedanceDuration(requested?: number): number {
  const base = requested == null || Number.isNaN(requested)
    ? SEEDANCE_DEFAULT_DURATION_SECONDS
    : requested;

  const rounded = Math.round(base);
  return Math.min(
    SEEDANCE_MAX_DURATION_SECONDS,
    Math.max(SEEDANCE_MIN_DURATION_SECONDS, rounded),
  );
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

function computeRateLimitDelay(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs != null && retryAfterMs > 0) {
    return retryAfterMs + Math.floor(Math.random() * 2000);
  }

  const base = RATE_LIMIT_BACKOFF_MS[Math.min(attempt - 1, RATE_LIMIT_BACKOFF_MS.length - 1)];
  return base + Math.floor(Math.random() * 3000);
}

class AsyncSemaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return;
    }

    await new Promise<void>((resolvePromise) => {
      this.queue.push(() => {
        this.active += 1;
        resolvePromise();
      });
    });
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

const rawMaxConcurrency = Number(env('ARK_SEEDANCE_MAX_CONCURRENCY', 'VOLC_ARK_SEEDANCE_MAX_CONCURRENCY'));
const seedanceSemaphore = new AsyncSemaphore(
  isNaN(rawMaxConcurrency) || rawMaxConcurrency <= 0 ? 1 : rawMaxConcurrency,
);

function buildDefaultConfig(): SeedanceConfig {
  return {
    apiUrl: env('ARK_SEEDANCE_BASE_URL', 'VOLC_ARK_SEEDANCE_API_URL', 'https://ark.cn-beijing.volces.com/api/v3'),
    // Always prefer the ark- key format over the apikey- format for ARK API
    apiKey: env('ARK_API_KEY', 'VOLC_ARK_API_KEY') || env('ARK_VIDEO_API_KEY', 'VOLC_ARK_VIDEO_API_KEY') || '',
    model: env('ARK_DOUBAO_VIDEO_ENDPOINT', 'VOLC_ARK_DOUBAO_VIDEO_ENDPOINT', 'doubao-seedance-1-5-pro-251215'),
    maxRetries: Number(process.env.SEEDANCE_MAX_RETRIES || 8),
    pollIntervalMs: Number(process.env.SEEDANCE_POLL_INTERVAL_MS || 5000),
    pollMaxAttempts: Number(process.env.SEEDANCE_POLL_MAX_ATTEMPTS || 60),
    outputDir: process.env.SEEDANCE_OUTPUT_DIR || '/tmp/tikstream-seedance',
  };
}

export class DoubaoSeedanceClient {
  private config: SeedanceConfig;

  constructor(config: Partial<SeedanceConfig> = {}) {
    this.config = { ...buildDefaultConfig(), ...config };

    const outDir = this.config.outputDir;
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    if (!this.config.apiKey) {
      console.warn('[DoubaoSeedanceClient] API Key not configured — video generation will fail');
    }

    console.log(
      `[DoubaoSeedanceClient] Initialized: apiUrl=${this.config.apiUrl}, model=${this.config.model}, maxConcurrency=${env('ARK_SEEDANCE_MAX_CONCURRENCY', 'VOLC_ARK_SEEDANCE_MAX_CONCURRENCY') || '1'}, maxRetries=${this.config.maxRetries}`,
    );
  }

  async generate(options: SeedanceGenerateOptions): Promise<SeedanceGenerateResult> {
    await seedanceSemaphore.acquire();
    try {
      return await this.generateInternal(options);
    } finally {
      seedanceSemaphore.release();
    }
  }

  private async generateInternal(options: SeedanceGenerateOptions): Promise<SeedanceGenerateResult> {
    const startTime = Date.now();
    const promptPreview = options.prompt.substring(0, 80);
    console.log(`[DoubaoSeedanceClient] Starting video generation: prompt="${promptPreview}..." imageUrl=${options.imageUrl}`);

    if (!this.config.apiKey) {
      return {
        success: false,
        error: 'Seedance API Key not configured',
        errorCode: 'SEEDANCE_NO_API_KEY',
      };
    }

    if (!options.imageUrl) {
      return {
        success: false,
        error: 'No image URL provided for Seedance generation',
        errorCode: 'SEEDANCE_NO_IMAGE_URL',
      };
    }

    try {
      const aspectRatio = options.aspectRatio || 'adaptive';
      const duration = normalizeSeedanceDuration(options.duration);
      if (options.duration != null && Math.round(options.duration) !== duration) {
        console.log(
          `[DoubaoSeedanceClient] Adjusted duration ${options.duration}s → ${duration}s (Seedance i2v requires integer 4-12)`,
        );
      }
      const resolvedImageUrl = await resolveImageForSeedance(options.imageUrl);

      const content: Array<Record<string, unknown>> = [];

      if (options.negativePrompt) {
        content.push({ type: 'text', text: options.negativePrompt, role: 'negative_prompt' });
      }

      content.push(
        { type: 'text', text: options.prompt },
        { type: 'image_url', image_url: { url: resolvedImageUrl }, role: 'first_frame' },
      );

      const taskId = await this.createTask(content, '720p', aspectRatio, duration);

      console.log(`[DoubaoSeedanceClient] Polling task: ${taskId}`);
      const result = await this.pollTask(taskId, startTime);

      if (result.success && result.videoUrl) {
        console.log(`[DoubaoSeedanceClient] Downloading generated video: ${result.videoUrl}`);
        const localVideoPath = await this.downloadFile(result.videoUrl, 'mp4');

        const probeInfo = await this.probeVideoInfo(localVideoPath);
        if (probeInfo) {
          console.log(
            `[DoubaoSeedanceClient] Output probe: ${probeInfo.width}x${probeInfo.height} @${probeInfo.fps}fps, duration=${probeInfo.duration}s, hasAudio=${probeInfo.hasAudio}`,
          );
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[DoubaoSeedanceClient] Video saved to: ${localVideoPath} (${elapsed}s total)`);

        return {
          success: true,
          videoUrl: localVideoPath,
          localPath: localVideoPath,
          taskId,
          duration,
        };
      }

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[DoubaoSeedanceClient] Generation failed: ${msg}`);
      return {
        success: false,
        error: msg,
        errorCode: 'SEEDANCE_GENERATION_ERROR',
      };
    }
  }

  async generateTextToVideo(options: SeedanceTextToVideoOptions): Promise<SeedanceGenerateResult> {
    await seedanceSemaphore.acquire();
    try {
      return await this.generateTextToVideoInternal(options);
    } finally {
      seedanceSemaphore.release();
    }
  }

  private async generateTextToVideoInternal(options: SeedanceTextToVideoOptions): Promise<SeedanceGenerateResult> {
    const startTime = Date.now();
    const promptPreview = options.prompt.substring(0, 80);
    console.log(`[DoubaoSeedanceClient] Starting text-to-video generation: prompt="${promptPreview}..."`);

    if (!this.config.apiKey) {
      return {
        success: false,
        error: 'Seedance API Key not configured',
        errorCode: 'SEEDANCE_NO_API_KEY',
      };
    }

    try {
      const aspectRatio = options.aspectRatio || '9:16';
      const duration = normalizeSeedanceDuration(options.duration);
      if (options.duration != null && Math.round(options.duration) !== duration) {
        console.log(
          `[DoubaoSeedanceClient] Adjusted duration ${options.duration}s → ${duration}s (Seedance requires integer 4-12)`,
        );
      }

      const content: Array<Record<string, unknown>> = [];

      if (options.negativePrompt) {
        content.push({ type: 'text', text: options.negativePrompt, role: 'negative_prompt' });
      }

      content.push({ type: 'text', text: options.prompt });

      const taskId = await this.createTask(content, '720p', aspectRatio, duration);

      console.log(`[DoubaoSeedanceClient] Polling T2V task: ${taskId}`);
      const result = await this.pollTask(taskId, startTime);

      if (result.success && result.videoUrl) {
        console.log(`[DoubaoSeedanceClient] Downloading generated T2V video: ${result.videoUrl}`);
        const localVideoPath = await this.downloadFile(result.videoUrl, 'mp4');

        const probeInfo = await this.probeVideoInfo(localVideoPath);
        if (probeInfo) {
          console.log(
            `[DoubaoSeedanceClient] T2V Output probe: ${probeInfo.width}x${probeInfo.height} @${probeInfo.fps}fps, duration=${probeInfo.duration}s, hasAudio=${probeInfo.hasAudio}`,
          );
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[DoubaoSeedanceClient] T2V Video saved to: ${localVideoPath} (${elapsed}s total)`);

        return {
          success: true,
          videoUrl: localVideoPath,
          localPath: localVideoPath,
          taskId,
          duration,
        };
      }

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[DoubaoSeedanceClient] T2V generation failed: ${msg}`);
      return {
        success: false,
        error: msg,
        errorCode: 'SEEDANCE_T2V_ERROR',
      };
    }
  }

  async checkHealth(): Promise<{ ok: boolean; message: string }> {
    if (!this.config.apiKey) {
      return { ok: false, message: 'API Key not configured' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.config.apiUrl}/contents/generations/tasks`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 404) {
        return { ok: true, message: `API reachable (HTTP ${response.status})` };
      }

      const errorText = await response.text().catch(() => 'Unknown');
      return { ok: false, message: `API returned HTTP ${response.status}: ${errorText.substring(0, 200)}` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `API connection failed: ${msg}` };
    }
  }

  getConfig(): SeedanceConfig {
    return { ...this.config };
  }

  private async createTask(
    content: Array<Record<string, unknown>>,
    resolution: string,
    ratio: string,
    duration: number,
    attempt: number = 1,
  ): Promise<string> {
    const url = `${this.config.apiUrl}/contents/generations/tasks`;

    console.log(`[DoubaoSeedanceClient] Creating task (attempt ${attempt}/${this.config.maxRetries + 1}): ${url}`);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 30000);

      const requestBody = {
        model: this.config.model,
        content,
        resolution,
        ratio,
        duration,
      };

      console.log(`[DoubaoSeedanceClient] Request body: model=${this.config.model}, resolution=${resolution}, ratio=${ratio}, duration=${duration}s`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429 && attempt <= this.config.maxRetries) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
        const delay = computeRateLimitDelay(attempt, retryAfterMs);
        console.warn(
          `[DoubaoSeedanceClient] Rate limited (429), retrying in ${delay}ms (attempt ${attempt}/${this.config.maxRetries})`,
        );
        await this.sleep(delay);
        return this.createTask(content, resolution, ratio, duration, attempt + 1);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown');
        console.error(`[DoubaoSeedanceClient] Create task HTTP ${response.status}: ${errorText}`);
        throw new Error(`Seedance API error: HTTP ${response.status} — ${errorText.substring(0, 500)}`);
      }

      const data = await response.json() as { id?: string };
      if (!data.id) {
        throw new Error(`Seedance API returned unexpected response: ${JSON.stringify(data)}`);
      }

      console.log(`[DoubaoSeedanceClient] Task created: ${data.id}`);
      return data.id;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (attempt <= this.config.maxRetries) {
            console.warn(`[DoubaoSeedanceClient] Timeout creating task, retrying (attempt ${attempt}/${this.config.maxRetries})`);
            await this.sleep(2000);
            return this.createTask(content, resolution, ratio, duration, attempt + 1);
          }
          throw new Error('[Seedance] Task creation timed out after max retries');
        }
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
          throw new Error(`[Seedance] Cannot connect to API: ${this.config.apiUrl} — ${error.message}`);
        }
      }
      throw error;
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async pollTask(taskId: string, startTime: number): Promise<SeedanceGenerateResult> {
    const url = `${this.config.apiUrl}/contents/generations/tasks/${taskId}`;

    for (let i = 0; i < this.config.pollMaxAttempts; i++) {
      await this.sleep(this.config.pollIntervalMs);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[DoubaoSeedanceClient] Polling ${taskId} (attempt ${i + 1}/${this.config.pollMaxAttempts}, ${elapsed}s elapsed)`);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
          const delay = computeRateLimitDelay(Math.min(i + 1, 4), retryAfterMs);
          console.warn(`[DoubaoSeedanceClient] Poll rate limited (429), waiting ${delay}ms`);
          await this.sleep(delay);
          continue;
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => 'Unknown');
          console.warn(`[DoubaoSeedanceClient] Poll HTTP ${response.status}: ${errText.substring(0, 200)}`);
          if (response.status === 401 || response.status === 403) {
            return {
              success: false,
              error: `Seedance API authentication failed: HTTP ${response.status}`,
              errorCode: 'SEEDANCE_AUTH_ERROR',
              taskId,
            };
          }
          continue;
        }

        const data = await response.json() as {
          status?: string;
          content?: { video_url?: string };
          error?: { message?: string; code?: string };
        };

        if (data.status === 'succeeded') {
          const videoUrl = data.content?.video_url;
          if (!videoUrl) {
            return {
              success: false,
              error: `Seedance task ${taskId} succeeded but no video_url in response`,
              errorCode: 'SEEDANCE_NO_VIDEO_URL',
              taskId,
            };
          }
          console.log(`[DoubaoSeedanceClient] Video generated successfully: ${videoUrl}`);
          return { success: true, videoUrl, taskId };
        }

        if (data.status === 'failed') {
          const errMsg = data.error?.message || 'Unknown error';
          const errCode = data.error?.code || '';
          return {
            success: false,
            error: `Seedance video generation failed: ${errMsg}${errCode ? ` (code: ${errCode})` : ''}`,
            errorCode: `SEEDANCE_TASK_FAILED${errCode ? `_${errCode}` : ''}`,
            taskId,
          };
        }

        if (data.status === 'running' || data.status === 'queued' || data.status === 'pending') {
          continue;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[DoubaoSeedanceClient] Poll attempt ${i + 1} error: ${msg}`);
      }
    }

    const timeoutSecs = this.config.pollMaxAttempts * this.config.pollIntervalMs / 1000;
    return {
      success: false,
      error: `Seedance task ${taskId} did not complete within ${timeoutSecs}s`,
      errorCode: 'SEEDANCE_TIMEOUT',
      taskId,
    };
  }

  private downloadFile(url: string, ext: string, redirectCount = 0): Promise<string> {
    const MAX_REDIRECTS = 5;

    if (redirectCount >= MAX_REDIRECTS) {
      return Promise.reject(new Error(`Too many redirects (${MAX_REDIRECTS}+) downloading ${url}`));
    }

    const fileName = `seedance_${randomUUID().substring(0, 8)}.${ext}`;
    const filePath = join(this.config.outputDir, fileName);

    console.log(`[DoubaoSeedanceClient] Downloading: ${url} → ${filePath}`);

    return new Promise((resolvePromise, reject) => {
      const DOWNLOAD_TOTAL_TIMEOUT_MS = 300000; // 总超时 5 分钟（视频下载可能较大）

      const totalTimer = setTimeout(() => {
        req.destroy();
        reject(new Error(`Download total timeout (${DOWNLOAD_TOTAL_TIMEOUT_MS}ms) exceeded: ${url}`));
      }, DOWNLOAD_TOTAL_TIMEOUT_MS);

      const req = httpsGet(url, { timeout: 120000 }, (response) => {
        clearTimeout(totalTimer);
        const statusCode = response.statusCode ?? 0;

        if (statusCode === 301 || statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            response.destroy();
            this.downloadFile(redirectUrl, ext, redirectCount + 1).then(resolvePromise).catch(reject);
            return;
          }
        }

        if (statusCode >= 400) {
          response.destroy();
          reject(new Error(`HTTP ${statusCode} downloading ${url}`));
          return;
        }

        const file = createWriteStream(filePath);
        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolvePromise(filePath);
        });

        file.on('error', (err: Error) => {
          reject(new Error(`File write error: ${err.message}`));
        });
      });

      req.on('error', (err: Error) => {
        clearTimeout(totalTimer);
        reject(new Error(`Download failed: ${err.message}`));
      });

      req.on('timeout', () => {
        clearTimeout(totalTimer);
        req.destroy();
        reject(new Error(`Download socket timeout: ${url}`));
      });
    });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async probeVideoInfo(filePath: string): Promise<{
    width: number;
    height: number;
    fps: string;
    duration: string;
    hasAudio: boolean;
  } | null> {
    try {
      const { stdout: videoOut } = await execFileAsync(ffprobePath, [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate',
        '-show_entries', 'format=duration',
        '-of', 'json',
        filePath,
      ]);

      const { stdout: audioOut } = await execFileAsync(ffprobePath, [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0',
        filePath,
      ]);

      const parsed = JSON.parse(videoOut) as {
        streams?: Array<{ width?: number; height?: number; r_frame_rate?: string }>;
        format?: { duration?: string };
      };
      const stream = parsed.streams?.[0];
      return {
        width: stream?.width ?? 0,
        height: stream?.height ?? 0,
        fps: stream?.r_frame_rate ?? '?',
        duration: parsed.format?.duration ?? '?',
        hasAudio: audioOut.trim().length > 0,
      };
    } catch {
      return null;
    }
  }
}

let seedanceClientInstance: DoubaoSeedanceClient | null = null;

export function getSeedanceClient(): DoubaoSeedanceClient {
  if (!seedanceClientInstance) {
    seedanceClientInstance = new DoubaoSeedanceClient();
  }
  return seedanceClientInstance;
}
