# AutoCut 完整实现指南

> **定位**: 独立管线，与现有 GPU Slicing 系统零耦合  
> **原则**: 专用队列 / 专用 DB 表 / 专用 API / 共享 Docker 容器  
> **部署**: Docker，不改 Dockerfile

---

## 一、架构总览

```
                          ┌─── 现有系统 (不变) ───┐
                          │  gpu-slicing 队列       │
                          │  SlicingProcessor       │
                          │  Material/MaterialSlice │
                          │  /api/v1/materials/*    │
                          └─────────────────────────┘

  ┌─── AutoCut (全新独立) ──────────────────────────────┐
  │                                                      │
  │  ┌──────────┐     ┌──────────┐     ┌──────────┐     │
  │  │ 前端页面  │ ←→  │ Gateway  │ ←→  │ Worker   │     │
  │  │ /autocut │     │ Autocut  │     │ autocut  │     │
  │  │          │     │ Module   │     │ 队列     │     │
  │  └──────────┘     └──────────┘     └──────────┘     │
  │       ↑                ↑                 ↑           │
  │  API调用           AutocutJob DB表   同一Docker容器   │
  │                                       共享 Python 依赖│
  └──────────────────────────────────────────────────────┘
```

**独立性保证**：

| 组件 | 现有系统 | AutoCut | 是否耦合 |
|------|----------|---------|----------|
| 队列 | `gpu-slicing` | `autocut` | 完全独立 |
| 处理器 | `SlicingProcessor` | `AutocutProcessor` | 完全独立 |
| DB 表 | `MaterialSlice` | `AutocutJob` | 完全独立 |
| API 路由 | `/api/v1/materials/*` | `/api/v1/autocut/*` | 完全独立 |
| 前端页面 | `MaterialsPage` | `AutocutPage` | 完全独立 |
| Docker 容器 | 同一容器 | 同一容器 | 共享基础设施 |
| Python 脚本 | — | `speech_slicer.py` | AutoCut 专用 |

---

## 二、用户使用流程

```
  1. 在素材库上传视频 (现有功能)
  2. 进入 AutoCut 页面，选择刚才的视频
  3. 点击「开始转录」
     ↓ (Worker: VAD → Whisper → 生成带时间戳的字幕段)
  4. 看到一个可编辑的字幕列表
     │ [✓] 0.0-3.2s  大家好，今天给大家带来一款...
     │ [✓] 3.2-5.8s  这款产品的核心卖点是...
     │ [✓] 5.8-7.1s  呃...那个...等一下...
     │ [✓] 7.1-12.0s 采用了最新的纳米涂层技术...
     │ [✓] 12.0-15.0s 喜欢的点击下方小黄车购买！
  5. 用户取消勾选第 3 行 (口胡段落)
  6. 点击「导出剪辑」
     ↓ (Worker: FFmpeg 按勾选段拼接)
  7. 得到去除了口胡的最终视频
```

---

## 三、改动范围总览

### 3.1 新增文件清单

```
Worker 侧:
  workers/gpu-slicing-worker/python_scripts/speech_slicer.py       # VAD + Whisper Python 脚本
  workers/gpu-slicing-worker/src/autocut/autocut.processor.ts      # AutoCut 处理器
  workers/gpu-slicing-worker/src/autocut/autocut.types.ts          # AutoCut 类型定义
  workers/gpu-slicing-worker/src/autocut/autocut.constants.ts      # AutoCut 常量

Gateway 侧:
  apps/server-gateway/src/autocut/autocut.module.ts                # AutoCut 模块
  apps/server-gateway/src/autocut/autocut.controller.ts            # AutoCut 控制器
  apps/server-gateway/src/autocut/autocut.service.ts               # AutoCut 服务
  apps/server-gateway/src/autocut/autocut.constants.ts             # AutoCut 常量
  apps/server-gateway/src/autocut/dto/submit-autocut.dto.ts       # 提交转录 DTO
  apps/server-gateway/src/autocut/dto/cut-autocut.dto.ts          # 执行剪切 DTO

前端侧:
  apps/web-client/src/features/autocut/AutocutPage.tsx             # AutoCut 页面
  apps/web-client/src/lib/api/autocut.ts                           # AutoCut API 客户端
```

