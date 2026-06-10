# TikStream AI 全局API接口文档

## 1. 文档目标与适用范围

### 1.1 文档名称
TikStream AI——电商场景 AIGC 带货视频生成系统全局API接口文档

### 1.2 文档目标
本文档用于统一 TikStream AI 全链路接口设计，明确前端工作台、NestJS 核心网关、异步 Worker、分析看板与外部 AI 能力之间的接口契约，作为前后端联调、DTO 设计、Controller 实现、SSE 事件对接、任务回调编排和答辩复核的统一依据。

### 1.3 适用范围
本文档覆盖以下接口域：
- 全局请求 / 响应规范
- 统一错误码与失败处理规范
- 素材域接口
- 剧本域接口
- 创作域接口
- 任务与 SSE 事件接口
- 模板与爆款拆解接口
- 分析看板接口
- 内部回调与 Worker 协同接口
- 状态机、字段映射与一致性约束

### 1.4 文档定位
当前版本采用“全局总纲接口文档 + 后续按模块拆分子接口文档”的组织方式。本文档优先保证竞赛 MVP 的完整联调链路与可答辩性，同时兼顾后续商业化演进的可扩展空间。

## 2. API 设计原则与边界

### 2.1 设计原则
1. 主链路优先：优先打通“素材上传—剧本生成—视频创作—任务追踪—分析反馈”的 P0 主流程。
2. 契约先行：所有接口在实现前先统一路径、字段、状态、错误码和示例报文。
3. 状态可追踪：所有长任务均要求可查询、可恢复观察、可定位失败原因。
4. 结构化优先：所有返回结果必须服务于前端渲染、数据库落库、Worker 编排与答辩复核。
5. 边界清晰：对外暴露业务语义接口，不直接暴露底层向量库、对象存储或队列内部实现细节。
6. 一致性优先：接口字段、状态枚举、主键 / 外键 / 唯一键口径必须与数据库设计文档和前三份正式文档一致。

### 2.2 当前阶段边界
本期全局 API 设计明确不覆盖以下能力：
- 复杂组织、租户、审批流和多角色权限系统
- 商业 SaaS 账单、结算、配额购买等外部计费接口
- 真实投流平台回流数据采集接口
- 大规模离线数仓、图数据库和因果推断服务开放接口

### 2.3 接口分层边界
- 前端业务接口：供 React 工作台、编辑器、看板和任务页直接调用。
- 长任务观察接口：供前端通过 REST 探活与 SSE 订阅实时进度。
- 内部回调接口：供 GPU Worker、Render Worker、向量化流程和导出流程回写状态。
- 运维观测接口：供健康检查、资源统计和链路追踪使用。

## 3. 接口分层与调用关系总览

### 3.1 接口分层拓扑
```text
前端浏览器（React / TypeScript）
  ├─ /materials 素材管理工作台
  ├─ /scripts 智能剧本编辑器
  ├─ /create 创作与预览工作台
  ├─ /tasks 任务历史页
  ├─ /analytics 分析看板页
  └─ /templates 模板市场页
          │
          │ REST / Multipart / JSON Patch / SSE
          ▼
NestJS 核心网关 / 状态编排层
  ├─ Material Controller
  ├─ Script Controller
  ├─ Creation Controller
  ├─ Task Controller
  ├─ Template Controller
  ├─ Analytics Controller
  ├─ Internal Callback Controller
  └─ Health Controller
          │
          ├─ PostgreSQL（结构化业务数据）
          ├─ Qdrant（切片向量检索）
          ├─ MinIO（媒体对象存储）
          ├─ Redis / BullMQ（长任务运行态）
          ├─ Kafka（素材处理事件）
          └─ 外部 AI / 媒体处理能力
```

### 3.2 主链路调用关系
1. 前端上传素材并绑定 `product_id`。
2. 网关完成校验后写入对象存储和业务主表，并通过 BullMQ 派发素材入库异步事件（竞赛 MVP 阶段使用 BullMQ 直投；Kafka 作为生产扩展选项保留）。
3. GPU Worker 切片、打标、向量化后回写切片状态。
4. 用户调用剧本生成接口，后端组织 Prompt 并返回结构化分镜剧本。
5. 用户调用一键成片接口，后端创建 `task_id`，写入 Creation 记录并进入 BullMQ 状态机。
6. 前端通过任务详情接口和 SSE 事件订阅任务进度。
7. 成片导出后，前端查询结果并进入分析看板或下一轮优化。

### 3.3 用户可见接口与内部接口边界
- 用户可见接口：素材、剧本、创作、任务、模板、爆款拆解、看板、健康检查。
- 内部接口：切片处理回调、向量化结果回调、渲染状态回调、导出完成回调、失败重试补偿回写。

## 4. 全局协议规范

### 4.1 Base URL 与版本规范
- Base URL：`/api`
- 当前主版本：`v1`
- 推荐完整路径前缀：`/api/v1`
- 内部回调路径前缀：`/api/internal/v1`

