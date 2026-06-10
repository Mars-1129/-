// =============================================================================
// TikStream AI — Multi-Agent Orchestrator Service
// NestJS 服务：依赖注入 + graph.invoke + 运行态管理
// =============================================================================

import { Injectable, Logger, HttpStatus, OnModuleDestroy } from '@nestjs/common';
import { serviceException } from '../../common/service-exception';
import { DoubaoTextProvider } from '../../../services/ai/doubao-text.provider';
import { ScriptQuickPromptBuilder } from '../../../services/prompts/script-quick.prompt';
import { ComplianceFilter } from '../../script/compliance.filter';
import { ScriptSchemaValidator } from '../../script/script-schema.validator';
import { ProductRepository } from '../../product/product.repository';
import { buildMultiAgentGraph } from './orchestrator.graph';
import { randomUUID } from 'node:crypto';

export interface MultiAgentGenerateInput {
  product_id: string;
  style_vibe?: string;
  language?: string;
  aspect_ratio?: string;
  constraint_list?: string[];
  preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
}

export interface MultiAgentGenerateOutput {
  run_id: string;
  status: 'FAILED' | 'COMPLETED';
  total_iterations: number;
  script_title: string;
  script_shots_count: number;
  compliance_passed: boolean;
  optimization_done: boolean;
  agent_traces: Array<{
    agent: string;
    action: string;
    reasoning: string;
    duration_ms: number;
    timestamp: string;
  }>;
  summary: string;
}

@Injectable()
export class MultiAgentOrchestratorService implements OnModuleDestroy {
  private readonly logger = new Logger(MultiAgentOrchestratorService.name);

  // In-memory 运行状态（MVP，后续可换 Redis）
  private activeRuns = new Map<string, MultiAgentGenerateOutput>();
  private ttlTimers = new Set<ReturnType<typeof setTimeout>>();
  private static readonly ACTIVE_RUNS_TTL_MS = 30 * 60 * 1000;
  private static readonly GRAPH_INVOKE_TIMEOUT_MS = 180_000; // 3 分钟，多 Agent 链路更长

  constructor(
    private readonly doubaoText: DoubaoTextProvider,
    private readonly promptBuilder: ScriptQuickPromptBuilder,
    private readonly complianceFilter: ComplianceFilter,
    private readonly schemaValidator: ScriptSchemaValidator,
    private readonly productRepository: ProductRepository,
  ) {}

  onModuleDestroy(): void {
    for (const id of this.ttlTimers) {
      clearTimeout(id);
    }
    this.ttlTimers.clear();
    this.logger.log('[MultiAgent] TTL timers cleared on destroy');
  }

