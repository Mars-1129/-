// =============================================================================
// TikStream AI — Auto A/B Agent Graph 构建器
// LangGraph StateGraph：自动多版本生成 → 创作 → 对比分析
//
// 图结构 (6 节点)：
//   START → startSession → generateVariants → createCreations → waitForCompletion
//                                                                    └── not done → waitForCompletion（循环轮询）
//                                                                    └── done → compareAndAnalyze → completeSession → END
// =============================================================================

import { StateGraph, START, END } from '@langchain/langgraph';
import { AutoAbStateSchema } from './state';
import type { DoubaoChatModel } from '../../services/ai/doubao-chat-model';
import type { ScriptService } from '../script/script.service';
import type { CreationService } from '../creation/creation.service';
import type { AnalyticsService } from '../analytics/analytics.service';
import type { AutoAbService } from '../analytics/auto-ab.service';

export interface AutoAbGraphDeps {
  llm: DoubaoChatModel;
  scriptService: ScriptService;
  creationService: CreationService;
  analyticsService: AnalyticsService;
  autoAbService: AutoAbService;
  /** 基于原始脚本生成风格变体新剧本 */
  generateScriptVariant: (scriptId: string, styleVibe: string, label: string) => Promise<{ script_id: string }>;
}

// =============================================================================
// Node 1: startSession — 创建 A/B 会话记录
// =============================================================================
function createStartSessionNode(autoAbService: AutoAbService) {
  return async (state: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const stepLog = [...(state.step_log as Array<Record<string, unknown>> || [])];

    try {
      const session = await autoAbService.createSession({
        script_id: state.base_script_id as string,
        style_variants: state.style_variants as Array<{ label: string; style_vibe: string }>,
      });

      stepLog.push({
        node: 'startSession',
        timestamp: now,
        action: 'A/B 会话已创建',
        reasoning: `创建 ${((state.style_variants as Array<unknown>) || []).length} 个风格变体配置`,
        data: { session_id: (session as Record<string, unknown>).session_id },
      });

      return {
        session_id: (session as Record<string, unknown>).session_id as string,
        progress: 5,
        step_log: stepLog,
      };
    } catch (err) {
      return {
        status: 'FAILED' as const,
        error_message: `创建会话失败: ${String(err)}`,
        step_log: [...stepLog, { node: 'startSession', timestamp: now, action: '失败', reasoning: String(err) }],
      };
    }
  };
}

// =============================================================================
// Node 2: generateVariants — 调用 ScriptService 生成风格变体剧本
// =============================================================================
function createGenerateVariantsNode(deps: AutoAbGraphDeps) {
  return async (state: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const stepLog = [...(state.step_log as Array<Record<string, unknown>> || [])];
    const variants = (state.style_variants as Array<{ label: string; style_vibe: string }>) || [];

    try {
      const variantIds: string[] = [];
      const labels: string[] = [];

      for (const v of variants) {
        stepLog.push({
          node: 'generateVariants',
          timestamp: new Date().toISOString(),
          action: `生成变体: ${v.label}`,
          reasoning: `风格调性: ${v.style_vibe}`,
        });

        const script = await deps.generateScriptVariant(
          state.base_script_id as string,
          v.style_vibe,
          v.label,
        );

        variantIds.push(script.script_id);
        labels.push(v.label);
      }

      stepLog.push({
        node: 'generateVariants',
        timestamp: new Date().toISOString(),
        action: `${variantIds.length} 个变体剧本已生成`,
        reasoning: '使用 regeneratePrompt 基于原剧本生成不同风格变体',
        data: { variant_script_ids: variantIds },
      });

      return {
        variant_script_ids: variantIds,
        variant_labels: labels,
        progress: 20,
        step_log: stepLog,
      };
    } catch (err) {
      return {
        status: 'FAILED' as const,
        error_message: `生成变体失败: ${String(err)}`,
        step_log: [...stepLog, { node: 'generateVariants', timestamp: now, action: '失败', reasoning: String(err) }],
      };
    }
  };
}

