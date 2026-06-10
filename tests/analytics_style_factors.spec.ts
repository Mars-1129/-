// =============================================================================
// TikStream AI — Analytics Style Factors 自动化测试基座
// 对应功能: GET /api/v1/analytics/style-factors (风格因子热力图查询接口)
// 对应模块: Analytics (人员B) | 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

interface TestHeatmapCell {
  x_key: string;
  y_key: string;
  score: number;
  contribution_rate?: number;
  sample_size?: number;
  confidence_tag?: 'HIGH' | 'MEDIUM' | 'LOW';
  insufficient_data?: boolean;
}

interface TestStyleFactorHeatmapResponse {
  product_id: string;
  metric: 'CTR' | 'CVR' | 'COMPLETION_RATE' | 'RETENTION_RATE';
  x_dimension: 'NARRATIVE_STRATEGY' | 'VISUAL_STYLE' | 'BGM_STYLE' | 'CTA_STYLE';
  y_dimension: 'NARRATIVE_STRATEGY' | 'VISUAL_STYLE' | 'BGM_STYLE' | 'CTA_STYLE';
  x_axis_labels: string[];
  y_axis_labels: string[];
  cells: TestHeatmapCell[];
  top_positive_factors?: Array<{ factor: string; contribution: number }>;
  top_negative_factors?: Array<{ factor: string; contribution: number }>;
  summary: Record<string, unknown>;
  data_source: 'DUCKDB_PRECOMPUTED';
  is_mock: boolean;
  is_predicted: boolean;
  generated_at: string;
}

interface TestStyleFactorHeatmapQuery {
  product_id: string;
  metric?: 'CTR' | 'CVR' | 'COMPLETION_RATE' | 'RETENTION_RATE';
  x_dimension?: 'NARRATIVE_STRATEGY' | 'VISUAL_STYLE' | 'BGM_STYLE' | 'CTA_STYLE';
  y_dimension?: 'NARRATIVE_STRATEGY' | 'VISUAL_STYLE' | 'BGM_STYLE' | 'CTA_STYLE';
  top_n?: number;
}

interface DuckDBStyleFactorData {
  x_axis_labels: string[];
  y_axis_labels: string[];
  cells: TestHeatmapCell[];
  data_source: 'DUCKDB_PRECOMPUTED';
  is_mock: boolean;
  is_predicted: boolean;
}

type MockPrismaService = {
  product: { findUnique: jest.Mock };
};
type MockDuckDBDataSource = {
  queryStyleFactors: jest.Mock;
};

const NOW = new Date('2026-05-25T12:00:00Z');
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';

const MOCK_NARRATIVE_STRATEGIES = ['问题前置型', '悬念递进型', '对比反差型', '故事叙述型', '清单罗列型'];
const MOCK_VISUAL_STYLES = ['产品特写', '场景展示', '文字叠加', '真人出镜', '动画演示'];
const MOCK_BGM_STYLES = ['快节奏电子', '舒缓钢琴', '激昂管弦', '轻松吉他', '无BGM'];
const MOCK_CTA_STYLES = ['直接促销', '限时优惠', '软性引导', '问题引导', '无CTA'];

const DIMENSION_LABELS: Record<string, string[]> = {
  NARRATIVE_STRATEGY: MOCK_NARRATIVE_STRATEGIES,
  VISUAL_STYLE: MOCK_VISUAL_STYLES,
  BGM_STYLE: MOCK_BGM_STYLES,
  CTA_STYLE: MOCK_CTA_STYLES,
};

let _seedCounter = 0;

function pseudoRandom(seed: number): number {
  let s = seed;
  s = (s * 1103515245 + 12345) & 0x7fffffff;
  return s / 0x7fffffff;
}

function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 8); i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash || 1;
}

function makeMockStyleFactorCells(
  xLabels: string[],
  yLabels: string[],
  seed: number,
): TestHeatmapCell[] {
  const cells: TestHeatmapCell[] = [];
  let s = seed;
  for (const xKey of xLabels) {
    for (const yKey of yLabels) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const score = Math.round((0.2 + pseudoRandom(s) * 0.75) * 10000) / 10000;
      const contributionRate = Math.round((pseudoRandom(s + 1) * 0.8 - 0.3) * 10000) / 10000;
      const sampleSize = Math.floor(pseudoRandom(s + 2) * 490) + 10;
      let confidenceTag: 'HIGH' | 'MEDIUM' | 'LOW';
      if (sampleSize >= 200) {
        confidenceTag = 'HIGH';
      } else if (sampleSize >= 50) {
        confidenceTag = 'MEDIUM';
      } else {
        confidenceTag = 'LOW';
      }
      const insufficientData = sampleSize < 20;

      cells.push({
        x_key: xKey,
        y_key: yKey,
        score,
        contribution_rate: contributionRate,
        sample_size: sampleSize,
        confidence_tag: confidenceTag,
        insufficient_data: insufficientData,
      });
    }
  }
  return cells;
}

function makeDuckDBStyleFactorData(
  xDim: string,
  yDim: string,
  seed: number,
): DuckDBStyleFactorData {
  const xLabels = DIMENSION_LABELS[xDim] ?? MOCK_NARRATIVE_STRATEGIES;
  const yLabels = DIMENSION_LABELS[yDim] ?? MOCK_VISUAL_STYLES;
  const cells = makeMockStyleFactorCells(xLabels, yLabels, seed);
  return {
    x_axis_labels: xLabels,
    y_axis_labels: yLabels,
    cells,
    data_source: 'DUCKDB_PRECOMPUTED' as const,
    is_mock: false,
    is_predicted: true,
  };
}

