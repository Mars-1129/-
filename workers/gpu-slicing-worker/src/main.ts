import { loadWorkspaceEnv } from './workspace-root';

loadWorkspaceEnv();

import { execFile } from 'node:child_process';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { Worker, Queue } from 'bullmq';
import { default as Redis } from 'ioredis';
import { SLICING_CONSTANTS } from './constants';
import { SlicingProcessor } from './slicing.processor';
import { SliceJobPayload, WorkerHealth, HealthStatus, GpuStatus } from './types';
import { AutocutProcessor } from './autocut/autocut.processor';
import { AUTOCUT_CONSTANTS } from './autocut/autocut.constants';
import { AutocutJobPayload } from './autocut/autocut.types';

const execFileAsync = promisify(execFile);

function createRedisConnection(overrides: Record<string, unknown> = {}): Redis {
  return new Redis({
    host: SLICING_CONSTANTS.REDIS_HOST,
    port: SLICING_CONSTANTS.REDIS_PORT,
    password: SLICING_CONSTANTS.REDIS_PASSWORD,
    db: SLICING_CONSTANTS.REDIS_DB,
    ...overrides,
  });
}

let activeWorker: Worker | null = null;
let autocutWorker: Worker | null = null;
let healthServer: ReturnType<typeof createServer> | null = null;

async function checkRedis(): Promise<HealthStatus> {
  const redis = createRedisConnection({
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    commandTimeout: 3000,
  });

  try {
    await redis.connect();
    const result = await redis.ping();
    return result === 'PONG' ? 'ok' : 'error';
  } catch {
    return 'error';
  } finally {
    redis.disconnect();
  }
}

