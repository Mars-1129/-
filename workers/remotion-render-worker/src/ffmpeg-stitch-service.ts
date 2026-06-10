/**
 * FFmpeg Stitch Service
 *
 * 视频拼接服务：使用 FFmpeg 合并视频片段、音频、字幕
 * 支持真实音视频合成、BGM 混音、SRT 字幕烧录、响度标准化
 */

import { execFile } from 'node:child_process';
import { createWriteStream, writeFileSync, statSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { promisify } from 'node:util';
import { buildWatermarkFilters } from './watermark/watermark-filters';
import { WatermarkConfig } from './watermark/watermark.constants';

const execFileAsync = promisify(execFile);

export interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
}

export type TransitionType = 'None' | 'Fade_In' | 'Dissolve' | 'Wipe';

export interface ShotTransition {
  /** 转场类型 */
  type: TransitionType;
  /** 转场持续时间（秒），默认 0.5 */
  duration_sec?: number;
}

/** 智能语音增强配置 */
export interface VoiceEnhancementConfig {
  /** 是否启用语音增强（关闭时不影响现有管线） */
  enabled: boolean;
  /** 降噪强度：off / light / medium / heavy，默认 medium */
  noiseReduction?: 'off' | 'light' | 'medium' | 'heavy';
  /** 动态范围压缩，默认 true */
  dynamicCompression?: boolean;
  /** 人声清晰度增强（高通+中频EQ提升），默认 true */
  clarityBoost?: boolean;
  /** 齿音消除（高频衰减），默认 true */
  deEssing?: boolean;
  /** 增强后输出增益（默认 1.2，补偿处理后可能降低的响度） */
  outputGain?: number;
}

export interface StitchInput {
  videoPaths: string[];
  voiceoverPaths?: string[];
  bgmPath?: string;
  bgmVolume?: number;
  voiceoverVolume?: number;
  /** 音频混音控制：是否保留原素材视频音轨 */
  keepOriginalVideoAudio?: boolean;
  /** 音频混音控制：是否启用 TTS 旁白 */
  enableTtsVoiceover?: boolean;
  /** 音频混音控制：是否启用 BGM */
  enableBgm?: boolean;
  subtitles?: SubtitleEntry[];
  /** 分镜间转场配置，长度 = videoPaths.length - 1 */
  transitions?: ShotTransition[];
  resolution?: string;
  fps?: number;
  videoBitrate?: string;
  enableLoudnorm?: boolean;
  targetLufs?: number;
  targetTp?: number;
  targetLra?: number;
  /** 输出格式: mp4 / mov / webm（默认 mp4） */
  format?: string;
  /** 逐视频裁切区域（对应 videoPaths 同索引），用于 9:16 自适应裁切；null/undefined 则跳过裁切 */
  cropRegions?: Array<{ x: number; y: number; w: number; h: number } | undefined>;
  /** 智能语音增强配置（对旁白人声进行降噪、压缩、清晰度增强、齿音消除） */
  voiceEnhancement?: VoiceEnhancementConfig;
  /** 水印配置 */
  watermark?: WatermarkConfig;
  /** 预期视频总时长（秒），用作 FFmpeg -t 硬截断兜底，防止素材时长异常导致输出超长 */
  expectedTotalDuration?: number;
}

export interface StitchResult {
  success: boolean;
  outputPath?: string;
  duration?: number;
  fileSize?: number;
  error?: string;
}

export interface StitchConfig {
  tempDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  workDir: string;
  maxConcurrency: number;
  timeoutMs: number;
  resolution?: string;
}

const DEFAULT_CONFIG: StitchConfig = {
  tempDir: process.env.FFMPEG_TEMP_DIR || '/tmp/tikstream-stitch',
  ffmpegPath: process.env.FFMPEG_BINARY || 'ffmpeg',
  ffprobePath: process.env.FFPROBE_BINARY || 'ffprobe',
  workDir: process.env.REMOTION_RENDER_ARTIFACT_DIR || '/tmp/tikstream-artifacts',
  maxConcurrency: 1,
  timeoutMs: 300_000,
};