### 4.2 通信协议规范
- 传输协议：HTTPS
- 默认响应格式：`application/json`
- 文件上传：`multipart/form-data`
- 局部编辑：`application/json-patch+json`
- SSE 订阅：`text/event-stream`

### 4.3 HTTP 方法语义
- `GET`：查询资源
- `POST`：创建资源或触发异步任务
- `PATCH`：局部更新资源
- `PUT`：全量覆盖更新（当前版本尽量少用）
- `DELETE`：删除资源

### 4.4 通用 Header 规范
| Header | 必填 | 说明 |
|---|---:|---|
| Authorization | 否 | 当前竞赛版本可选，预留 Bearer Token 口径 |
| X-Trace-Id | 否 | 调用方可传入链路追踪 ID，未传则后端生成 |
| X-Request-Id | 否 | 单次请求标识，便于日志排查 |
| Idempotency-Key | 否 | 长任务创建、内部回调等幂等接口建议传入 |
| Content-Type | 是 | 与接口类型匹配的媒体类型 |

### 4.5 时间与标识规范
- 时间统一使用 ISO 8601 或数据库标准时间字符串。
- 主键统一使用 UUID 字符串。
- `task_id` 作为对外任务追踪主键，统一格式为 `tsk_{YYYYMMDD}_{6位序号}`（如 `tsk_20260523_000001`），或对于特定业务领域任务采用 `tsk_{domain}_{YYYYMMDD}_{序列}`（如 `tsk_material_reprocess_20260523_xxxx`）。
- `slice_id` 作为切片与 Qdrant Point 映射键。
- `trace_id` 作为跨网关、Worker、渲染、导出的链路追踪键。

### 4.6 分页、排序与筛选规范
- 分页参数：`page`、`page_size`
- 排序参数：`sort_by`、`sort_order`
- 常见筛选参数：`product_id`、`status`、`created_after`、`created_before`
- 推荐默认值：`page=1`、`page_size=20`

### 4.7 JSON Patch 规范
剧本和分镜局部编辑接口采用 RFC 6902 JSON Patch 协议，单条操作包含：
- `op`
- `path`
- `value`（`remove` / `move` 时可省略）
- `from`（仅 `op=move` 时必填）

说明：
- 当前剧本域支持 `add` / `replace` / `remove` / `move`。
- `move` 仅允许 `/shots/{index}` -> `/shots/{index}` 的整分镜重排，不支持字段级 `move`。

示例：
```json
[
  {
    "op": "replace",
    "path": "/shots/1/voiceover_text",
    "value": "This curler gives you salon-quality curls in minutes."
  },
  {
    "op": "move",
    "from": "/shots/1",
    "path": "/shots/3"
  }
]
```

### 4.8 SSE 规范
- 建立方式：前端使用 `GET` 订阅长连接。
- 事件字段：`event`、`id`、`data`
- `data` 统一为 JSON 字符串。
- 事件体必须包含：`task_id`、`status`、`current_stage`、`progress`、`message`、`trace_id`、`timestamp`。

## 5. 统一请求模型与响应模型

### 5.1 成功响应结构
```json
{
  "success": true,
  "message": "ok",
  "data": {},
  "trace_id": "trc_20260523_xxxx",
  "timestamp": "2026-05-23T10:30:00Z"
}
```

### 5.2 分页响应结构
```json
{
  "success": true,
  "message": "ok",
  "data": {
    "items": [],
    "page": 1,
    "page_size": 20,
    "total": 125,
    "has_more": true
  },
  "trace_id": "trc_20260523_xxxx",
  "timestamp": "2026-05-23T10:30:00Z"
}
```

### 5.3 长任务创建响应结构
```json
{
  "success": true,
  "message": "task created",
  "data": {
    "creation_id": "4f6d8eaf-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "task_id": "tsk_20260523_xxxx",
    "status": "PENDING",
    "current_stage": "QUEUE_ALLOCATION",
    "progress": 0
  },
  "trace_id": "trc_20260523_xxxx",
  "timestamp": "2026-05-23T10:30:00Z"
}
```

### 5.4 失败响应结构
```json
{
  "success": false,
  "message": "validation failed",
  "error": {
    "code": "SCRIPT_DURATION_EXCEEDED",
    "details": [
      {
        "field": "shots[1].voiceover_text",
        "reason": "estimated duration exceeds shot duration"
      }
    ],
    "retryable": false
  },
  "trace_id": "trc_20260523_xxxx",
  "timestamp": "2026-05-23T10:30:00Z"
}
```

### 5.5 SSE 事件载荷结构
```json
{
  "task_id": "tsk_20260523_xxxx",
  "status": "PROCESSING",
  "current_stage": "TTS_GENERATING",
  "progress": 62,
  "message": "voiceover generation completed",
  "trace_id": "trc_20260523_xxxx",
  "timestamp": "2026-05-23T10:35:12Z"
}
```

