// =============================================================================
// TikStream AI — Agent Node: 质量检查
// 检查创作任务的分镜渲染状态，判断是否存在问题分镜
// =============================================================================

import type { AgentStepLog } from '../state';

export interface QualityCheckDeps {
  creationService?: {
    getCreationHealth?: (creationId: string) => Promise<{
      failed_shots?: Array<{ shot_index: number; error: string }>;
      stuck_creation_ids?: string[];
    }>;
  };
}

/**
 * qualityCheck 节点
 *
 * 视频创建任务发起后，检查各分镜渲染状态。
 * 若存在失败分镜，记录问题并允许后续节点触发 rerender。
 */
export function createQualityCheckNode(deps: QualityCheckDeps) {
  return async (state: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const creationId = (state.creation_id as string) ?? '';
    const stepLog = (state.step_log as AgentStepLog[]) ?? [];

    if (!creationId || !deps.creationService?.getCreationHealth) {
      stepLog.push({
        node: 'qualityCheck',
        timestamp: new Date().toISOString(),
        action: 'skip',
        reasoning: !creationId ? '无创作任务 ID' : '健康检查服务未配置',
      });
      return { step_log: stepLog, quality_issues: [] };
    }

    try {
      const health = await deps.creationService.getCreationHealth(creationId);
      const failedShots = health.failed_shots ?? [];
      const hasIssues = failedShots.length > 0;

      if (hasIssues) {
        const issues = failedShots.map(
          (s) => `分镜 ${s.shot_index + 1}: ${s.error}`,
        );
        stepLog.push({
          node: 'qualityCheck',
          timestamp: new Date().toISOString(),
          action: 'issues_found',
          reasoning: `${failedShots.length} 个分镜存在问题`,
          data: { failed_count: failedShots.length, issues },
        });

        return {
          quality_issues: issues,
          step_log: stepLog,
        };
      }

      stepLog.push({
        node: 'qualityCheck',
        timestamp: new Date().toISOString(),
        action: 'passed',
        reasoning: '所有分镜渲染正常，质量检查通过',
      });

      return {
        quality_issues: [],
        step_log: stepLog,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '检查失败';
      stepLog.push({
        node: 'qualityCheck',
        timestamp: new Date().toISOString(),
        action: 'error',
        reasoning: `质检过程发生异常: ${errMsg}`,
      });

      return {
        quality_issues: [],
        step_log: stepLog,
      };
    }
  };
}
