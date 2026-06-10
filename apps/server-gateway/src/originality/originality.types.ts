/**
 * 视频去重与原创度优化 - 类型定义
 */

/** 检测到的相似视频信息 */
export interface SimilarVideoInfo {
  material_id: string;
  similarity_score: number;
  title?: string;
  thumbnail_url?: string;
}

/** 优化技术类型 */
export type OptimizationTechnique =
  | 'reorder'
  | 'recolor'
  | 'respeed'
  | 'revoice'
  | 'resubtitle';

/** 单条优化建议 */
export interface OptimizationSuggestion {
  /** 目标分镜索引（从 1 开始） */
  section: number;
  /** 优化技术 */
  technique: OptimizationTechnique;
  /** 优化参数 */
  params?: Record<string, unknown>;
  /** 预计提升的原创度分数 */
  expected_impact: number;
  /** 可读描述 */
  description: string;
}

/** 相似度分析结果 */
export interface SimilarityAnalysis {
  /** 检测到的相似视频列表 */
  detected_similar_videos: SimilarVideoInfo[];
  /** 全局相似度分数 (0-1，越高越相似) */
  similarity_score: number;
  /** 重复的分镜索引（从 1 开始） */
  duplicate_sections: number[];
}

/** 原创度优化结果 - 完整输出 */
export interface OriginalityOptimizer {
  /** 相似度分析 */
  similarity_analysis: SimilarityAnalysis;
  /** 优化建议列表 */
  optimization_suggestions: OptimizationSuggestion[];
  /** 优化后预估原创度分数 (0-1，越高越原创) */
  originality_score_after: number;
}

/** 原创度检查请求 */
export interface OriginalityCheckRequest {
  creation_id: string;
  /** 视频整体文本描述 */
  video_description: string;
  /** 逐分镜场景描述 */
  scene_descriptions?: string[];
  /** 产品 ID */
  product_id?: string;
}

/** 原创度检查响应 */
export interface OriginalityCheckResponse {
  /** 原创度分数 (0-1) */
  originality_score: number;
  /** 是否通过（分数 >= 阈值） */
  passed: boolean;
  /** 详细分析结果（未通过时非空） */
  optimizer: OriginalityOptimizer | null;
}

/** 优化应用请求 */
export interface ApplyOptimizationRequest {
  creation_id: string;
  /** 要应用的优化项 */
  suggestions: OptimizationSuggestion[];
  /** 当前视频路径 */
  current_video_path: string;
}

/** 优化应用响应 */
export interface ApplyOptimizationResponse {
  success: boolean;
  /** 优化后视频路径 */
  optimized_video_path?: string;
  /** 应用失败的优化项 */
  failed_suggestions?: OptimizationSuggestion[];
}

/** OriginalityStatus 枚举 */
export enum OriginalityStatus {
  PENDING = 'PENDING',
  PASSED = 'PASSED',
  DUPLICATE_DETECTED = 'DUPLICATE_DETECTED',
  OPTIMIZED = 'OPTIMIZED',
  FAILED = 'FAILED',
}