  /**
   * 执行多 Agent 协作生成
   */
  async runMultiAgent(input: MultiAgentGenerateInput): Promise<MultiAgentGenerateOutput> {
    const runId = randomUUID();
    this.logger.log(`[MultiAgent] Run ${runId} started for product ${input.product_id}`);

    // 获取商品信息
    const product = await this.productRepository.findProductById(input.product_id);
    if (!product) {
      throw serviceException(
        { message: `商品 ${input.product_id} 不存在`, error: { code: 'PRODUCT_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    // 构建初始 state
    const initialState = {
      product_id: input.product_id,
      product_name: String(product.title || ''),
      style_vibe: input.style_vibe || '高转化 UGC',
      language: input.language || 'zh-CN',
      aspect_ratio: input.aspect_ratio || '9:16',
      constraint_list: input.constraint_list || [],
      preferences: input.preferences || [],
      selling_points: (product as Record<string, unknown>).selling_points as string[] || [],
      target_audience: (product as Record<string, unknown>).target_audience as string || '',
      agent_traces: [],
      retry_count: 0,
      optimize_count: 0,
    };

    try {
      const graph = buildMultiAgentGraph({
        copywriter: {
          doubaoText: this.doubaoText,
          promptBuilder: this.promptBuilder,
        },
        director: {
          schemaValidator: this.schemaValidator,
        },
        composer: {},
        compliance: {
          complianceFilter: this.complianceFilter,
          doubaoText: this.doubaoText,
        },
        optimizer: {},
      });

      const result = await Promise.race([
        graph.invoke(initialState) as Promise<Record<string, unknown>>,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`MultiAgent graph invoke timeout after ${MultiAgentOrchestratorService.GRAPH_INVOKE_TIMEOUT_MS}ms`)),
            MultiAgentOrchestratorService.GRAPH_INVOKE_TIMEOUT_MS,
          ),
        ),
      ]);

      const overallStatus = String(result.overall_status || 'FAILED');
      const traces = (result.agent_traces as Array<Record<string, unknown>> || []).map((t) => ({
        agent: String(t.agent || ''),
        action: String(t.action || ''),
        reasoning: String(t.reasoning || ''),
        duration_ms: Number(t.duration_ms) || 0,
        timestamp: String(t.timestamp || ''),
      }));

      const output: MultiAgentGenerateOutput = {
        run_id: runId,
        status: (overallStatus === 'FAILED' ? 'FAILED' : 'COMPLETED') as MultiAgentGenerateOutput['status'],
        total_iterations: traces.length,
        script_title: String(result.script_title || ''),
        script_shots_count: (result.script_shots as Array<unknown>)?.length || 0,
        compliance_passed: Boolean(result.compliance_passed),
        optimization_done: Boolean(result.optimization_done),
        agent_traces: traces,
        summary: this.buildSummary(result),
      };

      this.activeRuns.set(runId, output);
      const timeoutId = setTimeout(() => {
        this.activeRuns.delete(runId);
        this.ttlTimers.delete(timeoutId);
        this.logger.log(`[MultiAgent] Run ${runId} expired from active runs (TTL)`);
      }, MultiAgentOrchestratorService.ACTIVE_RUNS_TTL_MS);
      this.ttlTimers.add(timeoutId);

      this.logger.log(
        `[MultiAgent] Run ${runId} completed — status=${output.status}, agents=${traces.length}, shots=${output.script_shots_count}`,
      );

      return output;
    } catch (err) {
      this.logger.warn(`[MultiAgent] Run ${runId} failed, returning fallback: ${(err as Error)?.message || err}`);
      
      // 本地兜底：当 LangGraph 不可用时，返回一个带有失败状态的结果（而非 500）
      const fallbackOutput: MultiAgentGenerateOutput = {
        run_id: runId,
        status: 'FAILED',
        total_iterations: 0,
        script_title: String(product.title || ''),
        script_shots_count: 0,
        compliance_passed: false,
        optimization_done: false,
        agent_traces: [
          {
            agent: 'orchestrator',
            action: 'FALLBACK',
            reasoning: `AI 模型不可用或超时: ${(err as Error)?.message || 'unknown error'}`,
            duration_ms: 0,
            timestamp: new Date().toISOString(),
          },
        ],
        summary: `多 Agent 协作因 AI 服务不可用而回退。商品: ${product.title}。请在配置有效的 API Key 后重试。`,
      };

      this.activeRuns.set(runId, fallbackOutput);
      const timeoutId = setTimeout(() => {
        this.activeRuns.delete(runId);
        this.ttlTimers.delete(timeoutId);
      }, MultiAgentOrchestratorService.ACTIVE_RUNS_TTL_MS);
      this.ttlTimers.add(timeoutId);

      return fallbackOutput;
    }
  }

  /**
   * 查询运行状态
   */
  getRunStatus(runId: string): MultiAgentGenerateOutput | null {
    return this.activeRuns.get(runId) || null;
  }

  /**
   * 构建人类可读的协作摘要
   */
  private buildSummary(state: Record<string, unknown>): string {
    const parts: string[] = [];
    const traces = (state.agent_traces as Array<Record<string, unknown>>) || [];

    for (const trace of traces) {
      const agent = trace.agent as string;
      const action = trace.action as string;
      parts.push(`[${agent}] ${action}`);
    }

    const compliancePassed = Boolean(state.compliance_passed);
    const optimizationDone = Boolean(state.optimization_done);
    const retryCount = Number(state.retry_count || 0);

    if (compliancePassed) {
      parts.push('合规检查通过');
    } else if (retryCount > 0) {
      parts.push(`合规重试 ${retryCount} 次`);
    }
    if (optimizationDone) {
      parts.push('效果优化完成');
    }

    return parts.join(' → ');
  }
}