### 3.2 修改文件清单

```
Worker 侧:
  workers/gpu-slicing-worker/src/main.ts                           # 新增 autocut worker 注册 (新代码块)

Gateway 侧:
  apps/server-gateway/src/app.module.ts                            # 新增 AutocutModule 导入 (1 行)
  apps/server-gateway/services/queue/bullmq.module.ts              # 新增 autocutQueueProvider (新代码块)
  apps/server-gateway/services/queue/queue.constants.ts            # 新增 AUTOCUT_QUEUE 常量 (1 行)

Database 侧:
  prisma/schema.prisma                                             # 新增 AutocutJob 模型 (独立表)

前端侧:
  apps/web-client/src/app/router.tsx                               # 新增 /autocut 路由 (新条目)
  apps/web-client/src/app/layouts/AppShell.tsx                     # 侧边栏新增入口

Docker 侧:
  无需修改 ─────────────────── Dockerfile 已包含全部依赖
```

---

## 四、数据库设计

### 4.1 AutocutJob 模型（Prisma）

在 `prisma/schema.prisma` 文件末尾追加：

```prisma
// ============================================================================
// AutoCut — 语音驱动智能剪辑 (独立于现有 MaterialSlice 体系)
// ============================================================================
model AutocutJob {
  id            String   @id @default(uuid())
  materialId    String
  materialName  String?
  status        String   @default("PENDING")
  stage         String?
  progress      Int      @default(0)

  // 转录结果 (数组中每个元素包含 index, start_sec, end_sec, text, selected)
  segments      Json?

  srtContent    String?  @db.Text
  language      String?
  videoDuration Float?

  // 输出
  outputUrl     String?
  outputDuration Float?

  // 来源信息
  sourceName    String?
  sourceType    String?   // MATERIAL | UPLOAD

  // 元数据
  error         String?  @db.Text
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  material      Material? @relation(fields: [materialId], references: [id], onDelete: SetNull)

  @@index([materialId])
  @@index([status])
  @@index([createdAt])
  @@map("autocut_job")
}
```

---

## 五、API 设计

### 5.1 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/autocut/submit` | 提交视频进行转录 |
| `GET` | `/api/v1/autocut/jobs` | 获取 AutoCut 任务列表 |
| `GET` | `/api/v1/autocut/transcript/:jobId` | 获取转录结果 (字幕段) |
| `PATCH` | `/api/v1/autocut/transcript/:jobId` | 更新段选中状态 |
| `POST` | `/api/v1/autocut/cut/:jobId` | 执行剪切导出 |
| `GET` | `/api/v1/autocut/status/:jobId` | 查询任务状态和进度 |

### 5.2 接口详细定义

#### POST `/api/v1/autocut/submit`
```
请求: { material_id: string }
响应: { job_id: string, status: "PENDING" }
逻辑: 创建 AutocutJob → 入队 autocut 队列 → 返回 job_id
```

#### GET `/api/v1/autocut/jobs`
```
请求: ?status=  &limit=20  &cursor=
响应: { jobs: [{ id, materialId, materialName, status, createdAt, outputUrl }], nextCursor }
```

#### GET `/api/v1/autocut/transcript/:jobId`
```
响应: {
  job_id, status,
  segments: [
    { index: 0, start_sec: 0, end_sec: 3.2, text: "大家好...", selected: true },
    { index: 1, start_sec: 3.2, end_sec: 5.8, text: "这款产品...", selected: true },
    ...
  ],
  srt_content, language, video_duration
}
```

#### PATCH `/api/v1/autocut/transcript/:jobId`
```
请求: { segments: [{ index: 2, selected: false }] }  // 只需传变更的段
响应: { updated: true, selected_count: 4, total_count: 5 }
逻辑: 仅更新 selected 字段，不影响其他
```

#### POST `/api/v1/autocut/cut/:jobId`
```
请求: {} (基于已保存的 selected 状态)
响应: { job_id, status: "CUTTING" }
逻辑: 入队 autocut 队列 (type=CUT) → Worker 执行 FFmpeg 剪切拼接
```

