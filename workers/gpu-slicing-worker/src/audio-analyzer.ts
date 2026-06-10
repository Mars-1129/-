// =============================================================================
// TikStream AI — Audio Analyzer (HTDemucs + Faster-Whisper integration)
// =============================================================================

import { execFile } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SLICING_CONSTANTS } from './constants';

const execFileAsync = promisify(execFile);

export interface AudioSegment {
  start_sec: number;
  end_sec: number;
  text: string;
  language?: string;
  confidence?: number;
  word_timestamps?: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  start_sec: number;
  end_sec: number;
  confidence?: number;
}

export interface AsrTranscribeResult {
  success: boolean;
  duration?: number;
  segments: AudioSegment[];
  full_text?: string;
  punctuation_recovered?: boolean;
  error?: string;
}

export interface BGMStyle {
  style: string;
  tempo?: number;
  energy?: string;
  mood?: string;
}

export interface AudioAnalysisResult {
  success: boolean;
  has_vocals: boolean;
  has_bgm: boolean;
  duration?: number;
  transcription?: AudioSegment[];
  subtitle_lines?: string[];
  bgm_style?: BGMStyle;
  separated_audio_path?: Record<string, string>;
  error?: string;
}

export interface DependencyCheckResult {
  success: boolean;
  dependencies: {
    ffmpeg: boolean;
    demucs: boolean;
    faster_whisper: boolean;
  };
}

export class AudioAnalyzer {
  private readonly scriptPath: string;
  private readonly defaultOutputDir: string;

  constructor(options: { scriptPath?: string; outputDir?: string } = {}) {
    const scriptName = process.platform === 'win32' ? 'audio_analyzer.py' : 'audio_analyzer.py';
    this.scriptPath = join(__dirname, '..', 'python_scripts', scriptName);
    this.defaultOutputDir = options.outputDir ?? join(tmpdir(), 'tikstream-audio');
  }

  async checkDependencies(): Promise<DependencyCheckResult> {
    try {
      const result = await execFileAsync(
        SLICING_CONSTANTS.PYTHON_INTERPRETER,
        [this.scriptPath, 'check'],
        {
          timeout: 10_000,
          maxBuffer: 256 * 1024,
        },
      );

      const output = JSON.parse(result.stdout.trim());

      return {
        success: true,
        dependencies: output.dependencies || {
          ffmpeg: false,
          demucs: false,
          faster_whisper: false,
        },
      };
    } catch (error) {
      return {
        success: false,
        dependencies: {
          ffmpeg: false,
          demucs: false,
          faster_whisper: false,
        },
      };
    }
  }

  async analyzeVideo(videoPath: string, outputDir?: string): Promise<AudioAnalysisResult> {
    const targetDir = outputDir || this.defaultOutputDir;

    if (!existsSync(videoPath)) {
      return {
        success: false,
        has_vocals: false,
        has_bgm: false,
        error: `Video file not found: ${videoPath}`,
      };
    }

    try {
      mkdirSync(targetDir, { recursive: true });

      const result = await execFileAsync(
        SLICING_CONSTANTS.PYTHON_INTERPRETER,
        [this.scriptPath, 'analyze', videoPath, targetDir],
        {
          timeout: 300_000, // 5 minutes for audio analysis
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      const output = JSON.parse(result.stdout.trim());

      if (!output.success) {
        return {
          success: false,
          has_vocals: false,
          has_bgm: false,
          error: output.error || 'Audio analysis failed',
        };
      }

      return {
        success: true,
        has_vocals: output.has_vocals ?? false,
        has_bgm: output.has_bgm ?? false,
        duration: output.duration,
        transcription: output.transcription || undefined,
        subtitle_lines: output.subtitle_lines || undefined,
        bgm_style: output.bgm_style || undefined,
        separated_audio_path: output.separated_audio_path || undefined,
      };
    } catch (error) {
      const err = error as Error & { code?: string; stderr?: string; killed?: boolean };

      if (err.code === 'ENOENT') {
        return {
          success: false,
          has_vocals: false,
          has_bgm: false,
          error: 'Python3 not found. Ensure Python 3.8+ is installed.',
        };
      }

      if (err.killed) {
        return {
          success: false,
          has_vocals: false,
          has_bgm: false,
          error: 'Audio analysis timeout - file may be too large',
        };
      }

      return {
        success: false,
        has_vocals: false,
        has_bgm: false,
        error: err.message || 'Audio analysis failed',
      };
    }
  }

  async extractSubtitles(videoPath: string, outputDir?: string): Promise<string[]> {
    const result = await this.analyzeVideo(videoPath, outputDir);

    if (!result.success || !result.subtitle_lines) {
      return [];
    }

    return result.subtitle_lines;
  }

  async extractTranscription(videoPath: string, outputDir?: string): Promise<AudioSegment[]> {
    const result = await this.analyzeVideo(videoPath, outputDir);

    if (!result.success || !result.transcription) {
      return [];
    }

    return result.transcription;
  }

  /**
   * 纯 ASR 转录（含 word_timestamps + 标点恢复）
   * 用于字幕时间轴精确对齐
   */
  async asrTranscribe(
    audioPath: string,
    language: string = 'auto',
  ): Promise<AsrTranscribeResult> {
    if (!existsSync(audioPath)) {
      return {
        success: false,
        segments: [],
        error: `Audio file not found: ${audioPath}`,
      };
    }

    try {
      const result = await execFileAsync(
        SLICING_CONSTANTS.PYTHON_INTERPRETER,
        [this.scriptPath, 'transcribe', audioPath, language],
        {
          timeout: 300_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      const output = JSON.parse(result.stdout.trim());

      if (!output.success) {
        return {
          success: false,
          segments: [],
          error: output.error || 'ASR transcription failed',
        };
      }

      return {
        success: true,
        duration: output.duration,
        segments: output.segments || [],
        full_text: output.full_text,
        punctuation_recovered: output.punctuation_recovered ?? false,
      };
    } catch (error) {
      const err = error as Error & { code?: string; stderr?: string; killed?: boolean };

      if (err.killed) {
        return { success: false, segments: [], error: 'ASR transcription timeout' };
      }

      return {
        success: false,
        segments: [],
        error: err.message || 'ASR transcription failed',
      };
    }
  }
}