export class FfmpegStitchService {
  private config: StitchConfig;
  private tempFiles: string[] = [];

  constructor(config: Partial<StitchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async stitch(input: StitchInput): Promise<StitchResult> {
    const {
      videoPaths,
      voiceoverPaths,
      bgmPath,
      bgmVolume = 0.3,
      voiceoverVolume = 1.0,
      keepOriginalVideoAudio = true,
      enableTtsVoiceover = true,
      enableBgm = true,
      subtitles,
      resolution = '1080x1920',
      fps = 30,
      videoBitrate = '2000k',
      enableLoudnorm = true,
      targetLufs = -14,
      targetTp = -1,
      targetLra = 11,
      cropRegions,
      voiceEnhancement,
      expectedTotalDuration,
    } = input;

    this.tempFiles = [];

    try {
      mkdirSync(this.config.tempDir, { recursive: true });
      mkdirSync(this.config.workDir, { recursive: true });

      const outputFormat = (input.format || 'mp4').toLowerCase();
      const extension = outputFormat === 'mov' ? 'mov' : outputFormat === 'webm' ? 'webm' : 'mp4';
      const outputFileName = `stitch_${randomUUID()}.${extension}`;
      const outputPath = join(this.config.workDir, outputFileName);

      // --- Phase 1: Resolve video paths ---
      // Replace builtin://fallback_video with a locally generated color video
      const localVideoPaths: string[] = [];
      for (const path of videoPaths) {
        if (path === 'builtin://fallback_video') {
          const fallback = await this.generateFallbackVideo(resolution);
          localVideoPaths.push(fallback);
        } else if (path.startsWith('http://') || path.startsWith('https://')) {
          const local = await this.downloadFile(path, 'mp4');
          localVideoPaths.push(local);
        } else {
          localVideoPaths.push(path);
        }
      }

      // Filter to only existing, readable paths
      const validVideoPaths = localVideoPaths.filter((p) => {
        try {
          return existsSync(p) && statSync(p).isFile();
        } catch {
          return false;
        }
      });

      if (validVideoPaths.length === 0) {
        return { success: false, error: 'No valid video inputs available' };
      }

      // --- Phase 2: Resolve audio paths ---
      // Filter mock:// and builtin:// from voiceovers, download remote URLs
      const localVoiceoverPaths: string[] = [];
      if (voiceoverPaths) {
        for (const p of voiceoverPaths) {
          if (p.startsWith('mock://') || p.startsWith('builtin://')) {
            continue; // skip sentinel URLs
          }
          if (p.startsWith('http://') || p.startsWith('https://')) {
            const local = await this.downloadFile(p, 'mp3');
            localVoiceoverPaths.push(local);
          } else {
            localVoiceoverPaths.push(p);
          }
        }
      }

      // Resolve BGM path
      let localBgmPath: string | undefined;
      if (bgmPath && !bgmPath.startsWith('builtin://') && !bgmPath.startsWith('mock://')) {
        if (bgmPath.startsWith('http://') || bgmPath.startsWith('https://')) {
          localBgmPath = await this.downloadFile(bgmPath, 'mp3');
        } else {
          localBgmPath = bgmPath;
        }
      }

      // --- Phase 3: Probe audio streams from each video ---
      const videoHasAudio: boolean[] = [];
      for (const vp of validVideoPaths) {
        videoHasAudio.push(await this.hasAudioStream(vp));
      }

      // --- Phase 4: Generate ASS subtitle file with preview-matching style ---
      const parts = resolution.split('x').map(Number);
      const targetWidth = Number.isFinite(parts[0]) && parts[0] > 0 ? parts[0] : 1080;
      const targetHeight = Number.isFinite(parts[1]) && parts[1] > 0 ? parts[1] : 1920;
      let subtitleFilePath: string | undefined;
      if (subtitles && subtitles.length > 0) {
        subtitleFilePath = join(this.config.tempDir, `subs_${randomUUID()}.ass`);
        const assContent = this.buildAssContent(subtitles, targetWidth, targetHeight);
        writeFileSync(subtitleFilePath, assContent, 'utf-8');
      }

      // --- Phase 5: Build FFmpeg arguments ---
      const args: string[] = ['-y'];

      // Video inputs
      validVideoPaths.forEach((p) => args.push('-i', p));

      // Voiceover audio inputs (filter out empty)
      const validVoiceovers = localVoiceoverPaths.filter((p) => existsSync(p));
      validVoiceovers.forEach((p) => args.push('-i', p));

      // BGM input
      if (localBgmPath && existsSync(localBgmPath)) {
        args.push('-i', localBgmPath);
      }

      // Build filter complex
      const filters_complex: string[] = [];
      const inputCount = validVideoPaths.length;

      // --- Video: normalize each input to target resolution/fps, then concat ---
      const validVideoCount = validVideoPaths.length;
      const normalizedVideoLabels: string[] = [];
      for (let vi = 0; vi < validVideoCount; vi++) {
        const outLabel = `[v${vi}]`;
        normalizedVideoLabels.push(outLabel);
        const region = cropRegions?.[vi];
        if (region && region.w > 0 && region.h > 0) {
          // 有裁切区域：crop → scale（主体居中，无黑边）
          filters_complex.push(
            `[${vi}:v]crop=${region.w}:${region.h}:${region.x}:${region.y},scale=${targetWidth}:${targetHeight},fps=${fps},setsar=1${outLabel}`,
          );
        } else {
          // 无裁切区域：scale+pad（letterbox/pillarbox 黑边填充）
          filters_complex.push(
            `[${vi}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1${outLabel}`,
          );
        }
      }

      if (validVideoCount > 1) {
        filters_complex.push(
          `${normalizedVideoLabels.join('')}concat=n=${validVideoCount}:v=1:a=0[outv_base]`,
        );
      } else {
        filters_complex.push(`${normalizedVideoLabels[0]}null[outv_base]`);
      }

      // --- Subtitle burn-in: ASS format with preview-matching style ---
      if (subtitleFilePath) {
        const escapedPath = subtitleFilePath
          .replace(/\\/g, '\\\\')
          .replace(/:/g, '\\:')
          .replace(/'/g, "\\'")
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r');
        filters_complex.push(
          `[outv_base]ass='${escapedPath}'[outv_pre]`,
        );
      } else {
        filters_complex.push(`[outv_base]null[outv_pre]`);
      }

      // --- Watermark: visible drawtext + invisible metadata ---
      const wmConfig = input.watermark;
      if (wmConfig && wmConfig.enabled) {
        const resolution = this.config.resolution || '1080x1920';
        const wmResult = buildWatermarkFilters({
          config: wmConfig,
          resolution,
          labelIn: '[outv_pre]',
          labelOut: '[outv]',
        });
        filters_complex.push(...wmResult.filters);

        // Inject metadata args BEFORE output path
        if (wmResult.metadataArgs.length > 0) {
          // We'll append these just before output path
          // Save them for later injection
          (this as Record<string, unknown>)._wmPendingMetadata = wmResult.metadataArgs;
        }
      } else {
        filters_complex.push(`[outv_pre]null[outv]`);
      }

      // --- Audio: build filter chain ---
      const audioFilters: string[] = [];
      const audioLabels: string[] = [];
      let audioIdx = 0;

      // Probe each video's duration for time-aligned audio delays
      const videoDurations: number[] = [];
      for (const vp of validVideoPaths) {
        videoDurations.push(await this.getDuration(vp) || 6);
      }
      const cumulativeDelays: number[] = [];
      let cumSum = 0;
      for (let vi = 0; vi < validVideoCount; vi++) {
        cumulativeDelays.push(cumSum);
        cumSum += videoDurations[vi];
      }

      // Video audio streams — controlled by keepOriginalVideoAudio config
      if (keepOriginalVideoAudio) {
        for (let vi = 0; vi < validVideoCount; vi++) {
          if (videoHasAudio[vi]) {
            const label = `[a${audioIdx}]`;
            const delayMs = Math.round(cumulativeDelays[vi] * 1000);
            const adelayFilter = delayMs > 0 ? `adelay=${delayMs}|${delayMs},` : '';
            audioFilters.push(`[${vi}:a]${adelayFilter}anull${label}`);
            audioLabels.push(label);
            audioIdx++;
          }
        }
      }

      // Voiceover streams — controlled by enableTtsVoiceover config
      if (enableTtsVoiceover) {
        const voiceEnhanceChain = voiceEnhancement?.enabled
          ? `,${this.buildVoiceEnhancementChain(voiceEnhancement)}`
          : '';
        for (let vi = 0; vi < validVoiceovers.length; vi++) {
          const label = `[a${audioIdx}]`;
          const inputIdx = inputCount + vi;
          // Voiceover delay matches the corresponding shot's cumulative start time
          const delayMs = vi < cumulativeDelays.length ? Math.round(cumulativeDelays[vi] * 1000) : 0;
          const adelayFilter = delayMs > 0 ? `adelay=${delayMs}|${delayMs},` : '';
          audioFilters.push(`[${inputIdx}:a]${adelayFilter}volume=${voiceoverVolume}${voiceEnhanceChain}${label}`);
          audioLabels.push(label);
          audioIdx++;
        }
      }

      // BGM — controlled by enableBgm config
      const bgmInputIdx = inputCount + validVoiceovers.length;
      if (enableBgm && localBgmPath && existsSync(localBgmPath)) {
        const label = `[a${audioIdx}]`;
        audioFilters.push(`[${bgmInputIdx}:a]volume=${bgmVolume}${label}`);
        audioLabels.push(label);
        audioIdx++;
      }

      // If we have audio inputs, build the mixing filter
      if (audioLabels.length > 0) {
        if (audioLabels.length === 1) {
          // Single audio input: chain the filters
          // audioFilters[0] = "[3:a]volume=1[a0]"
          // need to connect: [a0] -> loudnorm
          const intermediateLabel = audioLabels[0]; // "[a0]"
          if (enableLoudnorm) {
            filters_complex.push(
              `${audioFilters[0]};${intermediateLabel}loudnorm=I=${targetLufs}:TP=${targetTp}:LRA=${targetLra}[outa]`,
            );
          } else {
            filters_complex.push(
              `${audioFilters[0]};${intermediateLabel}anull[outa]`,
            );
          }
        } else {
          // Multiple audio inputs: each filter produces output, then mix
          const amixInputs = audioLabels.join('');
          if (enableLoudnorm) {
            filters_complex.push(
              `${audioFilters.join(';')};${amixInputs}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=2,loudnorm=I=${targetLufs}:TP=${targetTp}:LRA=${targetLra}[outa]`,
            );
          } else {
            filters_complex.push(
              `${audioFilters.join(';')};${amixInputs}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=2[outa]`,
            );
          }
        }
      } else {
        // No audio inputs: generate silent stereo track
        // AAC 编码器需要立体声，使用 anullsrc 生成静音音轨
        // 计算所有视频片段的总时长作为静音轨 duration
        const durations = await Promise.all(validVideoPaths.map((p) => this.getDuration(p)));
        const totalDuration = durations.reduce((sum: number, d) => sum + (d || 0), 0) || 6;
        filters_complex.push(`anullsrc=channel_layout=stereo:sample_rate=44100:duration=${totalDuration}[outa]`);
      }

      args.push('-filter_complex', filters_complex.join(';'));
      args.push('-map', '[outv]');
      args.push('-map', '[outa]');

      // Video codec
      args.push(
        '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
        '-r', String(fps),
        '-b:v', videoBitrate,
      );

      // Audio codec
      args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '44100');

      // Container
      args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart');

      // --- Watermark metadata injection (copyright / invisible payload) ---
      const wmMetadata = (this as Record<string, unknown>)._wmPendingMetadata as string[] | undefined;
      if (wmMetadata && wmMetadata.length > 0) {
        args.push(...wmMetadata);
        delete (this as Record<string, unknown>)._wmPendingMetadata;
      }

      // --- Hard duration cap: prevent over-length output from untrimmed source videos ---
      if (expectedTotalDuration && Number.isFinite(expectedTotalDuration) && expectedTotalDuration > 0) {
        args.push('-t', String(expectedTotalDuration));
      }

      args.push(outputPath);

      console.log(`[FfmpegStitchService] Running: ffmpeg ${args.join(' ')}`);
      await execFileAsync(this.config.ffmpegPath, args, { timeout: this.config.timeoutMs });

      const stats = statSync(outputPath);
      const duration = await this.getDuration(outputPath);

      return {
        success: true,
        outputPath,
        duration,
        fileSize: stats.size,
      };
    } catch (error) {
      console.error('[FfmpegStitchService] Stitch failed:', error);
      return {
        success: false,
        error: `Stitch failed: ${(error as Error).message}`,
      };
    } finally {
      await this.cleanupTempFiles();
    }
  }

  private async downloadFile(url: string, ext: string, redirectCount = 0): Promise<string> {
    const MAX_REDIRECTS = 5;
    const DOWNLOAD_TIMEOUT_MS = 120000;

    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error(`Too many redirects (${MAX_REDIRECTS}+) downloading ${url}`);
    }

    const fileName = `download_${randomUUID()}.${ext}`;
    const filePath = join(this.config.tempDir, fileName);
    this.tempFiles.push(filePath);

    return new Promise((resolvePromise, reject) => {
      const file = createWriteStream(filePath);
      const get = url.startsWith('https://') ? httpsGet : httpGet;

      const req = get(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            unlinkSync(filePath);
            const idx = this.tempFiles.indexOf(filePath);
            if (idx > -1) this.tempFiles.splice(idx, 1);
            this.downloadFile(redirectUrl, ext, redirectCount + 1).then(resolvePromise).catch(reject);
            return;
          }
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolvePromise(filePath);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        file.close();
        reject(new Error(`Download timed out: ${url}`));
      });
    });
  }

  private async generateFallbackVideo(resolution: string): Promise<string> {
    const [width, height] = resolution.split('x').map(Number);
    const fileName = `fallback_${randomUUID()}.mp4`;
    const filePath = join(this.config.tempDir, fileName);
    this.tempFiles.push(filePath);

    // Use FFmpeg testsrc2 to generate a color bars + motion test video
    await execFileAsync(this.config.ffmpegPath, [
      '-y',
      '-f', 'lavfi',
      '-i', `testsrc2=size=${width}x${height}:rate=30:duration=3`,
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
      filePath,
    ], { timeout: 30000 });

    return filePath;
  }

  private async hasAudioStream(filePath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(this.config.ffprobePath, [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0',
        filePath,
      ]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async cleanupTempFiles(): Promise<void> {
    for (const filePath of this.tempFiles) {
      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch {
        // best effort cleanup
      }
    }
    this.tempFiles = [];
  }

  private formatSrtTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Build ASS (Advanced SubStation Alpha) subtitle content matching the Remotion preview style.
   *
   * Preview styling reference (from CreationPreviewPlayer.tsx):
   *   - Font: system-ui/sans-serif, 48px, weight 600
   *   - Background: rgba(0,0,0,0.72) semi-transparent black pill
   *   - Border-radius: 12px (approximated via BorderStyle=3 box)
   *   - Text-shadow: 0 2px 8px rgba(0,0,0,0.6) (approximated via Shadow=2)
   *   - Position: centered within safe_zone [0.1, 0.72, 0.9, 0.92] (1080x1920)
   */
  private buildAssContent(
    subtitles: SubtitleEntry[],
    canvasWidth: number,
    canvasHeight: number,
  ): string {
    // Safe zone bottom margin: canvasHeight * (1 - safe_bottom)
    // For 9:16 portrait (1080x1920): 1920 * (1 - 0.92) = 154
    const safeZoneBottom = 0.92;
    const marginV = Math.round(canvasHeight * (1 - safeZoneBottom));

    // ASS color format: &HAABBGGRR (AA=alpha, BB=blue, GG=green, RR=red)
    // rgba(0,0,0,0.72) → alpha = 0.72 * 255 = 184 = 0xB8 → &HB8000000
    const backColour = '&HB8000000';

    const header = [
      '[Script Info]',
      'ScriptType: v4.00+',
      `PlayResX: ${canvasWidth}`,
      `PlayResY: ${canvasHeight}`,
      'WrapStyle: 2',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      // BorderStyle=3: opaque box (background color fills text bounding box)
      // Alignment=2: bottom-center
      `Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,${backColour},1,0,0,0,100,100,0,0,3,2,2,2,10,10,${marginV},1`,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ];

    const dialogues = subtitles.map((sub) => {
      const start = this.formatAssTime(sub.start);
      const end = this.formatAssTime(sub.end);
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${sub.text}`;
    });

    return [...header, ...dialogues].join('\n');
  }

  private formatAssTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.round((seconds % 1) * 100);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }

  /**
   * 构建智能语音增强 FFmpeg filter chain。
   *
   * 增强链路（按序）：
   *   1. anlmdn       — 自适应降噪（非语音区域衰减）
   *   2. highpass     — 高通滤波（消除 80Hz 以下低频杂音）
   *   3. compand      — 动态范围压缩（提升响度一致性）
   *   4. equalizer    — 中频 3kHz 提升 2dB（增强人声清晰度）
   *   5. equalizer    — 高频 9kHz 衰减 1.5dB（齿音消除）
   *   6. volume       — 输出增益补偿（默认 1.2 倍）
   *
   * 所有 filter 使用 FFmpeg 原生实现，零额外依赖。
   */
  private buildVoiceEnhancementChain(config: VoiceEnhancementConfig): string {
    const filters: string[] = [];

    // 1. Noise Reduction (anlmdn)
    const nrLevel = config.noiseReduction || 'medium';
    if (nrLevel !== 'off') {
      const strengthMap: Record<string, number> = { light: 7, medium: 10, heavy: 15 };
      const s = strengthMap[nrLevel] ?? 10;
      filters.push(`anlmdn=s=${s}`);
    }

    // 2. Highpass — remove sub-bass rumble (<80Hz)
    if (config.clarityBoost !== false) {
      filters.push('highpass=f=80');
    }

    // 3. Dynamic Compression (compand)
    if (config.dynamicCompression !== false) {
      // 柔和人声压缩曲线：低于-45dB 为噪声地板，-27~-12dB 为正常语音动态范围
      filters.push(
        'compand=attacks=0.001:decays=0.5:points=-80/-80|-45/-20|-27/-12|0/-6|20/-6:gain=3',
      );
    }

    // 4. Clarity EQ — 中频提升增强语音清晰度
    if (config.clarityBoost !== false) {
      filters.push('equalizer=f=3000:width=200:g=2');
    }

    // 5. De-essing — 高频衰减消除齿音
    if (config.deEssing !== false) {
      filters.push('equalizer=f=9000:width=2000:g=-1.5');
    }

    // 6. Output gain compensation
    const gain = config.outputGain ?? 1.2;
    filters.push(`volume=${gain}`);

    return filters.join(',');
  }

  async getDuration(filePath: string): Promise<number | undefined> {
    try {
      const { stdout } = await execFileAsync(this.config.ffprobePath, [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
      ]);
      const val = parseFloat(stdout.trim());
      return isNaN(val) ? undefined : val;
    } catch {
      return undefined;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await execFileAsync(this.config.ffmpegPath, ['-version']);
      return true;
    } catch {
      return false;
    }
  }
}

/** 将 TikStream 转场类型映射为 FFmpeg xfade transition 名称 */
function mapTransitionToXfade(type: TransitionType): string {
  switch (type) {
    case 'Dissolve':
      return 'dissolve';
    case 'Fade_In':
      return 'fade';
    case 'Wipe':
      return 'wiperight';
    default:
      return 'dissolve';
  }
}

let stitchServiceInstance: FfmpegStitchService | null = null;

export function getStitchService(): FfmpegStitchService {
  if (!stitchServiceInstance) {
    stitchServiceInstance = new FfmpegStitchService();
  }
  return stitchServiceInstance;
}