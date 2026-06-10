// =============================================================================
// TikStream AI — Agent Node: 智能素材匹配
// 遍历每个分镜，调用素材搜索 API 为每个分镜找到最优切片
// =============================================================================

import type { AgentStepLog } from '../state';

/**
 * 素材匹配节点依赖
 */
export interface MatchAssetsDeps {
  materialService?: {
    searchMaterials: (params: {
      product_id: string;
      query: string;
      min_duration?: number;
      max_duration?: number;
    }) => Promise<{ items: Array<{ slice_id: string; stream_url?: string }> }>;
  };
}

/**
 * matchAssets 节点
 *
 * 对每个已生成的分镜，使用其场景描述或视觉描述作为搜索查询，
 * 从素材库中找到最匹配的切片。
 */
export function createMatchAssetsNode(deps: MatchAssetsDeps) {
  return async (state: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const shots = (state.script_shots as Array<Record<string, unknown>>) ?? [];
    const productId = (state.product_id as string) ?? '';
    const stepLog = (state.step_log as AgentStepLog[]) ?? [];

    if (shots.length === 0 || !deps.materialService) {
      stepLog.push({
        node: 'matchAssets',
        timestamp: new Date().toISOString(),
        action: 'skip',
        reasoning: shots.length === 0 ? '无分镜可匹配' : '素材服务未配置',
      });
      return { step_log: stepLog };
    }

    const matchedShots = await Promise.all(
      shots.map(async (shot) => {
        const query = (shot.scene_description_query as string)
          || (shot.scene_description as string)
          || (shot.visual_description as string)
          || '';

        try {
          const results = await deps.materialService!.searchMaterials({
            product_id: productId,
            query,
            min_duration: ((shot.duration as number) ?? 3) * 0.8,
            max_duration: ((shot.duration as number) ?? 3) * 1.2,
          });

          return {
            shot_index: shot.shot_index ?? 0,
            slice_id: results.items[0]?.slice_id ?? null,
            stream_url: results.items[0]?.stream_url ?? null,
            matched: results.items.length > 0,
          };
        } catch {
          return {
            shot_index: shot.shot_index ?? 0,
            slice_id: null,
            matched: false,
            error: '搜索失败',
          };
        }
      }),
    );

    const matchCount = matchedShots.filter((m) => m.matched).length;
    stepLog.push({
      node: 'matchAssets',
      timestamp: new Date().toISOString(),
      action: 'completed',
      reasoning: `素材匹配完成：${matchCount}/${shots.length} 分镜匹配成功`,
      data: { match_count: matchCount, total: shots.length },
    });

    return {
      matched_shots: matchedShots,
      step_log: stepLog,
    };
  };
}