## 6. 统一错误码与失败处理规范

### 6.1 错误码设计原则
1. 错误码需具备可读性、可归类性和可追踪性。
2. 业务错误与系统错误分层表达。
3. 每个错误码需明确是否可重试。
4. 所有错误必须附带 `trace_id`。

### 6.2 统一错误码清单
| 错误码 | HTTP 状态码 | 含义 | 可重试 |
|---|---:|---|---:|
| INVALID_REQUEST | 400 | 请求体格式错误或缺失必填字段 | 否 |
| PRODUCT_ID_REQUIRED | 400 | 上传或生成请求缺失 `product_id` | 否 |
| FILE_FORMAT_NOT_SUPPORTED | 400 | 文件格式不支持 | 否 |
| FILE_SIZE_EXCEEDED | 400 | 文件大小超过限制 | 否 |
| MATERIAL_NOT_FOUND | 404 | 素材不存在 | 否 |
| SCRIPT_NOT_FOUND | 404 | 剧本不存在 | 否 |
| CREATION_NOT_FOUND | 404 | 创作记录不存在 | 否 |
| TASK_NOT_FOUND | 404 | 任务不存在 | 否 |
| TEMPLATE_NOT_FOUND | 404 | 模板不存在 | 否 |
| VIRAL_VIDEO_ANALYSIS_NOT_FOUND | 404 | 爆款拆解记录不存在 | 否 |
| SCRIPT_SCHEMA_INVALID | 422 | 剧本结构不满足强校验要求 | 否 |
| SCRIPT_DURATION_EXCEEDED | 422 | 总时长超过 15 秒或分镜配时不合法 | 否 |
| COMPLIANCE_CHECK_FAILED | 422 | 文案命中合规拦截规则 | 否 |
| TASK_STATUS_CONFLICT | 409 | 当前任务状态不允许该操作 | 否 |
| IDEMPOTENCY_CONFLICT | 409 | 幂等键冲突 | 视情况 |
| RATE_LIMITED | 429 | 命中接口限流或模型配额限制 | 是 |
| VECTOR_SEARCH_FAILED | 502 | 向量检索失败 | 是 |
| MODEL_PROVIDER_FAILED | 502 | 外部模型调用失败 | 是 |
| OBJECT_STORAGE_WRITE_FAILED | 502 | 对象存储写入失败 | 是 |
| INTERNAL_WORKER_CALLBACK_FAILED | 502 | 内部回调处理失败 | 是 |
| INTERNAL_SERVER_ERROR | 500 | 未分类系统内部错误 | 视情况 |

### 6.3 失败处理原则
- 用户可修复错误：直接返回字段级原因和整改建议。
- 可恢复系统错误：返回 `retryable=true`，允许自动重试或用户手动重试。
- 不可恢复错误：保留 `trace_id`、`error_code`、`error_message`，供任务页与日志系统定位。

## 7. 统一鉴权、权限、限流与幂等规则

### 7.1 鉴权与权限规则
当前竞赛版本采用轻量化单商家口径，不设计复杂组织权限。默认规则如下：
- 用户仅可在当前商品上下文内访问和编辑相关素材、剧本、创作任务、模板使用记录与分析结果。
- 内部回调接口不对前端开放，必须通过服务端鉴别或内部网络隔离访问。
- 健康检查接口可按环境划分公开级别。

### 7.2 限流规则
| 接口类型 | 规则 |
|---|---|
| 素材上传接口 | 按用户和商品维度限频，防止并发上传压垮链路 |
| 剧本生成接口 | 共享 Doubao 文本模型 Token Bucket，控制在 80 RPM 以内 |
| 图生视频相关接口 | 受 Seedance 分布式信号量限制，并发上限 3 |
| 长任务创建接口 | 防止重复一键成片风暴，同商品短时间内限制重复创建 |
| SSE 订阅接口 | 同一任务允许有限连接数，避免重复占用 |

### 7.3 幂等规则
- 一键成片创建接口建议传入 `Idempotency-Key`。
- 内部回调接口必须以 `task_id`、`slice_id` 或阶段键作为幂等基础。
- 导出完成回调重复上报时，不应重复生成最终业务记录。

## 8. 素材域接口

### 8.1 接口清单
| 方法 | 路径 | 优先级 | 说明 |
|---|---|---|---|
| POST | /api/v1/materials/upload | P0 | 上传素材并绑定商品 |
| GET | /api/v1/materials | P0 | 查询素材列表 |
| GET | /api/v1/materials/{material_id} | P0 | 查询素材详情 |
| DELETE | /api/v1/materials/{material_id} | P0 | 删除素材 |
| POST | /api/v1/materials/search | P1 | 搜索素材切片 |
| POST | /api/v1/materials/{material_id}/reprocess | P1 | 重新触发素材处理 |

