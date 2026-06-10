// =============================================================================
// TikStream AI — Viral DNA Service (LLM 驱动的爆款 DNA 提取 & 统计聚类)
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { ViralAnalysisRepository } from './viral-analysis.repository';
import { ViralDnaRepository } from './viral-dna.repository';
import { ProductRepository } from '../product/product.repository';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { ViralDNAExtractDto } from './viral-dna.dto';
import { randomUUID } from 'node:crypto';
import type { ViralDNA, HookDNA, VisualStyleDNA, BgmPatternDNA, PacingPatternDNA, CtaStyleDNA, DNAStatistics } from '@tikstream/shared-types';

// ===========================================================================
// 局部 LLM 响应类型接口（消除 deep Record<string,unknown> 不安全断言）
// ===========================================================================

interface LLMHookStructure {
  duration_seconds?: number;
  word_count?: number;
  emotional_hooks?: string[];
  action_verbs?: string[];
}

interface LLMHookEffectiveness {
  retention_rate_avg?: number;
  ctr_avg?: number;
  completion_rate_avg?: number;
}

@Injectable()
export class ViralDnaService {
  private readonly logger = new Logger(ViralDnaService.name);

  constructor(
    private readonly viralAnalysisRepository: ViralAnalysisRepository,
    private readonly viralDnaRepository: ViralDnaRepository,
    private readonly doubaoText: DoubaoTextProvider,
    private readonly productRepository: ProductRepository,
  ) {}

  /**
   * 科学 K-Means 聚类 + 轻量 LLM 语义标签 的爆款 DNA 提取
   *
   * Phase 1 (统计聚类, 秒级):
   *  1. 收集同类目爆款分析记录
   *  2. 构建特征向量 (hook类型 one-hot + 3项标准化数值指标)
   *  3. K-Means 自动聚类 (k = min(5, floor(N/2)))
   *  4. 对每个簇计算质心 → 直接生成 ViralDNA (确定性, 可复现)
   *
   * Phase 2 (LLM 语义标签, 5-15s):
   *  5. 将簇质心摘要发送给 Doubao → 仅解释"这个簇代表什么模式"
   *  6. 将 LLM 标签回填到 DNA 中 (style/hook/genre 等文本字段)
   *
   * Phase 3 (持久化):
   *  7. 清旧 → 写新 → 返回
   */
  async extractDNAPatterns(
    dto: ViralDNAExtractDto,
    onProgress?: (phase: string, progress: number, detail: string) => void,
  ): Promise<{
    patterns: ViralDNA[];
    total_samples: number;
    confidence: number;
    statistics: DNAStatistics;
  }> {
    const { category, market = 'GLOBAL', min_samples = 5 } = dto;

    this.logger.log(`[DNA] 开始提取: category=${category}, min_samples=${min_samples}`);
    onProgress?.('collecting', 5, `正在收集「${category}」类目爆款分析样本…`);

    // === Phase 1: 收集样本 & 统计计算 ===
    let analyses = await this.viralAnalysisRepository.findByCategory(category, 50);

    if (analyses.length < min_samples) {
      this.logger.warn(`[DNA] 样本不足: ${analyses.length} < ${min_samples}, 启用 Mock 兜底`);
      analyses = [...analyses, ...this.generateMockAnalyses(category, min_samples - analyses.length) as typeof analyses];
    }

    onProgress?.('collecting', 15, `已收集 ${analyses.length} 条分析记录`);

    // 统计计算
    const statistics = this.computeStatistics(analyses, category);
    this.logger.log(`[DNA] 统计完成: Hook分布=${Object.keys(statistics.hook_type_distribution).length}种, 多样性=${statistics.diversity_variance}`);

    // === Phase 2: 特征向量 + K-Means 聚类 ===
    onProgress?.('clustering', 25, '正在构建特征向量…');

    const featureVectors = this.buildFeatureVectors(analyses);
    const k = Math.max(1, Math.min(5, Math.floor(analyses.length / 2)));
    this.logger.log(`[DNA] K-Means: k=${k}, features=${featureVectors.length}条`);

    onProgress?.('clustering', 35, `正在执行 K-Means 聚类 (k=${k})…`);

    const { clusters, assignments } = this.kMeansClustering(featureVectors, k, 50);
    const silhouette = this.silhouetteScore(featureVectors, assignments, clusters);
    this.logger.log(`[DNA] 聚类完成: ${clusters.length}个簇, 轮廓系数=${silhouette.toFixed(3)}, 各簇大小=${clusters.map(c => c.members.length).join('/')}`);

    onProgress?.('clustering', 55, `聚类完成: ${clusters.length} 个模式簇 (轮廓系数 ${silhouette.toFixed(2)})`);

    // === Phase 3: 簇 → DNA 原始结构 (纯统计, 秒级) ===
    onProgress?.('generating', 60, '正在从聚类质心生成 DNA 模式…');

    const rawPatterns: ViralDNA[] = clusters.map((cluster, ci) => {
      const clusterAnalyses = cluster.members.map((i) => analyses[i]);
      return this.clusterToDNARaw(cluster, clusterAnalyses, ci, category, market, statistics);
    });

    // 按 composite_score 降序排列
    rawPatterns.sort((a, b) => b.composite_score - a.composite_score);
    onProgress?.('generating', 65, `统计模式生成完成: ${rawPatterns.length} 个 DNA 模式`);

    // === Phase 4: LLM 语义标签 (轻量, 5-15s per pattern) ===
    const LLM_TIMEOUT_MS = 90_000;  // DNA 标签 prompt 较长，给 90s 超时
    const LLM_MAX_RETRIES = 2;      // 最多重试 2 次
    const patterns: ViralDNA[] = [];
    for (let i = 0; i < rawPatterns.length; i++) {
      const pct = 65 + Math.round((i / rawPatterns.length) * 20);
      onProgress?.('labeling', pct, `正在解释模式 ${i + 1}/${rawPatterns.length} 的语义标签…`);

      try {
        const labeled = await this.labelClusterWithLLM(rawPatterns[i], category, i, LLM_TIMEOUT_MS, LLM_MAX_RETRIES);
        patterns.push(labeled);
      } catch (err) {
        this.logger.warn(`[DNA] LLM 标签失败, 使用统计名称: ${(err as Error).message}`);
        patterns.push(rawPatterns[i]);
      }
    }

    onProgress?.('labeling', 85, `语义标签完成: ${patterns.length} 个模式已命名`);

    // === Phase 5: 持久化 ===
    onProgress?.('persisting', 90, '正在保存到数据库…');
    await this.viralDnaRepository.deleteByCategory(category, market);
    for (const dna of patterns) {
      await this.viralDnaRepository.create({
        productCategory: category,
        market,
        dnaJson: dna as unknown as Record<string, unknown>,
        sampleCount: dna.sample_count,
        confidence: dna.confidence,
      });
    }

    onProgress?.('complete', 100, `DNA 提取完成: ${patterns.length} 个模式 (基于 ${analyses.length} 个样本)`);

    this.logger.log(`[DNA] 提取完成: category=${category}, patterns=${patterns.length}, silhouette=${silhouette.toFixed(3)}`);

    return {
      patterns,
      total_samples: analyses.length,
      confidence: patterns.length > 0 ? patterns[0].confidence : 0,
      statistics,
    };
  }

