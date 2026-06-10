// ============================================================================
// AutoCut Processor — 语音驱动智能剪辑 (独立于 SlicingProcessor)
// ============================================================================

import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { AutocutJobPayload, TranscriptSegment, SpeechSlicerOutput } from './autocut.types';
import { AUTOCUT_CONSTANTS } from './autocut.constants';
import { GatewayCallbackClient } from '../gateway/callback-client';
import { MinioStorageClient } from '../storage/minio-client';

const execFileAsync = promisify(execFile);

export class AutocutProcessor {
  private readonly minio = new MinioStorageClient();
  private readonly gateway = new GatewayCallbackClient();

  /**
   * 主入口：根据 jobType 分流
   */
  async processJob(
    payload: AutocutJobPayload,
    jobId: string,
    updateProgress: (p: number) => Promise<void>,
  ): Promise<void> {
    const tempDir = join(tmpdir(), `autocut-${jobId}`);

    try {
      mkdirSync(tempDir, { recursive: true });

      switch (payload.jobType) {
        case 'TRANSCRIBE':
          await this.processTranscribe(payload, tempDir, updateProgress);
          break;
        case 'CUT':
          await this.processCut(payload, tempDir, updateProgress);
          break;
        default:
          throw new Error(`Unknown job type: ${payload.jobType}`);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * TRANSCRIBE 阶段: VAD + Whisper → 生成带时间戳的字幕段
   */
  private async processTranscribe(
    payload: AutocutJobPayload,
    tempDir: string,
    updateProgress: (p: number) => Promise<void>,
  ): Promise<void> {
    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.STARTING);

    // 1. 从 Gateway 获取素材元数据
    const material = await this.gateway.fetchMaterial(payload.materialId);
    if (!material.success || !material.data) {
      throw new Error('Failed to fetch material: ' + payload.materialId);
    }
    const mData = material.data as Record<string, unknown>;

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.DOWNLOADING);

    // 2. 从 MinIO 下载源视频
    const originUrl = mData.origin_url as string | undefined;
    if (!originUrl) {
      throw new Error('Material has no origin_url');
    }
    const objectKey = this.minio.extractObjectKeyFromUrl(originUrl);
    const videoPath = join(tempDir, 'source.mp4');
    await this.minio.downloadObject(objectKey, videoPath);

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.AUDIO_EXTRACTING);

    // 3. 调用 speech_slicer.py (VAD + Whisper)
    console.log(`[AutocutProcessor] Running speech analysis on: ${videoPath}`);
    const pyBin = process.platform === 'win32' ? 'python' : 'python3';
    const pyResult = await execFileAsync(
      pyBin,
      [AUTOCUT_CONSTANTS.SPEECH_SLICER_SCRIPT, videoPath],
      {
        timeout: AUTOCUT_CONSTANTS.SPEECH_SLICER_TIMEOUT_MS,
        maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, WHISPER_DEVICE: 'cpu', WHISPER_COMPUTE_TYPE: 'int8' },
      },
    );

    const rawOutput = pyResult.stdout.trim();
    console.log(`[AutocutProcessor] Speech slicer output (first 500 chars): ${rawOutput.slice(0, 500)}`);

    let output: SpeechSlicerOutput;
    try {
      output = JSON.parse(rawOutput);
    } catch {
      throw new Error('Failed to parse speech slicer output: ' + rawOutput.slice(0, 200));
    }

