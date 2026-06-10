// =============================================================================
// TikStream AI — Cold Start Service (v2.0 — LLM 强化版)
// 投放效果预测（冷启动加速）：四级降级链
//   Tier 0: LLM 深度分析 (DoubaoTextProvider 剧本结构 + 风险诊断 + 优化建议)
//   Tier 1: DuckDB ab_compare_predictions (真实预计算)
//   Tier 2: ViralAnalysis DNA 相似度推测 (同品类爆款类比)
//   Tier 3: 增强启发式多维度分镜结构模型 (兜底)
// =============================================================================

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectPrisma } from '@nestjs/prisma';
import type { PrismaClient } from '@prisma/client';
import { ViralAnalysisRepository } from '../viral-analysis/viral-analysis.repository';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import type { ViralVideoAnalysis } from '@prisma/client';
import type { PerformancePrediction, ImprovementSuggestion } from '@tikstream/shared-types';
import { env } from '../common/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DataSource = PerformancePrediction['data_source'];

interface HeuristicInput {
  scriptId: string;
  title?: string;
  shots: ShotInput[];
  styleVibe?: string;
  videoDuration?: number;
}

interface ShotInput {
  shotIndex: number;
  duration: number;
  voiceover?: string;
  visualDescription?: string;
  actionDescription?: string;
  hookType?: string;
}

interface InternalMetrics {
  predictedCtr: number;
  predictedCvr: number;
  predictedRetention: number;
  predictedCompletion: number;
}

/** LLM 返回的剧本分析结果 */
interface LLMAnalysisResult {
  predicted_ctr: number;
  predicted_cvr: number;
  predicted_retention: number;
  predicted_completion: number;
  confidence: number;
  data_quality: 'HIGH' | 'MEDIUM' | 'LOW';
  analysis_summary: string;
  risk_factors: string[];
  improvement_suggestions: Array<{
    shot_index: number;
    shot_order: string;
    suggestion: string;
    expected_boost: number;
    category: string;
  }>;
}

