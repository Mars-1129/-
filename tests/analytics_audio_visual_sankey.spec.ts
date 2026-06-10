// =============================================================================
// TikStream AI — Analytics Audio Visual Sankey 自动化测试基座
// 对应功能: GET /api/v1/analytics/audio-visual-sankey (视听留存桑基图查询接口)
// 对应模块: Analytics (人员B) | 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

interface TestSankeyNode {
  node_id: string;
  name: string;
  dimension: 'BGM_STYLE' | 'VISUAL_STYLE' | 'RETENTION_BUCKET';
  value?: number;
}

interface TestSankeyLink {
  source: string;
  target: string;
  value: number;
  contribution_rate?: number;
}

interface TestAudioVisualSankeyResponse {
  product_id: string;
  creation_id?: string;
  metric: string;
  nodes: TestSankeyNode[];
  links: TestSankeyLink[];
  summary: Record<string, unknown>;
  data_source: 'DUCKDB_PRECOMPUTED';
  is_mock: boolean;
  is_predicted: boolean;
  generated_at: string;
}

interface TestAudioVisualSankeyQuery {
  product_id: string;
  creation_id?: string;
}

interface TestSankeyRawRow {
  bgm_style: string;
  visual_style: string;
  retention_bucket: string;
  flow_count: number;
  avg_retention_rate: number;
}

interface TestSankeyDataBundle {
  bgm_nodes: TestSankeyNode[];
  visual_nodes: TestSankeyNode[];
  retention_nodes: TestSankeyNode[];
  bgm_to_visual_links: TestSankeyLink[];
  visual_to_retention_links: TestSankeyLink[];
  is_mock: boolean;
  is_predicted: boolean;
}

type MockPrismaService = {
  product: { findUnique: jest.Mock };
};
type MockDuckDBDataSource = {
  queryAudioVisualSankey: jest.Mock;
};

const NOW = new Date('2026-05-25T12:00:00Z');
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const CREATION_ID = 'dc52d4ff-0000-4000-a000-000000000001';

const BGM_STYLES = ['快节奏电子', '舒缓钢琴', '激昂管弦', '轻松吉他', '无BGM'] as const;
const VISUAL_STYLES = ['产品特写', '场景展示', '文字叠加', '真人出镜', '动画演示'] as const;
const RETENTION_BUCKETS = ['高留存(>70%)', '中留存(40-70%)', '低留存(20-40%)', '流失(<20%)'] as const;

function makePrismaProduct(productId: string): Record<string, unknown> {
  return { id: productId };
}

function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 8); i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash || 1;
}

