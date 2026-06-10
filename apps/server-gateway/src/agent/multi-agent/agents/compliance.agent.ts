// =============================================================================
// TikStream AI — Compliance Agent
// 合规 Agent：三层合规检查（正则 + NLP + AI 二审）
// tools: ComplianceFilter
// =============================================================================

import type { ComplianceFilter } from '../../../script/compliance.filter';
import type { DoubaoTextProvider } from '../../../../services/ai/doubao-text.provider';

export interface ComplianceAgentDeps {
  complianceFilter: ComplianceFilter;
  doubaoText: DoubaoTextProvider;
}

/**
 * 创建 Compliance Agent 节点
 *
 * 职责：
 * 1. 对分镜列表执行静态正则 + NLP 语境检查
 * 2. 若发现违规项，启用 AI 语义二审
 * 3. 输出合规报告（passed + violations）
 * 4. 若未通过，将违规分镜信息写入 state 供 Copywriter 重写
 */
export function createComplianceAgent(deps: ComplianceAgentDeps) {
  return async (state: Record<string, unknown>): Promise<Partial<Record<string, unknown>>> => {
    const startedAt = Date.now();
    const shots = (state.script_shots as Array<Record<string, unknown>>) || [];
    const retryCount = (state.retry_count as number) || 0;
    const maxRetries = (state.max_retries as number) || 2;

    if (shots.length === 0) {
      return {
        compliance_passed: false,
        compliance_violations: [{ shot_index: 0, rule: 'EMPTY_SCRIPT', severity: 'HIGH', message: '剧本为空' }],
        overall_status: 'FAILED',
        agent_traces: [
          ...(state.agent_traces as Array<Record<string, unknown>> || []),
          { agent: 'compliance', action: '检查失败', reasoning: '剧本为空', duration_ms: Date.now() - startedAt, timestamp: new Date().toISOString() },
        ],
      };
    }

    try {
      // 1. 执行合规检查（含 AI 二审）
      const result = await deps.complianceFilter.checkWithOptions(shots, {
        enableAiReview: true,
        aiTextGenerator: async (systemPrompt: string, userPrompt: string) =>
          deps.doubaoText.generateText(systemPrompt, userPrompt),
        productCategory: String(state.style_vibe || ''),
      });

      // 2. 构建合规报告
      const violations = (result.violations || []).map((v: { shot_index?: number; violated_word?: string; reason?: string; severity?: number | string; suggestion?: string }) => ({
        shot_index: v.shot_index ?? 0,
        rule: v.violated_word || v.reason || 'UNKNOWN',
        severity: String(v.severity ?? 'MEDIUM'),
        message: v.reason || '',
        suggestion: v.suggestion || '',
      }));

      const passed = result.passed;

      // 3. 决定下一步
      let nextAgent: string;
      let overallStatus: string;
      if (passed) {
        nextAgent = 'optimizer';
        overallStatus = 'RUNNING';
      } else if (retryCount < maxRetries) {
        nextAgent = 'copywriter';
        overallStatus = 'COMPLIANCE_RETRY';
      } else {
        nextAgent = 'optimizer';
        overallStatus = 'FAILED';
      }

      const elapsed = Date.now() - startedAt;
      const agentTrace = {
        agent: 'compliance',
        action: passed ? '合规通过' : `合规未通过（${violations.length} 项违规，重试${retryCount}/${maxRetries}）`,
        reasoning: passed ? '所有分镜通过合规检查' : violations.map((v) => `分镜${v.shot_index}: ${v.message}`).join('; '),
        duration_ms: elapsed,
        timestamp: new Date().toISOString(),
      };

      return {
        compliance_passed: passed,
        compliance_violations: violations,
        overall_status: overallStatus,
        current_agent: nextAgent,
        retry_count: passed ? retryCount : retryCount + 1,
        agent_traces: [
          ...(state.agent_traces as Array<Record<string, unknown>> || []),
          agentTrace,
        ],
      };
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      return {
        compliance_passed: false,
        compliance_violations: [{ shot_index: 0, rule: 'CHECK_ERROR', severity: 'HIGH', message: (err as Error)?.message || String(err) }],
        overall_status: 'FAILED',
        agent_traces: [
          ...(state.agent_traces as Array<Record<string, unknown>> || []),
          { agent: 'compliance', action: '检查异常', reasoning: (err as Error)?.message || String(err), duration_ms: elapsed, timestamp: new Date().toISOString() },
        ],
      };
    }
  };
}