### 8.2 上传素材接口
**接口说明**
- 方法：`POST`
- 路径：`/api/v1/materials/upload`
- 作用：上传 MP4 / JPG / PNG / WebP 素材并绑定 `product_id`，创建 Material 主记录。
- 权限：当前商品上下文内可写
- 限流：高频接口，按用户 / 商品限流
- 幂等：可选 `Idempotency-Key`

**请求参数**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| product_id | string(UUID) | 是 | 所属商品 ID |
| file | binary | 是 | 素材文件 |
| type | string | 是 | `IMAGE` / `VIDEO` |
| source_type | string | 否 | `UPLOAD` / `REFERENCE` |
| remark | string | 否 | 备注 |

**校验规则**
- 图片最大 10MB，视频最大 200MB。
- 单次批量上传最多 10 个文件。
- 上传时必须绑定有效 `product_id`。
- 文件类型必须属于允许列表。

**成功响应示例**
```json
{
  "success": true,
  "message": "material uploaded",
  "data": {
    "material_id": "94f8d3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "product_id": "4bc2b16e-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "file_name": "demo-product.mp4",
    "type": "VIDEO",
    "source_type": "UPLOAD",
    "status": "PENDING",
    "thumbnail_url": "https://assets.example.com/materials/thumb/demo-product.jpg",
    "file_size_bytes": 73400320,
    "created_at": "2026-05-23T10:30:00Z"
  },
  "trace_id": "trc_20260523_material_upload",
  "timestamp": "2026-05-23T10:30:00Z"
}
```

**关联实体**
- `materials`
- `products`

### 8.3 查询素材列表接口
**方法**：`GET`
**路径**：`/api/v1/materials`

**Query 参数**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| product_id | string(UUID) | 是 | 商品 ID |
| status | string | 否 | `PENDING` / `PROCESSING` / `COMPLETED` / `FAILED` |
| type | string | 否 | `IMAGE` / `VIDEO` |
| page | int | 否 | 页码 |
| page_size | int | 否 | 每页数量 |

**返回字段**
- `material_id`
- `file_name`
- `type`
- `status`
- `thumbnail_url`
- `file_size_bytes`
- `duration_seconds`
- `created_at`

### 8.4 查询素材详情接口
**方法**：`GET`
**路径**：`/api/v1/materials/{material_id}`

**返回重点字段**
- Material 主记录
- 切片数量 `slices_count`
- 切片状态聚合
- 可选预览切片列表摘要

### 8.5 删除素材接口
**方法**：`DELETE`
**路径**：`/api/v1/materials/{material_id}`

**说明**
- 删除 Material 时级联删除 MaterialSlice。
- 已被关键任务占用的素材可按业务返回状态冲突错误。

### 8.6 搜索素材切片接口
**方法**：`POST`
**路径**：`/api/v1/materials/search`
**优先级**：P1

**请求字段**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| product_id | string(UUID) | 是 | 商品上下文 |
| query | string | 是 | 检索文本 |
| min_duration | number | 否 | 最小时长 |
| max_duration | number | 否 | 最大时长 |
| page | int | 否 | 页码 |
| page_size | int | 否 | 每页数量 |

**说明**
- 优先按 `product_id` 做商品内召回。
- 支持 Qdrant 语义检索与 PostgreSQL 兜底模糊检索。

### 8.7 重新处理素材接口
**方法**：`POST`
**路径**：`/api/v1/materials/{material_id}/reprocess`
**优先级**：P1

**说明**
- 对失败素材或需要重算切片 / Caption / 向量的素材重新入队。
- 若当前素材仍在处理中，可返回 `TASK_STATUS_CONFLICT`。

## 9. 剧本域接口

### 9.1 接口清单
| 方法 | 路径 | 优先级 | 说明 |
|---|---|---|---|
| POST | /api/v1/scripts/generate/quick | P0 | 快速模式生成剧本 |
| POST | /api/v1/scripts/generate/viral-rewrite | P1 | 爆款仿写生成剧本 |
| POST | /api/v1/scripts/generate/template | P1 | 模板模式生成剧本 |
| GET | /api/v1/scripts/{script_id} | P0 | 查询剧本详情 |
| PATCH | /api/v1/scripts/{script_id} | P1 | JSON Patch 局部更新剧本 |
| POST | /api/v1/scripts/{script_id}/validate-timing | P1 | 分镜配时校验 |
| POST | /api/v1/scripts/{script_id}/save | P1 | 保存剧本 |

### 9.2 快速模式生成剧本接口
**方法**：`POST`
**路径**：`/api/v1/scripts/generate/quick`

**请求字段**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| product_id | string(UUID) | 是 | 商品 ID |
| title | string | 否 | 剧本标题 |
| language | string | 否 | 输出语言，默认 `zh-CN` |
| target_audience | string | 否 | 目标人群 |
| selling_points | string[] | 是 | 核心卖点 |
| aspect_ratio | string | 是 | `9:16` / `16:9` |
| style_vibe | string | 是 | 风格调性 |