// =============================================================================
// Node 3: createCreations — 为每个变体创建创作任务
// =============================================================================
function createCreationsNode(creationService: CreationService) {
  return async (state: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const stepLog = [...(state.step_log as Array<Record<string, unknown>> || [])];
    const variantIds = (state.variant_script_ids as string[]) || [];
    const labels = (state.variant_labels as string[]) || [];
    const productId = state.product_id as string;

    try {
      const creationIds: string[] = [];

      for (let i = 0; i < variantIds.length; i++) {
        const scriptId = variantIds[i];
        const label = labels[i] || `变体 ${i + 1}`;

        stepLog.push({
          node: 'createCreations',
          timestamp: new Date().toISOString(),
          action: `创建创作: ${label}`,
          reasoning: `为剧本 ${scriptId.slice(0, 8)}... 创建视频创作任务`,
        });

        const result = await creationService.createCreation({
          product_id: productId,
          script_id: scriptId,
          engine_mode: 'SCRIPT_DRIVEN' as const,
        });

        creationIds.push(result.creation_id);
      }

      stepLog.push({
        node: 'createCreations',
        timestamp: new Date().toISOString(),
        action: `${creationIds.length} 个创作任务已创建`,
        reasoning: '进入轮询等待阶段',
        data: { creation_ids: creationIds },
      });

      return {
        creation_ids: creationIds,
        progress: 30,
        step_log: stepLog,
      };
    } catch (err) {
      return {
        status: 'FAILED' as const,
        error_message: `创建创作任务失败: ${String(err)}`,
        step_log: [...stepLog, { node: 'createCreations', timestamp: now, action: '失败', reasoning: String(err) }],
      };
    }
  };
}

// =============================================================================
// Node 4: waitForCompletion — 轮询等待所有创作完成
// =============================================================================
function createWaitForCompletionNode(creationService: CreationService) {
  return async (state: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const stepLog = [...(state.step_log as Array<Record<string, unknown>> || [])];
    const creationIds = (state.creation_ids as string[]) || [];
    const pollAttempts = (state.poll_attempts as number) || 0;
    const maxAttempts = (state.max_poll_attempts as number) || 60;

    try {
      // 并行查询所有创作状态（消除串行网络 I/O 瓶颈）
      const details = await Promise.all(creationIds.map((cid) => creationService.getCreationDetail(cid)));

      let allFinished = true;
      let failedCount = 0;

      for (const detail of details) {
        const s = detail.status;
        if (s === 'FAILED' || s === 'CANCELED') {
          failedCount++;
        } else if (s !== 'FINISHED') {
          allFinished = false;
        }
      }

      const nextAttempt = pollAttempts + 1;

      if (allFinished || failedCount === creationIds.length) {
        stepLog.push({
          node: 'waitForCompletion',
          timestamp: now,
          action: '所有创作已完成',
          reasoning: `经过 ${nextAttempt} 次轮询，${creationIds.length - failedCount} 个成功，${failedCount} 个失败`,
        });
        return {
          all_completed: true,
          poll_attempts: nextAttempt,
          progress: 60,
          step_log: stepLog,
        };
      }

      if (nextAttempt >= maxAttempts) {
        return {
          status: 'FAILED' as const,
          all_completed: false,
          poll_attempts: nextAttempt,
          error_message: `轮询超时: ${nextAttempt} 次轮询后仍未完成所有创作`,
          step_log: [...stepLog, {
            node: 'waitForCompletion',
            timestamp: now,
            action: '轮询超时',
            reasoning: `已尝试 ${nextAttempt} 次，部分创作仍在处理中`,
          }],
        };
      }

      // 自适应轮询间隔：随次数递增（首次快检，后续降低频率）
      const waitMs = nextAttempt <= 1 ? 2000 : nextAttempt <= 2 ? 3000 : nextAttempt <= 4 ? 5000 : 8000;
      await new Promise((r) => setTimeout(r, waitMs));

      const progress = 30 + (nextAttempt / maxAttempts) * 30;

      return {
        all_completed: false,
        poll_attempts: nextAttempt,
        progress: Math.min(progress, 60),
        step_log: stepLog,
      };
    } catch (err) {
      return {
        status: 'FAILED' as const,
        error_message: `轮询失败: ${String(err)}`,
        step_log: [...stepLog, { node: 'waitForCompletion', timestamp: now, action: '失败', reasoning: String(err) }],
      };
    }
  };
}

