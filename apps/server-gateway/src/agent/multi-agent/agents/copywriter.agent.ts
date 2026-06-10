// =============================================================================
// TikStream AI — Copywriter Agent
// 文案 Agent：拆解商品卖点 → 生成分镜剧本
// tools: DoubaoTextProvider, ScriptQuickPromptBuilder
// =============================================================================

import type { DoubaoTextProvider } from '../../../../services/ai/doubao-text.provider';
import type { ScriptQuickPromptBuilder } from '../../../../services/prompts/script-quick.prompt';

export interface CopywriterAgentDeps {
  doubaoText: DoubaoTextProvider;
  promptBuilder: ScriptQuickPromptBuilder;
}

/**
 * 创建 Copywriter Agent 节点
 * 
 * 职责：
 * 1. 基于商品卖点 + 风格调性构建 Prompt
 * 2. 调用 DoubaoTextProvider 生成分镜剧本
 * 3. 将 LLM 返回的 JSON 解析为 script_shots
 */
export function createCopywriterAgent(deps: CopywriterAgentDeps) {
  return async (state: Record<string, unknown>): Promise<Partial<Record<string, unknown>>> => {
    const startedAt = Date.now();
    const sellingPoints = (state.selling_points as string[]) || [];
    const styleVibe = String(state.style_vibe || '高转化 UGC');
    const language = String(state.language || 'zh-CN');
    const aspectRatio = String(state.aspect_ratio || '9:16');
    const constraintList = (state.constraint_list as string[]) || [];
    const targetAudience = String(state.target_audience || '');
    const preferences = (state.preferences as Array<{ type: 'WINNER' | 'LOSER'; text: string }>) || [];
    const productName = String(state.product_name || '');

    try {
      // 构建 Prompt 参数
      const promptResult = deps.promptBuilder.build({
        selling_points: sellingPoints.length > 0 ? sellingPoints : [productName],
        style_vibe: styleVibe,
        target_audience: targetAudience,
        language,
        aspect_ratio: aspectRatio,
        constraint_list: constraintList,
        preferences,
        title: productName,
      });

      // 调用豆包生成剧本
      const rawText = await deps.doubaoText.generateText(
        promptResult.systemPrompt,
        promptResult.userPrompt,
      );

      // 解析 LLM 返回的 JSON
      let shots: Array<Record<string, unknown>> = [];
      try {
        const cleaned = rawText
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();
        const parsed = JSON.parse(cleaned);
        shots = Array.isArray(parsed.shots) ? parsed.shots : (Array.isArray(parsed) ? parsed : []);
        // 强制按数组顺序重设 shot_index，避免 LLM 返回重复/错位索引
        shots = shots.map((s, i) => ({
          ...s,
          shot_index: i + 1,
        }));
      } catch {
        // JSON 解析失败时返回空分镜，由 Orchestrator 判断
        shots = [];
      }

      const elapsed = Date.now() - startedAt;
      const agentTrace = {
        agent: 'copywriter',
        action: '生成分镜剧本',
        reasoning: `基于 ${sellingPoints.length} 个卖点、风格 ${styleVibe}，生成了 ${shots.length} 个分镜`,
        duration_ms: elapsed,
        timestamp: new Date().toISOString(),
      };

      return {
        script_title: productName || '未命名剧本',
        script_shots: shots,
        current_agent: 'director',
        agent_traces: [
          ...(state.agent_traces as Array<Record<string, unknown>> || []),
          agentTrace,
        ],
      };
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      const errorTrace = {
        agent: 'copywriter',
        action: '生成失败',
        reasoning: `错误: ${(err as Error)?.message || String(err)}`,
        duration_ms: elapsed,
        timestamp: new Date().toISOString(),
      };

      return {
        script_shots: [],
        overall_status: 'FAILED',
        agent_traces: [
          ...(state.agent_traces as Array<Record<string, unknown>> || []),
          errorTrace,
        ],
      };
    }
  };
}
