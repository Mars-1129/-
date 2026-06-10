# TikStream AI — 电商场景 AIGC 带货视频生成系统

> TikTok Shop 国际电商场景下的 AI 带货视频生成系统，基于火山引擎 OpenAPI 与开源模型打造。

## 🎯 项目简介

TikStream AI 是一款面向商家的端到端 AIGC 带货视频生成系统，支持：
- 📦 **素材管理** — 商品图片/视频自动切片、YOLO主体检测、Qdrant向量检索
- ✍️ **剧本生成** — 6种生成模式（快速/爆款仿写/模板/组合/混合/批量）+ LangGraph Agent自迭代
- 🎬 **智能创作** — Seedance图生视频、TTS多语种配音、Remotion视频合成
- 📊 **数据分析** — 留存曲线、风格热力图、A/B对比、自愈诊断
- 🌍 **多语言支持** — 7种语言界面 + 10+语种TTS配音

## 🏆 竞赛课题

**课题：电商场景 AIGC 带货视频生成系统**

在 TikTok Shop 国际电商快速发展的背景下，短视频已成为商家获取流量和提升成交的关键载体。本课题聚焦电商真实业务场景，打造面向商家的 AIGC 带货视频生成系统。

## ✨ 核心功能

### P0 必备功能 ✅

| 功能 | 说明 |
|------|------|
| 商品素材上传 | MinIO存储、YOLO切割、Embedding生成 |
| 剧本生成 | 6种生成模式（quick/viral/template/composed/hybrid/batch）|
| 基础分镜 | DnD拖拽、运镜/转场/字幕/BGM配置 |
| 一键成片 | BullMQ队列、Seedance图生视频、Remotion渲染 |
| 任务进度 | SSE实时推送、18种事件类型 |
| 预览导出 | 多格式（MP4/MOV/WEBM）、多分辨率 |

### P1 进阶功能 ✅

| 功能 | 说明 |
|------|------|
| 素材检索 | Qdrant向量检索、YOLO主体检测、场景切分 |
| 智能剪辑Agent | LangGraph StateGraph、7节点有向图 |
| 分镜级编辑 | DnD拖拽、逐镜参数配置、分镜对比 |
| TTS/字幕/BGM | Doubao TTS、FFmpeg字幕烧录、BGM匹配 |
| 失败重试 | Checkpoint断点续传、AutoRetrySuggestion |
| Mock数据看板 | 热力图/桑基图/A/B对比/自愈诊断 |

### P2 加分项 ✅

| 功能 | 说明 |
|------|------|
| 多因子归因 | 5维度因子分析（Hook/CTA/BGM/视觉风格/节奏）|
| Agent编排 | LangGraph 7节点有向图、自迭代优化 |
| A/B对比 | Auto A/B Pipeline、多变体生成 |
| CI/CD | GitHub Actions 多步流水线 |
| 可观测性 | Prometheus + Grafana + Jaeger |
| 合规审核流 | 规则+AI双审机制 |
| i18n国际化 | 7种语言界面配置 |

## 🛠️ 技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      前端 (React + Vite)                         │
│  materials / scripts / templates / create / tasks / analytics  │
└──────────────────────────────────────────────────────────────────┘
                               │
                    REST API + SSE Events
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      后端 (NestJS)                                │
│  material / script / creation / analytics / compliance / agent  │
└──────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      Workers (独立部署)                           │
│  GPU Slicing Worker (YOLO + FFmpeg)                              │
│  Remotion Render Worker (TTS + Seedance + FFmpeg)                │
└──────────────────────────────────────────────────────────────────┘
```

### 核心技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Vite + TypeScript + TailwindCSS |
| 后端 | NestJS + Prisma + BullMQ + SSE |
| AI | LangGraph + Doubao-Seed-2.0-pro + Doubao-Seedance-1.5-pro |
| 数据库 | PostgreSQL 16 + Redis 7 + Qdrant |
| 存储 | MinIO (S3兼容) |
| 监控 | Prometheus + Grafana + Jaeger |
| CI/CD | GitHub Actions |

## 📁 项目结构

```
tikstream/
├── apps/
│   ├── server-gateway/     # NestJS 后端服务
│   │   └── src/
│   │       ├── material/      # 素材模块
│   │       ├── script/        # 剧本模块
│   │       ├── creation/      # 创作模块
│   │       ├── analytics/     # 分析模块
│   │       ├── agent/         # Agent编排
│   │       ├── compliance/    # 合规审核
│   │       └── ...
│   └── web-client/         # React 前端
│       └── src/
│           ├── features/
│           │   ├── materials/   # 素材页面
│           │   ├── scripts/     # 剧本页面
│           │   ├── create/      # 创作页面
│           │   ├── analytics/   # 分析页面
│           │   └── ...
│           └── i18n/           # 国际化
├── workers/
│   ├── gpu-slicing-worker/   # GPU 切片 Worker
│   └── remotion-render-worker/ # 渲染 Worker
├── services/                # 共享服务
├── packages/                 # 共享包
├── docker/                  # Docker 配置
└── prisma/                  # 数据库 schema
```

## 🚀 快速开始

### 环境要求

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose
- GPU (可选，用于视频处理)

### 启动步骤

```bash
# 1. 克隆项目
git clone <repo>
cd tikstream

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入火山引擎 API Key