#### GET `/api/v1/autocut/status/:jobId`
```
响应: { job_id, status, stage, progress, output_url?, error? }
```

---

## 六、Worker 侧实现

### 6.1 autocut.types.ts

```typescript
// workers/gpu-slicing-worker/src/autocut/autocut.types.ts

export type AutocutJobStatus =
  | 'PENDING'
  | 'TRANSCRIBING'
  | 'READY_FOR_EDIT'
  | 'CUTTING'
  | 'COMPLETED'
  | 'FAILED';

export type AutocutJobType = 'TRANSCRIBE' | 'CUT';

export interface AutocutJobPayload {
  jobType: AutocutJobType;
  jobId: string;      // Gateway DB 中的 AutocutJob.id
  materialId: string;  // 素材 ID
  submittedAt: string;
}

export interface TranscriptSegment {
  index: number;
  start_sec: number;
  end_sec: number;
  text: string;
  selected: boolean;
}

// speech_slicer.py 的 JSON 输出结构
export interface SpeechSlicerOutput {
  success: boolean;
  segments: Array<{
    start_sec: number;
    end_sec: number;
    text: string;
    confidence: number;
  }>;
  srt_content: string;
  language: string;
  speech_clip_count: number;
  transcribed_segment_count: number;
  elapsed_sec: number;
  error?: string;
}
```

### 6.2 autocut.constants.ts

```typescript
// workers/gpu-slicing-worker/src/autocut/autocut.constants.ts

import { resolve } from 'node:path';

export const AUTOCUT_CONSTANTS = {
  QUEUE_NAME: 'autocut',
  JOB_NAME_TRANSCRIBE: 'autocut-transcribe',
  JOB_NAME_CUT: 'autocut-cut',
  CONCURRENCY: 1,

  // MinIO 路径前缀
  AUTOCUT_OUTPUT_PREFIX: 'autocut-outputs',

  // Python
  SPEECH_SLICER_SCRIPT: resolve(__dirname, '../../python_scripts/speech_slicer.py'),
  SPEECH_SLICER_TIMEOUT_MS: 180_000,

  // FFmpeg cut 参数
  FFMPEG_CUT_TIMEOUT_MS: 60_000,
  FFMPEG_CONCAT_TIMEOUT_MS: 120_000,

  // 回调
  CALLBACK_BASE_URL: process.env.GATEWAY_BASE_URL || 'http://localhost:3000',
  CALLBACK_TRANSCRIPT_READY_PATH: '/api/internal/v1/autocut/transcript-ready',
  CALLBACK_CUT_COMPLETE_PATH: '/api/internal/v1/autocut/cut-complete',
  CALLBACK_JOB_FAILED_PATH: '/api/internal/v1/autocut/job-failed',
  CALLBACK_TIMEOUT_MS: 10_000,
  CALLBACK_MAX_RETRIES: 3,

  // 进度阶段
  PROGRESS_STAGES: {
    STARTING: 0,
    DOWNLOADING: 5,
    AUDIO_EXTRACTING: 10,
    TRANSCRIBING: 30,
    TRANSCRIPTION_DONE: 80,
    CUTTING: 85,
    CONCATENATING: 90,
    UPLOADING: 95,
    COMPLETED: 100,
  },
} as const;
```

### 6.3 autocut.processor.ts

