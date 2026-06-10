import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  mimeType: string;
  codecName: string;
  bitRate: number;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  bit_rate?: string;
}

interface FfprobeFormat {
  duration?: string;
  bit_rate?: string;
  format_name?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

@Injectable()
export class MediaProbeService {
  private readonly logger = new Logger(MediaProbeService.name);
  private static readonly PROBE_TIMEOUT_MS = 30_000;

  async probeVideo(buffer: Buffer): Promise<VideoMetadata> {
    const tempDir = await mkdtemp(join(tmpdir(), 'tikstream-probe-'));
    const tempFilePath = join(tempDir, `${randomUUID()}.mp4`);

    try {
      await writeFile(tempFilePath, buffer);

      const metadata = await this.runFfprobe(tempFilePath);

      this.logger.log(`Video probed: ${metadata.durationSeconds}s, ${metadata.width}x${metadata.height}, codec=${metadata.codecName}`);

      return metadata;
    } catch (error) {
      const err = error as Error;

      if (err.message.includes('ENOENT') || err.message.includes('ffprobe')) {
        this.logger.error('FFprobe binary not found. Please install FFmpeg 6+');
        throw new Error('INTERNAL_SERVER_ERROR: FFprobe executable not available');
      }

      if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
        this.logger.error(`FFprobe probe timed out after ${MediaProbeService.PROBE_TIMEOUT_MS}ms`);
        throw new Error('INTERNAL_SERVER_ERROR: FFprobe probe timed out');
      }

      this.logger.error(`FFprobe probe failed: ${err.message}`);
      throw new Error(`INTERNAL_SERVER_ERROR: FFprobe probe failed: ${err.message}`);
    } finally {
      await this.cleanupTemp(tempFilePath);
    }
  }

  private runFfprobe(filePath: string): Promise<VideoMetadata> {
    return new Promise<VideoMetadata>((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath,
      ];

      let stdout = '';
      let stderr = '';
      let killed = false;

      const child = execFile('ffprobe', args, {
        timeout: MediaProbeService.PROBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
        reject(new Error('timeout'));
      }, MediaProbeService.PROBE_TIMEOUT_MS);

      child.stdout?.on('data', (data: string) => {
        stdout += data;
      });

      child.stderr?.on('data', (data: string) => {
        stderr += data;
      });

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (!killed) {
          if (err.code === 'ENOENT') {
            reject(new Error('ENOENT: ffprobe binary not found'));
          } else {
            reject(err);
          }
        }
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timer);

        if (killed) {
          return;
        }

        if (code !== 0 && !stdout) {
          reject(new Error(`ffprobe exited with code ${code}: ${stderr || 'unknown error'}`));
          return;
        }

        try {
          const parsed: FfprobeOutput = JSON.parse(stdout);
          const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
          const format = parsed.format;

          if (!videoStream) {
            reject(new Error('No video stream found in the file'));
            return;
          }

          const metadata: VideoMetadata = {
            durationSeconds: this.parseDuration(format?.duration || videoStream.duration || '0'),
            width: videoStream.width || 0,
            height: videoStream.height || 0,
            mimeType: 'video/mp4',
            codecName: videoStream.codec_name || 'unknown',
            bitRate: Number(format?.bit_rate || videoStream.bit_rate || 0),
          };

          resolve(metadata);
        } catch (parseError) {
          if (stderr) {
            reject(new Error(`ffprobe JSON parse error: ${stderr}`));
          } else {
            reject(new Error(`ffprobe JSON parse error: ${(parseError as Error).message}`));
          }
        }
      });
    });
  }

  private parseDuration(durationStr: string): number {
    const parsed = parseFloat(durationStr);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.round(parsed * 100) / 100;
  }

  private async cleanupTemp(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      this.logger.warn(`Failed to cleanup temp probe file: ${filePath}`);
    }
  }
}
