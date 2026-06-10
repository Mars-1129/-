// =============================================================================
// TikStream AI — Agent Node: 自动创建视频创作任务
// 基于已匹配素材的分镜，自动调用创作服务发起视频生成
// =============================================================================

import type { AgentStepLog } from '../state';

export interface CreateVideoDeps {
  creationService?: {
    createCreation: (params: {
      product_id: string;
      script_id: string;
      engine_mode?: string;
      target_resolution?: string;
      export_format?: string;
    }) => Promise<{ creation_id: string; task_id: string; status: string }>;
  };
}

/**
 * createVideo 节点
 *
 * 在剧本生成并通过审查、素材匹配完成后，
 * 自动调用 CreationService 发起一键成片任务。
 */
export function createCreateVideoNode(deps: CreateVideoDeps) {
  return async (state: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const productId = (state.product_id as string) ?? '';
    const scriptId = (state.final_script_id as string) ?? '';
    const aspectRatio = (state.aspect_ratio as string) ?? '9:16';
    const stepLog = (state.step_log as AgentStepLog[]) ?? [];

    if (!scriptId || !deps.creationService) {
      stepLog.push({
        node: 'createVideo',
        timestamp: new Date().toISOString(),
        action: 'skip',
        reasoning: !scriptId ? '无剧本 ID，无法创建' : '创作服务未配置',
      });
      return { step_log: stepLog };
    }

    try {
      const result = await deps.creationService.createCreation({
        product_id: productId,
        script_id: scriptId,
        engine_mode: 'SCRIPT_DRIVEN',
        target_resolution: aspectRatio === '16:9' ? '1920x1080' : '1080x1920',
        export_format: 'MP4',
      });

      stepLog.push({
        node: 'createVideo',
        timestamp: new Date().toISOString(),
        action: 'completed',
        reasoning: `创作任务已创建: ${result.creation_id}`,
        data: { creation_id: result.creation_id, task_id: result.task_id },
      });

      return {
        creation_id: result.creation_id,
        task_id: result.task_id,
        step_log: stepLog,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '创建失败';
      stepLog.push({
        node: 'createVideo',
        timestamp: new Date().toISOString(),
        action: 'error',
        reasoning: `视频创建过程发生异常: ${errMsg}`,
      });

      return {
        creation_id: null,
        task_id: null,
        step_log: stepLog,
      };
    }
  };
}