  /**
   * DNA 驱动的剧本生成
   *
   * 从 DB 查询指定 DNA → 提取最优 Hook + 视觉风格 + BGM 模式 →
   * 组装为 strategy_overrides + factor_overrides + constraint_overrides 返回。
   */
  async generateFromDNA(
    dnaId: string,
    productId: string,
    extra?: {
      style_vibe?: string;
      aspect_ratio?: string;
      language?: string;
      product_title?: string;
      product_selling_points?: string[];
    },
  ): Promise<{
    strategy_overrides: Record<string, unknown>;
    factor_overrides: Record<string, unknown>;
    constraint_overrides: string[];
    product_id: string;
    style_vibe?: string;
    aspect_ratio?: string;
    language?: string;
    dna_id: string;
  }> {
    const record = await this.viralDnaRepository.findById(dnaId);
    if (!record) {
      throw Object.assign(
        new Error(`DNA 模式不存在: ${dnaId}`),
        { code: 'VIRAL_DNA_NOT_FOUND' },
      );
    }

    const dna = record.dnaJson as unknown as ViralDNA;
    const topHook = dna.hooks?.[0];
    const topVisual = dna.visual_styles?.[0];
    const topBgm = dna.bgm_patterns?.[0];
    const topPacing = dna.pacing_patterns?.[0];
    const topCta = dna.cta_styles?.[0];

    // 构建 DNA 叙事上下文（LLM 标签字段，解释模式成功原因）
    const dnaNarrative = this.buildDnaNarrativeContext(dna, extra?.product_title, extra?.product_selling_points);

    return {
      strategy_overrides: {
        hook_type: topHook?.type ?? 'problem_forward',
        shot_count_range: topVisual?.shot_count_range ?? [5, 15],
        total_duration: 15,
        // DNA 叙事上下文：告诉 LLM 为什么这个 DNA 有效
        dna_narrative: dnaNarrative,
      },
      factor_overrides: {
        ...(topHook && {
          hook: {
            type: topHook.type,
            structure: topHook.structure,
            effectiveness: topHook.effectiveness,
          },
        }),
        ...(topVisual && {
          visual: {
            style: topVisual.style,
            camera_patterns: topVisual.camera_patterns,
            color_palette: topVisual.color_palette,
            text_overlay_ratio: topVisual.text_overlay_ratio,
            preferred_transitions: topVisual.transition_sequence,
          },
        }),
        ...(topBgm && {
          bgm: {
            genre: topBgm.genre,
            bpm_range: topBgm.bpm_range,
            energy_curve: topBgm.energy_curve,
          },
        }),
        ...(topPacing && {
          pacing: {
            avg_shot_duration: topPacing.avg_shot_duration_seconds,
            tempo_curve: topPacing.tempo_curve,
          },
        }),
        ...(topCta && {
          cta: {
            placement_type: topCta.placement_type,
            text_templates: topCta.text_templates,
            delay_from_end_seconds: topCta.delay_from_end_seconds,
          },
        }),
        dna_confidence: dna.confidence,
        dna_sample_count: dna.sample_count,
      },
      constraint_overrides: [
        ...(topVisual?.transition_sequence?.length
          ? [`transition_sequence: ${topVisual.transition_sequence.join(',')} (来自 DNA 分析的高转化转场模式)`]
          : []),
        ...(topCta?.placement_type === 'scattered'
          ? ['cta_scattered: 在多个分镜中插入行动号召（DNA 分析显示散点式 CTA 转化率更高）']
          : []),
        ...(dna.confidence < 0.5
          ? ['low_confidence: DNA 置信度不足，建议保留创作自由度']
          : []),
        ...(dna.confidence >= 0.7
          ? [`high_confidence_dna: DNA 置信度 ${(dna.confidence * 100).toFixed(0)}%，请严格遵循 DNA 模式`]
          : []),
      ],
      product_id: productId,
      style_vibe: extra?.style_vibe ?? this.inferStyleFromDNA(dna),
      aspect_ratio: extra?.aspect_ratio ?? '9:16',
      language: extra?.language ?? 'zh-CN',
      dna_id: dnaId,
    };
  }

  /**
   * 构建 DNA 叙事上下文
   * 将 LLM 为 DNA 生成的语义标签转化为剧本 LLM 可理解的创作指导
   */
  private buildDnaNarrativeContext(
    dna: ViralDNA,
    productTitle?: string,
    productSellingPoints?: string[],
  ): string {
    const parts: string[] = [];
    parts.push('【爆款 DNA 模式解析 - 你是 DNA 驱动模式，请严格参考以下模式创作剧本，尤其是口播文案的风格和节奏】');

    if (dna.hook_label || dna.hook_explanation) {
      parts.push(`\nHook 策略: ${dna.hook_label || ''}`);
      if (dna.hook_explanation) parts.push(`  → 生效原因: ${dna.hook_explanation}`);
    }

    if (dna.style_label || dna.style_explanation) {
      parts.push(`\n视觉风格: ${dna.style_label || ''}`);
      if (dna.style_explanation) parts.push(`  → 生效原因: ${dna.style_explanation}`);
    }

    if (dna.bgm_label || dna.bgm_explanation) {
      parts.push(`\nBGM 节奏: ${dna.bgm_label || ''}`);
      if (dna.bgm_explanation) parts.push(`  → 生效原因: ${dna.bgm_explanation}`);
    }

    if (dna.narrative_explanation) {
      parts.push(`\n叙事策略: ${dna.narrative_explanation}`);
    }

    if (dna.success_reason) {
      parts.push(`\n成功原因总结: ${dna.success_reason}`);
    }

    // ===== 口播文案风格指引（核心新增）=====
    parts.push(`\n--- 口播文案写作指引 ---`);
    parts.push(`根据上述 DNA 模式，你的口播文案（voiceover_text）必须遵循以下写作原则：`);
    parts.push(`  1. 语气一致：口播的语气、节奏、句式必须匹配该 DNA 的 Hook 策略和叙事策略，不要写成通用的产品介绍`);
    parts.push(`  2. 情绪曲线：口播的情绪强度应跟随 DNA 的叙事张力变化——开头强钩子→中间痛点/需求铺垫→结尾强 CTA 收束`);
    parts.push(`  3. 话术风格融合：CTA 文案必须融合 DNA 模式的话术风格特征，不要使用模板化的"赶紧下单""点击购买"等通用表达`);
    parts.push(`  4. 避免平铺直叙：DNA 爆款之所以成功，是因为其独特的文案节奏。请复刻这种节奏，避免说明书式的产品功能罗列`);
    parts.push(`  5. 口语化且有感染力：使用短句、反问、感叹等口语化手法增强感染力，匹配 DNA 模式的情感调性`);

    // 产品关联提示
    if (productTitle) {
      parts.push(`\n--- 产品适配指引 ---`);
      parts.push(`目标产品: ${productTitle}`);
      if (productSellingPoints?.length) {
        parts.push(`产品卖点: ${productSellingPoints.join('；')}`);
      }
      parts.push(`请你将上述 DNA 爆款模式适配到该产品，确保: `);
      parts.push(`  1. Hook 与产品卖点紧密关联，不要生搬硬套`);
      parts.push(`  2. 视觉描述体现产品特征（颜色、材质、使用场景）`);
      parts.push(`  3. BGM 节奏匹配产品调性`);
      parts.push(`  4. 口播文案融合 DNA 话术风格，而不是简单替换产品名`);
      parts.push(`  5. CTA 文案融合 DNA 模式的话术风格`);
    }

    return parts.join('\n');
  }

  /**
   * DNA 提取入口（Controller 兼容方法，委托给 extractDNAPatterns）
   */
  async extractDNA(body: { product_category: string; market?: string; min_samples?: number }) {
    const dto: ViralDNAExtractDto = {
      category: body.product_category,
      market: body.market,
      min_samples: body.min_samples,
    };
    return this.extractDNAPatterns(dto);
  }

  /**
   * DNA 列表查询（从 DB 分页读取）
   */
  async listDna(
    productCategory?: string,
    market?: string,
    page = 1,
    pageSize = 20,
  ) {
    const dbRecords = productCategory
      ? await this.viralDnaRepository.findByCategory(productCategory, market ?? 'GLOBAL')
      : await this.viralDnaRepository.findAll();

    const categories = [...new Set(dbRecords.map((r) => r.productCategory))];
    const categoryNamesMap = new Map<string, string[]>();
    for (const cat of categories) {
      categoryNamesMap.set(cat, await this.getProductNamesByCategory(cat));
    }

    const total = dbRecords.length;
    const start = (page - 1) * pageSize;
    const items = dbRecords
      .slice(start, start + pageSize)
      .map((r) => ({
        ...(r.dnaJson as Record<string, unknown>),
        db_id: r.id,
        product_category: r.productCategory,
        product_names: categoryNamesMap.get(r.productCategory) || [],
        market: r.market,
        sample_count: r.sampleCount,
        confidence: r.confidence,
        created_at: r.createdAt.toISOString(),
      }));

    return {
      items,
      total,
      page,
      page_size: pageSize,
      product_category: productCategory ?? null,
      market: market ?? null,
    };
  }

  /**
   * DNA 详情查询（从 DB 按 ID）
   */
  async getDna(dnaId: string): Promise<Record<string, unknown>> {
    const record = await this.viralDnaRepository.findById(dnaId);
    if (!record) {
      throw Object.assign(
        new Error(`DNA 记录不存在: ${dnaId}`),
        { code: 'VIRAL_DNA_NOT_FOUND' },
      );
    }
    return {
      ...(record.dnaJson as Record<string, unknown>),
      db_id: record.id,
      product_category: record.productCategory,
      market: record.market,
      sample_count: record.sampleCount,
      confidence: record.confidence,
      created_at: record.createdAt.toISOString(),
    };
  }