**成功响应重点字段**
- `script_id`
- `product_id`
- `video_duration`
- `generation_mode= PROMPT_DRIVEN`
- `shots[]`

### 9.3 爆款仿写生成剧本接口
**方法**：`POST`
**路径**：`/api/v1/scripts/generate/viral-rewrite`
**优先级**：P1

**请求字段补充**
- `viral_video_id`
- `product_id`
- `style_vibe`
- `aspect_ratio`

**说明**
- 仅引用公开来源的结构化分析结果。
- 不返回原参考视频内容本体。

### 9.4 模板模式生成剧本接口
**方法**：`POST`
**路径**：`/api/v1/scripts/generate/template`
**优先级**：P1

**请求字段补充**
- `template_id`
- `product_id`
- `style_vibe`

### 9.5 查询剧本详情接口
**方法**：`GET`
**路径**：`/api/v1/scripts/{script_id}`

**返回重点字段**
- `script_id`
- `product_id`
- `title`
- `language`
- `target_audience`
- `video_duration`
- `aspect_ratio`
- `style_vibe`
- `generation_mode`
- `shots[]`

### 9.6 剧本局部更新接口
**方法**：`PATCH`
**路径**：`/api/v1/scripts/{script_id}`
**内容类型**：`application/json-patch+json`

**说明**
- 支持台词、分镜顺序、素材绑定、局部因子等字段局部修改。
- 当前剧本域显式支持 `move`，用于整分镜重排；`from` 与 `path` 都必须指向 `/shots/{index}`。
- 修改后应触发时长与合规校验。

### 9.7 分镜配时校验接口
**方法**：`POST`
**路径**：`/api/v1/scripts/{script_id}/validate-timing`
**优先级**：P1

**请求字段**
- `shot_index`
- `voiceover_text`
- `duration`
- `style_vibe`（可选）
- `language`（可选）

**返回重点字段**
- `valid`
- `estimated_duration`
- `shot_duration`
- `overflow_words`
- `suggestion`

**说明**
- 该接口按单分镜进行即时校验。
- `save` 接口会基于当前剧本状态重新执行同口径校验，任一分镜配时超限都必须阻断保存。

### 9.8 保存剧本接口
**方法**：`POST`
**路径**：`/api/v1/scripts/{script_id}/save`

**阻断条件**
- 总时长超过 15 秒
- 单分镜时长不在 1.5s–5.0s 范围内
- 任一分镜旁白配时超出其分配时长
- 缺失 `scene_description_query`、`visual_description`、`camera_movement`、`transition_type`、`voiceover_text`、`subtitle_text`、`safe_zone_bounding_box`
- 命中合规拦截规则

## 10. 创作域接口

### 10.1 接口清单
| 方法 | 路径 | 优先级 | 说明 |
|---|---|---|---|
| POST | /api/v1/creations | P0 | 创建一键成片任务 |
| GET | /api/v1/creations/{creation_id} | P0 | 查询创作结果 |
| POST | /api/v1/creations/{creation_id}/export | P0 | 导出成片 |
| POST | /api/v1/creations/{creation_id}/rerender-shot | P1 | 局部分镜重渲染 |
| POST | /api/v1/creations/{creation_id}/replace-slice | P1 | 替换素材切片 |
| POST | /api/v1/creations/{creation_id}/retry | P1 | 失败任务重试 |
| POST | /api/v1/creations/{creation_id}/cancel | P1 | 主动取消任务 |
| GET | /api/v1/creations/{creation_id}/preview | P1 | 查询预览态编排结果 |

### 10.2 创建一键成片任务接口
**方法**：`POST`
**路径**：`/api/v1/creations`

**请求字段**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| product_id | string(UUID) | 是 | 商品 ID |
| script_id | string(UUID) | 是 | 剧本 ID |
| engine_mode | string | 否 | 默认 `SCRIPT_DRIVEN`，当前版本仅开放该值 |
| target_resolution | string | 否 | 默认 `1080x1920` |
| export_format | string | 否 | 默认 `MP4` |
| voice_profile | string | 否 | 配音音色标识 |
| bgm_policy | string | 否 | BGM 策略标识 |
| force_refresh | boolean | 否 | 是否忽略既有分镜渲染缓存，默认 `false` |

**成功响应字段**
- `creation_id`
- `task_id`
- `status`
- `current_stage`
- `progress`

**说明**
- 创建后进入 `QUEUE_ALLOCATION`。
- 任务主记录需与 `creations` 表保持一致。

### 10.3 查询创作结果接口
**方法**：`GET`
**路径**：`/api/v1/creations/{creation_id}`

**返回重点字段**
- `creation_id`
- `product_id`
- `script_id`
- `task_id`
- `status`
- `current_stage`
- `progress`
- `video_url`
- `error_code`
- `error_message`
- `started_at`
- `finished_at`

