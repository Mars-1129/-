/**
 * 视频去重与原创度优化 - 常量定义
 */

export const ORIGINALITY_CONSTANTS = {
  /** 相似度阈值：超过此值视为疑似重复 */
  SIMILARITY_THRESHOLD: 0.85,

  /** Qdrant 搜索 Top-K */
  SIMILARITY_TOP_K: 5,

  /** 最小原创度分数：低于此值触发优化 */
  MIN_ORIGINALITY_SCORE: 0.75,

  /** 优化后目标分数 */
  TARGET_ORIGINALITY_SCORE: 0.90,

  /** 最大优化重试次数 */
  MAX_OPTIMIZATION_RETRIES: 2,

  /** 优化技术参数模板 */
  OPTIMIZATION_DEFAULTS: {
    recolor: {
      contrast: 1.05,
      saturation: 1.1,
      brightness: 0.02,
    },
    respeed: {
      /** 微调速度系数 (0.95 → 提速5%，1.05 → 减速5%) */
      speed_factor: 0.95,
    },
    resubtitle: {
      font_size: 48,
      primary_color: '&H00FFFF',
      outline_color: '&H000000',
    },
    revoice: {
      /** 替换 TTS 音色 */
      voice_style: 'alternative',
    },
  },

  /** LLM 建议生成 Prompt */
  OPTIMIZATION_PROMPT: {
    system: `你是一个短视频原创度优化专家。根据相似度分析结果，为每个重复分镜提出具体的优化建议。
优化技术包括：
- reorder: 调整分镜顺序
- recolor: 调整视频色调/对比度/饱和度
- respeed: 微调播放速度
- revoice: 更换配音风格
- resubtitle: 更换字幕样式/位置

对每个建议给出预期提升分数(0-1区间的小数)。`,
    userTemplate: `以下视频与 {similar_count} 个已有视频高度相似（相似度 {similarity_score}），重复分镜: {duplicate_sections}。
请为每个重复分镜生成优化建议，输出 JSON 数组。`,
  },

  /** 数据来源标识 */
  DATA_SOURCE: 'ORIGINALITY_CHECK',
} as const;

/** 分镜场景检测相似度阈值 */
export const SCENE_SIMILARITY_THRESHOLD = 0.80;

/** 向量维度 (ImageBind) */
export const EMBEDDING_DIMENSION = 384;
