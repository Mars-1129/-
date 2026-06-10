import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectPrisma } from '@nestjs/prisma';
import { PrismaClient, CreationStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const GPU_WORKER_URL = process.env.GPU_WORKER_URL || 'http://localhost:3101';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

interface WorkerHealth {
  status: string;
  gpu: {
    available: boolean;
    vram_used_mb?: number;
    vram_total_mb?: number;
  };
  queues: {
    gpu_slicing_waiting: number;
    gpu_slicing_active: number;
  };
}

interface RedisStats {
  connected_clients: number | null;
  blocked_clients: number | null;
  used_memory_mb: number | null;
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    @InjectPrisma() private readonly prisma: PrismaClient,
    @Optional() @Inject('GPU_SLICING_QUEUE') private readonly gpuSlicingQueue: Queue | null,
    @Optional() @Inject('CREATION_QUEUE') private readonly creationQueue: Queue | null,
  ) {}

  async getResourceStats() {
    const [gpu, queue, dbStats, processStats, redisStats] = await Promise.allSettled([
      this.fetchGpuStats(),
      this.computeQueueBacklog(),
      this.computeDbStats(),
      this.fetchProcessStats(),
      this.fetchRedisStats(),
    ]);

    return {
      gpu_memory_usage: gpu.status === 'fulfilled'
        ? gpu.value
        : { used_mb: null, total_mb: null, available: false },
      cpu_usage: processStats.status === 'fulfilled'
        ? processStats.value.cpu
        : { user_us: 0, system_us: 0 },
      process_memory: processStats.status === 'fulfilled'
        ? processStats.value.memory
        : { heap_used_mb: 0, rss_mb: 0 },
      queue_backlog: queue.status === 'fulfilled'
        ? queue.value
        : { gpu_slicing_waiting: 0, gpu_slicing_active: 0, creation_waiting: 0, creation_active: 0 },
      redis_stats: redisStats.status === 'fulfilled'
        ? redisStats.value
        : { connected_clients: null, blocked_clients: null, used_memory_mb: null },
      task_success_rate: dbStats.status === 'fulfilled' ? dbStats.value.taskSuccessRate : null,
      avg_generation_duration_seconds: dbStats.status === 'fulfilled' ? dbStats.value.avgDurationSec : null,
      cache_hit_rate: dbStats.status === 'fulfilled' ? dbStats.value.cacheHitRate : null,
      timestamp: new Date().toISOString(),
    };
  }

  private async fetchGpuStats() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${GPU_WORKER_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Worker returned ${res.status}`);
      }
      const health: WorkerHealth = await res.json();
      return {
        used_mb: health.gpu?.vram_used_mb ?? null,
        total_mb: health.gpu?.vram_total_mb ?? null,
        available: health.gpu?.available ?? false,
      };
    } catch (error) {
      this.logger.warn(`GPU worker health unreachable: ${(error as Error).message}`);
      return { used_mb: null, total_mb: null, available: false };
    }
  }

  private async computeQueueBacklog() {
    try {
      const [gpuCounts, creationCounts] = await Promise.all([
        this.gpuSlicingQueue?.getJobCounts('waiting', 'active') ?? Promise.resolve({ waiting: 0, active: 0 }),
        this.creationQueue?.getJobCounts('waiting', 'active') ?? Promise.resolve({ waiting: 0, active: 0 }),
      ]);
      return {
        gpu_slicing_waiting: gpuCounts.waiting,
        gpu_slicing_active: gpuCounts.active,
        creation_waiting: creationCounts.waiting,
        creation_active: creationCounts.active,
      };
    } catch (error) {
      this.logger.warn(`Queue stats unavailable: ${(error as Error).message}`);
      return { gpu_slicing_waiting: 0, gpu_slicing_active: 0, creation_waiting: 0, creation_active: 0 };
    }
  }

  private async computeDbStats() {
    let taskSuccessRate: number | null = null;
    let avgDurationSec: number | null = null;
    let cacheHitRate: number | null = null;

    try {
      const completed = await this.prisma.creation.count({ where: { status: 'FINISHED' as const } });
      const failed = await this.prisma.creation.count({ where: { status: 'FAILED' as const } });
      const total = completed + failed;
      taskSuccessRate = total > 0 ? Math.round((completed / total) * 10000) / 100 : null;

      const durationResult = await this.prisma.$queryRawUnsafe<Array<{ avg_ms: number | null }>>(
        `SELECT AVG(EXTRACT(EPOCH FROM ("finished_at" - "started_at")) * 1000) as avg_ms FROM "public"."Creation" WHERE "finished_at" IS NOT NULL AND "started_at" IS NOT NULL`,
      );
      const avgMs = durationResult[0]?.avg_ms;
      avgDurationSec = avgMs != null ? Math.round((avgMs / 1000) * 100) / 100 : null;

      const [totalShots, cachedShots] = await Promise.all([
        this.prisma.shotRender.count(),
        this.prisma.shotRender.count({ where: { cacheHash: { not: null } } }),
      ]);
      cacheHitRate = totalShots > 0 ? Math.round((cachedShots / totalShots) * 10000) / 100 : null;
    } catch (error) {
      this.logger.warn(`DB stats unavailable: ${(error as Error).message}`);
    }

    return { taskSuccessRate, avgDurationSec, cacheHitRate };
  }

  private async fetchProcessStats() {
    const cpu = process.cpuUsage();
    const mem = process.memoryUsage();

    return {
      cpu: {
        user_us: cpu.user,
        system_us: cpu.system,
      },
      memory: {
        heap_used_mb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        rss_mb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      },
    };
  }

  private async fetchRedisStats(): Promise<RedisStats> {
    const redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    try {
      await redis.connect();
      const info = await redis.info('stats');

      const connectedClients = this.parseRedisInfoField(info, 'connected_clients');
      const blockedClients = this.parseRedisInfoField(info, 'blocked_clients');
      const usedMemoryBytes = this.parseRedisInfoField(info, 'used_memory');

      return {
        connected_clients: connectedClients != null ? Number(connectedClients) : null,
        blocked_clients: blockedClients != null ? Number(blockedClients) : null,
        used_memory_mb: usedMemoryBytes != null
          ? Math.round((Number(usedMemoryBytes) / 1024 / 1024) * 100) / 100
          : null,
      };
    } catch (error) {
      this.logger.warn(`Redis stats unavailable: ${(error as Error).message}`);
      return { connected_clients: null, blocked_clients: null, used_memory_mb: null };
    } finally {
      try { await redis.disconnect(); } catch { /* best effort */ }
    }
  }

  private parseRedisInfoField(info: string, field: string): string | null {
    const match = info.match(new RegExp(`^${field}:(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  }
}
