# TikStream AI — Project Manifesto

## 项目定位
TikStream AI 是面向 TikTok Shop 等国际电商平台的一站式 AIGC 带货视频生成系统。
用户上传商品图片/视频或输入核心卖点，系统自动生成符合平台规范的 15 秒竖屏带货短视频。

## 核心价值主张
1. 降低短视频生产门槛 (无需专业团队)
2. 缩短素材到成片的生产周期
3. 模板化/结构化/可复用的内容生成方式
4. 生成→分析→优化的完整闭环

## 端到端业务流程
```
素材上传 → 切片与打标 → 商品级资产入库
  → 选择剧本生成模式 (快速/仿写/模板)
  → 输出结构化分镜剧本
  → 分镜编辑与配时校验
  → 一键成片任务创建
  → 素材匹配 / 图生视频兜底
  → 配音 / 字幕 / BGM / 拼接
  → 视频导出
  → 分析看板效果查看与优化建议
```

---

## 双人分工边界 (MANDATORY)

### 人员 A — 素材模块 + 创作模块
- 素材上传 (分片上传/断点续传), 缩略图生成
- 视频切片 (Decord + TransNetV2) 与关键帧抽取
- Dense Caption 语义打标 (Doubao-Seed-2.0-pro)
- 多模态向量化 (Meta ImageBind 512维) 与 Qdrant 入库
- 混合检索 (语义检索 + 结构化过滤 + 关键字兜底)
- 9:16 自适应裁切 (YOLOv11 ROI 检测)
- 物理音效提取 (HTDemucs)
- GPU Slicing Worker 实现与联调
- Remotion Render Worker 实现与联调
- 一键成片编排 (素材匹配 + Cache Hit/Cache Miss)
- 图生视频兜底 (Doubao-Seedance-1.5-pro)
- 四轨合成: 视频轨 + 旁白轨(F5-TTS) + 字幕轨 + BGM轨
- 分镜级增量渲染 (SceneHash 缓存 + 局部重渲染)
- 分镜拼接与 loudnorm 响度标准化
- 最终导出 (1080×1920 / 30fps / H.264)
- 前端工作台 (素材管理/创作预览)

### 人员 B — 剧本模块 + 分析看板模块
- 快速模式剧本生成 (Prompt 驱动)
- 爆款仿写剧本生成 (基于结构化拆解结果)
- 模板模式剧本生成 (策略因子融合)
- 剧本 Schema 强校验 (字段完整性/时长/配时)
- 分镜编辑 (JSON Patch) 与音节配时校验
- 合规词法拦截 (绝对化用语/禁止性表达)
- 模板市场 (CRUD + 策略摘要)
- 爆款视频结构化拆解
- DuckDB 预计算 (留存/归因/桑基图聚合)
- 分镜留存曲线 (ECharts)
- 多因子归因热力图 (ECharts)
- 视听留存桑基图 (ECharts)
- A/B 版本效果对比
- 一键自愈建议回写链路
- 前端编辑器 (剧本/看板)

### 公共模块 (两人协作)
- 任务管理 (列表/详情/探活/恢复)
- 模板市场 (查询/套用)
- 配置管理
- 健康检查与 Trace
- CI/CD 与容器化基础设施
- 共享类型维护

---

## 功能优先级矩阵

### P0 — 核心必交付 (主链路闭环)
| 功能 | 模块 | 责任人 |
|---|---|---|
| 素材上传 (MP4/JPG/PNG/WebP) | Material | A |
| 素材切片与 Dense Caption 语义打标 | Material | A |
| 快速模式剧本生成 | Script | B |
| 剧本 Schema 强校验 (分镜完整性/时长约束) | Script | B |
| 分镜级结构化脚本输出 | Script | B |
| 一键成片 (异步长任务) | Creation | A |
| 素材匹配 (Cache Hit 直接复用) | Creation | A |
| 图生视频兜底 (基础链路, Cache Miss 时触发) | Creation | A |
| 基础音视频轨合成 (视频轨 + 旁白轨) | Creation | A |
| 视频导出 (1080×1920 / 30fps / H.264) | Creation | A |
| 长任务进度追踪 (SSE) | Common | 公共 |
| 任务详情查询 (task_id 探活) | Common | 公共 |

