import { Injectable, Logger } from '@nestjs/common';
import { Client as MinioClient } from 'minio';

export interface MinioUploadParams {
  buffer: Buffer;
  objectKey: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface MinioGetResult {
  buffer: Buffer;
  contentType: string;
}

@Injectable()
export class MinioClientService {
  private readonly logger = new Logger(MinioClientService.name);
  private readonly client: MinioClient;
  private readonly bucketName: string;
  // Bug 35: 保存 endpoint 和 port 实例引用，用于公开 URL fallback
  private readonly endpoint: string;
  private readonly port: number;
  private readonly useSSL!: boolean;

  constructor() {
    this.endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    this.port = Number(process.env.MINIO_PORT || 9000);
    const accessKey = process.env.MINIO_ACCESS_KEY || 'tikstream_minio';
    const secretKey = process.env.MINIO_SECRET_KEY || 'tikstream_minio_password';
    this.bucketName = process.env.MINIO_BUCKET_NAME || 'tikstream-assets';

    this.client = new MinioClient({
      endPoint: this.endpoint,
      port: this.port,
      useSSL: false,
      accessKey,
      secretKey,
    });

    this.logger.log(`MinIO client initialized: ${this.endpoint}:${this.port}/${this.bucketName}`);
  }

  /** Bug 35: 使用实例配置的 endpoint:port 作为 fallback，替代硬编码 http://minio:9000 */
  private buildPublicUrl(objectKey: string): string {
    const baseUrl = process.env.MINIO_PUBLIC_ENDPOINT
      || `${this.useSSL ? 'https' : 'http'}://${this.endpoint}:${this.port}`;
    return `${baseUrl}/${this.bucketName}/${objectKey}`;
  }

  async putObject(params: MinioUploadParams): Promise<string> {
    const startTime = performance.now();
    const { buffer, objectKey, mimeType, fileSizeBytes } = params;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.client.putObject(this.bucketName, objectKey, buffer, fileSizeBytes, {
          'Content-Type': mimeType,
        });

        const elapsed = performance.now() - startTime;
        this.logger.log(`MinIO upload success: ${objectKey} (${fileSizeBytes} bytes, ${elapsed.toFixed(0)}ms, attempt ${attempt + 1})`);

        return this.buildPublicUrl(objectKey);
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`MinIO upload attempt ${attempt + 1} failed for ${objectKey}: ${lastError.message}`);

        if (attempt < 2) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.logger.error(`MinIO upload failed after 3 attempts: ${objectKey} - ${lastError!.message}`);
    throw new Error(`OBJECT_STORAGE_WRITE_FAILED: ${lastError!.message}`);
  }

  async getObject(objectKey: string): Promise<MinioGetResult> {
    try {
      const stream = await this.client.getObject(this.bucketName, objectKey);
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
      });

      const buffer = Buffer.concat(chunks);
      const headers = (stream as unknown as { headers?: Record<string, string> }).headers;
      const contentType = headers?.['content-type'] || 'application/octet-stream';

      return { buffer, contentType };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`MinIO getObject failed: ${objectKey} - ${err.message}`);
      throw new Error(`OBJECT_STORAGE_READ_FAILED: ${err.message}`);
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucketName, objectKey);
      this.logger.log(`MinIO object deleted: ${objectKey}`);
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`MinIO deleteObject failed (non-fatal): ${objectKey} - ${err.message}`);
    }
  }

  generatePublicUrl(objectKey: string): string {
    return this.buildPublicUrl(objectKey);
  }

  /**
   * 生成文件预签名下载 URL
   * @param objectKey - 对象 key
   * @param expiresSeconds - 签名有效期（秒），默认 3600（1小时）
   * @returns 带签名的临时访问 URL
   */
  async presignedGetUrl(objectKey: string, expiresSeconds: number = 3600): Promise<string> {
    try {
      const url = await this.client.presignedGetObject(this.bucketName, objectKey, expiresSeconds);
      return url;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`MinIO presignedGetUrl failed: ${objectKey} - ${err.message}`);
      // 降级为公开 URL
      return this.generatePublicUrl(objectKey);
    }
  }

  /**
   * 生成文件预签名上传 URL
   * @param objectKey - 对象 key
   * @param expiresSeconds - 签名有效期（秒），默认 600（10分钟）
   * @returns 带签名的临时上传 URL
   */
  async presignedPutUrl(objectKey: string, expiresSeconds: number = 600): Promise<string> {
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const url = await this.client.presignedPutObject(this.bucketName, objectKey, expiresSeconds);
        return url;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `MinIO presignedPutUrl attempt ${attempt + 1}/${maxAttempts} failed: ${objectKey} - ${lastError.message}`,
        );

        // 不可重试的永久性错误直接终止
        if (
          lastError.message.includes('AccessDenied') ||
          lastError.message.includes('NoSuchBucket') ||
          lastError.message.includes('InvalidArgument')
        ) {
          break;
        }

        if (attempt < maxAttempts - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`OBJECT_STORAGE_PRESIGNED_FAILED: ${lastError!.message}`);
  }

  /**
   * 批量生成素材相关 URL 的预签名版本
   * @param record - 包含可选的 stream_url / key_frame_url / sfx_url 字段的对象
   * @param expiresSeconds - 签名有效期
   */
  async signMaterialUrls(record: Record<string, unknown>, expiresSeconds: number = 3600): Promise<Record<string, unknown>> {
    const result = { ...record };
    const urlFields = ['stream_url', 'key_frame_url', 'sfx_url', 'thumbnail_url', 'video_url', 'export_url'];
    for (const field of urlFields) {
      const value = result[field];
      if (typeof value === 'string' && value.length > 0) {
        // 提取 objectKey：URL 格式为 http(s)://host/bucket/objectKey
        const prefix = `/${this.bucketName}/`;
        const idx = value.indexOf(prefix);
        if (idx !== -1) {
          const objectKey = value.substring(idx + prefix.length);
          result[field] = await this.presignedGetUrl(objectKey, expiresSeconds);
        }
      }
    }
    return result;
  }
}