### 10.4 导出成片接口
**方法**：`POST`
**路径**：`/api/v1/creations/{creation_id}/export`

**说明**
- 当前版本默认导出 1080×1920、30fps、H.264。
- 可扩展支持多画幅和多分辨率。
- 导出正式成片前应完成 `LOUDNORM_COMPLIANCE` 阶段，保证音频响度符合统一标准。

### 10.5 查询预览态编排结果接口
**方法**：`GET`
**路径**：`/api/v1/creations/{creation_id}/preview`
**优先级**：P1

**说明**
- 用于前端 Remotion Player 拉取高还原度预览编排结果。
- 返回当前时间轴所需的视频切片 URL、字幕轨、音频轨摘要和安全区参数。
- 仅用于预览，不等同于正式导出结果。

### 10.6 局部分镜重渲染接口
**方法**：`POST`
**路径**：`/api/v1/creations/{creation_id}/rerender-shot`
**优先级**：P1

**请求字段**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| script_shot_id | string(UUID) | 是 | 分镜主键 |
| shot_index | int | 是 | 分镜顺序 |
| force_refresh | boolean | 否 | 是否忽略缓存 |

**说明**
- 依赖 `script_shot_id` 和 `cache_hash` 精准定位受影响分镜。

### 10.7 替换素材切片接口
**方法**：`POST`
**路径**：`/api/v1/creations/{creation_id}/replace-slice`
**优先级**：P1

**请求字段**
- `script_shot_id`
- `selected_slice_id`

### 10.8 失败任务重试接口
**方法**：`POST`
**路径**：`/api/v1/creations/{creation_id}/retry`
**优先级**：P1

### 10.9 主动取消任务接口
**方法**：`POST`
**路径**：`/api/v1/creations/{creation_id}/cancel`
**优先级**：P1

**说明**
- 当前任务未完成时可尝试取消。
- 取消成功后任务 `status` 可进入 `CANCELED`。

## 11. 任务与 SSE 事件接口

### 11.1 接口清单
| 方法 | 路径 | 优先级 | 说明 |
|---|---|---|---|
| GET | /api/v1/tasks | P0 | 查询任务列表 |
| GET | /api/v1/tasks/{task_id} | P0 | 查询任务详情 / 探活 |
| GET | /api/v1/tasks/{task_id}/events | P1 | 订阅 SSE 事件 |

### 11.2 查询任务列表接口
**方法**：`GET`
**路径**：`/api/v1/tasks`

**Query 参数**
- `product_id`
- `status`
- `current_stage`
- `page`
- `page_size`

### 11.3 查询任务详情接口
**方法**：`GET`
**路径**：`/api/v1/tasks/{task_id}`

**说明**
- 页面刷新后可通过该接口恢复观察状态。
- 返回字段需与 `creations` 记录保持一致。

### 11.4 SSE 订阅接口
**方法**：`GET`
**路径**：`/api/v1/tasks/{task_id}/events`
**类型**：`text/event-stream`

### 11.5 SSE 事件类型
| 事件类型 | 含义 |
|---|---|
| task.created | 任务已创建并入队（首次连接时 status=PENDING） |
| task.stage.changed | 任务阶段推进 |
| task.progress.updated | 百分比更新 |
| task.completed | 任务成功完成 |
| task.failed | 任务失败 |
| task.canceled | 任务已取消 |
| shot.render.completed | 单分镜渲染完成（含 render_path） |
| shot.render.failed | 单分镜渲染失败（含 error_message） |
| heartbeat | 心跳保活（15s 间隔，防止代理超时断连） |

> **注意**：`task.warning` 事件为 P2 预留，当前版本暂未实现。

### 11.6 SSE 阶段事件约束
- `QUEUE_ALLOCATION`：任务入队与资源分配完成
- `ASSET_MATCHING`：素材匹配 / 检索中
- `AI_VIDEO_GENERATING`：图生视频补足或视频生成中
- `TTS_GENERATING`：配音与时间戳生成中
- `FFMPEG_STITCHING`：单分镜拼接或全片分镜拼接中
- `LOUDNORM_COMPLIANCE`：响度标准化处理中
- `FINISHED`：正式完成并可读取 `video_url`
- `FAILED`：阶段失败并附带 `error_code` / `error_message`

### 11.7 SSE 示例
```text
event: task.stage.changed
id: tsk_20260523_xxxx
data: {"task_id":"tsk_20260523_xxxx","status":"PROCESSING","current_stage":"FFMPEG_STITCHING","progress":84,"message":"concat started","trace_id":"trc_20260523_xxxx","timestamp":"2026-05-23T10:36:21Z"}
```

## 12. 模板与爆款拆解接口

