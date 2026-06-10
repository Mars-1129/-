import type {
  ViralDNA,
  ViralDNAExtractRequest,
  ViralDNAExtractResponse,
  ViralDNAListQuery,
  ViralVideoAnalysisCreateResponse,
  ViralVideoAnalysisDetail,
  ViralVideoAnalysisFromMaterialRequest,
  ViralVideoAnalysisListResponse,
  ViralVideoAnalysisSearchRequest,
  ViralVideoAnalysisSearchResponse,
  ViralVideoAnalysisSuggestKeywordsRequest,
  ViralVideoAnalysisSuggestKeywordsResponse,
  ScriptGenerateResponse,
} from '@tikstream/shared-types';
import { request } from './http';

/** POST /api/v1/viral-video-analyses — 创建爆款视频结构化拆解 */
export function createViralAnalysis(body: {
  source_url: string;
  source_platform: string;
  product_id?: string;
  declared_public_source?: boolean;
}): Promise<ViralVideoAnalysisCreateResponse> {
  return request<ViralVideoAnalysisCreateResponse>('/api/v1/viral-video-analyses', {
    method: 'POST',
    body,
  });
}

/** GET /api/v1/viral-video-analyses/:id — 获取拆解详情 */
export function getViralAnalysis(analysisId: string): Promise<ViralVideoAnalysisDetail> {
  return request<ViralVideoAnalysisDetail>(`/api/v1/viral-video-analyses/${analysisId}`);
}

/** GET /api/v1/viral-video-analyses — 检索爆款视频分析列表 */
export function searchViralAnalyses(
  query: ViralVideoAnalysisSearchRequest,
): Promise<ViralVideoAnalysisSearchResponse> {
  return request<ViralVideoAnalysisSearchResponse>('/api/v1/viral-video-analyses', {
    query,
  });
}

/** POST /api/v1/viral-video-analyses/:id/analyze — 触发/重试 AI 视频拆解 */
export function analyzeViralVideo(analysisId: string): Promise<ViralVideoAnalysisDetail> {
  return request<ViralVideoAnalysisDetail>(
    `/api/v1/viral-video-analyses/${analysisId}/analyze`,
    { method: 'POST' },
  );
}

/** POST /api/v1/viral-video-analyses/from-material — 从自有素材创建爆款拆解 */
export function createViralFromMaterial(
  body: ViralVideoAnalysisFromMaterialRequest,
): Promise<ViralVideoAnalysisCreateResponse> {
  return request<ViralVideoAnalysisCreateResponse>(
    '/api/v1/viral-video-analyses/from-material',
    { method: 'POST', body },
  );
}

/** GET /api/v1/viral-video-analyses/match — 自动匹配最佳爆款视频 */
export function matchBestViralAnalysis(
  productId: string,
): Promise<ViralVideoAnalysisDetail> {
  return request<ViralVideoAnalysisDetail>('/api/v1/viral-video-analyses/match', {
    query: { product_id: productId },
  });
}

/** POST /api/v1/viral-video-analyses/suggest-keywords — 推荐搜索关键词 */
export function suggestViralKeywords(
  body: ViralVideoAnalysisSuggestKeywordsRequest,
): Promise<ViralVideoAnalysisSuggestKeywordsResponse> {
  return request<ViralVideoAnalysisSuggestKeywordsResponse>(
    '/api/v1/viral-video-analyses/suggest-keywords',
    { method: 'POST', body },
  );
}

/** GET /api/v1/viral-video-analyses/batch?ids=id1,id2 — 批量查询拆解详情 */
export function getViralAnalysesByIds(ids: string[]): Promise<ViralVideoAnalysisListResponse> {
  return request<ViralVideoAnalysisListResponse>('/api/v1/viral-video-analyses/batch', {
    query: { ids: ids.join(',') },
  });
}

/** GET /api/v1/viral-video-analyses/by-product/:productId — 按商品 ID 查询所有拆解 */
export function getViralAnalysesByProductId(productId: string): Promise<ViralVideoAnalysisListResponse> {
  return request<ViralVideoAnalysisListResponse>(
    `/api/v1/viral-video-analyses/by-product/${productId}`,
  );
}