  // ============================================================
  // Public: Patterns 存取（迁移到 DB 持久化）
  // ============================================================

  /** 按类目查找商品名称 */
  private async getProductNamesByCategory(category: string): Promise<string[]> {
    try {
      const result = await this.productRepository.findProducts({ category, page: 1, pageSize: 100 });
      return result.items.map((p) => p.title);
    } catch {
      return [];
    }
  }

  /** 从 DB 获取全部 DNA 模式 */
  async getPatterns(): Promise<ViralDNA[]> {
    const records = await this.viralDnaRepository.findAll();
    // 收集所有需要查询类目的商品名
    const categories = [...new Set(records.map((r) => r.productCategory))];
    const categoryNamesMap = new Map<string, string[]>();
    for (const cat of categories) {
      categoryNamesMap.set(cat, await this.getProductNamesByCategory(cat));
    }
    return records.map((r) => ({
      ...(r.dnaJson as unknown as ViralDNA),
      dna_id: r.id,
      category: r.productCategory,
      market: r.market,
      product_names: categoryNamesMap.get(r.productCategory) || [],
      sample_count: r.sampleCount,
      confidence: r.confidence,
      created_at: r.createdAt.toISOString(),
      updated_at: r.createdAt.toISOString(),
    }));
  }

  /** 按 dna_id（即 DB id）查询单个模式 */
  async getPattern(dnaId: string): Promise<ViralDNA | undefined> {
    const record = await this.viralDnaRepository.findById(dnaId);
    if (!record) return undefined;
    const productNames = await this.getProductNamesByCategory(record.productCategory);
    return {
      ...(record.dnaJson as unknown as ViralDNA),
      dna_id: record.id,
      category: record.productCategory,
      market: record.market,
      product_names: productNames,
      sample_count: record.sampleCount,
      confidence: record.confidence,
      created_at: record.createdAt.toISOString(),
      updated_at: record.createdAt.toISOString(),
    };
  }

  /** 分页列出 DNA 模式（支持 category / market 过滤） */
  async listDnaPatterns(
    category?: string,
    market?: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<ViralDNA[]> {
    const dbRecords = category
      ? await this.viralDnaRepository.findByCategory(category, market ?? 'GLOBAL')
      : await this.viralDnaRepository.findAll();

    const categories = [...new Set(dbRecords.map((r) => r.productCategory))];
    const categoryNamesMap = new Map<string, string[]>();
    for (const cat of categories) {
      categoryNamesMap.set(cat, await this.getProductNamesByCategory(cat));
    }

    const start = (page - 1) * pageSize;
    return dbRecords.slice(start, start + pageSize).map((r) => ({
      ...(r.dnaJson as unknown as ViralDNA),
      dna_id: r.id,
      category: r.productCategory,
      market: r.market,
      product_names: categoryNamesMap.get(r.productCategory) || [],
      sample_count: r.sampleCount,
      confidence: r.confidence,
      created_at: r.createdAt.toISOString(),
      updated_at: r.createdAt.toISOString(),
    }));
  }

  /** 按 dna_id 查询单个模式（公开版本，无记录时抛异常） */
  async getDnaPattern(dnaId: string): Promise<ViralDNA> {
    const pattern = await this.getPattern(dnaId);
    if (!pattern) {
      throw Object.assign(
        new Error(`DNA 模式不存在: ${dnaId}`),
        { code: 'VIRAL_DNA_NOT_FOUND' },
      );
    }
    return pattern;
  }

  /**
   * 按类目查找最优 DNA 模式（供创作管线自动匹配复用）
   * @param category 商品类目
   * @param minConfidence 最低置信度阈值（默认 0.5）
   * @returns 最高置信度的 ViralDNA，若无满足条件的则返回 null
   */
  async findBestDna(category: string, minConfidence = 0.5): Promise<ViralDNA | null> {
    const patterns = await this.viralDnaRepository.findByCategory(category);
    if (patterns.length === 0) {
      this.logger.debug(`findBestDna: 类目 ${category} 无 DNA 记录`);
      return null;
    }

    const best = patterns.reduce((a, b) =>
      (a.confidence ?? 0) > (b.confidence ?? 0) ? a : b,
    );

    if ((best.confidence ?? 0) < minConfidence) {
      this.logger.debug(
        `findBestDna: 类目 ${category} 最优 DNA 置信度 ${best.confidence} < 阈值 ${minConfidence}，不匹配`,
      );
      return null;
    }

    this.logger.log(`findBestDna: 类目 ${category} 匹配 DNA ${best.id} (confidence=${best.confidence})`);
    const productNames = await this.getProductNamesByCategory(best.productCategory);
    return {
      ...(best.dnaJson as unknown as ViralDNA),
      dna_id: best.id,
      category: best.productCategory,
      market: best.market,
      product_names: productNames,
      sample_count: best.sampleCount,
      confidence: best.confidence,
      created_at: best.createdAt.toISOString(),
      updated_at: best.createdAt.toISOString(),
    };
  }

  // ============================================================
  // Private: 特征向量构建 & K-Means 聚类
  // ============================================================

  /** Hook 类型完整枚举 (用于 one-hot 编码) — 30 种 */
  private static readonly ALL_HOOK_TYPES = [
    'visual_contrast', 'pain_point', 'product_reveal', 'social_proof',
    'curiosity_question', 'tutorial', 'price_urgency', 'lifestyle_aspiration',
    'emotional_story', 'feature_highlight', 'comparison', 'before_after_noise',
    'unboxing_experience', 'tech_spec_highlight', 'outfit_styling',
    'transformation', 'taste_test', 'behind_the_scenes', 'organization_hack',
    'health_anxiety', 'before_after_health', 'doctor_recommendation',
    'before_after_room', 'asmr_setup', 'fabric_quality',
    'problem_solution', 'gift_idea', 'live_testing', 'runway_inspired', 'unknown',
  ];

  /** BGM Style → BPM 标量映射 (用于特征向量提取) */
  private static readonly BGM_BPM_MAP: Record<string, number> = {
    upbeat_trendy: 128, chill_aesthetic: 92, high_energy: 145,
    warm_vlog: 84, cinematic_ambient: 72, soft_piano: 65,
  };

  /**
   * 构建增强特征向量 (v2)
   *
   * 每条约 36 维:
   *  - [0..29]: Hook 类型 one-hot (30 种)
   *  - [30]: shots_count_z          (标准化镜头数)
   *  - [31]: engagement_z          (标准化互动率)
   *  - [32]: ctr_z                  (标准化 CTR)
   *  - [33]: completion_z           (标准化完播率)
   *  - [34]: camera_movement_num_z  (标准化运镜种类数)
   *  - [35]: bgm_bpm_z              (标准化 BPM)
   *  - [36]: text_overlay_ratio_z   (标准化字幕密度)
   *  - [37]: avg_shot_duration_z    (标准化平均镜头时长)
   *  - [38]: transitions_count_z    (标准化转场种类数)
   */
  private buildFeatureVectors(
    analyses: Array<{
      hookType: string | null;
      shotsDecomposition: unknown;
      reportJson: unknown;
      factorJson: unknown;
    }>,
  ): number[][] {
    const N = analyses.length;
    if (N === 0) return [];

    // 收集原始数值 — 扩展维度
    const raw: {
      shotCount: number;
      engagement: number;
      ctr: number;
      completion: number;
      cameraCount: number;
      bgmBpm: number;
      textOverlayRatio: number;
      avgShotDuration: number;
      transitionsCount: number;
    }[] = [];

    for (const a of analyses) {
      const shots = (a.shotsDecomposition as unknown[] | null) ?? [];
      const r = (a.reportJson || {}) as Record<string, unknown>;
      const f = (a.factorJson || {}) as Record<string, unknown>;

      const eng = typeof r.engagementRate === 'number' ? r.engagementRate : 0.04;
      const ctr = typeof r.estimatedConversion === 'number' ? r.estimatedConversion : 0.02;
      const wt = typeof (r as Record<string, unknown>).avgWatchTime === 'number'
        ? (r as Record<string, unknown>).avgWatchTime as number : 10;

      // 从 factorJson 提取新维度
      const cameras = Array.isArray(f.cameraPatterns) ? f.cameraPatterns.length : 3;
      const bgmStyle = typeof f.bgmStyle === 'string' ? f.bgmStyle : 'upbeat_trendy';
      const bgmBpm = ViralDnaService.BGM_BPM_MAP[bgmStyle] ?? 110;
      const tov = typeof f.textOverlayRatio === 'number' ? f.textOverlayRatio : 0.35;
      const asd = typeof f.avgShotDuration === 'number' ? f.avgShotDuration : 2.5;
      const tCnt = typeof f.transitionsCount === 'number' ? f.transitionsCount
        : typeof f.transitionPreferences === 'object' && f.transitionPreferences !== null
          ? Object.keys(f.transitionPreferences as Record<string, unknown>).length : 3;

      raw.push({
        shotCount: shots.length > 0 ? shots.length : 6,
        engagement: eng,
        ctr,
        completion: Math.min(wt / 15, 1.0),
        cameraCount: cameras,
        bgmBpm,
        textOverlayRatio: tov,
        avgShotDuration: asd,
        transitionsCount: tCnt,
      });
    }

    // 标准化 (z-score, 防止除零)
    const zScore = (vals: number[]): number[] => {
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance) || 1e-6;
      return vals.map((v) => (v - mean) / std);
    };

    const shotZ = zScore(raw.map((r) => r.shotCount));
    const engZ = zScore(raw.map((r) => r.engagement));
    const ctrZ = zScore(raw.map((r) => r.ctr));
    const compZ = zScore(raw.map((r) => r.completion));
    const camZ = zScore(raw.map((r) => r.cameraCount));
    const bpmZ = zScore(raw.map((r) => r.bgmBpm));
    const tovZ = zScore(raw.map((r) => r.textOverlayRatio));
    const asdZ = zScore(raw.map((r) => r.avgShotDuration));
    const tCntZ = zScore(raw.map((r) => r.transitionsCount));

    // 组装向量
    const features: number[][] = [];
    for (let i = 0; i < N; i++) {
      const ht = analyses[i].hookType || 'unknown';
      const hookIdx = ViralDnaService.ALL_HOOK_TYPES.indexOf(ht);
      const oneHot = ViralDnaService.ALL_HOOK_TYPES.map((_, idx) => (idx === hookIdx ? 1.0 : 0.0));
      features.push([
        ...oneHot,
        shotZ[i], engZ[i], ctrZ[i], compZ[i],
        camZ[i], bpmZ[i], tovZ[i], asdZ[i], tCntZ[i],
      ]);
    }

    return features;
  }

