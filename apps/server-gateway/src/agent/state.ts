// =============================================================================
// TikStream AI — Agent State (LangGraph StateSchema)
// 定义视频创作 Agent 的共享状态结构
// =============================================================================

import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod/v4';

/**
 * 分镜数据结构（Agent 内部使用）
 */
export interface AgentShot {
  shot_index: number;
  duration: number;
  scene_description: string;
  visual_description: string;
  camera_movement: string;
  transition_type: string;
  voiceover_text: string;
  subtitle_text: string;
}

/**
 * 商品理解结果
 */
export interface ProductUnderstanding {
  core_selling_point: string;
  audience_profile: string;
  use_scenarios: string[];
  tone_keywords: string[];
  differentiation: string;
}

/**
 * 自我审查结果
 */
export interface ReviewResult {
  score: number;
  hook_strength: number;
  compliance_risk: number;
  style_match: number;
  suggestions: string[];
  reasoning: string;
}

/**
 * Agent 迭代日志条目
 */
export interface AgentStepLog {
  node: string;
  timestamp: string;
  action: string;
  reasoning: string;
  data?: Record<string, unknown>;
}

/**
 * LangGraph StateSchema — 使用 zod v4 风格
 */
export const VideoCreationStateSchema = new StateSchema({
  // ===== 输入参数 =====
  product_id: z.string().describe('商品 ID'),
  product_name: z.string().default('').describe('商品名称'),
  style_vibe: z.string().default('高转化 UGC').describe('风格调性'),
  language: z.string().default('zh-CN').describe('语言'),
  aspect_ratio: z.string().default('9:16').describe('画面比例'),
  constraint_list: z.array(z.string()).default([]).describe('约束条件列表'),
  preferences: z
    .array(
      z.object({
        type: z.enum(['WINNER', 'LOSER']),
        text: z.string(),
      }),
    )
    .default([])
    .describe('文案偏好示例'),

  // ===== 中间状态 =====
  selling_points: z.array(z.string()).default([]).describe('商品卖点'),
  target_audience: z.string().default('').describe('目标受众'),
  product_understanding: z
    .object({
      core_selling_point: z.string(),
      audience_profile: z.string(),
      use_scenarios: z.array(z.string()),
      tone_keywords: z.array(z.string()),
      differentiation: z.string(),
    })
    .nullable()
    .default(null)
    .describe('商品理解结果'),

  // ===== 生成结果 =====
  script_title: z.string().default('').describe('剧本标题'),
  script_shots: z.array(z.record(z.string(), z.unknown())).default([]).describe('分镜列表'),
  generation_mode: z.string().default('AGENT').describe('生成模式标识'),

  // ===== 素材匹配 =====
  matched_shots: z.array(z.record(z.string(), z.unknown())).default([]).describe('匹配的素材分镜'),

  // ===== 质检 =====
  quality_issues: z.array(z.string()).default([]).describe('质检发现的问题分镜列表'),

  // ===== 审查状态 =====
  review_result: z
    .record(z.string(), z.unknown())
    .nullable()
    .default(null)
    .describe('最新审查结果'),
  iterations: z.number().default(0).describe('当前迭代次数'),
  max_iterations: z.number().default(3).describe('最大迭代次数'),
  quality_threshold: z.number().default(0.7).describe('质量通过阈值'),
  review_feedback: z.string().default('').describe('当前迭代的改进反馈'),

  // ===== 终态 =====
  status: z
    .enum(['RUNNING', 'PASSED', 'FALLBACK'])
    .default('RUNNING')
    .describe('Agent 最终状态'),
  final_script_id: z.string().default('').describe('落库后的剧本 ID'),

  // ===== 可观测 =====
  step_log: z.array(z.record(z.string(), z.unknown())).default([]).describe('步骤日志'),
});
