// =============================================================================
// TikStream AI — Multi-Agent Collaboration State
// 多 Agent 层级协调系统的共享状态 Schema
// =============================================================================

import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod/v4';

/** 分镜数据（与现有 AgentShot 对齐） */
export interface MultiAgentShot {
  shot_index: number;
  duration: number;
  scene_description: string;
  visual_description: string;
  camera_movement: string;
  transition_type: string;
  voiceover_text: string;
  subtitle_text: string;
  /** 导演编排后的修正字段 */
  pacing_notes?: string;
  bgm_segment?: string;
  compliance_violations?: string[];
}

/** 合规检查结果 */
export interface MultiAgentComplianceReport {
  passed: boolean;
  violations: Array<{
    shot_index: number;
    rule: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
    suggestion: string;
  }>;
}

/** 优化分析结果 */
export interface MultiAgentOptimizationReport {
  drop_points: Array<{
    time_sec: number;
    drop_rate: number;
    related_shot_index?: number;
    possible_reason: string;
  }>;
  recommendations: Array<{
    target_shot_index: number;
    issue_type: string;
    suggestion: string;
  }>;
  auto_regenerated: boolean;
}

/** Agent 执行追踪 */
export interface AgentTrace {
  agent: string;
  action: string;
  reasoning: string;
  duration_ms: number;
  timestamp: string;
}

/**
 * 多 Agent 协作 StateSchema
 */
export const MultiAgentStateSchema = new StateSchema({
  // ===== 输入参数 =====
  product_id: z.string().describe('商品 ID'),
  product_name: z.string().default('').describe('商品名称'),
  style_vibe: z.string().default('高转化 UGC').describe('风格调性'),
  language: z.string().default('zh-CN').describe('语言'),
  aspect_ratio: z.string().default('9:16').describe('画面比例'),
  constraint_list: z.array(z.string()).default([]).describe('约束条件列表'),
  preferences: z
    .array(z.object({ type: z.enum(['WINNER', 'LOSER']), text: z.string() }))
    .default([])
    .describe('文案偏好示例'),
  selling_points: z.array(z.string()).default([]).describe('商品卖点'),
  target_audience: z.string().default('').describe('目标受众'),

  // ===== Copywriter Agent 产出 =====
  script_title: z.string().default('').describe('剧本标题'),
  script_shots: z
    .array(z.record(z.string(), z.unknown()))
    .default([])
    .describe('分镜列表（JSON 格式）'),

  // ===== Director Agent 产出 =====
  director_approved: z.boolean().default(false).describe('导演审查通过'),
  director_notes: z.string().default('').describe('导演编排备注'),
  shot_timing_report: z
    .record(z.string(), z.unknown())
    .nullable()
    .default(null)
    .describe('分镜时序诊断结果'),

  // ===== Composer Agent 产出 =====
  bgm_policy: z.string().default('').describe('BGM 策略'),
  audio_config: z
    .record(z.string(), z.unknown())
    .nullable()
    .default(null)
    .describe('音效配置'),

  // ===== Compliance Agent 产出 =====
  compliance_passed: z.boolean().default(false).describe('合规检查通过'),
  compliance_violations: z
    .array(z.record(z.string(), z.unknown()))
    .default([])
    .describe('违规详情'),

  // ===== Optimizer Agent 产出 =====
  optimization_done: z.boolean().default(false).describe('优化分析完成'),
  drop_points: z
    .array(z.record(z.string(), z.unknown()))
    .default([])
    .describe('掉点列表'),
  recommendations: z
    .array(z.record(z.string(), z.unknown()))
    .default([])
    .describe('优化建议'),
  auto_regenerated: z.boolean().default(false).describe('是否自动重新生成'),

  // ===== 控制字段 =====
  current_agent: z
    .enum(['copywriter', 'director', 'composer', 'compliance', 'optimizer'])
    .default('copywriter')
    .describe('当前执行的 Agent'),
  overall_status: z
    .enum(['RUNNING', 'PASSED', 'FAILED', 'COMPLIANCE_RETRY', 'OPTIMIZE_RETRY', 'COMPLETED'])
    .default('RUNNING')
    .describe('整体状态'),
  retry_count: z.number().default(0).describe('合规重试次数'),
  max_retries: z.number().default(2).describe('最大重试次数'),
  optimize_count: z.number().default(0).describe('优化执行次数'),
  max_optimizes: z.number().default(1).describe('最大优化次数'),

  // ===== 可观测 =====
  agent_traces: z
    .array(z.object({
      agent: z.string(),
      action: z.string(),
      reasoning: z.string(),
      duration_ms: z.number(),
      timestamp: z.string(),
    }))
    .default([])
    .describe('Agent 执行追踪'),
  run_id: z.string().default('').describe('运行 ID'),
});
