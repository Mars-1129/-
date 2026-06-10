import type {
  TrendTrackerResponse,
} from '@tikstream/shared-types';
import { request } from './http';

/** GET /api/v1/trend-tracker — 获取商品趋势快照 */
export function getTrends(productId: string): Promise<TrendTrackerResponse> {
  return request<TrendTrackerResponse>('/api/v1/trend-tracker', {
    query: { product_id: productId },
  });
}

/** POST /api/v1/trend-tracker/refresh — 强制刷新趋势快照 */
export function refreshTrends(productId: string): Promise<TrendTrackerResponse> {
  return request<TrendTrackerResponse>('/api/v1/trend-tracker/refresh', {
    method: 'POST',
    body: { product_id: productId },
  });
}
