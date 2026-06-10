// =============================================================================
// TikStream AI — Video Downloader (yt-dlp integration)
// =============================================================================

import { execFile } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SLICING_CONSTANTS } from './constants';

const execFileAsync = promisify(execFile);

export interface VideoMetadata {
  video_id: string;
  title: string;
  description: string;
  uploader: string;
  uploader_id: string;
  duration: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  upload_date: string;
  tags: string[];
  thumbnail_url: string;
  url: string;
  file_path?: string;
  file_size?: number;
  width?: number;
  height?: number;
}

export interface DownloadResult {
  success: boolean;
  metadata?: VideoMetadata;
  error?: string;
  output_path?: string;
}

export interface VideoDownloaderOptions {
  outputDir?: string;
  timeout?: number;
  onProgress?: (progress: number) => void;
}

export class VideoDownloader {
  private readonly scriptPath: string;
  private readonly defaultOutputDir: string;
  private readonly timeout: number;

  constructor(options: { scriptPath?: string; outputDir?: string; timeout?: number } = {}) {
    const scriptName = process.platform === 'win32' ? 'video_downloader.py' : 'video_downloader.py';
    this.scriptPath = join(__dirname, '..', 'python_scripts', scriptName);
    this.defaultOutputDir = options.outputDir ?? join(tmpdir(), 'tikstream-videos');
    this.timeout = options.timeout ?? 120_000;
  }

  async getVideoInfo(url: string): Promise<DownloadResult> {
    try {
      mkdirSync(this.defaultOutputDir, { recursive: true });

      const result = await execFileAsync(
        SLICING_CONSTANTS.PYTHON_INTERPRETER,
        [this.scriptPath, 'info', url],
        {
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        },
      );

      const output = JSON.parse(result.stdout.trim());

      if (!output.success) {
        return {
          success: false,
          error: output.error || 'Unknown error',
        };
      }

      return {
        success: true,
        metadata: output.metadata,
      };
    } catch (error) {
      const err = error as Error & { code?: string; stderr?: string };

      if (err.code === 'ENOENT') {
        return {
          success: false,
          error: 'yt-dlp not found. Install with: pip install yt-dlp',
        };
      }

      if (err.stderr?.includes('is not a valid URL')) {
        return {
          success: false,
          error: 'Invalid TikTok/Douyin URL',
        };
      }

      return {
        success: false,
        error: err.message || 'Failed to fetch video info',
      };
    }
  }

  async downloadVideo(url: string, outputDir?: string): Promise<DownloadResult> {
    const targetDir = outputDir || this.defaultOutputDir;

    try {
      mkdirSync(targetDir, { recursive: true });

      const result = await execFileAsync(
        SLICING_CONSTANTS.PYTHON_INTERPRETER,
        [this.scriptPath, 'download', url, targetDir],
        {
          timeout: this.timeout,
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      const output = JSON.parse(result.stdout.trim());

      if (!output.success) {
        return {
          success: false,
          error: output.error || 'Download failed',
        };
      }

      return {
        success: true,
        metadata: output.metadata,
        output_path: output.output_path,
      };
    } catch (error) {
      const err = error as Error & { code?: string; stderr?: string };

      if (err.code === 'ENOENT') {
        return {
          success: false,
          error: 'yt-dlp not found. Install with: pip install yt-dlp',
        };
      }

      if (err.stderr?.includes('was not downloaded')) {
        return {
          success: false,
          error: 'Video download incomplete - possible network issue or video unavailable',
        };
      }

      if (err.message?.includes('Timeout')) {
        return {
          success: false,
          error: 'Download timeout - video may be too large or network issue',
        };
      }

      return {
        success: false,
        error: err.message || 'Download failed',
      };
    }
  }

  async downloadAudio(url: string, outputDir?: string): Promise<DownloadResult> {
    const targetDir = outputDir || this.defaultOutputDir;

    try {
      mkdirSync(targetDir, { recursive: true });

      const result = await execFileAsync(
        SLICING_CONSTANTS.PYTHON_INTERPRETER,
        [this.scriptPath, 'audio', url, targetDir],
        {
          timeout: 60_000,
          maxBuffer: 5 * 1024 * 1024,
        },
      );

      const output = JSON.parse(result.stdout.trim());

      if (!output.success) {
        return {
          success: false,
          error: output.error || 'Audio download failed',
        };
      }

      return {
        success: true,
        metadata: output.metadata,
        output_path: output.output_path,
      };
    } catch (error) {
      const err = error as Error & { code?: string; stderr?: string };

      if (err.code === 'ENOENT') {
        return {
          success: false,
          error: 'yt-dlp not found. Install with: pip install yt-dlp',
        };
      }

      return {
        success: false,
        error: err.message || 'Audio download failed',
      };
    }
  }

  static isTikTokUrl(url: string): boolean {
    return url.toLowerCase().includes('tiktok.com');
  }

  static isDouyinUrl(url: string): boolean {
    return url.toLowerCase().includes('douyin.com') || url.toLowerCase().includes('v.douyin.com');
  }

  static isSupportedUrl(url: string): boolean {
    return this.isTikTokUrl(url) || this.isDouyinUrl(url);
  }
}