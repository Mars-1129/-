// =============================================================================
// TikStream AI — Auto A/B Agent State (LangGraph StateSchema)
// 定义自动 A/B 对比 Agent 的共享状态结构
// =============================================================================

import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod/v4';

/**
 * 剧本变体配置
 */
export interface VariantConfig {
  label: string;
  style_vibe: string;
}

/**
 * A/B 对比两两结果
 */
export interface PairwiseResult {
  creation_id_a: string;
  label_a: string;
  creation_id_b: string;
  label_b: string;
  winner: 'A' | 'B' | 'TIE';
  metrics: Array<{
    metric_name: string;
    value_a: number;
    value_b: number;
    delta: number;
    direction: string;
  }>;
  diagnosis: string[];
}

/**
 * LangGraph StateSchema — Auto A/B Agent
 */
export const AutoAbStateSchema = new StateSchema({
  // ===== 输入参数 =====
  product_id: z.string().describe('商品 ID'),
  base_script_id: z.string().describe('基准剧本 ID'),
  style_variants: z
    .array(
      z.object({
        label: z.string(),
        style_vibe: z.string(),
      }),
    )
    .default([
      { label: '高能量', style_vibe: '快节奏高能量带货' },
      { label: '沉稳专业', style_vibe: '沉稳专业化展示' },
      { label: '幽默触达', style_vibe: '幽默轻松生活化' },
    ])
    .describe('风格变体配置列表'),

  // ===== 中间状态 =====
  session_id: z.string().default('').describe('A/B 会话 ID'),
  variant_script_ids: z.array(z.string()).default([]).describe('生成的变体剧本 ID 列表'),
  variant_labels: z.array(z.string()).default([]).describe('变体标签列表'),
  creation_ids: z.array(z.string()).default([]).describe('创建的创作任务 ID 列表'),

  // ===== 轮询状态 =====
  poll_attempts: z.number().default(0).describe('当前轮询次数'),
  max_poll_attempts: z.number().default(60).describe('最大轮询次数 (5s/次 = 5min)'),
  all_completed: z.boolean().default(false).describe('所有创作是否已完成'),

  // ===== 对比结果 =====
  pairwise_results: z
    .array(z.record(z.string(), z.unknown()))
    .default([])
    .describe('两两对比原始结果'),
  winner_creation_id: z.string().default('').describe('优胜创作 ID'),
  winner_label: z.string().default('').describe('优胜变体标签'),
  winner_score: z.number().default(0).describe('优胜者加权得分'),
  rankings: z
    .array(z.record(z.string(), z.unknown()))
    .default([])
    .describe('各变体排名列表'),
  insights: z.array(z.string()).default([]).describe('AI 生成的洞察文本'),

  // ===== 终态 =====
  status: z
    .enum(['RUNNING', 'COMPLETED', 'FAILED'])
    .default('RUNNING')
    .describe('管线状态'),
  error_message: z.string().default('').describe('错误消息'),
  progress: z.number().default(0).describe('进度百分比'),

  // ===== 可观测 =====
  step_log: z.array(z.record(z.string(), z.unknown())).default([]).describe('步骤日志'),
});
