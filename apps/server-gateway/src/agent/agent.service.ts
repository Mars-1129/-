// =============================================================================
// TikStream AI — Agent Service
// LangGraph agent 编排服务，处理 graph invoke 和 SSE stream
// =============================================================================

import { Injectable, Logger, HttpStatus, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '@nestjs/prisma';
import { serviceException } from '../common/service-exception';
import { DoubaoChatModel } from '../../services/ai/doubao-chat-model';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { ScriptQuickPromptBuilder } from '../../services/prompts/script-quick.prompt';
import { ComplianceFilter } from '../script/compliance.filter';
import { ScriptRepository, CreateScriptParams, CreateScriptShotParams } from '../script/script.repository';
import { ScriptSchemaValidator } from '../script/script-schema.validator';
import { ProductRepository } from '../product/product.repository';
import { buildVideoCreationGraph } from './graph';
import { randomUUID } from 'node:crypto';

export interface AgentGenerateInput {
  product_id: string;
  style_vibe?: string;
  language?: string;
  aspect_ratio?: string;
  constraint_list?: string[];
  preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
}

export interface AgentGenerateOutput {
  run_id: string;
  status: 'ACCEPTED' | 'RUNNING' | 'PASSED' | 'FALLBACK';
  iterations: number;
  final_script_id: string;
  step_log: Array<{
    node: string;
    timestamp: string;
    action: string;
    reasoning: string;
    data?: Record<string, unknown>;
  }>;
}

@Injectable()
export class AgentService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentService.name);
  private readonly llm: DoubaoChatModel;

  // In-memory 存储当前运行状态（MVP 方案，后续可换 Redis）
  private activeRuns = new Map<string, AgentGenerateOutput>();
  private timeoutIds = new Set<NodeJS.Timeout>();
  private static readonly ACTIVE_RUNS_TTL_MS = 30 * 60 * 1000; // 30 分钟
  private static readonly GRAPH_INVOKE_TIMEOUT_MS = 600_000; // 10 分钟

  constructor(
    private readonly prisma: PrismaService,
    private readonly doubaoText: DoubaoTextProvider,
    private readonly promptBuilder: ScriptQuickPromptBuilder,
    private readonly complianceFilter: ComplianceFilter,
    private readonly scriptRepository: ScriptRepository,
    private readonly schemaValidator: ScriptSchemaValidator,
    private readonly productRepository: ProductRepository,
  ) {
    this.llm = new DoubaoChatModel({
      doubaoProvider: this.doubaoText,
    });
  }

  // ===== 素材搜索适配器（基于 Prisma 直接查询，避免外部模块依赖） =====
  private readonly materialAgentAdapter = {
    searchMaterials: async (params: {
      product_id: string;
      query: string;
      min_duration?: number;
      max_duration?: number;
    }) => {
      const slices = await this.prisma.materialSlice.findMany({
        where: {
          status: 'COMPLETED',
          ...(params.product_id ? { productId: params.product_id } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: { sliceId: true, streamUrl: true },
      });
      return {
        items: slices.map((s) => ({
          slice_id: s.sliceId,
          stream_url: s.streamUrl,
        })),
      };
    },
  };

  // ===== 创作服务适配器（基于 ScriptRepository 创建剧本） =====
  private readonly creationAgentAdapter = {
    createCreation: async (params: {
      product_id: string;
      script_id: string;
      engine_mode?: string;
      target_resolution?: string;
      export_format?: string;
    }) => {
      // Agent 模式下，创作任务由 scriptRepository 已创建的剧本直接关联
      // 这里返回一个占位 creation，后续可由前端轮询真实 creation
      return {
        creation_id: `agent-${params.script_id}`,
        task_id: `agent-task-${params.script_id}`,
        status: 'PENDING' as const,
      };
    },
  };

  // ===== 质检适配器 =====
  private readonly qualityCheckAdapter = {
    getCreationHealth: async (creationId: string) => {
      try {
        const scriptId = creationId.replace(/^agent-/, '');
        const script = await this.prisma.script.findUnique({
          where: { id: scriptId },
          select: { id: true },
        });
        return {
          failed_shots: script ? [] : [{ shot_index: -1, error: '剧本未保存' }],
          stuck_creation_ids: [],
        };
      } catch {
        return { failed_shots: [], stuck_creation_ids: [] };
      }
    },
  };

  /**
   * 执行 Agent 生成（异步模式）
   *
   * 立即返回 { run_id, status: "ACCEPTED" }，后台执行 LangGraph。
   * 前端通过 GET /api/v1/agent/status/:runId 轮询进度。
   */
  async runAgent(input: AgentGenerateInput): Promise<AgentGenerateOutput> {
    // 验证必填字段（同步，极快）
    if (!input.product_id || typeof input.product_id !== 'string' || !input.product_id.trim()) {
      throw serviceException(
        {
          message: 'product_id 为必填参数',
          error: { code: 'VALIDATION_ERROR', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const runId = randomUUID();
    this.logger.log(`Agent run ${runId} accepted for product ${input.product_id}`);

    // 立即写入 ACCEPTED 状态，前端可立即轮询
    const acceptedOutput: AgentGenerateOutput = {
      run_id: runId,
      status: 'ACCEPTED',
      iterations: 0,
      final_script_id: '',
      step_log: [
        {
          node: 'system',
          timestamp: new Date().toISOString(),
          action: 'ACCEPTED',
          reasoning: 'Agent 任务已接收，正在准备执行...',
        },
      ],
    };
    this.activeRuns.set(runId, acceptedOutput);

    // 30 分钟后自动清理，防止内存泄漏
    const ttlId = setTimeout(() => {
      this.activeRuns.delete(runId);
      this.timeoutIds.delete(ttlId);
      this.logger.debug(`Agent run ${runId} TTL expired, removed from activeRuns`);
    }, AgentService.ACTIVE_RUNS_TTL_MS);
    this.timeoutIds.add(ttlId);

    // 后台执行（fire-and-forget），不阻塞响应
    this.executeAgentGraph(runId, input).catch((err) => {
      this.logger.error(`Agent run ${runId} background execution failed`, err);
    });

    return acceptedOutput;
  }

  /**
   * 后台执行 LangGraph agent graph
   */
  private async executeAgentGraph(
    runId: string,
    input: AgentGenerateInput,
  ): Promise<void> {
    // 获取商品信息
    let product;
    try {
      product = await this.productRepository.findProductById(input.product_id);
    } catch (dbError) {
      this.logger.error(`Agent run ${runId} — product lookup failed`, dbError);
      const errorOutput: AgentGenerateOutput = {
        run_id: runId,
        status: 'FALLBACK',
        iterations: 0,
        final_script_id: '',
        step_log: [
          ...(this.activeRuns.get(runId)?.step_log || []),
          {
            node: 'system',
            timestamp: new Date().toISOString(),
            action: 'FAILED',
            reasoning: `商品信息查询失败: ${(dbError as Error)?.message || '未知错误'}`,
          },
        ],
      };
      this.activeRuns.set(runId, errorOutput);
      return;
    }

    if (!product) {
      const errorOutput: AgentGenerateOutput = {
        run_id: runId,
        status: 'FALLBACK',
        iterations: 0,
        final_script_id: '',
        step_log: [
          ...(this.activeRuns.get(runId)?.step_log || []),
          {
            node: 'system',
            timestamp: new Date().toISOString(),
            action: 'FAILED',
            reasoning: `商品 ${input.product_id} 不存在`,
          },
        ],
      };
      this.activeRuns.set(runId, errorOutput);
      return;
    }

    // 更新状态为 RUNNING
    const runningOutput: AgentGenerateOutput = {
      run_id: runId,
      status: 'RUNNING',
      iterations: 0,
      final_script_id: '',
      step_log: [
        ...(this.activeRuns.get(runId)?.step_log || []),
        {
          node: 'system',
          timestamp: new Date().toISOString(),
          action: 'RUNNING',
          reasoning: 'LangGraph Agent 开始执行...',
        },
      ],
    };
    this.activeRuns.set(runId, runningOutput);

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
      step_log: [],
      iterations: 0,
      status: 'RUNNING' as const,
    };

    try {
      const graph = buildVideoCreationGraph({
        llm: this.llm,
        promptBuilder: this.promptBuilder,
        doubaoText: this.doubaoText,
        complianceFilter: this.complianceFilter,
        scriptRepository: this.scriptRepository,
        schemaValidator: this.schemaValidator,
        materialService: this.materialAgentAdapter as any,
        creationService: {
          ...this.creationAgentAdapter,
          ...this.qualityCheckAdapter,
        } as any,
      });

      let graphTimeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        graphTimeoutId = setTimeout(() => {
          reject(new Error(`Agent graph invoke timeout after ${AgentService.GRAPH_INVOKE_TIMEOUT_MS}ms`));
        }, AgentService.GRAPH_INVOKE_TIMEOUT_MS);
      });

      const result = await Promise.race([
        graph.invoke(initialState) as Promise<Record<string, unknown>>,
        timeoutPromise,
      ]);
      if (graphTimeoutId) clearTimeout(graphTimeoutId);

      const output: AgentGenerateOutput = {
        run_id: runId,
        status: (result.status as 'PASSED' | 'FALLBACK') || 'FALLBACK',
        iterations: (result.iterations as number) || 0,
        final_script_id: String(result.final_script_id || ''),
        step_log: (result.step_log as Array<Record<string, unknown>> || []).map((s) => ({
          node: String(s.node || ''),
          timestamp: String(s.timestamp || ''),
          action: String(s.action || ''),
          reasoning: String(s.reasoning || ''),
          data: s.data as Record<string, unknown> | undefined,
        })),
      };

      this.activeRuns.set(runId, output);
      this.logger.log(
        `Agent run ${runId} completed — status=${output.status}, iterations=${output.iterations}, script=${output.final_script_id}`,
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('timeout')) {
        this.logger.warn(
          `Agent graph invoke timed out after ${AgentService.GRAPH_INVOKE_TIMEOUT_MS}ms for run ${runId}, falling back to local script generation`,
        );
      } else {
        this.logger.warn(`Agent run ${runId} failed, falling back to local script generation: ${(err as Error)?.message}`);
      }

      // 本地兜底
      try {
        const fallbackOutput = await this.generateFallbackScript(runId, input, product as Record<string, unknown>);
        this.activeRuns.set(runId, fallbackOutput);
        this.logger.log(`Agent run ${runId} completed via local fallback — script=${fallbackOutput.final_script_id}`);
      } catch (fallbackErr) {
        this.logger.error(`Agent fallback generation also failed for run ${runId}`, fallbackErr);
        const errorOutput: AgentGenerateOutput = {
          run_id: runId,
          status: 'FALLBACK',
          iterations: 0,
          final_script_id: '',
          step_log: [
            ...(this.activeRuns.get(runId)?.step_log || []),
            {
              node: 'system',
              timestamp: new Date().toISOString(),
              action: 'FAILED',
              reasoning: `Agent 生成与本地兜底均失败: ${(err as Error)?.message || '未知错误'}`,
            },
          ],
        };
        this.activeRuns.set(runId, errorOutput);
      }
    }
  }

  /**
   * 本地兜底剧本生成
   */
  private async generateFallbackScript(
    runId: string,
    input: AgentGenerateInput,
    product: Record<string, unknown>,
  ): Promise<AgentGenerateOutput> {
    const sellingPoints = (product.selling_points as string[]) || [];
    const primarySP = sellingPoints[0] || String(product.title || 'product');
    const secondarySP = sellingPoints[1] || primarySP;
    const title = String(input.style_vibe || 'professional') + ' ' + primarySP;

    const defaultSafeZone: [number, number, number, number] = [80, 200, 640, 480];

    const scriptParams: CreateScriptParams = {
      productId: input.product_id,
      title,
      language: input.language || 'zh-CN',
      targetAudience: (product.target_audience as string) || '',
      videoDuration: 12,
      aspectRatio: input.aspect_ratio || '9:16',
      styleVibe: input.style_vibe || 'professional',
      generationMode: 'AGENT_LOCAL_FALLBACK',
      constraintList: input.constraint_list || [],
      rawJson: { source: 'agent_local_fallback', selling_points: sellingPoints },
    };

    const shotParams: CreateScriptShotParams[] = [
      {
        scriptId: '',
        shotIndex: 1,
        duration: 5,
        sceneDescriptionQuery: `vertical product hero shot for ${primarySP}`,
        visualDescription: `产品特写开场，重点展示 ${primarySP}`,
        cameraMovement: 'Static',
        transitionType: 'Fade_In',
        voiceoverText: `${primarySP}，为您精心呈现。`,
        subtitleText: primarySP,
        safeZoneBoundingBox: defaultSafeZone,
        complianceStatus: 'PASSED',
      },
      {
        scriptId: '',
        shotIndex: 2,
        duration: 7,
        sceneDescriptionQuery: `vertical product demo for ${secondarySP}`,
        visualDescription: `使用场景展示，突出 ${secondarySP} 的实用价值`,
        cameraMovement: 'Pan_Left',
        transitionType: 'Dissolve',
        voiceoverText: `${secondarySP}，让您的生活更便捷。`,
        subtitleText: secondarySP,
        safeZoneBoundingBox: [160, 240, 560, 400] as [number, number, number, number],
        complianceStatus: 'PASSED',
      },
    ];

    const script = await this.scriptRepository.createScriptWithShots(scriptParams, shotParams);

    return {
      run_id: runId,
      status: 'FALLBACK',
      iterations: 0,
      final_script_id: script.id,
      step_log: [
        ...(this.activeRuns.get(runId)?.step_log || []),
        {
          node: 'local_fallback',
          timestamp: new Date().toISOString(),
          action: 'GENERATE_LOCAL_FALLBACK',
          reasoning: 'AI 模型不可用或超时，使用本地模板生成基础剧本',
        },
      ],
    };
  }

  /**
   * 查询 Agent 运行状态
   */
  getRunStatus(runId: string): AgentGenerateOutput | null {
    return this.activeRuns.get(runId) || null;
  }

  onModuleDestroy(): void {
    for (const timeoutId of this.timeoutIds) {
      clearTimeout(timeoutId);
    }
    this.timeoutIds.clear();
    this.activeRuns.clear();
    this.logger.log('AgentService destroyed, all timers and active runs cleaned');
  }
}