```typescript
// workers/gpu-slicing-worker/src/autocut/autocut.processor.ts

import { execFile } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { AutocutJobPayload, AutocutJobType, TranscriptSegment, SpeechSlicerOutput } from './autocut.types';
import { AUTOCUT_CONSTANTS } from './autocut.constants';
import { GatewayCallbackClient } from '../gateway/callback-client';
import { MinioStorageClient } from '../storage/minio-client';

const execFileAsync = promisify(execFile);

export class AutocutProcessor {
  private readonly minio = new MinioStorageClient();
  private readonly gateway = new GatewayCallbackClient();

  /**
   * 主入口：根据 jobType 分流
   */
  async processJob(
    payload: AutocutJobPayload,
    jobId: string,
    updateProgress: (p: number) => Promise<void>,
  ): Promise<void> {
    const tempDir = join(tmpdir(), `autocut-${jobId}`);

    try {
      mkdirSync(tempDir, { recursive: true });

      switch (payload.jobType) {
        case 'TRANSCRIBE':
          await this.processTranscribe(payload, tempDir, updateProgress);
          break;
        case 'CUT':
          await this.processCut(payload, tempDir, updateProgress);
          break;
        default:
          throw new Error(`Unknown job type: ${payload.jobType}`);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * ============================================================
   * TRANSCRIBE 阶段: VAD + Whisper → 生成带时间戳的字幕段
   * ============================================================
   */
  private async processTranscribe(
    payload: AutocutJobPayload,
    tempDir: string,
    updateProgress: (p: number) => Promise<void>,
  ): Promise<void> {
    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.STARTING);

    // 1. 从 Gateway 获取素材元数据
    const material = await this.gateway.fetchMaterial(payload.materialId);
    if (!material.success || !material.data) {
      throw new Error('Material not found: ' + payload.materialId);
    }
    const materialData = material.data as any;

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.DOWNLOADING);

    // 2. 从 MinIO 下载源视频
    const originUrl = materialData.origin_url;
    const objectKey = this.minio.extractObjectKeyFromUrl(originUrl);
    const videoPath = join(tempDir, 'source.mp4');
    await this.minio.downloadObject(objectKey, videoPath);

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.AUDIO_EXTRACTING);

    // 3. 调用 speech_slicer.py (VAD + Whisper)
    console.log(`[AutocutProcessor] Running speech analysis on: ${videoPath}`);
    const pyResult = await execFileAsync(
      'python3',
      [AUTOCUT_CONSTANTS.SPEECH_SLICER_SCRIPT, videoPath],
      { timeout: AUTOCUT_CONSTANTS.SPEECH_SLICER_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 },
    );

    const output: SpeechSlicerOutput = JSON.parse(pyResult.stdout.trim());

    if (!output.success || !output.segments?.length) {
      throw new Error(output.error || 'Speech analysis produced no segments');
    }

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.TRANSCRIPTION_DONE);

    // 4. 构建 TranscriptSegment 数组 (默认全部选中)
    const segments: TranscriptSegment[] = output.segments.map((seg, i) => ({
      index: i,
      start_sec: seg.start_sec,
      end_sec: seg.end_sec,
      text: seg.text,
      selected: true,
    }));

    // 5. 回调 Gateway：保存转录结果
    await this.callbackWithRetry(
      AUTOCUT_CONSTANTS.CALLBACK_TRANSCRIPT_READY_PATH,
      {
        job_id: payload.jobId,
        segments,
        srt_content: output.srt_content,
        language: output.language,
        video_duration: materialData.duration_seconds,
      },
    );

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.COMPLETED);

    console.log(
      `[AutocutProcessor] Transcription complete: ${segments.length} segments, ` +
      `lang=${output.language}`,
    );
  }

  /**
   * ============================================================
   * CUT 阶段: 根据用户 selected 状态用 FFmpeg 剪切拼接
   * ============================================================
   */
  private async processCut(
    payload: AutocutJobPayload,
    tempDir: string,
    updateProgress: (p: number) => Promise<void>,
  ): Promise<void> {
    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.STARTING);

    // 1. 从 Gateway 获取 job 详情 (含 segments 的 selected 状态)
    const jobDetail = await this.gateway.fetchAutocutJob(payload.jobId);
    if (!jobDetail.success || !jobDetail.data) {
      throw new Error('Autocut job not found: ' + payload.jobId);
    }

    const data = jobDetail.data as any;
    const segments: TranscriptSegment[] = data.segments || [];
    const materialId = data.materialId;

    // 2. 过滤出选中的段
    const selected = segments.filter((s) => s.selected);
    if (selected.length === 0) {
      throw new Error('No segments selected for cutting');
    }

    // 3. 下载源视频
    const material = await this.gateway.fetchMaterial(materialId);
    if (!material.success || !material.data) {
      throw new Error('Material not found: ' + materialId);
    }
    const materialData = material.data as any;
    const objectKey = this.minio.extractObjectKeyFromUrl(materialData.origin_url);
    const sourceVideo = join(tempDir, 'source.mp4');
    await this.minio.downloadObject(objectKey, sourceVideo);

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.CUTTING);

    // 4. FFmpeg: 逐个剪切选中的段
    const clipPaths: string[] = [];
    for (let i = 0; i < selected.length; i++) {
      const seg = selected[i];
      const clipPath = join(tempDir, `clip_${String(i).padStart(3, '0')}.mp4`);

      await execFileAsync('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', seg.start_sec.toFixed(3),
        '-i', sourceVideo,
        '-t', (seg.end_sec - seg.start_sec).toFixed(3),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        clipPath,
      ], { timeout: AUTOCUT_CONSTANTS.FFMPEG_CUT_TIMEOUT_MS });

      clipPaths.push(clipPath);
    }

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.CONCATENATING);

    // 5. FFmpeg: concat 拼接所有 clip
    const concatList = join(tempDir, 'concat_list.txt');
    const listContent = clipPaths.map((p) => `file '${p}'`).join('\n');
    writeFileSync(concatList, listContent);

    const outputPath = join(tempDir, 'final_output.mp4');
    await execFileAsync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-c', 'copy',
      outputPath,
    ], { timeout: AUTOCUT_CONSTANTS.FFMPEG_CONCAT_TIMEOUT_MS });

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.UPLOADING);

    // 6. 上传到 MinIO
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const outputKey = `${AUTOCUT_CONSTANTS.AUTOCUT_OUTPUT_PREFIX}/${datePrefix}/${payload.jobId}/output.mp4`;
    const outputUrl = await this.minio.uploadObject({
      buffer: readFileSync(outputPath),
      objectKey: outputKey,
      contentType: 'video/mp4',
    });

    // 7. 回调 Gateway：保存 output URL
    await this.callbackWithRetry(
      AUTOCUT_CONSTANTS.CALLBACK_CUT_COMPLETE_PATH,
      {
        job_id: payload.jobId,
        output_url: outputUrl,
      },
    );

    await updateProgress(AUTOCUT_CONSTANTS.PROGRESS_STAGES.COMPLETED);
    console.log(`[AutocutProcessor] Cut complete: ${selected.length} segments → ${outputUrl}`);
  }

  /**
   * HTTP 回调 (带重试)
   */
  private async callbackWithRetry(
    path: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= AUTOCUT_CONSTANTS.CALLBACK_MAX_RETRIES; attempt++) {
      try {
        const url = `${AUTOCUT_CONSTANTS.CALLBACK_BASE_URL}${path}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), AUTOCUT_CONSTANTS.CALLBACK_TIMEOUT_MS);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-token': process.env.INTERNAL_TOKEN || 'tikstream-internal',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) return;
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Callback rejected: ${response.status}`);
        }
      } catch (err) {
        lastError = err as Error;
        if (attempt < AUTOCUT_CONSTANTS.CALLBACK_MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }
    }

    throw lastError || new Error('Callback failed after retries');
  }

  /**
   * 通知 Gateway Job 失败
   */
  async notifyJobFailure(jobId: string, error: string): Promise<void> {
    try {
      await this.callbackWithRetry(AUTOCUT_CONSTANTS.CALLBACK_JOB_FAILED_PATH, {
        job_id: jobId,
        error,
      });
    } catch {
      console.error(`[AutocutProcessor] Failed to notify failure for job ${jobId}`);
    }
  }
}
```

