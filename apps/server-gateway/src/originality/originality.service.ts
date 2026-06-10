/**
 * 视频原创度检测与优化服务
 *
 * 核心流程：
 * 1. 接收新生成视频的描述文本
 * 2. 通过 ImageBind 生成文本向量
 * 3. 在 Qdrant asset_materials 集合中搜索相似视频
 * 4. 若相似度超阈值，调用 LLM 生成优化建议
 * 5. 返回原创度评分和优化方案
 */

import { Injectable, Logger } from '@nestjs/common';
import { QdrantClientService } from '../../services/ai/qdrant-client.service';
import { ImageBindClientService } from '../../services/ai/imagebind-client.service';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { ORIGINALITY_CONSTANTS } from './originality.constants';
import {
  OriginalityCheckResponse,
  OriginalityOptimizer,
  OptimizationSuggestion,
  SimilarVideoInfo,
} from './originality.types';

@Injectable()
export class OriginalityService {
  private readonly logger = new Logger(OriginalityService.name);

  constructor(
    private readonly qdrantClient: QdrantClientService,
    private readonly imageBindClient: ImageBindClientService,
    private readonly doubaoText: DoubaoTextProvider,
  ) {}

  /**
   * 执行原创度检查
   */
  async checkOriginality(
    creationId: string,
    videoDescription: string,
    sceneDescriptions?: string[],
  ): Promise<OriginalityCheckResponse> {
    this.logger.log(`[Originality] Checking: creation_id=${creationId}`);

    try {
      // Step 1: 生成视频描述的向量
      const embedding = await this.imageBindClient.embedQuery({ text: videoDescription });
      if (!embedding) {
        this.logger.warn(`[Originality] Embedding failed for creation ${creationId}, bypassing check`);
        return { originality_score: 1.0, passed: true, optimizer: null };
      }

      // Step 2: 在 Qdrant asset_materials 集合中搜索相似视频
      const searchResults = await this.qdrantClient.search({
        vector: embedding,
        limit: ORIGINALITY_CONSTANTS.SIMILARITY_TOP_K,
        collectionName: 'asset_materials',
      });

      // Step 3: 过滤相似度超过阈值的视频
      const similarVideos: SimilarVideoInfo[] = searchResults
        .filter((r) => r.score >= ORIGINALITY_CONSTANTS.SIMILARITY_THRESHOLD)
        .map((r) => ({
          material_id: String(r.id),
          similarity_score: r.score,
          title: r.payload?.title as string | undefined,
          thumbnail_url: r.payload?.thumbnail_url as string | undefined,
        }));

      const similarityScore = similarVideos.length > 0
        ? Math.max(...similarVideos.map((v) => v.similarity_score))
        : 0;

      const originalityScore = 1 - similarityScore;

      // Step 4: 如果无重复，直接通过
      if (similarVideos.length === 0) {
        this.logger.log(`[Originality] PASSED: creation_id=${creationId}, score=${originalityScore.toFixed(3)}`);
        return {
          originality_score: originalityScore,
          passed: true,
          optimizer: null,
        };
      }

      // Step 5: 检测重复分镜（根据场景描述分别搜索）
      const duplicateSections = await this.detectDuplicateSections(
        sceneDescriptions || [],
        embedding,
      );

      // Step 6: 调用 LLM 生成优化建议
      const optimizer = await this.generateOptimizationSuggestions(
        creationId,
        similarVideos,
        similarityScore,
        duplicateSections,
      );

      this.logger.warn(
        `[Originality] DUPLICATE DETECTED: creation_id=${creationId}, ` +
        `similar_count=${similarVideos.length}, score=${originalityScore.toFixed(3)}`,
      );

      return {
        originality_score: originalityScore,
        passed: originalityScore >= ORIGINALITY_CONSTANTS.MIN_ORIGINALITY_SCORE,
        optimizer,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Originality] Check failed for creation ${creationId}: ${msg}`);
      // 降级放行：检测失败不应阻塞创作流程
      return { originality_score: 1.0, passed: true, optimizer: null };
    }
  }

  /**
   * 检测重复分镜：对每个分镜的场景描述分别做向量搜索
   */
  private async detectDuplicateSections(
    sceneDescriptions: string[],
    fullEmbedding: number[],
  ): Promise<number[]> {
    if (sceneDescriptions.length === 0) return [];

    const duplicateSections: number[] = [];

    for (let i = 0; i < sceneDescriptions.length; i++) {
      const desc = sceneDescriptions[i];
      if (!desc || desc.trim().length === 0) continue;

      try {
        const sceneEmbedding = await this.imageBindClient.embedQuery({ text: desc });
        if (!sceneEmbedding) continue;

        const sceneResults = await this.qdrantClient.search({
          vector: sceneEmbedding,
          limit: 3,
          collectionName: 'asset_materials',
        });

        const hasDuplicate = sceneResults.some(
          (r) => r.score >= ORIGINALITY_CONSTANTS.SIMILARITY_THRESHOLD,
        );

        if (hasDuplicate) {
          duplicateSections.push(i + 1); // 分镜索引从 1 开始
        }
      } catch {
        this.logger.debug(`[Originality] Scene ${i + 1} embedding search failed, skipping`);
      }
    }

    return duplicateSections;
  }

  /**
   * 调用 LLM 生成优化建议
   */
  private async generateOptimizationSuggestions(
    creationId: string,
    similarVideos: SimilarVideoInfo[],
    similarityScore: number,
    duplicateSections: number[],
  ): Promise<OriginalityOptimizer> {
    const similarityAnalysis = {
      detected_similar_videos: similarVideos,
      similarity_score: similarityScore,
      duplicate_sections: duplicateSections,
    };

    let optimizationSuggestions: OptimizationSuggestion[] = [];

    try {
      const systemPrompt = ORIGINALITY_CONSTANTS.OPTIMIZATION_PROMPT.system;
      const userPrompt = ORIGINALITY_CONSTANTS.OPTIMIZATION_PROMPT.userTemplate
        .replace('{similar_count}', String(similarVideos.length))
        .replace('{similarity_score}', similarityScore.toFixed(3))
        .replace('{duplicate_sections}', JSON.stringify(duplicateSections));

      const llmRaw = await this.doubaoText.generateText(systemPrompt, userPrompt);

      // 解析 LLM 返回的 JSON
      const jsonMatch = llmRaw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
        optimizationSuggestions = parsed.map((item, idx) => ({
          section: (item.section as number) ?? duplicateSections[idx] ?? 1,
          technique: (item.technique as OptimizationSuggestion['technique']) ?? 'recolor',
          params: (item.params as Record<string, unknown>) ?? {},
          expected_impact: (item.expected_impact as number) ?? 0.1,
          description: (item.description as string) ?? `优化分镜 ${idx + 1}`,
        }));
      }
    } catch (error) {
      this.logger.warn(
        `[Originality] LLM suggestion generation failed for ${creationId}: ${(error as Error).message}`,
      );
      // 降级：使用规则生成基础建议
      optimizationSuggestions = duplicateSections.map((section) => ({
        section,
        technique: 'recolor' as const,
        expected_impact: 0.10,
        description: `对分镜 ${section} 进行色调调整以提高原创度`,
      }));
    }

    // 计算优化后的预估原创度分数
    const totalImpact = optimizationSuggestions.reduce(
      (sum, s) => sum + s.expected_impact,
      0,
    );
    const originalityScoreAfter = Math.min(
      0.95,
      (1 - similarityScore) + totalImpact,
    );

    return {
      similarity_analysis: similarityAnalysis,
      optimization_suggestions: optimizationSuggestions,
      originality_score_after: Math.round(originalityScoreAfter * 100) / 100,
    };
  }
}