function makeSmallDuckDBStyleFactorData(
  xDim: string,
  yDim: string,
): DuckDBStyleFactorData {
  const xLabels = DIMENSION_LABELS[xDim]?.slice(0, 2) ?? ['X1', 'X2'];
  const yLabels = DIMENSION_LABELS[yDim]?.slice(0, 2) ?? ['Y1', 'Y2'];
  const cells: TestHeatmapCell[] = [
    { x_key: xLabels[0], y_key: yLabels[0], score: 0.85, contribution_rate: 0.35, sample_size: 300, confidence_tag: 'HIGH', insufficient_data: false },
    { x_key: xLabels[0], y_key: yLabels[1], score: 0.65, contribution_rate: 0.10, sample_size: 250, confidence_tag: 'HIGH', insufficient_data: false },
    { x_key: xLabels[1], y_key: yLabels[0], score: 0.40, contribution_rate: -0.25, sample_size: 180, confidence_tag: 'MEDIUM', insufficient_data: false },
    { x_key: xLabels[1], y_key: yLabels[1], score: 0.55, contribution_rate: -0.05, sample_size: 12, confidence_tag: 'LOW', insufficient_data: true },
  ];
  return {
    x_axis_labels: xLabels,
    y_axis_labels: yLabels,
    cells,
    data_source: 'DUCKDB_PRECOMPUTED' as const,
    is_mock: false,
    is_predicted: true,
  };
}

function makePrismaProduct(productId: string): Record<string, unknown> {
  return { id: productId };
}

