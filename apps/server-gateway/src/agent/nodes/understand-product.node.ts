// =============================================================================
// TikStream AI — Agent Node: 商品理解
// 对商品卖点、受众、场景进行 AI 拆解，为剧本生成提供结构化上下文
// =============================================================================

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { DoubaoChatModel } from '../../../services/ai/doubao-chat-model';
import type { AgentStepLog } from '../state';

const UNDERSTAND_SYSTEM_PROMPT = `你是一位资深的 TikTok Shop 商品分析专家。
你的任务是对给定商品进行结构化拆解，输出 JSON。

要求：
1. core_selling_point: 用一句有冲击力的文案概括核心卖点（中文，20字以内）
2. audience_profile: 目标受众精准画像（年龄、性别、兴趣、消费力）
3. use_scenarios: 3-5 个真实使用场景
4. tone_keywords: 5-8 个品牌调性关键词
5. differentiation: 与同类产品的差异化优势

严格输出 JSON，不要包含 markdown 标记。`;

/**
 * understandProduct 节点
 *
 * 调用豆包 LLM 对商品进行深度理解，生成结构化商品画像。
 * 结果写入 state.product_understanding 和 state.selling_points。
 */
export function createUnderstandProductNode(llm: DoubaoChatModel) {
  return async function understandProduct(state: Record<string, unknown>): Promise<Partial<Record<string, unknown>>> {
    const productName = String(state.product_name || '未知商品');
    const existingPoints = (state.selling_points as string[]) || [];
    const targetAudience = String(state.target_audience || '');
    const constraintList = (state.constraint_list as string[]) || [];

    const userContent = [
      `商品名称：${productName}`,
      existingPoints.length > 0 ? `已知卖点：${existingPoints.join('、')}` : '',
      targetAudience ? `已知受众：${targetAudience}` : '',
      constraintList.length > 0 ? `约束条件：${constraintList.join('；')}` : '',
      '请对此商品进行结构化拆解。',
    ]
      .filter(Boolean)
      .join('\n');

    const messages = [new SystemMessage(UNDERSTAND_SYSTEM_PROMPT), new HumanMessage(userContent)];

    let understanding: Record<string, unknown> | null = null;
    try {
      const raw = await llm.invoke(messages);
      const text = typeof raw === 'string' ? raw : String(raw);
      // 清理 markdown 标记
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      understanding = JSON.parse(cleaned);
    } catch {
      // LLM 解析失败时使用启发式回退
      understanding = {
        core_selling_point: existingPoints[0] || productName,
        audience_profile: targetAudience || '广泛受众',
        use_scenarios: ['日常使用', '送礼推荐'],
        tone_keywords: ['专业', '性价比', '实用'],
        differentiation: '品质可靠',
      };
    }

    // 提取卖点（合并已知 + AI 推断）
    const aiPoints: string[] = [];
    if (understanding) {
      const cp = understanding.core_selling_point as string | undefined;
      if (cp) aiPoints.push(cp);
      const diff = understanding.differentiation as string | undefined;
      if (diff) aiPoints.push(diff);
    }
    const mergedPoints = [...new Set([...existingPoints, ...aiPoints])];

    const newAudience =
      targetAudience ||
      ((understanding?.audience_profile as string) || '');

    const logEntry: AgentStepLog = {
      node: 'understandProduct',
      timestamp: new Date().toISOString(),
      action: '商品结构化拆解',
      reasoning: `提取卖点 ${aiPoints.length} 条，受众画像：${newAudience || '未识别'}`,
      data: { selling_points: mergedPoints, audience: newAudience },
    };

    return {
      product_understanding: understanding,
      selling_points: mergedPoints,
      target_audience: newAudience,
      step_log: [...((state.step_log as Record<string, unknown>[]) || []), logEntry as unknown as Record<string, unknown>],
    };
  };
}
