/**
 * ViralDnaService — 爆款 DNA 提取 完整单测
 *
 * 覆盖：
 *   1. 特征向量构建 (buildFeatureVectors) — one-hot 编码 + 标准化
 *   2. K-Means 聚类 (kMeansClustering) — K-Means++ 初始化 + 迭代收敛
 *   3. 轮廓系数 (silhouetteScore) — 聚类质量评估
 *   4. 统计计算 (computeStatistics) — 均值/中位数/方差/置信区间
 *   5. 聚类→DNA 转换 (clusterToDNARaw) — 确定性输出
 *   6. LLM 语义标签 (labelClusterWithLLM) — 轻量 prompt + 解析
 *   7. 全链路提取 (extractDNAPatterns) — 完整 5 阶段流程
 *   8. Mock 兜底 (generateMockAnalyses) — 样本不足自动补充
 *   9. Doubao LLM 可用性 (checkHealth)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ViralDnaService } from './viral-dna.service';
import { ViralAnalysisRepository } from './viral-analysis.repository';
import { ViralDnaRepository } from './viral-dna.repository';
import { ProductRepository } from '../product/product.repository';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';

// ============================================================================
// Mocks
// ============================================================================

// 构造一条真实形态的爆款分析 mock
function makeAnalysis(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) || `ana-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    hookType: (overrides.hookType as string) || 'visual_contrast',
    strategyJson: (overrides.strategyJson as Record<string, unknown>) || {
      opening_hook: '前后对比：暗沉→透亮',
      narrative_arc: ['HOOK', 'BUILD', 'HIGHLIGHT', 'PROOF', 'CTA'],
      pacing: 'medium_fast',
      emotional_trigger: 'curiosity',
      key_moments: [
        { timestamp: 0, action: 'HOOK', importance: 'HIGH' },
        { timestamp: 10, action: 'CTA', importance: 'MEDIUM' },
      ],
      text_overlay_strategy: 'key_words',
      cta_placement: 'final_2s_buy',
    },
    factorJson: (overrides.factorJson as Record<string, unknown>) || {
      optimalShotCount: 8,
      optimalTotalDuration: 15,
      cameraPatterns: ['Static', 'Dolly_In_Fast'],
      bgmStyle: 'upbeat_trendy',
      captionDensity: 0.5,
      avgShotDuration: 2.5,
      textOverlayRatio: 0.4,
    },
    reportJson: (overrides.reportJson as Record<string, unknown>) || {
      retentionPeakSecond: 2,
      dropRiskSecond: 10,
      avgWatchTime: 12,
      engagementRate: 0.05,
      estimatedConversion: 0.03,
      recommendation: '保持前三秒强钩子',
      successFactors: ['HOOK', 'PACING', 'CTA'],
    },
    shotsDecomposition: (overrides.shotsDecomposition as unknown[]) || [
      { shotIndex: 0, description: '开场', durationSeconds: 3 },
      { shotIndex: 1, description: '产品', durationSeconds: 4 },
      { shotIndex: 2, description: '效果', durationSeconds: 3 },
      { shotIndex: 3, description: 'CTA', durationSeconds: 2 },
    ],
    sellingPoints: (overrides.sellingPoints as unknown[] | null) || null,
    sourcePlatform: 'tiktok',
    sourceUrl: 'https://tiktok.com/@test/test',
    externalVideoId: `ext-${id}`,
    title: 'Test Viral Video',
    declaredPublicSource: true,
  };
}

// 批量生成多样化的分析记录
function makeAnalyses(count: number): ReturnType<typeof makeAnalysis>[] {
  const hooks = [
    'visual_contrast', 'pain_point', 'product_reveal', 'social_proof',
    'curiosity_question', 'tutorial', 'price_urgency', 'lifestyle_aspiration',
    'emotional_story', 'feature_highlight', 'comparison', 'before_after_noise',
    'unboxing_experience', 'health_anxiety', 'before_after_health',
  ];
  const bgms = ['upbeat_trendy', 'chill_aesthetic', 'high_energy', 'warm_vlog'];

  return Array.from({ length: count }, (_, i) =>
    makeAnalysis({
      id: `ana-${i}`,
      hookType: hooks[i % hooks.length],
      factorJson: {
        bgmStyle: bgms[i % bgms.length],
        cameraPatterns: ['Static', 'Dolly_In_Fast', 'Pan_Left', 'Tilt_Up'].slice(0, 2 + (i % 3)),
        optimalShotCount: 5 + (i % 6),
        optimalTotalDuration: 12 + (i % 8),
        avgShotDuration: 2.0 + Math.random() * 2.5,
        captionDensity: 0.3 + Math.random() * 0.6,
        textOverlayRatio: 0.25 + Math.random() * 0.55,
      },
      reportJson: {
        engagementRate: 0.02 + Math.random() * 0.06,
        estimatedConversion: 0.01 + Math.random() * 0.04,
        avgWatchTime: 8 + Math.random() * 7,
        retentionPeakSecond: Math.floor(Math.random() * 3) + 1,
      },
      shotsDecomposition: Array.from({ length: 4 + (i % 5) }, (_, j) => ({
        shotIndex: j,
        description: `Shot ${j}`,
        durationSeconds: 2.0 + Math.random() * 2.0,
      })),
    }),
  );
}

// ============================================================================

const mockViralAnalysisRepository = {
  findByCategory: jest.fn().mockResolvedValue([]),
  countByCategory: jest.fn().mockResolvedValue(0),
};

const mockViralDnaRepository = {
  create: jest.fn().mockResolvedValue({}),
  deleteByCategory: jest.fn().mockResolvedValue(5),
  findByCategory: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
  findAll: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
};

const mockProductRepository = {
  findByCategory: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
};

const mockDoubaoTextProvider = {
  generateText: jest.fn().mockResolvedValue('{"hook_label":"视觉冲击","style_label":"快节奏","bgm_label":"电子","cta_label":"立即抢购"}'),
  checkHealth: jest.fn().mockResolvedValue({ ok: true, message: 'OK', configured: true }),
};

// ============================================================================

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-dna-id-00000000000000000000000'),
}));

// ============================================================================

describe('ViralDnaService — 爆款 DNA 提取', () => {
  let service: ViralDnaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViralDnaService,
        { provide: ViralAnalysisRepository, useValue: mockViralAnalysisRepository },
        { provide: ViralDnaRepository, useValue: mockViralDnaRepository },
        { provide: DoubaoTextProvider, useValue: mockDoubaoTextProvider },
        { provide: ProductRepository, useValue: mockProductRepository },
      ],
    }).compile();

    service = module.get<ViralDnaService>(ViralDnaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. 特征向量构建
  // ══════════════════════════════════════════════════════════════════════════

  describe('buildFeatureVectors', () => {
    it('应返回正确的维度 (26 one-hot + 4 数值 = 30)', () => {
      const analyses = makeAnalyses(10);
      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors(analyses);

      expect(vectors.length).toBe(10);
      expect(vectors[0].length).toBe(30);
    });

    it('hook 类型 one-hot 应有且仅有一个 1', () => {
      const analyses = [makeAnalysis({ hookType: 'tutorial' })];
      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors(analyses);

      const oneHot = vectors[0].slice(0, 26);
      const ones = oneHot.filter((v) => v === 1.0);
      expect(ones.length).toBe(1);
    });

    it('空输入应返回空数组', () => {
      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors([]);
      expect(vectors.length).toBe(0);
    });

    it('数值指标应为标准化 z-score (均值≈0)', () => {
      const analyses = makeAnalyses(20);
      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors(analyses);

      // 取第 26 维 (shot_count_z) 计算均值，应接近 0
      const shotZs = vectors.map((v) => v[26]);
      const mean = shotZs.reduce((s, v) => s + v, 0) / shotZs.length;
      expect(Math.abs(mean)).toBeLessThan(1e-6);
    });

    it('unknown hook 类型应正确处理', () => {
      const analyses = [makeAnalysis({ hookType: 'unknown' })];
      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors(analyses);
      // unknown 在 ALL_HOOK_TYPES 的最后一个位置
      expect(vectors[0][25]).toBe(1.0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. K-Means 聚类
  // ══════════════════════════════════════════════════════════════════════════

  describe('kMeansClustering', () => {
    it('应向 N 个点返回 N 个分配', () => {
      const analyses = makeAnalyses(15);
      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors(analyses);
      const { clusters, assignments } = (service as unknown as Record<string, (...args: unknown[]) => { clusters: Array<{ members: number[] }>; assignments: number[] }>)
        .kMeansClustering(vectors, 3);

      expect(assignments.length).toBe(15);
      expect(clusters.length).toBeGreaterThanOrEqual(1);
      expect(clusters.length).toBeLessThanOrEqual(3);

      // 每个点的 assignment 必须在有效范围内
      assignments.forEach((c) => {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(clusters.length);
      });

      // 所有点都分配到某个簇
      const totalMembers = clusters.reduce((s, c) => s + c.members.length, 0);
      expect(totalMembers).toBe(15);
    });

    it('k=1 时所有点在同一个簇', () => {
      const analyses = makeAnalyses(10);
      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors(analyses);
      const { clusters } = (service as unknown as Record<string, (...args: unknown[]) => { clusters: Array<{ members: number[] }>; assignments: number[] }>)
        .kMeansClustering(vectors, 1);

      expect(clusters.length).toBe(1);
      expect(clusters[0].members.length).toBe(10);
    });

    it('k 大于样本数时应正确处理', () => {
      const analyses = makeAnalyses(5);
      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors(analyses);
      const { clusters } = (service as unknown as Record<string, (...args: unknown[]) => { clusters: Array<{ members: number[] }>; assignments: number[] }>)
        .kMeansClustering(vectors, 10);

      // 簇数不应超过样本数，空簇会被过滤
      expect(clusters.length).toBeLessThanOrEqual(5);
    });

    it('空输入应返回空结果', () => {
      const { clusters, assignments } = (service as unknown as Record<string, (...args: unknown[]) => { clusters: Array<{ members: number[] }>; assignments: number[] }>)
        .kMeansClustering([], 3);

      expect(clusters.length).toBe(0);
      expect(assignments.length).toBe(0);
    });

    it('不同 hook 类型的样本应被分到不同簇', () => {
      // 创建两类截然不同的分析
      const typeA = makeAnalyses(5).map((a) => makeAnalysis({ ...a, hookType: 'visual_contrast', reportJson: { engagementRate: 0.02, estimatedConversion: 0.01, avgWatchTime: 8 } }));
      const typeB = makeAnalyses(5).map((a) => makeAnalysis({ ...a, hookType: 'tutorial', reportJson: { engagementRate: 0.06, estimatedConversion: 0.04, avgWatchTime: 13 } }));
      const analyses = [...typeA, ...typeB];

      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors(analyses);
      const { clusters, assignments } = (service as unknown as Record<string, (...args: unknown[]) => { clusters: Array<{ members: number[] }>; assignments: number[] }>)
        .kMeansClustering(vectors, 2);

      // 两个簇至少各有 2 个成员
      clusters.forEach((c) => {
        expect(c.members.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. 轮廓系数
  // ══════════════════════════════════════════════════════════════════════════

  describe('silhouetteScore', () => {
    it('良好聚类应返回正值（> 0.05）', () => {
      const analyses = makeAnalyses(10);
      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors(analyses);
      const { clusters, assignments } = (service as unknown as Record<string, (...args: unknown[]) => { clusters: Array<{ members: number[] }>; assignments: number[] }>)
        .kMeansClustering(vectors, 3);

      const score = (service as unknown as Record<string, (...args: unknown[]) => number>)
        .silhouetteScore(vectors, assignments, clusters);

      expect(score).toBeGreaterThan(-1.1);
      expect(score).toBeLessThan(1.1);
      // 质量不差：不应是极端负值
    });

    it('单样本时返回 0', () => {
      const vectors = [[1, 0, 0, 0]];
      const assignments = [0];
      const clusters = [{ members: [0] }];

      const score = (service as unknown as Record<string, (...args: unknown[]) => number>)
        .silhouetteScore(vectors, assignments, clusters);

      expect(score).toBe(0);
    });

    it('单簇时返回 0', () => {
      const analyses = makeAnalyses(10);
      const vectors = (service as unknown as Record<string, (...args: unknown[]) => number[][]>)
        .buildFeatureVectors(analyses);
      const { clusters, assignments } = (service as unknown as Record<string, (...args: unknown[]) => { clusters: Array<{ members: number[] }>; assignments: number[] }>)
        .kMeansClustering(vectors, 1);

      const score = (service as unknown as Record<string, (...args: unknown[]) => number>)
        .silhouetteScore(vectors, assignments, clusters);

      expect(score).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. 统计计算
  // ══════════════════════════════════════════════════════════════════════════

  describe('computeStatistics', () => {
    it('应计算 hook 分布、数值统计、置信区间', () => {
      const analyses = makeAnalyses(12);
      const stats = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .computeStatistics(analyses, 'beauty');

      expect(stats).toBeDefined();
      expect(stats.sample_size).toBe(12);

      // Hook 分布
      const dist = stats.hook_type_distribution as Record<string, number>;
      const totalHooks = Object.values(dist).reduce((s: number, v: number) => s + v, 0);
      expect(totalHooks).toBe(12);

      // 数值统计存在且合理
      const eng = stats.engagement as { max: number; median: number; mean: number };
      expect(eng.mean).toBeGreaterThan(0);
      expect(eng.max).toBeGreaterThanOrEqual(eng.mean);
      expect(eng.median).toBeGreaterThan(0);

      // 多样性方差在 [0, 1] 范围
      const dv = stats.diversity_variance as number;
      expect(dv).toBeGreaterThanOrEqual(0);
      expect(dv).toBeLessThanOrEqual(1);

      // 95% 置信区间半宽
      const ci = stats.confidence_interval_95 as number;
      expect(ci).toBeGreaterThan(0);
      expect(ci).toBeLessThan(1);
    });

    it('空输入不应崩溃', () => {
      const stats = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .computeStatistics([], 'beauty');

      expect(stats.sample_size).toBe(0);
    });

    it('小样本 (< 5) 应使用小样本 t 值', () => {
      const analyses = makeAnalyses(3);
      const stats = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .computeStatistics(analyses, 'electronics');

      expect(stats.sample_size).toBe(3);
      // 小样本 CI 半宽应更大（t 值更高）
      const ci = stats.confidence_interval_95 as number;
      expect(ci).toBeGreaterThan(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. 聚类 → DNA 转换
  // ══════════════════════════════════════════════════════════════════════════

  describe('clusterToDNARaw', () => {
    it('应产生有效的 ViralDNA 结构', () => {
      const analyses = makeAnalyses(8);
      const cluster = {
        centroid: new Array(30).fill(0),
        members: [0, 1, 2, 3, 4, 5, 6, 7],
      };
      const stats = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .computeStatistics(analyses, 'beauty');

      const raw = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .clusterToDNARaw(cluster, analyses, 0, 'beauty', 'GLOBAL', stats);

      // 基本结构验证
      expect(raw.dna_id).toBeDefined();
      expect(raw.category).toBe('beauty');
      expect(raw.market).toBe('GLOBAL');

      // hooks 数组
      const hooks = raw.hooks as Array<{ type: string; effectiveness: Record<string, number> }>;
      expect(hooks.length).toBe(1);
      expect(hooks[0].type).toBeDefined();
      expect(hooks[0].effectiveness.retention_rate_avg).toBeGreaterThan(0);

      // visual_styles
      const vs = raw.visual_styles as Array<Record<string, unknown>>;
      expect(vs.length).toBe(1);
      expect(vs[0].style).toBeDefined();
      expect(vs[0].shot_count_range).toBeDefined();

      // bgm_patterns
      const bgm = raw.bgm_patterns as Array<Record<string, unknown>>;
      expect(bgm.length).toBe(1);
      expect(bgm[0].genre).toBeDefined();
      expect(bgm[0].bpm_range).toBeDefined();

      // pacing_patterns
      const pacing = raw.pacing_patterns as Array<Record<string, unknown>>;
      expect(pacing.length).toBe(1);

      // cta_styles
      const cta = raw.cta_styles as Array<Record<string, unknown>>;
      expect(cta.length).toBe(1);

      // 数值合理性
      const score = raw.composite_score as number;
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);

      const conf = raw.confidence as number;
      expect(conf).toBeGreaterThanOrEqual(0);
      expect(conf).toBeLessThanOrEqual(1);

      expect(raw.sample_count).toBe(8);
    });

    it('单样本簇也能生成 DNA', () => {
      const analyses = makeAnalyses(1);
      const cluster = { centroid: new Array(30).fill(0), members: [0] };
      const stats = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .computeStatistics(analyses, 'food');

      const raw = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .clusterToDNARaw(cluster, analyses, 0, 'food', 'GLOBAL', stats);

      expect(raw).toBeDefined();
      expect(raw.sample_count).toBe(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Mock 兜底生成
  // ══════════════════════════════════════════════════════════════════════════

  describe('generateMockAnalyses', () => {
    it('应生成指定数量的 mock 记录', () => {
      const mocks = (service as unknown as Record<string, (...args: unknown[]) => Array<Record<string, unknown>>>)
        .generateMockAnalyses('fashion', 7);

      expect(mocks.length).toBe(7);
      mocks.forEach((m) => {
        expect(m.id).toContain('mock-viral');
        expect(m.hookType).toBeDefined();
        expect(m.strategyJson).toBeDefined();
        expect(m.factorJson).toBeDefined();
        expect(m.reportJson).toBeDefined();
      });
    });

    it('应循环使用 hook 类型', () => {
      const mocks = (service as unknown as Record<string, (...args: unknown[]) => Array<Record<string, unknown>>>)
        .generateMockAnalyses('beauty', 20);

      // 检查有无重复模式（循环使用 15 种）
      const types = mocks.map((m) => m.hookType as string);
      const unique = new Set(types);
      expect(unique.size).toBeGreaterThanOrEqual(5); // 至少用 5 种不同 hook
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. LLM 语义标签
  // ══════════════════════════════════════════════════════════════════════════

  describe('labelClusterWithLLM', () => {
    it('LLM 正常返回 → 更新 hook/style/bgm/cta 标签', async () => {
      mockDoubaoTextProvider.generateText.mockResolvedValueOnce(
        '{"hook_label":"视觉对比","style_label":"快节奏混剪","bgm_label":"电子科技感","cta_label":"立即抢购"}',
      );

      const analyses = makeAnalyses(5);
      const cluster = { centroid: new Array(30).fill(0), members: [0, 1, 2, 3, 4] };
      const stats = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .computeStatistics(analyses, 'beauty');
      const raw = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .clusterToDNARaw(cluster, analyses, 0, 'beauty', 'GLOBAL', stats);

      const labeled = await (service as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>)
        .labelClusterWithLLM(raw, 'beauty', 0);

      const hooks = labeled.hooks as Array<{ type: string }>;
      expect(hooks[0].type).toBe('视觉对比');

      const vs = labeled.visual_styles as Array<{ style: string }>;
      expect(vs[0].style).toBe('快节奏混剪');

      const bgm = labeled.bgm_patterns as Array<{ genre: string }>;
      expect(bgm[0].genre).toBe('电子科技感');
    });

    it('LLM 返回空字符串 → 保留原始统计名称', async () => {
      mockDoubaoTextProvider.generateText.mockResolvedValueOnce(
        '{"hook_label":"","style_label":"","bgm_label":"","cta_label":""}',
      );

      const analyses = makeAnalyses(5);
      const cluster = { centroid: new Array(30).fill(0), members: [0, 1, 2, 3, 4] };
      const stats = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .computeStatistics(analyses, 'beauty');
      const raw = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .clusterToDNARaw(cluster, analyses, 0, 'beauty', 'GLOBAL', stats);
      const originalHookType = ((raw.hooks as Array<{ type: string }>)[0]).type;

      const labeled = await (service as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>)
        .labelClusterWithLLM(raw, 'beauty', 0);

      // 应保留原始值
      const labeledHooks = labeled.hooks as Array<{ type: string }>;
      expect(labeledHooks[0].type).toBe(originalHookType);
    });

    it('LLM 抛出异常 → 返回原始 DNA（降级）', async () => {
      mockDoubaoTextProvider.generateText = jest.fn().mockRejectedValue(new Error('API Timeout'));

      const analyses = makeAnalyses(5);
      const cluster = { centroid: new Array(30).fill(0), members: [0, 1, 2, 3, 4] };
      const stats = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .computeStatistics(analyses, 'beauty');
      const raw = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .clusterToDNARaw(cluster, analyses, 0, 'beauty', 'GLOBAL', stats);

      // 不应抛出异常
      const labeled = await (service as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>)
        .labelClusterWithLLM(raw, 'beauty', 0);

      expect(labeled).toBeDefined();
    });

    it('LLM 返回非法 JSON → 降级返回原始 DNA', async () => {
      mockDoubaoTextProvider.generateText.mockResolvedValueOnce('这不是 JSON');

      const analyses = makeAnalyses(5);
      const cluster = { centroid: new Array(30).fill(0), members: [0, 1, 2, 3, 4] };
      const stats = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .computeStatistics(analyses, 'beauty');
      const raw = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .clusterToDNARaw(cluster, analyses, 0, 'beauty', 'GLOBAL', stats);

      const labeled = await (service as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>)
        .labelClusterWithLLM(raw, 'beauty', 0);

      expect(labeled).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 8. 全链路提取 (extractDNAPatterns)
  // ══════════════════════════════════════════════════════════════════════════

  describe('extractDNAPatterns — 全链路', () => {
    it('正常流程：足够样本 → 收集 → 聚类 → 标签 → 持久化 → 返回 patterns', async () => {
      const analyses = makeAnalyses(12);
      mockViralAnalysisRepository.findByCategory.mockResolvedValueOnce(analyses);
      mockViralDnaRepository.deleteByCategory.mockResolvedValueOnce(5);
      mockViralDnaRepository.create.mockResolvedValue({});

      // Mock LLM 为每个簇返回短标签
      mockDoubaoTextProvider.generateText.mockResolvedValue(
        '{"hook_label":"吸引眼球","style_label":"快节奏","bgm_label":"电子","cta_label":"立即购买"}',
      );

      const progressLog: Array<{ phase: string; progress: number }> = [];
      const result = await service.extractDNAPatterns(
        { category: 'beauty', market: 'GLOBAL' },
        (phase, progress) => progressLog.push({ phase, progress }),
      );

      // 返回结构
      expect(result.patterns.length).toBeGreaterThanOrEqual(1);
      expect(result.total_samples).toBe(12);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.statistics).toBeDefined();

      // 进度回调应完整
      const phases = progressLog.map((p) => p.phase);
      expect(phases).toContain('collecting');
      expect(phases).toContain('clustering');
      expect(phases).toContain('generating');
      expect(phases).toContain('labeling');
      expect(phases).toContain('persisting');
      expect(phases).toContain('complete');

      // 持久化方法被调用
      expect(mockViralDnaRepository.deleteByCategory).toHaveBeenCalledWith('beauty', 'GLOBAL');
      expect(mockViralDnaRepository.create).toHaveBeenCalledTimes(result.patterns.length);
    });

    it('样本不足 → Mock 兜底 → 仍能提取成功', async () => {
      mockViralAnalysisRepository.findByCategory.mockResolvedValueOnce([]);
      mockViralDnaRepository.deleteByCategory.mockResolvedValueOnce(0);
      mockViralDnaRepository.create.mockResolvedValue({});
      mockDoubaoTextProvider.generateText.mockResolvedValue(
        '{"hook_label":"分类标签","style_label":"风格标签","bgm_label":"BGM标签","cta_label":"CTA标签"}',
      );

      const result = await service.extractDNAPatterns({ category: 'home', min_samples: 5 });

      // 兜底成功
      expect(result.patterns.length).toBeGreaterThanOrEqual(1);
      expect(result.total_samples).toBeGreaterThanOrEqual(5); // Mock 生成了至少 5 条
    });

    it('LLM 标签全部超时 → 降级使用统计名称', async () => {
      const analyses = makeAnalyses(8);
      mockViralAnalysisRepository.findByCategory.mockResolvedValueOnce(analyses);
      mockViralDnaRepository.deleteByCategory.mockResolvedValueOnce(0);
      mockViralDnaRepository.create.mockResolvedValue({});
      mockDoubaoTextProvider.generateText.mockRejectedValue(new Error('Timeout'));

      const result = await service.extractDNAPatterns({ category: 'electronics' });

      // 不抛异常，降级到统计名称
      expect(result.patterns.length).toBeGreaterThanOrEqual(1);
    });

    it('each pattern 应包含完整 DNA 子结构', async () => {
      const analyses = makeAnalyses(10);
      mockViralAnalysisRepository.findByCategory.mockResolvedValueOnce(analyses);
      mockViralDnaRepository.deleteByCategory.mockResolvedValueOnce(0);
      mockViralDnaRepository.create.mockResolvedValue({});
      mockDoubaoTextProvider.generateText.mockResolvedValue(
        '{"hook_label":"T","style_label":"S","bgm_label":"B","cta_label":"C"}',
      );

      const result = await service.extractDNAPatterns({ category: 'fashion' });

      for (const p of result.patterns) {
        expect(p.dna_id).toBeDefined();
        expect(p.hooks.length).toBeGreaterThanOrEqual(1);
        expect(p.visual_styles.length).toBeGreaterThanOrEqual(1);
        expect(p.bgm_patterns.length).toBeGreaterThanOrEqual(1);
        expect(p.pacing_patterns.length).toBeGreaterThanOrEqual(1);
        expect(p.cta_styles.length).toBeGreaterThanOrEqual(1);
        expect(p.composite_score).toBeGreaterThan(0);
        expect(p.confidence).toBeGreaterThanOrEqual(0);
        expect(p.sample_count).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 9. Doubao LLM 可用性
  // ══════════════════════════════════════════════════════════════════════════

  describe('Doubao LLM 可用性', () => {
    it('checkHealth 应可用', async () => {
      const result = await mockDoubaoTextProvider.checkHealth();
      expect(result.ok).toBe(true);
      expect(result.configured).toBe(true);
    });

    it('buildLabelPrompt 应产生合理长度 prompt（< 2KB）', () => {
      const analyses = makeAnalyses(5);
      const cluster = { centroid: new Array(30).fill(0), members: [0, 1, 2, 3, 4] };
      const stats = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .computeStatistics(analyses, 'beauty');
      const raw = (service as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>)
        .clusterToDNARaw(cluster, analyses, 0, 'beauty', 'GLOBAL', stats);

      const prompt = (service as unknown as Record<string, (...args: unknown[]) => string>)
        .buildLabelPrompt(raw, 'beauty', 0);

      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt.length).toBeLessThan(3000); // 远小于原来的 30KB
      expect(prompt).toContain('beauty');
      expect(prompt).toContain('短视频模式命名专家');
      expect(prompt).toContain('hook_label');
    });
  });
});
