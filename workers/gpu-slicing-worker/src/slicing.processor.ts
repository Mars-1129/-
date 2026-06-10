import { execFile } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SliceSegment, SliceJobPayload, DecordOutput, GatewayMaterialResponse, GatewaySliceRecord, GatewayProductInfo, SliceStatus, SceneBoundary } from './types';
import { SLICING_CONSTANTS, ERROR_MESSAGES } from './constants';
import { MinioStorageClient } from './storage/minio-client';
import { GatewayCallbackClient } from './gateway/callback-client';
import { CaptionProcessor } from './caption.processor';
import { AudioAnalyzer, AudioAnalysisResult } from './audio-analyzer';

const execFileAsync = promisify(execFile);

export class SlicingProcessor {
  private readonly minio: MinioStorageClient;
  private readonly gateway: GatewayCallbackClient;
  private readonly caption: CaptionProcessor;
  private readonly audio: AudioAnalyzer;

  constructor() {
    this.minio = new MinioStorageClient();
    this.gateway = new GatewayCallbackClient();
    this.caption = new CaptionProcessor();
    this.audio = new AudioAnalyzer();
  }

  async processJob(jobData: SliceJobPayload, jobId: string, updateProgress: (progress: number) => Promise<void>): Promise<void> {
    const materialId = jobData.materialId;
    const traceId = this.generateTraceId(materialId);
    const jobTempDir = join(tmpdir(), `${SLICING_CONSTANTS.TEMP_DIR_PREFIX}-${jobId}`);
    const jobStartTime = Date.now();

    try {
      mkdirSync(jobTempDir, { recursive: true });
    } catch {
      const error = new Error(`Failed to create temp directory: ${jobTempDir}`);
      (error as Error & { errorCode: string }).errorCode = 'INTERNAL_SERVER_ERROR';
      throw error;
    }

    try {
      await updateProgress(SLICING_CONSTANTS.PROGRESS_STAGES.DOWNLOADING);

      const gatewayData = await this.fetchMaterialFromGateway(materialId);
      await updateProgress(SLICING_CONSTANTS.PROGRESS_STAGES.DOWNLOADED);

      const videoPath = await this.downloadSourceVideo(gatewayData.origin_url, jobTempDir, jobStartTime);
      await updateProgress(SLICING_CONSTANTS.PROGRESS_STAGES.DOWNLOADED);

      const normalizedPath = await this.normalizeSourceVideo(videoPath, jobTempDir);
      await updateProgress(SLICING_CONSTANTS.PROGRESS_STAGES.NORMALIZED);

      // 应用 YOLO 9:16 自适应裁切
      await updateProgress(SLICING_CONSTANTS.PROGRESS_STAGES.YOLO_CROPPING);
      const { path: croppedPath, crop_region: yoloCropRegion } = await this.applyYoloCrop(normalizedPath, jobTempDir);

      await updateProgress(SLICING_CONSTANTS.PROGRESS_STAGES.SCENE_DETECTION);
      const sceneDetection = await this.detectSceneBoundaries(croppedPath);

      if (!gatewayData.slices || gatewayData.slices.length === 0) {
        const error = new Error(`素材 ${materialId} 缺少 Gateway 切片记录，无法进行切片处理`);
        (error as Error & { errorCode: string }).errorCode = 'GPU_SLICING_NO_SLICE_RECORDS';
        throw error;
      }

      const segments = this.optimizeSliceBoundaries(
        gatewayData.slices,
        sceneDetection.predictions,
        gatewayData.duration_seconds,
      );
      await updateProgress(SLICING_CONSTANTS.PROGRESS_STAGES.BOUNDARY_OPTIMIZED);

      const sliceVideoPaths = await this.executeFfmpegSlicing(croppedPath, segments, jobTempDir);
      await updateProgress(SLICING_CONSTANTS.PROGRESS_STAGES.FFMPEG_SLICING);

      const keyFramePaths = await this.extractKeyFrames(segments, sliceVideoPaths, jobTempDir);
      await updateProgress(SLICING_CONSTANTS.PROGRESS_STAGES.KEYFRAME_EXTRACTED);

      const productInfo: GatewayProductInfo = {
        id: gatewayData.product.id,
        title: gatewayData.product.title,
        category: gatewayData.product.category,
        selling_points: gatewayData.product.selling_points,
      };

      const datePrefix = this.getDatePrefix();
      const totalSegments = segments.length;

      // 使用并行处理字幕生成以提高效率
      const captionPromises: Array<{
        segmentIndex: number;
        segment: SliceSegment;
        slicePath: string | null;
        keyFramePath: string | null;
        promise: Promise<void>;
      }> = [];

      for (let i = 0; i < totalSegments; i++) {
        this.checkJobTimeout(jobStartTime);

        const segment = segments[i];
        const slicePath = sliceVideoPaths[i];

        if (!slicePath) {
          console.warn(`[SlicingProcessor] Skipping segment ${i}: no slice video produced`);
          continue;
        }

        const sliceIndex = i + 1;
        // 优先使用 Gateway 提供的 sliceId，确保与数据库记录匹配
        const gatewaySlice = gatewayData.slices[i];
        const sliceId = gatewaySlice?.slice_id || this.generateSliceId(materialId, sliceIndex, datePrefix);

        if (!gatewaySlice) {
          console.warn(
            `[SlicingProcessor] Gateway slices 不足: segments_planned=${totalSegments}, ` +
            `gateway_slices_count=${gatewayData.slices.length}, current_index=${i}. ` +
            `生成的 sliceId=${sliceId} 无对应 DB 记录`,
          );
        }
        const sliceObjectKey = `slices/${datePrefix}/${materialId}/slice_${String(sliceIndex).padStart(3, '0')}.mp4`;
        const keyFramePath = keyFramePaths[i] || null;
        const keyFrameObjectKey = `slices/${datePrefix}/${materialId}/keyframe_${String(sliceIndex).padStart(3, '0')}.jpg`;

        let streamUrl: string;
        try {
          streamUrl = await this.uploadSliceToMinIO(slicePath, sliceObjectKey);
        } catch (uploadError) {
          console.error(`[SlicingProcessor] Slice ${sliceIndex} upload failed: ${(uploadError as Error).message}`);

          try {
            await this.gateway.sendSliceCallback({
              material_id: materialId,
              slice_id: sliceId,
              status: 'FAILED' as SliceStatus,
              start_time: segment.start_sec,
              end_time: segment.end_sec,
              duration: segment.duration,
              trace_id: traceId,
            });
          } catch {
            // best effort
          }
          continue;
        }

        let keyFrameUrl: string | null = null;
        if (keyFramePath) {
          try {
            keyFrameUrl = await this.uploadKeyFrameToMinIO(keyFramePath, keyFrameObjectKey);
          } catch {
            console.warn(`[SlicingProcessor] Keyframe ${sliceIndex} upload failed (non-blocking)`);
            keyFrameUrl = null;
          }
        }

        // CAPTIONING status callback — non-blocking; proceed to caption generation regardless
        const captioningResult = await this.gateway.sendSliceCallback({
          material_id: materialId,
          slice_id: sliceId,
          status: 'CAPTIONING' as SliceStatus,
          stream_url: streamUrl,
          key_frame_url: keyFrameUrl || undefined,
          start_time: segment.start_sec,
          end_time: segment.end_sec,
          duration: segment.duration,
          trace_id: traceId,
        });
        if (!captioningResult.success) {
          console.warn(`[SlicingProcessor] CAPTIONING callback failed for slice ${sliceIndex} (non-blocking): ${captioningResult.error}`);
        }

        // 构建并行字幕生成任务
        const progressBase = SLICING_CONSTANTS.PROGRESS_STAGES.CAPTIONING_BASE;
        const progressRange = SLICING_CONSTANTS.PROGRESS_STAGES.CAPTIONING_RANGE;
        const currentProgress = progressBase + Math.floor((i / totalSegments) * progressRange);

        const captionPromise = this.processSliceWithCaption(
          materialId,
          sliceId,
          segment,
          streamUrl,
          keyFrameUrl,
          productInfo,
          traceId,
          currentProgress,
          updateProgress,
          yoloCropRegion,
        );

        captionPromises.push({
          segmentIndex: i,
          segment,
          slicePath,
          keyFramePath,
          promise: captionPromise,
        });
      }

      // 并行执行所有字幕生成任务
      await Promise.allSettled(captionPromises.map(p => p.promise));

      // Send batch-complete callback to clean up unprocessed PENDING slices
      try {
        await this.gateway.sendBatchCallback({
          material_id: materialId,
          trace_id: traceId,
        });
      } catch (batchCallbackError) {
        console.warn(`[SlicingProcessor] Batch callback failed for ${materialId} (non-blocking): ${(batchCallbackError as Error).message}`);
      }

      await updateProgress(SLICING_CONSTANTS.PROGRESS_STAGES.COMPLETED);
    } finally {
      await this.cleanupTemporaryFiles(jobTempDir);
    }
  }

