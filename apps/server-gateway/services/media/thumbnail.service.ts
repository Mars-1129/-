import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface ThumbnailResult {
  thumbnailBuffer: Buffer;
  thumbMimeType: string;
}

@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);
  private static readonly THUMB_WIDTH = 360;
  private static readonly THUMB_HEIGHT = 640;
  private static readonly FFMPEG_TIMEOUT_MS = 15_000;

  async generate(buffer: Buffer, mimeType: string): Promise<ThumbnailResult> {
    if (mimeType.startsWith('image/')) {
      return this.generateImageThumbnail(buffer, mimeType);
    }

    if (mimeType.startsWith('video/')) {
      return this.generateVideoThumbnail(buffer);
    }

    this.logger.warn(`Unsupported mime type for thumbnail: ${mimeType}`);
    throw new Error(`Unsupported mime type for thumbnail: ${mimeType}`);
  }

  private async generateImageThumbnail(buffer: Buffer, mimeType: string): Promise<ThumbnailResult> {
    let sharpModule: { default: (input: Buffer) => import('sharp').Sharp };
    try {
      sharpModule = await import('sharp') as { default: (input: Buffer) => import('sharp').Sharp };
    } catch {
      this.logger.warn('sharp module not available, returning original buffer as thumbnail');
      return { thumbnailBuffer: buffer, thumbMimeType: mimeType };
    }

    try {
      const thumbBuffer = await sharpModule.default(buffer)
        .resize(ThumbnailService.THUMB_WIDTH, ThumbnailService.THUMB_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();

      this.logger.log(`Image thumbnail generated: ${thumbBuffer.length} bytes`);

      return { thumbnailBuffer: thumbBuffer, thumbMimeType: 'image/webp' };
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Image thumbnail generation failed: ${err.message}`);
      return { thumbnailBuffer: buffer, thumbMimeType: mimeType };
    }
  }

  private async generateVideoThumbnail(buffer: Buffer): Promise<ThumbnailResult> {
    const tempDir = await mkdtemp(join(tmpdir(), 'tikstream-thumb-'));
    const videoPath = join(tempDir, `${randomUUID()}.mp4`);
    const frameOutputPath = join(tempDir, `${randomUUID()}.png`);

    try {
      await writeFile(videoPath, buffer);

      await this.extractFrame(videoPath, frameOutputPath, 1.0);

      let sharpModule: { default: (input: Buffer) => import('sharp').Sharp };
      try {
        sharpModule = await import('sharp') as { default: (input: Buffer) => import('sharp').Sharp };
      } catch {
        this.logger.error('sharp not available for video thumbnail');
        throw new Error('sharp module not available for video thumbnail processing');
      }

      const frameBuffer = await import('node:fs').then((fs) => fs.promises.readFile(frameOutputPath));

      const thumbBuffer = await sharpModule.default(frameBuffer)
        .resize(ThumbnailService.THUMB_WIDTH, ThumbnailService.THUMB_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();

      this.logger.log(`Video thumbnail generated: ${thumbBuffer.length} bytes`);

      return { thumbnailBuffer: thumbBuffer, thumbMimeType: 'image/webp' };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Video thumbnail generation failed: ${err.message}`);
      throw error;
    } finally {
      await this.cleanupTempFiles(tempDir, [videoPath, frameOutputPath]);
    }
  }

  private extractFrame(videoPath: string, outputPath: string, seekSeconds: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const args = [
        '-ss', String(seekSeconds),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputPath,
      ];

      const child = execFile('ffmpeg', args, {
        timeout: ThumbnailService.FFMPEG_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });

      child.stderr?.on('data', () => {});

      child.on('error', (err: NodeJS.ErrnoException) => {
        reject(err);
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg frame extraction exited with code ${code ?? 'signal'}`));
        }
      });
    });
  }

  private async cleanupTempFiles(tempDir: string, filePaths: string[]): Promise<void> {
    for (const fp of filePaths) {
      try {
        await unlink(fp);
      } catch {}
    }
    try {
      const rmAsync = (await import('node:fs/promises')).rm;
      await rmAsync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