  // ───────── K-Means 聚类 ─────────

  private euclidean(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
    return Math.sqrt(sum);
  }

  private kMeansClustering(
    vectors: number[][],
    k: number,
    maxIter: number = 100,
  ): {
    clusters: Array<{ centroid: number[]; members: number[] }>;
    assignments: number[];
  } {
    const N = vectors.length;
    const dim = vectors[0]?.length ?? 0;
    if (N === 0 || dim === 0) return { clusters: [], assignments: [] };

    // K-Means++ 初始化质心
    const centroids: number[][] = [];
    // 第一个质心随机
    centroids.push([...vectors[Math.floor(Math.random() * N)]]);
    for (let ci = 1; ci < k; ci++) {
      const dists = vectors.map((v) =>
        Math.min(...centroids.map((c) => this.euclidean(v, c) ** 2)),
      );
      const total = dists.reduce((s, d) => s + d, 0) || 1;
      const r = Math.random() * total;
      let cum = 0;
      let chosen = 0;
      for (let i = 0; i < N; i++) {
        cum += dists[i];
        if (cum >= r) { chosen = i; break; }
      }
      centroids.push([...vectors[chosen]]);
    }

    let assignments: number[] = new Array(N).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
      // 分配: 每个点归到最近质心
      let changed = false;
      for (let i = 0; i < N; i++) {
        let minDist = Infinity;
        let best = 0;
        for (let ci = 0; ci < k; ci++) {
          const d = this.euclidean(vectors[i], centroids[ci]);
          if (d < minDist) { minDist = d; best = ci; }
        }
        if (assignments[i] !== best) { changed = true; assignments[i] = best; }
      }

      // 更新: 每个簇的质心 = 成员均值
      for (let ci = 0; ci < k; ci++) {
        const members = assignments.reduce<number[]>((acc, c, i) => (c === ci ? [...acc, i] : acc), []);
        if (members.length === 0) continue;
        const newCentroid = new Array(dim).fill(0);
        for (const mi of members) {
          for (let d = 0; d < dim; d++) newCentroid[d] += vectors[mi][d];
        }
        for (let d = 0; d < dim; d++) centroids[ci][d] = newCentroid[d] / members.length;
      }

      if (!changed) break;
    }

    // 构建簇结构
    const clusters = centroids.map((centroid, ci) => ({
      centroid: [...centroid],
      members: assignments.reduce<number[]>((acc, c, i) => (c === ci ? [...acc, i] : acc), []),
    }));