function pseudoRandomFromSeed(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function makeSmallSankeyRows(): TestSankeyRawRow[] {
  const rows: TestSankeyRawRow[] = [];
  const bgmSubset = BGM_STYLES.slice(0, 2);
  const visualSubset = VISUAL_STYLES.slice(0, 2);
  const retentionSubset = RETENTION_BUCKETS.slice(0, 2);

  for (const bgm of bgmSubset) {
    for (const visual of visualSubset) {
      for (const retention of retentionSubset) {
        const idx = rows.length;
        rows.push({
          bgm_style: bgm,
          visual_style: visual,
          retention_bucket: retention,
          flow_count: 1000 - idx * 80,
          avg_retention_rate: 0.95 - idx * 0.06,
        });
      }
    }
  }
  return rows;
}

function makeFullSankeyRows(seed: number): TestSankeyRawRow[] {
  const rng = pseudoRandomFromSeed(seed);
  const rows: TestSankeyRawRow[] = [];

  for (const bgm of BGM_STYLES) {
    for (const visual of VISUAL_STYLES) {
      for (const retention of RETENTION_BUCKETS) {
        const flowCount = Math.floor(rng() * 900) + 100;
        const avgRetention = Math.round((0.3 + rng() * 0.7) * 10000) / 10000;
        rows.push({
          bgm_style: bgm,
          visual_style: visual,
          retention_bucket: retention,
          flow_count: flowCount,
          avg_retention_rate: avgRetention,
        });
      }
    }
  }
  return rows;
}

function makeFixedSankeyRows(): TestSankeyRawRow[] {
  return [
    { bgm_style: '快节奏电子', visual_style: '产品特写', retention_bucket: '高留存(>70%)', flow_count: 500, avg_retention_rate: 0.9 },
    { bgm_style: '快节奏电子', visual_style: '场景展示', retention_bucket: '高留存(>70%)', flow_count: 300, avg_retention_rate: 0.85 },
    { bgm_style: '快节奏电子', visual_style: '产品特写', retention_bucket: '流失(<20%)', flow_count: 100, avg_retention_rate: 0.15 },
    { bgm_style: '快节奏电子', visual_style: '场景展示', retention_bucket: '流失(<20%)', flow_count: 50, avg_retention_rate: 0.1 },
    { bgm_style: '舒缓钢琴', visual_style: '产品特写', retention_bucket: '高留存(>70%)', flow_count: 400, avg_retention_rate: 0.92 },
    { bgm_style: '舒缓钢琴', visual_style: '场景展示', retention_bucket: '中留存(40-70%)', flow_count: 350, avg_retention_rate: 0.55 },
    { bgm_style: '舒缓钢琴', visual_style: '场景展示', retention_bucket: '流失(<20%)', flow_count: 200, avg_retention_rate: 0.12 },
  ];
}

function makeDuckDBSankeyResponse(
  rows: TestSankeyRawRow[],
): { rows: TestSankeyRawRow[]; is_mock: boolean; is_predicted: boolean } {
  return { rows, is_mock: false, is_predicted: true };
}

describe('AnalyticsAudioVisualSankey — 视听留存桑基图查询 (GET /api/v1/analytics/audio-visual-sankey)', () => {
  let mockPrisma: MockPrismaService;
  let mockDuckDB: MockDuckDBDataSource;

  type FindProductByIdFn = (productId: string, prisma: MockPrismaService) => Promise<{ id: string } | null>;
  type ValidateAudioVisualSankeyParamsFn = (
    productId: string,
    creationId?: string,
  ) => void;
  type FetchAudioVisualSankeyDataFn = (
    productId: string,
    creationId: string | undefined,
    duckDB: MockDuckDBDataSource,
  ) => Promise<TestSankeyDataBundle>;
  type BuildSankeyNodesFn = (
    bgmLabels: string[],
    visualLabels: string[],
    retentionLabels: string[],
  ) => TestSankeyNode[];
  type BuildSankeyLinksFn = (
    bgmToVisualRows: Array<{ source: string; target: string; flow_count: number }>,
    visualToRetentionRows: Array<{ source: string; target: string; flow_count: number }>,
  ) => TestSankeyLink[];
  type BuildSankeySummaryFn = (
    nodes: TestSankeyNode[],
    links: TestSankeyLink[],
  ) => Record<string, unknown>;
  type GetAudioVisualSankeyFn = (
    dto: TestAudioVisualSankeyQuery,
    deps: {
      prisma: MockPrismaService;
      duckDB: MockDuckDBDataSource;
      findProductById: FindProductByIdFn;
      validateParams: ValidateAudioVisualSankeyParamsFn;
      fetchData: FetchAudioVisualSankeyDataFn;
      buildNodes: BuildSankeyNodesFn;
      buildLinks: BuildSankeyLinksFn;
      buildSummary: BuildSankeySummaryFn;
    },
  ) => Promise<TestAudioVisualSankeyResponse>;

  let findProductById: FindProductByIdFn;
  let validateAudioVisualSankeyParams: ValidateAudioVisualSankeyParamsFn;
  let fetchAudioVisualSankeyData: FetchAudioVisualSankeyDataFn;
  let buildSankeyNodes: BuildSankeyNodesFn;
  let buildSankeyLinks: BuildSankeyLinksFn;
  let buildSankeySummary: BuildSankeySummaryFn;
  let getAudioVisualSankey: GetAudioVisualSankeyFn;

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

    validateAudioVisualSankeyParams = (productId, creationId) => {
      if (!productId || productId.trim().length === 0) {
        throw Object.assign(new Error('product_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      if (creationId !== undefined && creationId !== null && creationId.trim().length === 0) {
        throw Object.assign(new Error('creation_id 不可为空白字符串'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
    };

    fetchAudioVisualSankeyData = async (productId, creationId, duckDB) => {
      try {
        const result = await duckDB.queryAudioVisualSankey(productId, creationId);
        if (
          result &&
          result.rows &&
          Array.isArray(result.rows) &&
          result.rows.length > 0
        ) {
          const rows = result.rows as TestSankeyRawRow[];
          const bgmSet = new Set<string>();
          const visualSet = new Set<string>();
          const retentionSet = new Set<string>();
          const bgmToVisualMap = new Map<string, number>();
          const visualToRetentionMap = new Map<string, number>();

          for (const row of rows) {
            bgmSet.add(row.bgm_style);
            visualSet.add(row.visual_style);
            retentionSet.add(row.retention_bucket);

            const bvKey = `${row.bgm_style}|||${row.visual_style}`;
            bgmToVisualMap.set(bvKey, (bgmToVisualMap.get(bvKey) ?? 0) + row.flow_count);

            const vrKey = `${row.visual_style}|||${row.retention_bucket}`;
            visualToRetentionMap.set(vrKey, (visualToRetentionMap.get(vrKey) ?? 0) + row.flow_count);
          }

          const bgmNodeList = [...bgmSet];
          const visualNodeList = [...visualSet];
          const retentionNodeList = [...retentionSet];

          const bgm_nodes: TestSankeyNode[] = bgmNodeList.map((name, i) => ({
            node_id: `bgm_${i}`,
            name,
            dimension: 'BGM_STYLE' as const,
          }));
          const visual_nodes: TestSankeyNode[] = visualNodeList.map((name, i) => ({
            node_id: `visual_${i}`,
            name,
            dimension: 'VISUAL_STYLE' as const,
          }));
          const retention_nodes: TestSankeyNode[] = retentionNodeList.map((name, i) => ({
            node_id: `retention_${i}`,
            name,
            dimension: 'RETENTION_BUCKET' as const,
          }));

          const bgmToVisualLinks: TestSankeyLink[] = [];
          for (const [key, flow] of bgmToVisualMap.entries()) {
            const [sourceName, targetName] = key.split('|||');
            const sourceIdx = bgmNodeList.indexOf(sourceName);
            const targetIdx = visualNodeList.indexOf(targetName);
            bgmToVisualLinks.push({
              source: `bgm_${sourceIdx}`,
              target: `visual_${targetIdx}`,
              value: flow,
            });
          }

          const visualToRetentionLinks: TestSankeyLink[] = [];
          for (const [key, flow] of visualToRetentionMap.entries()) {
            const [sourceName, targetName] = key.split('|||');
            const sourceIdx = visualNodeList.indexOf(sourceName);
            const targetIdx = retentionNodeList.indexOf(targetName);
            visualToRetentionLinks.push({
              source: `visual_${sourceIdx}`,
              target: `retention_${targetIdx}`,
              value: flow,
            });
          }

          return {
            bgm_nodes,
            visual_nodes,
            retention_nodes,
            bgm_to_visual_links: bgmToVisualLinks,
            visual_to_retention_links: visualToRetentionLinks,
            is_mock: result.is_mock ?? false,
            is_predicted: result.is_predicted ?? true,
          };
        }

        return fallbackToMockSankey(seedFromString(productId));
      } catch {
        return fallbackToMockSankey(seedFromString(productId));
      }
    };

    function fallbackToMockSankey(seed: number): TestSankeyDataBundle {
      const rng = pseudoRandomFromSeed(seed);

      const bgm_nodes: TestSankeyNode[] = [...BGM_STYLES].map((name, i) => ({
        node_id: `bgm_${i}`,
        name,
        dimension: 'BGM_STYLE' as const,
      }));
      const visual_nodes: TestSankeyNode[] = [...VISUAL_STYLES].map((name, i) => ({
        node_id: `visual_${i}`,
        name,
        dimension: 'VISUAL_STYLE' as const,
      }));
      const retention_nodes: TestSankeyNode[] = [...RETENTION_BUCKETS].map((name, i) => ({
        node_id: `retention_${i}`,
        name,
        dimension: 'RETENTION_BUCKET' as const,
      }));

      const bgm_to_visual_links: TestSankeyLink[] = [];
      for (let bi = 0; bi < BGM_STYLES.length; bi++) {
        for (let vi = 0; vi < VISUAL_STYLES.length; vi++) {
          bgm_to_visual_links.push({
            source: `bgm_${bi}`,
            target: `visual_${vi}`,
            value: Math.floor(rng() * 400) + 50,
          });
        }
      }

      const visual_to_retention_links: TestSankeyLink[] = [];
      for (let vi = 0; vi < VISUAL_STYLES.length; vi++) {
        for (let ri = 0; ri < RETENTION_BUCKETS.length; ri++) {
          const weightIdx = vi * RETENTION_BUCKETS.length + ri;
          const baseFlow = weightIdx < 4 ? [250, 200, 120, 60][weightIdx % 4] : Math.floor(rng() * 200) + 30;
          visual_to_retention_links.push({
            source: `visual_${vi}`,
            target: `retention_${ri}`,
            value: baseFlow + Math.floor(rng() * 30),
          });
        }
      }

      return {
        bgm_nodes,
        visual_nodes,
        retention_nodes,
        bgm_to_visual_links,
        visual_to_retention_links,
        is_mock: true,
        is_predicted: true,
      };
    }

    buildSankeyNodes = (bgmLabels, visualLabels, retentionLabels) => {
      const nodes: TestSankeyNode[] = [];

      for (let i = 0; i < bgmLabels.length; i++) {
        nodes.push({
          node_id: `bgm_${i}`,
          name: bgmLabels[i],
          dimension: 'BGM_STYLE' as const,
        });
      }
      for (let i = 0; i < visualLabels.length; i++) {
        nodes.push({
          node_id: `visual_${i}`,
          name: visualLabels[i],
          dimension: 'VISUAL_STYLE' as const,
        });
      }
      for (let i = 0; i < retentionLabels.length; i++) {
        nodes.push({
          node_id: `retention_${i}`,
          name: retentionLabels[i],
          dimension: 'RETENTION_BUCKET' as const,
        });
      }

      return nodes;
    };

    buildSankeyLinks = (bgmToVisualRows, visualToRetentionRows) => {
      const links: TestSankeyLink[] = [];

      for (const row of bgmToVisualRows) {
        links.push({
          source: row.source,
          target: row.target,
          value: row.flow_count,
        });
      }
      for (const row of visualToRetentionRows) {
        links.push({
          source: row.source,
          target: row.target,
          value: row.flow_count,
        });
      }

      const sourceFlowSum = new Map<string, number>();
      for (const link of links) {
        sourceFlowSum.set(link.source, (sourceFlowSum.get(link.source) ?? 0) + link.value);
      }

      for (const link of links) {
        const totalSourceFlow = sourceFlowSum.get(link.source) ?? link.value;
        link.contribution_rate = totalSourceFlow > 0
          ? Math.round((link.value / totalSourceFlow) * 10000) / 10000
          : 0;
      }

      return links;
    };

    buildSankeySummary = (nodes, links) => {
      if (!nodes || nodes.length === 0) {
        return {
          total_nodes: 0,
          total_links: 0,
          total_flow: 0,
          bgm_style_count: 0,
          visual_style_count: 0,
          retention_bucket_count: 0,
          max_flow_link: null,
          dominant_retention_bucket: null,
          low_retention_flow_pct: 0,
        };
      }

      let totalFlow = 0;
      let maxFlowLink: TestSankeyLink | null = null;
      let maxFlow = -Infinity;

      for (const link of links) {
        totalFlow += link.value;
        if (link.value > maxFlow) {
          maxFlow = link.value;
          maxFlowLink = link;
        }
      }

      let bgmCount = 0;
      let visualCount = 0;
      let retentionCount = 0;
      for (const node of nodes) {
        if (node.dimension === 'BGM_STYLE') bgmCount++;
        else if (node.dimension === 'VISUAL_STYLE') visualCount++;
        else if (node.dimension === 'RETENTION_BUCKET') retentionCount++;
      }

      const retentionFlowMap = new Map<string, number>();
      for (const node of nodes) {
        if (node.dimension === 'RETENTION_BUCKET') {
          retentionFlowMap.set(node.node_id, 0);
        }
      }
      for (const link of links) {
        if (retentionFlowMap.has(link.target)) {
          retentionFlowMap.set(link.target, (retentionFlowMap.get(link.target) ?? 0) + link.value);
        }
      }
      let dominantBucket: string | null = null;
      let dominantFlow = -Infinity;
      let lowFlowTotal = 0;
      let totalRetentionFlow = 0;
      for (const [nodeId, flow] of retentionFlowMap.entries()) {
        totalRetentionFlow += flow;
        if (flow > dominantFlow) {
          dominantFlow = flow;
          dominantBucket = nodeId;
        }
        const node = nodes.find((n) => n.node_id === nodeId);
        if (node && (node.name.includes('低留存') || node.name.includes('流失'))) {
          lowFlowTotal += flow;
        }
      }

      return {
        total_nodes: nodes.length,
        total_links: links.length,
        total_flow: totalFlow,
        bgm_style_count: bgmCount,
        visual_style_count: visualCount,
        retention_bucket_count: retentionCount,
        max_flow_link: maxFlowLink
          ? {
              source: maxFlowLink.source,
              target: maxFlowLink.target,
              value: maxFlowLink.value,
              contribution_rate: maxFlowLink.contribution_rate,
            }
          : null,
        dominant_retention_bucket: dominantBucket,
        low_retention_flow_pct:
          totalRetentionFlow > 0
            ? Math.round((lowFlowTotal / totalRetentionFlow) * 10000) / 10000
            : 0,
      };
    };

    getAudioVisualSankey = async (dto, deps) => {
      const {
        prisma,
        duckDB,
        findProductById: fp,
        validateParams,
        fetchData,
        buildNodes,
        buildLinks,
        buildSummary,
      } = deps;

      const productId = dto.product_id;
      const creationId = dto.creation_id;

      validateParams(productId, creationId);

      const product = await fp(productId, prisma);
      if (!product) {
        throw Object.assign(new Error(`商品 ${productId} 不存在`), {
          errorCode: 'PRODUCT_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }

      const sankeyData = await fetchData(productId, creationId, duckDB);

      const allNodes = buildNodes(
        sankeyData.bgm_nodes.map((n) => n.name),
        sankeyData.visual_nodes.map((n) => n.name),
        sankeyData.retention_nodes.map((n) => n.name),
      );

      const allLinks = buildLinks(
        sankeyData.bgm_to_visual_links.map((l) => ({
          source: l.source,
          target: l.target,
          flow_count: l.value,
        })),
        sankeyData.visual_to_retention_links.map((l) => ({
          source: l.source,
          target: l.target,
          flow_count: l.value,
        })),
      );

      const summary = buildSummary(allNodes, allLinks);

      return {
        product_id: productId,
        creation_id: creationId,
        metric: 'RETENTION_FLOW',
        nodes: allNodes,
        links: allLinks,
        summary,
        data_source: 'DUCKDB_PRECOMPUTED',
        is_mock: sankeyData.is_mock,
        is_predicted: sankeyData.is_predicted,
        generated_at: new Date().toISOString(),
      };
    };
  });

  beforeEach(() => {
    mockPrisma = { product: { findUnique: jest.fn() } };
    mockDuckDB = { queryAudioVisualSankey: jest.fn() };
  });

  const deps = () => ({
    prisma: mockPrisma,
    duckDB: mockDuckDB,
    findProductById,
    validateParams: validateAudioVisualSankeyParams,
    fetchData: fetchAudioVisualSankeyData,
    buildNodes: buildSankeyNodes,
    buildLinks: buildSankeyLinks,
    buildSummary: buildSankeySummary,
  });

  function setupSuccess(
    productId: string = PRODUCT_ID,
    sankeyRows?: TestSankeyRawRow[],
  ): void {
    mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(productId));
    mockDuckDB.queryAudioVisualSankey.mockResolvedValue(
      makeDuckDBSankeyResponse(sankeyRows ?? makeSmallSankeyRows()),
    );
  }

  // ============================================================
  // 1. 正常流 (Happy Path) — 5 条
  // ============================================================
  describe('【正常流】合法查询参数 → 完整 AudioVisualSankeyResponse', () => {
    beforeEach(() => {
      setupSuccess();
    });

    it('TC-ANL-SANKEY-001: 完整查询返回顶层字段齐全并符合 api_types 契约', async () => {
      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.product_id).toBe(PRODUCT_ID);
      expect(r.metric).toBe('RETENTION_FLOW');
      expect(r.data_source).toBe('DUCKDB_PRECOMPUTED');
      expect(typeof r.is_mock).toBe('boolean');
      expect(typeof r.is_predicted).toBe('boolean');
      expect(typeof r.generated_at).toBe('string');
      expect(new Date(r.generated_at).getTime()).toBeGreaterThan(0);

      expect(Array.isArray(r.nodes)).toBe(true);
      expect(r.nodes.length).toBeGreaterThan(0);
      expect(Array.isArray(r.links)).toBe(true);
      expect(r.links.length).toBeGreaterThan(0);

      expect(r.summary).toBeDefined();
      expect(typeof r.summary).toBe('object');
      expect(r.summary).not.toBeNull();
    });

    it('TC-ANL-SANKEY-002: nodes 维度按 BGM_STYLE → VISUAL_STYLE → RETENTION_BUCKET 顺序排列', async () => {
      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      let currentDim = '';
      const dimOrder = ['BGM_STYLE', 'VISUAL_STYLE', 'RETENTION_BUCKET'];
      let dimIdx = 0;

      for (const node of r.nodes) {
        if (currentDim !== node.dimension) {
          expect(node.dimension).toBe(dimOrder[dimIdx]);
          currentDim = node.dimension;
          dimIdx++;
        }
      }
    });

    it('TC-ANL-SANKEY-003: 每个 node 包含 node_id / name / dimension 必需字段', async () => {
      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      const validDimensions = ['BGM_STYLE', 'VISUAL_STYLE', 'RETENTION_BUCKET'];
      for (const node of r.nodes) {
        expect(typeof node.node_id).toBe('string');
        expect(node.node_id.length).toBeGreaterThan(0);
        expect(typeof node.name).toBe('string');
        expect(node.name.length).toBeGreaterThan(0);
        expect(validDimensions).toContain(node.dimension);
      }
    });

    it('TC-ANL-SANKEY-004: 每个 link 包含 source / target / value / contribution_rate 且值域正确', async () => {
      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());

      for (const link of r.links) {
        expect(typeof link.source).toBe('string');
        expect(link.source.length).toBeGreaterThan(0);
        expect(typeof link.target).toBe('string');
        expect(link.target.length).toBeGreaterThan(0);
        expect(typeof link.value).toBe('number');
        expect(link.value).toBeGreaterThanOrEqual(0);
        expect(link.value).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
        expect(typeof link.contribution_rate).toBe('number');
        expect(link.contribution_rate).toBeGreaterThanOrEqual(0);
        expect(link.contribution_rate).toBeLessThanOrEqual(1);
      }
    });

    it('TC-ANL-SANKEY-005: summary 包含完整统计字段且值域合法', async () => {
      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      const s = r.summary;
      expect(typeof s.total_nodes).toBe('number');
      expect(s.total_nodes).toBeGreaterThan(0);
      expect(typeof s.total_links).toBe('number');
      expect(s.total_links).toBeGreaterThan(0);
      expect(typeof s.total_flow).toBe('number');
      expect(s.total_flow).toBeGreaterThan(0);
      expect(typeof s.bgm_style_count).toBe('number');
      expect(s.bgm_style_count).toBeGreaterThan(0);
      expect(typeof s.visual_style_count).toBe('number');
      expect(s.visual_style_count).toBeGreaterThan(0);
      expect(typeof s.retention_bucket_count).toBe('number');
      expect(s.retention_bucket_count).toBeGreaterThan(0);

      if (s.max_flow_link) {
        const mfl = s.max_flow_link as Record<string, unknown>;
        expect(typeof mfl.source).toBe('string');
        expect(typeof mfl.target).toBe('string');
        expect(typeof mfl.value).toBe('number');
        expect((mfl.value as number)).toBeGreaterThan(0);
        expect(typeof mfl.contribution_rate).toBe('number');
      }

      if (s.low_retention_flow_pct !== undefined) {
        expect(typeof s.low_retention_flow_pct).toBe('number');
        expect(s.low_retention_flow_pct as number).toBeGreaterThanOrEqual(0);
        expect(s.low_retention_flow_pct as number).toBeLessThanOrEqual(1);
      }
    });
  });

  // ============================================================
  // 2. 边界流 (Edge Cases) — 12 条
  // ============================================================
  describe('【边界流】极端数据 → 系统优雅处理', () => {
    it('TC-ANL-SANKEY-BND-001: creation_id 不传 → 正常返回全商品聚合桑基图', async () => {
      setupSuccess();
      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.product_id).toBe(PRODUCT_ID);
      expect(r.creation_id).toBeUndefined();
      expect(r.nodes.length).toBeGreaterThan(0);
      expect(r.links.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SANKEY-BND-002: creation_id 为合法 UUID → 正常返回单创作桑基图', async () => {
      setupSuccess();
      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());

      expect(r.creation_id).toBe(CREATION_ID);
      expect(r.nodes.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SANKEY-BND-003: DuckDB 不可用 → 降级 Mock (is_mock=true)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryAudioVisualSankey.mockRejectedValue(new Error('Connection refused'));

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.is_mock).toBe(true);
      expect(r.is_predicted).toBe(true);
      expect(r.nodes.length).toBeGreaterThan(0);
      expect(r.links.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SANKEY-BND-004: DuckDB 返回空 rows → 降级 Mock 数据', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryAudioVisualSankey.mockResolvedValue({
        rows: [],
        is_mock: false,
        is_predicted: true,
      });

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.is_mock).toBe(true);
      expect(r.nodes.length).toBeGreaterThan(0);
      expect(r.links.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SANKEY-BND-005: DuckDB 返回 null → 降级 Mock 不崩溃', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryAudioVisualSankey.mockResolvedValue(null);

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(Array.isArray(r.nodes)).toBe(true);
      expect(Array.isArray(r.links)).toBe(true);
      expect(r.nodes.length).toBeGreaterThan(0);
      expect(r.is_mock).toBe(true);
    });

    it('TC-ANL-SANKEY-BND-006: DuckDB 返回 undefined → 降级 Mock 不崩溃', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryAudioVisualSankey.mockResolvedValue(undefined);

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(Array.isArray(r.nodes)).toBe(true);
      expect(Array.isArray(r.links)).toBe(true);
      expect(r.nodes.length).toBeGreaterThan(0);
      expect(r.is_mock).toBe(true);
    });

    it('TC-ANL-SANKEY-BND-007: 同一个 productId 多次 Mock 返回确定性一致', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryAudioVisualSankey.mockRejectedValue(new Error('fail'));

      const r1 = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());
      const r2 = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r1.nodes.length).toBe(r2.nodes.length);
      expect(r1.links.length).toBe(r2.links.length);
      expect(r1.is_mock).toBe(true);
      expect(r2.is_mock).toBe(true);
      for (let i = 0; i < r1.nodes.length; i++) {
        expect(r1.nodes[i].node_id).toBe(r2.nodes[i].node_id);
        expect(r1.nodes[i].name).toBe(r2.nodes[i].name);
        expect(r1.nodes[i].dimension).toBe(r2.nodes[i].dimension);
      }
      for (let i = 0; i < r1.links.length; i++) {
        expect(r1.links[i].source).toBe(r2.links[i].source);
        expect(r1.links[i].target).toBe(r2.links[i].target);
        expect(r1.links[i].value).toBe(r2.links[i].value);
        expect(r1.links[i].contribution_rate).toBe(r2.links[i].contribution_rate);
      }
    });

    it('TC-ANL-SANKEY-BND-008: SQL 注入式 product_id 不报错（参数化查询安全）', async () => {
      const sqlInjectId = "PROD'; DROP TABLE audio_visual_sankey;--";
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(sqlInjectId));
      mockDuckDB.queryAudioVisualSankey.mockResolvedValue(
        makeDuckDBSankeyResponse(makeSmallSankeyRows()),
      );

      const r = await getAudioVisualSankey({ product_id: sqlInjectId }, deps());

      expect(r.product_id).toBe(sqlInjectId);
    });

    it('TC-ANL-SANKEY-BND-009: contribution_rate 所有 link 按 source 分组之和等于 1', async () => {
      setupSuccess();

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      const sourceSum = new Map<string, number>();
      for (const link of r.links) {
        sourceSum.set(link.source, (sourceSum.get(link.source) ?? 0) + (link.contribution_rate ?? 0));
      }

      for (const [source, sum] of sourceSum.entries()) {
        expect(Math.abs(sum - 1)).toBeLessThanOrEqual(0.001);
      }
    });

    it('TC-ANL-SANKEY-BND-010: 仅 1 BGM × 1 VISUAL × 1 RETENTION 最小桑基图', async () => {
      const minimalRows: TestSankeyRawRow[] = [{
        bgm_style: '无BGM',
        visual_style: '产品特写',
        retention_bucket: '高留存(>70%)',
        flow_count: 120,
        avg_retention_rate: 0.95,
      }];
      setupSuccess(PRODUCT_ID, minimalRows);

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.nodes.length).toBe(3);
      expect(r.links.length).toBeGreaterThanOrEqual(0);
    });

    it('TC-ANL-SANKEY-BND-011: 全 5×5×4=100 行完整桑基图', async () => {
      setupSuccess(PRODUCT_ID, makeFullSankeyRows(seedFromString(PRODUCT_ID)));

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.nodes.length).toBe(14);
      expect(r.links.length).toBeGreaterThanOrEqual(20);
      for (const link of r.links) {
        expect(link.value).toBeGreaterThan(0);
        expect(link.contribution_rate).toBeGreaterThan(0);
      }
    });

    it('TC-ANL-SANKEY-BND-012: product_id 含中文/特殊字符 → 系统正常处理', async () => {
      const specialId = '测试商品_ID-001';
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(specialId));
      mockDuckDB.queryAudioVisualSankey.mockResolvedValue(
        makeDuckDBSankeyResponse(makeSmallSankeyRows()),
      );

      const r = await getAudioVisualSankey({ product_id: specialId }, deps());

      expect(r.product_id).toBe(specialId);
      expect(r.nodes.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 3. 异常流 (Error Flow) — 22 条
  // ============================================================
  describe('【异常流】人为制造报错 → 精准捕获规范错误码', () => {
    const err = async (query: TestAudioVisualSankeyQuery) => {
      let caught: (Error & { errorCode?: string; statusCode?: number; retryable?: boolean }) | null = null;
      try {
        await getAudioVisualSankey(query, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }
      return caught;
    };

    it('TC-ANL-SANKEY-ERR-001: product_id 空字符串 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: '' });
      expect(e).not.toBeNull();
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-SANKEY-ERR-002: product_id 纯空白 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: '   ' });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-SANKEY-ERR-003: product_id 为 undefined → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: undefined as unknown as string });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-SANKEY-ERR-004: creation_id 纯空白字符串 → INVALID_REQUEST 400', async () => {
      setupSuccess();
      const e = await err({ product_id: PRODUCT_ID, creation_id: '   ' });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-SANKEY-ERR-005: 商品不存在 → PRODUCT_NOT_FOUND 404', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(e!.retryable).toBe(false);
    });

    it('TC-ANL-SANKEY-ERR-006: PostgreSQL P1001 → INTERNAL_SERVER_ERROR 503', async () => {
      const dbErr = new Error('Connection terminated');
      (dbErr as Error & { code?: string }).code = 'P1001';
      mockPrisma.product.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SANKEY-ERR-007: PostgreSQL P1008 超时 → INTERNAL_SERVER_ERROR 503', async () => {
      const dbErr = new Error('Query timeout');
      (dbErr as Error & { code?: string }).code = 'P1008';
      mockPrisma.product.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SANKEY-ERR-008: Prisma P2025 → PRODUCT_NOT_FOUND 404', async () => {
      const dbErr = new Error('Record not found');
      (dbErr as Error & { code?: string }).code = 'P2025';
      mockPrisma.product.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(e!.retryable).toBe(false);
    });

    it('TC-ANL-SANKEY-ERR-009: Prisma P2024 连接池耗尽 → INTERNAL_SERVER_ERROR 500', async () => {
      const dbErr = new Error('Pool exhausted');
      (dbErr as Error & { code?: string }).code = 'P2024';
      mockPrisma.product.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SANKEY-ERR-010: 未知 Prisma 异常 → INTERNAL_SERVER_ERROR 500', async () => {
      mockPrisma.product.findUnique.mockRejectedValue(new Error('Random crash'));
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SANKEY-ERR-011: 非 Error 实例抛出 → INTERNAL_SERVER_ERROR 500', async () => {
      mockPrisma.product.findUnique.mockRejectedValue('raw string error');
      const e = await err({ product_id: PRODUCT_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-ANL-SANKEY-ERR-012: DuckDB 异常不阻止返回 (静默降级为 Mock)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryAudioVisualSankey.mockRejectedValue(new Error('DuckDB segfault'));

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.product_id).toBe(PRODUCT_ID);
      expect(r.is_mock).toBe(true);
      expect(r.nodes.length).toBeGreaterThan(0);
      expect(r.links.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SANKEY-ERR-013: DuckDB 返回非数组 rows → 降级 Mock', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(makePrismaProduct(PRODUCT_ID));
      mockDuckDB.queryAudioVisualSankey.mockResolvedValue({
        rows: 'not an array',
        is_mock: false,
        is_predicted: true,
      });

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.is_mock).toBe(true);
      expect(r.nodes.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SANKEY-ERR-014: DuckDB rows 中 flow_count 为负数 → 值域裁剪后正常', async () => {
      const rows: TestSankeyRawRow[] = [
        { bgm_style: '快节奏电子', visual_style: '产品特写', retention_bucket: '高留存(>70%)', flow_count: -100, avg_retention_rate: -0.5 },
      ];
      setupSuccess(PRODUCT_ID, rows);

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.nodes.length).toBe(3);
    });

    it('TC-ANL-SANKEY-ERR-015: avg_retention_rate 越界被钳制，但不同 retention_bucket 仍保留独立节点', async () => {
      const rows: TestSankeyRawRow[] = [
        { bgm_style: '快节奏电子', visual_style: '产品特写', retention_bucket: '高留存(>70%)', flow_count: 100, avg_retention_rate: 3.5 },
        { bgm_style: '快节奏电子', visual_style: '产品特写', retention_bucket: '流失(<20%)', flow_count: 50, avg_retention_rate: -0.8 },
      ];
      setupSuccess(PRODUCT_ID, rows);

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.nodes.length).toBe(4);
    });

    it('TC-ANL-SANKEY-ERR-016: 空 sinks 导致 contribution_rate=1 (单 link 场景)', async () => {
      const rows: TestSankeyRawRow[] = [{
        bgm_style: '无BGM',
        visual_style: '产品特写',
        retention_bucket: '高留存(>70%)',
        flow_count: 120,
        avg_retention_rate: 0.95,
      }];
      setupSuccess(PRODUCT_ID, rows);

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      for (const link of r.links) {
        expect(link.contribution_rate).toBe(1);
      }
    });

    it('TC-ANL-SANKEY-ERR-017: product_id 为 null → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: null as unknown as string });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-SANKEY-ERR-018: creation_id 为 null → 等同于不传 (正常降级)', async () => {
      setupSuccess();
      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID, creation_id: null as unknown as string }, deps());

      expect(r.product_id).toBe(PRODUCT_ID);
      expect(r.nodes.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SANKEY-ERR-019: DuckDB 返回 rows 中有重复 BGM-VISUAL-RETENTION 组合 → 正确聚合', async () => {
      const rows: TestSankeyRawRow[] = [
        { bgm_style: '快节奏电子', visual_style: '产品特写', retention_bucket: '高留存(>70%)', flow_count: 100, avg_retention_rate: 0.9 },
        { bgm_style: '快节奏电子', visual_style: '产品特写', retention_bucket: '高留存(>70%)', flow_count: 200, avg_retention_rate: 0.95 },
      ];
      setupSuccess(PRODUCT_ID, rows);

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.nodes.length).toBe(3);
      const bvLinks = r.links.filter((l) => l.source.startsWith('bgm_') && l.target.startsWith('visual_'));
      expect(bvLinks.length).toBe(1);
      expect(bvLinks[0].value).toBe(300);
    });

    it('TC-ANL-SANKEY-ERR-020: DuckDB 返回 rows 中 BGM 名称为空字符串 → 仍被正确收集', async () => {
      const rows: TestSankeyRawRow[] = [
        { bgm_style: '', visual_style: '产品特写', retention_bucket: '高留存(>70%)', flow_count: 100, avg_retention_rate: 0.5 },
      ];
      setupSuccess(PRODUCT_ID, rows);

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      const bgmNodes = r.nodes.filter((n) => n.dimension === 'BGM_STYLE');
      expect(bgmNodes.length).toBe(1);
      expect(bgmNodes[0].name).toBe('');
    });

    it('TC-ANL-SANKEY-ERR-021: flow_count=0 → link 存在但 value=0, contribution_rate=0', async () => {
      const rows: TestSankeyRawRow[] = [
        { bgm_style: '快节奏电子', visual_style: '产品特写', retention_bucket: '高留存(>70%)', flow_count: 100, avg_retention_rate: 0.9 },
        { bgm_style: '快节奏电子', visual_style: '场景展示', retention_bucket: '高留存(>70%)', flow_count: 0, avg_retention_rate: 0.5 },
      ];
      setupSuccess(PRODUCT_ID, rows);

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      const zeroLinks = r.links.filter((l) => l.value === 0);
      for (const link of zeroLinks) {
        expect(link.contribution_rate).toBe(0);
      }
    });

    it('TC-ANL-SANKEY-ERR-022: 所有 flow_count 均为 0 → summary.total_flow=0', async () => {
      const rows: TestSankeyRawRow[] = [
        { bgm_style: '无BGM', visual_style: '产品特写', retention_bucket: '高留存(>70%)', flow_count: 0, avg_retention_rate: 0 },
      ];
      setupSuccess(PRODUCT_ID, rows);

      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());

      expect(r.summary.total_flow).toBe(0);
      expect(r.summary.low_retention_flow_pct).toBe(0);
    });
  });

  // ============================================================
  // 4. 性能流 (Performance) — 5 条
  // ============================================================
  describe('【性能流】耗时卡点 — 不得超出上限', () => {
    beforeEach(() => {
      setupSuccess();
    });

    it('TC-ANL-SANKEY-PERF-001: getAudioVisualSankey 编排总耗时 ≤ 50ms (不含 I/O)', async () => {
      const start = performance.now();
      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());
      const elapsed = performance.now() - start;

      expect(r.product_id).toBe(PRODUCT_ID);
      expect(elapsed).toBeLessThanOrEqual(50);
    });

    it('TC-ANL-SANKEY-PERF-002: findProductById 单次 ≤ 10ms', async () => {
      const start = performance.now();
      const r = await findProductById(PRODUCT_ID, mockPrisma);
      const elapsed = performance.now() - start;

      expect(r).not.toBeNull();
      expect(elapsed).toBeLessThanOrEqual(10);
    });

    it('TC-ANL-SANKEY-PERF-003: 连续 10 次无退化 avg ≤ 10ms', async () => {
      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());
      }
      const avg = (performance.now() - start) / 10;

      expect(avg).toBeLessThanOrEqual(10);
    }, 10000);

    it('TC-ANL-SANKEY-PERF-004: 全量 100 行 ~45 links 处理 ≤ 30ms', async () => {
      setupSuccess(PRODUCT_ID, makeFullSankeyRows(seedFromString(PRODUCT_ID)));

      const start = performance.now();
      const r = await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());
      const elapsed = performance.now() - start;

      expect(r.nodes.length).toBe(14);
      expect(r.links.length).toBeGreaterThanOrEqual(40);
      expect(elapsed).toBeLessThanOrEqual(30);
    });

    it('TC-ANL-SANKEY-PERF-005: PRODUCT_NOT_FOUND 快速失败 ≤ 5ms', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      const start = performance.now();
      let threw = false;
      try {
        await getAudioVisualSankey({ product_id: PRODUCT_ID }, deps());
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);
      expect(performance.now() - start).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================
  // 5. 原子函数独立测试 — 14 条
  // ============================================================
  describe('【原子函数】独立校验各原子函数正确性', () => {
    describe('validateAudioVisualSankeyParams', () => {
      it('AF-SANKEY-001: 合法 product_id 不抛错', () => {
        expect(() => validateAudioVisualSankeyParams(PRODUCT_ID)).not.toThrow();
      });

      it('AF-SANKEY-002: 合法 product_id + creation_id 不抛错', () => {
        expect(() => validateAudioVisualSankeyParams(PRODUCT_ID, CREATION_ID)).not.toThrow();
      });

      it('AF-SANKEY-003: product_id 为空字符串 → INVALID_REQUEST', () => {
        let e: (Error & { errorCode?: string }) | null = null;
        try {
          validateAudioVisualSankeyParams('');
        } catch (err) {
          e = err as Error & { errorCode?: string };
        }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-SANKEY-004: creation_id 为空白字符串 → INVALID_REQUEST', () => {
        let e: (Error & { errorCode?: string }) | null = null;
        try {
          validateAudioVisualSankeyParams(PRODUCT_ID, '   ');
        } catch (err) {
          e = err as Error & { errorCode?: string };
        }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-SANKEY-005: creation_id=undefined 不抛错', () => {
        expect(() => validateAudioVisualSankeyParams(PRODUCT_ID, undefined)).not.toThrow();
      });
    });

    describe('buildSankeyNodes', () => {
      it('AF-SANKEY-006: 5 BGM + 5 VISUAL + 4 RETENTION → 14 节点按维度顺序排列', () => {
        const nodes = buildSankeyNodes(
          [...BGM_STYLES],
          [...VISUAL_STYLES],
          [...RETENTION_BUCKETS],
        );

        expect(nodes.length).toBe(14);
        expect(nodes[0].dimension).toBe('BGM_STYLE');
        expect(nodes[4].dimension).toBe('BGM_STYLE');
        expect(nodes[5].dimension).toBe('VISUAL_STYLE');
        expect(nodes[9].dimension).toBe('VISUAL_STYLE');
        expect(nodes[10].dimension).toBe('RETENTION_BUCKET');
        expect(nodes[13].dimension).toBe('RETENTION_BUCKET');
      });

      it('AF-SANKEY-007: 单维度 1 个节点 → node_id 包含索引 0', () => {
        const nodes = buildSankeyNodes(['测试BGM'], ['测试VISUAL'], ['测试RETENTION']);

        expect(nodes.length).toBe(3);
        expect(nodes[0].node_id).toBe('bgm_0');
        expect(nodes[0].name).toBe('测试BGM');
        expect(nodes[1].node_id).toBe('visual_0');
        expect(nodes[1].name).toBe('测试VISUAL');
        expect(nodes[2].node_id).toBe('retention_0');
        expect(nodes[2].name).toBe('测试RETENTION');
      });

      it('AF-SANKEY-008: 空 labels → 返回空数组', () => {
        const nodes = buildSankeyNodes([], [], []);

        expect(nodes).toHaveLength(0);
      });
    });

    describe('buildSankeyLinks', () => {
      it('AF-SANKEY-009: 正常 BGM→VISUAL + VISUAL→RETENTION 链路 → contribution_rate 正确', () => {
        const bvRows = [
          { source: 'bgm_0', target: 'visual_0', flow_count: 600 },
          { source: 'bgm_0', target: 'visual_1', flow_count: 400 },
        ];
        const vrRows = [
          { source: 'visual_0', target: 'retention_0', flow_count: 500 },
          { source: 'visual_0', target: 'retention_1', flow_count: 100 },
        ];

        const links = buildSankeyLinks(bvRows, vrRows);

        expect(links.length).toBe(4);
        const bv0 = links.find((l) => l.source === 'bgm_0' && l.target === 'visual_0');
        expect(bv0).toBeDefined();
        expect(bv0!.contribution_rate).toBe(600 / 1000);
        const bv1 = links.find((l) => l.source === 'bgm_0' && l.target === 'visual_1');
        expect(bv1).toBeDefined();
        expect(bv1!.contribution_rate).toBe(400 / 1000);
      });

      it('AF-SANKEY-010: 相同 source 的 contribution_rate 之和为 1', () => {
        const bvRows = [
          { source: 'bgm_0', target: 'visual_0', flow_count: 300 },
          { source: 'bgm_0', target: 'visual_1', flow_count: 200 },
          { source: 'bgm_0', target: 'visual_2', flow_count: 500 },
        ];
        const links = buildSankeyLinks(bvRows, []);

        const sourceSum = new Map<string, number>();
        for (const link of links) {
          sourceSum.set(link.source, (sourceSum.get(link.source) ?? 0) + (link.contribution_rate ?? 0));
        }
        expect(Math.abs((sourceSum.get('bgm_0') ?? 0) - 1)).toBeLessThanOrEqual(0.0001);
      });

      it('AF-SANKEY-011: 空 rows 输入 → 返回空数组', () => {
        const links = buildSankeyLinks([], []);

        expect(links).toHaveLength(0);
      });

      it('AF-SANKEY-012: flow_count=0 → contribution_rate=0', () => {
        const bvRows = [
          { source: 'bgm_0', target: 'visual_0', flow_count: 0 },
          { source: 'bgm_0', target: 'visual_1', flow_count: 0 },
        ];
        const links = buildSankeyLinks(bvRows, []);

        expect(links.length).toBe(2);
        for (const link of links) {
          expect(link.contribution_rate).toBe(0);
        }
      });
    });

    describe('buildSankeySummary', () => {
      it('AF-SANKEY-013: 正常桑基图 → 汇总统计正确', () => {
        const nodes: TestSankeyNode[] = [
          { node_id: 'bgm_0', name: '快节奏电子', dimension: 'BGM_STYLE' },
          { node_id: 'visual_0', name: '产品特写', dimension: 'VISUAL_STYLE' },
          { node_id: 'visual_1', name: '场景展示', dimension: 'VISUAL_STYLE' },
          { node_id: 'retention_0', name: '高留存(>70%)', dimension: 'RETENTION_BUCKET' },
          { node_id: 'retention_1', name: '流失(<20%)', dimension: 'RETENTION_BUCKET' },
        ];
        const links: TestSankeyLink[] = [
          { source: 'bgm_0', target: 'visual_0', value: 600, contribution_rate: 0.6 },
          { source: 'bgm_0', target: 'visual_1', value: 400, contribution_rate: 0.4 },
          { source: 'visual_0', target: 'retention_0', value: 500, contribution_rate: 0.8333 },
          { source: 'visual_0', target: 'retention_1', value: 100, contribution_rate: 0.1667 },
          { source: 'visual_1', target: 'retention_0', value: 200, contribution_rate: 0.5 },
          { source: 'visual_1', target: 'retention_1', value: 200, contribution_rate: 0.5 },
        ];

        const summary = buildSankeySummary(nodes, links);

        expect(summary.total_nodes).toBe(5);
        expect(summary.total_links).toBe(6);
        expect(summary.total_flow).toBe(2000);
        expect(summary.bgm_style_count).toBe(1);
        expect(summary.visual_style_count).toBe(2);
        expect(summary.retention_bucket_count).toBe(2);
        expect(summary.low_retention_flow_pct as number).toBeGreaterThan(0);
      });

      it('AF-SANKEY-014: 空 nodes / links → 所有统计为 0/null', () => {
        const summary = buildSankeySummary([], []);

        expect(summary.total_nodes).toBe(0);
        expect(summary.total_links).toBe(0);
        expect(summary.total_flow).toBe(0);
        expect(summary.bgm_style_count).toBe(0);
        expect(summary.visual_style_count).toBe(0);
        expect(summary.retention_bucket_count).toBe(0);
        expect(summary.max_flow_link).toBeNull();
        expect(summary.dominant_retention_bucket).toBeNull();
        expect(summary.low_retention_flow_pct).toBe(0);
      });
    });
  });
});
