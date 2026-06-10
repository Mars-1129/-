// =============================================================================
// TikStream AI — Agent Node: 自我审查与迭代控制
// 对生成的剧本进行质量评估，决定是否继续迭代
// =============================================================================

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { DoubaoChatModel } from '../../../services/ai/doubao-chat-model';
import type { AgentStepLog, ReviewResult } from '../state';

const REVIEW_SYSTEM_PROMPT = `你是一位资深的 TikTok 短视频内容质量审核专家。
你的任务是对给定的分镜剧本进行质量评估，输出 JSON。

评估维度（每项 0-1 分数）：
1. hook_strength: 开头 2 秒的抓人能力（能否阻止划走）
2. compliance_risk: 合规风险（越高越危险，>0.6 意味着有违规嫌疑）
3. style_match: 与目标风格调性的匹配度

要求：
1. 评分要严格客观，不要随便给高分
2. suggestions 要具体、可执行（如"第一镜的 hook 文案太弱，建议改为痛点提问开场"）
3. reasoning 要解释打分依据
4. score 为三项的加权平均：hook_strength*0.5 + (1-compliance_risk)*0.3 + style_match*0.2

严格输出 JSON，不要包含 markdown 标记。`;

/**
 * extractShotsText 将分镜结构提取为 LLM 可读的纯文本摘要
 */
function extractShotsText(shots: Array<Record<string, unknown>>): string {
  return shots
    .map((s, i) => {
      const vo = s.voiceover_text || s.voiceoverText || '';
      const scene = s.scene_description || s.sceneDescription || '';
      const sub = s.subtitle_text || s.subtitleText || '';
      return `[镜${i + 1}] 配音: ${vo} | 场景: ${scene} | 字幕: ${sub}`;
    })
    .join('\n');
}

/**
 * reviewAndRefine 节点
 *
 * 1. 调用 LLM 对剧本打分（hook / compliance / style）
 * 2. 如果 score >= quality_threshold → 路由到 finalize
 * 3. 如果 score < quality_threshold && iterations < max_iterations → 路由回 generateScript
 * 4. 如果 score < quality_threshold && iterations >= max_iterations → 路由到 finalize（标记 FALLBACK）
 */
export function createReviewAndRefineNode(llm: DoubaoChatModel) {
  return async function reviewAndRefine(state: Record<string, unknown>): Promise<Partial<Record<string, unknown>>> {
    const shots = (state.script_shots as Array<Record<string, unknown>>) || [];
    const styleVibe = String(state.style_vibe || '高转化 UGC');
    const productName = String(state.product_name || '');
    const sellingPoints = (state.selling_points as string[]) || [];
    const iterations = ((state.iterations as number) || 0) + 1;
    const maxIterations = (state.max_iterations as number) || 3;
    const qualityThreshold = (state.quality_threshold as number) || 0.7;

    const shotsText = extractShotsText(shots);

    const userContent = [
      `商品：${productName}`,
      `卖点：${sellingPoints.join('、')}`,
      `目标风格：${styleVibe}`,
      `--- 待审剧本 ---`,
      shotsText,
      `---`,
      '请对上述剧本进行质量评估。',
    ].join('\n');

    let review: ReviewResult | null = null;
    try {
      const messages = [new SystemMessage(REVIEW_SYSTEM_PROMPT), new HumanMessage(userContent)];
      const raw = await llm.invoke(messages);
      const text = typeof raw === 'string' ? raw : String(raw);
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      review = JSON.parse(cleaned) as ReviewResult;
    } catch {
      // LLM 输出解析失败时使用保守评分（低于默认阈值 0.7，触发重试）
      review = {
        score: 0.65,
        hook_strength: 0.6,
        compliance_risk: 0.1,
        style_match: 0.7,
        suggestions: [],
        reasoning: '无法解析 LLM 评审结果，保守评分触发重新生成',
      };
    }

    const score = review?.score ?? 0;
    const passed = score >= qualityThreshold;
    const exceededLimit = iterations >= maxIterations;

    let nextStatus = 'RUNNING';
    let feedback = '';
    let logAction = '';

    if (passed) {
      nextStatus = 'PASSED';
      logAction = `审查通过（${(score * 100).toFixed(0)}分 ≥ ${(qualityThreshold * 100).toFixed(0)}分阈值）`;
    } else if (exceededLimit) {
      nextStatus = 'FALLBACK';
      feedback = review?.suggestions?.join('；') || '';
      logAction = `已达最大迭代 ${maxIterations} 次，带反馈兜底输出（${(score * 100).toFixed(0)}分）`;
    } else {
      feedback = review?.suggestions?.join('；') || '';
      logAction = `审查未通过（${(score * 100).toFixed(0)}分 < ${(qualityThreshold * 100).toFixed(0)}分），触发第 ${iterations} 轮改进`;
    }

    const logEntry: AgentStepLog = {
      node: 'reviewAndRefine',
      timestamp: new Date().toISOString(),
      action: logAction,
      reasoning: review?.reasoning || '',
      data: {
        score,
        hook_strength: review?.hook_strength,
        compliance_risk: review?.compliance_risk,
        style_match: review?.style_match,
        suggestions: review?.suggestions,
        passed,
        iterations,
        status: nextStatus,
      },
    };

    return {
      review_result: review as unknown as Record<string, unknown>,
      review_feedback: feedback,
      iterations,
      status: nextStatus,
      step_log: [...((state.step_log as Record<string, unknown>[]) || []), logEntry as unknown as Record<string, unknown>],
    };
  };
}

/**
 * 条件路由函数：根据审查结果决定下一步
 *
 * - PASSED  → 'matchAssets'
 * - FALLBACK → 'matchAssets'
 * - RUNNING  → 'generateScript'（继续迭代）
 */
export function routeAfterReview(state: Record<string, unknown>): string {
  const status = String(state.status || 'RUNNING');
  const validStatuses = ['RUNNING', 'PASSED', 'FALLBACK'];
  if (!validStatuses.includes(status)) {
    // 未知状态：安全兜底，避免无限循环
    return 'matchAssets';
  }
  if (status === 'PASSED' || status === 'FALLBACK') {
    return 'matchAssets';
  }
  return 'generateScript';
}