  /**
   * 处理单个切片的字幕生成
   * 这个方法独立运行，可以并行执行
   */
  private async processSliceWithCaption(
    materialId: string,
    sliceId: string,
    segment: SliceSegment,
    streamUrl: string,
    keyFrameUrl: string | null,
    productInfo: GatewayProductInfo,
    traceId: string,
    progress: number,
    updateProgress: (progress: number) => Promise<void>,
    yoloCropRegion?: { x: number; y: number; width: number; height: number },
  ): Promise<void> {
    let sfxUrl: string | undefined;

    try {
      await updateProgress(progress);

      // 生成字幕
      const captionResult = await this.caption.generate(
      segment,
      productInfo,
      keyFrameUrl || undefined,
    );

      // HTDemucs 音频分析（提取 BGM 音轨 + 音效分离）
      try {
        const audioResult: AudioAnalysisResult = await this.audio.analyzeVideo(streamUrl);
        if (audioResult.success && audioResult.has_bgm) {
          console.log(`[SlicingProcessor] HTDemucs: slice ${sliceId} has BGM, style=${audioResult.bgm_style?.style || 'unknown'}`);
          // 上传分离后的伴奏音轨到 MinIO 作为可复用音效
          if (audioResult.separated_audio_path?.other) {
            try {
              const sfxObjectKey = `materials/${materialId}/slices/${sliceId}/sfx.wav`;
              sfxUrl = await this.uploadSliceToMinIO(audioResult.separated_audio_path.other, sfxObjectKey);
              console.log(`[SlicingProcessor] SFX uploaded: ${sfxUrl}`);
            } catch (uploadErr) {
              console.warn(`[SlicingProcessor] Failed to upload SFX for slice ${sliceId}: ${(uploadErr as Error).message}`);
            }
          }
        }
      } catch (audioError) {
        // 音频分析失败不阻断主流程
        console.warn(`[SlicingProcessor] HTDemucs audio analysis failed for slice ${sliceId}: ${(audioError as Error).message}`);
      }

      const completedResult = await this.gateway.sendSliceCallback({
        material_id: materialId,
        slice_id: sliceId,
        status: 'COMPLETED' as SliceStatus,
        stream_url: streamUrl,
        key_frame_url: keyFrameUrl || undefined,
        dense_caption: captionResult.dense_caption,
        tags: captionResult.tags,
        start_time: segment.start_sec,
        end_time: segment.end_sec,
        duration: segment.duration,
        sfx_url: sfxUrl,
        crop_region: yoloCropRegion,
        trace_id: traceId,
      });
      if (!completedResult.success) {
        console.error(`[SlicingProcessor] COMPLETED callback failed for slice ${sliceId} (non-blocking): ${completedResult.error}`);
      }
    } catch (captionError) {
      const err = captionError as Error & { errorCode?: string };
      console.error(`[SlicingProcessor] Caption generation failed for slice ${sliceId}: ${err.message} (code=${err.errorCode || 'UNKNOWN'})`);

      // Caption failure is non-fatal: the video slice was successfully created,
      // uploaded to MinIO, and the keyframe was extracted. Send COMPLETED with
      // video URLs but empty caption — the slice is usable for search/display
      // even without AI-generated captions.
      const completedResult = await this.gateway.sendSliceCallback({
        material_id: materialId,
        slice_id: sliceId,
        status: 'COMPLETED' as SliceStatus,
        stream_url: streamUrl,
        key_frame_url: keyFrameUrl || undefined,
        dense_caption: '',
        tags: [],
        start_time: segment.start_sec,
        end_time: segment.end_sec,
        duration: segment.duration,
        sfx_url: sfxUrl,
        crop_region: yoloCropRegion,
        trace_id: traceId,
      });
      if (!completedResult.success) {
        console.error(`[SlicingProcessor] COMPLETED (caption-failed) callback failed for slice ${sliceId} (non-blocking): ${completedResult.error}`);
      }
    }
  }