### P1 — 增强能力
| 功能 | 模块 | 责任人 |
|---|---|---|
| 向量检索 (Qdrant 语义检索) | Material | A |
| 混合检索 (语义 + 结构化过滤 + 关键字兜底) | Material | A |
| 素材重处理 | Material | A |
| 爆款仿写剧本生成 | Script | B |
| 模板模式剧本生成 | Script | B |
| JSON Patch 分镜局部编辑 | Script | B |
| 音节配时实时校验 | Script | B |
| 合规词法拦截 (P1: 基础绝对化用语) | Script | B |
| BGM 轨 + 字幕轨合成 (四轨完整版) | Creation | A |
| 一键成片图生视频增强兜底 | Creation | A |
| 即时预览 (Remotion Player) | Creation | A |
| 分镜级局部重渲染 (增量缓存) | Creation | A |
| 素材切片替换 | Creation | A |
| 任务失败重试 | Creation | A |
| 主动取消任务 | Creation | A |
| 任务历史列表 | Common | 公共 |
| 页面刷新后恢复长任务状态 | Common | 公共 |
| 模板市场查询与套用 | Common | 公共 |
| 分镜留存曲线 (Mock/预计算) | Analytics | B |

### P2 — 亮点与加分项
| 功能 | 模块 | 责任人 |
|---|---|---|
| 9:16 自适应裁切 (YOLOv11 ROI) | Material | A |
| 物理音效提取 (HTDemucs) | Material | A |
| 高级语境化合规识别 | Script | B |
| 响度标准化 (FFmpeg loudnorm, -14.0 LUFS) | Creation | A |
| 高还原度即时预览 (与最终导出画质一致) | Creation | A |
| 多因子归因热力图 | Analytics | B |
| 视听留存桑基图 | Analytics | B |
| A/B 版本效果对比 | Analytics | B |
| 一键自愈 (诊断回写创作链路) | Analytics | B |
| API 配额治理 (Token Bucket / 分布式信号量) | Common | 公共 |
| VRAM 预算治理 | Common | 公共 |
| CI/CD 完整流水线 | Common | 公共 |
| 可观测性 (健康检查/资源统计/告警) | Common | 公共 |

---

## 关键数据约束
| 约束项 | 数值 |
|---|---|
| 视频总时长上限 | 15.0s |
| 单分镜时长范围 | 1.5s ~ 5.0s |
| 切片时长范围 | 1.5s ~ 4.0s |
| 图片最大体积 | 10MB |
| 视频最大体积 | 200MB |
| 默认输出分辨率 | 1080×1920 |
| 默认帧率 | 30fps |
| 默认编码 | H.264 |
| Doubao 文本模型 RPM | 80 |
| Seedance 并发上限 | 3 |
| 单次批量上传上限 | 10 文件 |
| 前端分片大小 | 5MB/chunk |
| 前端并发上传上限 | 3 |
| 响度目标 LUFS | -14.0 |
| 最大真峰值 dBTP | -1.0 |

## 里程碑
1. M1: 需求收敛与方案定稿 (立项书+PRD+架构设计)
2. M2: P0 主链路落地 (素材上传→剧本→成片→导出全闭环)
3. M3: P1 能力补强 (向量检索/模板/局部编辑/四轨合成/任务恢复)
4. M4: P2 亮点增强与答辩准备 (看板/归因/CI/CD/可观测性)

## 后续商业化演进方向
1. 多语言/多区域文化对齐
2. 更低成本视频生成替代方案
3. 接入真实投流数据, 升级归因分析链路
4. 引入 LangGraph + Claude Code SDK 多 Agent 协作运行时
5. 扩展为标准化商家 SaaS 平台