### 6.4 main.ts 修改（新增 Autocut Worker）

在 `main.ts` 的 `bootstrap()` 函数末尾（`activeWorker = worker;` 之后，`const server = createHealthServer()` 之前），插入新代码块：

```typescript
  // ============================================================
  // AutoCut Worker — 语音驱动智能剪辑 (独立队列，不影响现有 gpu-slicing)
  // ============================================================
  const { AutocutProcessor } = require('./autocut/autocut.processor');
  const { AUTOCUT_CONSTANTS } = require('./autocut/autocut.constants');
  const autocutProcessor = new AutocutProcessor();

  const autocutWorker = new Worker(
    AUTOCUT_CONSTANTS.QUEUE_NAME,
    async (job) => {
      const startTime = Date.now();
      const payload = job.data as { jobType: string; jobId: string; materialId: string };
      console.log(`[autocut-worker] Processing ${payload.jobType} job ${payload.jobId}`);

      try {
        await autocutProcessor.processJob(
          payload,
          job.id ?? payload.jobId,
          async (p: number) => job.updateProgress(p),
        );
        console.log(`[autocut-worker] Job ${payload.jobId} done in ${(Date.now() - startTime) / 1000}s`);
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
```

同时在 graceful shutdown 里关闭 autocut worker — 在 `if (activeWorker)` 块之后加：

