// =============================================================================
// TikStream AI — Auto A/B Graph 单元测试
// 覆盖：routeAfterPoll / routeOnError / buildAutoAbGraph 条件边完整性
// =============================================================================

import { StateGraph, START, END, StateSchema } from '@langchain/langgraph';
import { z } from 'zod/v4';
import { routeAfterPoll, buildAutoAbGraph, AutoAbGraphDeps } from './graph';
import { AutoAbStateSchema } from './state';

// =============================================================================
// routeAfterPoll — 纯函数单元测试
// =============================================================================

describe('routeAfterPoll', () => {
  it('status === FAILED 时返回 "FAILED"（无论 all_completed 为何值）', () => {
    // all_completed = true
    expect(routeAfterPoll({ status: 'FAILED', all_completed: true })).toBe('FAILED');
    // all_completed = false
    expect(routeAfterPoll({ status: 'FAILED', all_completed: false })).toBe('FAILED');
    // all_completed = undefined (falsy)
    expect(routeAfterPoll({ status: 'FAILED' })).toBe('FAILED');
  });

  it('status !== FAILED 且 all_completed === true → "compareAndAnalyze"', () => {
    expect(routeAfterPoll({ status: 'RUNNING', all_completed: true })).toBe('compareAndAnalyze');
    expect(routeAfterPoll({ status: 'COMPLETED', all_completed: true })).toBe('compareAndAnalyze');
    expect(routeAfterPoll({ status: undefined as any, all_completed: true })).toBe('compareAndAnalyze');
  });

  it('status !== FAILED 且 all_completed !== true → "waitForCompletion"', () => {
    expect(routeAfterPoll({ status: 'RUNNING', all_completed: false })).toBe('waitForCompletion');
    expect(routeAfterPoll({ status: 'RUNNING' })).toBe('waitForCompletion');
    expect(routeAfterPoll({ status: 'RUNNING', all_completed: undefined as any })).toBe('waitForCompletion');
    expect(routeAfterPoll({ status: 'RUNNING', all_completed: null as any })).toBe('waitForCompletion');
    expect(routeAfterPoll({ status: 'RUNNING', all_completed: 0 as any })).toBe('waitForCompletion');
  });

  it('状态空对象时安全兜底 → "waitForCompletion"', () => {
    expect(routeAfterPoll({})).toBe('waitForCompletion');
  });
});

// =============================================================================
// 条件边映射完整性测试 — 确保 routeAfterPoll 的所有返回值都在 mapping 中
// =============================================================================

describe('buildAutoAbGraph 条件边映射完整性', () => {
  it('routeAfterPoll 的所有可能返回值都在 mapping 中有对应', () => {
    // 收集 routeAfterPoll 所有可能的返回值
    const returnValues = new Set<string>();
    returnValues.add(routeAfterPoll({ status: 'FAILED', all_completed: true }));
    returnValues.add(routeAfterPoll({ status: 'FAILED', all_completed: false }));
    returnValues.add(routeAfterPoll({ status: 'RUNNING', all_completed: true }));
    returnValues.add(routeAfterPoll({ status: 'RUNNING', all_completed: false }));
    returnValues.add(routeAfterPoll({}));

    // 预期的 mapping keys
    const expectedMappingKeys = ['waitForCompletion', 'compareAndAnalyze', 'FAILED'];

    for (const rv of returnValues) {
      expect(expectedMappingKeys).toContain(rv);
    }

    // 反向检查：mapping 中的 key 不能包含 LangGraph 内部特殊值
    expect(expectedMappingKeys).not.toContain('__end__');
    expect(expectedMappingKeys).not.toContain('__continue__');
  });

  it('buildAutoAbGraph 不抛异常', () => {
    const mockDeps = {
      llm: { invoke: jest.fn().mockResolvedValue('') } as any,
      scriptService: {} as any,
      creationService: {} as any,
      analyticsService: {} as any,
      autoAbService: {
        createSession: jest.fn().mockResolvedValue({ session_id: 's1', status: 'PENDING', variant_count: 3, created_at: new Date().toISOString() }),
        completeSession: jest.fn().mockResolvedValue(undefined),
      } as any,
      generateScriptVariant: jest.fn().mockResolvedValue({ script_id: 'script-1' }),
    };

    const graph = buildAutoAbGraph(mockDeps);
    expect(graph).toBeDefined();
  });
});

// =============================================================================
// Graph 节点执行模拟测试 — 模拟 FAILED 状态传播
// =============================================================================

describe('Graph FAILED 状态路由', () => {
  it('waitForCompletion → FAILED 路由到 END（通过条件边映射）', () => {
    // 这个测试验证：当 waitForCompletion 后状态为 FAILED 时，
    // routeAfterPoll 返回的值能在 mapping 中找到对应的目标
    const state = {
      status: 'FAILED',
      all_completed: true,
      creation_ids: [],
      poll_attempts: 0,
    };
    const destination = routeAfterPoll(state);
    // 必须在 mapping 的 key 中
    expect(destination).toBe('FAILED');
  });
});

// =============================================================================
// 真实 LangGraph 图执行测试 — 验证 FAILED 路由不抛异常
// =============================================================================

describe('真实图执行：FAILED 状态应安全路由到 END', () => {
  it('routeAfterPoll 返回 FAILED 时，LangGraph 不抛 Branch condition 错误', async () => {
    // 构建一个与真实图结构相同的最小图
    const testSchema = new StateSchema({
      status: z.enum(['RUNNING', 'COMPLETED', 'FAILED']).default('RUNNING'),
      all_completed: z.boolean().default(false),
    });

    const graph = new StateGraph(testSchema)
      // 模拟 waitForCompletion 节点：直接设置状态
      .addNode('waitForCompletion', async (state: any) => ({
        status: 'FAILED',
        all_completed: true,
      }))
      // 模拟 compareAndAnalyze 节点
      .addNode('compareAndAnalyze', async () => ({
        status: 'COMPLETED',
      }))
      // 模拟 completeSession 节点
      .addNode('completeSession', async () => ({}))
      // 固定边
      .addEdge(START, 'waitForCompletion')
      .addEdge('compareAndAnalyze', 'completeSession')
      .addEdge('completeSession', END)
      // 条件边：与真实图完全相同
      .addConditionalEdges('waitForCompletion', routeAfterPoll, {
        waitForCompletion: 'waitForCompletion',
        compareAndAnalyze: 'compareAndAnalyze',
        FAILED: END,
      })
      .compile();

    // 执行图：不应抛异常
    const result = await graph.invoke({});
    expect(result).toBeDefined();
    expect(result.status).toBe('FAILED');
  });
});