  async notifyJobFailure(materialId: string, errorMessage: string, errorCode: string): Promise<void> {
    const traceId = this.generateTraceId(materialId);
    const result = await this.gateway.sendMaterialFailureCallback({
      material_id: materialId,
      status: 'FAILED',
      error_message: `${errorCode}: ${errorMessage}`,
      trace_id: traceId,
    });

    if (!result.success) {
      throw new Error(result.error || 'Material failure callback failed');
    }
  }

  private async fetchMaterialFromGateway(materialId: string): Promise<GatewayMaterialResponse> {
    const result = await this.gateway.fetchMaterial(materialId);

    if (!result.success || !result.data) {
      const error = new Error(result.error || ERROR_MESSAGES.MATERIAL_FETCH_FAILED);
      (error as Error & { errorCode: string }).errorCode = 'MATERIAL_NOT_FOUND';
      throw error;
    }

    const data = result.data as unknown as GatewayMaterialResponse;

    if (!data.material_id || !data.origin_url) {
      const error = new Error('Gateway material response missing required fields');
      (error as Error & { errorCode: string }).errorCode = 'INTERNAL_SERVER_ERROR';
      throw error;
    }

    return data;
  }

  private async downloadSourceVideo(
    originUrl: string,
    jobTempDir: string,
    jobStartTime: number,
  ): Promise<string> {
    const objectKey = this.minio.extractObjectKeyFromUrl(originUrl);
    const videoPath = join(jobTempDir, 'source.mp4');

    try {
      await this.minio.downloadObject(objectKey, videoPath);
    } catch (error) {
      const err = error as Error & { errorCode?: string };
      if (err.errorCode) {
        throw error;
      }
      const downloadError = new Error(`${ERROR_MESSAGES.MINIO_DOWNLOAD_FAILED}: ${err.message}`);
      (downloadError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_DOWNLOAD_FAILED';
      throw downloadError;
    }

    this.checkJobTimeout(jobStartTime);

    return videoPath;
  }

  private async normalizeSourceVideo(sourcePath: string, jobTempDir: string): Promise<string> {
    const normalizedPath = join(jobTempDir, 'normalized.mp4');

    const copyArgs = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-c:v',
      'copy',
      '-movflags',
      '+faststart',
      '-an',
      normalizedPath,
    ];

    const transcodeArgs = (videoCodec: string) => [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-c:v',
      videoCodec,
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      normalizedPath,
    ];

    const attempts: Array<{ label: string; args: string[] }> = [
      { label: 'stream-copy', args: copyArgs },
      { label: 'libx264', args: transcodeArgs('libx264') },
      { label: 'libopenh264', args: transcodeArgs('libopenh264') },
    ];

    let lastError = 'unknown normalization error';

    for (const attempt of attempts) {
      try {
        await execFileAsync('ffmpeg', attempt.args, {
          timeout: SLICING_CONSTANTS.FFMPEG_NORMALIZE_TIMEOUT_MS,
        });

        if (existsSync(normalizedPath)) {
          console.log(`[SlicingProcessor] Source video normalized via ${attempt.label}: ${normalizedPath}`);
          return normalizedPath;
        }
      } catch (error) {
        const err = error as Error & { stderr?: string; code?: string };

        if (err.code === 'ENOENT') {
          const notFoundError = new Error(ERROR_MESSAGES.FFMPEG_NOT_FOUND);
          (notFoundError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_SCENE_DETECTION_FAILED';
          throw notFoundError;
        }

        lastError = err.stderr || err.message;
        console.warn(`[SlicingProcessor] Normalize attempt ${attempt.label} failed: ${lastError.slice(0, 200)}`);
      }
    }

    const normalizeError = new Error(`Video normalization failed: ${lastError}`);
    (normalizeError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_SCENE_DETECTION_FAILED';
    throw normalizeError;
  }

  /**
   * 使用 YOLOv11 进行 9:16 自适应裁切
   * 检测视频主体，自动裁切为竖版 9:16
   */
  async applyYoloCrop(sourcePath: string, jobTempDir: string): Promise<{
    path: string;
    crop_region?: { x: number; y: number; width: number; height: number };
  }> {
    const yoloScriptPath = join(__dirname, '../python_scripts/yolo_cropper.py');
    const yoloOutputDir = join(jobTempDir, 'yolo_output');
    const croppedPath = join(yoloOutputDir, 'cropped_source.mp4');

    // 确保输出目录存在
    mkdirSync(yoloOutputDir, { recursive: true });

    console.log(`[SlicingProcessor] Applying YOLO 9:16 cropping: ${sourcePath}`);

    try {
      const result = await execFileAsync(
        SLICING_CONSTANTS.PYTHON_INTERPRETER,
        [
          yoloScriptPath,
          sourcePath,
          yoloOutputDir,
          '--model', SLICING_CONSTANTS.YOLO_MODEL_PATH,
          '--target-ratio', String(SLICING_CONSTANTS.YOLO_TARGET_RATIO),
          '--sample-interval', String(SLICING_CONSTANTS.YOLO_SAMPLE_INTERVAL),
          '--min-confidence', String(SLICING_CONSTANTS.YOLO_MIN_CONFIDENCE),
        ],
        {
          timeout: 300_000, // 5 分钟超时
          maxBuffer: 5 * 1024 * 1024,
        },
      );

      // Extract the last JSON object from stdout (fix: YOLO script may mix diagnostic output with JSON)
      const stdout = result.stdout.trim();
      let output: any;
      try {
        // Try direct parse first
        output = JSON.parse(stdout);
      } catch {
        // Fallback: find and parse the last JSON object in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            output = JSON.parse(jsonMatch[0]);
          } catch {
            console.warn(`[SlicingProcessor] YOLO stdout is not valid JSON, using original video`);
            return { path: sourcePath };
          }
        } else {
          console.warn(`[SlicingProcessor] No JSON found in YOLO stdout, using original video`);
          return { path: sourcePath };
        }
      }

      if (output.success && output.output?.path) {
        console.log(
          `[SlicingProcessor] YOLO cropping succeeded: crop_region=${JSON.stringify(output.crop_region)}, detections=${output.detection_count}`,
        );
        return { path: output.output.path, crop_region: output.crop_region };
      }

      // 如果 YOLO 失败但有输出，使用 fallback 裁切
      if (output.output?.path) {
        console.warn(`[SlicingProcessor] YOLO returned but success=false, using fallback crop`);
        return { path: output.output.path, crop_region: output.crop_region };
      }

      // YOLO 完全失败，返回原视频路径，跳过裁切
      console.warn(`[SlicingProcessor] YOLO cropping failed, using original video`);
      return { path: sourcePath };
    } catch (error) {
      const err = error as Error & { stderr?: string; code?: string };

      // 如果是 Python 依赖缺失，输出警告并返回原视频
      if (err.stderr?.includes('ModuleNotFoundError') || err.stderr?.includes('ultralytics')) {
        console.warn(`[SlicingProcessor] YOLO dependencies not available, skipping crop: ${err.message}`);
        return { path: sourcePath };
      }

      // 其他错误也跳过裁切，使用原视频
      console.warn(`[SlicingProcessor] YOLO cropping error: ${err.message}, using original video`);
      return { path: sourcePath };
    }
  }

