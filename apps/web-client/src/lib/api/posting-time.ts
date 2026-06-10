import type {
  PostingTimeOptimization,
  PostingTimeOptimizationQuery,
} from '@tikstream/shared-types';
import { request } from './http';

/** POST /api/v1/posting-time/optimize — 投放时段优化分析 */
export function optimizePostingTime(
  body: PostingTimeOptimizationQuery & { force_refresh?: boolean },
): Promise<PostingTimeOptimization> {
  return request<PostingTimeOptimization>('/api/v1/posting-time/optimize', { method: 'POST', body });
}

/** GET /api/v1/posting-time/platforms — 获取支持的平台列表 */
export function getPostingPlatforms(): Promise<Array<{ platform: string; display_name: string; timezone: string }>> {
  return request<Array<{ platform: string; display_name: string; timezone: string }>>('/api/v1/posting-time/platforms');
}