// ───── Viral DNA ─────

/** POST /api/v1/viral-dna/extract — 爆款 DNA 提取 (非流式, 用于低版本兼容) */
export function extractDna(body: ViralDNAExtractRequest): Promise<ViralDNAExtractResponse> {
  return request<ViralDNAExtractResponse>('/api/v1/viral-dna/extract', { method: 'POST', body, timeoutMs: 300_000 });
}

/**
 * SSE 流式提取爆款 DNA (实时进度推送)
 * 事件类型: collecting | clustering | generating | labeling | persisting | complete | result | error
 *
 * @param category - 商品类目
 * @param onProgress - 进度回调 (phase, progress, detail)
 * @param onResult - 结果回调
 * @param onError - 错误回调
 * @param options - { market?, min_samples?, timeoutMs? } 默认 timeoutMs=300_000 (5分钟)
 */
export function extractDnaStream(
  category: string,
  onProgress: (phase: string, progress: number, detail: string) => void,
  onResult: (result: ViralDNAExtractResponse) => void,
  onError: (error: string) => void,
  options?: { market?: string; min_samples?: number; timeoutMs?: number },
): AbortController {
  const controller = new AbortController();
  const params = new URLSearchParams({
    category,
    market: options?.market || 'GLOBAL',
    min_samples: String(options?.min_samples ?? 5),
  });

  const url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/viral-dna/extract/stream?${params.toString()}`;

  // 设置整体超时，防止无限等待
  const timeoutMs = options?.timeoutMs ?? 300_000; // 默认 5 分钟
  const timeoutId = setTimeout(() => {
    controller.abort();
    onError(`DNA 提取超时 (${Math.round(timeoutMs / 1000)}s)，请检查网络后重试`);
  }, timeoutMs);

  fetch(url, {
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal,
  })
    .then(async (response) => {
      clearTimeout(timeoutId);
      if (!response.ok) {
        onError(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) { onError('No response body'); return; }
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            try {
              const json = JSON.parse(trimmed.slice(5).trim());
              // 错误事件优先判定：phase === 'error' 或 success === false
              if (json.phase === 'error' || json.success === false) {
                onError(json.message || json.detail || '提取过程发生错误');
                return;
              }
              // 最终结果：无 phase 字段且有 success === true
              if (!json.phase && json.success === true) {
                onResult(json as ViralDNAExtractResponse);
                return;
              }
              // 进度事件：有 phase 字段
              if (json.phase) {
                onProgress(json.phase, json.progress ?? 0, json.detail ?? '');
              }
            } catch {
              // skip non-JSON lines
            }
          }
        }
      }
      // SSE 流正常关闭但未收到 result：可能是后端异常退出
      onError('服务端连接意外关闭，请重试');
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err.name !== 'AbortError') {
        onError(err instanceof Error ? err.message : String(err));
      }
    });

  return controller;
}

/** GET /api/v1/viral-dna — DNA 模式列表 */
export function listDna(query?: ViralDNAListQuery): Promise<ViralDNA[]> {
  return request<ViralDNA[]>('/api/v1/viral-dna', { query: query as Record<string, unknown> });
}

/** GET /api/v1/viral-dna/:dnaId — 获取单个 DNA 详情 */
export function getDnaDetail(dnaId: string): Promise<ViralDNA> {
  return request<ViralDNA>(`/api/v1/viral-dna/${encodeURIComponent(dnaId)}`);
}

/** POST /api/v1/scripts/generate/from-dna — 基于DNA生成剧本 */
export function generateFromDna(body: { dna_id: string; product_id: string; min_confidence?: number; style_vibe?: string; aspect_ratio?: string; language?: string; material_ids?: string[]; enable_vision_analysis?: boolean }): Promise<ScriptGenerateResponse> {
  return request<ScriptGenerateResponse>('/api/v1/scripts/generate/from-dna', { method: 'POST', body });
}
