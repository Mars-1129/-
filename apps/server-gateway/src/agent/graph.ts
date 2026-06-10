// =============================================================================
// TikStream AI — Agent Graph 构建器
// 用 LangGraph StateGraph 构建视频创作 Agent 的有向图
// =============================================================================

import { StateGraph, START, END } from '@langchain/langgraph';
import { VideoCreationStateSchema } from './state';
import { createUnderstandProductNode } from './nodes/understand-product.node';
import { createGenerateScriptNode } from './nodes/generate-script.node';
import { createReviewAndRefineNode, routeAfterReview } from './nodes/review-refine.node';
import { createMatchAssetsNode } from './nodes/match-assets.node';
import { createCreateVideoNode } from './nodes/create-video.node';
import { createQualityCheckNode } from './nodes/quality-check.node';
import { createFinalizeNode } from './nodes/finalize.node';
import type { DoubaoChatModel } from '../../services/ai/doubao-chat-model';
import type { ScriptQuickPromptBuilder } from '../../services/prompts/script-quick.prompt';
import type { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import type { ComplianceFilter } from '../script/compliance.filter';
import type { ScriptRepository } from '../script/script.repository';
import type { ScriptSchemaValidator } from '../script/script-schema.validator';
import type { MaterialService } from '../material/material.service';
import type { CreationService } from '../creation/creation.service';

export interface AgentGraphDeps {
  llm: DoubaoChatModel;
  promptBuilder: ScriptQuickPromptBuilder;
  doubaoText: DoubaoTextProvider;
  complianceFilter: ComplianceFilter;
  scriptRepository: ScriptRepository;
  schemaValidator: ScriptSchemaValidator;
  materialService?: MaterialService;
  creationService?: CreationService;
}

/**
 * 构建视频创作 Agent 图
 *
 * 图结构 (7 节点)：
 *   START → understandProduct → generateScript → reviewAndRefine
 *                                                      ├── PASSED/FALLBACK → matchAssets → createVideo → qualityCheck → finalize → END
 *                                                      └── RUNNING → generateScript（循环）
 */
export function buildVideoCreationGraph(deps: AgentGraphDeps) {
  const understandNode = createUnderstandProductNode(deps.llm);
  const generateNode = createGenerateScriptNode(deps.promptBuilder, deps.doubaoText);
  const reviewNode = createReviewAndRefineNode(deps.llm);
  const matchAssetsNode = createMatchAssetsNode({
    materialService: deps.materialService as any,
  });
  const createVideoNode = createCreateVideoNode({
    creationService: deps.creationService as any,
  });
  const qualityCheckNode = createQualityCheckNode({
    creationService: deps.creationService as any,
  });
  const finalizeNode = createFinalizeNode(
    deps.complianceFilter,
    deps.scriptRepository,
    deps.schemaValidator,
    deps.doubaoText,
  );

  const graph = new StateGraph(VideoCreationStateSchema)
    .addNode('understandProduct', understandNode)
    .addNode('generateScript', generateNode)
    .addNode('reviewAndRefine', reviewNode)
    .addNode('matchAssets', matchAssetsNode)
    .addNode('createVideo', createVideoNode)
    .addNode('qualityCheck', qualityCheckNode)
    .addNode('finalize', finalizeNode)

    // 固定边
    .addEdge(START, 'understandProduct')
    .addEdge('understandProduct', 'generateScript')
    .addEdge('generateScript', 'reviewAndRefine')

    // 条件边：审查后决定是迭代还是继续
    .addConditionalEdges('reviewAndRefine', routeAfterReview, {
      generateScript: 'generateScript',
      matchAssets: 'matchAssets',
    })

    .addEdge('matchAssets', 'createVideo')
    .addEdge('createVideo', 'qualityCheck')
    .addEdge('qualityCheck', 'finalize')
    .addEdge('finalize', END)

    .compile();

  return graph;
}
