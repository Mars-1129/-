# TikStream AI — 完整实现指南

> 本文档基于 `改进.md` + 全部接口文档 + 完整代码审计生成。包含 5 个实施阶段 + 1 个不可实现板块。
> 每个功能点均包含：实施文件清单、数据库变更、API 定义、前后端职责、校验步骤。

---

## 目录

- [Phase 1: 基础安全与用户体验补齐](#phase-1-基础安全与用户体验补齐)
  - [1.1 MinIO Presigned URL 安全访问](#11-minio-presigned-url-安全访问)
  - [1.2 任务删除 / 回收站 / 恢复 / 批量操作](#12-任务删除--回收站--恢复--批量操作)
  - [1.3 SSE 事件类型扩展（9 → 15 种）](#13-sse-事件类型扩展9--15-种)
- [Phase 2: 剧本与创作深度增强](#phase-2-剧本与创作深度增强)
  - [2.1 剧本历史版本管理与回滚](#21-剧本历史版本管理与回滚)
  - [2.2 响度标准化参数可视化配置](#22-响度标准化参数可视化配置)
  - [2.3 创作模板一键复用](#23-创作模板一键复用)
  - [2.4 Grafana Dashboard 预置](#24-grafana-dashboard-预置)
- [Phase 3: 创新亮点功能](#phase-3-创新亮点功能)
  - [3.1 爆款 DNA 提取与驱动生成](#31-爆款-dna-提取与驱动生成)
  - [3.2 创作效果 A/B 自动多版本生成](#32-创作效果-ab-自动多版本生成)
  - [3.3 LangGraph Agent 增强（4节点 → 7节点）](#33-langgraph-agent-增强4节点--7节点)
- [Phase 4: 国际化与素材完善](#phase-4-国际化与素材完善)
  - [4.1 前端 i18n 国际化（zh-CN / en-US / id-ID）](#41-前端-i18n-国际化zh-cn--en-us--id-id)
  - [4.2 后端错误消息国际化](#42-后端错误消息国际化)
  - [4.3 SFX 音效提取完善](#43-sfx-音效提取完善)
  - [4.4 视频自动转码](#44-视频自动转码)
- [Phase 5: 测试与运维完善](#phase-5-测试与运维完善)
  - [5.1 E2E 测试补充（5个新 spec）](#51-e2e-测试补充5个新-spec)
  - [5.2 Prompt 模板管理系统（后台管理）](#52-prompt-模板管理系统后台管理)
  - [5.3 爆款分析手动订阅模式](#53-爆款分析手动订阅模式)
- [不可实现板块](#不可实现板块)
  - [N-1 素材版权风险检测（预留接口）](#n-1-素材版权风险检测预留接口)
  - [N-2 爆款效果预测（预留接口）](#n-2-爆款效果预测预留接口)
  - [N-3 Prompt A/B 自动优化（预留接口）](#n-3-prompt-ab-自动优化预留接口)
  - [N-4 剧本模板市场（降级为管理员发布）](#n-4-剧本模板市场降级为管理员发布)

---

# Phase 1: 基础安全与用户体验补齐

## 1.1 MinIO Presigned URL 安全访问

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| 后端 | `apps/server-gateway/services/storage/minio-client.service.ts` | **修改** — 新增 presignedGetUrl / presignedPutUrl 方法 |
| 后端 | `apps/server-gateway/src/material/material.service.ts` | **修改** — 素材列表/详情/搜索接口返回的 `stream_url` `/ `key_frame_url` 等字段改为调用 presignedGetUrl |
| 后端 | `apps/server-gateway/src/creation/creation.service.ts` | **修改** — 创作详情返回的视频 URL 改为 presigned URL |
| 后端 | `apps/server-gateway/services/storage/` | **新增** `presigned-url.constants.ts` — 过期时间常量 |

### 后端修改详情

#### 文件: `services/storage/minio-client.service.ts`

新增两个方法：

```typescript
/**
 * 生成文件预签名下载 URL
 * @param bucket - MinIO bucket 名称
 * @param key - 对象 key
 * @param expiresSeconds - 签名有效期（秒），默认 3600（1小时）
 * @returns 带签名的临时访问 URL
 */
async presignedGetUrl(
  bucket: string,
  key: string,
  expiresSeconds: number = 3600
): Promise<string> {
  return await this.minioClient.presignedGetObject(bucket, key, expiresSeconds);
}

/**
 * 生成文件预签名上传 URL
 * @param bucket - MinIO bucket 名称
 * @param key - 对象 key
 * @param expiresSeconds - 签名有效期（秒），默认 600（10分钟）
 */
async presignedPutUrl(
  bucket: string,
  key: string,
  expiresSeconds: number = 600
): Promise<string> {
  return await this.minioClient.presignedPutObject(bucket, key, expiresSeconds);
}
```

#### 文件: `apps/server-gateway/src/material/material.service.ts`

修改素材查询方法中返回 URL 的逻辑。关键修改点：

| 方法 | 行号附近 | 当前逻辑 | 修改为 |
|------|----------|----------|--------|
| `getMaterialDetail()` | ~2437 | `generatePublicUrl(bucket, key)` | `presignedGetUrl(bucket, key)` |
| `listMaterials()` | ~1022 | `generatePublicUrl(bucket, key)` | `presignedGetUrl(bucket, key)` |
| `searchMaterials()` | ~1559 | `generatePublicUrl(bucket, key)` | `presignedGetUrl(bucket, key)` |
| 切片回调 `handleSliceCallback()` | ~2653 | 内联 URL 拼接 | `presignedGetUrl(bucket, key)` |

#### 文件: `apps/server-gateway/src/creation/creation.service.ts`

创作详情和导出回调中的 `video_url` / `export_url` 也改为 presigned URL。

#### 文件: `services/storage/presigned-url.constants.ts`（新增）

```typescript
export const PRESIGNED_URL_EXPIRY = {
  /** 素材预览 URL：1 小时 */
  MATERIAL_PREVIEW: 3600,
  /** 导出视频下载 URL：24 小时 */
  EXPORT_DOWNLOAD: 86400,
  /** 前端上传分片预签名 URL：10 分钟 */
  CHUNK_UPLOAD: 600,
} as const;
```

### 数据库变更

无。

### 校验步骤

1. 上传一个素材，等待处理完成
2. 调用 `GET /api/v1/materials/:id`，检查返回的 `stream_url` 是否为 `http://minio:9000/...?X-Amz-Algorithm=...` 格式（含签名参数）
3. 在浏览器中直接访问该 URL，验证可以正常播放
4. 等待 1 小时后重新访问，验证 URL 已过期返回 403

---

## 1.2 任务删除 / 回收站 / 恢复 / 批量操作

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| DB | `prisma/schema.prisma` | **修改** — `tasks` 表新增 `deletedAt` 字段 |
| DB | `prisma/migrations/` | **新增** — 迁移文件 |
| 后端 | `apps/server-gateway/src/task/task.controller.ts` | **修改** — 新增 6 个端点 |
| 后端 | `apps/server-gateway/src/task/task.service.ts` | **修改** — 新增 softDelete / restore / permanentDelete / batchSoftDelete / emptyTrash / getTrashList 方法 |
| 后端 | `apps/server-gateway/src/task/task.repository.ts` | **修改** — 对应数据库查询方法 |
| 共享 | `shared/api_types.ts` | **修改** — 新增请求/响应类型定义 |
| 前端 | `apps/web-client/src/features/tasks/TasksPage.tsx` | **修改** — 新增删除/回收站/恢复 UI |
| 前端 | `apps/web-client/src/lib/api/tasks.ts` | **修改** — 新增 API 调用函数 |

### 数据库变更

**Prisma Schema** (`prisma/schema.prisma`)：

在 `model Task` 中新增字段：

```prisma
model Task {
  // ... 现有字段 ...
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz()
  
  @@index([deletedAt])
  @@index([status, deletedAt])
}
```

**迁移 SQL**（Prisma migrate 自动生成）：

```sql
ALTER TABLE "tasks" ADD COLUMN "deleted_at" TIMESTAMPTZ;
CREATE INDEX "tasks_deleted_at_idx" ON "tasks" ("deleted_at");
CREATE INDEX "tasks_status_deleted_at_idx" ON "tasks" ("status", "deleted_at");
```

### API 端点定义

#### 1. 软删除任务（移入回收站）

```
DELETE /api/v1/tasks/:taskId
```

请求头：无特殊要求
响应：
```json
{
  "success": true,
  "message": "任务已移入回收站",
  "data": {
    "task_id": "tsk_20260605_000042",
    "deleted_at": "2026-06-05T12:00:00.000Z"
  },
  "trace_id": "uuid",
  "timestamp": "2026-06-05T12:00:00.000Z"
}
```

业务规则：
- 仅 `FAILED` / `CANCELED` / `COMPLETED` 状态可删除
- `PROCESSING` / `PENDING` 状态拒绝删除，返回 409：
  ```json
  {
    "success": false,
    "message": "处理中的任务无法删除，请先取消任务",
    "error": {
      "code": "TASK_STILL_PROCESSING",
      "details": ["当前状态为 PROCESSING，请先调用 /cancel 取消任务后再删除"],
      "retryable": false
    }
  }
  ```
- 软删除：设置 `deleted_at = now()`，列表查询默认排除 `deleted_at IS NOT NULL` 的记录

#### 2. 恢复任务

```
POST /api/v1/tasks/:taskId/restore
```

业务规则：
- 仅 `deleted_at IS NOT NULL` 的任务可恢复
- 恢复：设置 `deleted_at = null`

#### 3. 永久删除

```
DELETE /api/v1/tasks/:taskId/permanent
```

业务规则：
- 物理删除数据库记录（必须先软删除才能永久删除，或两步合并为一步）
- 建议：仅回收站中的任务（`deleted_at IS NOT NULL`）可以永久删除

#### 4. 批量软删除

```
POST /api/v1/tasks/batch-delete
```

请求体：
```json
{
  "task_ids": ["tsk_20260605_000001", "tsk_20260605_000002"]
}
```

响应：
```json
{
  "success": true,
  "data": {
    "deleted_count": 2,
    "skipped_count": 0,
    "skipped_task_ids": []
  }
}
```

业务规则：
- 循环处理每个 task_id，仍在 PROCESSING/PENDING 的跳过并记录到 `skipped_task_ids`
- 部分成功也返回 200（非全部失败）

#### 5. 回收站列表

```
GET /api/v1/tasks/trash
```

Query 参数：`page=1&page_size=20&product_id=xxx`

响应：标准分页格式，只返回 `deleted_at IS NOT NULL` 的任务。

#### 6. 清空回收站

```
DELETE /api/v1/tasks/trash
```

可选 Query：`product_id=xxx`（仅清空该商品的回收站）

响应：
```json
{
  "success": true,
  "data": {
    "deleted_count": 15
  }
}
```

### 前端修改详情

#### 文件: `apps/web-client/src/features/tasks/TasksPage.tsx`

**修改点 1：页面顶部增加 Tab 切换**

在现有标题下方或筛选栏位置增加两个 Tab：

```tsx
<div className="flex gap-2 mb-4">
  <Button variant={activeTab === 'all' ? 'default' : 'outline'} onClick={() => setActiveTab('all')}>
    全部任务
  </Button>
  <Button variant={activeTab === 'trash' ? 'default' : 'outline'} onClick={() => setActiveTab('trash')}>
    回收站
  </Button>
</div>
```

新增状态：`const [activeTab, setActiveTab] = useState<'all' | 'trash'>('all')`

**修改点 2：全部任务列表每行新增「删除」按钮**

在现有的「取消」「重试」按钮旁新增：

```tsx
<Button
  variant="outline"
  size="sm"
  disabled={task.status === 'PROCESSING' || task.status === 'PENDING'}
  onClick={() => handleDelete(task)}
>
  删除
</Button>
```

`handleDelete` 实现：
```tsx
const handleDelete = async (task: TaskItem) => {
  const confirmed = await confirmDialog({
    title: '确认删除',
    description: `确定将任务 ${task.task_id} 移入回收站吗？`,
    confirmText: '删除',
  });
  if (!confirmed) return;
  await softDeleteTask(task.task_id);
  toast.success('已移入回收站');
  refreshList();
};
```

**修改点 3：批量操作栏新增「批量删除」**

在现有的「批量取消」「批量重试」旁新增「批量删除」按钮。

**修改点 4：回收站列表**

回收站 Tab 下的列表展示与全部任务相同，但：
- 额外显示「删除时间」列（`deleted_at` 格式化展示）
- 每行操作按钮改为：「恢复」+「永久删除」
- 顶部增加「清空回收站」按钮（红色危险样式，二次确认弹窗）

```tsx
{/* 回收站操作栏 */}
<div className="flex gap-2 mb-4">
  <Button variant="destructive" onClick={handleEmptyTrash}>
    清空回收站
  </Button>
</div>

{/* 回收站每行操作 */}
<Button variant="outline" size="sm" onClick={() => handleRestore(task)}>
  恢复
</Button>
<Button variant="destructive" size="sm" onClick={() => handlePermanentDelete(task)}>
  永久删除
</Button>
```

#### 文件: `apps/web-client/src/lib/api/tasks.ts`

新增 6 个 API 函数：

```typescript
export async function softDeleteTask(taskId: string): Promise<void>
export async function restoreTask(taskId: string): Promise<void>
export async function permanentDeleteTask(taskId: string): Promise<void>
export async function batchSoftDeleteTasks(taskIds: string[]): Promise<BatchDeleteResult>
export async function getTrashTasks(params: TaskListParams): Promise<TaskListResponse>
export async function emptyTrash(productId?: string): Promise<{ deleted_count: number }>
```

### 共享类型定义

`shared/api_types.ts` 新增：

```typescript
export interface BatchDeleteRequest {
  task_ids: string[];
}

export interface BatchDeleteResponse {
  deleted_count: number;
  skipped_count: number;
  skipped_task_ids: string[];
}

// TaskItem 接口新增字段：
// deleted_at?: string;
```

### 校验步骤

1. 找一个 FAILED 状态的任务 → 点击删除 → 确认弹窗 → 提示"已移入回收站"
2. 切换到回收站 Tab → 确认该任务出现，包含删除时间
3. 点击恢复 → 任务回到全部列表，`deleted_at` 为空
4. 再次删除同一任务 → 切换到回收站 → 点击永久删除 → 任务彻底消失
5. 找一个 PROCESSING 状态任务 → 点击删除 → 弹出提示"请先取消任务"
6. 批量选择 3 个 FAILED 任务 → 点击批量删除 → 3 个全部进入回收站
7. 回收站中点击清空回收站 → 二次确认 → 所有已删除任务消失

---

## 1.3 SSE 事件类型扩展（9 → 15 种）

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| 共享 | `shared/api_types.ts` | **修改** — `SSEEventType` 联合类型新增 6 种事件 |
| 后端 | `apps/server-gateway/src/task/task.service.ts` | **修改** — 新增对应事件发布方法 |
| 后端 | `workers/remotion-render-worker/src/` | **修改** — TTS/导出阶段调用 emitEvent |
| 前端 | `apps/web-client/src/features/tasks/TasksPage.tsx` | **修改** — SSE 事件处理器新增 case 分支 |

### 类型定义修改

`shared/api_types.ts` — `SSEEventType`：

```typescript
// 修改前（9 种）：
export type SSEEventType =
  | 'task.created'
  | 'task.stage.changed'
  | 'task.progress.updated'
  | 'task.completed'
  | 'task.failed'
  | 'task.canceled'
  | 'shot.render.completed'
  | 'shot.render.failed'
  | 'heartbeat';

// 修改后（15 种）：
export type SSEEventType =
  | 'task.created'              // 任务创建并入队
  | 'task.stage.changed'        // 阶段推进
  | 'task.progress.updated'     // 进度百分比更新
  | 'task.completed'            // 任务成功完成
  | 'task.failed'               // 任务失败
  | 'task.canceled'             // 任务已取消
  | 'task.warning'              // 任务警告（非致命问题）
  | 'shot.render.completed'     // 单分镜渲染完成
  | 'shot.render.failed'        // 单分镜渲染失败
  | 'tts.completed'             // TTS 旁白生成完成
  | 'tts.failed'                // TTS 旁白生成失败
  | 'export.started'            // 导出开始
  | 'export.progress'           // 导出进度（含 FFmpeg 编码百分比）
  | 'export.completed'          // 导出完成（含 video_url）
  | 'export.failed'             // 导出失败
  | 'heartbeat';                // 心跳保活（30s 间隔）
```

### 后端改动

#### 文件: `apps/server-gateway/src/task/task.service.ts`

新增发布方法（如果尚无）：

```typescript
async emitTtsCompleted(taskId: string, shotIndex: number): Promise<void>
async emitTtsFailed(taskId: string, shotIndex: number, error: string): Promise<void>
async emitExportStarted(taskId: string): Promise<void>
async emitExportProgress(taskId: string, progress: number): Promise<void>
async emitExportCompleted(taskId: string, videoUrl: string): Promise<void>
async emitExportFailed(taskId: string, error: string): Promise<void>
```

#### 文件: Worker 端 `remotion-render-worker/src/`

Worker 在 TTS_GENERATING 阶段每完成一个分镜的 TTS → 回调 Gateway `stage-callback` 时附带 `shot_updates` 包含 `tts_status` 信息。

Gateway 收到 `stage-callback` 后：
- 检测到 TTS_GENERATING 阶段且有 `shot_updates` 中 `tts_status: 'completed'` → 发布 `tts.completed`
- FFMPEG_STITCHING 阶段开始 → 发布 `export.started`
- FFmpeg 命令支持 `-progress pipe:1` 输出进度 → Worker 解析进度 → 回调 Gateway → 发布 `export.progress`
- LOUDNORM_COMPLIANCE/FINISHED → 发布 `export.completed`（含 video_url）
- 失败 → 发布 `export.failed`

### 前端改动

`TasksPage.tsx` SSE `eventSource.onmessage` 处理器：

```typescript
case 'tts.completed':
  addLog(`🔊 TTS 旁白已生成 (分镜 ${data.shot_index + 1})`);
  break;
case 'export.started':
  addLog('📦 开始导出视频...');
  setExportProgress(0);
  break;
case 'export.progress':
  setExportProgress(data.progress);  // 显示百分比进度条
  break;
case 'export.completed':
  addLog('✅ 视频导出完成！');
  setVideoUrl(data.video_url);
  break;
case 'task.warning':
  addLog(`⚠️ ${data.message}`);
  break;
```

### 校验步骤

1. 创建一个创作任务
2. 打开任务详情 → 观察 SSE 事件日志
3. 确认出现 `task.created` → `task.stage.changed` → `shot.render.completed`（多个）→ `tts.completed`（多个）→ `export.started` → `export.progress` → `export.completed` 完整事件链
4. 每 30 秒确认收到 `heartbeat` 事件

---

# Phase 2: 剧本与创作深度增强

## 2.1 剧本历史版本管理与回滚

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| DB | `prisma/schema.prisma` | **修改** — 新增 `ScriptVersion` 表 |
| 后端 | `apps/server-gateway/src/script/script-version.service.ts` | **新增** — 版本管理服务 |
| 后端 | `apps/server-gateway/src/script/script-version.controller.ts` | **新增** — 3 个 API 端点 |
| 后端 | `apps/server-gateway/src/script/script.service.ts` | **修改** — save/applyPatch 后自动调用 saveVersion |
| 后端 | `apps/server-gateway/src/script/script.module.ts` | **修改** — 注册 ScriptVersionService / ScriptVersionController |
| 前端 | `apps/web-client/src/features/scripts/ScriptsPage.tsx` | **修改** — 新增版本历史面板 |
| 前端 | `apps/web-client/src/lib/api/scripts.ts` | **修改** — 新增版本 API 函数 |

### 数据库变更

**Prisma Schema** — 新增表：

```prisma
model ScriptVersion {
  id            String   @id @default(uuid()) @db.Uuid
  scriptId      String   @map("script_id") @db.Uuid
  versionNumber Int      @map("version_number")
  snapshot      Json     @map("snapshot") @db.JsonB
  triggerAction String   @map("trigger_action") @db.VarChar(50)  // MANUAL_SAVE / PATCH_EDIT / AI_REGENERATE
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz()

  script Script @relation(fields: [scriptId], references: [id], onDelete: Cascade)

  @@unique([scriptId, versionNumber])
  @@index([scriptId, createdAt(sort: Desc)])
  @@map("script_versions")
}
```

`snapshot` JSON 结构：

```json
{
  "script": {
    "title": "...",
    "video_duration": 15,
    "style_vibe": "...",
    "aspect_ratio": "9:16",
    "language": "zh-CN"
  },
  "shots": [
    {
      "shot_index": 0,
      "duration": 3.5,
      "scene_description_query": "...",
      "visual_description": "...",
      "camera_movement": "push_in",
      "transition_type": "cut",
      "voiceover_text": "...",
      "subtitle_text": "...",
      "safe_zone_bounding_box": [0.1, 0.7, 0.9, 0.9]
    }
  ]
}
```

### API 端点

#### 1. 列出某剧本的所有版本

```
GET /api/v1/scripts/:scriptId/versions
```

Query：`page=1&page_size=20`

响应：
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "version_id": "uuid",
        "version_number": 3,
        "trigger_action": "PATCH_EDIT",
        "created_at": "2026-06-05T12:00:00.000Z"
      },
      {
        "version_id": "uuid",
        "version_number": 2,
        "trigger_action": "MANUAL_SAVE",
        "created_at": "2026-06-05T11:30:00.000Z"
      }
    ],
    "page": 1,
    "page_size": 20,
    "total": 3
  }
}
```

注意：列表不返回完整 snapshot（太大），仅返回元信息。

#### 2. 获取某版本详情（含完整 snapshot）

```
GET /api/v1/scripts/:scriptId/versions/:versionId
```

响应 `data` 中包含完整 `snapshot` JSON。

#### 3. 回滚到某版本

```
POST /api/v1/scripts/:scriptId/versions/:versionId/rollback
```

业务逻辑：
1. 加载目标版本的 snapshot
2. 用 snapshot 中的 `shots[]` 覆盖当前 `script_shots` 表
3. 用 snapshot 中的 `script` 字段覆盖 `scripts` 表对应字段
4. 调用 `saveVersion` 创建新版本（`triggerAction: 'ROLLBACK'`）
5. 返回当前最新剧本数据

响应：标准剧本详情格式。

### 后端 Service 实现

#### 文件: `apps/server-gateway/src/script/script-version.service.ts`（新增）

```typescript
@Injectable()
export class ScriptVersionService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 保存当前剧本快照为版本
   * 在 ScriptService.save() 和 applyPatch() 成功后调用
   */
  async saveVersion(scriptId: string, triggerAction: 'MANUAL_SAVE' | 'PATCH_EDIT' | 'AI_REGENERATE' | 'ROLLBACK'): Promise<void> {
    // 1. 查询当前 script + shots
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      include: { shots: { orderBy: { shotIndex: 'asc' } } },
    });
    if (!script) throw new NotFoundException('剧本不存在');

    // 2. 获取下一个版本号
    const lastVersion = await this.prisma.scriptVersion.findFirst({
      where: { scriptId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;

    // 3. 最多保留 50 个版本，超出删除最旧的
    const totalVersions = await this.prisma.scriptVersion.count({ where: { scriptId } });
    if (totalVersions >= 50) {
      const oldestVersions = await this.prisma.scriptVersion.findMany({
        where: { scriptId },
        orderBy: { createdAt: 'asc' },
        take: totalVersions - 49,
        select: { id: true },
      });
      await this.prisma.scriptVersion.deleteMany({
        where: { id: { in: oldestVersions.map(v => v.id) } },
      });
    }

    // 4. 创建快照
    await this.prisma.scriptVersion.create({
      data: {
        scriptId,
        versionNumber: nextVersion,
        triggerAction,
        snapshot: {
          script: {
            title: script.title,
            video_duration: script.videoDuration,
            style_vibe: script.styleVibe,
            aspect_ratio: script.aspectRatio,
            language: script.language,
            target_audience: script.targetAudience,
            constraint_list: script.constraintList,
          },
          shots: script.shots.map(s => ({
            shot_index: s.shotIndex,
            duration: s.duration,
            scene_description_query: s.sceneDescriptionQuery,
            visual_description: s.visualDescription,
            camera_movement: s.cameraMovement,
            transition_type: s.transitionType,
            voiceover_text: s.voiceoverText,
            subtitle_text: s.subtitleText,
            safe_zone_bounding_box: s.safeZoneBoundingBox,
            selected_slice_id: s.selectedSliceId,
            render_prompt: s.renderPrompt,
            local_factor_patch: s.localFactorPatch,
          })),
        },
      },
    });
  }

  async listVersions(scriptId: string, page: number, pageSize: number) { /* 分页查询 */ }

  async getVersion(scriptId: string, versionId: string) { /* 单版本详情 */ }

  async rollback(scriptId: string, versionId: string) {
    const version = await this.getVersion(scriptId, versionId);
    const snapshot = version.snapshot as any;

    // 事务：覆盖 script 字段 + 删除旧 shots + 批量创建新 shots
    await this.prisma.$transaction(async (tx) => {
      await tx.script.update({
        where: { id: scriptId },
        data: {
          title: snapshot.script.title,
          videoDuration: snapshot.script.video_duration,
          styleVibe: snapshot.script.style_vibe,
          aspectRatio: snapshot.script.aspect_ratio,
          language: snapshot.script.language,
          targetAudience: snapshot.script.target_audience,
          constraintList: snapshot.script.constraint_list,
        },
      });
      await tx.scriptShot.deleteMany({ where: { scriptId } });
      await tx.scriptShot.createMany({
        data: snapshot.shots.map((s: any) => ({
          scriptId,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch ?? Prisma.JsonNull,
        })),
      });
    });

    // 回滚操作也创建一个新版本
    await this.saveVersion(scriptId, 'ROLLBACK');
  }
}
```

### 前端修改

#### 文件: `apps/web-client/src/features/scripts/ScriptsPage.tsx`

在剧本编辑区右上角「保存」按钮旁边，新增「版本历史」按钮：

```tsx
<Button variant="outline" size="sm" onClick={() => setShowVersionPanel(true)}>
  版本历史
</Button>
```

点击后弹出右侧面板或 Dialog：

```
┌─────────────────────────────────────────┐
│ 版本历史                         [关闭] │
├─────────────────────────────────────────┤
│                                         │
│ ● v3  2026-06-05 12:00  PATCH_EDIT      │
│   [预览] [回滚]                          │
│                                         │
│ ● v2  2026-06-05 11:30  MANUAL_SAVE     │
│   [预览] [回滚]                          │
│                                         │
│ ● v1  2026-06-05 10:00  AI_REGENERATE   │
│   [预览] [回滚]                          │
│                                         │
└─────────────────────────────────────────┘
```

- **预览**：展开显示该版本的分镜摘要（分镜数、时长、旁白前50字）
- **回滚**：二次确认弹窗 → 调用回滚 API → 刷新页面 → 显示回滚后内容 + toast 提示

### 校验步骤

1. 生成一个剧本 → 手动编辑一个分镜的旁白文案 → 点击保存
2. 打开版本历史 → 确认 v2 出现，触发动作=MANUAL_SAVE
3. 点击 v2 的预览 → 确认旁白为修改后的版本
4. 点击 v1 的回滚 → 确认弹窗 → 剧本恢复到最初生成的内容
5. 版本列表出现 v3，触发动作=ROLLBACK

---

## 2.2 响度标准化参数可视化配置

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| 后端 | `apps/server-gateway/src/creation/creation.controller.ts` | **修改** — export 接口新增 loudnorm 可选参数 |
| 后端 | `apps/server-gateway/src/creation/dto/export-creation.dto.ts` | **修改** — DTO 新增 loudnorm_i/loudnorm_tp 字段 |
| 后端 | `workers/remotion-render-worker/src/` | **修改** — FFmpeg loudnorm 命令改为读取 jobData 中的参数 |
| 前端 | `apps/web-client/src/features/create/CreatePage.tsx` | **修改** — 导出弹窗新增「响度设置」折叠区 |

### 后端修改

#### DTO 新增字段

```typescript
export class ExportCreationDto {
  // ... 现有字段 ...

  @IsOptional()
  @IsNumber()
  @Min(-24)
  @Max(-10)
  @ApiPropertyOptional({ description: '目标响度 LUFS，默认 -14', example: -14 })
  loudnorm_i?: number;

  @IsOptional()
  @IsNumber()
  @Min(-3)
  @Max(0)
  @ApiPropertyOptional({ description: '最大真峰值 dBTP，默认 -1', example: -1 })
  loudnorm_tp?: number;
}
```

#### Worker 端

Worker `creation.processor.ts` 的 LOUDNORM_COMPLIANCE 阶段：

```typescript
const loudnormI = job.data.loudnorm_i ?? -14;
const loudnormTp = job.data.loudnorm_tp ?? -1;
const ffmpegArgs = [
  '-i', inputPath,
  '-af', `loudnorm=I=${loudnormI}:LRA=11:TP=${loudnormTp}:print_format=summary`,
  // ... 其他参数
];
```

### 前端修改

导出弹窗中在分辨率/格式选择下方新增折叠区：

```tsx
<Collapsible>
  <CollapsibleTrigger>
    <ChevronDown /> 响度设置（高级）
  </CollapsibleTrigger>
  <CollapsibleContent>
    <div className="space-y-4 pt-2">
      <div>
        <label>目标响度 (LUFS)</label>
        <Slider
          value={[loudnormI]}
          onValueChange={([v]) => setLoudnormI(v)}
          min={-24} max={-10} step={0.5}
        />
        <span className="text-sm text-muted-foreground">
          当前: {loudnormI} LUFS（标准 -14，越小越安静）
        </span>
      </div>
      <div>
        <label>最大真峰值 (dBTP)</label>
        <Slider
          value={[loudnormTp]}
          onValueChange={([v]) => setLoudnormTp(v)}
          min={-3} max={0} step={0.5}
        />
        <span className="text-sm text-muted-foreground">
          当前: {loudnormTp} dBTP（标准 -1，防止削波失真）
        </span>
      </div>
    </div>
  </CollapsibleContent>
</Collapsible>
```

### 校验步骤

1. 创建一个创作任务并等待完成
2. 点击导出 → 展开响度设置 → 调整为 -18 LUFS
3. 触发导出 → 下载视频 → 用 FFprobe 或音频分析工具验证响度为 -18 LUFS

---

## 2.3 创作模板一键复用

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| DB | `prisma/schema.prisma` | **修改** — 新增 `CreationTemplate` 表 |
| 后端 | `apps/server-gateway/src/creation/creation-template.service.ts` | **新增** |
| 后端 | `apps/server-gateway/src/creation/creation.controller.ts` | **修改** — 新增保存/加载端点 |
| 前端 | `apps/web-client/src/features/tasks/TasksPage.tsx` | **修改** — 已完成任务行新增「保存为模板」按钮 |
| 前端 | `apps/web-client/src/features/create/CreatePage.tsx` | **修改** — 创建面板新增「加载模板」下拉 |

### 数据库变更

```prisma
model CreationTemplate {
  id         String   @id @default(uuid()) @db.Uuid
  name       String   @db.VarChar(200)
  productId  String?  @map("product_id") @db.Uuid
  scriptId   String   @map("script_id") @db.Uuid
  presetJson Json     @map("preset_json") @db.JsonB
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz()

  @@map("creation_templates")
}
```

`preset_json` 结构：

```json
{
  "target_resolution": "1080x1920",
  "export_format": "MP4/H.264",
  "voice_profile": "zh-CN-Female-1",
  "bgm_policy": "auto_match",
  "bgm_id": null,
  "loudnorm_i": -14,
  "loudnorm_tp": -1,
  "engine_mode": "SCRIPT_DRIVEN"
}
```

### API 端点

#### 1. 保存为模板

```
POST /api/v1/creations/:creationId/save-as-template
```

请求体：`{ "name": "我的爆款模板" }`

业务逻辑：读取该 creation 关联的 script_id 和创建参数 → 写入 `creation_templates` 表。

#### 2. 模板列表

```
GET /api/v1/creation-templates
```

#### 3. 删除模板

```
DELETE /api/v1/creation-templates/:templateId
```

#### 4. 加载模板创建

修改 `POST /api/v1/creations` 接口，新增可选参数：

```json
{
  "product_id": "...",
  "script_id": "...",
  "creation_template_id": "uuid"   // 新增：加载此模板的预设参数
}
```

### 校验步骤

1. 创建一个创作任务，手动选择特定 BGM 和 TTS 音色 → 等待完成
2. 在任务历史中点击「保存为模板」→ 命名为"测试模板01"
3. 新建创作 → 选择「从模板加载」→ 选择"测试模板01" → BGM/TTS 参数自动填充

---

## 2.4 Grafana Dashboard 预置

### 实施文件清单

| 路径 | 内容 |
|------|------|
| `docker/grafana-dashboards/api-overview.json` | API 概览 Dashboard JSON |
| `docker/grafana-dashboards/creation-pipeline.json` | 创作流水线 Dashboard JSON |
| `docker/grafana-dashboards/ai-calls.json` | AI 调用 Dashboard JSON |
| `docker/grafana-dashboards.yml` | Dashboard Provisioning 配置文件 |
| `docker-compose.yml` | **修改** — Grafana 服务增加 dashboard volume 挂载 |

### docker-compose.yml 修改

```yaml
grafana:
  image: grafana/grafana:latest
  container_name: tikstream-grafana
  ports:
    - "3001:3000"
  volumes:
    - ./docker/grafana-datasources.yml:/etc/grafana/provisioning/datasources/default.yml
    - ./docker/grafana-dashboards.yml:/etc/grafana/provisioning/dashboards/default.yml        # 新增
    - ./docker/grafana-dashboards:/var/lib/grafana/dashboards                                  # 新增
    - grafana_data:/var/lib/grafana
```

### docker/grafana-dashboards.yml（新增）

```yaml
apiVersion: 1
providers:
  - name: 'TikStream'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    options:
      path: /var/lib/grafana/dashboards
```

### 三个 Dashboard 内容规划

#### Dashboard 1: API 概览 (`api-overview.json`)

| Panel | 类型 | PromQL 指标 |
|-------|------|-------------|
| QPS（每秒请求数）| Graph | `rate(tikstream_http_requests_total[1m])` |
| P50/P95/P99 延迟 | Graph | `histogram_quantile(0.5/0.95/0.99, rate(http_request_duration_seconds_bucket[5m]))` |
| 错误率 % | Stat | `rate(tikstream_http_requests_total{status=~"5.."}[1m]) / rate(tikstream_http_requests_total[1m])` |
| 各端点请求分布 | Pie | `sum by (path) (rate(tikstream_http_requests_total[5m]))` |

#### Dashboard 2: 创作流水线 (`creation-pipeline.json`)

| Panel | PromQL 指标 |
|-------|-------------|
| 各阶段成功率 | `tikstream_creation_stage_transitions_total{status="success"} / ...` |
| 各阶段平均耗时 | `rate(tikstream_creation_stage_duration_seconds_sum[1h]) / rate(..._count[1h])` |
| 队列堆积数 | Worker 暴露的 `tikstream_queue_waiting_total` |
| 失败率趋势 | `rate(tikstream_creation_failures_total[5m])` |

#### Dashboard 3: AI 调用 (`ai-calls.json`)

| Panel | PromQL 指标 |
|-------|-------------|
| Seedance 调用量/成功率 | `tikstream_seedance_api_calls_total` |
| Doubao 调用量（80 RPM 限流监控）| `tikstream_doubao_api_calls_total` |
| TTS 生成耗时 P95 | `histogram_quantile(0.95, rate(tikstream_tts_duration_seconds_bucket[5m]))` |
| 外部 API 错误次数 | `tikstream_external_api_errors_total` |

> **重要**：这些 Dashboard 需要在 Grafana UI 中手动创建后导出为 JSON，或直接在 JSON 中编写。建议先在本地 Grafana (`localhost:3001`) 手动搭建一个版本，导出 JSON 文件后放入上述路径，后续重建即自动加载。

### 校验步骤

1. `docker compose up -d grafana` 启动 Grafana
2. 访问 `http://localhost:3001` → 登录（admin/admin）
3. 进入 Dashboards → 确认 3 个预置 Dashboard 已加载
4. 检查 API 概览 Dashboard 中各 Graph 有数据显示

---

# Phase 3: 创新亮点功能

## 3.1 爆款 DNA 提取与驱动生成

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| DB | `prisma/schema.prisma` | **修改** — 新增 `DnaPattern` 表 |
| 后端 | `apps/server-gateway/src/viral-analysis/viral-dna.service.ts` | **新增** — DNA 提取/聚类/驱动生成 |
| 后端 | `apps/server-gateway/src/viral-analysis/viral-analysis.controller.ts` | **修改** — 新增 3 个 DNA 端点 |
| 后端 | `apps/server-gateway/src/script/script.service.ts` | **修改** — 新增 `generateFromDna` 方法 |
| 后端 | `apps/server-gateway/src/script/script.controller.ts` | **修改** — 新增 `POST /scripts/generate/dna` |
| 前端 | `apps/web-client/src/features/viral-analysis/ViralAnalysisPage.tsx` | **修改** — 新增 DNA 提取入口 |
| 前端 | `apps/web-client/src/features/scripts/ScriptsPage.tsx` | **修改** — 生成模式新增「DNA 驱动」按钮 |

### 数据库变更

```prisma
model DnaPattern {
  id              String   @id @default(uuid()) @db.Uuid
  productCategory String   @map("product_category") @db.VarChar(50)
  market          String   @default("GLOBAL") @db.VarChar(20)
  dnaJson         Json     @map("dna_json") @db.JsonB
  sampleCount     Int      @map("sample_count") @default(0)
  confidence      Float    @default(0)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz()

  @@index([productCategory])
  @@index([confidence])
  @@map("dna_patterns")
}
```

`dna_json` 结构（见改进.md 5.2.1 完整定义）。

### API 端点

#### 1. 提取 DNA

```
POST /api/v1/viral-video-analyses/dna/extract
```

请求体：
```json
{
  "product_category": "beauty_personal_care",
  "market": "ID",
  "min_samples": 10
}
```

响应：
```json
{
  "success": true,
  "data": {
    "dna_id": "uuid",
    "product_category": "beauty_personal_care",
    "market": "ID",
    "sample_count": 15,
    "confidence": 0.3,
    "clusters": [
      {
        "cluster_id": 0,
        "size": 8,
        "hook_type": "problem_forward",
        "avg_retention_rate": 0.72,
        "visual_style": "dynamic_handheld",
        "bgm_genre": "upbeat_pop"
      }
    ]
  }
}
```

#### 2. 获取 DNA 详情

```
GET /api/v1/viral-video-analyses/dna/:dnaId
```

#### 3. 按类目查询 DNA 列表

```
GET /api/v1/viral-video-analyses/dna?product_category=xxx&market=ID
```

#### 4. 基于 DNA 生成剧本

```
POST /api/v1/scripts/generate/dna
```

请求体：
```json
{
  "product_id": "uuid",
  "dna_id": "uuid",
  "style_vibe": "fast_paced",
  "aspect_ratio": "9:16"
}
```

### 核心实现逻辑

#### 文件: `apps/server-gateway/src/viral-analysis/viral-dna.service.ts`

**简化版 K-Means 聚类（纯 TypeScript，无需 Python）**：

```typescript
/**
 * DNA 提取主流程
 */
async extractDNA(dto: ExtractDnaDto): Promise<DnaExtractResult> {
  // STEP 1: 收集同类目已完成分析
  const analyses = await this.viralAnalysisRepository.findByCategory(dto.product_category, {
    minReportSize: 1,
    limit: 100,
  });

  if (analyses.length < (dto.min_samples ?? 10)) {
    throw new BadRequestException(
      `样本不足：当前 ${analyses.length} 个，需要至少 ${dto.min_samples ?? 10} 个`
    );
  }

  // STEP 2: 提取特征向量（12 维）
  // [hookType(0-5), hookDuration(0-1), hookRetention(0-1),
  //  cameraType(0-5), transitionType(0-5), shotCount(0-1), textRatio(0-1),
  //  bgmGenre(0-5), bgmBpm(0-1), energyPeak(0-1),
  //  avgShotDuration(0-1), pacingVariance(0-1)]
  const vectors = analyses.map(a => this.extractFeatureVector(a));

  // STEP 3: 按 Hook Type 分组（硬聚类，替代 K-Means）
  const hookGroups = new Map<number, { vector: number[]; analysis: any }[]>();
  vectors.forEach((v, i) => {
    const hookType = Math.round(v[0] * 5); // 反归一化 Hook 类型
    if (!hookGroups.has(hookType)) hookGroups.set(hookType, []);
    hookGroups.get(hookType)!.push({ vector: v, analysis: analyses[i] });
  });

  // STEP 4: 从每个聚簇提取统计 DNA
  const clusterResults = Array.from(hookGroups.entries()).map(([hookType, members]) => {
    const hookRetentions = members.map(m => (m.analysis.reportJson as any)?.hook_retention_rate ?? 0);
    return {
      hookType,
      size: members.length,
      avgRetentionRate: average(hookRetentions),
      // ... 其他统计量
    };
  });

  // STEP 5: 存入数据库
  const dna = await this.prisma.dnaPattern.create({
    data: {
      productCategory: dto.product_category,
      market: dto.market ?? 'GLOBAL',
      dnaJson: { clusters: clusterResults, extracted_at: new Date().toISOString() },
      sampleCount: analyses.length,
      confidence: Math.min(analyses.length / 50, 1.0),
    },
  });

  return { dna_id: dna.id, ...clusterResults };
}
```

#### 剧本生成集成

`ScriptService.generateFromDna()`：

```typescript
async generateFromDna(dto: GenerateFromDnaDto): Promise<Script> {
  // 1. 加载 DNA
  const dna = await this.prisma.dnaPattern.findUnique({ where: { id: dto.dna_id } });
  if (!dna) throw new NotFoundException('DNA 未找到');

  const clusters = (dna.dnaJson as any).clusters;

  // 2. 选择最优 Hook（按留存率排序）
  const bestCluster = clusters.sort((a, b) => b.avgRetentionRate - a.avgRetentionRate)[0];

  // 3. 构造 Prompt 约束
  const constraints = {
    hook_type: bestCluster.hookType,           // 如 "problem_forward"
    hook_duration_range: bestCluster.durationRange,
    visual_style: bestCluster.visualStyle,     // 如 "dynamic_handheld"
    bgm_genre: bestCluster.bgmGenre,           // 如 "upbeat_pop"
    bgm_bpm_range: bestCluster.bpmRange,
  };

  // 4. 复用 Composed 模式的 PromptBuilder，注入 DNA 约束
  return this.generateComposed({
    product_id: dto.product_id,
    style_vibe: dto.style_vibe ?? 'fast_paced',
    aspect_ratio: dto.aspect_ratio ?? '9:16',
    template_constraints: constraints,  // 注入 DNA 约束
  });
}
```

### 前端改动

#### ViralAnalysisPage.tsx

在爆款分析列表页顶部新增操作区：

```
┌─────────────────────────────────────────────────┐
│ 爆款 DNA 提取                                    │
│ 类目: [美容个护 ▾]  市场: [印尼 ▾]  样本: >= [10] │
│ [开始提取 DNA]                                   │
├─────────────────────────────────────────────────┤
│ DNA 结果列表:                                    │
│ ┌─────────────────────────────────────────────┐ │
│ │ DNA-001 | 美容个护/ID | 15样本 | 置信度30%   │ │
│ │ Hook: problem_forward(8) contrast_compare(7) │ │
│ │ [基于此DNA生成剧本]                           │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 校验步骤

1. 先为"美容个护"类目创建至少 10 个已完成 AI 分析的爆款分析记录
2. 进入爆款分析页 → DNA 提取 → 选择类目"美容个护" → 点击提取
3. 确认返回集群结果：至少 1-2 个 Hook 类型分组及其统计量
4. 点击「基于此DNA生成剧本」→ 跳转剧本编辑页 → 生成的剧本包含 DNA 中的 Hook 类型和视觉风格

---

## 3.2 创作效果 A/B 自动多版本生成

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| DB | `prisma/schema.prisma` | **修改** — 新增 `AutoAbSession` 表 |
| 后端 | `apps/server-gateway/src/analytics/auto-ab.service.ts` | **新增** |
| 后端 | `apps/server-gateway/src/analytics/analytics.controller.ts` | **修改** — 新增 3 个自动 A/B 端点 |
| 前端 | `apps/web-client/src/features/analytics/AnalyticsPage.tsx` | **修改** — 新增「自动 A/B」Tab |

### 数据库变更

```prisma
model AutoAbSession {
  id            String    @id @default(uuid()) @db.Uuid
  baseScriptId  String    @map("base_script_id") @db.Uuid
  status        String    @default("PENDING") @db.VarChar(20)  // PENDING/GENERATING_VARIANTS/CREATING_VIDEOS/COMPARING/COMPLETED/FAILED
  variantConfigs Json    @map("variant_configs") @db.JsonB      // 风格变体配置列表
  variantScriptIds Json?  @map("variant_script_ids") @db.JsonB  // 生成的变体剧本 ID 列表
  variantCreationIds Json? @map("variant_creation_ids") @db.JsonB
  resultJson    Json?     @map("result_json") @db.JsonB         // A/B 对比结果
  progress      Float     @default(0)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  completedAt   DateTime? @map("completed_at") @db.Timestamptz()

  @@map("auto_ab_sessions")
}
```

### API 端点

#### 1. 创建自动 A/B 会话

```
POST /api/v1/analytics/auto-ab
```

请求体：
```json
{
  "script_id": "uuid",
  "style_variants": [
    { "label": "高能量版", "style_vibe": "high_energy" },
    { "label": "专业沉稳版", "style_vibe": "calm_professional" }
  ]
}
```

响应：
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "status": "PENDING",
    "variant_count": 2
  }
}
```

#### 2. 查询会话状态

```
GET /api/v1/analytics/auto-ab/:sessionId
```

#### 3. SSE 进度订阅

```
GET /api/v1/analytics/auto-ab/:sessionId/events
```

SSE 事件类型（新增）：
```
auto_ab.variant_generated  | auto_ab.creation_started | auto_ab.creation_completed
auto_ab.comparing          | auto_ab.completed         | auto_ab.failed
```

### 核心实现逻辑

```typescript
async executeAutoAb(sessionId: string): Promise<void> {
  const session = await this.loadSession(sessionId);

  // STEP 1: 批量生成变体剧本（并行）
  this.updateProgress(sessionId, 10, 'GENERATING_VARIANTS');
  const variantScripts = await Promise.all(
    session.variantConfigs.map(cfg =>
      this.scriptService.generateHybrid({
        product_id: baseScript.productId,
        template_constraints: { style_vibe: cfg.style_vibe },
      })
    )
  );
  this.updateProgress(sessionId, 40, 'GENERATING_VARIANTS_DONE');

  // STEP 2: 批量创建创作任务（并行）
  this.updateProgress(sessionId, 50, 'CREATING_VIDEOS');
  const variantCreations = await Promise.all(
    variantScripts.map(script =>
      this.creationService.createFromScript(script.id, { /* 统一参数 */ })
    )
  );
  this.updateProgress(sessionId, 70, 'VIDEOS_CREATED');

  // STEP 3: 轮询等待所有创作完成
  await this.waitAllCreationsComplete(variantCreations.map(c => c.id));

  // STEP 4: 调用 A/B 对比
  this.updateProgress(sessionId, 90, 'COMPARING');
  const comparisons = [];
  for (let i = 0; i < variantCreations.length; i++) {
    for (let j = i + 1; j < variantCreations.length; j++) {
      const result = await this.analyticsService.abCompare({
        creation_id_a: variantCreations[i].id,
        creation_id_b: variantCreations[j].id,
      });
      comparisons.push(result);
    }
  }

  // STEP 5: 存储结果
  this.updateProgress(sessionId, 100, 'COMPLETED');
  await this.saveResult(sessionId, comparisons);
}
```

### 前端改动

`AnalyticsPage.tsx` 新增「自动 A/B」Tab：

```
┌──────────────────────────────────────────────────────┐
│ 自动 A/B 对比                                         │
│                                                      │
│ 原剧本: [选择已有剧本 ▾]                              │
│                                                      │
│ 风格变体:                                            │
│ ☑ 高能量版 (high_energy)                             │
│ ☑ 专业沉稳版 (calm_professional)                     │
│ ☐ 幽默风格版 (humor_touch)                           │
│                                                      │
│ [开始自动对比]                                       │
│                                                      │
│ ── 进度 ──                                           │
│ ████████████░░░░░░░░ 60%                             │
│ 正在生成变体剧本 (2/2 完成)                           │
│ 正在创建视频 (1/2 完成) ...                           │
│                                                      │
│ ── 对比结果 ──                                       │
│ ┌──────────┬──────────┬──────────┬──────────┐       │
│ │ 指标      │ 原版     │ 高能量版  │ 沉稳版   │       │
│ ├──────────┼──────────┼──────────┼──────────┤       │
│ │ 预估完播率│ 65.2%    │ 78.4% ▲  │ 62.1%    │       │
│ │ 预估CTR   │ 3.2%     │ 4.1% ▲   │ 3.5%     │       │
│ │ 预估CVR   │ 2.1%     │ 2.8% ▲   │ 2.2%     │       │
│ └──────────┴──────────┴──────────┴──────────┘       │
│                                                      │
│ 🏆 推荐版本: 高能量版                                  │
│ 原因: Hook强度提升15%，预估完播率提升13%               │
└──────────────────────────────────────────────────────┘
```

### 校验步骤

1. 准备一个已完成的分析剧本作为基础
2. 进入分析看板 → 自动 A/B Tab → 选择该剧本 + 勾选 2 个变体 → 开始
3. SSE 进度从 10% → 40% → 70% → 90% → 100%
4. 完成时展示三版本对比表格和推荐结论

---

## 3.3 LangGraph Agent 增强（4节点 → 7节点）

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| 后端 | `apps/server-gateway/src/agent/graph.ts` | **修改** — 新增 3 个节点 + 条件路由 |
| 后端 | `apps/server-gateway/src/agent/nodes/match-assets.node.ts` | **新增** |
| 后端 | `apps/server-gateway/src/agent/nodes/create-video.node.ts` | **新增** |
| 后端 | `apps/server-gateway/src/agent/nodes/quality-check.node.ts` | **新增** |
| 后端 | `apps/server-gateway/src/agent/agent.controller.ts` | **修改** — 新增 SSE 端点 |
| 前端 | `apps/web-client/src/features/scripts/ScriptsPage.tsx` | **修改** — Agent 模式增强面板 |

### 状态定义（扩展）

```typescript
interface VideoCreationState {
  // 输入
  productId: string;
  preferences: 'WINNER' | 'LOSER';
  maxIterations: number;

  // 中间产物
  product?: ProductInfo;
  script?: Script | null;
  review?: ReviewResult | null;
  matchedShots?: MatchedShot[];     // 新增
  creation?: Creation | null;       // 新增
  qualityIssues?: string[];         // 新增

  // 控制
  iterations: number;
  feedback: string | null;
  currentNode?: string;             // 新增：当前节点名（用于 SSE）
}
```

### 图结构（7节点）

```
START
  │
  ▼
understandProduct ───────────────────── 分析商品属性
  │
  ▼
generateScript ──────────────────────── 生成剧本
  │
  ▼
reviewAndRefine ─── score<0.7 && iterations<3 ──→ generateScript (回环)
  │
  │ score≥0.7 || iterations≥3
  ▼
matchAssets ─────────────────────────── 智能素材匹配
  │
  ▼
createVideo ──────────────────────────── 自动创建创作任务
  │
  ▼
qualityCheck ──── 有问题 ──→ createVideo (触发 rerenderShot)
  │
  │ 无问题
  ▼
finalize ────────────────────────────── 入库+返回
  │
  ▼
 END
```

### 新增节点实现要点

#### match-assets.node.ts

```typescript
export const matchAssetsNode = async (state: VideoCreationState, deps: AgentDependencies) => {
  const { script } = state;
  if (!script) throw new Error('剧本未生成');

  // 遍历每个分镜，调用素材搜索 API
  const matchedShots = await Promise.all(
    script.shots.map(async (shot, index) => {
      const searchResults = await deps.materialService.searchMaterials({
        product_id: state.productId,
        query: shot.scene_description_query ?? shot.visual_description,
        min_duration: shot.duration * 0.8,
        max_duration: shot.duration * 1.2,
      });
      return { shotIndex: index, bestMatch: searchResults.items[0] ?? null };
    })
  );

  return { matchedShots, currentNode: 'matchAssets' };
};
```

#### quality-check.node.ts

```typescript
export const qualityCheckNode = async (state: VideoCreationState, deps: AgentDependencies) => {
  const { creation } = state;
  if (!creation) throw new Error('创作任务未创建');

  const health = await deps.creationService.getHealth(creation.id);
  const hasIssues = health.failed_shots.length > 0;

  if (hasIssues) {
    return {
      qualityIssues: health.failed_shots.map(s => `分镜 ${s.shot_index + 1}: ${s.error}`),
      currentNode: 'qualityCheck',
    };
  }

  return { qualityIssues: [], currentNode: 'qualityCheck' };
};
```

### 新增 SSE 端点

```
GET /api/v1/agent/events/:runId
```

每个节点执行完毕后推送 SSE 事件：

```typescript
event: agent.node.completed
data: {"node": "generateScript", "status": "completed", "message": "剧本已生成，4个分镜，总时长12秒"}

event: agent.node.completed
data: {"node": "reviewAndRefine", "status": "completed", "message": "审查通过 (score=0.82)", "detail": {"score": 0.82, "passed": true}}

event: agent.node.completed
data: {"node": "matchAssets", "status": "completed", "message": "素材匹配完成，4/4 分镜匹配成功"}

event: agent.completed
data: {"runId": "xxx", "status": "completed", "creation_id": "yyy", "task_id": "zzz"}
```

### 前端改动

`ScriptsPage.tsx`：「AI Agent 模式」按钮 → 在弹出的 Agent 面板中：

- 输入 product_id
- 选择 preferences (WINNER/LOSER)
- 点击「开始 Agent 创作」
- 下方展示实时进度流：
  ```
  ✅ 商品理解完成 — 美容个护，印尼市场
  ✅ 剧本生成完成 — 4分镜，12秒
  ✅ 自我审查通过 — 评分 0.82（第2次迭代）
  🔄 素材匹配中...
  ⏳ 视频创作中...
  ⏳ 质量检查...
  🎉 全部完成！查看创作结果 →
  ```

---

# Phase 4: 国际化与素材完善

## 4.1 前端 i18n 国际化（zh-CN / en-US / id-ID）

### 实施文件清单

| 路径 | 内容 |
|------|------|
| `apps/web-client/src/i18n/index.ts` | i18n 初始化配置 |
| `apps/web-client/src/i18n/locales/zh-CN.json` | 中文翻译（从现有硬编码字符串提取） |
| `apps/web-client/src/i18n/locales/en-US.json` | 英文翻译 |
| `apps/web-client/src/i18n/locales/id-ID.json` | 印尼语翻译 |
| `apps/web-client/src/components/LanguageSwitcher.tsx` | 语言切换组件（顶部栏下拉） |
| `apps/web-client/src/features/*/*.tsx` | **全部页面** — 硬编码中文字符串替换为 `t('key')` |

### 依赖安装

```bash
cd apps/web-client
pnpm add react-i18next i18next i18next-browser-languagedetector
```

### i18n 初始化

```typescript
// apps/web-client/src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';
import idID from './locales/id-ID.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
      'id-ID': { translation: idID },
    },
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
  });

export default i18n;
```

### 翻译 Key 覆盖范围

翻译 JSON 需覆盖以下领域（约 300-400 个 key）：

| 命名空间 | 内容示例 | Key 数量（估算） |
|----------|----------|------------------|
| `common` | 保存/取消/删除/确定/加载中/重试/搜索/筛选/分页... | ~40 |
| `nav` | 素材/剧本/创作/模板/任务/分析/合规... | ~15 |
| `material` | 上传/切片/检索/回收站/状态标签... | ~50 |
| `script` | 生成/编辑/分镜/运镜/转场/版本历史... | ~70 |
| `creation` | 创建/导出/重渲染/替换/状态/阶段... | ~50 |
| `task` | 取消/重试/删除/回收站/恢复/批量操作... | ~30 |
| `analytics` | 留存/热力图/桑基图/AB对比/自愈... | ~40 |
| `template` | 市场/聚类/应用/策略/因子... | ~30 |
| `errors` | 上传失败/生成失败/网络错误/校验失败... | ~25 |

### 语言切换器

顶部栏右侧新增语言下拉选择器：

```tsx
// apps/web-client/src/components/LanguageSwitcher.tsx
import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <select
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="text-sm border rounded px-2 py-1"
    >
      <option value="zh-CN">🇨🇳 中文</option>
      <option value="en-US">🇺🇸 English</option>
      <option value="id-ID">🇮🇩 Bahasa</option>
    </select>
  );
}
```

### 替换策略

- 第一轮：替换公共组件（AppShell、按钮、表单、Toast 等），约 50 个 key
- 第二轮：逐页面替换（MaterialsPage → ScriptsPage → TasksPage → TemplatesPage → CreatePage → AnalyticsPage → CompliancePage），每页约 30-60 个 key
- 校验：每个页面完成后在浏览器切换语言验证

### 校验步骤

1. 启动前端 → 顶部栏语言下拉选择 English → 确认页面所有文案变为英文
2. 切换为 Bahasa Indonesia → 确认印尼语文案
3. 切换回中文 → 确认回到原始状态

---

## 4.2 后端错误消息国际化

### 实施文件清单

| 路径 | 内容 |
|------|------|
| `apps/server-gateway/src/i18n/messages.ts` | 三语错误消息映射表 |
| `apps/server-gateway/src/i18n/i18n-exception.filter.ts` | 全局异常过滤器扩展（根据 Accept-Language 选语言） |
| `apps/server-gateway/src/main.ts` | **修改** — 注册国际化异常过滤器 |

### 实现要点

```typescript
// apps/server-gateway/src/i18n/messages.ts
export const ERROR_MESSAGES = {
  'zh-CN': {
    SCRIPT_NOT_FOUND: '剧本不存在',
    CREATION_NOT_FOUND: '创作任务不存在',
    TASK_STILL_PROCESSING: '处理中的任务无法删除，请先取消任务',
    // ...
  },
  'en-US': {
    SCRIPT_NOT_FOUND: 'Script not found',
    CREATION_NOT_FOUND: 'Creation task not found',
    TASK_STILL_PROCESSING: 'Cannot delete a running task. Please cancel it first.',
    // ...
  },
  'id-ID': {
    SCRIPT_NOT_FOUND: 'Skrip tidak ditemukan',
    CREATION_NOT_FOUND: 'Tugas pembuatan tidak ditemukan',
    TASK_STILL_PROCESSING: 'Tidak dapat menghapus tugas yang sedang berjalan. Harap batalkan terlebih dahulu.',
    // ...
  },
};

export function getLocalizedMessage(code: string, lang: string): string {
  return ERROR_MESSAGES[lang]?.[code] ?? ERROR_MESSAGES['zh-CN'][code] ?? code;
}
```

---

## 4.3 SFX 音效提取完善

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| Worker | `workers/gpu-slicing-worker/python_scripts/sfx_extractor.py` | **新增** — HTDemucs 音效分离脚本 |
| Worker | `workers/gpu-slicing-worker/src/slicing-pipeline.ts` | **修改** — 切片流程新增 SFX 提取步骤 |
| 前端 | `apps/web-client/src/features/materials/MaterialsPage.tsx` | **修改** — 切片详情新增 SFX 试听按钮 |

### Worker 实现

```python
# workers/gpu-slicing-worker/python_scripts/sfx_extractor.py
import demucs.separate
import os

def extract_sfx(input_video_path: str, output_dir: str) -> dict:
    """
    使用 HTDemucs 分离音轨
    返回: { "sfx_path": "...", "vocals_path": "...", "drums_path": "...", "other_path": "..." }
    """
    demucs.separate.main(["--out", output_dir, "--two-stems", "drums", input_video_path])
    # 返回分离后的音轨路径
```

TypeScript 编排侧：在 `slicing-pipeline.ts` 中，每个切片生成后额外调用 SFX 提取，提取结果上传到 MinIO 的 `sfx/` 路径下。`slice-callback` API 写入 `sfx_url` 字段。

### 前端改动

素材详情页切片列表中，每个切片行新增 🔊 试听按钮。如果 `sfx_url` 有值则渲染 `<audio>` 播放器。

---

## 4.4 视频自动转码

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| DB | `prisma/schema.prisma` | **修改** — `materials` 表新增 `original_format` |
| Worker | `workers/gpu-slicing-worker/python_scripts/video_normalizer.py` | **新增** — FFmpeg 转码脚本 |
| Worker | `workers/gpu-slicing-worker/src/slicing-pipeline.ts` | **修改** — 切片前检查格式，非 H.264 则先转码 |

### 数据库变更

`materials` 表新增 `original_format VARCHAR(20)`，记录转码前原始格式（如 `MOV` / `WebM`），转码后保持 `file_type` 为 `VIDEO`。

### Worker 实现

```python
# python_scripts/video_normalizer.py
import subprocess

def normalize_video(input_path: str, output_path: str) -> bool:
    """将非 H.264 格式视频转码为 H.264 MP4"""
    cmd = [
        'ffmpeg', '-i', input_path,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0
```

---

# Phase 5: 测试与运维完善

## 5.1 E2E 测试补充（5个新 spec）

### 新增文件清单

| 文件 | 覆盖内容 |
|------|----------|
| `tests/task_delete.spec.ts` | 任务软删除/恢复/永久删除/批量删除/清空回收站 |
| `tests/agent_generate.spec.ts` | Agent 7节点生成 + SSE 进度 |
| `tests/script_version.spec.ts` | 剧本版本保存/列表/回滚 |
| `tests/material_sfx.spec.ts` | SFX 提取后的试听功能 |
| `tests/auto_ab.spec.ts` | 自动 A/B 会话创建 + SSE + 结果验证 |

### 测试用例设计要点

#### `tests/task_delete.spec.ts`

```
TC01: 删除终态任务 → 确认进入回收站 → 恢复 → 确认回到列表
TC02: 删除 PROCESSING 任务 → 确认返回 409 错误提示
TC03: 批量删除 3 个 FAILED 任务 → 确认 3 个全部进入回收站
TC04: 永久删除回收站任务 → 确认列表中不再出现
TC05: 清空回收站 → 确认所有已删除任务消失
```

#### `tests/agent_generate.spec.ts`

```
TC01: 输入 product_id → 启动 Agent → 验证 SSE 事件链完整
TC02: 验证 creation_id 和 task_id 已生成
```

#### `tests/script_version.spec.ts`

```
TC01: 编辑剧本后保存 → 验证版本历史新增一条记录
TC02: 回滚到 v1 → 验证内容恢复到初始状态
```

---

## 5.2 Prompt 模板管理系统（后台管理）

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| DB | `prisma/schema.prisma` | **修改** — 新增 `PromptTemplate` / `PromptTemplateVersion` 表 |
| 后端 | `apps/server-gateway/src/prompt/prompt-template.service.ts` | **新增** |
| 后端 | `apps/server-gateway/src/prompt/prompt-template.controller.ts` | **新增** |
| 后端 | `apps/server-gateway/services/prompts/*.ts` | **修改** — 各 PromptBuilder 改为从 DB 读取 template 文本 |
| 前端 | 无需前端页面（仅后端管理接口，或合并到管理员设置页） | — |

### 表结构

```prisma
model PromptTemplate {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @db.VarChar(100)       // 如 "script-quick"
  description String?  @db.VarChar(500)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  versions    PromptTemplateVersion[]

  @@map("prompt_templates")
}

model PromptTemplateVersion {
  id             String   @id @default(uuid()) @db.Uuid
  templateId     String   @map("template_id") @db.Uuid
  versionNumber  Int      @map("version_number")
  systemPrompt   String   @map("system_prompt") @db.Text
  userPrompt     String   @map("user_prompt") @db.Text
  createdAt      DateTime @default(now())

  template PromptTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@unique([templateId, versionNumber])
  @@map("prompt_template_versions")
}
```

### 改动范围

- 改造 `ScriptQuickPromptBuilder.buildSystemPrompt()`：改为 `await this.promptTemplateService.getActiveSystemPrompt('script-quick')` 从 DB 读取
- API 端点（管理员用）：`GET/POST/PATCH /api/v1/prompt-templates` + `GET/POST /api/v1/prompt-templates/:id/versions`
- 不做前端管理页面（P2 低优先级），通过 Swagger / curl 管理

---

## 5.3 爆款分析手动订阅模式

### 实施文件清单

| 层级 | 文件路径 | 操作 |
|------|----------|------|
| DB | `prisma/schema.prisma` | **修改** — 新增 `ViralSubscription` 表 |
| 后端 | `apps/server-gateway/src/viral-analysis/viral-subscription.service.ts` | **新增** |
| 后端 | `apps/server-gateway/src/viral-analysis/viral-analysis.controller.ts` | **修改** — 新增订阅管理端点 |

### 表结构

```prisma
model ViralSubscription {
  id             String   @id @default(uuid()) @db.Uuid
  platform       String   @db.VarChar(20)       // TIKTOK / YOUTUBE / INSTAGRAM
  accountUrl     String   @map("account_url") @db.VarChar(500)
  accountName    String?  @map("account_name") @db.VarChar(200)
  isActive       Boolean  @default(true) @map("is_active")
  lastCheckedAt  DateTime? @map("last_checked_at")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@map("viral_subscriptions")
}
```

### 定时扫描逻辑

```typescript
@Injectable()
export class ViralSubscriptionService {
  // 每日凌晨 2 点执行
  @Cron('0 2 * * *')
  async scanSubscriptions(): Promise<void> {
    const subscriptions = await this.prisma.viralSubscription.findMany({
      where: { isActive: true },
    });

    for (const sub of subscriptions) {
      // 调用对应的平台 API 获取最新视频列表
      // 对比已分析的 external_video_id，去重新建
      // 自动创建 ViralAnalysis 记录并触发 AI 分析
    }
  }
}
```

### API 端点

```
POST   /api/v1/viral-video-analyses/subscriptions      — 创建订阅
GET    /api/v1/viral-video-analyses/subscriptions      — 订阅列表
DELETE /api/v1/viral-video-analyses/subscriptions/:id  — 取消订阅
POST   /api/v1/viral-video-analyses/subscriptions/:id/scan-now  — 立即扫描
```

---

# 不可实现板块

以下功能在改进.md 或其他文档中有规划，但因外部条件限制当前无法实现。每个功能均保留了**前后端预留接口**，确保不干扰主体功能，并在前端适当体现。

---

## N-1 素材版权风险检测（预留接口）

### 不可实现原因

版权检测需接入第三方 API（如 YouTube Content ID、TME 版权库、视觉中国版权鉴定）。这些 API 在国内无免费开放接口，且需处理复杂的法务合规问题（数据跨境、用户授权链）。

### 预留方案

**数据库层面**：`materials` 表新增字段：

```prisma
copyrightStatus String @default("UNCHECKED") @map("copyright_status") @db.VarChar(20)
// UNCHECKED / CHECKING / PASSED / FLAGGED / BLOCKED
```

**后端接口**（空壳，返回固定值）：

```
POST /api/v1/materials/:materialId/check-copyright
```

始终返回：
```json
{
  "success": true,
  "data": {
    "material_id": "uuid",
    "copyright_status": "UNCHECKED",
    "message": "版权检测服务暂未接入，素材已标记为未检测状态"
  }
}
```

**前端体现**：
- `MaterialsPage.tsx` 素材列表中每个素材行显示版权状态图标（灰色 `○` 表示未检测）
- 鼠标悬停时 Tooltip 提示"版权检测服务即将上线"
- 点击无反应，不阻塞正常操作

---

## N-2 爆款效果预测（预留接口）

### 不可实现原因

效果预测（预估未发布视频的 CTR/CVR/完播率）需要：
1. 大规模历史视频投放数据作为训练集（数万条级别）
2. 标注流水线（CTR / CVR / 完播率等真实投放指标）
3. 专用预测模型训练（XGBoost / 神经网络）
4. 特征工程体系（视频视觉特征 + 音频特征 + 文案特征 + 发布时间特征）

当前项目无真实投放数据积累，Mock/预计算数据也无法支撑预测模型训练。

### 预留方案

**数据库层面**：`scripts` 表新增字段：

```prisma
predictedCtr       Float?  @map("predicted_ctr")
predictedCvr       Float?  @map("predicted_cvr")
predictedRetention Float?  @map("predicted_retention")
predictedAt        DateTime? @map("predicted_at")
predictionModel    String?  @map("prediction_model") @db.VarChar(50)
```

**后端接口**（空壳）：

```
POST /api/v1/scripts/:scriptId/predict-performance
```

始终返回：
```json
{
  "success": true,
  "data": {
    "script_id": "uuid",
    "predicted_ctr": null,
    "predicted_cvr": null,
    "predicted_retention": null,
    "message": "效果预测模型需基于真实投放数据训练，当前版本暂不可用。建议通过「自动 A/B 对比」功能获取多版本相对效果评估。",
    "fallback_suggestion": "USE_AUTO_AB"
  }
}
```

**前端体现**：
- `ScriptsPage.tsx` 剧本工具栏新增「预测效果」按钮（灰色禁用态或带黄色 Tooltip）
- 点击后弹出提示："效果预测需真实投放数据训练，建议使用 [自动 A/B 对比]"
- 引导用户跳转到 Analytics 的自动 A/B Tab

---

## N-3 Prompt A/B 自动优化（预留接口）

### 不可实现原因

真正的 Prompt A/B 优化需要：
1. 线上投放分流框架（将不同 Prompt 生成的内容投放到真实流量中）
2. 回流数据对比（不同 Prompt 产生的 CTR/CVR/完播率对比）
3. 统计显著性检验（p-value 计算）
4. 自动决策引擎（根据 A/B 结果自动切换最优 Prompt）

当前项目无真实投放渠道，分析看板全部使用 Mock/DuckDB 预计算数据，无法形成闭环。

### 预留方案

**后端接口**（空壳）：

```
POST /api/v1/prompt-templates/:id/ab-test
```

请求体：
```json
{
  "template_id": "uuid",
  "variant_a_version": 1,
  "variant_b_version": 2,
  "product_id": "uuid",
  "sample_size": 100
}
```

始终返回：
```json
{
  "success": true,
  "data": {
    "status": "NOT_AVAILABLE",
    "message": "Prompt A/B 自动优化需接入真实投放渠道与数据回流。当前版本建议：1) 使用「爆款 DNA 提取」获取模板灵感；2) 使用「自动 A/B 对比」功能批量生成多版本并对比效果预估；3) 在创建时手动选择不同 Prompt 版本进行效果对比。"
  }
}
```

**前端体现**：
- `TemplatesPage.tsx` 每个模板的操作区新增「A/B 优化」下拉菜单项（灰色，带 Tooltip 说明不可用原因）
- 用户仍可查看之前通过脚本生成的不同版本结果，手动判断优劣

---

## N-4 剧本模板市场（降级为管理员发布）

### 不可实现原因

模板市场（用户自定义模板发布/分享/评分/排序）需要：
1. 用户体系（注册/登录/个人中心）
2. 社交功能（点赞/收藏/评论/分享/关注）
3. 审核机制（防止低质量或违规模板上架）
4. 评分排序算法（热度加权、时间衰减等）

当前项目无用户系统，社交和审核机制更是远期目标。

### 降级方案

**已有基础**：`templates` CRUD + `POST /templates/cluster` AI 聚类

**降级实现**：
1. 新增 `isPublished` 字段在 `templates` 表
2. 新增 `PATCH /api/v1/templates/:id/publish` 和 `unpublish`
3. 前端 `TemplatesPage.tsx`：在「所有模板」Tab 中拆分为「系统内置 | AI 提炼」两个子分类
4. **核心限制**：仅管理员（通过环境变量 `ADMIN_API_KEY` 鉴权）可调用 publish 接口；前端不可见发布入口，模板市场仅为"管理员精选展示"

**后端改动**：
- `POST /api/v1/templates/:id/publish` 需 `x-admin-key` 请求头鉴权
- `GET /api/v1/templates?tab=marketplace` 返回 `is_published=true` 的模板

**前端体现**：
- `TemplatesPage.tsx` 顶部增加「管理员精选」分区（仅展示 `is_published` 的模板）
- 不展示发布入口、评分入口、社交入口
- 模板列表底部显示灰色提示："模板市场（用户发布与分享）将于后续版本上线"

---

## 不可实现板块 — 数据库变更汇总

| 表 | 新增字段 | 功能 | 状态 |
|-----|----------|------|------|
| `materials` | `copyright_status VARCHAR(20)` | 版权检测 | 预留，默认 UNCHECKED |
| `scripts` | `predicted_ctr FLOAT` + `predicted_cvr FLOAT` + `predicted_retention FLOAT` | 效果预测 | 预留，默认 NULL |
| `templates` | `is_published BOOLEAN` | 模板市场 | 降级为管理员发布 |

---

## 附录 A: 全部数据库变更汇总

| 序号 | 表名 | 类型 | Phase | 说明 |
|------|------|------|-------|------|
| 1 | `tasks.deleted_at` | 新增字段 | Phase 1 | 任务软删除 |
| 2 | `script_versions` | 新增表 | Phase 2 | 剧本版本快照 |
| 3 | `creation_templates` | 新增表 | Phase 2 | 创作参数模板 |
| 4 | `dna_patterns` | 新增表 | Phase 3 | 爆款 DNA 数据 |
| 5 | `auto_ab_sessions` | 新增表 | Phase 3 | A/B 自动对比会话 |
| 6 | `prompt_templates` | 新增表 | Phase 5 | Prompt 模板管理 |
| 7 | `prompt_template_versions` | 新增表 | Phase 5 | Prompt 版本历史 |
| 8 | `viral_subscriptions` | 新增表 | Phase 5 | 爆款订阅 |
| 9 | `materials.copyright_status` | 新增字段 | N/A (预留) | 版权检测预留 |
| 10 | `materials.original_format` | 新增字段 | Phase 4 | 转码前格式 |
| 11 | `scripts.predicted_ctr/cvr/retention` | 新增字段 | N/A (预留) | 效果预测预留 |
| 12 | `templates.is_published` | 新增字段 | N/A (降级) | 模板市场降级 |

## 附录 B: 全部新增 API 端点汇总

| 端点 | 方法 | Phase | 模块 |
|------|------|-------|------|
| `/api/v1/tasks/:taskId` | DELETE | Phase 1 | 任务软删除 |
| `/api/v1/tasks/:taskId/restore` | POST | Phase 1 | 任务恢复 |
| `/api/v1/tasks/:taskId/permanent` | DELETE | Phase 1 | 任务永久删除 |
| `/api/v1/tasks/batch-delete` | POST | Phase 1 | 任务批量软删除 |
| `/api/v1/tasks/trash` | GET | Phase 1 | 回收站列表 |
| `/api/v1/tasks/trash` | DELETE | Phase 1 | 清空回收站 |
| `/api/v1/scripts/:scriptId/versions` | GET | Phase 2 | 剧本版本列表 |
| `/api/v1/scripts/:scriptId/versions/:versionId` | GET | Phase 2 | 版本详情 |
| `/api/v1/scripts/:scriptId/versions/:versionId/rollback` | POST | Phase 2 | 版本回滚 |
| `/api/v1/creations/:creationId/save-as-template` | POST | Phase 2 | 保存创作模板 |
| `/api/v1/creation-templates` | GET | Phase 2 | 模板列表 |
| `/api/v1/creation-templates/:templateId` | DELETE | Phase 2 | 删除模板 |
| `/api/v1/viral-video-analyses/dna/extract` | POST | Phase 3 | 提取 DNA |
| `/api/v1/viral-video-analyses/dna/:dnaId` | GET | Phase 3 | DNA 详情 |
| `/api/v1/viral-video-analyses/dna` | GET | Phase 3 | DNA 列表 |
| `/api/v1/scripts/generate/dna` | POST | Phase 3 | DNA 驱动剧本生成 |
| `/api/v1/analytics/auto-ab` | POST | Phase 3 | 创建 A/B 会话 |
| `/api/v1/analytics/auto-ab/:sessionId` | GET | Phase 3 | 会话状态 |
| `/api/v1/analytics/auto-ab/:sessionId/events` | GET | Phase 3 | A/B SSE 进度 |
| `/api/v1/agent/events/:runId` | GET | Phase 3 | Agent SSE 进度 |
| `/api/v1/prompt-templates` | GET/POST/PATCH | Phase 5 | Prompt 管理 |
| `/api/v1/prompt-templates/:id/versions` | GET/POST | Phase 5 | Prompt 版本 |
| `/api/v1/viral-video-analyses/subscriptions` | GET/POST | Phase 5 | 爆款订阅 |
| `/api/v1/viral-video-analyses/subscriptions/:id` | DELETE | Phase 5 | 取消订阅 |
| `/api/v1/viral-video-analyses/subscriptions/:id/scan-now` | POST | Phase 5 | 立即扫描 |
| `/api/v1/materials/:materialId/check-copyright` | POST | N/A (预留) | 版权检测空壳 |
| `/api/v1/scripts/:scriptId/predict-performance` | POST | N/A (预留) | 效果预测空壳 |
| `/api/v1/prompt-templates/:id/ab-test` | POST | N/A (预留) | Prompt A/B 优化空壳 |
| `/api/v1/templates/:id/publish` | PATCH | N/A (降级) | 管理员发布模板 |
| `/api/v1/templates/:id/unpublish` | PATCH | N/A (降级) | 管理员下架模板 |

> 总计：28 个新 API 端点，其中 21 个完整实现，7 个为预留接口 / 空壳。