# 4. 启动 Docker 服务
docker-compose up -d

# 5. 数据库迁移
pnpm db:push
pnpm db:seed

# 6. 启动开发服务
pnpm dev
```

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173 |
| 后端API | http://localhost:3000 |
| Grafana | http://localhost:3001 |
| Jaeger | http://localhost:16686 |
| MinIO Console | http://localhost:9001 |

## 🔧 配置说明

### 环境变量

```env
# 火山引擎
VOLC_ARK_API_KEY=your_api_key_here
VOLC_TEXT_EP=ep-xxxxx
VOLC_SEEDANCE_EP=ep-xxxxx

# 数据库
DATABASE_URL=postgresql://user:pass@localhost:5432/tikstream_ai

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO
MINIO_ACCESS_KEY=tikstream_minio
MINIO_SECRET_KEY=tikstream_minio_password

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

## 📊 API 文档

完整 API 文档请参考 [全局API接口文档.md](./全局API接口文档.md)

### 核心接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/materials/upload` | POST | 上传素材 |
| `/api/v1/materials/search` | POST | 检索素材切片 |
| `/api/v1/scripts/generate` | POST | 生成剧本 |
| `/api/v1/scripts/generate/quick` | POST | 快速生成 |
| `/api/v1/scripts/generate/viral` | POST | 爆款仿写 |
| `/api/v1/creations` | POST | 创建创作 |
| `/api/v1/creations/:id/preview` | GET | 预览创作 |
| `/api/v1/creations/:id/export` | POST | 导出创作 |
| `/api/v1/analytics/retention` | GET | 留存分析 |
| `/api/v1/analytics/heatmap` | GET | 风格热力图 |
| `/api/v1/agent/generate` | POST | Agent生成 |
| `/api/v1/auto-ab/run` | POST | A/B对比 |

## 🔬 关键设计

### LangGraph Agent 自迭代

```typescript
// 7节点有向图实现 AI 生成 → 质量审查 → 迭代优化
const graph = new StateGraph(VideoCreationStateSchema)
  .addNode('understandProduct', understandNode)
  .addNode('generateScript', generateNode)
  .addNode('reviewAndRefine', reviewNode)  // LLM 质量评审
  .addConditionalEdges('reviewAndRefine', routeAfterReview, {
    generateScript: 'generateScript',  // 迭代循环（最多3轮）
    matchAssets: 'matchAssets',         // 通过审查
  })
  // ... 完整流程
  .compile();
```

### 爆款 DNA 提取

```typescript
// 从 N 条爆款分析记录中归纳 DNA 模式
const analyses = await viralAnalysisRepository.findByCategory(category, 50);
const prompt = buildDNAExtractionPrompt(summaries, category, market);
const patterns = parseDNAResponse(await doubaoText.generate({ prompt }), ...);
```

### 长任务断点续传

```typescript
// Checkpoint 机制
interface CreationJobPayload {
  retry_completed_shot_indices?: number[];  // 已完成分镜
  retry_completed_shot_videos?: Array<{
    shot_index: number;
    render_path: string;
  }>;
}
```

## 🧪 测试

```bash
# 运行所有测试
pnpm test

# 运行 E2E 测试
pnpm test:e2e

# 运行单元测试
pnpm test:unit
```

## 📈 监控

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **Jaeger**: http://localhost:16686

关键指标：
- `http_requests_total` - HTTP 请求总数
- `http_request_duration_seconds` - 请求延迟
- `script_generate_duration_seconds` - 剧本生成耗时
- `creation_stage_transitions_total` - 创作阶段流转

## 🌍 多语言支持

| 语言 | 代码 | 状态 |
|------|------|------|
| 简体中文 | zh-CN | ✅ |
| English | en-US | ✅ |
| Bahasa Indonesia | id-ID | ✅ |
| ภาษาไทย | th-TH | ✅ |
| Tiếng Việt | vi-VN | ✅ |
| 日本語 | ja-JP | ✅ |
| 한국어 | ko-KR | ✅ |

## 📝 文档

| 文档 | 说明 |
|------|------|
| [整体系统架构设计文档.md](./整体系统架构设计文档.md) | 系统架构说明 |
| [全局API接口文档.md](./全局API接口文档.md) | API 完整文档 |
| [数据库设计文档.md](./数据库设计文档.md) | 数据库设计 |
| [素材模块接口文档.md](./素材模块接口文档.md) | 素材模块 API |
| [剧本模块接口文档.md](./剧本模块接口文档.md) | 剧本模块 API |
| [创作模块接口文档.md](./创作模块接口文档.md) | 创作模块 API |
| [分析看板接口文档.md](./分析看板接口文档.md) | 分析模块 API |
| [环境搭建与部署文档.md](./环境搭建与部署文档.md) | 部署指南 |

## 📄 许可证

MIT License

## 🙏 致谢

- [火山引擎](https://www.volcengine.com/) - 提供 Doubao 大模型 API
- [LangChain](https://www.langchain.com/) - Agent 编排框架
- [Remotion](https://www.remotion.dev/) - 视频渲染框架
- [TailwindCSS](https://tailwindcss.com/) - CSS 框架