/**
 * 条件路由：轮询是否完成
 */
export function routeAfterPoll(state: Record<string, unknown>): string {
  const allCompleted = state.all_completed === true;
  const status = state.status as string;

  if (status === 'FAILED') return 'FAILED';

  // 未完成 → 继续轮询；已完成 → 进入对比
  return allCompleted ? 'compareAndAnalyze' : 'waitForCompletion';
}

/**
 * 条件路由：是否失败
 */
function routeOnError(state: Record<string, unknown>): string {
  return state.status === 'FAILED' ? '__end__' : '__continue__';
}

// =============================================================================
// Node 5: compareAndAnalyze — 多版本对比 + AI 洞察
// =============================================================================
function createCompareAndAnalyzeNode(analyticsService: AnalyticsService, llm: DoubaoChatModel) {
  return async (state: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const stepLog = [...(state.step_log as Array<Record<string, unknown>> || [])];
    const productId = state.product_id as string;
    const creationIds = (state.creation_ids as string[]) || [];
    const labels = (state.variant_labels as string[]) || [];

    try {
      stepLog.push({
        node: 'compareAndAnalyze',
        timestamp: now,
        action: '开始多版本对比分析',
        reasoning: `${creationIds.length} 个版本进行两两对比`,
      });

      // 调用 compareMultiple（AnalyticsService 已有此方法）
      const report = await analyticsService.compareMultiple(productId, creationIds, labels);

      // 防止 compareMultiple 返回 null/undefined 导致深层属性访问崩溃
      if (!report) {
        stepLog.push({
          node: 'compareAndAnalyze',
          timestamp: now,
          action: '对比分析失败',
          reasoning: 'compareMultiple 返回了空结果',
        });
        return {
          status: 'FAILED' as const,
          error_message: '多版本对比分析返回空结果',
          step_log: stepLog,
        };
      }

      const pairwiseResults = (report.pairwise_results as Array<Record<string, unknown>>) || [];
      const winner = report.winner as Record<string, unknown>;
      const rankings = (report.rankings as Array<Record<string, unknown>>) || [];

      // AI 生成洞察文本
      const insights = await generateAiInsights(llm, {
        product_id: productId,
        labels,
        winner: winner?.label as string,
        rankings,
        pairwise_count: pairwiseResults.length,
      });

      stepLog.push({
        node: 'compareAndAnalyze',
        timestamp: new Date().toISOString(),
        action: `对比完成 — 优胜: ${winner?.label || '未知'}`,
        reasoning: insights[0] || '多版本对比分析已生成',
        data: { winner, rankings },
      });

      return {
        pairwise_results: pairwiseResults,
        winner_creation_id: (winner?.creation_id as string) || '',
        winner_label: (winner?.label as string) || '',
        winner_score: (winner?.score as number) || 0,
        rankings,
        insights,
        progress: 90,
        step_log: stepLog,
      };
    } catch (err) {
      return {
        status: 'FAILED' as const,
        error_message: `对比分析失败: ${String(err)}`,
        step_log: [...stepLog, { node: 'compareAndAnalyze', timestamp: now, action: '失败', reasoning: String(err) }],
      };
    }
  };
}

/**
 * 使用 LLM 生成对比洞察文本
 */