async function checkBullMq(): Promise<{ status: HealthStatus; waiting: number; active: number }> {
  const connection = createRedisConnection({
    maxRetriesPerRequest: null,
    connectTimeout: 3000,
    commandTimeout: 3000,
  });
  const queue = new Queue(SLICING_CONSTANTS.QUEUE_NAME, { connection });

  try {
    const counts = await queue.getJobCounts('waiting', 'active');
    return {
      status: 'ok',
      waiting: counts.waiting || 0,
      active: counts.active || 0,
    };
  } catch {
    return { status: 'error', waiting: 0, active: 0 };
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

async function checkCommand(command: string, args: string[]): Promise<HealthStatus> {
  try {
    await execFileAsync(command, args, { timeout: 5000 });
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkSceneDetector(): Promise<HealthStatus> {
  try {
    await execFileAsync(
      SLICING_CONSTANTS.PYTHON_INTERPRETER,
      ['-m', 'py_compile', SLICING_CONSTANTS.PYTHON_SCRIPT_PATH],
      { timeout: 10000 },
    );
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkGpuStatus(): Promise<GpuStatus> {
  try {
    const { stdout } = await execFileAsync(
      SLICING_CONSTANTS.PYTHON_INTERPRETER,
      [
        '-c',
        `import torch; print(f'{torch.cuda.is_available()}|{torch.cuda.mem_get_info()[0]//1048576 if torch.cuda.is_available() else 0}|{torch.cuda.mem_get_info()[1]//1048576 if torch.cuda.is_available() else 0}')`,
      ],
      { timeout: 15000 },
    );

    const parts = stdout.trim().split('|');
    if (parts.length === 3) {
      return {
        available: parts[0] === 'True',
        torch_cuda_available: parts[0] === 'True',
        vram_used_mb: parseInt(parts[1], 10),
        vram_total_mb: parseInt(parts[2], 10),
      };
    }

    return { available: false };
  } catch {
    return { available: false };
  }
}

async function getHealth(): Promise<WorkerHealth> {
  const [redis, bullmq, python, sceneDetector, ffmpeg, ffprobe, gpu] = await Promise.all([
    checkRedis(),
    checkBullMq(),
    checkCommand(SLICING_CONSTANTS.PYTHON_INTERPRETER, ['--version']),
    checkSceneDetector(),
    checkCommand('ffmpeg', ['-version']),
    checkCommand('ffprobe', ['-version']),
    checkGpuStatus(),
  ]);

  const statuses = [redis, bullmq.status, python, sceneDetector, ffmpeg, ffprobe];
  const healthyCount = statuses.filter((s) => s === 'ok').length;

  return {
    status: healthyCount === statuses.length ? 'ok' : healthyCount === 0 ? 'down' : 'degraded',
    timestamp: new Date().toISOString(),
    worker: 'gpu-slicing-worker',
    dependencies: {
      redis,
      bullmq: bullmq.status,
      python,
      scene_detector: sceneDetector,
      ffmpeg,
      ffprobe,
    },
    queues: {
      gpu_slicing_waiting: bullmq.waiting,
      gpu_slicing_active: bullmq.active,
    },
    gpu,
  };
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function createHealthServer(): ReturnType<typeof createServer> {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url === '/health' && request.method === 'GET') {
      void getHealth()
        .then((health) => sendJson(response, 200, health))
        .catch((error) =>
          sendJson(response, 500, {
            status: 'down',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      return;
    }

    sendJson(response, 404, { message: 'Not Found' });
  });
}

async function bootstrap(): Promise<void> {
  console.log('[gpu-slicing-worker] Starting bootstrap sequence...');

  const connection = createRedisConnection({
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    retryStrategy: (times: number) => {
      if (times > 10) {
        console.error('[gpu-slicing-worker] Redis connection failed after 10 attempts, exiting');
        return null;
      }
      return Math.min(times * 1000, 5000);
    },
  });

  const slicingProcessor = new SlicingProcessor();

  const worker = new Worker<SliceJobPayload>(
    SLICING_CONSTANTS.QUEUE_NAME,
    async (job) => {
      const startTime = Date.now();
      console.log(`[gpu-slicing-worker] Processing job ${job.id}: materialId=${job.data.materialId}`);

      try {
        await slicingProcessor.processJob(job.data, job.id ?? `unknown-${job.data.materialId.slice(0, 8)}`, async (progress: number) => {
          await job.updateProgress(progress);
        });

        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`[gpu-slicing-worker] Job ${job.id} completed successfully in ${elapsed.toFixed(1)}s`);
      } catch (error) {
        const elapsed = (Date.now() - startTime) / 1000;
        const err = error as Error & { errorCode?: string };
        console.error(`[gpu-slicing-worker] Job ${job.id} failed after ${elapsed.toFixed(1)}s: ${err.message} (code=${err.errorCode || 'UNKNOWN'})`);

        try {
          await slicingProcessor.notifyJobFailure(
            job.data.materialId,
            err.message,
            err.errorCode || 'UNKNOWN',
          );
        } catch (callbackError) {
          console.error(`[gpu-slicing-worker] Failed to notify gateway about job failure for ${job.data.materialId}: ${(callbackError as Error).message}`);
        }

        throw error;
      }
    },
    {
      connection,
      concurrency: SLICING_CONSTANTS.CONCURRENCY,
      removeOnComplete: {
        age: 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 604800,
      },
    },
  );

  worker.on('completed', (job) => {
    console.log(`[gpu-slicing-worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    const err = error as Error & { errorCode?: string };
    console.error(`[gpu-slicing-worker] Job ${job?.id || 'unknown'} failed: ${err.message} (code=${err.errorCode || 'UNKNOWN'}), attempts=${job?.attemptsMade || 0}`);
  });

  worker.on('error', (error) => {
    console.error(`[gpu-slicing-worker] Worker error: ${(error as Error).message}`);
  });

  worker.on('drained', () => {
    console.log('[gpu-slicing-worker] Queue drained — all jobs processed');
  });

  activeWorker = worker;

  // ============================================================
  // AutoCut Worker — 语音驱动智能剪辑 (独立队列，不影响现有 gpu-slicing)
  // ============================================================
  const autocutProcessor = new AutocutProcessor();

  autocutWorker = new Worker<AutocutJobPayload>(
    AUTOCUT_CONSTANTS.QUEUE_NAME,
    async (job) => {
      const startTime = Date.now();
      const payload = job.data;
      console.log(`[autocut-worker] Processing ${payload.jobType} job ${payload.jobId}`);

      try {
        await autocutProcessor.processJob(
          payload,
          job.id ?? payload.jobId,
          async (p: number) => { await job.updateProgress(p); },
        );
        console.log(`[autocut-worker] Job ${payload.jobId} done in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`[autocut-worker] Job ${payload.jobId} failed: ${msg}`);
        await autocutProcessor.notifyJobFailure(payload.jobId, msg).catch(() => {});
        throw err;
      }
    },
    {
      connection,
      concurrency: AUTOCUT_CONSTANTS.CONCURRENCY,
      removeOnComplete: { age: 86400, count: 500 },
      removeOnFail: { age: 604800 },
    },
  );
  // ============================================================

  const server = createHealthServer();
  healthServer = server;

  server.listen(SLICING_CONSTANTS.WORKER_PORT, '0.0.0.0', () => {
    console.log(`[gpu-slicing-worker] Health server listening on port ${SLICING_CONSTANTS.WORKER_PORT}`);
    console.log('[gpu-slicing-worker] Ready to process GPU slicing jobs');
  });
}

async function handleGracefulShutdown(signal: string): Promise<void> {
  console.log(`[gpu-slicing-worker] Received ${signal}, starting graceful shutdown...`);

  const timeout = setTimeout(() => {
    console.error('[gpu-slicing-worker] Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 30_000);

  try {
    if (activeWorker) {
      console.log('[gpu-slicing-worker] Closing BullMQ worker (waiting for active jobs)...');
      await activeWorker.close();
      console.log('[gpu-slicing-worker] BullMQ worker closed');
    }

    if (autocutWorker) {
      console.log('[gpu-slicing-worker] Closing Autocut worker...');
      await autocutWorker.close();
      console.log('[gpu-slicing-worker] Autocut worker closed');
    }

    if (healthServer) {
      await new Promise<void>((resolve) => {
        healthServer!.close(() => {
          console.log('[gpu-slicing-worker] Health server closed');
          resolve();
        });
      });
    }

    clearTimeout(timeout);
    console.log('[gpu-slicing-worker] Shutdown complete');
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    console.error(`[gpu-slicing-worker] Shutdown error: ${(error as Error).message}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void handleGracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void handleGracefulShutdown('SIGINT');
});

process.on('uncaughtException', (error) => {
  console.error(`[gpu-slicing-worker] Uncaught exception: ${error.message}`);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[gpu-slicing-worker] Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});

void bootstrap();
