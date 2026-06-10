import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import Redis from 'ioredis';
import { HealthCheckResponse } from '@tikstream/shared-types';
import { env } from '../common/env';

type DependencyStatus = 'ok' | 'error';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private lastCheckResult: HealthCheckResponse | null = null;
  private lastCheckTimestamp = 0;
  private static readonly CHECK_CACHE_TTL_MS = 5000; // 5s 缓存，避免频繁 probe 重复创建连接
  private persistentRedisClient: Redis | null = null;

  constructor(@InjectPrisma() private readonly prisma: PrismaClient) {}

  async onModuleDestroy(): Promise<void> {
    if (this.persistentRedisClient) {
      try {
        await Promise.race([
          this.persistentRedisClient.quit(),
          new Promise<void>((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch { /* 静默忽略关闭异常 */ }
      // 兜底：强制断开底层 TCP 连接，防止 quit() 超时后残留僵尸连接
      try { this.persistentRedisClient.disconnect(); } catch { /* 静默忽略 disconnect 异常 */ }
      this.persistentRedisClient = null;
    }
  }

  async checkHealth(): Promise<HealthCheckResponse> {
    const now = Date.now();
    if (this.lastCheckResult && (now - this.lastCheckTimestamp) < HealthService.CHECK_CACHE_TTL_MS) {
      return this.lastCheckResult;
    }

    const [postgres, redis, qdrant, minio] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkQdrant(),
      this.checkMinio(),
    ]);

    const serviceStatuses = [postgres, redis, qdrant, minio];
    const healthyCount = serviceStatuses.filter((status) => status === 'ok').length;

    const metrics = await this.computeQueueMetrics();

    const result: HealthCheckResponse = {
      status: healthyCount === serviceStatuses.length ? 'ok' : healthyCount === 0 ? 'down' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        postgres,
        redis,
        qdrant,
        minio,
      },
      analytics: {
        duckdb: env('DB_ENABLED', 'DUCKDB_ENABLED') === 'true' && env('DB_PATH', 'DUCKDB_PATH') ? 'enabled' : 'disabled',
        mock_mode: process.env.ANALYTICS_MOCK_MODE === 'true' || !(env('DB_ENABLED', 'DUCKDB_ENABLED') === 'true' && env('DB_PATH', 'DUCKDB_PATH')),
      },
      metrics,
    };

    this.lastCheckResult = result;
    this.lastCheckTimestamp = now;

    return result;
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (error) {
      this.logger.error(`PostgreSQL health check failed: ${this.stringifyError(error)}`);
      return 'error';
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      const redis = this.getRedisClient();
      const pong = await redis.ping();
      return pong === 'PONG' ? 'ok' : 'error';
    } catch (error) {
      this.logger.error(`Redis health check failed: ${this.stringifyError(error)}`);
      return 'error';
    }
  }

  private getRedisClient(): Redis {
    if (this.persistentRedisClient) {
      const status = this.persistentRedisClient.status;
      if (status !== 'ready' && status !== 'connecting' && status !== 'connect') {
        try { this.persistentRedisClient.disconnect(); } catch { /* ignore disconnect error */ }
        this.persistentRedisClient = null;
        this.logger.warn(`Redis client was in status '${status}', reconnecting`);
      } else {
        return this.persistentRedisClient;
      }
    }
    if (!this.persistentRedisClient) {
      const redisUrl = process.env.REDIS_URL ?? `redis://${process.env.REDIS_HOST ?? 'redis'}:${process.env.REDIS_PORT ?? '6379'}`;
      this.persistentRedisClient = new Redis(redisUrl, {
        lazyConnect: false, // 立即连接，失败时 health check 会捕获
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        commandTimeout: 3000,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
      });
    }
    return this.persistentRedisClient;
  }

  /**
   * 查询 BullMQ 队列指标（通过 Redis 直连，无需引入 BullMQ 依赖）
   * BullMQ 默认 key 格式: bull:{queueName}:{type}，wait/active 为 Redis list
   */
  private async computeQueueMetrics(): Promise<{ active_tasks: number; queue_length: number }> {
    try {
      const redis = this.getRedisClient();
      const [gpuWait, gpuActive, creationWait, creationActive] = await Promise.all([
        redis.llen('bull:gpu-slicing:wait'),
        redis.llen('bull:gpu-slicing:active'),
        redis.llen('bull:creation:wait'),
        redis.llen('bull:creation:active'),
      ]);
      return {
        active_tasks: (gpuActive || 0) + (creationActive || 0),
        queue_length: (gpuWait || 0) + (creationWait || 0),
      };
    } catch {
      // 队列可能不存在（BullMQ 未初始化），降级返回 0
      return { active_tasks: 0, queue_length: 0 };
    }
  }

  private async checkQdrant(): Promise<DependencyStatus> {
    const qdrantUrl = env('QDRANT_URL', undefined, 'http://qdrant:6333');
    return this.checkHttpEndpoint(`${qdrantUrl.replace(/\/$/, '')}/readyz`, 'Qdrant');
  }

  private async checkMinio(): Promise<DependencyStatus> {
    const endpoint = process.env.MINIO_ENDPOINT || 'minio';
    const port = process.env.MINIO_PORT || '9000';
    const minioUrl = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `http://${endpoint}:${port}`;
    return this.checkHttpEndpoint(`${minioUrl.replace(/\/$/, '')}/minio/health/live`, 'MinIO');
  }

  private async checkHttpEndpoint(url: string, serviceName: string): Promise<DependencyStatus> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const response = await Promise.race([
        fetch(url, { signal: controller.signal }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new DOMException('Health check timeout', 'TimeoutError')), 2000),
        ),
      ]);
      return response.ok ? 'ok' : 'error';
    } catch (error) {
      this.logger.error(`${serviceName} health check failed: ${this.stringifyError(error)}`);
      return 'error';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
