import type {
  FactorRemixRequest,
  JsonPatchDocument,
  PaginatedData,
  PatchSuggestRequest,
  PatchSuggestResponse,
  RegenerateFeedbackRequest,
  RegenerateRestyleRequest,
  Script,
  ScriptBatchGenerateRequest,
  ScriptBatchGenerateResponse,
  ScriptComposedGenerateRequest,
  ScriptGenerateResponse,
  ScriptHybridGenerateRequest,
  ScriptPatchResponse,
  ScriptQuickGenerateRequest,
  ScriptSaveRequest,
  ScriptSaveResponse,
  ScriptTemplateGenerateRequest,
  ScriptValidateTimingRequest,
  ScriptValidateTimingResponse,
  ScriptViralRewriteRequest,
  ScriptComplianceReviewResponse,
  AgentGenerateRequest,
  AgentGenerateResponse,
  AutoAbRunRequest,
  AutoAbRunResponse,
  ScriptTranslationsResponse,
  TranslateScriptRequest,
  TranslateScriptResponse,
} from '@tikstream/shared-types';
import { request } from './http';

export function listScripts(productId: string, page = 1, pageSize = 50): Promise<PaginatedData<Script>> {
  return request<PaginatedData<Script>>('/api/v1/scripts', {
    query: {
      product_id: productId,
      page,
      page_size: pageSize,
    },
  });
}

export function getScript(scriptId: string): Promise<Script> {
  return request<Script>(`/api/v1/scripts/${scriptId}`);
}

type ScriptPreferences = Array<{ type: 'WINNER' | 'LOSER'; text: string }>;

export function generateQuickScript(body: ScriptQuickGenerateRequest & { preferences?: ScriptPreferences }): Promise<ScriptGenerateResponse> {
  return request<ScriptGenerateResponse>('/api/v1/scripts/generate/quick', { method: 'POST', body });
}

export function generateViralRewriteScript(body: ScriptViralRewriteRequest & { preferences?: ScriptPreferences }): Promise<ScriptGenerateResponse> {
  return request<ScriptGenerateResponse>('/api/v1/scripts/generate/viral-rewrite', { method: 'POST', body });
}

export function generateTemplateScript(body: ScriptTemplateGenerateRequest & { preferences?: ScriptPreferences }): Promise<ScriptGenerateResponse> {
  return request<ScriptGenerateResponse>('/api/v1/scripts/generate/template', { method: 'POST', body });
}

export function generateBatchScripts(body: ScriptBatchGenerateRequest): Promise<ScriptBatchGenerateResponse> {
  return request<ScriptBatchGenerateResponse>('/api/v1/scripts/generate/batch', { method: 'POST', body });
}

export function generateComposedScript(body: ScriptComposedGenerateRequest & { preferences?: ScriptPreferences }): Promise<ScriptGenerateResponse> {
  return request<ScriptGenerateResponse>('/api/v1/scripts/generate/composed', { method: 'POST', body });
}

export function generateHybridScript(body: ScriptHybridGenerateRequest & { preferences?: ScriptPreferences }): Promise<ScriptGenerateResponse> {
  return request<ScriptGenerateResponse>('/api/v1/scripts/generate/hybrid', { method: 'POST', body });
}

export function patchScript(scriptId: string, operations: JsonPatchDocument): Promise<ScriptPatchResponse> {
  return request<ScriptPatchResponse>(`/api/v1/scripts/${scriptId}`, {
    method: 'PATCH',
    body: operations,
  });
}

export function validateScriptTiming(
  scriptId: string,
  body: ScriptValidateTimingRequest,
): Promise<ScriptValidateTimingResponse> {
  return request<ScriptValidateTimingResponse>(`/api/v1/scripts/${scriptId}/validate-timing`, {
    method: 'POST',
    body,
  });
}

export function saveScript(scriptId: string, body: ScriptSaveRequest): Promise<ScriptSaveResponse> {
  return request<ScriptSaveResponse>(`/api/v1/scripts/${scriptId}/save`, {
    method: 'POST',
    body,
  });
}

export function deleteScript(scriptId: string): Promise<null> {
  return request<null>(`/api/v1/scripts/${scriptId}`, {
    method: 'DELETE',
  });
}

export function listTrashScripts(
  productId: string,
  page = 1,
  pageSize = 50,
): Promise<PaginatedData<Script>> {
  return request<PaginatedData<Script>>('/api/v1/scripts/trash', {
    query: {
      product_id: productId,
      page,
      page_size: pageSize,
    },
  });
}