  private async detectSceneBoundaries(videoPath: string): Promise<DecordOutput> {
    const pythonBin = SLICING_CONSTANTS.PYTHON_INTERPRETER;
    const scriptPath = SLICING_CONSTANTS.PYTHON_SCRIPT_PATH;

    let stdout: string;
    try {
      const result = await execFileAsync(pythonBin, [scriptPath, videoPath], {
        timeout: SLICING_CONSTANTS.PYTHON_SCRIPT_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      });
      stdout = result.stdout;
    } catch (error) {
      const err = error as Error & { code?: string; stderr?: string };

      if (err.code === 'ENOENT') {
        const notFoundError = new Error(ERROR_MESSAGES.PYTHON_NOT_FOUND);
        (notFoundError as Error & { errorCode: string; retryable: boolean }).errorCode = 'GPU_SLICING_PYTHON_DEPENDENCY_MISSING';
        (notFoundError as Error & { errorCode: string; retryable: boolean }).retryable = false;
        throw notFoundError;
      }

      if (err.stderr) {
        if (err.stderr.includes('ModuleNotFoundError') && err.stderr.includes('decord')) {
          const depError = new Error(ERROR_MESSAGES.DECORD_IMPORT_FAILED);
          (depError as Error & { errorCode: string; retryable: boolean }).errorCode = 'GPU_SLICING_PYTHON_DEPENDENCY_MISSING';
          (depError as Error & { errorCode: string; retryable: boolean }).retryable = false;
          throw depError;
        }

        if (err.stderr.includes('ModuleNotFoundError') && err.stderr.includes('transnet')) {
          const depError = new Error(ERROR_MESSAGES.TRANSNET_IMPORT_FAILED);
          (depError as Error & { errorCode: string; retryable: boolean }).errorCode = 'GPU_SLICING_PYTHON_DEPENDENCY_MISSING';
          (depError as Error & { errorCode: string; retryable: boolean }).retryable = false;
          throw depError;
        }

        if (err.stderr.includes('FFmpeg scdet failed')) {
          const ffmpegError = new Error(ERROR_MESSAGES.FFMPEG_SCENE_DETECTION_FAILED);
          (ffmpegError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_SCENE_DETECTION_FAILED';
          throw ffmpegError;
        }

        if (err.stderr.includes('CUDA out of memory') || err.stderr.includes('RuntimeError')) {
          const cudaError = new Error(ERROR_MESSAGES.TRANSNET_CUDA_OOM);
          (cudaError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_TRANSNET_FAILED';
          throw cudaError;
        }
      }

      const execError = new Error(`${ERROR_MESSAGES.DECORD_DECODE_FAILED}: ${err.message}`);
      (execError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_SCENE_DETECTION_FAILED';
      throw execError;
    }

    if (!stdout || stdout.trim().length === 0) {
      const error = new Error('Python script returned empty output during scene detection');
      (error as Error & { errorCode: string }).errorCode = 'GPU_SLICING_SCENE_DETECTION_FAILED';
      throw error;
    }

    let parsed: DecordOutput & { error_category?: string };
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      const error = new Error('Failed to parse JSON output from Python scene detection script');
      (error as Error & { errorCode: string }).errorCode = 'GPU_SLICING_SCENE_DETECTION_FAILED';
      throw error;
    }

    if (!parsed.success) {
      if (parsed.error) {
        if (parsed.error.includes('FFmpeg scdet failed') || parsed.error_category === 'scdet') {
          const ffmpegError = new Error(ERROR_MESSAGES.FFMPEG_SCENE_DETECTION_FAILED);
          (ffmpegError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_SCENE_DETECTION_FAILED';
          throw ffmpegError;
        }

        if (parsed.error.includes('ffprobe') || parsed.error.includes('No video stream') || parsed.error_category === 'ffprobe') {
          const probeError = new Error(`${ERROR_MESSAGES.DECORD_DECODE_FAILED}: ${parsed.error}`);
          (probeError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_SCENE_DETECTION_FAILED';
          throw probeError;
        }

        if (parsed.error.includes('CUDA out of memory') || parsed.error.includes('cuda')) {
          const cudaError = new Error(ERROR_MESSAGES.TRANSNET_CUDA_OOM);
          (cudaError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_TRANSNET_FAILED';
          throw cudaError;
        }

        const sceneError = new Error(parsed.error || ERROR_MESSAGES.DECORD_DECODE_FAILED);
        (sceneError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_SCENE_DETECTION_FAILED';
        throw sceneError;
      }

      const unknownError = new Error('Scene detection failed with unknown error');
      (unknownError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_SCENE_DETECTION_FAILED';
      throw unknownError;
    }

    if (!parsed.predictions || !Array.isArray(parsed.predictions)) {
      const fallback: DecordOutput = {
        success: true,
        predictions: [],
        video_duration: parsed.video_duration || 0,
        frame_count: parsed.frame_count || 0,
      };
      return fallback;
    }

    return parsed;
  }

  /**
   * 优化切片边界
   *
   * 策略选择：
   * 1. 场景切点足够多（>=目标切片数*0.5）：以场景切点为主
   * 2. 场景切点不足：以初始切片为主，融合场景切点
   *
   * 不进行时长漂移校正，保留原始场景边界
   */
  optimizeSliceBoundaries(
    initialSlices: GatewaySliceRecord[],
    sceneCuts: SceneBoundary[],
    videoDuration: number,
  ): SliceSegment[] {
    if (videoDuration <= 0 || Number.isNaN(videoDuration)) {
      const error = new Error(`Invalid video duration: ${videoDuration}s`);
      (error as Error & { errorCode: string }).errorCode = 'GPU_SLICING_NO_VALID_SLICES';
      throw error;
    }

    // 过滤有效的场景切点（排除太靠近首尾的切点）
    const sortedSceneCuts = [...sceneCuts]
      .filter((cut) => {
        const cutMafd = cut.mafd;
        const minDist = SLICING_CONSTANTS.SLICE_MIN_DURATION_SEC;
        return (
          cut.timestamp_sec > minDist &&
          cut.timestamp_sec < videoDuration - minDist &&
          (typeof cutMafd === 'number' ? cutMafd >= 1.0 : cut.confidence >= 0.3)
        );
      })
      .sort((a, b) => a.timestamp_sec - b.timestamp_sec);

    // 计算目标切片数和场景切点数，决定使用哪种策略
    const targetSliceCount = Math.ceil(videoDuration / SLICING_CONSTANTS.SLICE_TARGET_DURATION_SEC);
    const sceneCutCount = sortedSceneCuts.length;
    const useSceneCutsAsPrimary = sceneCutCount >= targetSliceCount * 0.5;

    const adjustedEndpoints = new Set<number>();
    adjustedEndpoints.add(0.0);
    adjustedEndpoints.add(videoDuration);

    if (useSceneCutsAsPrimary) {
      // 策略1：以场景切点为主
      // 直接使用所有检测到的场景切点
      for (const cut of sortedSceneCuts) {
        adjustedEndpoints.add(cut.timestamp_sec);
      }

      // 用初始切片边界补充稀疏区域
      for (const slice of initialSlices) {
        const start = slice.start_time;
        const end = slice.end_time;
        const mid = (start + end) / 2;

        // 检查这个区域是否已经有足够的切点
        const nearbyCuts = sortedSceneCuts.filter(
          (cut) => cut.timestamp_sec >= start && cut.timestamp_sec <= end,
        );

        // 如果这个切片区域没有场景切点，且区域太长，添加中点作为补充
        if (nearbyCuts.length === 0 && end - start > SLICING_CONSTANTS.SLICE_MAX_DURATION_SEC) {
          adjustedEndpoints.add(mid);
        }
      }
    } else {
      // 策略2：以初始切片为主，融合场景切点
      const tolerance = SLICING_CONSTANTS.SCENE_CUT_TOLERANCE_SEC;

      for (const slice of initialSlices) {
        // 首先添加切片起始点
        if (slice.start_time > 0) {
          adjustedEndpoints.add(slice.start_time);
        }

        // 调整切片结束点以匹配最近的场景切点
        let adjustedEnd = slice.end_time;
        for (const cut of sortedSceneCuts) {
          if (Math.abs(cut.timestamp_sec - slice.end_time) <= tolerance) {
            adjustedEnd = cut.timestamp_sec;
            break;
          }
        }

        if (adjustedEnd > 0 && adjustedEnd < videoDuration) {
          adjustedEndpoints.add(adjustedEnd);
        }
      }

      // 添加高置信度的场景切点（补充）
      for (const cut of sortedSceneCuts) {
        if (cut.confidence >= 0.7 || (typeof cut.mafd === 'number' && cut.mafd >= 2.0)) {
          // 只添加不在已有边界附近的点
          let tooClose = false;
          for (const ep of adjustedEndpoints) {
            if (Math.abs(ep - cut.timestamp_sec) < SLICING_CONSTANTS.SCENE_CUT_TOLERANCE_SEC) {
              tooClose = true;
              break;
            }
          }
          if (!tooClose) {
            adjustedEndpoints.add(cut.timestamp_sec);
          }
        }
      }
    }

    const boundaries = Array.from(adjustedEndpoints).sort((a, b) => a - b);

    const segments: SliceSegment[] = [];

    // 构建初始分段
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      const dur = Math.round((end - start) * 100) / 100;

      if (dur < SLICING_CONSTANTS.SLICE_MIN_DURATION_SEC) {
        if (segments.length > 0) {
          const prev = segments[segments.length - 1];
          prev.end_sec = end;
          prev.duration = Math.round((end - prev.start_sec) * 100) / 100;
        }
        continue;
      }

      segments.push({
        start_sec: Math.round(start * 100) / 100,
        end_sec: Math.round(end * 100) / 100,
        duration: dur,
      });
    }

    // 拆分超长切片
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].duration > SLICING_CONSTANTS.SLICE_MAX_DURATION_SEC) {
        const seg = segments[i];
        segments.splice(i, 1);

        const subCount = Math.ceil(seg.duration / SLICING_CONSTANTS.SLICE_TARGET_DURATION_SEC);
        const subDuration = seg.duration / subCount;

        for (let j = 0; j < subCount; j++) {
          const subStart = seg.start_sec + j * subDuration;
          const subEnd = Math.min(seg.start_sec + (j + 1) * subDuration, seg.end_sec);
          const subFinalDur = Math.round((subEnd - subStart) * 100) / 100;

          if (subFinalDur >= SLICING_CONSTANTS.SLICE_MIN_DURATION_SEC) {
            segments.splice(i + j, 0, {
              start_sec: Math.round(subStart * 100) / 100,
              end_sec: Math.round(subEnd * 100) / 100,
              duration: subFinalDur,
            });
          }
        }
      }
    }

    // 如果没有生成任何切片，使用兜底策略
    if (segments.length === 0) {
      console.warn(`[SlicingProcessor] No segments generated, using fallback equal-duration slicing`);

      const fallbackCount = Math.max(1, Math.ceil(videoDuration / SLICING_CONSTANTS.SLICE_TARGET_DURATION_SEC));
      const fallbackBoundaries: number[] = [];
      for (let i = 0; i <= fallbackCount; i++) {
        fallbackBoundaries.push((videoDuration / fallbackCount) * i);
      }

      for (let i = 0; i < fallbackBoundaries.length - 1; i++) {
        const start = fallbackBoundaries[i];
        const end = fallbackBoundaries[i + 1];
        const dur = Math.round((end - start) * 100) / 100;

        if (dur >= SLICING_CONSTANTS.SLICE_MIN_DURATION_SEC) {
          segments.push({
            start_sec: Math.round(start * 100) / 100,
            end_sec: Math.round(end * 100) / 100,
            duration: dur,
          });
        }
      }
    }

    console.log(
      `[SlicingProcessor] Slice planning: scene_cuts=${sceneCutCount}, strategy=${useSceneCutsAsPrimary ? 'scene_primary' : 'initial_primary'}, final_segments=${segments.length}`,
    );

    return segments;
  }

  private async executeFfmpegSlicing(
    videoPath: string,
    segments: SliceSegment[],
    jobTempDir: string,
  ): Promise<string[]> {
    const outputPaths: string[] = [];
    const errors: Array<{ segmentIndex: number; startTime: number; endTime: number; duration: number; error: string }> = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const outputPath = join(jobTempDir, `slice_${String(i + 1).padStart(3, '0')}.mp4`);

      try {
        const copyArgs = [
          '-y',
          '-ss', segment.start_sec.toFixed(3),
          '-i', videoPath,
          '-t', segment.duration.toFixed(3),
          '-map', '0:v:0',
          '-c:v', 'copy',
          '-an',
          '-movflags', '+faststart',
          outputPath,
        ];

        try {
          await execFileAsync('ffmpeg', copyArgs, {
            timeout: SLICING_CONSTANTS.FFMPEG_CUT_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
          });
        } catch (copyError) {
          const fallbackArgs = [
            '-y',
            '-ss', segment.start_sec.toFixed(3),
            '-i', videoPath,
            '-t', segment.duration.toFixed(3),
            '-map', '0:v:0',
            '-c:v', 'mpeg4',
            '-q:v', '2',
            '-pix_fmt', 'yuv420p',
            '-an',
            '-movflags', '+faststart',
            outputPath,
          ];

          try {
            await execFileAsync('ffmpeg', fallbackArgs, {
              timeout: SLICING_CONSTANTS.FFMPEG_CUT_TIMEOUT_MS,
              maxBuffer: 1024 * 1024,
            });
          } catch (fallbackError) {
            const copyErr = copyError as Error;
            const fallbackErr = fallbackError as Error;
            throw new Error(`copy failed: ${copyErr.message}; fallback failed: ${fallbackErr.message}`);
          }
        }

        if (!existsSync(outputPath)) {
          throw new Error('FFmpeg completed but output file does not exist');
        }

        const { statSync } = await import('node:fs');
        const stat = statSync(outputPath);
        if (stat.size === 0) {
          throw new Error('FFmpeg produced empty output file');
        }

        outputPaths.push(outputPath);
      } catch (error) {
        const err = error as Error & { code?: string };

        if (err.code === 'ENOENT' && err.message.includes('ffmpeg')) {
          const ffmpegError = new Error(ERROR_MESSAGES.FFMPEG_NOT_FOUND);
          (ffmpegError as Error & { errorCode: string; retryable: boolean }).errorCode = 'GPU_SLICING_FFMPEG_NOT_FOUND';
          (ffmpegError as Error & { errorCode: string; retryable: boolean }).retryable = false;
          throw ffmpegError;
        }

        errors.push({
          segmentIndex: i,
          startTime: segment.start_sec,
          endTime: segment.end_sec,
          duration: segment.duration,
          error: err.message,
        });
      }
    }

    if (errors.length > 0) {
      const errorDetails = errors
        .map((e) => `seg#${e.segmentIndex}[${e.startTime}s-${e.endTime}s]=${e.error}`)
        .join('; ');
      const cutError = new Error(`${ERROR_MESSAGES.FFMPEG_CUT_FAILED}: ${errorDetails}`);
      (cutError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_FFMPEG_CUT_FAILED';
      throw cutError;
    }

    if (outputPaths.length === 0) {
      const cutError = new Error('FFmpeg slicing produced no output files');
      (cutError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_FFMPEG_CUT_FAILED';
      throw cutError;
    }

    return outputPaths;
  }

  private async extractKeyFrames(
    segments: SliceSegment[],
    sliceVideoPaths: string[],
    jobTempDir: string,
  ): Promise<(string | null)[]> {
    const keyFramePaths: (string | null)[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const midPoint = Math.round((segment.duration / 2) * 100) / 100;
      const keyFramePath = join(jobTempDir, `keyframe_${String(i + 1).padStart(3, '0')}.jpg`);
      const sourceVideo = sliceVideoPaths[i] || '';

      if (!sourceVideo) {
        keyFramePaths.push(null);
        continue;
      }

      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-ss', midPoint.toFixed(3),
          '-i', sourceVideo,
          '-vframes', '1',
          '-q:v', '2',
          '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease',
          keyFramePath,
        ], {
          timeout: SLICING_CONSTANTS.FFMPEG_KEYFRAME_TIMEOUT_MS,
          maxBuffer: 256 * 1024,
        });

        if (existsSync(keyFramePath)) {
          keyFramePaths.push(keyFramePath);
        } else {
          keyFramePaths.push(null);
        }
      } catch {
        console.warn(`[SlicingProcessor] Keyframe extraction failed for segment ${i} (non-blocking)`);
        keyFramePaths.push(null);
      }
    }

    return keyFramePaths;
  }

  private async uploadSliceToMinIO(
    slicePath: string,
    objectKey: string,
  ): Promise<string> {
    const { readFileSync } = await import('node:fs');
    const buffer = readFileSync(slicePath);
    return this.minio.uploadObject({
      buffer,
      objectKey,
      contentType: 'video/mp4',
    });
  }

  private async uploadKeyFrameToMinIO(
    keyFramePath: string,
    objectKey: string,
  ): Promise<string | null> {
    try {
      const { readFileSync } = await import('node:fs');
      const buffer = readFileSync(keyFramePath);
      return await this.minio.uploadObject({
        buffer,
        objectKey,
        contentType: 'image/jpeg',
      });
    } catch {
      return null;
    }
  }

  private async cleanupTemporaryFiles(jobTempDir: string): Promise<void> {
    try {
      await rm(jobTempDir, { recursive: true, force: true, maxRetries: 2 });
    } catch {
      console.warn(`[SlicingProcessor] Failed to cleanup temp directory: ${jobTempDir} (OS will evict /tmp)`);
    }
  }

  private checkJobTimeout(jobStartTime: number, processedSegments?: number): void {
    const elapsed = Date.now() - jobStartTime;
    if (elapsed > SLICING_CONSTANTS.JOB_TOTAL_TIMEOUT_MS) {
      const error = new Error(
        `${ERROR_MESSAGES.JOB_TIMEOUT} (${(elapsed / 1000).toFixed(0)}s elapsed` +
        (processedSegments !== undefined ? `, processed ${processedSegments} segments` : '') +
        ')',
      );
      (error as Error & { errorCode: string }).errorCode = 'JOB_TIMEOUT';
      throw error;
    }
  }

  generateTraceId(materialId: string): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const shortId = materialId.replace(/-/g, '').substring(0, 8);
    return `trc_${y}${m}${d}_slice_${shortId}`;
  }

  private getDatePrefix(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  private generateSliceId(materialId: string, seq: number, datePrefix: string): string {
    const materialKey = materialId.replace(/-/g, '');
    return `slc_${datePrefix}_${materialKey}_${String(seq).padStart(3, '0')}`;
  }
}