```typescript
    if (autocutWorker) {
      await autocutWorker.close();
    }
```

同时需要在 `main.ts` 最上方新增 import：

```typescript
import { AutocutProcessor } from './autocut/autocut.processor';
import { AUTOCUT_CONSTANTS } from './autocut/autocut.constants';
```

---

## 七、Gateway 侧实现

### 7.1 queue.constants.ts 修改

在末尾追加 1 行：

```typescript
  AUTOCUT_QUEUE: 'autocut',
  AUTOCUT_JOB_NAME_TRANSCRIBE: 'autocut-transcribe',
  AUTOCUT_JOB_NAME_CUT: 'autocut-cut',
```

### 7.2 bullmq.module.ts 修改

在现有 providers 数组和 exports 数组中新增 `autocutQueueProvider`：

```typescript
const autocutQueueProvider = {
  provide: 'AUTOCUT_QUEUE',
  useFactory: (): Queue => {
    return new Queue(QUEUE_CONSTANTS.AUTOCUT_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: defaultJobOptions(),
    });
  },
};

// 在 @Module 装饰器中:
// providers: [gpuSlicingQueueProvider, creationQueueProvider, autocutQueueProvider],
// exports: [gpuSlicingQueueProvider, creationQueueProvider, autocutQueueProvider],
```

### 7.3 AutocutModule

新建 `apps/server-gateway/src/autocut/autocut.module.ts`：

```typescript
import { Module } from '@nestjs/common';
import { AutocutController } from './autocut.controller';
import { AutocutService } from './autocut.service';

@Module({
  controllers: [AutocutController],
  providers: [AutocutService],
  exports: [AutocutService],
})
export class AutocutModule {}
```

### 7.4 AutocutController

新建 `apps/server-gateway/src/autocut/autocut.controller.ts`：

```typescript
import { Controller, Post, Get, Patch, Param, Body, Query, Inject } from '@nestjs/common';
import { AutocutService } from './autocut.service';
import { SubmitAutocutDto } from './dto/submit-autocut.dto';
import { UpdateSegmentsDto } from './dto/cut-autocut.dto';

@Controller('api/v1/autocut')
export class AutocutController {
  constructor(private readonly service: AutocutService) {}

  @Post('submit')
  async submit(@Body() dto: SubmitAutocutDto) {
    return this.service.submitTranscribe(dto);
  }

  @Get('jobs')
  async listJobs(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.service.listJobs({ status, limit: limit ? Number(limit) : 20 });
  }

  @Get('transcript/:jobId')
  async getTranscript(@Param('jobId') jobId: string) {
    return this.service.getTranscript(jobId);
  }

  @Patch('transcript/:jobId')
  async updateSegments(@Param('jobId') jobId: string, @Body() dto: UpdateSegmentsDto) {
    return this.service.updateSegments(jobId, dto);
  }

  @Post('cut/:jobId')
  async executeCut(@Param('jobId') jobId: string) {
    return this.service.executeCut(jobId);
  }

  @Get('status/:jobId')
  async getStatus(@Param('jobId') jobId: string) {
    return this.service.getStatus(jobId);
  }
}
```

### 7.5 AutocutService

新建 `apps/server-gateway/src/autocut/autocut.service.ts`：

核心逻辑：

| 方法 | 逻辑 |
|------|------|
| `submitTranscribe` | 创建 AutocutJob (PENDING) → BullMQ.add('autocut-transcribe') → 返回 job_id |
| `listJobs` | Prisma 分页查询 AutocutJob |
| `getTranscript` | 查 AutocutJob → 返回 segments + srt_content |
| `updateSegments` | Prisma 更新 segments Json 字段中的 selected 状态 |
| `executeCut` | 校验 READY_FOR_EDIT → 更新为 CUTTING → BullMQ.add('autocut-cut') |
| `getStatus` | 返回 job.status + job.progress + job.outputUrl |