export function restoreScript(scriptId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/v1/scripts/${scriptId}/restore`, {
    method: 'POST',
  });
}

export function permanentDeleteScript(scriptId: string): Promise<null> {
  return request<null>(`/api/v1/scripts/${scriptId}/permanent`, {
    method: 'DELETE',
  });
}

export function regenerateScript(
  scriptId: string,
  body: RegenerateFeedbackRequest = { shot_feedbacks: [] },
): Promise<Script> {
  return request<Script>(`/api/v1/scripts/${scriptId}/regenerate/feedback`, {
    method: 'POST',
    body,
  });
}

export function regenerateWithFeedback(
  scriptId: string,
  body: RegenerateFeedbackRequest,
): Promise<Script> {
  return request<Script>(`/api/v1/scripts/${scriptId}/regenerate/feedback`, {
    method: 'POST',
    body,
  });
}

export function regenerateRestyle(
  scriptId: string,
  body: RegenerateRestyleRequest,
): Promise<Script> {
  return request<Script>(`/api/v1/scripts/${scriptId}/regenerate/restyle`, {
    method: 'POST',
    body,
  });
}

export function factorRemixScript(
  scriptId: string,
  body: FactorRemixRequest,
): Promise<Script> {
  return request<Script>(
    `/api/v1/scripts/${encodeURIComponent(scriptId)}/regenerate/factor-remix`,
    { method: 'POST', body },
  );
}

export function suggestPatchImprovements(
  scriptId: string,
  body: PatchSuggestRequest,
): Promise<PatchSuggestResponse> {
  return request<PatchSuggestResponse>(`/api/v1/scripts/${scriptId}/patch/suggest`, {
    method: 'POST',
    body,
  });
}

// ========== Compliance AI Review ==========

export function reviewScriptCompliance(
  scriptId: string,
  body: { enable_ai_review?: boolean; product_category?: string } = {},
): Promise<ScriptComplianceReviewResponse> {
  return request<ScriptComplianceReviewResponse>(
    `/api/v1/scripts/${encodeURIComponent(scriptId)}/compliance/review`,
    { method: 'POST', body },
  );
}

/** SSE 流式合规审查（带实时进度） */
export function reviewScriptComplianceStream(
  scriptId: string,
  body: { enable_ai_review?: boolean; product_category?: string } = {},
  onProgress: (event: { stage: string; message: string; progress: number; data?: Record<string, unknown> }) => void,
): Promise<ScriptComplianceReviewResponse> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();

    fetch(`/api/v1/scripts/${encodeURIComponent(scriptId)}/compliance/review/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          reject(new Error(`HTTP ${response.status}: ${text}`));
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          reject(new Error('Response body is not readable'));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === 'progress') {
                  onProgress(data);
                } else if (eventType === 'result') {
                  resolve(data as ScriptComplianceReviewResponse);
                } else if (eventType === 'error') {
                  reject(new Error((data as { message?: string }).message || '审查失败'));
                }
              } catch {
                // skip unparseable lines
              }
              eventType = '';
            }
          }
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') {
          reject(new Error('审查已取消'));
        } else {
          reject(err);
        }
      });
  });
}

// ========== Agent Generation ==========

/**
 * 启动 Agent 生成任务，立即返回 run_id（异步模式）
 *
 * 后端 runAgent() 在 < 1s 内返回 ACCEPTED，后台执行 LangGraph。
 * 但在高并发 LLM 调用（令牌桶竞争）下事件循环可能短暂阻塞，
 * 因此超时设为 120s（匹配通用默认值）以覆盖极端场景。
 */
export function runAgentGeneration(
  body: AgentGenerateRequest,
): Promise<AgentGenerateResponse> {
  return request<AgentGenerateResponse>(
    '/api/v1/agent/generate',
    { method: 'POST', body, timeoutMs: 120_000 },
  );
}

/** 轮询 Agent 运行状态和结果 */
export function getAgentStatus(
  runId: string,
): Promise<AgentGenerateResponse> {
  return request<AgentGenerateResponse>(
    `/api/v1/agent/status/${encodeURIComponent(runId)}`,
  );
}

export function runAutoAb(
  body: AutoAbRunRequest,
): Promise<AutoAbRunResponse> {
  return request<AutoAbRunResponse>(
    '/api/v1/auto-ab/run',
    { method: 'POST', body },
  );
}

export function getAutoAbStatus(
  runId: string,
): Promise<AutoAbRunResponse> {
  return request<AutoAbRunResponse>(
    `/api/v1/auto-ab/status/${encodeURIComponent(runId)}`,
  );
}

// ========== Script Version API (Phase 2) ==========

export function listScriptVersions(scriptId: string, query?: { page?: number; page_size?: number }): Promise<{
  items: Array<{ version_id: string; version_number: number; trigger_action: string; created_at: string }>;
  page: number; page_size: number; total: number;
}> {
  return request(`/api/v1/scripts/${encodeURIComponent(scriptId)}/versions`, { method: 'GET', query });
}

export function getScriptVersion(scriptId: string, versionId: string): Promise<{
  version_id: string; version_number: number; trigger_action: string;
  snapshot: Record<string, unknown>; created_at: string;
}> {
  return request(`/api/v1/scripts/${encodeURIComponent(scriptId)}/versions/${encodeURIComponent(versionId)}`);
}

export function rollbackScriptVersion(scriptId: string, versionId: string): Promise<{ script_id: string }> {
  return request(`/api/v1/scripts/${encodeURIComponent(scriptId)}/versions/${encodeURIComponent(versionId)}/rollback`, { method: 'POST' });
}

// ========== Subtitle Translation API ==========

export function getScriptTranslations(scriptId: string): Promise<ScriptTranslationsResponse> {
  return request<ScriptTranslationsResponse>(`/api/v1/scripts/${encodeURIComponent(scriptId)}/translations`);
}

export function triggerScriptTranslation(
  scriptId: string,
  body?: TranslateScriptRequest,
): Promise<TranslateScriptResponse> {
  return request<TranslateScriptResponse>(`/api/v1/scripts/${encodeURIComponent(scriptId)}/translations`, {
    method: 'POST',
    body,
  });
}

export function getSubtitleDownloadUrl(scriptId: string, targetLang: string, format: 'srt' | 'vtt' | 'ass'): string {
  return `/api/v1/scripts/${encodeURIComponent(scriptId)}/subtitles/${targetLang}.${format}`;
}