    if (!output.success) {
      throw new Error(output.error || 'Speech analysis failed');
    }

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.TRANSCRIPTION_DONE);

    // 4. 构建 TranscriptSegment 数组 (默认全部选中)
    // 注意：output.segments 可能为空（视频无语音），这是正常情况
    const segments: TranscriptSegment[] = (output.segments || []).map((seg, i) => ({
      index: i,
      start_sec: seg.start_sec,
      end_sec: seg.end_sec,
      text: seg.text,
      selected: true,
    }));

    // 5. 回调 Gateway：保存转录结果（包括空 segments 的情况）
    await this.callbackWithRetry(
      AUTOCUT_CONSTANTS.CALLBACK_TRANSCRIPT_READY_PATH,
      {
        job_id: payload.jobId,
        segments,
        srt_content: output.srt_content || '',
        language: output.language || 'unknown',
        video_duration: mData.duration_seconds,
      },
    );

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.COMPLETED);

    console.log(
      `[AutocutProcessor] Transcription complete: ${segments.length} segments, lang=${output.language}, speech_clips=${output.speech_clip_count || 0}`,
    );
  }

  /**
   * CUT 阶段: 根据用户 selected 状态用 FFmpeg 剪切拼接
   */
  private async processCut(
    payload: AutocutJobPayload,
    tempDir: string,
    updateProgress: (p: number) => Promise<void>,
  ): Promise<void> {
    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.STARTING);

    // 1. 从 Gateway 获取 job 详情 (含 segments 的 selected 状态)
    const jobDetail = await this.fetchAutocutJob(payload.jobId);
    if (!jobDetail) {
      throw new Error('Autocut job not found: ' + payload.jobId);
    }
    const data = jobDetail as Record<string, unknown>;
    const segments: TranscriptSegment[] = (data.segments as TranscriptSegment[]) || [];
    const materialId = data.materialId as string;

    // 2. 过滤出选中的段
    const selected = segments.filter((s) => s.selected);
    if (selected.length === 0) {
      throw new Error('No segments selected for cutting');
    }

    // 3. 下载源视频
    const material = await this.gateway.fetchMaterial(materialId);
    if (!material.success || !material.data) {
      throw new Error('Failed to fetch material');
    }
    const mData = material.data as Record<string, unknown>;
    const originUrl = mData.origin_url as string;
    const objectKey = this.minio.extractObjectKeyFromUrl(originUrl);
    const sourceVideo = join(tempDir, 'source.mp4');
    await this.minio.downloadObject(objectKey, sourceVideo);

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.CUTTING);

    // 4. FFmpeg: 逐个剪切选中的段
    const clipPaths: string[] = [];
    for (let i = 0; i < selected.length; i++) {
      const seg = selected[i];
      const clipPath = join(tempDir, `clip_${String(i).padStart(3, '0')}.mp4`);

      await execFileAsync('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', seg.start_sec.toFixed(3),
        '-i', sourceVideo,
        '-t', (seg.end_sec - seg.start_sec).toFixed(3),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        clipPath,
      ], { timeout: AUTOCUT_CONSTANTS.FFMPEG_CUT_TIMEOUT_MS });

      clipPaths.push(clipPath);
    }

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.CONCATENATING);

    // 5. FFmpeg: concat 拼接所有 clip
    const concatList = join(tempDir, 'concat_list.txt');
    const listContent = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    writeFileSync(concatList, listContent, 'utf-8');

    const outputPath = join(tempDir, 'final_output.mp4');
    await execFileAsync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-c', 'copy',
      outputPath,
    ], { timeout: AUTOCUT_CONSTANTS.FFMPEG_CONCAT_TIMEOUT_MS });

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.UPLOADING);

    // 6. 上传到 MinIO
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const outputKey = `${AUTOCUT_CONSTANTS.AUTOCUT_OUTPUT_PREFIX}/${datePrefix}/${payload.jobId}/output.mp4`;
    const outputUrl = await this.minio.uploadObject({
      buffer: readFileSync(outputPath),
      objectKey: outputKey,
      contentType: 'video/mp4',
    });

    // 7. 回调 Gateway：保存 output URL
    await this.callbackWithRetry(
      AUTOCUT_CONSTANTS.CALLBACK_CUT_COMPLETE_PATH,
      {
        job_id: payload.jobId,
        output_url: outputUrl,
      },
    );

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.COMPLETED);
    console.log(`[AutocutProcessor] Cut complete: ${selected.length} segments -> ${outputUrl}`);
  }

  /**
   * HTTP 回调 (带重试)
   */
  private async callbackWithRetry(
    path: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= AUTOCUT_CONSTANTS.CALLBACK_MAX_RETRIES; attempt++) {
      try {
        const url = `${AUTOCUT_CONSTANTS.CALLBACK_BASE_URL}${path}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), AUTOCUT_CONSTANTS.CALLBACK_TIMEOUT_MS);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-token': process.env.INTERNAL_TOKEN || 'tikstream-internal',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) return;

        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Callback rejected: ${response.status}`);
        }
      } catch (err) {
        lastError = err as Error;
        if (attempt < AUTOCUT_CONSTANTS.CALLBACK_MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }
    }

    throw lastError || new Error('Callback failed after retries');
  }

  /**
   * 从 Gateway 拉取 AutocutJob 详情
   */
  private async fetchAutocutJob(jobId: string): Promise<unknown | null> {
    const url = `${AUTOCUT_CONSTANTS.CALLBACK_BASE_URL}/api/internal/v1/autocut/job/${jobId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTOCUT_CONSTANTS.CALLBACK_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          'x-internal-token': process.env.INTERNAL_TOKEN || 'tikstream-internal',
        },
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const body = await response.json();
      return body.data ?? body;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 通知 Gateway Job 失败
   */
  async notifyJobFailure(jobId: string, error: string): Promise<void> {
    try {
      await this.callbackWithRetry(AUTOCUT_CONSTANTS.CALLBACK_JOB_FAILED_PATH, {
        job_id: jobId,
        error,
      });
    } catch {
      console.error(`[AutocutProcessor] Failed to notify failure for job ${jobId}`);
    }
  }
}