### 7.6 Internal Controller（Worker 回调）

在 AutocutModule 内新增或单独创建 `internal-autocut.controller.ts`：

```typescript
// POST /api/internal/v1/autocut/transcript-ready
// POST /api/internal/v1/autocut/cut-complete
// POST /api/internal/v1/autocut/job-failed
```

### 7.7 app.module.ts 修改

新增 1 行导入：

```typescript
import { AutocutModule } from './autocut/autocut.module';
// 在 imports 数组中追加: AutocutModule,
```

### 7.8 DTO 定义

```typescript
// submit-autocut.dto.ts
export class SubmitAutocutDto {
  material_id: string;
}

// cut-autocut.dto.ts
export class UpdateSegmentsDto {
  segments: Array<{ index: number; selected: boolean }>;
}
```

---

## 八、前端实现

### 8.1 API Client

新建 `apps/web-client/src/lib/api/autocut.ts`：

```typescript
import { request } from './http';

const BASE = '/api/v1/autocut';

export const autocutApi = {
  submit: (materialId: string) =>
    request<{ job_id: string; status: string }>(`${BASE}/submit`, { method: 'POST', body: { material_id: materialId } }),

  listJobs: (params?: { status?: string; limit?: number }) =>
    request<{ jobs: any[] }>(`${BASE}/jobs`, { query: params }),

  getTranscript: (jobId: string) =>
    request<any>(`${BASE}/transcript/${jobId}`),

  updateSegments: (jobId: string, segments: Array<{ index: number; selected: boolean }>) =>
    request<any>(`${BASE}/transcript/${jobId}`, { method: 'PATCH', body: { segments } }),

  executeCut: (jobId: string) =>
    request<any>(`${BASE}/cut/${jobId}`, { method: 'POST' }),

  getStatus: (jobId: string) =>
    request<any>(`${BASE}/status/${jobId}`),
};
```

### 8.2 AutocutPage

新建 `apps/web-client/src/features/autocut/AutocutPage.tsx`：

核心 UI 结构：

```
┌─────────────────────────────────────────────────┐
│  AutoCut — 语音驱动智能剪辑                       │
├─────────────────────────────────────────────────┤
│  选择视频: [下拉选择已上传的素材]  [开始转录]      │
├─────────────────────────────────────────────────┤
│  转录进度: ████████░░░░ 80%                      │
├─────────────────────────────────────────────────┤
│  ✅ 全选 / 取消全选                               │
│  ┌─────────────────────────────────────────────┐│
│  │ ☑ 0.0-3.2s  大家好，今天给大家带来一款...    ││
│  │ ☑ 3.2-5.8s  这款产品的核心卖点是...          ││
│  │ ☐ 5.8-7.1s  呃...那个...等一下...            ││ ← 用户取消勾选
│  │ ☑ 7.1-12.0s 采用了最新的纳米涂层技术...       ││
│  │ ☑ 12.0-15.0s 喜欢的点击下方小黄车购买！       ││
│  └─────────────────────────────────────────────┘│
├─────────────────────────────────────────────────┤
│  已选 4/5 段，总时长 12.2 秒   [导出剪辑]          │
└─────────────────────────────────────────────────┘
```

关键交互：
1. 页面初始化加载素材列表 (调用已有 `getProducts` + `listMaterials`)
2. 选择视频 → 点击「开始转录」→ 调用 `autocutApi.submit(materialId)`
3. 轮询 `getStatus` 直到 `READY_FOR_EDIT`
4. 调用 `getTranscript` 获取 segments 列表
5. 用户勾选/取消 → 调用 `updateSegments`
6. 点击「导出剪辑」→ 调用 `executeCut` → 轮询到 `COMPLETED` → 显示下载链接

### 8.3 路由注册

在 `router.tsx` 中新增 lazy import：

```typescript
const AutocutPage = lazy(() => import('@/features/autocut/AutocutPage'));
```

路由表中新增：

