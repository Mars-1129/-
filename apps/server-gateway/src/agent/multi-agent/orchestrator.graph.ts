// =============================================================================
// TikStream AI — Multi-Agent Orchestrator Graph
// 层级协调者：编排 5 个专项 Agent 的顺序执行与条件路由
// =============================================================================

import { StateGraph, START, END } from '@langchain/langgraph';
import { MultiAgentStateSchema } from './multi-agent.state';
import { createCopywriterAgent, type CopywriterAgentDeps } from './agents/copywriter.agent';
import { createDirectorAgent, type DirectorAgentDeps } from './agents/director.agent';
import { createComposerAgent, type ComposerAgentDeps } from './agents/composer.agent';
import { createComplianceAgent, type ComplianceAgentDeps } from './agents/compliance.agent';
import { createOptimizerAgent, type OptimizerAgentDeps } from './agents/optimizer.agent';

export interface MultiAgentGraphDeps {
  copywriter: CopywriterAgentDeps;
  director: DirectorAgentDeps;
  composer?: ComposerAgentDeps;
  compliance: ComplianceAgentDeps;
  optimizer?: OptimizerAgentDeps;
}

/**
 * 全局路由决策函数
 *
 * 根据 current_agent 和 overall_status 决定下一步：
 *   copywriter 完成后 → 总是进入 director（文案→导演顺序）
 *   director 完成后 → 若 approved → composer；否则回 copywriter
 *   composer 完成后 → 总是进入 compliance
 *   compliance 完成后 → 若 passed → optimizer；若 retry → copywriter；否则 END
 *   optimizer 完成后 → 若 OPTIMIZE_RETRY → copywriter；否则 END
 */
function routeOrchestrator(state: Record<string, unknown>): string {
  const currentAgent = state.current_agent as string;
  const overallStatus = state.overall_status as string;
  const directorApproved = state.director_approved as boolean;

  const validAgents = ['copywriter', 'director', 'composer', 'compliance', 'optimizer'];
  if (!validAgents.includes(currentAgent)) {
    console.error(`[routeOrchestrator] 未知 current_agent: "${currentAgent}"，终止路由`);
    return END;
  }

  if (overallStatus === 'FAILED') {
    return END;
  }

  switch (currentAgent) {
    case 'copywriter':
      return directorApproved == null || directorApproved === false
        ? 'director'
        : 'composer';
    case 'director':
      return directorApproved ? 'composer' : 'copywriter';
    case 'composer':
      return 'compliance';
    case 'compliance':
      if (overallStatus === 'COMPLIANCE_RETRY') return 'copywriter';
      return 'optimizer';
    case 'optimizer':
      if (overallStatus === 'OPTIMIZE_RETRY') return 'copywriter';
      return END;
    default:
      return END;
  }
}

/**
 * 构建多 Agent 协作图
 *
 * 图结构（5 Agent + Orchestrator）：
 *   START → copywriter → director → composer → compliance → optimizer → END
 *                              ↑          ↓            ↓  (COMPLIANCE_RETRY)    ↑ (OPTIMIZE_RETRY)
 *                              └──────────┘            └──────────────────────→ copywriter
 *
 * 层级协调：Orchestrator（全局路由）→ 各 Agent 顺序执行 + 条件回退
 */
export function buildMultiAgentGraph(deps: MultiAgentGraphDeps) {
  const copywriterNode = createCopywriterAgent(deps.copywriter);
  const directorNode = createDirectorAgent(deps.director);
  const composerNode = createComposerAgent(deps.composer);
  const complianceNode = createComplianceAgent(deps.compliance);
  const optimizerNode = createOptimizerAgent(deps.optimizer ?? {});

  const graph = new StateGraph(MultiAgentStateSchema)
    .addNode('copywriter', copywriterNode)
    .addNode('director', directorNode)
    .addNode('composer', composerNode)
    .addNode('compliance', complianceNode)
    .addNode('optimizer', optimizerNode)

    // 入口：从 START 进入 copywriter
    .addEdge(START, 'copywriter')

    // 每个 Agent 完成后由 Orchestrator 路由
    .addConditionalEdges('copywriter', routeOrchestrator, {
      director: 'director',
      composer: 'composer',
      [END]: END,
    })

    .addConditionalEdges('director', routeOrchestrator, {
      composer: 'composer',
      copywriter: 'copywriter',
      [END]: END,
    })

    .addConditionalEdges('composer', routeOrchestrator, {
      compliance: 'compliance',
      [END]: END,
    })

    .addConditionalEdges('compliance', routeOrchestrator, {
      copywriter: 'copywriter',
      optimizer: 'optimizer',
      [END]: END,
    })

    .addConditionalEdges('optimizer', routeOrchestrator, {
      copywriter: 'copywriter',
      [END]: END,
    })

    .compile();

  return graph;
}