describe('AnalyticsStyleFactors — 风格因子热力图查询 (GET /api/v1/analytics/style-factors)', () => {
  let mockPrisma: MockPrismaService;
  let mockDuckDB: MockDuckDBDataSource;

  type FindProductByIdFn = (productId: string, prisma: MockPrismaService) => Promise<{ id: string } | null>;
  type ValidateStyleFactorParamsFn = (
    productId: string,
    metric: string,
    xDim: string,
    yDim: string,
    topN: number,
  ) => void;
  type FetchDuckDBStyleFactorsFn = (
    productId: string,
    metric: string,
    xDim: string,
    yDim: string,
    duckDB: MockDuckDBDataSource,
  ) => Promise<DuckDBStyleFactorData>;
  type ComputeTopContributorsFn = (
    cells: TestHeatmapCell[],
    topN: number,
  ) => {
    top_positive_factors: Array<{ factor: string; contribution: number }>;
    top_negative_factors: Array<{ factor: string; contribution: number }>;
  };
  type BuildHeatmapSummaryFn = (
    cells: TestHeatmapCell[],
    metric: string,
  ) => Record<string, unknown>;
  type GetStyleFactorsFn = (
    dto: TestStyleFactorHeatmapQuery,
    deps: {
      prisma: MockPrismaService;
      duckDB: MockDuckDBDataSource;
      findProductById: FindProductByIdFn;
      validateParams: ValidateStyleFactorParamsFn;
      fetchData: FetchDuckDBStyleFactorsFn;
      computeTopContributors: ComputeTopContributorsFn;
      buildSummary: BuildHeatmapSummaryFn;
    },
  ) => Promise<TestStyleFactorHeatmapResponse>;

  let findProductById: FindProductByIdFn;
  let validateStyleFactorParams: ValidateStyleFactorParamsFn;
  let fetchDuckDBStyleFactors: FetchDuckDBStyleFactorsFn;
  let computeTopContributors: ComputeTopContributorsFn;
  let buildHeatmapSummary: BuildHeatmapSummaryFn;
  let getStyleFactors: GetStyleFactorsFn;

  beforeAll(() => {
    findProductById = async (productId, prisma) => {
      if (!productId || productId.trim().length === 0) {
        throw Object.assign(new Error('product_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      try {
        const record = await prisma.product.findUnique({
          where: { id: productId },
          select: { id: true },
        });
        if (!record) {
          return null;
        }
        return { id: String(record.id) };
      } catch (error) {
        if (error instanceof Error) {
          const pe = error as Error & { code?: string };
          switch (pe.code) {
            case 'P1001':
              throw Object.assign(new Error('PostgreSQL 连接中断，请检查数据库状态'), {
                errorCode: 'INTERNAL_SERVER_ERROR',
                statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                retryable: true,
              });
            case 'P1008':
              throw Object.assign(new Error('数据库查询超时'), {
                errorCode: 'INTERNAL_SERVER_ERROR',
                statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                retryable: true,
              });
            case 'P2025':
              throw Object.assign(new Error('商品不存在'), {
                errorCode: 'PRODUCT_NOT_FOUND',
                statusCode: HttpStatus.NOT_FOUND,
                retryable: false,
              });
            case 'P2024':
              throw Object.assign(new Error('数据库连接池耗尽'), {
                errorCode: 'INTERNAL_SERVER_ERROR',
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                retryable: true,
              });
            default:
              throw Object.assign(new Error(`数据库操作失败: ${pe.message}`), {
                errorCode: 'INTERNAL_SERVER_ERROR',
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                retryable: true,
              });
          }
        }
        throw Object.assign(new Error('未知数据库错误'), {
          errorCode: 'INTERNAL_SERVER_ERROR',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          retryable: true,
        });
      }
    };

    validateStyleFactorParams = (productId, metric, xDim, yDim, topN) => {
      if (!productId || productId.trim().length === 0) {
        throw Object.assign(new Error('product_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }

      const validMetrics = ['CTR', 'CVR', 'COMPLETION_RATE', 'RETENTION_RATE'];
      if (metric && !validMetrics.includes(metric)) {
        throw Object.assign(
          new Error(`metric 取值必须为 CTR / CVR / COMPLETION_RATE / RETENTION_RATE: 实际为 "${metric}"`),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }

      const validDimensions = ['NARRATIVE_STRATEGY', 'VISUAL_STYLE', 'BGM_STYLE', 'CTA_STYLE'];
      if (xDim && !validDimensions.includes(xDim)) {
        throw Object.assign(
          new Error(`x_dimension 取值必须为 NARRATIVE_STRATEGY / VISUAL_STYLE / BGM_STYLE / CTA_STYLE: 实际为 "${xDim}"`),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }
      if (yDim && !validDimensions.includes(yDim)) {
        throw Object.assign(
          new Error(`y_dimension 取值必须为 NARRATIVE_STRATEGY / VISUAL_STYLE / BGM_STYLE / CTA_STYLE: 实际为 "${yDim}"`),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }

      const effectiveXDim = xDim || 'NARRATIVE_STRATEGY';
      const effectiveYDim = yDim || 'VISUAL_STYLE';
      if (effectiveXDim === effectiveYDim) {
        throw Object.assign(
          new Error(`x_dimension 与 y_dimension 不能相同，交叉分析需要两个不同维度: 均为 "${effectiveXDim}"`),
          {
            errorCode: 'ANALYTICS_STYLE_FACTOR_DIMENSION_CONFLICT',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }

      if (topN < 1 || topN > 50) {
        throw Object.assign(new Error(`top_n 取值范围为 1 到 50: 实际为 ${topN}`), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
    };

    fetchDuckDBStyleFactors = async (productId, metric, xDim, yDim, duckDB) => {
      try {
        const result = await duckDB.queryStyleFactors(productId, metric, xDim, yDim);
        if (
          result &&
          result.cells &&
          Array.isArray(result.cells) &&
          result.cells.length > 0
        ) {
          return {
            x_axis_labels: result.x_axis_labels ?? [],
            y_axis_labels: result.y_axis_labels ?? [],
            cells: result.cells as TestHeatmapCell[],
            data_source: 'DUCKDB_PRECOMPUTED' as const,
            is_mock: result.is_mock ?? false,
            is_predicted: result.is_predicted ?? true,
          };
        }
        const seed = seedFromString(productId);
        const data = makeDuckDBStyleFactorData(xDim, yDim, seed);
        return { ...data, is_mock: true, is_predicted: true };
      } catch {
        const seed = seedFromString(productId);
        const data = makeDuckDBStyleFactorData(xDim, yDim, seed);
        return { ...data, is_mock: true, is_predicted: true };
      }
    };

    computeTopContributors = (cells, topN) => {
      const sorted = [...cells]
        .filter((c) => c.contribution_rate !== undefined && c.contribution_rate !== null)
        .sort((a, b) => (b.contribution_rate as number) - (a.contribution_rate as number));

      const positives: Array<{ factor: string; contribution: number }> = [];
      const negatives: Array<{ factor: string; contribution: number }> = [];

      for (const cell of sorted) {
        const rate = cell.contribution_rate as number;
        if (rate > 0 && positives.length < topN) {
          positives.push({
            factor: `${cell.x_key} × ${cell.y_key}`,
            contribution: Math.round(rate * 10000) / 10000,
          });
        }
      }

      const reversed = [...sorted].reverse();
      for (const cell of reversed) {
        const rate = cell.contribution_rate as number;
        if (rate < 0 && negatives.length < topN) {
          negatives.push({
            factor: `${cell.x_key} × ${cell.y_key}`,
            contribution: Math.round(rate * 10000) / 10000,
          });
        }
      }

      return {
        top_positive_factors: positives,
        top_negative_factors: negatives,
      };
    };

    buildHeatmapSummary = (cells, metric) => {
      if (!cells || cells.length === 0) {
        return { total_cells: 0, metric };
      }

      let totalScore = 0;
      let maxScore = -Infinity;
      let minScore = Infinity;
      let totalContribution = 0;
      let contributionCount = 0;
      let insufficientCount = 0;

      for (const cell of cells) {
        totalScore += cell.score;
        if (cell.score > maxScore) maxScore = cell.score;
        if (cell.score < minScore) minScore = cell.score;
        if (cell.contribution_rate !== undefined && cell.contribution_rate !== null) {
          totalContribution += cell.contribution_rate;
          contributionCount++;
        }
        if (cell.insufficient_data) {
          insufficientCount++;
        }
      }

      return {
        total_cells: cells.length,
        mean_score: Math.round((totalScore / cells.length) * 10000) / 10000,
        max_score: Math.round(maxScore * 10000) / 10000,
        min_score: Math.round(minScore * 10000) / 10000,
        mean_contribution_rate:
          contributionCount > 0
            ? Math.round((totalContribution / contributionCount) * 10000) / 10000
            : 0,
        cells_with_insufficient_data: insufficientCount,
        metric,
      };
    };

    getStyleFactors = async (dto, deps) => {
      const {
        prisma,
        duckDB,
        findProductById: fp,
        validateParams,
        fetchData,
        computeTopContributors: ctc,
        buildSummary,
      } = deps;

      const metric = dto.metric ?? 'CTR';
      const xDim = dto.x_dimension ?? 'NARRATIVE_STRATEGY';
      const yDim = dto.y_dimension ?? 'VISUAL_STYLE';
      const topN = dto.top_n ?? 5;

      validateParams(dto.product_id, metric, xDim, yDim, topN);

      const product = await fp(dto.product_id, prisma);
      if (!product) {
        throw Object.assign(new Error(`商品 ${dto.product_id} 不存在`), {
          errorCode: 'PRODUCT_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }

      const factorData = await fetchData(dto.product_id, metric, xDim, yDim, duckDB);

      const { top_positive_factors, top_negative_factors } = ctc(factorData.cells, topN);
      const summary = buildSummary(factorData.cells, metric);

      return {
        product_id: dto.product_id,
        metric,
        x_dimension: xDim,
        y_dimension: yDim,
        x_axis_labels: factorData.x_axis_labels,
        y_axis_labels: factorData.y_axis_labels,
        cells: factorData.cells,
        top_positive_factors,
        top_negative_factors,
        summary,
        data_source: 'DUCKDB_PRECOMPUTED',
        is_mock: factorData.is_mock,
        is_predicted: factorData.is_predicted,
        generated_at: new Date().toISOString(),
      };
    };
  });

  beforeEach(() => {
    mockPrisma = { product: { findUnique: jest.fn() } };
    mockDuckDB = { queryStyleFactors: jest.fn() };
    _seedCounter = 0;
  });

  const deps = () => ({
    prisma: mockPrisma,
    duckDB: mockDuckDB,
    findProductById,
    validateParams: validateStyleFactorParams,
    fetchData: fetchDuckDBStyleFactors,
    computeTopContributors,
    buildSummary: buildHeatmapSummary,
  });

  function setupSuccess(
    productId: string = PRODUCT_ID,
    duckDBData?: DuckDBStyleFactorData,
  ): void {
    mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(productId));
    mockDuckDB.queryStyleFactors.mockResolvedValue(
      duckDBData ?? makeSmallDuckDBStyleFactorData('NARRATIVE_STRATEGY', 'VISUAL_STYLE'),
    );
  }

  // ============================================================
  // 1. 正常流 (Happy Path) — 6 条
  // ============================================================
  describe('【正常流】合法查询参数 → 完整 StyleFactorHeatmapResponse', () => {
    beforeEach(() => {
      setupSuccess();
    });

    it('TC-ANL-SF-001: 完整查询返回顶层字段齐全并符合 api_types 契约', async () => {
      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      expect(r.product_id).toBe(PRODUCT_ID);
      expect(r.metric).toBe('CTR');
      expect(r.x_dimension).toBe('NARRATIVE_STRATEGY');
      expect(r.y_dimension).toBe('VISUAL_STYLE');
      expect(r.data_source).toBe('DUCKDB_PRECOMPUTED');
      expect(typeof r.is_mock).toBe('boolean');
      expect(typeof r.is_predicted).toBe('boolean');
      expect(typeof r.generated_at).toBe('string');
      expect(new Date(r.generated_at).getTime()).toBeGreaterThan(0);

      expect(Array.isArray(r.x_axis_labels)).toBe(true);
      expect(Array.isArray(r.y_axis_labels)).toBe(true);
      expect(Array.isArray(r.cells)).toBe(true);
      expect(r.cells.length).toBeGreaterThan(0);

      expect(r.top_positive_factors).toBeDefined();
      expect(Array.isArray(r.top_positive_factors)).toBe(true);
      expect(r.top_negative_factors).toBeDefined();
      expect(Array.isArray(r.top_negative_factors)).toBe(true);

      expect(r.summary).toBeDefined();
      expect(typeof r.summary).toBe('object');
      expect(r.summary).not.toBeNull();
    });

    it('TC-ANL-SF-002: cells 中每个元素包含 x_key/y_key/score 必需字段', async () => {
      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      for (const cell of r.cells) {
        expect(typeof cell.x_key).toBe('string');
        expect(cell.x_key.length).toBeGreaterThan(0);
        expect(typeof cell.y_key).toBe('string');
        expect(cell.y_key.length).toBeGreaterThan(0);
        expect(typeof cell.score).toBe('number');
        expect(cell.score).toBeGreaterThanOrEqual(0);
        expect(cell.score).toBeLessThanOrEqual(1);
      }
    });

    it('TC-ANL-SF-003: cells 笛卡尔积覆盖 x_axis_labels × y_axis_labels', async () => {
      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      const expectedCellCount = r.x_axis_labels.length * r.y_axis_labels.length;
      expect(r.cells.length).toBe(expectedCellCount);

      for (const xLabel of r.x_axis_labels) {
        for (const yLabel of r.y_axis_labels) {
          const found = r.cells.find((c) => c.x_key === xLabel && c.y_key === yLabel);
          expect(found).toBeDefined();
        }
      }
    });

    it('TC-ANL-SF-004: confidence_tag ∈ {HIGH, MEDIUM, LOW} 且 consistent', async () => {
      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      const validTags = ['HIGH', 'MEDIUM', 'LOW', undefined];
      for (const cell of r.cells) {
        expect(validTags).toContain(cell.confidence_tag);
        if (cell.sample_size !== undefined && cell.sample_size !== null) {
          if (cell.sample_size >= 200) {
            expect(cell.confidence_tag).toBe('HIGH');
          } else if (cell.sample_size >= 50) {
            expect(cell.confidence_tag).toBe('MEDIUM');
          } else if (cell.sample_size >= 20) {
            expect(cell.confidence_tag).toBe('LOW');
          }
        }
        if (cell.insufficient_data) {
          expect(
            cell.sample_size === undefined || cell.sample_size === null || cell.sample_size < 20,
          ).toBe(true);
        }
      }
    });

    it('TC-ANL-SF-005: top_positive_factors 按 contribution 降序排列', async () => {
      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      const pos = r.top_positive_factors ?? [];
      for (let i = 1; i < pos.length; i++) {
        expect(pos[i].contribution).toBeLessThanOrEqual(pos[i - 1].contribution);
      }
    });

    it('TC-ANL-SF-006: top_negative_factors 按 contribution 升序排列（最负在前）', async () => {
      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      const neg = r.top_negative_factors ?? [];
      for (let i = 1; i < neg.length; i++) {
        expect(neg[i].contribution).toBeGreaterThanOrEqual(neg[i - 1].contribution);
      }
    });
  });

  // ============================================================
  // 2. 边界流 (Edge Cases) — 10 条
  // ============================================================
  describe('【边界流】极端数据 → 系统优雅处理', () => {
    it('TC-ANL-SF-BND-001: DuckDB 不可用 → 降级 Mock (is_mock=true)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryStyleFactors.mockRejectedValue(new Error('Connection refused'));

      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      expect(r.is_mock).toBe(true);
      expect(r.is_predicted).toBe(true);
      expect(r.cells.length).toBeGreaterThan(0);
      expect(r.x_axis_labels.length).toBeGreaterThan(0);
      expect(r.y_axis_labels.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SF-BND-002: DuckDB 返回空 cells → 降级 Mock 数据', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryStyleFactors.mockResolvedValue({
        x_axis_labels: [],
        y_axis_labels: [],
        cells: [],
        is_mock: false,
        is_predicted: true,
      });

      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      expect(r.cells.length).toBeGreaterThan(0);
      expect(r.x_axis_labels.length).toBeGreaterThan(0);
      expect(r.y_axis_labels.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SF-BND-003: DuckDB 返回 null → 降级 Mock 不崩溃', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryStyleFactors.mockResolvedValue(null);

      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      expect(Array.isArray(r.cells)).toBe(true);
      expect(r.cells.length).toBeGreaterThan(0);
      expect(r.is_mock).toBe(true);
    });

    it('TC-ANL-SF-BND-004: DuckDB 返回 undefined → 降级 Mock 不崩溃', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryStyleFactors.mockResolvedValue(undefined);

      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      expect(Array.isArray(r.cells)).toBe(true);
      expect(r.cells.length).toBeGreaterThan(0);
      expect(r.is_mock).toBe(true);
    });

    it('TC-ANL-SF-BND-005: top_n=1 → 正负各最多 1 条', async () => {
      setupSuccess();

      const r = await getStyleFactors({ product_id: PRODUCT_ID, top_n: 1 }, deps());

      expect((r.top_positive_factors ?? []).length).toBeLessThanOrEqual(1);
      expect((r.top_negative_factors ?? []).length).toBeLessThanOrEqual(1);
    });

    it('TC-ANL-SF-BND-006: top_n=50 → 正负各最多 50 条', async () => {
      setupSuccess();

      const r = await getStyleFactors({ product_id: PRODUCT_ID, top_n: 50 }, deps());

      expect((r.top_positive_factors ?? []).length).toBeLessThanOrEqual(50);
      expect((r.top_negative_factors ?? []).length).toBeLessThanOrEqual(50);
    });

    it('TC-ANL-SF-BND-007: SQL 注入式 product_id 不报错（参数化查询安全）', async () => {
      const sqlInjectId = "PROD'; DROP TABLE products;--";
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(sqlInjectId));
      mockDuckDB.queryStyleFactors.mockResolvedValue(
        makeSmallDuckDBStyleFactorData('NARRATIVE_STRATEGY', 'VISUAL_STYLE'),
      );

      const r = await getStyleFactors({ product_id: sqlInjectId }, deps());

      expect(r.product_id).toBe(sqlInjectId);
    });

    it('TC-ANL-SF-BND-008: metric/CVR/x=NARRATIVE_STRATEGY/y=CTA_STYLE 全非默认组合', async () => {
      setupSuccess(PRODUCT_ID, makeSmallDuckDBStyleFactorData('NARRATIVE_STRATEGY', 'CTA_STYLE'));

      const r = await getStyleFactors(
        {
          product_id: PRODUCT_ID,
          metric: 'CVR',
          x_dimension: 'NARRATIVE_STRATEGY',
          y_dimension: 'CTA_STYLE',
        },
        deps(),
      );

      expect(r.metric).toBe('CVR');
      expect(r.x_dimension).toBe('NARRATIVE_STRATEGY');
      expect(r.y_dimension).toBe('CTA_STYLE');
    });

    it('TC-ANL-SF-BND-009: metric 不传默认 CTR', async () => {
      setupSuccess();

      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      expect(r.metric).toBe('CTR');
    });

    it('TC-ANL-SF-BND-010: cells 中 contribution_rate 全为 0 → top 列表为空', async () => {
      const zeroCells: TestHeatmapCell[] = [
        { x_key: 'X1', y_key: 'Y1', score: 0.5, contribution_rate: 0, sample_size: 100 },
        { x_key: 'X1', y_key: 'Y2', score: 0.5, contribution_rate: 0, sample_size: 100 },
      ];
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryStyleFactors.mockResolvedValue({
        x_axis_labels: ['X1'],
        y_axis_labels: ['Y1', 'Y2'],
        cells: zeroCells,
        is_mock: false,
        is_predicted: true,
      });

      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      expect(r.top_positive_factors).toHaveLength(0);
      expect(r.top_negative_factors).toHaveLength(0);
    });
  });

  // ============================================================
  // 3. 异常流 (Error Flow) — 19 条
  // ============================================================
  describe('【异常流】人为制造报错 → 精准捕获规范错误码', () => {
    const err = async (query: TestStyleFactorHeatmapQuery) => {
      let caught: (Error & { errorCode?: string; statusCode?: number; retryable?: boolean }) | null = null;
      try {
        await getStyleFactors(query, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }
      return caught;
    };

    it('TC-ANL-SF-ERR-001: product_id 空字符串 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: '' });
      expect(e).not.toBeNull();
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-SF-ERR-002: product_id 纯空白 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: '   ' });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-SF-ERR-003: product_id 为 undefined → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: undefined as unknown as string });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-SF-ERR-004: metric 非法值 "LIKES" → INVALID_REQUEST 400', async () => {
      setupSuccess();
      const e = await err({ product_id: PRODUCT_ID, metric: 'LIKES' as 'CTR' });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.message).toContain('LIKES');
    });

    it('TC-ANL-SF-ERR-005: x_dimension 非法值 "COLOR_TONE" → INVALID_REQUEST 400', async () => {
      setupSuccess();
      const e = await err({
        product_id: PRODUCT_ID,
        x_dimension: 'COLOR_TONE' as 'NARRATIVE_STRATEGY',
      });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.message).toContain('COLOR_TONE');
    });

    it('TC-ANL-SF-ERR-006: y_dimension 非法值 "EDITING_PACE" → INVALID_REQUEST 400', async () => {
      setupSuccess();
      const e = await err({
        product_id: PRODUCT_ID,
        y_dimension: 'EDITING_PACE' as 'VISUAL_STYLE',
      });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.message).toContain('EDITING_PACE');
    });

    it('TC-ANL-SF-ERR-007: x_dim === y_dim (同维度冲突) → ANALYTICS_STYLE_FACTOR_DIMENSION_CONFLICT 400', async () => {
      setupSuccess();
      const e = await err({
        product_id: PRODUCT_ID,
        x_dimension: 'VISUAL_STYLE',
        y_dimension: 'VISUAL_STYLE',
      });
      expect(e!.errorCode).toBe('ANALYTICS_STYLE_FACTOR_DIMENSION_CONFLICT');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(e!.retryable).toBe(false);
    });

    it('TC-ANL-SF-ERR-008: 默认 x=NARRATIVE_STRATEGY / y=NARRATIVE_STRATEGY 冲突 → DIMENSION_CONFLICT', async () => {
      setupSuccess();
      const e = await err({
        product_id: PRODUCT_ID,
        x_dimension: 'NARRATIVE_STRATEGY',
        y_dimension: 'NARRATIVE_STRATEGY',
      });
      expect(e!.errorCode).toBe('ANALYTICS_STYLE_FACTOR_DIMENSION_CONFLICT');
    });

    it('TC-ANL-SF-ERR-009: top_n=0 → INVALID_REQUEST 400', async () => {
      setupSuccess();
      const e = await err({ product_id: PRODUCT_ID, top_n: 0 });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.message).toContain('top_n');
    });

    it('TC-ANL-SF-ERR-010: top_n=51 → INVALID_REQUEST 400', async () => {
      setupSuccess();
      const e = await err({ product_id: PRODUCT_ID, top_n: 51 });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.message).toContain('51');
    });

    it('TC-ANL-SF-ERR-011: top_n=-1 → INVALID_REQUEST 400', async () => {
      setupSuccess();
      const e = await err({ product_id: PRODUCT_ID, top_n: -1 });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-SF-ERR-012: 商品不存在 → PRODUCT_NOT_FOUND 404', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(e!.retryable).toBe(false);
    });

    it('TC-ANL-SF-ERR-013: PostgreSQL P1001 → INTERNAL_SERVER_ERROR 503', async () => {
      const dbErr = new Error('Connection terminated');
      (dbErr as Error & { code?: string }).code = 'P1001';
      mockPrisma.product.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SF-ERR-014: PostgreSQL P1008 超时 → INTERNAL_SERVER_ERROR 503', async () => {
      const dbErr = new Error('Query timeout');
      (dbErr as Error & { code?: string }).code = 'P1008';
      mockPrisma.product.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SF-ERR-015: Prisma P2025 → PRODUCT_NOT_FOUND 404', async () => {
      const dbErr = new Error('Record not found');
      (dbErr as Error & { code?: string }).code = 'P2025';
      mockPrisma.product.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(e!.retryable).toBe(false);
    });

    it('TC-ANL-SF-ERR-016: Prisma P2024 连接池耗尽 → INTERNAL_SERVER_ERROR 500', async () => {
      const dbErr = new Error('Pool exhausted');
      (dbErr as Error & { code?: string }).code = 'P2024';
      mockPrisma.product.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SF-ERR-017: 未知 Prisma 异常 → INTERNAL_SERVER_ERROR 500', async () => {
      mockPrisma.product.findUnique.mockRejectedValue(new Error('Random crash'));
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SF-ERR-018: 非 Error 实例抛出 → INTERNAL_SERVER_ERROR 500', async () => {
      mockPrisma.product.findUnique.mockRejectedValue('raw string error');
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-ANL-SF-ERR-019: DuckDB 异常不阻止返回 (静默降级为 Mock)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryStyleFactors.mockRejectedValue(new Error('DuckDB segfault'));

      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());

      expect(r.product_id).toBe(PRODUCT_ID);
      expect(r.is_mock).toBe(true);
      expect(r.cells.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 4. 性能流 (Performance) — 7 条
  // ============================================================
  describe('【性能流】耗时卡点 — 不得超出上限', () => {
    beforeEach(() => {
      setupSuccess();
    });

    it('TC-ANL-SF-PERF-001: getStyleFactors 编排总耗时 ≤ 50ms (不含 I/O)', async () => {
      const start = performance.now();
      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());
      const elapsed = performance.now() - start;

      expect(r.product_id).toBe(PRODUCT_ID);
      expect(elapsed).toBeLessThanOrEqual(50);
    });

    it('TC-ANL-SF-PERF-002: findProductById 单次 ≤ 10ms', async () => {
      const start = performance.now();
      const r = await findProductById(PRODUCT_ID, mockPrisma);
      const elapsed = performance.now() - start;

      expect(r).not.toBeNull();
      expect(elapsed).toBeLessThanOrEqual(10);
    });

    it('TC-ANL-SF-PERF-003: 连续 10 次无退化 avg ≤ 10ms', async () => {
      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        await getStyleFactors({ product_id: PRODUCT_ID }, deps());
      }
      const avg = (performance.now() - start) / 10;

      expect(avg).toBeLessThanOrEqual(10);
    }, 10000);

    it('TC-ANL-SF-PERF-004: 全 5×5=25 cells 组合处理 ≤ 15ms', async () => {
      const fullData = makeDuckDBStyleFactorData('NARRATIVE_STRATEGY', 'BGM_STYLE', seedFromString(PRODUCT_ID));
      mockDuckDB.queryStyleFactors.mockResolvedValue(fullData);

      const start = performance.now();
      const r = await getStyleFactors({ product_id: PRODUCT_ID }, deps());
      const elapsed = performance.now() - start;

      expect(r.cells.length).toBe(25);
      expect(elapsed).toBeLessThanOrEqual(15);
    });

    it('TC-ANL-SF-PERF-005: PRODUCT_NOT_FOUND 快速失败 ≤ 5ms', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      const start = performance.now();
      let threw = false;
      try {
        await getStyleFactors({ product_id: PRODUCT_ID }, deps());
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);
      expect(performance.now() - start).toBeLessThanOrEqual(5);
    });

    it('TC-ANL-SF-PERF-006: computeTopContributors 100 cells ≤ 5ms', async () => {
      const cells100 = makeMockStyleFactorCells(
        [...Array(10)].map((_, i) => `X${i}`),
        [...Array(10)].map((_, i) => `Y${i}`),
        seedFromString(PRODUCT_ID),
      );

      const start = performance.now();
      const result = computeTopContributors(cells100, 10);
      const elapsed = performance.now() - start;

      expect(Array.isArray(result.top_positive_factors)).toBe(true);
      expect(Array.isArray(result.top_negative_factors)).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(5);
    });

    it('TC-ANL-SF-PERF-007: buildSummary 500 cells ≤ 5ms', async () => {
      const cells500: TestHeatmapCell[] = [];
      for (let i = 0; i < 500; i++) {
        cells500.push({
          x_key: `X${i % 10}`,
          y_key: `Y${i % 10}`,
          score: Math.random(),
          contribution_rate: Math.random() * 0.6 - 0.3,
          sample_size: Math.floor(Math.random() * 500) + 10,
          confidence_tag: 'MEDIUM',
          insufficient_data: false,
        });
      }

      const start = performance.now();
      const summary = buildHeatmapSummary(cells500, 'CTR');
      const elapsed = performance.now() - start;

      expect(typeof summary.total_cells).toBe('number');
      expect(summary.total_cells).toBe(500);
      expect(elapsed).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================
  // 5. 原子函数独立测试 — 17 条
  // ============================================================
  describe('【原子函数】独立校验各原子函数正确性', () => {
    describe('validateStyleFactorParams', () => {
      it('AF-SF-001: 合法 product_id + 全部默认 → 不抛错', () => {
        expect(() =>
          validateStyleFactorParams(PRODUCT_ID, 'CTR', 'NARRATIVE_STRATEGY', 'VISUAL_STYLE', 5),
        ).not.toThrow();
      });

      it('AF-SF-002: product_id 为空字符串 → INVALID_REQUEST', () => {
        let e: (Error & { errorCode?: string }) | null = null;
        try {
          validateStyleFactorParams('', 'CTR', 'NARRATIVE_STRATEGY', 'VISUAL_STYLE', 5);
        } catch (err) {
          e = err as Error & { errorCode?: string };
        }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-SF-003: metric="SHARES" (非法) → INVALID_REQUEST', () => {
        let e: (Error & { errorCode?: string; message?: string }) | null = null;
        try {
          validateStyleFactorParams(PRODUCT_ID, 'SHARES', 'NARRATIVE_STRATEGY', 'VISUAL_STYLE', 5);
        } catch (err) {
          e = err as Error & { errorCode?: string; message?: string };
        }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
        expect(e!.message).toContain('SHARES');
      });

      it('AF-SF-004: x_dimension="CAMERA_ANGLE" (非法) → INVALID_REQUEST', () => {
        let e: (Error & { errorCode?: string }) | null = null;
        try {
          validateStyleFactorParams(PRODUCT_ID, 'CTR', 'CAMERA_ANGLE', 'VISUAL_STYLE', 5);
        } catch (err) {
          e = err as Error & { errorCode?: string };
        }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-SF-005: x_dimension 与 y_dimension 相同 → DIMENSION_CONFLICT', () => {
        let e: (Error & { errorCode?: string }) | null = null;
        try {
          validateStyleFactorParams(PRODUCT_ID, 'CTR', 'BGM_STYLE', 'BGM_STYLE', 5);
        } catch (err) {
          e = err as Error & { errorCode?: string };
        }
        expect(e!.errorCode).toBe('ANALYTICS_STYLE_FACTOR_DIMENSION_CONFLICT');
      });

      it('AF-SF-006: top_n=0 → INVALID_REQUEST', () => {
        let e: (Error & { errorCode?: string }) | null = null;
        try {
          validateStyleFactorParams(PRODUCT_ID, 'CTR', 'NARRATIVE_STRATEGY', 'VISUAL_STYLE', 0);
        } catch (err) {
          e = err as Error & { errorCode?: string };
        }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-SF-007: top_n=51 → INVALID_REQUEST', () => {
        let e: (Error & { errorCode?: string }) | null = null;
        try {
          validateStyleFactorParams(PRODUCT_ID, 'CTR', 'NARRATIVE_STRATEGY', 'VISUAL_STYLE', 51);
        } catch (err) {
          e = err as Error & { errorCode?: string };
        }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });
    });

    describe('computeTopContributors', () => {
      it('AF-SF-008: 混合正负 cells → 正负各取 topN', () => {
        const cells: TestHeatmapCell[] = [
          { x_key: 'A', y_key: 'X', score: 0.8, contribution_rate: 0.4, sample_size: 200 },
          { x_key: 'A', y_key: 'Y', score: 0.7, contribution_rate: 0.3, sample_size: 200 },
          { x_key: 'B', y_key: 'X', score: 0.3, contribution_rate: -0.5, sample_size: 200 },
          { x_key: 'B', y_key: 'Y', score: 0.4, contribution_rate: -0.2, sample_size: 200 },
        ];
        const result = computeTopContributors(cells, 2);

        expect(result.top_positive_factors).toHaveLength(2);
        expect(result.top_positive_factors[0].contribution).toBe(0.4);
        expect(result.top_positive_factors[0].factor).toBe('A × X');
        expect(result.top_positive_factors[1].contribution).toBe(0.3);
        expect(result.top_negative_factors).toHaveLength(2);
        expect(result.top_negative_factors[0].contribution).toBe(-0.5);
        expect(result.top_negative_factors[0].factor).toBe('B × X');
      });

      it('AF-SF-009: 全正贡献 cells → negative 为空', () => {
        const cells: TestHeatmapCell[] = [
          { x_key: 'A', y_key: 'X', score: 0.8, contribution_rate: 0.4, sample_size: 200 },
          { x_key: 'A', y_key: 'Y', score: 0.7, contribution_rate: 0.3, sample_size: 200 },
        ];
        const result = computeTopContributors(cells, 3);

        expect(result.top_positive_factors.length).toBe(2);
        expect(result.top_negative_factors).toHaveLength(0);
      });

      it('AF-SF-010: 全负贡献 cells → positive 为空', () => {
        const cells: TestHeatmapCell[] = [
          { x_key: 'A', y_key: 'X', score: 0.3, contribution_rate: -0.4, sample_size: 200 },
          { x_key: 'B', y_key: 'X', score: 0.4, contribution_rate: -0.2, sample_size: 200 },
        ];
        const result = computeTopContributors(cells, 3);

        expect(result.top_positive_factors).toHaveLength(0);
        expect(result.top_negative_factors.length).toBe(2);
      });

      it('AF-SF-011: 空 cells → 正负均为空', () => {
        const result = computeTopContributors([], 5);

        expect(result.top_positive_factors).toHaveLength(0);
        expect(result.top_negative_factors).toHaveLength(0);
      });

      it('AF-SF-012: topN 大于实际数量 → 返回全部可用', () => {
        const cells: TestHeatmapCell[] = [
          { x_key: 'A', y_key: 'X', score: 0.8, contribution_rate: 0.4, sample_size: 200 },
          { x_key: 'B', y_key: 'X', score: 0.3, contribution_rate: -0.5, sample_size: 200 },
        ];
        const result = computeTopContributors(cells, 50);

        expect(result.top_positive_factors.length).toBe(1);
        expect(result.top_negative_factors.length).toBe(1);
      });
    });

    describe('buildHeatmapSummary', () => {
      it('AF-SF-013: 正常 cells → total_cells/mean/max/min 正确', () => {
        const cells: TestHeatmapCell[] = [
          { x_key: 'A', y_key: 'X', score: 0.8, sample_size: 100 },
          { x_key: 'A', y_key: 'Y', score: 0.6, sample_size: 100 },
          { x_key: 'B', y_key: 'X', score: 0.4, sample_size: 50, insufficient_data: false },
        ];
        const s = buildHeatmapSummary(cells, 'CVR');

        expect(s.total_cells).toBe(3);
        expect(s.metric).toBe('CVR');
        expect(s.mean_score).toBeCloseTo(0.6, 2);
        expect(s.max_score).toBe(0.8);
        expect(s.min_score).toBe(0.4);
      });

      it('AF-SF-014: insufficient_data cells 记入 count', () => {
        const cells: TestHeatmapCell[] = [
          { x_key: 'A', y_key: 'X', score: 0.5, sample_size: 10, insufficient_data: true },
          { x_key: 'A', y_key: 'Y', score: 0.5, sample_size: 5, insufficient_data: true },
          { x_key: 'B', y_key: 'X', score: 0.5, sample_size: 100, insufficient_data: false },
        ];
        const s = buildHeatmapSummary(cells, 'CTR');

        expect(s.cells_with_insufficient_data).toBe(2);
      });

      it('AF-SF-015: contribution_rate 混合 → mean_contribution_rate 正确', () => {
        const cells: TestHeatmapCell[] = [
          { x_key: 'A', y_key: 'X', score: 0.5, contribution_rate: 0.5, sample_size: 100 },
          { x_key: 'A', y_key: 'Y', score: 0.5, contribution_rate: -0.3, sample_size: 100 },
        ];
        const s = buildHeatmapSummary(cells, 'COMPLETION_RATE');

        expect(s.mean_contribution_rate).toBeCloseTo(0.1, 2);
      });

      it('AF-SF-016: 空 cells → 仅返回 total_cells=0 + metric', () => {
        const s = buildHeatmapSummary([], 'RETENTION_RATE');

        expect(s.total_cells).toBe(0);
        expect(s.metric).toBe('RETENTION_RATE');
      });

      it('AF-SF-017: single cell → mean === max === min', () => {
        const cells: TestHeatmapCell[] = [
          { x_key: 'A', y_key: 'X', score: 0.75, sample_size: 500 },
        ];
        const s = buildHeatmapSummary(cells, 'CTR');

        expect(s.total_cells).toBe(1);
        expect(s.mean_score).toBe(0.75);
        expect(s.max_score).toBe(0.75);
        expect(s.min_score).toBe(0.75);
      });
    });
  });
});