```typescript
{ path: 'autocut', element: <AutocutPage /> },
```

### 8.4 AppShell 侧边栏入口

在导航数组中新增一行入口（放在「AI 增强」分组）：

```typescript
{
  group: 'nav.groupAiEnhance',
  items: [
    // ... 现有入口 ...
    { path: '/autocut', label: 'nav.autocut', icon: Sparkles },
  ],
}
```

---

## 九、Python 脚本：speech_slicer.py

**文件路径**: `workers/gpu-slicing-worker/python_scripts/speech_slicer.py`

（与之前设计的相同，此处略。完整代码见原版文档。）

---

## 十、Docker 部署

### 10.1 确认无依赖变更

现有 Dockerfile 无需任何修改：

- 基础镜像 `pytorch:2.3.1-cuda12.1` 自带 torch + torchaudio
- 第 27 行已 `pip install faster-whisper`
- 第 48 行 `COPY workers/gpu-slicing-worker .` 自动包含所有新文件
- Silero-VAD 通过 `torch.hub.load` 运行时拉取

### 10.2 重建步骤

```powershell
# 1. 数据库迁移
npx prisma migrate dev --name add_autocut_job

# 2. 重建 + 启动所有服务
docker-compose down
docker-compose up -d --build

# 3. 验证
docker-compose logs gpu-slicing-worker | grep -i autocut
# 预期看到: [autocut-worker] 日志行
```

### 10.3 环境变量

```yaml
# docker-compose.yml 中 gpu-slicing-worker 服务可选新增:
environment:
  WHISPER_MODEL_SIZE: "tiny"
  WHISPER_DEVICE: "auto"
  WHISPER_COMPUTE_TYPE: "int8"
```

---

## 十一、降级安全网

```
speech_slicer.py 失败?
  → AutocutProcessor 捕获 → notifyJobFailure()
  → AutocutJob 状态 = FAILED
  → 不影响 gpu-slicing 队列 (不同队列，完全隔离)

Whisper 模型下载超时?
  → execFileAsync timeout → 同上

Redis 不可用?
  → 所有队列不可用 → 两个队列同时受影响
  → Autocut 和原有系统同步降级
```

---

## 十二、实施顺序

| 序号 | 步骤 | 涉及文件 | 预计时间 |
|------|------|----------|----------|
| 1 | 创建 `speech_slicer.py` | 1 个新文件 | 20 min |
| 2 | 创建 autocut types + constants | 2 个新文件 | 5 min |
| 3 | 创建 `autocut.processor.ts` | 1 个新文件 | 30 min |
| 4 | 修改 `main.ts` (新增 Autocut Worker) | 1 处新增代码块 | 10 min |
| 5 | 修改 `queue.constants.ts` + `bullmq.module.ts` | 2 处小幅修改 | 5 min |
| 6 | Prisma 新增 `AutocutJob` 模型 + 迁移 | 1 个 schema 改动 | 5 min |
| 7 | 创建 Gateway DTO + AutocutModule/Controller/Service | 6 个新文件 | 40 min |
| 8 | 修改 `app.module.ts` | 1 行导入 | 1 min |
| 9 | 创建前端 API client + AutocutPage | 2 个新文件 | 40 min |
| 10 | 修改 `router.tsx` + `AppShell.tsx` | 2 处小幅修改 | 5 min |
| 11 | Docker 重建 + 端到端验证 | — | 20 min |

总计约 **3 小时**。

---

## 十三、完成标志

- [ ] `speech_slicer.py` 可独立运行，输出正确的 JSON
- [ ] `AutocutJob` 表已创建，迁移成功
- [ ] `POST /api/v1/autocut/submit` 入队成功，Worker 消费并转录
- [ ] `GET /api/v1/autocut/transcript/:jobId` 返回带时间戳的字幕段
- [ ] `PATCH /api/v1/autocut/transcript/:jobId` 可更新 selected 状态
- [ ] `POST /api/v1/autocut/cut/:jobId` 产出拼接后的视频
- [ ] 前端 AutocutPage 完整可用 (选择视频 → 转录 → 编辑 → 导出)
- [ ] 原有 GPU Slicing 流程完全不受影响