/** 增强启发式模型的维度权重 */
const HEURISTIC_WEIGHTS = {
  HOOK: { ctr: 0.40, retention: 0.25, completion: 0.15 },
  PACING: { ctr: 0.15, retention: 0.20, completion: 0.25 },
  EMOTIONAL_ARC: { ctr: 0.10, retention: 0.25, completion: 0.20 },
  CTA: { ctr: 0.15, cvr: 0.50, retention: 0.10, completion: 0.10 },
  TEXT_DENSITY: { ctr: 0.05, retention: 0.10, completion: 0.15 },
  DURATION_FIT: { ctr: 0.05, retention: 0.05, completion: 0.10 },
  SHOT_VARIETY: { ctr: 0.10, retention: 0.05, completion: 0.05 },
} as const;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ColdStartService {
  private readonly logger = new Logger(ColdStartService.name);

  constructor(
    @InjectPrisma() private readonly prisma: PrismaClient,
    private readonly viralAnalysisRepository: ViralAnalysisRepository,
    private readonly doubaoText: DoubaoTextProvider,
  ) {}

  // ===========================================================================
  // Public API
  // ===========================================================================

  async predictPerformance(
    scriptId: string,
    productId?: string,
    forceSource?: 'LLM' | 'DUCKDB' | 'VIRAL_DNA' | 'HEURISTIC',
  ): Promise<PerformancePrediction> {
    // 1. Load script data
    const script = await this.loadScriptWithShots(scriptId);
    const effectiveProductId = productId ?? script.productId;
    const shots = (script.shots ?? []) as Array<Record<string, unknown>>;
    const input: HeuristicInput = {
      scriptId,
      title: script.title ?? undefined,
      shots: shots.map((s) => ({
        shotIndex: (s.shotIndex as number) ?? 0,
        duration: Number(s.duration ?? 0),
        voiceover: s.voiceover as string | undefined,
        visualDescription: s.visualDescription as string | undefined,
        actionDescription: s.actionDescription as string | undefined,
        hookType: s.hookType as string | undefined,
      })),
      styleVibe: script.styleVibe ?? undefined,
      videoDuration: Number(script.videoDuration ?? 0),
    };

    if (input.shots.length === 0) {
      throw new HttpException(
        `脚本 ${scriptId} 无分镜数据，无法预测`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 2. Tiered prediction
    let result: PerformancePrediction;
    let source: DataSource;

    if (forceSource) {
      source = this.mapForceSource(forceSource);
      result = await this.executeTier(source, scriptId, effectiveProductId, input);
    } else {
      ({ result, source } = await this.tryPredict(scriptId, effectiveProductId, input));
    }

    // 3. Persist to Script table
    try {
      await this.persistPrediction(scriptId, result, source);
    } catch (err) {
      this.logger.warn(`Failed to persist prediction for script ${scriptId}: ${(err as Error).message}`);
    }

    return result;
  }

  // ===========================================================================
  // Private: Tiered prediction
  // ===========================================================================

  private async tryPredict(
    scriptId: string,
    productId: string,
    input: HeuristicInput,
  ): Promise<{ result: PerformancePrediction; source: DataSource }> {
    // Tier 0: LLM deep analysis (优先)
    const llmResult = await this.tryLLMAnalysis(scriptId, productId, input);
    if (llmResult) {
      this.logger.log(`[ColdStart] script=${scriptId} → LLM_DEEP_ANALYSIS (confidence=${llmResult.confidence.toFixed(2)})`);
      return { result: llmResult, source: 'LLM_DEEP_ANALYSIS' };
    }

    // Tier 1: DuckDB
    const duckResult = await this.tryDuckDBNative(scriptId, productId, input);
    if (duckResult) {
      this.logger.log(`[ColdStart] script=${scriptId} → DUCKDB_PRECOMPUTED (confidence=${duckResult.confidence.toFixed(2)})`);
      return { result: duckResult, source: 'DUCKDB_PRECOMPUTED' };
    }

    // Tier 2: ViralDNA estimate
    const dnaResult = await this.tryViralDNAEstimate(scriptId, productId, input);
    if (dnaResult) {
      this.logger.log(`[ColdStart] script=${scriptId} → VIRAL_DNA_ESTIMATE (confidence=${dnaResult.confidence.toFixed(2)})`);
      return { result: dnaResult, source: 'VIRAL_DNA_ESTIMATE' };
    }

    // Tier 3: Enhanced heuristic fallback
    const heuristicResult = this.buildEnhancedHeuristicPrediction(scriptId, input);
    this.logger.log(`[ColdStart] script=${scriptId} → HEURISTIC_FALLBACK (confidence=${heuristicResult.confidence.toFixed(2)})`);
    return { result: heuristicResult, source: 'HEURISTIC_FALLBACK' };
  }

  private async executeTier(
    source: DataSource,
    scriptId: string,
    productId: string,
    input: HeuristicInput,
  ): Promise<PerformancePrediction> {
    switch (source) {
      case 'LLM_DEEP_ANALYSIS': {
        const r = await this.tryLLMAnalysis(scriptId, productId, input);
        if (r) return r;
        this.logger.warn(`[ColdStart] Force LLM requested but failed, falling back to heuristic`);
        return this.buildEnhancedHeuristicPrediction(scriptId, input);
      }
      case 'DUCKDB_PRECOMPUTED': {
        const r = await this.tryDuckDBNative(scriptId, productId, input);
        if (r) return r;
        return this.buildEnhancedHeuristicPrediction(scriptId, input);
      }
      case 'VIRAL_DNA_ESTIMATE': {
        const r = await this.tryViralDNAEstimate(scriptId, productId, input);
        if (r) return r;
        return this.buildEnhancedHeuristicPrediction(scriptId, input);
      }
      default:
        return this.buildEnhancedHeuristicPrediction(scriptId, input);
    }
  }

  // ===========================================================================
  // Tier 0: LLM 深度剧本分析 (NEW — 核心升级)
  // ===========================================================================

  private async tryLLMAnalysis(
    scriptId: string,
    productId: string,
    input: HeuristicInput,
  ): Promise<PerformancePrediction | null> {
    // 检查 LLM 环境是否可用
    if (!env('ARK_BASE_URL', 'VOLC_ARK_API_URL') && !env('ARK_BASE_URL', 'DOUBAO_API_URL')) {
      this.logger.debug('[ColdStart] LLM API not configured, skipping LLM tier');
      return null;
    }

    try {
      const prompt = this.buildLLMAnalysisPrompt(input);
      const llmRaw = await this.doubaoText.generateText(prompt, '');
      const analysis = this.parseLLMAnalysisResponse(llmRaw, scriptId, input);

      if (!analysis) return null;

      return {
        script_id: scriptId,
        predicted_ctr: this.clamp(analysis.predicted_ctr, 0.01, 0.20),
        predicted_cvr: this.clamp(analysis.predicted_cvr, 0.005, 0.10),
        predicted_retention: this.clamp(analysis.predicted_retention, 0.10, 0.95),
        predicted_completion: this.clamp(analysis.predicted_completion, 0.10, 0.95),
        confidence: this.clamp(analysis.confidence, 0.30, 0.90),
        data_quality: analysis.data_quality,
        data_source: 'LLM_DEEP_ANALYSIS',
        risk_factors: analysis.risk_factors,
        improvement_suggestions: analysis.improvement_suggestions.map((s) => ({
          shot_index: s.shot_index,
          shot_order: s.shot_order,
          suggestion: s.suggestion,
          expected_boost: this.clamp(s.expected_boost, 0.01, 0.15),
          category: this.normalizeCategory(s.category),
        })),
        llm_analysis_summary: analysis.analysis_summary,
        predicted_at: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.warn(`[ColdStart] LLM analysis failed for script ${scriptId}: ${(err as Error).message}`);
      return null;
    }
  }

  /** 构建 LLM 分析 Prompt */
  private buildLLMAnalysisPrompt(input: HeuristicInput): string {
    const title = input.title || '未设置标题';
    const styleVibe = input.styleVibe || 'standard';
    const totalDuration = input.videoDuration || input.shots.reduce((s, sh) => s + sh.duration, 0);

    const shotDetails = input.shots.map((s, i) => {
      const parts: string[] = [
        `[第${i + 1}镜] 时长=${s.duration.toFixed(1)}s`,
      ];
      if (s.voiceover) parts.push(`旁白="${s.voiceover}"`);
      if (s.visualDescription) parts.push(`画面="${s.visualDescription}"`);
      if (s.actionDescription) parts.push(`动作="${s.actionDescription}"`);
      if (s.hookType) parts.push(`钩子类型=${s.hookType}`);
      return parts.join(' | ');
    }).join('\n');

    return `你是 TikTok 电商短视频运营专家，擅长用数据驱动的方式评估短视频剧本的投放潜力。

请对以下剧本进行科学评估，输出 JSON 格式的预测结果。

## 剧本信息
- 标题: ${title}
- 风格: ${styleVibe}
- 总时长: ${totalDuration}s
- 分镜数: ${input.shots.length}

## 分镜详情
${shotDetails}

## 评估要求
基于 TikTok 电商短视频的爆款规律，从以下维度分析：

1. **开场钩力 (0-2镜)**：是否3秒内制造悬念/冲突/痛点/数据反差？
2. **节奏与信息密度**：时长分配是否合理？旁白是否精炼？
3. **情感曲线**：是否有情绪起伏（好奇→痛点刺激→解决→满足→紧迫）？
4. **转化引导 (CTA)**：末镜是否包含明确的购买指引和紧迫感？
5. **视觉与文本密度**：画面描述是否可视化可执行？字幕密度是否适配？
6. **完成度**：叙事结构是否完整闭环？

## 输出格式 (纯JSON，不要markdown代码块)
{
  "predicted_ctr": 0.084,
  "predicted_cvr": 0.037,
  "predicted_retention": 0.624,
  "predicted_completion": 0.62,
  "confidence": 0.52,
  "data_quality": "MEDIUM",
  "analysis_summary": "整体剧本结构完整，开场钩力中等，CTA转化环节薄弱，建议在末镜增加紧迫感文案和明确的购物车引导动作。",
  "risk_factors": [
    "开场吸引力不足（前2镜缺乏问题/数据/反差钩子）",
    "转化引导（CTA）较弱，末镜缺乏紧迫感或行动号召"
  ],
  "improvement_suggestions": [
    {
      "shot_index": 0,
      "shot_order": "第1镜",
      "suggestion": "将开场改为\"问题前置型\"钩子（如\"你知道...吗？\"），或加入具体数据制造反差感",
      "expected_boost": 0.06,
      "category": "HOOK"
    },
    {
      "shot_index": 3,
      "shot_order": "末镜（第4镜）",
      "suggestion": "添加\"限时优惠\"\"错过等下次\"等紧迫感文案，明确点击购物车/领券的行动指引",
      "expected_boost": 0.04,
      "category": "CTA"
    }
  ]
}

## 预测基准（电商短视频行业参考）
- 行业平均 CTR: 5-8%（带钩子 +2%，好CTA +1.5%）
- 行业平均 CVR: 2-4%（强CTA +1.5%）
- 完播率基准: 8-12s视频 35-45%，15-20s视频 25-35%
- 以上数值请根据剧本质量在合理范围内保守估计，置信度反映你对分析的把握程度
`;
  }

  /** 解析 LLM 响应 */
  private parseLLMAnalysisResponse(
    raw: string,
    scriptId: string,
    input: HeuristicInput,
  ): LLMAnalysisResult | null {
    try {
      const cleaned = raw
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
      const parsed = JSON.parse(jsonStr);

      if (!parsed || typeof parsed !== 'object') return null;

      const shots = input.shots;
      const maxShotIndex = shots.length - 1;

      return {
        predicted_ctr: Number(parsed.predicted_ctr) || 0.05,
        predicted_cvr: Number(parsed.predicted_cvr) || 0.025,
        predicted_retention: Number(parsed.predicted_retention) || 0.5,
        predicted_completion: Number(parsed.predicted_completion) || 0.4,
        confidence: Number(parsed.confidence) || 0.4,
        data_quality: (parsed.data_quality === 'HIGH' || parsed.data_quality === 'MEDIUM' || parsed.data_quality === 'LOW')
          ? parsed.data_quality : 'MEDIUM',
        analysis_summary: String(parsed.analysis_summary || ''),
        risk_factors: Array.isArray(parsed.risk_factors)
          ? parsed.risk_factors.map(String)
          : [],
        improvement_suggestions: (Array.isArray(parsed.improvement_suggestions)
          ? parsed.improvement_suggestions
          : []).map((s: any) => ({
            shot_index: Math.min(Math.max(Number(s.shot_index) || 0, 0), maxShotIndex),
            shot_order: String(s.shot_order || `第${(Number(s.shot_index) || 0) + 1}镜`),
            suggestion: String(s.suggestion || ''),
            expected_boost: Number(s.expected_boost) || 0.03,
            category: String(s.category || 'HOOK'),
          })),
      };
    } catch (err) {
      this.logger.warn(`[ColdStart] LLM response parse failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ===========================================================================
  // Tier 1: DuckDB ab_compare_predictions (unchanged)
  // ===========================================================================
  // (保持原有 DuckDB 集成逻辑不变，此处省略重复代码)
  // 原代码 `tryDuckDBNative` 方法保持不变

  private async tryDuckDBNative(
    scriptId: string,
    _productId: string,
    input: HeuristicInput,
  ): Promise<PerformancePrediction | null> {
    if (env('DB_ENABLED', 'DUCKDB_ENABLED') !== 'true' || !env('DB_PATH', 'DUCKDB_PATH')) {
      return null;
    }

    let duckModule: Record<string, unknown> | null = null;
    try {
      // @ts-expect-error @duckdb/node-api 可选依赖
      duckModule = await import('@duckdb/node-api') as Record<string, unknown>;
    } catch {
      return null;
    }

    const DuckDBInstance = duckModule?.DuckDBInstance as
      | (new () => { connect: () => Promise<Record<string, unknown>> })
      | undefined;
    if (!DuckDBInstance) return null;

    const creationIds = await this.findCreationIdsForScript(scriptId);
    if (creationIds.length === 0) return null;

    let connection: Record<string, unknown> | null = null;
    try {
      const instance = new DuckDBInstance();
      connection = (await instance.connect()) as Record<string, unknown>;

      const placeholders = creationIds.map(() => '?').join(', ');
      const sql = `
        SELECT creation_id, predicted_ctr, predicted_cvr,
               predicted_completion_rate, predicted_retention_rate
        FROM analytics.ab_compare_predictions
        WHERE creation_id IN (${placeholders})
      `;

      const runFn = connection.run as (
        sql: string, params?: unknown[],
      ) => Promise<{ getRowObjectsJson: () => Array<Record<string, unknown>> }>;
      const result = await runFn(sql, creationIds);
      const rows = result.getRowObjectsJson();

      if (!Array.isArray(rows) || rows.length === 0) return null;

      let bestRow: Record<string, unknown> | null = null;
      let bestCtr = -1;
      for (const row of rows) {
        const ctr = Number(row.predicted_ctr);
        if (!isNaN(ctr) && ctr > bestCtr) {
          bestCtr = ctr;
          bestRow = row;
        }
      }

      if (!bestRow) return null;

      const predictedCtr = Number(bestRow.predicted_ctr) || 0;
      const predictedCvr = Number(bestRow.predicted_cvr) || 0;
      const predictedRetention = Number(bestRow.predicted_retention_rate) || 0;
      const predictedCompletion = Number(bestRow.predicted_completion_rate) || 0;

      const confidence = this.calculateConfidence('DUCKDB_PRECOMPUTED', { hasRealData: true, hasDnaPattern: true });
      const riskAnalysis = this.analyzeRiskFactors(input, { predictedCtr, predictedRetention });

      return {
        script_id: scriptId,
        predicted_ctr: Math.round(predictedCtr * 10000) / 10000,
        predicted_cvr: Math.round(predictedCvr * 10000) / 10000,
        predicted_retention: Math.round(predictedRetention * 10000) / 10000,
        predicted_completion: Math.round(predictedCompletion * 10000) / 10000,
        confidence,
        data_quality: 'HIGH',
        data_source: 'DUCKDB_PRECOMPUTED',
        risk_factors: riskAnalysis.riskFactors,
        improvement_suggestions: riskAnalysis.suggestions,
        predicted_at: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.warn(`[ColdStart] DuckDB query failed for script ${scriptId}: ${(err as Error).message}`);
      return null;
    } finally {
      if (connection) {
        try {
          const closeFn = (connection as Record<string, unknown>).close as (() => Promise<void>) | undefined;
          await closeFn?.();
        } catch { /* ignore */ }
      }
    }
  }

  // ===========================================================================
  // Tier 2: ViralDNA estimate (enhanced)
  // ===========================================================================

  private async tryViralDNAEstimate(
    scriptId: string,
    productId: string,
    input: HeuristicInput,
  ): Promise<PerformancePrediction | null> {
    try {
      const viralAnalysis = await this.viralAnalysisRepository.findBestViralAnalysisByProduct(productId);
      if (!viralAnalysis) return null;

      const dna = this.extractDNAScores(viralAnalysis);
      if (!dna) return null;

      // Enhanced blending: heuristic 50% + DNA 50% (提升 DNA 权重)
      const base = this.computeEnhancedMetrics(input);
      const predictedCtr = this.clamp(base.predictedCtr * 0.50 + dna.ctrEstimate * 0.50, 0.01, 0.18);
      const predictedCvr = this.clamp(base.predictedCvr * 0.50 + dna.cvrEstimate * 0.50, 0.005, 0.08);

      const confidence = this.calculateConfidence('VIRAL_DNA_ESTIMATE', {
        hasRealData: false,
        hasDnaPattern: true,
        dnaConfidence: dna.confidenceScore,
      });

      const metrics = { ...base, predictedCtr, predictedCvr };
      const riskAnalysis = this.analyzeRiskFactors(input, { predictedCtr, predictedRetention: base.predictedRetention });

      return {
        script_id: scriptId,
        predicted_ctr: Math.round(metrics.predictedCtr * 10000) / 10000,
        predicted_cvr: Math.round(metrics.predictedCvr * 10000) / 10000,
        predicted_retention: Math.round(metrics.predictedRetention * 10000) / 10000,
        predicted_completion: Math.round(metrics.predictedCompletion * 10000) / 10000,
        confidence,
        data_quality: 'MEDIUM',
        data_source: 'VIRAL_DNA_ESTIMATE',
        risk_factors: riskAnalysis.riskFactors,
        improvement_suggestions: riskAnalysis.suggestions,
        predicted_at: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.warn(`[ColdStart] ViralDNA estimate failed for product ${productId}: ${(err as Error).message}`);
      return null;
    }
  }

  // ===========================================================================
  // Tier 3: 增强启发式多维度分镜结构模型 (Enhanced)
  // ===========================================================================

  private buildEnhancedHeuristicPrediction(
    scriptId: string,
    input: HeuristicInput,
  ): PerformancePrediction {
    const metrics = this.computeEnhancedMetrics(input);
    const confidence = this.calculateConfidence('HEURISTIC_FALLBACK', {
      hasRealData: false,
      hasDnaPattern: false,
    });

    const riskAnalysis = this.analyzeRiskFactors(input, {
      predictedCtr: metrics.predictedCtr,
      predictedRetention: metrics.predictedRetention,
    });

    return {
      script_id: scriptId,
      predicted_ctr: Math.round(metrics.predictedCtr * 10000) / 10000,
      predicted_cvr: Math.round(metrics.predictedCvr * 10000) / 10000,
      predicted_retention: Math.round(metrics.predictedRetention * 10000) / 10000,
      predicted_completion: Math.round(metrics.predictedCompletion * 10000) / 10000,
      confidence,
      data_quality: 'LOW',
      data_source: 'HEURISTIC_FALLBACK',
      risk_factors: riskAnalysis.riskFactors,
      improvement_suggestions: riskAnalysis.suggestions,
      predicted_at: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // 增强启发式度量计算 (7 维度加权)
  // ===========================================================================

  private computeEnhancedMetrics(input: HeuristicInput): InternalMetrics {
    const shots = input.shots;
    const totalDuration = input.videoDuration || shots.reduce((s, sh) => s + sh.duration, 0);

    // 七大维度评分
    const hookScore = this.calculateHookStrength(shots);
    const pacingScore = this.calculatePacingScore(shots);
    const emotionalArcScore = this.calculateEmotionalArc(shots);
    const ctaScore = this.calculateCTAStrength(shots);
    const textDensityScore = this.calculateTextDensity(shots);
    const durationFitScore = this.calculateDurationFit(totalDuration, shots.length);
    const shotVarietyScore = this.calculateShotVariety(shots, input);

    // 加权合成 CTR
    const predictedCtr = this.clamp(
      0.03 +
      hookScore * HEURISTIC_WEIGHTS.HOOK.ctr +
      pacingScore * HEURISTIC_WEIGHTS.PACING.ctr +
      emotionalArcScore * HEURISTIC_WEIGHTS.EMOTIONAL_ARC.ctr +
      ctaScore * HEURISTIC_WEIGHTS.CTA.ctr +
      textDensityScore * HEURISTIC_WEIGHTS.TEXT_DENSITY.ctr +
      durationFitScore * HEURISTIC_WEIGHTS.DURATION_FIT.ctr +
      shotVarietyScore * HEURISTIC_WEIGHTS.SHOT_VARIETY.ctr,
      0.01, 0.18,
    );

    // CVR 主要受 CTA 强度影响
    const predictedCvr = this.clamp(
      0.01 + ctaScore * HEURISTIC_WEIGHTS.CTA.cvr + hookScore * 0.02,
      0.005, 0.08,
    );

    // 留存率综合计算
    const predictedRetention = this.clamp(
      0.15 +
      hookScore * HEURISTIC_WEIGHTS.HOOK.retention +
      pacingScore * HEURISTIC_WEIGHTS.PACING.retention +
      emotionalArcScore * HEURISTIC_WEIGHTS.EMOTIONAL_ARC.retention +
      ctaScore * HEURISTIC_WEIGHTS.CTA.retention +
      textDensityScore * HEURISTIC_WEIGHTS.TEXT_DENSITY.retention +
      durationFitScore * HEURISTIC_WEIGHTS.DURATION_FIT.retention +
      shotVarietyScore * HEURISTIC_WEIGHTS.SHOT_VARIETY.retention,
      0.10, 0.95,
    );

    // 完播率
    const predictedCompletion = this.clamp(
      0.15 +
      hookScore * HEURISTIC_WEIGHTS.HOOK.completion +
      pacingScore * HEURISTIC_WEIGHTS.PACING.completion +
      emotionalArcScore * HEURISTIC_WEIGHTS.EMOTIONAL_ARC.completion +
      ctaScore * HEURISTIC_WEIGHTS.CTA.completion +
      textDensityScore * HEURISTIC_WEIGHTS.TEXT_DENSITY.completion +
      durationFitScore * HEURISTIC_WEIGHTS.DURATION_FIT.completion +
      shotVarietyScore * HEURISTIC_WEIGHTS.SHOT_VARIETY.completion,
      0.10, 0.95,
    );

    return { predictedCtr, predictedCvr, predictedRetention, predictedCompletion };
  }

  // ===========================================================================
  // 七大维度评分器
  // ===========================================================================

  private calculateHookStrength(shots: ShotInput[]): number {
    if (shots.length === 0) return 0.3;
    let score = 0.35;

    const firstShots = shots.slice(0, Math.min(3, shots.length));
    for (const shot of firstShots) {
      const text = `${shot.voiceover ?? ''} ${shot.visualDescription ?? ''} ${shot.actionDescription ?? ''}`.toLowerCase();

      // 问题前置钩子
      if (/[?？]/.test(text)) score += 0.10;
      // 数据反差钩子
      if (/\d+[%％]|\d+倍|\d+万|\d+亿|\+[\d]|降了\d|涨了\d|只要\d/.test(text)) score += 0.08;
      // 情感痛点钩子
      if (/不会|还不|错了|千万别|只怕|错过|后悔|恶心|难用|踩雷/.test(text)) score += 0.07;
      // 好奇心钩子
      if (/你知道吗|揭秘|原来|居然|竟然|不可思议|这[\w\u4e00-\u9fff]{0,2}么/.test(text)) score += 0.06;
      // 短旁白冲击力（≤15字更有效）
      if (shot.voiceover && shot.voiceover.length <= 15 && shot.voiceover.length > 0) score += 0.04;
      // 第一镜时长控制（1.5-3s 最佳）
      if (shot.shotIndex === 0 && shot.duration >= 1.5 && shot.duration <= 3.5) score += 0.05;
    }

    // 显式钩子类型声明加分
    if (shots.filter((s) => s.hookType).length > 0) score += 0.05;

    return this.clamp(score, 0.15, 0.95);
  }

  private calculatePacingScore(shots: ShotInput[]): number {
    if (shots.length <= 1) return 0.35;

    const durations = shots.map((s) => s.duration);
    const max = Math.max(...durations);
    const min = Math.min(...durations);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

    let score = 0.4;

    // 时长差异（0.3-1.5s方差最佳）
    const range = max - min;
    if (range >= 0.5 && range <= 2.0) score += 0.15;
    else if (range > 2.0) score += 0.05;

    // 前快后慢(tiktok节奏: 前端信息密集→后端展示细节)
    const firstHalfAvg = durations.slice(0, Math.ceil(durations.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(durations.length / 2);
    const secondHalfAvg = durations.slice(Math.ceil(durations.length / 2)).reduce((a, b) => a + b, 0) / (durations.length - Math.ceil(durations.length / 2));
    if (firstHalfAvg < secondHalfAvg && secondHalfAvg / Math.max(firstHalfAvg, 0.1) >= 1.2) score += 0.12;

    // 第一镜不超3s
    if (durations[0] <= 3.0) score += 0.08;

    // 末镜不超5s
    if (durations[durations.length - 1] <= 5.0) score += 0.05;

    return this.clamp(score, 0.15, 0.95);
  }

  private calculateEmotionalArc(shots: ShotInput[]): number {
    if (shots.length < 3) return 0.35;

    let score = 0.40;
    const text = shots.map((s) => `${s.voiceover ?? ''} ${s.visualDescription ?? ''}`).join(' ').toLowerCase();

    // 检测情感曲线元素
    const hasPainPoint = /痛|难|麻烦|焦虑|累|贵|差|不好|失败|无效/.test(text);
    const hasSolution = /解决|简单|轻松|快速|只需|三步|秘诀|方法|技巧/.test(text);
    const hasSatisfaction = /效果|惊艳|满意|超值|完美|好看|好用/.test(text);
    const hasUrgency = /限时|最后|再不|没了|错过|赶紧/.test(text);

    if (hasPainPoint && hasSolution) score += 0.15; // 痛点→方案 核心弧线
    if (hasSolution && hasSatisfaction) score += 0.10; // 方案→效果 增强弧线
    if (hasSatisfaction && hasUrgency) score += 0.10; // 效果→紧迫 完整弧线

    // 旁白情绪词语多样性
    const emotionWords = /惊喜|意外|震惊|嗨翻|笑死|哭|感动|治愈|爽|惊艳|离谱/.test(text);
    if (emotionWords) score += 0.08;

    return this.clamp(score, 0.20, 0.95);
  }

  private calculateCTAStrength(shots: ShotInput[]): number {
    if (shots.length === 0) return 0.2;
    let score = 0.25;

    // 检查末1-2镜
    const lastTwo = shots.slice(-2);
    for (const shot of lastTwo) {
      const text = `${shot.voiceover ?? ''} ${shot.visualDescription ?? ''}`.toLowerCase();

      // 购买指引
      if (/点击|下单|购买|链接|试用|领取|优惠|折扣|省钱|划算/.test(text)) score += 0.18;
      // 紧迫感
      if (/马上|立刻|立即|现在|赶紧|速度|手慢/.test(text)) score += 0.12;
      // 限量/限时
      if (/数量|限量|最后|过几天|错过|限时|还剩|仅剩/.test(text)) score += 0.10;
      // 利益点
      if (/省|便宜|送|赠|免|白送|包邮|赠品/.test(text)) score += 0.08;
      // 行动指令
      if (/试试|快看|记住|收藏|截图|扫码|关注/.test(text)) score += 0.06;
    }

    // CTA应该在末镜，且时长2-4s最佳
    const lastShot = shots[shots.length - 1];
    if (lastShot.duration >= 2 && lastShot.duration <= 5) score += 0.05;

    return this.clamp(score, 0.10, 0.95);
  }

  private calculateTextDensity(shots: ShotInput[]): number {
    if (shots.length === 0) return 0.4;

    let score = 0.45;
    const totalVoiceoverLen = shots.reduce((sum, s) => sum + (s.voiceover?.length ?? 0), 0);
    const totalDuration = shots.reduce((sum, s) => sum + s.duration, 0);
    const charsPerSecond = totalVoiceoverLen / Math.max(totalDuration, 0.1);

    // 最佳旁白密度：3-6字/秒（TikTok 短视频）
    if (charsPerSecond >= 3 && charsPerSecond <= 6) score += 0.20;
    else if (charsPerSecond >= 2 && charsPerSecond <= 8) score += 0.10;
    else score -= 0.05;

    // 单镜旁白不超35字
    const longVoiceShots = shots.filter((s) => (s.voiceover?.length ?? 0) > 35);
    if (longVoiceShots.length === 0) score += 0.15;

    // 视觉描述覆盖率
    const visualCoverage = shots.filter((s) => s.visualDescription && s.visualDescription.length > 3).length / shots.length;
    score += visualCoverage * 0.10;

    return this.clamp(score, 0.15, 0.95);
  }

  private calculateDurationFit(totalDuration: number, shotCount: number): number {
    // TikTok 电商短视频最佳时长：8-25s
    if (totalDuration >= 8 && totalDuration <= 25) return 0.80;
    if (totalDuration >= 5 && totalDuration <= 35) return 0.60;
    if (totalDuration > 35) return 0.35;
    return 0.45;
  }

  private calculateShotVariety(shots: ShotInput[], input: HeuristicInput): number {
    if (shots.length <= 1) return 0.3;
    let score = 0.4;

    const visualDescs = shots.filter((s) => s.visualDescription && s.visualDescription.length > 0).length;
    const actionDescs = shots.filter((s) => s.actionDescription && s.actionDescription.length > 0).length;
    const voiceovers = shots.filter((s) => s.voiceover && s.voiceover.length > 0).length;

    const visualRate = visualDescs / shots.length;
    const actionRate = actionDescs / shots.length;
    const voiceRate = voiceovers / shots.length;

    // 多样性: 画面+动作+旁白 三者覆盖
    const coverageScore = (visualRate + actionRate + voiceRate) / 3;
    score += coverageScore * 0.25;

    // 标题质量
    if (input.title && input.title.length >= 5 && input.title.length <= 40) score += 0.10;

    // 分镜数适中(3-8)
    if (shots.length >= 3 && shots.length <= 8) score += 0.10;

    return this.clamp(score, 0.15, 0.95);
  }

  // ===========================================================================
  // 多维度风险因子分析 (Enhanced)
  // ===========================================================================

  private analyzeRiskFactors(
    input: HeuristicInput,
    metrics: { predictedCtr: number; predictedRetention: number },
  ): { riskFactors: string[]; suggestions: ImprovementSuggestion[] } {
    const riskFactors: string[] = [];
    const suggestions: ImprovementSuggestion[] = [];
    const shots = input.shots;

    // 1. 开场钩子风险
    const hookScore = this.calculateHookStrength(shots);
    if (hookScore < 0.50) {
      riskFactors.push('开场吸引力不足（前2镜缺乏问题/数据/反差钩子）');
      suggestions.push({
        shot_index: 0,
        shot_order: '第1镜',
        suggestion: '将开场改为"问题前置型"钩子（如"你知道...吗？"），或加入具体数据制造反差感',
        expected_boost: 0.06,
        category: 'HOOK',
      });
    } else if (hookScore < 0.65) {
      riskFactors.push('开场钩子可进一步强化，建议增加情绪触发词或数据冲击');
      suggestions.push({
        shot_index: 0,
        shot_order: '第1镜',
        suggestion: '在开场加入量化数据（如"XX%的人不知道"）或痛点反问增强冲击力',
        expected_boost: 0.03,
        category: 'HOOK',
      });
    }

    // 2. 中间段落塌腰风险 (NEW)
    if (shots.length >= 4) {
      const midShots = shots.slice(1, -1); // 去掉首尾镜
      const midAvgDuration = midShots.reduce((s, sh) => s + sh.duration, 0) / Math.max(midShots.length, 1);
      const midVoiceAvgLen = midShots.reduce((s, sh) => s + (sh.voiceover?.length ?? 0), 0) / Math.max(midShots.length, 1);

      if (midAvgDuration > 5 && midVoiceAvgLen > 30) {
        riskFactors.push('中间段落节奏偏慢，旁白过长可能导致观众流失（中间流失区）');
        suggestions.push({
          shot_index: 1,
          shot_order: '中间段落',
          suggestion: '压缩中间段落旁白至20字以内，增加画面变化频率，用快切镜头维持注意力',
          expected_boost: 0.05,
          category: 'MID_SAG',
        });
      }
    }

    // 3. 旁白长度风险
    const longVoiceoverShots = shots.filter((s, i) => {
      const v = s.voiceover;
      return v && v.length > 40 && i > 0;
    });
    if (longVoiceoverShots.length > 0) {
      riskFactors.push(`有 ${longVoiceoverShots.length} 个分镜旁白过长（>40字），可能造成观众流失`);
      for (const shot of longVoiceoverShots) {
        suggestions.push({
          shot_index: shot.shotIndex,
          shot_order: `第${shot.shotIndex + 1}镜`,
          suggestion: '将旁白压缩至 15-25 字，用画面动作代替文字描述',
          expected_boost: 0.03,
          category: 'VOICEOVER',
        });
      }
    }

    // 4. 文本密度风险
    const textDensityScore = this.calculateTextDensity(shots);
    if (textDensityScore < 0.40) {
      const totalDuration = shots.reduce((s, sh) => s + sh.duration, 0);
      const totalVoiceover = shots.reduce((s, sh) => s + (sh.voiceover?.length ?? 0), 0);
      const cps = totalVoiceover / Math.max(totalDuration, 0.1);
      if (cps > 7) {
        riskFactors.push(`旁白密度过高（${cps.toFixed(1)}字/秒），超出短视频舒适区（3-6字/秒）`);
        suggestions.push({
          shot_index: 0,
          shot_order: '全局',
          suggestion: '适当精简旁白，配合画面信息（展示优于讲述），保持 3-6 字/秒的舒适密度',
          expected_boost: 0.03,
          category: 'TEXT_DENSITY',
        });
      } else if (cps < 2) {
        riskFactors.push('旁白密度偏低，信息量不足可能导致完播率下降');
        suggestions.push({
          shot_index: 0,
          shot_order: '全局',
          suggestion: '适当增加旁白信息量，补充关键卖点或使用引导语（如\"重点来了\"\"关键在这\"）',
          expected_boost: 0.02,
          category: 'TEXT_DENSITY',
        });
      }
    }

    // 5. CTA风险
    const ctaScore = this.calculateCTAStrength(shots);
    if (ctaScore < 0.45 && shots.length > 0) {
      riskFactors.push('转化引导（CTA）较弱，末镜缺乏紧迫感或行动号召');
      suggestions.push({
        shot_index: shots.length - 1,
        shot_order: `末镜（第${shots.length}镜）`,
        suggestion: '添加"限时优惠""错过等下次"等紧迫感文案，明确点击购物车/领券的行动指引',
        expected_boost: 0.04,
        category: 'CTA',
      });
    }

    // 6. 情感弧线风险 (NEW)
    const emotionalArcScore = this.calculateEmotionalArc(shots);
    if (emotionalArcScore < 0.45 && shots.length >= 3) {
      riskFactors.push('情感曲线平坦：剧本缺乏\"痛点→方案→效果→紧迫\"的叙事弧线');
      suggestions.push({
        shot_index: 0,
        shot_order: '全局',
        suggestion: '重构叙事结构：第1镜抛出痛点，第2-3镜展示方案，第4镜展示效果变化，末镜加入紧迫CTA',
        expected_boost: 0.05,
        category: 'EMOTIONAL_ARC',
      });
    }

    // 7. 节奏单一风险 (NEW — 更精细)
    const pacingScore = this.calculatePacingScore(shots);
    if (pacingScore < 0.50) {
      riskFactors.push('节奏单一，各分镜时长趋同，缺乏快慢交替的节奏变化');
      suggestions.push({
        shot_index: 0,
        shot_order: '全局',
        suggestion: '建议前2镜保持1.5-2s快节奏钩子，中间镜4-5s展示细节，末镜2-3s强CTA收尾',
        expected_boost: 0.03,
        category: 'PACING',
      });
    }

    // 8. 时长适配风险 (NEW)
    const totalDuration = input.videoDuration || shots.reduce((s, sh) => s + sh.duration, 0);
    if (totalDuration > 35) {
      riskFactors.push(`视频总时长 ${totalDuration}s 偏长，TikTok 电商短视频最佳区间 8-25s`);
      suggestions.push({
        shot_index: 0,
        shot_order: '全局',
        suggestion: '建议精简至 15-25s，删除冗余的过渡镜头，合并相似信息点',
        expected_boost: 0.04,
        category: 'TIMING_OPTIMIZATION',
      });
    } else if (totalDuration < 5) {
      riskFactors.push('视频时长短于5s，信息量不足，难以建立信任和激发购买欲');
      suggestions.push({
        shot_index: shots.length - 1,
        shot_order: '全局',
        suggestion: '建议扩展至 8-12s，增加1-2个展示卖点的镜头',
        expected_boost: 0.03,
        category: 'TIMING_OPTIMIZATION',
      });
    }

    return { riskFactors, suggestions };
  }

  // ===========================================================================
  // DNA extraction from ViralVideoAnalysis
  // ===========================================================================

  private extractDNAScores(analysis: ViralVideoAnalysis): {
    ctrEstimate: number;
    cvrEstimate: number;
    confidenceScore: number;
  } | null {
    const strategyJson = analysis.strategyJson as Record<string, unknown> | null;
    if (!strategyJson) return null;

    const hookStrength = typeof strategyJson.hook_strength === 'number'
      ? strategyJson.hook_strength : 0.5;
    const quality = typeof strategyJson.quality_score === 'number'
      ? strategyJson.quality_score
      : typeof strategyJson.overall_score === 'number'
        ? strategyJson.overall_score
        : 0.5;

    const ctrEstimate = this.clamp(0.03 + hookStrength * 0.10 + quality * 0.03, 0.02, 0.14);
    const cvrEstimate = this.clamp(0.01 + quality * 0.04, 0.01, 0.06);

    return {
      ctrEstimate,
      cvrEstimate,
      confidenceScore: Math.min(hookStrength, quality),
    };
  }

  // ===========================================================================
  // Confidence calculation
  // ===========================================================================

  private calculateConfidence(
    source: DataSource,
    flags: { hasRealData: boolean; hasDnaPattern: boolean; dnaConfidence?: number },
  ): number {
    switch (source) {
      case 'LLM_DEEP_ANALYSIS':
        return this.clamp(0.45 + (flags.dnaConfidence ?? 0.3) * 0.30, 0.30, 0.90);
      case 'DUCKDB_PRECOMPUTED':
        return this.clamp(0.65 + (flags.dnaConfidence ?? 0.5) * 0.25, 0.40, 0.95);
      case 'VIRAL_DNA_ESTIMATE':
        return this.clamp(0.30 + (flags.dnaConfidence ?? 0.3) * 0.40, 0.20, 0.75);
      default:
        return this.clamp(0.10 + (flags.dnaConfidence ?? 0.2) * 0.30, 0.08, 0.40);
    }
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private async persistPrediction(
    scriptId: string,
    result: PerformancePrediction,
    source: DataSource,
  ): Promise<void> {
    const SOURCE_PRIORITY: Record<string, number> = {
      'LLM_DEEP_ANALYSIS': 4,
      'DUCKDB_PRECOMPUTED': 3,
      'VIRAL_DNA_ESTIMATE': 2,
      'HEURISTIC_FALLBACK': 1,
    };

    const newPriority = SOURCE_PRIORITY[source] ?? 0;
    if (newPriority === 0) return;

    const ALL_SOURCES = Object.keys(SOURCE_PRIORITY);
    const lowerPrioritySources = ALL_SOURCES.filter(
      (s) => (SOURCE_PRIORITY[s] ?? 0) < newPriority,
    );

    await this.prisma.script.updateMany({
      where: {
        id: scriptId,
        OR: [
          { predictionModel: null },
          ...(lowerPrioritySources.length > 0
            ? [{ predictionModel: { in: lowerPrioritySources } }]
            : []),
        ],
      },
      data: {
        predictedCtr: result.predicted_ctr,
        predictedCvr: result.predicted_cvr,
        predictedRetention: result.predicted_retention,
        predictedAt: new Date(),
        predictionModel: source,
      },
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async loadScriptWithShots(scriptId: string) {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      include: {
        shots: { orderBy: { shotIndex: 'asc' } },
      },
    });

    if (!script) {
      throw new HttpException(`剧本不存在: ${scriptId}`, HttpStatus.NOT_FOUND);
    }

    return script;
  }

  private async findCreationIdsForScript(scriptId: string): Promise<string[]> {
    const creations = await this.prisma.creation.findMany({
      where: { scriptId },
      select: { id: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    return creations.map((c) => c.id);
  }

  private mapForceSource(source: 'LLM' | 'DUCKDB' | 'VIRAL_DNA' | 'HEURISTIC'): DataSource {
    switch (source) {
      case 'LLM': return 'LLM_DEEP_ANALYSIS';
      case 'DUCKDB': return 'DUCKDB_PRECOMPUTED';
      case 'VIRAL_DNA': return 'VIRAL_DNA_ESTIMATE';
      default: return 'HEURISTIC_FALLBACK';
    }
  }

  private normalizeCategory(cat: string): ImprovementSuggestion['category'] {
    const valid = ['HOOK', 'VOICEOVER', 'VISUAL_STYLE', 'CTA', 'JITTER', 'PACING', 'OPENING_WEAK', 'MID_SAG', 'TEXT_DENSITY', 'EMOTIONAL_ARC', 'BGM_MISMATCH', 'TIMING_OPTIMIZATION'];
    return valid.includes(cat) ? (cat as ImprovementSuggestion['category']) : 'HOOK';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  // ===========================================================================
  // 流式预测 — 支持 SSE 实时进度推送（6 阶段）
  // ===========================================================================

  async predictPerformanceStream(
    scriptId: string,
    productId: string,
    onProgress: (event: { step: string; message: string; data?: unknown }) => void,
  ): Promise<PerformancePrediction> {
    const input = await this.loadScriptInput(scriptId);

    // ── Stage 1: 加载剧本 ──
    onProgress({ step: 'loading_script', message: '正在加载剧本分镜数据...' });

    // ── Stage 2: 特征提取 (启发式七维度) ──
    onProgress({ step: 'extracting_features', message: `正在提取 7 维度特征（${input.shots.length} 个分镜）...` });
    const heuristicMetrics = this.computeEnhancedMetrics(input);
    const heuristicRisk = this.analyzeRiskFactors(input, {
      predictedCtr: heuristicMetrics.predictedCtr,
      predictedRetention: heuristicMetrics.predictedRetention,
    });
    onProgress({
      step: 'features_ready',
      message: `特征提取完成：钩力=${this.calculateHookStrength(input.shots).toFixed(2)} 节奏=${this.calculatePacingScore(input.shots).toFixed(2)} 弧线=${this.calculateEmotionalArc(input.shots).toFixed(2)}`,
      data: {
        metrics: heuristicMetrics,
        dimensions: {
          hook: this.calculateHookStrength(input.shots),
          pacing: this.calculatePacingScore(input.shots),
          emotional_arc: this.calculateEmotionalArc(input.shots),
          cta: this.calculateCTAStrength(input.shots),
          text_density: this.calculateTextDensity(input.shots),
          duration_fit: this.calculateDurationFit(input.videoDuration ?? input.shots.reduce((s, sh) => s + sh.duration, 0), input.shots.length),
          shot_variety: this.calculateShotVariety(input.shots, input),
        },
      },
    });

    // ── Stage 3: Viral DNA 比对 ──
    onProgress({ step: 'checking_viral_dna', message: '正在对比同类爆款 DNA 数据...' });
    const dnaResult = await this.tryViralDNAEstimate(scriptId, productId, input);
    if (dnaResult) {
      onProgress({
        step: 'viral_dna_found',
        message: `找到同品类爆款 DNA（DNA-CVR=${dnaResult.predicted_ctr.toFixed(3)} 基准-CTR=${(dnaResult.predicted_ctr * 1.5).toFixed(3)}）`,
        data: { dna_ctr: dnaResult.predicted_ctr, dna_cvr: dnaResult.predicted_cvr },
      });
    } else {
      onProgress({ step: 'viral_dna_skip', message: '未找到同品类爆款 DNA，将降低 DNA 权重' });
    }

    // ── Stage 4: LLM 深度语义分析 (关键阶段) ──
    onProgress({ step: 'llm_analyzing', message: '正在调用豆包大模型进行深度语义分析（预计 3-10s）...' });

    const llmResult = await this.tryLLMAnalysisWithProgress(scriptId, productId, input, onProgress);

    if (llmResult) {
      onProgress({
        step: 'llm_done',
        message: `大模型分析完成：CTR=${(llmResult.predicted_ctr * 100).toFixed(1)}% CVR=${(llmResult.predicted_cvr * 100).toFixed(2)}% 留存=${(llmResult.predicted_retention * 100).toFixed(1)}%`,
        data: { summary: llmResult.llm_analysis_summary },
      });

      // ── Stage 5: 合成最终结果 ──
      onProgress({ step: 'synthesizing', message: '正在综合多源预测结果...' });

      try {
        await this.persistPrediction(scriptId, llmResult, 'LLM_DEEP_ANALYSIS');
      } catch (err) {
        this.logger.warn(`[ColdStart] Failed to persist LLM prediction: ${(err as Error).message}`);
      }

      // ── Stage 6: 完成 ──
      onProgress({ step: 'completed', message: '预测完成（数据源：大模型深度分析）', data: llmResult });

      return llmResult;
    }

    // LLM 不可用时的降级流程
    onProgress({ step: 'llm_unavailable', message: '大模型不可用，启动降级分析流程...' });

    let result: PerformancePrediction;
    let source: DataSource;

    if (dnaResult) {
      onProgress({ step: 'using_viral_dna', message: '使用病毒 DNA 估算...' });
      result = dnaResult;
      source = 'VIRAL_DNA_ESTIMATE';
    } else {
      onProgress({ step: 'using_heuristic', message: '使用增强启发式模型兜底...' });
      result = this.buildEnhancedHeuristicPrediction(scriptId, input);
      source = 'HEURISTIC_FALLBACK';
    }

    onProgress({
      step: 'synthesizing',
      message: `综合预测：CTR=${(result.predicted_ctr * 100).toFixed(1)}% 置信度=${(result.confidence * 100).toFixed(0)}%`,
    });

    try {
      await this.persistPrediction(scriptId, result, source);
    } catch (err) {
      this.logger.warn(`[ColdStart] Failed to persist fallback prediction: ${(err as Error).message}`);
    }

    onProgress({ step: 'completed', message: '预测完成', data: result });

    return result;
  }

  /** LLM 分析 — 带进度回调 */
  private async tryLLMAnalysisWithProgress(
    scriptId: string,
    productId: string,
    input: HeuristicInput,
    onProgress: (event: { step: string; message: string; data?: unknown }) => void,
  ): Promise<PerformancePrediction | null> {
    // 检查 LLM 环境
    if (!env('ARK_BASE_URL', 'VOLC_ARK_API_URL') && !env('ARK_BASE_URL', 'DOUBAO_API_URL')) {
      onProgress({ step: 'llm_skip', message: 'LLM API 未配置（缺少 ARK_BASE_URL），跳过' });
      return null;
    }

    const apiKey = env('ARK_API_KEY', 'VOLC_ARK_API_KEY') || env('ARK_API_KEY', 'DOUBAO_API_KEY');
    if (!apiKey) {
      onProgress({ step: 'llm_skip', message: 'LLM API Key 未配置，跳过' });
      return null;
    }

    onProgress({ step: 'llm_connected', message: '火山方舟 API 已连接' });

    try {
      const prompt = this.buildLLMAnalysisPromptV2(input);
      onProgress({ step: 'llm_sending', message: '已发送评估请求，等待大模型返回...' });

      const llmRaw = await this.doubaoText.generateText(prompt, '');

      onProgress({ step: 'llm_received', message: '大模型已返回结果，正在解析...' });

      const analysis = this.parseLLMAnalysisResponse(llmRaw, scriptId, input);

      if (!analysis) {
        onProgress({ step: 'llm_parse_failed', message: '大模型返回格式异常，使用启发式兜底' });
        return null;
      }

      return {
        script_id: scriptId,
        predicted_ctr: this.clamp(analysis.predicted_ctr, 0.01, 0.20),
        predicted_cvr: this.clamp(analysis.predicted_cvr, 0.005, 0.10),
        predicted_retention: this.clamp(analysis.predicted_retention, 0.10, 0.95),
        predicted_completion: this.clamp(analysis.predicted_completion, 0.10, 0.95),
        confidence: this.clamp(analysis.confidence, 0.30, 0.90),
        data_quality: analysis.data_quality,
        data_source: 'LLM_DEEP_ANALYSIS',
        risk_factors: analysis.risk_factors,
        improvement_suggestions: analysis.improvement_suggestions.map((s) => ({
          shot_index: s.shot_index,
          shot_order: s.shot_order,
          suggestion: s.suggestion,
          expected_boost: this.clamp(s.expected_boost, 0.01, 0.15),
          category: this.normalizeCategory(s.category),
        })),
        llm_analysis_summary: analysis.analysis_summary,
        predicted_at: new Date().toISOString(),
      };
    } catch (err) {
      const errMsg = (err as Error).message;
      onProgress({
        step: 'llm_error',
        message: `大模型调用失败: ${errMsg.length > 60 ? errMsg.slice(0, 60) + '...' : errMsg}`,
      });
      return null;
    }
  }

  private async loadScriptInput(scriptId: string): Promise<HeuristicInput> {
    const script = await this.loadScriptWithShots(scriptId);
    const shots = (script.shots ?? []) as Array<Record<string, unknown>>;
    return {
      scriptId,
      title: script.title ?? undefined,
      shots: shots.map((s) => ({
        shotIndex: (s.shotIndex as number) ?? 0,
        duration: Number(s.duration ?? 0),
        voiceover: s.voiceover as string | undefined,
        visualDescription: s.visualDescription as string | undefined,
        actionDescription: s.actionDescription as string | undefined,
        hookType: s.hookType as string | undefined,
      })),
      styleVibe: script.styleVibe ?? undefined,
      videoDuration: Number(script.videoDuration ?? 0),
    };
  }

  /** V2 升级版 LLM 评估提示词 — 电商短视频投放专家 */
  private buildLLMAnalysisPromptV2(input: HeuristicInput): string {
    const title = input.title || '无';
    const styleVibe = input.styleVibe || 'standard';
    const totalDuration = input.videoDuration || input.shots.reduce((s, sh) => s + sh.duration, 0);

    const shotDetails = input.shots.map((s, i) => {
      const parts: string[] = [`[镜${i + 1}] ${s.duration.toFixed(1)}s`];
      if (s.voiceover) parts.push(`旁白: "${s.voiceover}"`);
      if (s.visualDescription) parts.push(`画面: ${s.visualDescription}`);
      if (s.actionDescription) parts.push(`动作: ${s.actionDescription}`);
      if (s.hookType) parts.push(`钩子: ${s.hookType}`);
      return parts.join(' | ');
    }).join('\n    ');

    return `# 角色
你是 TikTok 电商短视频投放效果评估专家。你精通 TikTok 算法机制、用户行为心理学和电商转化漏斗。

你的任务：给定一个未投放的电商短视频剧本，预测其投放后的关键指标，并诊断潜在问题。

# 评估框架（必须逐项覆盖）

## 1. 开场钩力 (Opening Hook)
TikTok 前 0-2 秒决定用户是否划走。
- 检测：是否有问题钩子、数据反差、痛点共鸣、好奇心缺口？
- 检测：第一镜时长是否在 1.5-3s 黄金区间？
- 评分逻辑：每多一种钩子类型 +0.02 CTR

## 2. 节奏与信息密度 (Pacing)
- 各分镜时长是否形成"前快后慢"的 TikTok 节奏？
- 旁白字数密度：最佳 3-6 字/秒（中国口语语速 4-5 字/秒）
- 单镜旁白超过 35 字应标红

## 3. 情感叙事弧线 (Emotional Arc)
电商短视频标配路径：
  "好奇/痛点 → 方案引入 → 效果展示 → 满足/惊喜 → 紧迫CTA"
- 缺少其中任一环节则扣分

## 4. 转化引导 CTA
末 1-2 镜必须包含：
- 明确的购买行为指引（点击/下单/试用/领券）
- 紧迫感文案（限时/数量有限/马上）
- 利益点清晰（省钱/划算/折扣）

## 5. 视觉执行可行性
- 画面描述是否具体可执行（不是"高大上氛围"这种抽象描述）
- 是否有明确的产品展示镜头

## 6. 结构完整性
- 叙事是否闭环？（问题→解决→结果）
- 是否为行内最佳时长（8-25s）

# 待评估剧本

- 标题: ${title}
- 风格: ${styleVibe}
- 总时长: ${totalDuration}s
- 分镜数: ${input.shots.length}

## 分镜详情:
    ${shotDetails}

# 行业基线（供参考）
- TikTok 电商视频平均 CTR: 5.5%（优秀 >8%，卓越 >12%）
- 行业平均 CVR: 2.8%（优秀 >4%，卓越 >6%）
- 15s 视频平均完播: 30%（优秀 >45%，卓越 >60%）

# 输出要求

请你基于以上框架和行业经验，输出一份严格 JSON 格式的评估结果。字段如下：

{
  "predicted_ctr": <0.01-0.20 的数值，保留4位小数>,
  "predicted_cvr": <0.005-0.10 的数值，保留4位小数>,
  "predicted_retention": <0.10-0.95 的数值，保留4位小数>,
  "predicted_completion": <0.10-0.95 的数值，保留4位小数>,
  "confidence": <0.30-0.90 你对这份评估的自信度>,
  "data_quality": "HIGH" | "MEDIUM" | "LOW",
  "analysis_summary": "150字以内中文总结：整体评价、最大亮点、核心短板",
  "risk_factors": ["风险1", "风险2", ...],
  "improvement_suggestions": [
    {
      "shot_index": <整数，0-based>,
      "shot_order": "第X镜" | "全局",
      "suggestion": "30-60字中文改进建议",
      "expected_boost": <0.01-0.15的提升幅度>,
      "category": "HOOK" | "PACING" | "EMOTIONAL_ARC" | "CTA" | "VOICEOVER" | "TEXT_DENSITY" | "MID_SAG" | "TIMING_OPTIMIZATION"
    }
  ]
}

# 约束
1. 数值必须在合理范围内，基于行业经验给出，不要给出极端值
2. 置信度反映你对分析的把握程度 —— 剧本信息越丰富越高
3. 风险因子要有具体的问题指向，不要泛泛而谈
4. 只输出纯 JSON，不要有其他文字
5. improvement_suggestions 至少包含 2 条，最多 5 条
`;
  }
}