async function generateAiInsights(
  llm: DoubaoChatModel,
  context: {
    product_id: string;
    labels: string[];
    winner: string;
    rankings: Array<Record<string, unknown>>;
    pairwise_count: number;
  },
): Promise<string[]> {
  try {
    const systemPrompt = `你是电商视频A/B测试分析专家。请根据多版本对比结果生成3-5条简洁的洞察。`;
    const userPrompt = [
      `商品: ${context.product_id}`,
      `变体风格: ${context.labels.join(', ')}`,
      `两两对比次数: ${context.pairwise_count}`,
      `优胜版本: ${context.winner}`,
      `排名: ${JSON.stringify(context.rankings)}`,
      '',
      '请生成 3-5 条洞察，每条不超过 30 字，分析为何优胜版本胜出。',
    ].join('\n');

    const result = await llm.invoke([systemPrompt, userPrompt]);
    const text = typeof result === 'string' ? result : (result as { content: string }).content || '';

    // 按行分割，过滤空行
    return text
      .split('\n')
      .map((l) => l.replace(/^\d+\.\s*/, '').trim())
      .filter((l) => l.length > 0)
      .slice(0, 5);
  } catch {
    return [
      `"${context.winner}" 风格在各维度综合表现最优`,
      'Hook 强度 + 留存率是两个关键区分指标',
      `基于 ${context.pairwise_count} 组两两对比得出`,
    ];
  }
}

// =============================================================================
// Node 6: completeSession — 完成会话并持久化结果
// =============================================================================
function createCompleteSessionNode(autoAbService: AutoAbService) {
  return async (state: Record<string, unknown>) => {
    const now = new Date().toISOString();
    const stepLog = [...(state.step_log as Array<Record<string, unknown>> || [])];

    try {
      const resultJson = {
        product_id: state.product_id,
        base_script_id: state.base_script_id,
        variant_labels: state.variant_labels,
        variant_script_ids: state.variant_script_ids,
        creation_ids: state.creation_ids,
        winner_creation_id: state.winner_creation_id,
        winner_label: state.winner_label,
        winner_score: state.winner_score,
        rankings: state.rankings,
        insights: state.insights,
        pairwise_results_count: ((state.pairwise_results as Array<unknown>) || []).length,
        total_poll_attempts: state.poll_attempts,
      };

      await autoAbService.completeSession(state.session_id as string, resultJson as any);

      stepLog.push({
        node: 'completeSession',
        timestamp: now,
        action: '会话已完成',
        reasoning: '结果已持久化到 AutoAbSession',
      });

      return {
        status: 'COMPLETED' as const,
        progress: 100,
        step_log: stepLog,
      };
    } catch (err) {
      return {
        status: 'FAILED' as const,
        error_message: `完成会话失败: ${String(err)}`,
        step_log: [...stepLog, { node: 'completeSession', timestamp: now, action: '失败', reasoning: String(err) }],
      };
    }
  };
}

// =============================================================================
// Graph 构建入口
// =============================================================================
export function buildAutoAbGraph(deps: AutoAbGraphDeps) {
  console.log('[AB-GRAPH] buildAutoAbGraph called, END =', END, 'typeof END =', typeof END);
  console.log('[AB-GRAPH] routeAfterPoll FAILED branch returns:', routeAfterPoll({ status: 'FAILED', all_completed: true }));
  const startSession = createStartSessionNode(deps.autoAbService);
  const generateVariants = createGenerateVariantsNode(deps);
  const createCreations = createCreationsNode(deps.creationService);
  const waitForCompletion = createWaitForCompletionNode(deps.creationService);
  const compareAndAnalyze = createCompareAndAnalyzeNode(deps.analyticsService, deps.llm);
  const completeSession = createCompleteSessionNode(deps.autoAbService);

  const graph = new StateGraph(AutoAbStateSchema)
    .addNode('startSession', startSession)
    .addNode('generateVariants', generateVariants)
    .addNode('createCreations', createCreations)
    .addNode('waitForCompletion', waitForCompletion)
    .addNode('compareAndAnalyze', compareAndAnalyze)
    .addNode('completeSession', completeSession)

    // 固定边
    .addEdge(START, 'startSession')
    .addEdge('startSession', 'generateVariants')
    .addEdge('generateVariants', 'createCreations')
    .addEdge('createCreations', 'waitForCompletion')

    // 条件边：轮询循环
    .addConditionalEdges('waitForCompletion', routeAfterPoll, {
      waitForCompletion: 'waitForCompletion',
      compareAndAnalyze: 'compareAndAnalyze',
      FAILED: END,
    })

    .addEdge('compareAndAnalyze', 'completeSession')
    .addEdge('completeSession', END)

    .compile();

  return graph;
}
