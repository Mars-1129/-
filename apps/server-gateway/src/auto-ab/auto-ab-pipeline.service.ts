// =============================================================================
// TikStream AI — Auto A/B Pipeline Service
// LangGraph Agent 驱动的自动 A/B 对比管线
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { DoubaoChatModel } from '../../services/ai/doubao-chat-model';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { ScriptService } from '../script/script.service';
import { CreationService } from '../creation/creation.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AutoAbService } from '../analytics/auto-ab.service';
import { buildAutoAbGraph } from './graph';
import { randomUUID } from 'node:crypto';

export interface AutoAbRunInput {
  product_id: string;
  script_id: string;
  style_variants?: Array<{ label: string; style_vibe: string }>;
}

export interface AutoAbRunOutput {
  run_id: string;
  session_id: string;
  status: 'COMPLETED' | 'FAILED';
  product_id: string;
  base_script_id: string;
  variant_script_ids: string[];
  variant_labels: string[];
  creation_ids: string[];
  winner: {
    creation_id: string;
    label: string;
    score: number;
  };
  rankings: Array<{
    rank: number;
    creation_id: string;
    label: string;
    score: number;
  }>;
  insights: string[];
  step_log: Array<{
    node: string;
    timestamp: string;
    action: string;
    reasoning: string;
    data?: Record<string, unknown>;
  }>;
  generated_at: string;
}

@Injectable()
export class AutoAbPipelineService {
  private static readonly RUN_TTL_MS = 30 * 60 * 1000; // 过期时间：30 分钟
  private readonly logger = new Logger(AutoAbPipelineService.name);
  private readonly llm: DoubaoChatModel;

  // In-memory 存储运行状态
  private activeRuns = new Map<string, AutoAbRunOutput>();
  private runTimestamps = new Map<string, number>();

  constructor(
    private readonly doubaoText: DoubaoTextProvider,
    private readonly scriptService: ScriptService,
    private readonly creationService: CreationService,
    private readonly analyticsService: AnalyticsService,
    private readonly autoAbService: AutoAbService,
  ) {
    this.llm = new DoubaoChatModel({
      doubaoProvider: this.doubaoText,
    });
  }

  /**
   * 执行完整的自动 A/B 对比管线
   */
  async runPipeline(input: AutoAbRunInput): Promise<AutoAbRunOutput> {
    const runId = randomUUID();
    this.logger.log(`Auto A/B pipeline ${runId} started for script ${input.script_id}`);

    const styleVariants = input.style_variants || [
      { label: '高能量', style_vibe: '快节奏高能量带货' },
      { label: '沉稳专业', style_vibe: '沉稳专业化展示' },
      { label: '幽默触达', style_vibe: '幽默轻松生活化' },
    ];

    const initialState = {
      product_id: input.product_id,
      base_script_id: input.script_id,
      style_variants: styleVariants,
      session_id: '',
      variant_script_ids: [] as string[],
      variant_labels: [] as string[],
      creation_ids: [] as string[],
      poll_attempts: 0,
      max_poll_attempts: 60,
      all_completed: false,
      pairwise_results: [] as Array<Record<string, unknown>>,
      winner_creation_id: '',
      winner_label: '',
      winner_score: 0,
      rankings: [] as Array<Record<string, unknown>>,
      insights: [] as string[],
      status: 'RUNNING' as const,
      error_message: '',
      progress: 0,
      step_log: [] as Array<Record<string, unknown>>,
    };

    try {
      const graph = buildAutoAbGraph({
        llm: this.llm,
        scriptService: this.scriptService,
        creationService: this.creationService,
        analyticsService: this.analyticsService,
        autoAbService: this.autoAbService,
        generateScriptVariant: (scriptId, styleVibe, label) =>
          this.scriptService.regenerateRestyle(scriptId, { style_vibe: styleVibe }) as Promise<{ script_id: string }>,
      });

      const result = await graph.invoke(initialState);

      const output: AutoAbRunOutput = {
        run_id: runId,
        session_id: String(result.session_id || ''),
        status: (result.status as 'COMPLETED' | 'FAILED') || 'FAILED',
        product_id: input.product_id,
        base_script_id: input.script_id,
        variant_script_ids: (result.variant_script_ids as string[]) || [],
        variant_labels: (result.variant_labels as string[]) || [],
        creation_ids: (result.creation_ids as string[]) || [],
        winner: {
          creation_id: String(result.winner_creation_id || ''),
          label: String(result.winner_label || ''),
          score: Number(result.winner_score || 0),
        },
        rankings: ((result.rankings as Array<Record<string, unknown>>) || []).map((r, i) => ({
          rank: i + 1,
          creation_id: String(r.creation_id || ''),
          label: String(r.label || ''),
          score: Number(r.score || 0),
        })),
        insights: (result.insights as string[]) || [],
        step_log: ((result.step_log as Array<Record<string, unknown>>) || []).map((s) => ({
          node: String(s.node || ''),
          timestamp: String(s.timestamp || ''),
          action: String(s.action || ''),
          reasoning: String(s.reasoning || ''),
          data: s.data as Record<string, unknown> | undefined,
        })),
        generated_at: new Date().toISOString(),
      };

      this.activeRuns.set(runId, output);
      this.logger.log(
        `Auto A/B pipeline ${runId} completed — winner=${output.winner.label}, ` +
        `variants=${output.variant_script_ids.length}`,
      );

      return output;
    } catch (err) {
      this.logger.error(`Auto A/B pipeline ${runId} failed: ${err}`);
      if (err instanceof Error && err.stack) {
        this.logger.error(`Stack trace: ${err.stack}`);
      }

      // 额外：打印 err 的完整结构，帮助定位问题
      try {
        this.logger.error(`Error details: name=${(err as any)?.name}, message=${(err as any)?.message}, constructor=${(err as any)?.constructor?.name}`);
      } catch {};

      const fallback: AutoAbRunOutput = {
        run_id: runId,
        session_id: '',
        status: 'FAILED',
        product_id: input.product_id,
        base_script_id: input.script_id,
        variant_script_ids: [],
        variant_labels: [],
        creation_ids: [],
        winner: { creation_id: '', label: '', score: 0 },
        rankings: [],
        insights: [],
        step_log: [{
          node: 'pipeline',
          timestamp: new Date().toISOString(),
          action: '管线执行失败',
          reasoning: String(err),
        }],
        generated_at: new Date().toISOString(),
      };

      this.activeRuns.set(runId, fallback);
      this.runTimestamps.set(runId, Date.now());
      return fallback;
    }
  }

  /**
   * 查询运行状态
   */
  getRunStatus(runId: string): AutoAbRunOutput | null {
    this.evictExpiredRuns();
    return this.activeRuns.get(runId) || null;
  }

  /**
   * 清理超过 TTL 的过期运行记录，防止内存泄漏
   */
  private evictExpiredRuns(): void {
    const now = Date.now();
    for (const [runId, ts] of this.runTimestamps) {
      if (now - ts > AutoAbPipelineService.RUN_TTL_MS) {
        this.activeRuns.delete(runId);
        this.runTimestamps.delete(runId);
      }
    }
  }
}