### 12.1 接口清单
| 方法 | 路径 | 优先级 | 说明 |
|---|---|---|---|
| GET | /api/v1/templates | P1 | 查询模板列表 |
| GET | /api/v1/templates/{template_id} | P1 | 查询模板详情 |
| POST | /api/v1/templates/{template_id}/apply | P1 | 选用模板生成剧本 |
| POST | /api/v1/viral-video-analyses | P2 | 创建爆款视频结构化拆解任务 |
| GET | /api/v1/viral-video-analyses/{analysis_id} | P2 | 查询拆解结果 |

### 12.2 模板列表接口
**方法**：`GET`
**路径**：`/api/v1/templates`

**返回重点字段**
- `template_id`
- `name`
- `category`
- `strategy_summary`
- `status`

### 12.3 模板详情接口
**方法**：`GET`
**路径**：`/api/v1/templates/{template_id}`

### 12.4 模板应用接口
**方法**：`POST`
**路径**：`/api/v1/templates/{template_id}/apply`

**说明**
- 本质上可复用剧本生成逻辑。
- 返回结构化剧本结果。

### 12.5 创建爆款拆解任务接口
**方法**：`POST`
**路径**：`/api/v1/viral-video-analyses`
**优先级**：P2

**请求字段**
- `source_platform`
- `source_url`
- `product_id`（可选）

**约束**
- 仅允许公开来源链接。
- 只保存结构化分析结果，不复刻、不保存原版权视频内容。

### 12.6 查询爆款拆解结果接口
**方法**：`GET`
**路径**：`/api/v1/viral-video-analyses/{analysis_id}`

## 13. 分析看板接口

### 13.1 接口清单
| 方法 | 路径 | 优先级 | 说明 |
|---|---|---|---|
| GET | /api/v1/analytics/retention-curve | P1 | 分镜留存曲线 |
| GET | /api/v1/analytics/style-factors | P2 | 多因子归因热力图 |
| GET | /api/v1/analytics/audio-visual-sankey | P2 | 视听留存桑基图 |
| GET | /api/v1/analytics/ab-compare | P2 | A/B 对比 |
| POST | /api/v1/analytics/self-heal | P2 | 一键自愈诊断与回写 |

### 13.2 分镜留存曲线接口
**方法**：`GET`
**路径**：`/api/v1/analytics/retention-curve`

**Query 参数**
- `product_id`
- `creation_id`

**说明**
- 当前基于 Mock / 预计算结果返回。
- 返回值必须标注为预测值或模拟值。

### 13.3 多因子归因热力图接口
**方法**：`GET`
**路径**：`/api/v1/analytics/style-factors`
**优先级**：P2

### 13.4 视听留存桑基图接口
**方法**：`GET`
**路径**：`/api/v1/analytics/audio-visual-sankey`
**优先级**：P2

### 13.5 A/B 对比接口
**方法**：`GET`
**路径**：`/api/v1/analytics/ab-compare`
**优先级**：P2

### 13.6 一键自愈接口
**方法**：`POST`
**路径**：`/api/v1/analytics/self-heal`
**优先级**：P2

**说明**
- 该接口用于将分析诊断结果回写到创作链路；`dry_run=true` 返回建议，`dry_run=false` 创建真实创作任务并进入排队。
- 正式执行时复用创作域 `task_id`、`creation_id` 与任务状态机，并返回 `healed_creation_id`。
- 不承诺真实自动投放闭环。

## 14. 内部回调与 Worker 协同接口

### 14.1 接口清单
| 方法 | 路径 | 优先级 | 说明 |
|---|---|---|---|
| POST | /api/internal/v1/materials/{material_id}/slice-callback | P0 | 切片处理结果回写 |
| POST | /api/internal/v1/material-slices/{slice_id}/embedding-callback | P1 | 向量化结果回写 |
| POST | /api/internal/v1/tasks/{task_id}/stage-callback | P0 | 创作任务阶段推进回写 |
| POST | /api/internal/v1/tasks/{task_id}/export-callback | P0 | 导出完成回写 |
| POST | /api/internal/v1/tasks/{task_id}/failure-callback | P1 | 失败补偿与降级结果回写 |
| GET | /api/internal/v1/health | P1 | 健康检查 |
| GET | /api/internal/v1/stats/resources | P2 | 资源统计 |

### 14.2 切片处理结果回写接口
**方法**：`POST`
**路径**：`/api/internal/v1/materials/{material_id}/slice-callback`

**请求字段**
- `material_id`
- `status`
- `slices[]`

**切片字段重点**
- `slice_id`
- `start_time`
- `end_time`
- `duration`
- `dense_caption`
- `stream_url`
- `key_frame_url`
- `status`

### 14.3 向量化结果回写接口
**方法**：`POST`
**路径**：`/api/internal/v1/material-slices/{slice_id}/embedding-callback`

**请求字段**
- `slice_id`
- `embedding_version`
- `status`

**说明**
- `slice_id` 必须与 PostgreSQL 和 Qdrant 一致。

### 14.4 创作任务阶段推进回写接口
**方法**：`POST`
**路径**：`/api/internal/v1/tasks/{task_id}/stage-callback`

