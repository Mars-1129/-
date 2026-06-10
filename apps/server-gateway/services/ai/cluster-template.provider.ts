// =============================================================================
// TikStream AI — Cluster Template AI Provider
// =============================================================================
// 从多条爆款视频分析记录中自动聚类归纳为模板策略
// =============================================================================

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DoubaoTextProvider } from './doubao-text.provider';
import { ViralVideoAnalysisDetail } from '@tikstream/shared-types';

export interface ClusterInput {
  analyses: ViralVideoAnalysisDetail[];
}

export interface ClusterOutput {
  strategy_summary: string;
  factor_json: Record<string, unknown>;
  clustered_analysis_ids: string[];
}

const CLUSTER_SYSTEM_PROMPT = `你是一名专业的短视频方法论研究员。
你的任务是从一批同套路的爆款短视频的结构化拆解数据中，提取共性模式，归纳为一个可复用的创作模板。

输入数据包含多条爆款视频的分析记录，每条记录包含：
- strategy_json: 该视频的策略分析（节奏、叙事、转化漏斗）
- factor_json: 该视频的关键因子（hook风格、叙事语调、运镜偏好等）
- report_json: 该视频的综合报告

你需要完成以下任务：
1. 归纳这些视频的共性套路，提炼为一段简洁的策略摘要。
2. 将这些视频的关键因子聚合为一个综合因子配置。

策略摘要要求：
- 用200-400字描述这一套路的核心理念、叙事结构、节奏模式和转化漏斗。
- 突出共性而非个别特征。
- 使用专业的短视频内容创作术语。

因子配置要求（JSON 格式）：
- 必须包含以下分镜阶段级因子（stage_factors），描述每个阶段的创作要点：
  - opening: 开场阶段（前1-3秒）的创作要点（如"轻柔音乐引入+产品特写"）
  - hook_body: Hook主体阶段（3-6秒）的创作要点（如"痛点场景+矛盾冲突"）
  - product_showcase: 产品展示阶段的创作要点（如"多角度转场+细节特写"）
  - social_proof: 社交信任阶段的创作要点（如"使用场景+好评展示"）
  - cta_closing: CTA收尾阶段的创作要点（如"品牌名黑屏收尾+限时引导"）
- 每个阶段因子为对象，可包含 music_style, visual_style, pacing, text_overlay, transition 等子项。
- 此外必须包含以下通用因子（从多条分析中聚合）：
  - optimal_shot_count: 推荐分镜数量（取众数或均值范围）
  - optimal_total_duration: 推荐总时长（取众数或均值范围）
  - camera_patterns: 运镜模式（聚合出现频率最高的运镜组合）
  - transition_preference: 转场偏好
  - bgm_style: BGM风格
  - cta_placement: CTA放置策略
  - hook_style: Hook风格
  - narrative_tone: 叙事语调
  - caption_density: 字幕密度等级

输出必须是纯 JSON（不含 markdown 标记），格式为：
{
  "strategy_summary": "归纳后的策略摘要",
  "factor_json": {
    "stage_factors": {
      "opening": { "music_style": "...", "visual_style": "...", ... },
      "hook_body": { ... },
      "product_showcase": { ... },
      "social_proof": { ... },
      "cta_closing": { ... }
    },
    "optimal_shot_count": ...,
    "optimal_total_duration": ...,
    "camera_patterns": [...],
    "transition_preference": "...",
    "bgm_style": "...",
    "cta_placement": "...",
    "hook_style": "...",
    "narrative_tone": "...",
    "caption_density": "..."
  }
}`;

@Injectable()
export class ClusterTemplateProvider {
  private readonly logger = new Logger(ClusterTemplateProvider.name);

  constructor(private readonly doubaoTextProvider: DoubaoTextProvider) {}

  async cluster(analyses: ViralVideoAnalysisDetail[]): Promise<ClusterOutput> {
    this.logger.log(`Clustering ${analyses.length} viral video analyses into a template`);

    if (analyses.length === 0) {
      throw new HttpException(
        {
          message: '聚类分析失败：输入数据为空',
          error: {
            code: 'CLUSTER_INPUT_EMPTY',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const userPrompt = this.buildClusterUserPrompt(analyses);

    try {
      const rawResponse = await this.doubaoTextProvider.generateText(
        CLUSTER_SYSTEM_PROMPT,
        userPrompt,
      );

      return this.parseClusterResponse(rawResponse, analyses);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Cluster AI call failed: ${error}`);
      throw new HttpException(
        {
          message: 'AI 聚类分析失败：模型服务不可用',
          error: {
            code: 'MODEL_PROVIDER_FAILED',
            retryable: true,
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private buildClusterUserPrompt(analyses: ViralVideoAnalysisDetail[]): string {
    const serialized = analyses.map((analysis, index) => {
      return [
        `【爆款视频 ${index + 1}】`,
        `平台: ${analysis.source_platform}`,
        `标题: ${analysis.title || '未知'}`,
        `Hook类型: ${analysis.hook_type || '未知'}`,
        `策略分析: ${JSON.stringify(analysis.strategy_json)}`,
        `关键因子: ${JSON.stringify(analysis.factor_json)}`,
        `综合报告: ${JSON.stringify(analysis.report_json)}`,
        `---`,
      ].join('\n');
    });

    return [
      `请对以下 ${analyses.length} 条同套路爆款视频的拆解数据进行聚类归纳：`,
      '',
      ...serialized,
      '',
      '请提取共性模式，归纳为一个可复用的创作模板策略。',
      '输出 ONLY valid JSON，不要包含任何 markdown 标记。',
    ].join('\n');
  }

  private parseClusterResponse(
    rawResponse: string,
    analyses: ViralVideoAnalysisDetail[],
  ): ClusterOutput {
    let cleaned = rawResponse.trim();

    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      this.logger.error(`Failed to parse cluster response: ${rawResponse.substring(0, 500)}`);
      throw new HttpException(
        {
          message: 'AI 聚类分析失败：返回数据格式异常',
          error: {
            code: 'CLUSTER_PARSE_FAILED',
            retryable: false,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const strategySummary = parsed.strategy_summary as string | undefined;
    const factorJson = parsed.factor_json as Record<string, unknown> | undefined;

    if (
      !strategySummary ||
      typeof strategySummary !== 'string' ||
      strategySummary.trim().length === 0
    ) {
      throw new HttpException(
        {
          message: 'AI 聚类分析失败：策略摘要为空',
          error: {
            code: 'CLUSTER_STRATEGY_EMPTY',
            retryable: false,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (!factorJson || typeof factorJson !== 'object' || Object.keys(factorJson).length === 0) {
      throw new HttpException(
        {
          message: 'AI 聚类分析失败：因子配置为空',
          error: {
            code: 'CLUSTER_FACTOR_EMPTY',
            retryable: false,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return {
      strategy_summary: strategySummary.trim(),
      factor_json: factorJson,
      clustered_analysis_ids: analyses.map((a) => a.analysis_id),
    };
  }
}