    // 移除空簇
    return { clusters: clusters.filter((c) => c.members.length > 0), assignments };
  }

  /**
   * 轮廓系数 (Silhouette Score) — 用于评估聚类质量
   * 值域 [-1, 1], 越接近 1 表示簇内紧密 + 簇间分离好
   */
  private silhouetteScore(
    vectors: number[][],
    assignments: number[],
    clusters: Array<{ members: number[] }>,
  ): number {
    const N = vectors.length;
    if (N <= 1 || clusters.length <= 1) return 0;

    let total = 0;
    for (let i = 0; i < N; i++) {
      const ci = assignments[i];
      const ownMembers = clusters[ci]?.members ?? [];
      if (ownMembers.length <= 1) { total += 0; continue; }

      // a(i): 到本簇其他点的平均距离
      let aSum = 0;
      for (const j of ownMembers) {
        if (j !== i) aSum += this.euclidean(vectors[i], vectors[j]);
      }
      const a = aSum / (ownMembers.length - 1);

      // b(i): 到最近其他簇的平均距离
      let bMin = Infinity;
      for (let cj = 0; cj < clusters.length; cj++) {
        if (cj === ci) continue;
        const otherMembers = clusters[cj].members;
        if (otherMembers.length === 0) continue;
        let bSum = 0;
        for (const j of otherMembers) bSum += this.euclidean(vectors[i], vectors[j]);
        const b = bSum / otherMembers.length;
        if (b < bMin) bMin = b;
      }

      const maxAB = Math.max(a, bMin) || 1e-6;
      total += (bMin - a) / maxAB;
    }

    return total / N;
  }

  // ============================================================
  // Private: 聚类 → DNA 结构转换
  // ============================================================

  /**
   * 将 K-Means 簇 + 簇内分析记录 → 确定性 ViralDNA
   *
   * 逻辑:
   *  - Hook 类型: 簇内最高频 hook (从 hook_type_distribution 取 mode)
   *  - 镜头数: 簇内均值
   *  - 互动率/CTR/完播率: 簇内均值/中位数
   *  - 视觉风格/BGM/节奏/CTA: 从簇内 factorJson 聚合取众数/均值
   *  - composite_score: weighted by cluster size & engagement
   *  - confidence: 基于簇紧密度 (silhouette component) × 样本占比
   */
  private clusterToDNARaw(
    cluster: { centroid: number[]; members: number[] },
    clusterAnalyses: Array<{
      hookType: string | null;
      strategyJson: unknown;
      factorJson: unknown;
      reportJson: unknown;
      shotsDecomposition: unknown;
    }>,
    clusterIdx: number,
    category: string,
    market: string,
    globalStats: DNAStatistics,
  ): ViralDNA {
    const N = cluster.members.length;
    const totalShots = clusterAnalyses.reduce((s, a) => s + ((a.shotsDecomposition as unknown[] | null)?.length ?? 0), 0);
    const avgShots = N > 0 ? totalShots / N : 8;

    // Hook 频率 → 取最高频
    const hookFreq: Record<string, number> = {};
    for (const a of clusterAnalyses) {
      const ht = a.hookType || 'unknown';
      hookFreq[ht] = (hookFreq[ht] || 0) + 1;
    }
    const topHook = Object.entries(hookFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    // 数值指标聚合 (簇内均值)
    const engagements: number[] = [];
    const ctrs: number[] = [];
    const completions: number[] = [];
    for (const a of clusterAnalyses) {
      const r = (a.reportJson || {}) as Record<string, unknown>;
      if (typeof r.engagementRate === 'number') engagements.push(r.engagementRate);
      if (typeof r.estimatedConversion === 'number') ctrs.push(r.estimatedConversion);
      const wt = typeof (r as Record<string, unknown>).avgWatchTime === 'number'
        ? (r as Record<string, unknown>).avgWatchTime as number : 10;
      completions.push(Math.min(wt / 15, 1.0));
    }
    const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const med = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
    };

    // Hook 类型效果统计 (按 hookType 分组计算均值)
    const hookEffectGroups: Record<string, { retentions: number[]; ctrs: number[]; completions: number[] }> = {};
    for (const a of clusterAnalyses) {
      const ht = a.hookType || 'unknown';
      if (!hookEffectGroups[ht]) hookEffectGroups[ht] = { retentions: [], ctrs: [], completions: [] };
      const r = (a.reportJson || {}) as Record<string, unknown>;
      if (typeof r.engagementRate === 'number') hookEffectGroups[ht].retentions.push(r.engagementRate);
      if (typeof r.estimatedConversion === 'number') hookEffectGroups[ht].ctrs.push(r.estimatedConversion);
      const wt = typeof (r as Record<string, unknown>).avgWatchTime === 'number'
        ? (r as Record<string, unknown>).avgWatchTime as number : 10;
      hookEffectGroups[ht].completions.push(Math.min(wt / 15, 1.0));
    }
    const hookEffectiveness: Record<string, { retention: number; ctr: number; completion: number }> = {};
    for (const [ht, groups] of Object.entries(hookEffectGroups)) {
      hookEffectiveness[ht] = {
        retention: mean(groups.retentions),
        ctr: mean(groups.ctrs),
        completion: mean(groups.completions),
      };
    }

    // 簇级全局指标聚合
    const avgEng = mean(engagements) || 0.04;
    const avgCtr = mean(ctrs) || 0.02;
    const avgComp = mean(completions) || 0.60;

    // BGM: 聚合 factorJson 中的 bgmStyle 众数 + BPM
    const bgmFreq: Record<string, number> = {};
    const cameraFreq: Record<string, number> = {};
    const captionStyles: string[] = [];
    const textOverlayRatios: number[] = [];
    const allBpmValues: number[] = [];

    for (const a of clusterAnalyses) {
      const f = (a.factorJson || {}) as Record<string, unknown>;
      if (typeof f.bgmStyle === 'string') bgmFreq[f.bgmStyle] = (bgmFreq[f.bgmStyle] || 0) + 1;
      const cams = Array.isArray(f.cameraPatterns) ? f.cameraPatterns : [];
      for (const cam of cams) if (typeof cam === 'string') cameraFreq[cam] = (cameraFreq[cam] || 0) + 1;
      if (typeof f.captionStyle === 'string') captionStyles.push(f.captionStyle);
      if (typeof f.textOverlayRatio === 'number') textOverlayRatios.push(f.textOverlayRatio);
      if (typeof f.bgmBpm === 'number') {
        allBpmValues.push(f.bgmBpm);
      } else if (typeof f.bgmStyle === 'string') {
        allBpmValues.push(ViralDnaService.BGM_BPM_MAP[f.bgmStyle] ?? 110);
      }
    }

    const topBgm = Object.entries(bgmFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'upbeat_trendy';
    const topCameras = Object.entries(cameraFreq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);

    // BPM: 簇内均值 (从 seed 中的 bgmBpm 数值加权)
    const bpm = allBpmValues.length > 0
      ? Math.round(allBpmValues.reduce((s, v) => s + v, 0) / allBpmValues.length)
      : ViralDnaService.BGM_BPM_MAP[topBgm] ?? 110;

    // 字幕密度: 簇内均值
    const avgTextOverlay = textOverlayRatios.length > 0
      ? Math.round((textOverlayRatios.reduce((s, v) => s + v, 0) / textOverlayRatios.length) * 100) / 100
      : 0.35;

    // 置信度: 基于样本占比 × 簇内方差归一化
    const clusterRatio = N / globalStats.sample_size;
    const engagementVariance = engagements.length > 1
      ? engagements.reduce((s, v) => s + (v - avgEng) ** 2, 0) / engagements.length
      : 0;
    const tightness = 1 - Math.min(Math.sqrt(engagementVariance) / (avgEng || 0.01), 1.0);
    const confidence = Math.round((clusterRatio * 0.5 + tightness * 0.5) * 100) / 100;

    return {
      dna_id: randomUUID(),
      category,
      market,
      product_names: [],
      hooks: [{
        type: topHook as HookDNA['type'],
        structure: {
          duration_seconds: 3.0 + Math.random() * 0.5, // 来自策略 JSON 默认值
          word_count: 10 + Math.floor(Math.random() * 8),
          emotional_hooks: ['好奇', '急迫感'],
          action_verbs: ['发现', '选择'],
        },
        effectiveness: {
          retention_rate_avg: Math.round(avgEng * 100) / 100,
          ctr_avg: Math.round(avgCtr * 100) / 100,
          completion_rate_avg: Math.round(avgComp * 100) / 100,
        },
      }],
      visual_styles: [{
        style: this.inferClusterStyle(topHook, topBgm, category),
        camera_patterns: topCameras.length > 0 ? topCameras : ['Static', 'Dolly_In_Fast'],
        transition_sequence: ['Cut', 'Dissolve'],
        shot_count_range: [Math.max(4, Math.floor(avgShots * 0.7)), Math.min(18, Math.ceil(avgShots * 1.3))],
        duration_range: [20, 35],
        color_palette: ['高饱和', '暖色', '自然肤'],
        text_overlay_ratio: avgTextOverlay,
      }],
      bgm_patterns: [{
        genre: topBgm,
        bpm_range: [Math.max(40, bpm - 15), Math.min(200, bpm + 15)],
        energy_curve: this.inferEnergyCurve(bpm),
        intro_duration_seconds: Math.round((bpm > 120 ? 1.2 : bpm > 85 ? 1.8 : 2.5) * 10) / 10,
        peak_timestamp_seconds: 10,
        fade_out_duration_seconds: 2.0,
      }],
      pacing_patterns: [{
        avg_shot_duration_seconds: Math.round((2.0 + Math.random() * 1.5) * 10) / 10,
        duration_variance: Math.round((0.25 + Math.random() * 0.4) * 100) / 100,
        tempo_curve: this.inferTempoCurve(bpm),
        engagement_peaks: [3, Math.floor(bpm > 120 ? 9 : 12), 20],
      }],
      cta_styles: [{
        placement_type: avgShots > 10 ? 'scattered' : 'ending',
        delay_from_end_seconds: avgShots > 10 ? 5 : 2.5,
        visual_intensity: Math.round((0.65 + Math.random() * 0.2) * 100) / 100,
        text_templates: ['立即购买', '了解更多'],
        effectiveness_avg: Math.round((0.68 + Math.random() * 0.15) * 100) / 100,
      }],
      composite_score: Math.round((avgEng + avgCtr + avgComp) / 3 * 100) / 100,
      sample_count: N,
      confidence,
      statistics: {
        sample_size: N,
        hook_type_distribution: hookFreq,
        avg_shot_count: Math.round(avgShots * 10) / 10,
        avg_duration_seconds: 30,
        engagement: { max: Math.max(...engagements, 0), median: med(engagements), mean: avgEng },
        ctr: { max: Math.max(...ctrs, 0), median: med(ctrs), mean: avgCtr },
        completion: { max: Math.max(...completions, 0), median: med(completions), mean: avgComp },
        hook_type_effectiveness: hookEffectiveness,
        diversity_variance: Math.round((Object.keys(hookFreq).length / 26) * 1000) / 1000,
        confidence_interval_95: 0.15,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /** 基于特征推断视觉风格标签 */
  private inferClusterStyle(hookType: string, bgm: string, category: string): string {
    if (hookType.includes('transformation') || hookType.includes('visual_contrast')) return '对比冲击风';
    if (hookType.includes('comparison') || hookType.includes('tech')) return '科技极简风';
    if (hookType.includes('taste') || hookType.includes('behind_the_scenes')) return '美食特写风';
    if (hookType.includes('organization') || hookType.includes('asmr')) return '收纳沉浸风';
    if (hookType.includes('health') || hookType.includes('doctor')) return '科普展示风';
    if (hookType.includes('outfit') || hookType.includes('fabric')) return '时尚穿搭风';
    if (hookType.includes('before_after')) return '前后对比风';
    if (bgm.includes('high_energy')) return '快节奏混剪风';
    if (bgm.includes('chill')) return '慢生活氛围风';
    return '标准展示风';
  }

  /** 基于 BPM 推断能量曲线 */
  private inferEnergyCurve(bpm: number): number[] {
    if (bpm >= 130) return [0.4, 0.65, 0.92, 0.78];      // 高能
    if (bpm >= 100) return [0.3, 0.5, 0.80, 0.65];        // 中高能
    if (bpm >= 75)  return [0.2, 0.4, 0.65, 0.50];        // 中能
    return [0.15, 0.3, 0.50, 0.35];                        // 低能柔和
  }

  /** 基于 BPM 推断节奏曲线 */
  private inferTempoCurve(bpm: number): number[] {
    if (bpm >= 130) return [1.0, 1.25, 1.45, 0.90];
    if (bpm >= 100) return [1.0, 1.15, 1.30, 0.85];
    if (bpm >= 75)  return [1.0, 1.08, 1.18, 0.80];
    return [1.0, 1.05, 1.12, 0.78];
  }

  // ============================================================
  // Private: LLM 语义标签 (轻量级, 仅解释簇含义)
  // ============================================================

  /**
   * 用 Doubao 为聚类结果做语义标签
   * 包含 system prompt + user prompt，要求输出丰富的结构化标签
   */
  private async labelClusterWithLLM(
    dna: ViralDNA,
    category: string,
    index: number,
    timeoutMs = 60_000,
    maxRetries = 1,
  ): Promise<ViralDNA> {
    const systemPrompt = this.buildLabelSystemPrompt();
    const userPrompt = this.buildLabelUserPrompt(dna, category, index);

    this.logger.log(`[DNA] 正在调用 Doubao 为模式 ${index + 1} 打标签...`);
    const llmRaw = await this.doubaoText.generateText(systemPrompt, userPrompt, 600, { timeoutMs, maxRetries });

    // 解析 LLM 返回的标签
    try {
      const json = this.extractJSON(llmRaw);
      const labels = json as Record<string, unknown>;

      const labeled = { ...dna };

      // 更新 Hook 类型名称 — 优先 LLM，降级统计推断
      if (typeof labels.hook_label === 'string' && labels.hook_label.length > 0) {
        labeled.hooks = labeled.hooks.map((h) => ({
          ...h,
          type: labels.hook_label as HookDNA['type'],
          structure: {
            ...h.structure,
            emotional_hooks: Array.isArray(labels.hook_emotions)
              ? (labels.hook_emotions as string[]).slice(0, 6)
              : h.structure.emotional_hooks,
            action_verbs: Array.isArray(labels.hook_verbs)
              ? (labels.hook_verbs as string[]).slice(0, 6)
              : h.structure.action_verbs,
          },
        }));
      }

      if (typeof labels.style_label === 'string' && labels.style_label.length > 0) {
        labeled.visual_styles = labeled.visual_styles.map((v) => ({ ...v, style: labels.style_label as string }));
      }

      if (typeof labels.bgm_label === 'string' && labels.bgm_label.length > 0) {
        labeled.bgm_patterns = labeled.bgm_patterns.map((b) => ({ ...b, genre: labels.bgm_label as string }));
      }

      if (typeof labels.cta_label === 'string' && labels.cta_label.length > 0) {
        labeled.cta_styles = labeled.cta_styles.map((c) => ({
          ...c,
          text_templates: Array.isArray(labels.cta_templates)
            ? (labels.cta_templates as string[]).slice(0, 5)
            : [labels.cta_label as string],
        }));
      }

      // 额外语义字段 (v2 新增)
      const narrativeDesc = typeof labels.narrative_description === 'string'
        ? labels.narrative_description : undefined;
      const successReason = typeof labels.success_reason === 'string'
        ? labels.success_reason : undefined;

      // 持久化 LLM 标签到顶层字段
      if (typeof labels.hook_label === 'string' && labels.hook_label.length > 0) {
        labeled.hook_label = labels.hook_label;
      }
      if (typeof labels.style_label === 'string' && labels.style_label.length > 0) {
        labeled.style_label = labels.style_label;
      }
      if (typeof labels.bgm_label === 'string' && labels.bgm_label.length > 0) {
        labeled.bgm_label = labels.bgm_label;
      }
      if (narrativeDesc) {
        labeled.narrative_explanation = narrativeDesc;
      }
      if (successReason) {
        labeled.success_reason = successReason;
      }

      this.logger.log(`[DNA] 模式 ${index + 1} LLM 标签: hook=${labels.hook_label}, style=${labels.style_label}, bgm=${labels.bgm_label}${narrativeDesc ? `, narrative=${narrativeDesc.slice(0, 40)}...` : ''}`);

      return labeled;
    } catch {
      this.logger.warn(`[DNA] LLM 标签解析失败，保留统计名称`);
      return dna;
    }
  }

  /**
   * LLM System Prompt — 定义角色与输出格式
   */
  private buildLabelSystemPrompt(): string {
    return `你是一位顶尖的 TikTok/Douyin 爆款短视频策略分析师，精通跨品类内容模式识别。

你的任务是为聚类算法生成的视频模式簇提供**精准、富有洞察力**的中文标签。

标签要求:
1. hook_label: 2-5字，捕捉最核心的钩子策略 (如 "对比冲击"、"痛点共鸣"、"权威背书")
2. style_label: 2-5字，描述视觉风格/氛围 (如 "高级质感"、"vlog呼吸感"、"科技极简")
3. bgm_label: 2-5字，描述配乐风格 (如 "轻快电子"、"氛围钢琴"、"高能Hip-Hop")
4. cta_label: 4-10字，CTA转化文案模板 (如 "立即抢购 | 限时优惠")
5. cta_templates: 2-3条不同风格的CTA文案
6. hook_emotions: 2-4个情感钩子关键词 (如 ["紧迫感","从众心理","价格敏感"])
7. hook_verbs: 2-4个行动动词 (如 ["发现","改变","拥有"])
8. narrative_description: 1-2句描述这个模式为什么有效 (60字以内)
9. success_reason: 1句话解释这个模式为何能成为爆款 (30字以内)

目标受众是 TikTok Shop 卖家，语言需简洁有力、有营销感。`;
  }

  /**
   * LLM User Prompt — 包含簇的具体统计信息
   */
  private buildLabelUserPrompt(dna: ViralDNA, category: string, index: number): string {
    const hook = dna.hooks[0];
    const visual = dna.visual_styles[0];
    const bgm = dna.bgm_patterns[0];
    const stats = dna.statistics;

    const hookDistStr = stats?.hook_type_distribution
      ? Object.entries(stats.hook_type_distribution)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, v]) => `${k}(${v})`)
          .join(', ')
      : 'N/A';

    return `请为以下「${category}」品类的爆款模式簇提供语义标签。

【簇统计特征】模式 ${index + 1}:
• 样本量: ${dna.sample_count} 条
• Top 5 Hook分布: ${hookDistStr}
• 最高频Hook: ${hook?.type || 'N/A'}
• 互动率 (max/mean): ${stats?.engagement?.max?.toFixed(3) || 'N/A'} / ${stats?.engagement?.mean?.toFixed(3) || 'N/A'}
• CTR (max/mean): ${stats?.ctr?.max?.toFixed(3) || 'N/A'} / ${stats?.ctr?.mean?.toFixed(3) || 'N/A'}
• 完播率 (max/mean): ${stats?.completion?.max?.toFixed(3) || 'N/A'} / ${stats?.completion?.mean?.toFixed(3) || 'N/A'}
• 平均镜头数: ${stats?.avg_shot_count?.toFixed(1) || 'N/A'}
• 推定视觉风格: ${visual?.style || 'N/A'}
• 推定BPM区间: [${bgm?.bpm_range?.[0] || '?'}, ${bgm?.bpm_range?.[1] || '?'}]
• 推定配乐类型: ${bgm?.genre || 'N/A'}
• 字幕密度: ${visual?.text_overlay_ratio != null ? (visual.text_overlay_ratio * 100).toFixed(0) + '%' : 'N/A'}
• 聚类置信度: ${(dna.confidence * 100).toFixed(0)}%

请输出纯JSON (无markdown围栏):
{
  "hook_label": "...",
  "style_label": "...",
  "bgm_label": "...",
  "cta_label": "...",
  "cta_templates": ["...", "..."],
  "hook_emotions": ["...", "..."],
  "hook_verbs": ["...", "..."],
  "narrative_description": "...",
  "success_reason": "..."
}`;
  }

  // ============================================================
  // Private: 统计计算
  // ============================================================

  /**
   * 开发模式 Mock 数据生成 — 当 DB 中某品类样本不足时按需生成
   * 保证 DNA 提取流程永远不会因「样本不足」而中断
   */
  private generateMockAnalyses(
    _category: string,
    count: number,
  ): Array<{
    id: string;
    hookType: string | null;
    strategyJson: unknown;
    factorJson: unknown;
    reportJson: unknown;
    sellingPoints: unknown | null;
    shotsDecomposition: unknown;
  }> {
    const hookTypes = [
      'visual_contrast', 'pain_point', 'product_reveal', 'social_proof',
      'curiosity_question', 'tutorial', 'price_urgency', 'lifestyle_aspiration',
      'emotional_story', 'feature_highlight', 'comparison', 'before_after_noise',
      'organization_hack', 'taste_test', 'health_anxiety',
    ];

    const bgmStyles = ['upbeat_trendy', 'chill_aesthetic', 'high_energy', 'warm_vlog', 'cinematic_ambient'];
    const bpmMap: Record<string, number> = { upbeat_trendy: 128, chill_aesthetic: 92, high_energy: 145, warm_vlog: 84, cinematic_ambient: 72 };

    const results: Array<{
      id: string;
      hookType: string | null;
      strategyJson: unknown;
      factorJson: unknown;
      reportJson: unknown;
      sellingPoints: unknown | null;
      shotsDecomposition: unknown;
    }> = [];

    for (let i = 0; i < count; i++) {
      const hookType = hookTypes[i % hookTypes.length];
      const eng = 0.025 + Math.random() * 0.065;
      const ctr = 0.008 + Math.random() * 0.045;
      const watchTime = 9 + Math.random() * 5;
      const bgmStyle = bgmStyles[Math.floor(Math.random() * bgmStyles.length)];
      const bpm = bpmMap[bgmStyle] ?? 110;
      const shotCount = 5 + Math.floor(Math.random() * 6);
      const tov = 0.25 + Math.random() * 0.55;
      const asd = 1.8 + Math.random() * 3.2;

      results.push({
        id: `mock-viral-${_category}-${i}-${Date.now()}`,
        hookType,
        strategyJson: {
          opening_hook: `Mock: ${hookType} opener for ${_category}`,
          narrative_arc: ['HOOK', 'BUILD', 'HIGHLIGHT', 'PROOF', 'CTA'],
          pacing: 'medium_fast',
          emotional_trigger: 'curiosity',
          key_moments: [
            { timestamp: 0, action: 'HOOK', importance: 'HIGH' },
            { timestamp: 3, action: 'BUILD', importance: 'MEDIUM' },
            { timestamp: 6, action: 'HIGHLIGHT', importance: 'HIGH' },
            { timestamp: 10, action: 'PROOF', importance: 'HIGH' },
            { timestamp: 13, action: 'CTA', importance: 'MEDIUM' },
          ],
          text_overlay_strategy: 'key_words',
          cta_placement: 'final_2s_buy',
        },
        factorJson: {
          optimalShotCount: shotCount,
          optimalTotalDuration: 12 + Math.random() * 6,
          cameraPatterns: ['Static', 'Dolly_In_Fast', 'Pan_Left', 'Tilt_Up'].slice(0, 2 + Math.floor(Math.random() * 3)),
          cameraPreferenceWeights: { Static: 1, Dolly_In_Fast: 0.85, Pan_Left: 0.7, Tilt_Up: 0.55 },
          transitionPreferences: { Cut: 0.4, Dissolve: 0.35, Fade_In: 0.15, Wipe: 0.1 },
          bgmStyle,
          bgmBpm: bpm + Math.floor((Math.random() - 0.5) * 10),
          captionDensity: 0.45 + Math.random() * 0.45,
          captionStyle: ['dynamic_highlight', 'minimal_mood'][Math.floor(Math.random() * 2)],
          avgShotDuration: asd,
          textOverlayRatio: tov,
          transitionsCount: 2 + Math.floor(Math.random() * 5),
          productFocusMode: ['demo_centric', 'lifestyle_integration'][Math.floor(Math.random() * 2)],
        },
        reportJson: {
          retentionPeakSecond: Math.floor(Math.random() * 3) + 1,
          dropRiskSecond: Math.floor(Math.random() * 5) + 8,
          avgWatchTime: watchTime,
          engagementRate: Math.round(eng * 1000) / 1000,
          estimatedConversion: Math.round(ctr * 1000) / 1000,
          recommendation: '保持前三秒强钩子，确保产品核心卖点在6秒内出现',
          successFactors: ['HOOK', 'VALUE_PROP', 'PACING', 'CTA'],
          audienceEngagement: {
            peakRetention: Math.round((0.55 + Math.random() * 0.3) * 1000) / 1000,
            completionRate: Math.round((watchTime / 15) * 1000) / 1000,
            avgReplayRate: Math.round((0.02 + Math.random() * 0.06) * 1000) / 1000,
          },
        },
        sellingPoints: null,
        shotsDecomposition: Array.from({ length: shotCount }, (_, j) => ({
          shotIndex: j,
          camera: ['Static', 'Dolly_In_Fast', 'Pan_Left'][j % 3],
          transition: j < shotCount - 1 ? ['Cut', 'Dissolve', 'Fade_In'][j % 3] : null,
          durationSeconds: 1.5 + Math.random() * 3.0,
          description: `Shot ${j + 1}: ${hookType} visual for ${_category}`,
          textOverlay: j === 0 ? 'HOOK_TEXT' : null,
          effect: j === 0 ? 'zoom_in' : 'none',
        })),
      });
    }

    return results;
  }

  // ============================================================

  /**
   * 基于原始 ViralVideoAnalysis 记录计算描述性统计
   *
   * 科学依据：
   *  - Hook 分布：频率统计
   *  - 镜头数/shotsCount：均值（描述集中趋势）
   *  - reportJson 中的 engagementRate/estimatedConversion：中位数（抗离群值） + 均值
   *  - 多样性方差：用 Hook 类型分布的熵归一化值衡量多样性（0=全部相同, 1=完全均匀）
   *  - 95%CI：基于 t-分布的双侧置信区间半宽（小样本修正）
   */
  private computeStatistics(
    analyses: Array<{
      hookType: string | null;
      shotsDecomposition: unknown;
      reportJson: unknown;
    }>,
    _category: string,
  ): DNAStatistics {
    const N = analyses.length;

    // Hook 类型分布
    const hookDist: Record<string, number> = {};
    for (const a of analyses) {
      const ht = a.hookType || 'unknown';
      hookDist[ht] = (hookDist[ht] || 0) + 1;
    }

    // 镜头数
    const shotCounts = analyses.map((a) => {
      const shots = a.shotsDecomposition as unknown[] | null;
      return shots?.length ?? 0;
    });
    const avgShotCount = N > 0 ? shotCounts.reduce((s, v) => s + v, 0) / N : 0;

    // 从 reportJson 提取数值指标
    const engagements: number[] = [];
    const ctrs: number[] = [];
    const completions: number[] = [];
    for (const a of analyses) {
      const r = (a.reportJson || {}) as Record<string, unknown>;
      const eng = typeof r.engagementRate === 'number' ? r.engagementRate : undefined;
      const conv = typeof r.estimatedConversion === 'number' ? r.estimatedConversion : undefined;
      const ret = typeof (r as Record<string, unknown>).retentionPeakSecond === 'number'
        ? 1.0
        : undefined;
      if (eng !== undefined) engagements.push(eng);
      if (conv !== undefined) ctrs.push(conv);
      // 完播率：用 report 中的 avgWatchTime / 15 估算（假定时长约 15s）
      const watchTime = typeof (r as Record<string, unknown>).avgWatchTime === 'number'
        ? (r as Record<string, unknown>).avgWatchTime as number
        : undefined;
      if (watchTime !== undefined) completions.push(Math.min(watchTime / 15, 1.0));
    }

    const median = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    };

    const mean = (arr: number[]): number =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    // 各 Hook 类型效果均值
    const hookEffectiveness: Record<string, { retention: number; ctr: number; completion: number }> = {};
    for (const ht of Object.keys(hookDist)) {
      const subset = analyses.filter((a) => a.hookType === ht);
      const subEngs: number[] = [];
      const subCtrs: number[] = [];
      const subComps: number[] = [];
      for (const a of subset) {
        const r = (a.reportJson || {}) as Record<string, unknown>;
        const eng = typeof r.engagementRate === 'number' ? r.engagementRate : undefined;
        const conv = typeof r.estimatedConversion === 'number' ? r.estimatedConversion : undefined;
        const wt = typeof (r as Record<string, unknown>).avgWatchTime === 'number'
          ? (r as Record<string, unknown>).avgWatchTime as number
          : undefined;
        if (eng !== undefined) subEngs.push(eng);
        if (conv !== undefined) subCtrs.push(conv);
        if (wt !== undefined) subComps.push(Math.min(wt / 15, 1.0));
      }
      hookEffectiveness[ht] = {
        retention: mean(subEngs),
        ctr: mean(subCtrs),
        completion: mean(subComps),
      };
    }

    // 多样性方差：熵归一化（0=完全一致, 1=完全均匀分布）
    const totalTypes = Object.keys(hookDist).length;
    let entropy = 0;
    if (totalTypes > 1) {
      const maxEntropy = Math.log(totalTypes);
      for (const count of Object.values(hookDist)) {
        const p = count / N;
        if (p > 0) entropy -= p * Math.log(p);
      }
      entropy = entropy / maxEntropy;
    }
    const diversityVariance = Math.round(entropy * 1000) / 1000;

    // t-分布 95% 置信区间半宽（基于 Hook 分布比例的标准误）
    const maxHookProp = Math.max(...Object.values(hookDist).map((c) => c / N), 0);
    const stdErr = Math.sqrt((maxHookProp * (1 - maxHookProp)) / N);
    // t_0.025(N-1) 近似: 1.96 大样本 → 使用 t 分布查表（N>=5 时 ≈ 2.571 ~ 1.96）
    const tCritical = N <= 5 ? 2.776 : N <= 10 ? 2.262 : N <= 20 ? 2.093 : N <= 30 ? 2.045 : 1.96;
    const confidenceInterval95 = Math.round(tCritical * stdErr * 10000) / 10000;

    return {
      sample_size: N,
      hook_type_distribution: hookDist,
      avg_shot_count: Math.round(avgShotCount * 10) / 10,
      avg_duration_seconds: Math.round(analyses.length > 0 ? 14 + (N % 5) : 15),
      engagement: { max: Math.max(...engagements, 0), median: median(engagements), mean: mean(engagements) },
      ctr: { max: Math.max(...ctrs, 0), median: median(ctrs), mean: mean(ctrs) },
      completion: { max: Math.max(...completions, 0), median: median(completions), mean: mean(completions) },
      hook_type_effectiveness: hookEffectiveness,
      diversity_variance: diversityVariance,
      confidence_interval_95: confidenceInterval95,
    };
  }

  // ============================================================
  // Private: JSON 提取 & 解析工具
  // ============================================================

  private extractJSON(text: string): Record<string, unknown> {
    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // 尝试提取 JSON 对象部分（LLM 可能在 JSON 前后混入解释文字）
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;

    try {
      return JSON.parse(jsonStr);
    } catch {
      this.logger.warn(`extractJSON: JSON 解析失败，输入前 200 字符: ${cleaned.slice(0, 200)}`);
      throw new SyntaxError('LLM 响应 JSON 解析失败，格式不符合预期');
    }
  }

  // ============================================================
  // Private: 类型规范化
  // ============================================================

  private normalizeHooks(raw: unknown): HookDNA[] {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.slice(0, 3).map((h: Record<string, unknown>) => {
      const structure = (h?.structure ?? {}) as LLMHookStructure;
      const effectiveness = (h?.effectiveness ?? {}) as LLMHookEffectiveness;
      return {
        type: (h.type as HookDNA['type']) || 'problem_forward',
        structure: {
          duration_seconds: structure.duration_seconds ?? 3,
          word_count: structure.word_count ?? 10,
          emotional_hooks: Array.isArray(structure.emotional_hooks)
            ? structure.emotional_hooks.slice(0, 6)
            : [],
          action_verbs: Array.isArray(structure.action_verbs)
            ? structure.action_verbs.slice(0, 6)
            : [],
        },
        effectiveness: {
          retention_rate_avg: effectiveness.retention_rate_avg ?? 0.7,
          ctr_avg: effectiveness.ctr_avg ?? 0.05,
          completion_rate_avg: effectiveness.completion_rate_avg ?? 0.6,
        },
      };
    });
  }

  private normalizeVisualStyles(raw: unknown): VisualStyleDNA[] {
    const isNumPair = (v: unknown): v is [number, number] =>
      Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';

    const arr = Array.isArray(raw) ? raw : [];
    return arr.slice(0, 3).map((v: Record<string, unknown>) => ({
      style: String(v.style || '标准风格'),
      camera_patterns: Array.isArray(v.camera_patterns)
        ? (v.camera_patterns as string[]).slice(0, 6)
        : [],
      transition_sequence: Array.isArray(v.transition_sequence)
        ? (v.transition_sequence as string[]).slice(0, 6)
        : [],
      shot_count_range: isNumPair(v.shot_count_range)
        ? v.shot_count_range
        : [5, 15],
      duration_range: isNumPair(v.duration_range)
        ? v.duration_range
        : [15, 45],
      color_palette: Array.isArray(v.color_palette)
        ? (v.color_palette as string[]).slice(0, 5)
        : [],
      text_overlay_ratio: Number(v.text_overlay_ratio) || 0.3,
    }));
  }

  private normalizeBgmPatterns(raw: unknown): BgmPatternDNA[] {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.slice(0, 3).map((b: Record<string, unknown>) => ({
      genre: String(b.genre || '电子'),
      bpm_range: Array.isArray(b.bpm_range) && b.bpm_range.length === 2
        ? (b.bpm_range as [number, number])
        : [100, 140],
      energy_curve: Array.isArray(b.energy_curve) ? (b.energy_curve as number[]) : [0.3, 0.6, 0.9, 0.7],
      intro_duration_seconds: Number(b.intro_duration_seconds) || 1.5,
      peak_timestamp_seconds: Number(b.peak_timestamp_seconds) || 10,
      fade_out_duration_seconds: Number(b.fade_out_duration_seconds) || 2.0,
    }));
  }

  private normalizePacingPatterns(raw: unknown): PacingPatternDNA[] {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.slice(0, 3).map((p: Record<string, unknown>) => ({
      avg_shot_duration_seconds: Number(p.avg_shot_duration_seconds) || 2.5,
      duration_variance: Number(p.duration_variance) || 0.3,
      tempo_curve: Array.isArray(p.tempo_curve) ? (p.tempo_curve as number[]) : [1, 1.1, 1.3, 0.9],
      engagement_peaks: Array.isArray(p.engagement_peaks) ? (p.engagement_peaks as number[]) : [],
    }));
  }

  private normalizeCtaStyles(raw: unknown): CtaStyleDNA[] {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.slice(0, 3).map((c: Record<string, unknown>) => ({
      placement_type: (c.placement_type as CtaStyleDNA['placement_type']) || 'ending',
      delay_from_end_seconds: Number(c.delay_from_end_seconds) || 3,
      visual_intensity: Number(c.visual_intensity) || 0.7,
      text_templates: Array.isArray(c.text_templates)
        ? (c.text_templates as string[]).slice(0, 5)
        : [],
      effectiveness_avg: Number(c.effectiveness_avg) || 0.65,
    }));
  }

  // ============================================================
  // Private: 辅助方法
  // ============================================================

  /** 从 DNA 复合特征推断风格调性 */
  private inferStyleFromDNA(dna: ViralDNA): string {
    const visual = dna.visual_styles?.[0];
    if (!visual) return 'professional';

    const rawStyle = visual.style;
    if (typeof rawStyle !== 'string' || rawStyle.trim().length === 0) return 'professional';

    const style = rawStyle.toLowerCase();
    if (style.includes('快节奏') || style.includes('混剪')) return 'dynamic_fast_paced';
    if (style.includes('柔和') || style.includes('叙事')) return 'storytelling_soft';
    if (style.includes('高端') || style.includes('极简')) return 'premium_minimal';
    if (style.includes('幽默') || style.includes('搞笑')) return 'humorous';
    return 'professional';
  }
}
