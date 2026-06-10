// =============================================================================
// TikStream AI — Director Agent
// 导演 Agent：验证分镜时序 → 节奏编排 → 转场设计
// tools: ScriptSchemaValidator
// =============================================================================

import type { ScriptSchemaValidator } from '../../../script/script-schema.validator';

export interface DirectorAgentDeps {
  schemaValidator: ScriptSchemaValidator;
}

/**
 * 创建 Director Agent 节点
 *
 * 职责：
 * 1. 校验分镜列表的结构完整性（SchemaValidator）
 * 2. 检查分镜时序合理性（duration 分布、转场流畅性）
 * 3. 输出导演编排备注和时序报告
 */
export function createDirectorAgent(deps: DirectorAgentDeps) {
  return async (state: Record<string, unknown>): Promise<Partial<Record<string, unknown>>> => {
    const startedAt = Date.now();
    const shots = (state.script_shots as Array<Record<string, unknown>>) || [];

    if (shots.length === 0) {
      return {
        director_approved: false,
        director_notes: '导演编排失败：缺少分镜数据',
        overall_status: 'FAILED',
        agent_traces: [
          ...(state.agent_traces as Array<Record<string, unknown>> || []),
          {
            agent: 'director',
            action: '编排失败',
            reasoning: '无分镜数据可编排',
            duration_ms: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    try {
      // 1. Schema 校验
      const validationResult = deps.schemaValidator.validate({ shots });
      const hasErrors = validationResult.errors && validationResult.errors.length > 0;

      // 2. 时序诊断：计算总时长、平均时长、检查是否有异常分镜
      let totalDuration = 0;
      const durations: number[] = [];
      for (const shot of shots) {
        const d = Number(shot.duration) || 0;
        durations.push(d);
        totalDuration += d;
      }
      const avgDuration = durations.length > 0 ? totalDuration / durations.length : 0;

      // 3. 转场检查：确保每个 shot 有 transition_type
      const missingTransitions = shots.filter((s) => !s.transition_type).length;

      // 4. 生成时序报告
      const shotTimingReport = {
        total_shots: shots.length,
        total_duration: totalDuration,
        avg_shot_duration: avgDuration,
        min_duration: durations.length > 0 ? Math.min(...durations) : 0,
        max_duration: durations.length > 0 ? Math.max(...durations) : 0,
        missing_transitions: missingTransitions,
        schema_errors: validationResult.errors || [],
        schema_warnings: validationResult.warnings || [],
      };

      const approved = !hasErrors && shots.length >= 3;
      const directorNotes = approved
        ? `导演审批通过：${shots.length} 镜，总时长 ${totalDuration.toFixed(1)}s，平均每镜 ${avgDuration.toFixed(1)}s`
        : `导演审批未通过：${hasErrors ? `Schema 存在 ${validationResult.errors?.length ?? 0} 个错误` : '分镜数不足（需≥3）'}`;

      const elapsed = Date.now() - startedAt;
      const agentTrace = {
        agent: 'director',
        action: approved ? '编排通过' : '编排驳回',
        reasoning: directorNotes,
        duration_ms: elapsed,
        timestamp: new Date().toISOString(),
      };

      return {
        director_approved: approved,
        director_notes: directorNotes,
        shot_timing_report: shotTimingReport,
        overall_status: approved ? 'RUNNING' : 'FAILED',
        current_agent: approved ? 'composer' : 'copywriter',
        agent_traces: [
          ...(state.agent_traces as Array<Record<string, unknown>> || []),
          agentTrace,
        ],
      };
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      return {
        director_approved: false,
        director_notes: `导演编排异常: ${(err as Error)?.message || String(err)}`,
        overall_status: 'FAILED',
        agent_traces: [
          ...(state.agent_traces as Array<Record<string, unknown>> || []),
          {
            agent: 'director',
            action: '编排异常',
            reasoning: (err as Error)?.message || String(err),
            duration_ms: elapsed,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }
  };
}
