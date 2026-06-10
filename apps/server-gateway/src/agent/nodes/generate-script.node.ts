// =============================================================================
// TikStream AI — Agent Node: 剧本生成
// 复用 ScriptQuickPromptBuilder + DoubaoTextProvider 生成分镜剧本
// =============================================================================

import type { ScriptQuickPromptBuilder, PromptParams } from '../../../services/prompts/script-quick.prompt';
import type { DoubaoTextProvider } from '../../../services/ai/doubao-text.provider';
import type { AgentStepLog } from '../state';

/**
 * 从 LLM 原始输出解析分镜 JSON
 */
function parseScriptFromRaw(raw: string): { title?: string; shots: Array<Record<string, unknown>> } {
  let text = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // 尝试提取 JSON 块
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch (parseErr) {
    throw new Error(
      `LLM 输出无法解析为 JSON，原始输出前 200 字符: ${raw.slice(0, 200)}`,
    );
  }

  const shots: Array<Record<string, unknown>> = [];
  const rawShots = (parsed.shots || parsed.script_shots || []) as Array<Record<string, unknown>>;
  for (const s of rawShots) {
    shots.push({
      shot_index: (s as any).shot_index ?? (s as any).shotIndex ?? (s as any).index ?? 0,
      duration: (s as any).duration ?? (s as any).video_duration ?? 3.0,
      scene_description: (s as any).scene_description ?? (s as any).sceneDescription ?? (s as any).scene ?? '',
      visual_description: (s as any).visual_description ?? (s as any).visualDescription ?? (s as any).visual ?? '',
      camera_movement: (s as any).camera_movement ?? (s as any).cameraMovement ?? 'Static',
      transition_type: (s as any).transition_type ?? (s as any).transitionType ?? 'None',
      voiceover_text: (s as any).voiceover_text ?? (s as any).voiceoverText ?? (s as any).voiceover ?? '',
      subtitle_text: (s as any).subtitle_text ?? (s as any).subtitleText ?? (s as any).subtitle ?? '',
    });
  }

  return {
    title: (parsed.title ?? parsed.script_title ?? '') as string,
    shots,
  };
}

/**
 * generateScript 节点
 *
 * 使用 ScriptQuickPromptBuilder 构建 prompt，通过 DoubaoTextProvider 调用 LLM，
 * 生成 4-6 镜分镜剧本。支持 review_feedback 参数——如果有上次审查的反馈，
 * 会将其注入 prompt 以改进生成质量。
 */
export function createGenerateScriptNode(
  promptBuilder: ScriptQuickPromptBuilder,
  doubaoText: DoubaoTextProvider,
) {
  return async function generateScript(state: Record<string, unknown>): Promise<Partial<Record<string, unknown>>> {
    const sellingPoints = (state.selling_points as string[]) || [];
    const styleVibe = String(state.style_vibe || '高转化 UGC');
    const language = String(state.language || 'zh-CN');
    const aspectRatio = String(state.aspect_ratio || '9:16');
    const constraintList = (state.constraint_list as string[]) || [];
    const targetAudience = String(state.target_audience || '');
    const preferences = (state.preferences as Array<{ type: 'WINNER' | 'LOSER'; text: string }>) || [];
    const reviewFeedback = String(state.review_feedback || '');
    const productName = String(state.product_name || '');
    const iterations = (state.iterations as number) || 0;

    // 合并审查反馈到约束中
    const effectiveConstraints = [...constraintList];
    if (reviewFeedback) {
      effectiveConstraints.push(`[AI审查反馈-第${iterations}轮] 改进方向：${reviewFeedback}`);
    }

    const promptParams: PromptParams = {
      selling_points: sellingPoints.length > 0 ? sellingPoints : [productName],
      style_vibe: styleVibe,
      target_audience: targetAudience || undefined,
      language,
      aspect_ratio: aspectRatio,
      constraint_list: effectiveConstraints,
      preferences: preferences.filter((p) => p.text?.trim()),
    };

    const { systemPrompt, userPrompt } = promptBuilder.build(promptParams);

    let title = '';
    let shots: Array<Record<string, unknown>> = [];

    try {
      const raw = await doubaoText.generateText(systemPrompt, userPrompt);
      const parsed = parseScriptFromRaw(raw);
      title = parsed.title || `Agent-${productName}-R${iterations + 1}`;
      // 归一化 shot_index 为 1-based，确保与 copywriter.agent 一致
      shots = parsed.shots.map((s, i) => ({ ...s, shot_index: i + 1 }));
    } catch {
      // 回退：构造最小有效分镜
      title = `${productName}-基础版`;
      shots = [
        {
          shot_index: 1,
          duration: 3.0,
          scene_description: `展示${productName}`,
          visual_description: `产品特写`,
          camera_movement: 'Static',
          transition_type: 'None',
          voiceover_text: `来看看这款${productName}`,
          subtitle_text: productName,
        },
      ];
    }

    const logEntry: AgentStepLog = {
      node: 'generateScript',
      timestamp: new Date().toISOString(),
      action: `生成剧本（第 ${iterations + 1} 轮）`,
      reasoning: reviewFeedback
        ? `根据反馈改进：${reviewFeedback.slice(0, 60)}...`
        : '初始化剧本生成',
      data: {
        title,
        shot_count: shots.length,
        has_feedback: !!reviewFeedback,
      },
    };

    return {
      script_title: title,
      script_shots: shots,
      step_log: [...((state.step_log as Record<string, unknown>[]) || []), logEntry as unknown as Record<string, unknown>],
    };
  };
}