**请求字段**
- `task_id`
- `status`
- `current_stage`
- `progress`
- `trace_id`
- `message`
- `error_code`（可选）
- `error_message`（可选）
- `started_at`（可选）
- `finished_at`（可选）

**说明**
- 同一阶段重复上报必须幂等。
- 该接口驱动任务表更新和 SSE 事件下发。

### 14.5 导出完成回写接口
**方法**：`POST`
**路径**：`/api/internal/v1/tasks/{task_id}/export-callback`

**请求字段**
- `task_id`
- `video_url`
- `file_size_bytes`
- `finished_at`
- `trace_id`

### 14.6 失败补偿回写接口
**方法**：`POST`
**路径**：`/api/internal/v1/tasks/{task_id}/failure-callback`

**请求字段**
- `task_id`
- `status`
- `current_stage`
- `error_code`
- `error_message`
- `trace_id`
- `retryable`

**说明**
- 用于 Worker 在降级失败、重试耗尽、外部模型最终失败等场景下统一回写。
- 回写后应同步触发 `task.failed` SSE 事件。

### 14.7 健康检查接口
**方法**：`GET`
**路径**：`/api/internal/v1/health`

**返回建议字段**
- `server_status`
- `postgres_status`
- `redis_status`
- `qdrant_status`
- `minio_status`

### 14.8 资源统计接口
**方法**：`GET`
**路径**：`/api/internal/v1/stats/resources`
**优先级**：P2

**返回建议字段**
- `gpu_memory_usage`
- `queue_backlog`
- `task_success_rate`
- `avg_generation_duration`
- `cache_hit_rate`

## 15. 状态机、事件流与字段映射约束

### 15.1 素材状态枚举
- `PENDING`
- `PROCESSING`
- `COMPLETED`
- `FAILED`

### 15.2 切片状态枚举
- `PENDING`
- `CAPTIONING`
- `EMBEDDING`
- `COMPLETED`
- `FAILED`

### 15.3 创作任务状态枚举
- `PENDING`
- `PROCESSING`
- `FINISHED`
- `FAILED`
- `CANCELED`

### 15.4 创作任务阶段枚举
- `QUEUE_ALLOCATION`
- `ASSET_MATCHING`
- `AI_VIDEO_GENERATING`
- `TTS_GENERATING`
- `FFMPEG_STITCHING`
- `LOUDNORM_COMPLIANCE`
- `FINISHED`
- `FAILED`

### 15.5 核心字段映射约束
- `product_id`：所有主业务接口都必须以商品上下文为核心边界。
- `slice_id`：素材切片接口与内部向量化回调都必须承接该键。
- `script_id + shot_index`：分镜排序与局部编辑的稳定定位组合键。
- `selected_slice_id`：人工换素材与自动召回结果的承接字段。
- `task_id`：前端探活、SSE 订阅、Worker 回调和日志排查的统一任务追踪键。
- `trace_id`：贯穿请求、任务编排、Worker 回调和导出的全链路追踪键。
- `script_shot_id`：局部重渲染接口和渲染回写的稳定定位键。

### 15.6 一致性要求
1. 接口字段命名必须与数据库设计文档保持一致。
2. 所有状态流转必须与架构文档中的状态机保持一致。
3. 所有时长限制必须与产品需求文档保持一致：
   - 切片时长 1.5s–4.0s
   - 分镜时长 1.5s–5.0s
   - 总视频时长不超过 15s
4. 所有长任务接口必须支持失败原因追踪与恢复观察。
5. 爆款拆解相关接口必须保留公开来源声明。

## 16. 命名规范与版本变更约定

### 16.1 URL 命名规范
1. 统一使用小写复数资源名，如 `/materials`、`/scripts`、`/creations`。
2. 动作型接口采用资源后缀，如 `/retry`、`/cancel`、`/export`。
3. 内部回调统一放在 `/api/internal/v1` 前缀下。

### 16.2 字段命名规范
1. API 返回字段统一采用蛇形命名，与数据库字段和正式文档口径对齐。
2. 枚举值采用稳定英文大写或约定英文短语，不随前端展示文案变动。
3. 所有 ID 字段含义必须在接口文档中明确说明。

### 16.3 版本变更约定
1. 新增字段优先向后兼容。
2. 删除字段或调整语义时必须升级 API 版本或提供废弃声明。
3. 状态枚举、错误码、SSE 事件名变更时，必须同步更新前端、后端、Worker 和文档。

## 17. 结论

本全局 API 接口文档围绕 TikStream AI 的素材、剧本、创作、任务、模板、分析和内部协同七大接口域，建立了统一的请求 / 响应规范、错误码体系、长任务状态机、SSE 事件模型与字段映射约束，能够直接支撑前后端联调、NestJS DTO 与 Controller 设计、Worker 回调编排以及竞赛答辩中的全链路接口说明。