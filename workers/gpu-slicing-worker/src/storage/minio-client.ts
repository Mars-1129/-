import * as Minio from 'minio';
import { Readable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { SLICING_CONSTANTS } from '../constants';

export interface MinioUploadParams {
  buffer: Buffer;
  objectKey: string;
  contentType: string;
}

export class MinioStorageClient {
  private client: Minio.Client;

  constructor() {
    this.client = new Minio.Client({
      endPoint: SLICING_CONSTANTS.MINIO_ENDPOINT,
      port: SLICING_CONSTANTS.MINIO_PORT,
      useSSL: SLICING_CONSTANTS.MINIO_SSL,
      accessKey: SLICING_CONSTANTS.MINIO_ACCESS_KEY,
      secretKey: SLICING_CONSTANTS.MINIO_SECRET_KEY,
    });
  }

  async downloadObject(
    objectKey: string,
    outputPath: string,
    timeoutMs: number = SLICING_CONSTANTS.MINIO_DOWNLOAD_TIMEOUT_MS,
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const dataStream = await this.client.getObject(SLICING_CONSTANTS.MINIO_BUCKET, objectKey);

      let totalSize = 0;
      dataStream.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > 4 * 1024 * 1024 * 1024) {
          controller.abort();
        }
      });

      await pipeline(dataStream as unknown as NodeJS.ReadableStream, createWriteStream(outputPath));
    } catch (error) {
      const err = error as Error & { code?: string; statusCode?: number };

      if (err.code === 'NoSuchKey' || err.statusCode === 404) {
        const notFoundError = new Error(`Object not found in MinIO: ${objectKey}`);
        (notFoundError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_DOWNLOAD_FAILED';
        throw notFoundError;
      }

      const downloadError = new Error(`MinIO download failed: ${err.message}`);
      (downloadError as Error & { errorCode: string }).errorCode = 'GPU_SLICING_DOWNLOAD_FAILED';
      throw downloadError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async uploadObject(
    params: MinioUploadParams,
    timeoutMs: number = SLICING_CONSTANTS.MINIO_UPLOAD_TIMEOUT_MS,
  ): Promise<string> {
    const maxRetries = SLICING_CONSTANTS.MINIO_UPLOAD_MAX_RETRIES;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      let timeoutId: NodeJS.Timeout | undefined;

      try {
        const readableStream = Readable.from([params.buffer]);

        const uploadResult = await Promise.race([
          this.client.putObject(
            SLICING_CONSTANTS.MINIO_BUCKET,
            params.objectKey,
            readableStream,
            params.buffer.length,
            {
              'Content-Type': params.contentType,
            },
          ),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`MinIO upload timed out after ${timeoutMs}ms`));
            }, timeoutMs);
          }),
        ]);

        if (uploadResult && typeof uploadResult.etag === 'string' && uploadResult.etag.length > 0) {
          const protocol = SLICING_CONSTANTS.MINIO_SSL ? 'https' : 'http';
          return `${protocol}://${SLICING_CONSTANTS.MINIO_ENDPOINT}:${SLICING_CONSTANTS.MINIO_PORT}/${SLICING_CONSTANTS.MINIO_BUCKET}/${params.objectKey}`;
        }

        lastError = new Error('MinIO upload completed but no etag returned');
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries - 1) {
          const delay = SLICING_CONSTANTS.MINIO_UPLOAD_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    const uploadError = new Error(
      `MinIO upload failed after ${maxRetries} attempts: ${lastError?.message}`,
    );
    (uploadError as Error & { errorCode: string }).errorCode = 'OBJECT_STORAGE_WRITE_FAILED';
    throw uploadError;
  }

  generatePublicUrl(objectKey: string): string {
    const protocol = SLICING_CONSTANTS.MINIO_SSL ? 'https' : 'http';
    return `${protocol}://${SLICING_CONSTANTS.MINIO_ENDPOINT}:${SLICING_CONSTANTS.MINIO_PORT}/${SLICING_CONSTANTS.MINIO_BUCKET}/${objectKey}`;
  }

  extractObjectKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
      const bucketPrefix = `${SLICING_CONSTANTS.MINIO_BUCKET}/`;
      if (path.startsWith(bucketPrefix)) {
        return path.substring(bucketPrefix.length);
      }
      return path;
    } catch {
      return url;
    }
  }
}
