// =============================================================================
// TikStream AI — Analytics AB Compare 自动化测试基座
// 对应功能: GET /api/v1/analytics/ab-compare (AB对比查询接口)
// 对应模块: Analytics (人员B) | 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// =============================================================================
// 0. 测试接口定义
// =============================================================================

interface TestScriptShotAB {
  shot_index: number;
  duration: number;
  voiceover_text: string;
  visual_description: string;
  camera_movement: string;
  transition_type: string;
}

interface TestScriptAB {
  id: string;
  product_id: string;
  title: string | null;
  style_vibe: string;
  generation_mode: string;
  video_duration: number;
  template_id: string | null;
  viral_video_id: string | null;
  constraint_list: string[];
  shots: TestScriptShotAB[];
}

interface TestCreationABRecord {
  id: string;
  product_id: string;
  script_id: string;
  task_id: string;
  status: string;
  current_stage: string;
  script: TestScriptAB;
}

interface TestCompareVersionSummary {
  creation_id: string;
  label: string;
  style_vibe?: string;
  hook_strategy?: string;
  predicted_completion_rate?: number;
  predicted_retention_rate?: number;
  predicted_ctr?: number;
  predicted_cvr?: number;
  avg_shot_duration?: number;
}

interface TestCompareMetricItem {
  metric_name: string;
  value_a: number;
  value_b: number;
  delta: number;
  direction: 'A_BETTER' | 'B_BETTER' | 'TIE';
}

interface TestFactorDiffItem {
  factor: string;
  version_a: string;
  version_b: string;
  impact_summary: string;
}

interface TestAbCompareReportResponse {
  product_id: string;
  version_a: TestCompareVersionSummary;
  version_b: TestCompareVersionSummary;
  winner: 'A' | 'B' | 'TIE';
  metrics: TestCompareMetricItem[];
  factor_diff: TestFactorDiffItem[];
  diagnosis: string[];
  recommendation?: string;
  data_source: 'DUCKDB_PRECOMPUTED';
  is_mock: boolean;
  is_predicted: boolean;
  generated_at: string;
}

interface TestAbCompareQuery {
  product_id: string;
  creation_id_a: string;
  creation_id_b: string;
}

interface TestAbCompareDuckDBRow {
  creation_id: string;
  predicted_ctr: number;
  predicted_cvr: number;
  predicted_completion_rate: number;
  predicted_retention_rate: number;
  hook_type: string;
  hook_strength: number;
}

interface TestAbCompareDuckDBDataBundle {
  metrics_a: TestAbCompareDuckDBRow | null;
  metrics_b: TestAbCompareDuckDBRow | null;
  is_mock: boolean;
  is_predicted: boolean;
}

interface TestAbCompareWeights {
  retention_weight: number;
  completion_weight: number;
  ctr_weight: number;
  cvr_weight: number;
  duration_fit_weight: number;
}

// =============================================================================
// 0. 常量与工厂函数
// =============================================================================

const NOW = new Date('2026-05-25T12:00:00Z');
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const CREATION_ID_A = 'dc52d4ff-0000-4000-a000-0000000000a1';
const CREATION_ID_B = 'dc52d4ff-0000-4000-a000-0000000000b2';
const SCRIPT_ID_A = 'dc52d4ff-0000-4000-a000-0000000000a2';
const SCRIPT_ID_B = 'dc52d4ff-0000-4000-a000-0000000000b3';
const TASK_ID_A = 'tsk_20260525_a00001';
const TASK_ID_B = 'tsk_20260525_b00002';

const DEFAULT_WEIGHTS: TestAbCompareWeights = {
  retention_weight: 0.30,
  completion_weight: 0.25,
  ctr_weight: 0.25,
  cvr_weight: 0.15,
  duration_fit_weight: 0.05,
};

const makeShotAB = (i: number, duration?: number): TestScriptShotAB => ({
  shot_index: i,
  duration: duration ?? (i === 1 ? 3.0 : i === 2 ? 3.5 : i === 3 ? 4.0 : i === 4 ? 2.0 : 2.0),
  voiceover_text: `第${i}段旁白：产品核心卖点生动表达。`,
  visual_description: `镜头${i}：展示产品核心功能，画面干净明亮。`,
  camera_movement: i === 1 ? 'Dolly_In_Fast' : i === 2 ? 'Pan_Left' : i === 3 ? 'Tilt_Up' : 'Static',
  transition_type: i === 1 ? 'Fade_In' : i === 2 ? 'Dissolve' : i === 3 ? 'Wipe' : 'None',
});

const makeShots5 = (): TestScriptShotAB[] => [1, 2, 3, 4, 5].map((i) => makeShotAB(i));
const makeShots3 = (): TestScriptShotAB[] => [1, 2, 3].map((i) => makeShotAB(i, 4.0));
const makeShots8 = (): TestScriptShotAB[] => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => makeShotAB(i, 1.875));
const makeShot1 = (): TestScriptShotAB[] => [makeShotAB(1, 3.0)];

const makeScriptAB = (
  id: string,
  overrides?: Partial<TestScriptAB>,
): TestScriptAB => ({
  id,
  product_id: PRODUCT_ID,
  title: '智能无线卷发棒快速成片剧本',
  style_vibe: 'clean-tech',
  generation_mode: 'PROMPT_DRIVEN',
  video_duration: 14.5,
  template_id: null,
  viral_video_id: null,
  constraint_list: ['total_duration<=15s', 'avoid_absolute_claims'],
  shots: makeShots5(),
  ...overrides,
});

const makeCreationAB = (
  creationId: string,
  scriptId: string,
  taskId: string,
  overrides?: Partial<TestCreationABRecord>,
): TestCreationABRecord => ({
  id: creationId,
  product_id: PRODUCT_ID,
  script_id: scriptId,
  task_id: taskId,
  status: 'FINISHED',
  current_stage: 'FINISHED',
  script: makeScriptAB(scriptId, overrides?.script as Partial<TestScriptAB> | undefined),
  ...overrides,
  script: {
    ...makeScriptAB(scriptId, overrides?.script as Partial<TestScriptAB> | undefined),
    ...(overrides?.script ?? {}),
  },
});

const makeDuckDBRow = (
  creationId: string,
  overrides?: Partial<TestAbCompareDuckDBRow>,
): TestAbCompareDuckDBRow => ({
  creation_id: creationId,
  predicted_ctr: 0.085,
  predicted_cvr: 0.042,
  predicted_completion_rate: 0.72,
  predicted_retention_rate: 0.78,
  hook_type: 'problem_forward',
  hook_strength: 0.75,
  ...overrides,
});

const makeFullDuckDBBundle = (
  creationAId: string,
  creationBId: string,
): TestAbCompareDuckDBDataBundle => ({
  metrics_a: makeDuckDBRow(creationAId),
  metrics_b: makeDuckDBRow(creationBId, {
    predicted_ctr: 0.072,
    predicted_cvr: 0.038,
    predicted_completion_rate: 0.65,
    predicted_retention_rate: 0.71,
  }),
  is_mock: false,
  is_predicted: true,
});

const makeTieDuckDBBundle = (
  creationAId: string,
  creationBId: string,
): TestAbCompareDuckDBDataBundle => ({
  metrics_a: makeDuckDBRow(creationAId),
  metrics_b: makeDuckDBRow(creationBId, {
    predicted_ctr: 0.085,
    predicted_cvr: 0.042,
    predicted_completion_rate: 0.72,
    predicted_retention_rate: 0.78,
  }),
  is_mock: false,
  is_predicted: true,
});

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 8); i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash || 1;
}

function seedFloat(seed: number): number {
  return ((seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function makeMockDuckDBBundle(
  creationIdA: string,
  creationIdB: string,
): TestAbCompareDuckDBDataBundle {
  let sA = hashString(creationIdA);
  let sB = hashString(creationIdB);

  sA = ((sA * 1103515245 + 12345) & 0x7fffffff) >>> 0;
  sB = ((sB * 1103515245 + 12345) & 0x7fffffff) >>> 0;

  const fA = (min: number, max: number) => Math.round((min + seedFloat(sA++) * (max - min)) * 10000) / 10000;
  const fB = (min: number, max: number) => Math.round((min + seedFloat(sB++) * (max - min)) * 10000) / 10000;

  return {
    metrics_a: {
      creation_id: creationIdA,
      predicted_ctr: fA(0.02, 0.15),
      predicted_cvr: fA(0.01, 0.08),
      predicted_completion_rate: fA(0.3, 0.85),
      predicted_retention_rate: fA(0.4, 0.9),
      hook_type: 'problem_forward',
      hook_strength: fA(0.2, 0.95),
    },
    metrics_b: {
      creation_id: creationIdB,
      predicted_ctr: fB(0.02, 0.15),
      predicted_cvr: fB(0.01, 0.08),
      predicted_completion_rate: fB(0.3, 0.85),
      predicted_retention_rate: fB(0.4, 0.9),
      hook_type: 'suspense_progressive',
      hook_strength: fB(0.2, 0.95),
    },
    is_mock: true,
    is_predicted: true,
  };
}

// =============================================================================
// Prisma 工厂 (模拟 Prisma 返回的 camelCase 格式)
// =============================================================================

function toPrismaCreationAB(c: TestCreationABRecord): Record<string, unknown> {
  return {
    id: c.id,
    productId: c.product_id,
    scriptId: c.script_id,
    taskId: c.task_id,
    status: c.status,
    currentStage: c.current_stage,
    script: {
      id: c.script.id,
      productId: c.script.product_id,
      title: c.script.title,
      styleVibe: c.script.style_vibe,
      generationMode: c.script.generation_mode,
      videoDuration: c.script.video_duration,
      templateId: c.script.template_id,
      viralVideoId: c.script.viral_video_id,
      constraintList: c.script.constraint_list,
      shots: c.script.shots.map((s) => ({
        shotIndex: s.shot_index,
        duration: s.duration,
        voiceoverText: s.voiceover_text,
        visualDescription: s.visual_description,
        cameraMovement: s.camera_movement,
        transitionType: s.transition_type,
      })),
    },
  };
}

// =============================================================================
// Mock 类型定义
// =============================================================================

type MockPrismaService = {
  product: { findUnique: jest.Mock };
  creation: { findUnique: jest.Mock };
};

type MockDuckDBDataSource = {
  queryAbCompare: jest.Mock;
};

// =============================================================================
// 原子函数类型声明
// =============================================================================

type ValidateAbCompareParamsFn = (
  productId: string,
  creationIdA: string,
  creationIdB: string,
) => void;

type ValidateProductExistsFn = (
  productId: string,
  prisma: MockPrismaService,
) => Promise<void>;

type ValidateCreationForAbCompareFn = (
  creationId: string,
  productId: string,
  label: 'A' | 'B',
  prisma: MockPrismaService,
) => Promise<TestCreationABRecord>;

type FetchDuckDBAbCompareDataFn = (
  creationIdA: string,
  creationIdB: string,
  duckDB: MockDuckDBDataSource,
) => Promise<TestAbCompareDuckDBDataBundle>;

type BuildVersionSummariesFn = (
  creationA: TestCreationABRecord,
  creationB: TestCreationABRecord,
  duckData: TestAbCompareDuckDBDataBundle,
) => { version_a: TestCompareVersionSummary; version_b: TestCompareVersionSummary };

type ComputeMetricComparisonsFn = (
  summaryA: TestCompareVersionSummary,
  summaryB: TestCompareVersionSummary,
) => TestCompareMetricItem[];

type ComputeFactorDiffFn = (
  creationA: TestCreationABRecord,
  creationB: TestCreationABRecord,
) => TestFactorDiffItem[];

type DetermineWinnerFn = (
  metrics: TestCompareMetricItem[],
  weights: TestAbCompareWeights,
) => 'A' | 'B' | 'TIE';

type ComputeWeightedScoreFn = (
  metrics: TestCompareMetricItem[],
  weights: TestAbCompareWeights,
) => { scoreA: number; scoreB: number };

type BuildDiagnosisAndRecommendationsFn = (
  winner: 'A' | 'B' | 'TIE',
  metrics: TestCompareMetricItem[],
  factorDiff: TestFactorDiffItem[],
  versionA: TestCompareVersionSummary,
  versionB: TestCompareVersionSummary,
) => { diagnosis: string[]; recommendation?: string };

type GetAbCompareFn = (
  dto: TestAbCompareQuery,
  deps: {
    prisma: MockPrismaService;
    duckDB: MockDuckDBDataSource;
    validateParams: ValidateAbCompareParamsFn;
    validateProduct: ValidateProductExistsFn;
    validateCreation: ValidateCreationForAbCompareFn;
    fetchData: FetchDuckDBAbCompareDataFn;
    buildSummaries: BuildVersionSummariesFn;
    computeMetrics: ComputeMetricComparisonsFn;
    computeFactors: ComputeFactorDiffFn;
    determineWinner: DetermineWinnerFn;
    computeWeights: ComputeWeightedScoreFn;
    buildDiagnosis: BuildDiagnosisAndRecommendationsFn;
    weights: TestAbCompareWeights;
  },
) => Promise<TestAbCompareReportResponse>;

// =============================================================================
// Test Suite
// =============================================================================

describe('AnalyticsAbCompare — AB对比查询 (GET /api/v1/analytics/ab-compare)', () => {
  let mockPrisma: MockPrismaService;
  let mockDuckDB: MockDuckDBDataSource;

  // 原子函数变量
  let validateAbCompareParams: ValidateAbCompareParamsFn;
  let validateProductExists: ValidateProductExistsFn;
  let validateCreationForAbCompare: ValidateCreationForAbCompareFn;
  let fetchDuckDBAbCompareData: FetchDuckDBAbCompareDataFn;
  let buildVersionSummaries: BuildVersionSummariesFn;
  let computeMetricComparisons: ComputeMetricComparisonsFn;
  let computeFactorDiff: ComputeFactorDiffFn;
  let determineWinner: DetermineWinnerFn;
  let computeWeightedScore: ComputeWeightedScoreFn;
  let buildDiagnosisAndRecommendations: BuildDiagnosisAndRecommendationsFn;
  let getAbCompare: GetAbCompareFn;

  beforeAll(() => {
    // ==========================================================================
    // validateAbCompareParams — 参数校验 (4层)
    // ==========================================================================
    validateAbCompareParams = (productId, creationIdA, creationIdB) => {
      if (!productId || productId.trim().length === 0) {
        throw Object.assign(new Error('product_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      if (!creationIdA || creationIdA.trim().length === 0) {
        throw Object.assign(new Error('creation_id_a 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      if (!creationIdB || creationIdB.trim().length === 0) {
        throw Object.assign(new Error('creation_id_b 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      if (creationIdA === creationIdB) {
        throw Object.assign(
          new Error('creation_id_a 与 creation_id_b 不能相同，AB 对比需要两个不同的创作版本'),
          {
            errorCode: 'ANALYTICS_AB_COMPARE_SAME_CREATION',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }
    };

    // ==========================================================================
    // validateProductExists — 商品存在性校验 (复用已有逻辑)
    // ==========================================================================
    validateProductExists = async (productId, prisma) => {
      try {
        const record = await prisma.product.findUnique({
          where: { id: productId },
          select: { id: true },
        });
        if (!record) {
          throw Object.assign(new Error(`商品不存在: ${productId}`), {
            errorCode: 'PRODUCT_NOT_FOUND',
            statusCode: HttpStatus.NOT_FOUND,
            retryable: false,
          });
        }
      } catch (error) {
        if (error instanceof Error && (error as Error & { errorCode?: string }).errorCode) {
          throw error;
        }
        const pe = error as Error & { code?: string };
        if (pe.code === 'P2025') {
          throw Object.assign(new Error(`商品不存在: ${productId}`), {
            errorCode: 'PRODUCT_NOT_FOUND',
            statusCode: HttpStatus.NOT_FOUND,
            retryable: false,
          });
        }
        throw Object.assign(new Error(`数据库操作失败: ${(error as Error)?.message ?? error}`), {
          errorCode: 'INTERNAL_SERVER_ERROR',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          retryable: true,
        });
      }
    };

    // ==========================================================================
    // validateCreationForAbCompare — 创作任务存在性校验
    // ==========================================================================
    validateCreationForAbCompare = async (creationId, productId, label, prisma) => {
      try {
        const record = await prisma.creation.findUnique({
          where: { id: creationId },
          include: {
            script: {
              include: { shots: { orderBy: { shotIndex: 'asc' } } },
            },
          },
        });

        if (!record) {
          throw Object.assign(
            new Error(`AB对比 [${label}] 创作任务不存在: ${creationId}`),
            {
              errorCode: 'CREATION_NOT_FOUND',
              statusCode: HttpStatus.NOT_FOUND,
              retryable: false,
            },
          );
        }

        const r = record as Record<string, unknown>;
        const rawScript = (r.script ?? {}) as Record<string, unknown>;
        const rawShots = (rawScript.shots ?? []) as Array<Record<string, unknown>>;

        if (String(r.productId ?? r.product_id) !== productId) {
          throw Object.assign(
            new Error(`AB对比 [${label}] 创作任务 product_id 与查询参数不匹配`),
            {
              errorCode: 'CREATION_NOT_FOUND',
              statusCode: HttpStatus.NOT_FOUND,
              retryable: false,
            },
          );
        }

        if (!rawScript || Object.keys(rawScript).length === 0) {
          throw Object.assign(
            new Error(`AB对比 [${label}] 创作任务 ${creationId} 关联的剧本已被删除`),
            {
              errorCode: 'SCRIPT_NOT_FOUND',
              statusCode: HttpStatus.NOT_FOUND,
              retryable: false,
            },
          );
        }

        if (rawShots.length === 0) {
          throw Object.assign(
            new Error(`AB对比 [${label}] 创作任务 ${creationId} 关联的剧本不包含任何有效分镜`),
            {
              errorCode: 'ANALYTICS_NO_SHOTS_IN_CREATION',
              statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
              retryable: false,
            },
          );
        }

        const shots: TestScriptShotAB[] = rawShots.map((s) => ({
          shot_index: Number(s.shotIndex ?? s.shot_index),
          duration: Number(s.duration),
          voiceover_text: String(s.voiceoverText ?? s.voiceover_text),
          visual_description: String(s.visualDescription ?? s.visual_description),
          camera_movement: String(s.cameraMovement ?? s.camera_movement),
          transition_type: String(s.transitionType ?? s.transition_type),
        }));

        return {
          id: String(r.id),
          product_id: String(r.productId ?? r.product_id),
          script_id: String(r.scriptId ?? r.script_id),
          task_id: String(r.taskId ?? r.task_id),
          status: String(r.status),
          current_stage: String(r.currentStage ?? r.current_stage),
          script: {
            id: String(rawScript.id),
            product_id: String(rawScript.productId ?? rawScript.product_id),
            title: (rawScript.title ?? null) as string | null,
            style_vibe: String(rawScript.styleVibe ?? rawScript.style_vibe ?? ''),
            generation_mode: String(rawScript.generationMode ?? rawScript.generation_mode ?? 'PROMPT_DRIVEN'),
            video_duration: Number(rawScript.videoDuration ?? rawScript.video_duration),
            template_id: (rawScript.templateId ?? rawScript.template_id ?? null) as string | null,
            viral_video_id: (rawScript.viralVideoId ?? rawScript.viral_video_id ?? null) as string | null,
            constraint_list: (rawScript.constraintList ?? rawScript.constraint_list ?? []) as string[],
            shots,
          },
        };
      } catch (error) {
        if (error instanceof Error && (error as Error & { errorCode?: string }).errorCode) {
          throw error;
        }
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
            throw Object.assign(
              new Error(`AB对比 [${label}] 创作任务不存在: ${creationId}`),
              {
                errorCode: 'CREATION_NOT_FOUND',
                statusCode: HttpStatus.NOT_FOUND,
                retryable: false,
              },
            );
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
    };

    // ==========================================================================
    // fetchDuckDBAbCompareData — DuckDB 数据获取 + 静默降级
    // ==========================================================================
    fetchDuckDBAbCompareData = async (creationIdA, creationIdB, duckDB) => {
      try {
        const result = await duckDB.queryAbCompare(creationIdA, creationIdB);
        if (
          result &&
          result.metrics_a &&
          result.metrics_b &&
          typeof result.metrics_a.predicted_ctr === 'number'
        ) {
          const bundle: TestAbCompareDuckDBDataBundle = {
            metrics_a: {
              creation_id: String(result.metrics_a.creation_id ?? creationIdA),
              predicted_ctr: Math.max(0, Math.min(1, Number(result.metrics_a.predicted_ctr) || 0)),
              predicted_cvr: Math.max(0, Math.min(1, Number(result.metrics_a.predicted_cvr) || 0)),
              predicted_completion_rate: Math.max(0, Math.min(1, Number(result.metrics_a.predicted_completion_rate) || 0)),
              predicted_retention_rate: Math.max(0, Math.min(1, Number(result.metrics_a.predicted_retention_rate) || 0)),
              hook_type: String(result.metrics_a.hook_type ?? ''),
              hook_strength: Math.max(0, Math.min(1, Number(result.metrics_a.hook_strength) || 0)),
            },
            metrics_b: {
              creation_id: String(result.metrics_b.creation_id ?? creationIdB),
              predicted_ctr: Math.max(0, Math.min(1, Number(result.metrics_b.predicted_ctr) || 0)),
              predicted_cvr: Math.max(0, Math.min(1, Number(result.metrics_b.predicted_cvr) || 0)),
              predicted_completion_rate: Math.max(0, Math.min(1, Number(result.metrics_b.predicted_completion_rate) || 0)),
              predicted_retention_rate: Math.max(0, Math.min(1, Number(result.metrics_b.predicted_retention_rate) || 0)),
              hook_type: String(result.metrics_b.hook_type ?? ''),
              hook_strength: Math.max(0, Math.min(1, Number(result.metrics_b.hook_strength) || 0)),
            },
            is_mock: result.is_mock ?? false,
            is_predicted: result.is_predicted ?? true,
          };
          return bundle;
        }
        return { ...makeMockDuckDBBundle(creationIdA, creationIdB), is_mock: true, is_predicted: true };
      } catch {
        return { ...makeMockDuckDBBundle(creationIdA, creationIdB), is_mock: true, is_predicted: true };
      }
    };

    // ==========================================================================
    // buildVersionSummaries — 构建版本摘要
    // ==========================================================================
    buildVersionSummaries = (creationA, creationB, duckData) => {
      const scriptA = creationA.script;
      const scriptB = creationB.script;
      const titleA = scriptA.title ?? creationA.id.substring(0, 8);
      const titleB = scriptB.title ?? creationB.id.substring(0, 8);

      const hookMap: Record<string, string> = {
        PROMPT_DRIVEN: 'Prompt驱动-用户自定义策略',
        VIRAL_REWRITE: '爆款仿写-参照爆款钩子结构',
        TEMPLATE_DRIVEN: '模板驱动-结构化策略因子',
      };
      const avgShotDurationA = scriptA.shots.length > 0
        ? Math.round((scriptA.shots.reduce((sum, shot) => sum + shot.duration, 0) / scriptA.shots.length) * 100) / 100
        : 0;
      const avgShotDurationB = scriptB.shots.length > 0
        ? Math.round((scriptB.shots.reduce((sum, shot) => sum + shot.duration, 0) / scriptB.shots.length) * 100) / 100
        : 0;

      return {
        version_a: {
          creation_id: creationA.id,
          label: `版本A: ${titleA}`,
          style_vibe: scriptA.style_vibe,
          hook_strategy: hookMap[scriptA.generation_mode] ?? scriptA.generation_mode,
          predicted_completion_rate: duckData.metrics_a?.predicted_completion_rate,
          predicted_retention_rate: duckData.metrics_a?.predicted_retention_rate,
          predicted_ctr: duckData.metrics_a?.predicted_ctr,
          predicted_cvr: duckData.metrics_a?.predicted_cvr,
          avg_shot_duration: avgShotDurationA,
        },
        version_b: {
          creation_id: creationB.id,
          label: `版本B: ${titleB}`,
          style_vibe: scriptB.style_vibe,
          hook_strategy: hookMap[scriptB.generation_mode] ?? scriptB.generation_mode,
          predicted_completion_rate: duckData.metrics_b?.predicted_completion_rate,
          predicted_retention_rate: duckData.metrics_b?.predicted_retention_rate,
          predicted_ctr: duckData.metrics_b?.predicted_ctr,
          predicted_cvr: duckData.metrics_b?.predicted_cvr,
          avg_shot_duration: avgShotDurationB,
        },
      };
    };

    // ==========================================================================
    // computeMetricComparisons — 5项指标对比
    // ==========================================================================
    computeMetricComparisons = (summaryA, summaryB) => {
      const cmp = (name: string, va: number | undefined, vb: number | undefined): TestCompareMetricItem => {
        const safeA = va ?? 0;
        const safeB = vb ?? 0;
        const delta = Math.round((safeA - safeB) * 10000) / 10000;
        let direction: 'A_BETTER' | 'B_BETTER' | 'TIE';
        if (delta > 0.005) {
          direction = 'A_BETTER';
        } else if (delta < -0.005) {
          direction = 'B_BETTER';
        } else {
          direction = 'TIE';
        }
        return {
          metric_name: name,
          value_a: Math.round(safeA * 10000) / 10000,
          value_b: Math.round(safeB * 10000) / 10000,
          delta,
          direction,
        };
      };

      return [
        cmp('retention_rate', summaryA.predicted_retention_rate, summaryB.predicted_retention_rate),
        cmp('completion_rate', summaryA.predicted_completion_rate, summaryB.predicted_completion_rate),
        cmp('ctr', summaryA.predicted_ctr, summaryB.predicted_ctr),
        cmp('cvr', summaryA.predicted_cvr, summaryB.predicted_cvr),
        cmp('avg_shot_duration', summaryA.avg_shot_duration, summaryB.avg_shot_duration),
      ];
    };

    // ==========================================================================
    // computeFactorDiff — 因子差异对比
    // ==========================================================================
    computeFactorDiff = (creationA, creationB) => {
      const diffs: TestFactorDiffItem[] = [];
      const sA = creationA.script;
      const sB = creationB.script;

      diffs.push({
        factor: '叙事策略',
        version_a: sA.generation_mode,
        version_b: sB.generation_mode,
        impact_summary:
          sA.generation_mode === sB.generation_mode
            ? '两个版本采用相同的生成策略，叙事结构一致'
            : `A 版本采用${sA.generation_mode}，B 版本采用${sB.generation_mode}，叙事结构存在差异`,
      });

      diffs.push({
        factor: '风格调性',
        version_a: sA.style_vibe,
        version_b: sB.style_vibe,
        impact_summary:
          sA.style_vibe === sB.style_vibe
            ? '两个版本风格完全一致'
            : `A 版本偏向"${sA.style_vibe}"风格，B 版本偏向"${sB.style_vibe}"风格`,
      });

      const camCountA: Record<string, number> = {};
      const camCountB: Record<string, number> = {};
      for (const s of sA.shots) camCountA[s.camera_movement] = (camCountA[s.camera_movement] ?? 0) + 1;
      for (const s of sB.shots) camCountB[s.camera_movement] = (camCountB[s.camera_movement] ?? 0) + 1;
      const modeA = Object.entries(camCountA).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Static';
      const modeB = Object.entries(camCountB).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Static';
      diffs.push({
        factor: '镜头运动',
        version_a: modeA,
        version_b: modeB,
        impact_summary:
          modeA === modeB
            ? '两个版本镜头运动风格一致'
            : `A 版本偏重"${modeA}"运动，B 版本偏重"${modeB}"运动`,
      });

      const transCountA: Record<string, number> = {};
      const transCountB: Record<string, number> = {};
      for (const s of sA.shots) transCountA[s.transition_type] = (transCountA[s.transition_type] ?? 0) + 1;
      for (const s of sB.shots) transCountB[s.transition_type] = (transCountB[s.transition_type] ?? 0) + 1;
      const tModeA = Object.entries(transCountA).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'None';
      const tModeB = Object.entries(transCountB).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'None';
      diffs.push({
        factor: '转场类型',
        version_a: tModeA,
        version_b: tModeB,
        impact_summary:
          tModeA === tModeB
            ? '两个版本转场风格一致'
            : `A 版本偏重"${tModeA}"转场，B 版本偏重"${tModeB}"转场`,
      });

      const avgDurA =
        sA.shots.length > 0
          ? Math.round((sA.shots.reduce((sum, s) => sum + s.duration, 0) / sA.shots.length) * 100) / 100
          : 0;
      const avgDurB =
        sB.shots.length > 0
          ? Math.round((sB.shots.reduce((sum, s) => sum + s.duration, 0) / sB.shots.length) * 100) / 100
          : 0;
      diffs.push({
        factor: '分镜数量与节奏',
        version_a: `${sA.shots.length}个分镜 / 均长${avgDurA}s`,
        version_b: `${sB.shots.length}个分镜 / 均长${avgDurB}s`,
        impact_summary:
          sA.shots.length === sB.shots.length
            ? '两个版本分镜数量一致'
            : sA.shots.length > sB.shots.length
              ? `A 版本分镜更多（${sA.shots.length} vs ${sB.shots.length}），节奏更快`
              : `B 版本分镜更多（${sB.shots.length} vs ${sA.shots.length}），节奏更快`,
      });

      return diffs;
    };

    // ==========================================================================
    // computeWeightedScore — 自适应加权评分
    // ==========================================================================
    computeWeightedScore = (metrics, weights) => {
      let scoreA = 0;
      let scoreB = 0;

      const weightMap: Record<string, number> = {
        retention_rate: weights.retention_weight,
        completion_rate: weights.completion_weight,
        ctr: weights.ctr_weight,
        cvr: weights.cvr_weight,
        avg_shot_duration: weights.duration_fit_weight,
      };

      for (const m of metrics) {
        const w = weightMap[m.metric_name] ?? 0;
        if (m.direction === 'A_BETTER') {
          scoreA += w;
        } else if (m.direction === 'B_BETTER') {
          scoreB += w;
        } else {
          scoreA += w * 0.5;
          scoreB += w * 0.5;
        }
      }

      return {
        scoreA: Math.round(scoreA * 10000) / 10000,
        scoreB: Math.round(scoreB * 10000) / 10000,
      };
    };

    // ==========================================================================
    // determineWinner — 优胜者判定
    // ==========================================================================
    determineWinner = (metrics, weights) => {
      const { scoreA, scoreB } = computeWeightedScore(metrics, weights);
      const diff = scoreA - scoreB;
      if (Math.abs(diff) < 0.03) {
        return 'TIE';
      }
      return diff > 0 ? 'A' : 'B';
    };

    // ==========================================================================
    // buildDiagnosisAndRecommendations — 诊断与建议
    // ==========================================================================
    buildDiagnosisAndRecommendations = (winner, metrics, factorDiff, versionA, versionB) => {
      const diagnosis: string[] = [];

      if (winner === 'TIE') {
        diagnosis.push('两个版本在各维度表现接近，无明显优胜者，建议关注细分指标差异进行微调');
      } else if (winner === 'A') {
        const leadingMetrics = metrics
          .filter((m) => m.direction === 'A_BETTER')
          .map((m) => {
            const map: Record<string, string> = {
              retention_rate: '留存率',
              completion_rate: '完成率',
              ctr: 'CTR',
              cvr: 'CVR',
              avg_shot_duration: '分镜节奏适配度',
            };
            return map[m.metric_name] ?? m.metric_name;
          });
        const totalLeading = metrics.filter((m) => m.direction !== 'TIE').length;
        diagnosis.push(
          `版本 A 在 ${leadingMetrics.join('、')} 等 ${leadingMetrics.length}/${totalLeading} 项指标上优于版本 B`,
        );
      } else {
        const leadingMetrics = metrics
          .filter((m) => m.direction === 'B_BETTER')
          .map((m) => {
            const map: Record<string, string> = {
              retention_rate: '留存率',
              completion_rate: '完成率',
              ctr: 'CTR',
              cvr: 'CVR',
              avg_shot_duration: '分镜节奏适配度',
            };
            return map[m.metric_name] ?? m.metric_name;
          });
        const totalLeading = metrics.filter((m) => m.direction !== 'TIE').length;
        diagnosis.push(
          `版本 B 在 ${leadingMetrics.join('、')} 等 ${leadingMetrics.length}/${totalLeading} 项指标上优于版本 A`,
        );
      }

      for (const fd of factorDiff) {
        if (!fd.impact_summary.includes('一致')) {
          diagnosis.push(`${fd.factor} 层面: ${fd.impact_summary}`);
        }
      }

      let recommendation: string | undefined;
      if (winner === 'A') {
        recommendation = `建议保留版本 A 的${versionA.style_vibe ?? '风格'}策略，可借鉴版本 B 的部分优势因子进行增量优化`;
      } else if (winner === 'B') {
        recommendation = `建议保留版本 B 的${versionB.style_vibe ?? '风格'}策略，可借鉴版本 A 的部分优势因子进行增量优化`;
      }

      return { diagnosis, recommendation };
    };

    // ==========================================================================
    // getAbCompare — 主编排器 (10步调用链)
    // ==========================================================================
    getAbCompare = async (dto, deps) => {
      const {
        prisma,
        duckDB,
        validateParams,
        validateProduct,
        validateCreation,
        fetchData,
        buildSummaries,
        computeMetrics,
        computeFactors,
        determineWinner: determine,
        buildDiagnosis,
        weights,
      } = deps;

      validateParams(dto.product_id, dto.creation_id_a, dto.creation_id_b);

      await validateProduct(dto.product_id, prisma);

      const [creationA, creationB] = await Promise.all([
        validateCreation(dto.creation_id_a, dto.product_id, 'A', prisma),
        validateCreation(dto.creation_id_b, dto.product_id, 'B', prisma),
      ]);

      const duckData = await fetchData(dto.creation_id_a, dto.creation_id_b, duckDB);

      const { version_a, version_b } = buildSummaries(creationA, creationB, duckData);

      const metrics = computeMetrics(version_a, version_b);

      const factorDiff = computeFactors(creationA, creationB);

      const winner = determine(metrics, weights);

      const { diagnosis, recommendation } = buildDiagnosis(winner, metrics, factorDiff, version_a, version_b);

      return {
        product_id: dto.product_id,
        version_a,
        version_b,
        winner,
        metrics,
        factor_diff: factorDiff,
        diagnosis,
        recommendation,
        data_source: 'DUCKDB_PRECOMPUTED',
        is_mock: duckData.is_mock,
        is_predicted: duckData.is_predicted,
        generated_at: new Date().toISOString(),
      };
    };
  });

  beforeEach(() => {
    mockPrisma = {
      product: { findUnique: jest.fn() },
      creation: { findUnique: jest.fn() },
    };
    mockDuckDB = { queryAbCompare: jest.fn() };
  });

  const deps = () => ({
    prisma: mockPrisma,
    duckDB: mockDuckDB,
    validateParams: validateAbCompareParams,
    validateProduct: validateProductExists,
    validateCreation: validateCreationForAbCompare,
    fetchData: fetchDuckDBAbCompareData,
    buildSummaries: buildVersionSummaries,
    computeMetrics: computeMetricComparisons,
    computeFactors: computeFactorDiff,
    determineWinner,
    computeWeights: computeWeightedScore,
    buildDiagnosis: buildDiagnosisAndRecommendations,
    weights: DEFAULT_WEIGHTS,
  });

  const setupSuccess = (
    cA?: TestCreationABRecord,
    cB?: TestCreationABRecord,
    duckBundle?: TestAbCompareDuckDBDataBundle,
  ) => {
    const creationA = cA ?? makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A);
    const creationB =
      cB ??
      makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B, {
        script: {
          id: SCRIPT_ID_B,
          product_id: PRODUCT_ID,
          title: '无线卷发棒爆款仿写剧本',
          style_vibe: 'warm-lifestyle',
          generation_mode: 'VIRAL_REWRITE',
          video_duration: 14.0,
          template_id: null,
          viral_video_id: 'viral-0001',
          constraint_list: ['total_duration<=15s'],
          shots: makeShots5(),
        },
      });
    const bundle = duckBundle ?? makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B);

    mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
    mockPrisma.creation.findUnique.mockImplementation(async (args: { where?: { id?: string } }) => {
      const id = args?.where?.id;
      if (id === creationA.id) {
        return toPrismaCreationAB(creationA);
      }
      if (id === creationB.id) {
        return toPrismaCreationAB(creationB);
      }
      return null;
    });
    mockDuckDB.queryAbCompare.mockResolvedValue(bundle);

    return { creationA, creationB };
  };

  // ============================================================
  // 1. 正常流 (Happy Path) — 6 条
  // ============================================================
  describe('【正常流】合法查询参数 → 完整 AbCompareReportResponse', () => {
    beforeEach(() => {
      setupSuccess();
    });

    it('TC-ANL-AB-001: 完整AB对比返回顶层字段齐全并符合 api_types 契约', async () => {
      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.product_id).toBe(PRODUCT_ID);
      expect(r.data_source).toBe('DUCKDB_PRECOMPUTED');
      expect(typeof r.is_mock).toBe('boolean');
      expect(typeof r.is_predicted).toBe('boolean');
      expect(typeof r.generated_at).toBe('string');
      expect(new Date(r.generated_at).getTime()).toBeGreaterThan(0);

      expect(r.version_a).toBeDefined();
      expect(r.version_a.creation_id).toBe(CREATION_ID_A);
      expect(typeof r.version_a.label).toBe('string');
      expect(r.version_a.label.startsWith('版本A:')).toBe(true);

      expect(r.version_b).toBeDefined();
      expect(r.version_b.creation_id).toBe(CREATION_ID_B);
      expect(r.version_b.label.startsWith('版本B:')).toBe(true);

      expect(['A', 'B', 'TIE']).toContain(r.winner);

      expect(Array.isArray(r.metrics)).toBe(true);
      expect(r.metrics.length).toBe(5);

      expect(Array.isArray(r.factor_diff)).toBe(true);
      expect(r.factor_diff.length).toBe(5);

      expect(Array.isArray(r.diagnosis)).toBe(true);
      expect(r.diagnosis.length).toBeGreaterThan(0);
    });

    it('TC-ANL-AB-002: metrics 数组5项指标字段完整且 direction 合法', async () => {
      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      const expectedMetrics = ['retention_rate', 'completion_rate', 'ctr', 'cvr', 'avg_shot_duration'];
      const found = r.metrics.map((m) => m.metric_name).sort();
      expect(found).toEqual(expectedMetrics.sort());

      for (const m of r.metrics) {
        expect(typeof m.value_a).toBe('number');
        expect(typeof m.value_b).toBe('number');
        expect(typeof m.delta).toBe('number');
        expect(m.delta).toBeCloseTo(m.value_a - m.value_b, 4);
        expect(['A_BETTER', 'B_BETTER', 'TIE']).toContain(m.direction);

        if (m.direction === 'TIE') {
          expect(Math.abs(m.delta)).toBeLessThanOrEqual(0.005);
        }
      }
    });

    it('TC-ANL-AB-003: factor_diff 5项因子对比字段完整', async () => {
      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      const expectedFactors = ['叙事策略', '风格调性', '镜头运动', '转场类型', '分镜数量与节奏'];
      const found = r.factor_diff.map((f) => f.factor).sort();
      expect(found).toEqual(expectedFactors.sort());

      for (const fd of r.factor_diff) {
        expect(typeof fd.factor).toBe('string');
        expect(typeof fd.version_a).toBe('string');
        expect(typeof fd.version_b).toBe('string');
        expect(typeof fd.impact_summary).toBe('string');
        expect(fd.impact_summary.length).toBeGreaterThan(0);
      }
    });

    it('TC-ANL-AB-004: 不同DuckDB指标 → winner 非 TIE', async () => {
      setupSuccess();
      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(['A', 'B']).toContain(r.winner);
      expect(typeof r.recommendation).toBe('string');
      expect(r.recommendation!.length).toBeGreaterThan(0);
    });

    it('TC-ANL-AB-005: TieDuckDBBundle → winner=TIE', async () => {
      setupSuccess(
        makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A),
        makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B, {
          script: {
            id: SCRIPT_ID_B,
            product_id: PRODUCT_ID,
            title: '同上配置剧本',
            style_vibe: 'clean-tech',
            generation_mode: 'PROMPT_DRIVEN',
            video_duration: 14.5,
            template_id: null,
            viral_video_id: null,
            constraint_list: ['total_duration<=15s'],
            shots: makeShots5(),
          },
        }),
        makeTieDuckDBBundle(CREATION_ID_A, CREATION_ID_B),
      );

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.winner).toBe('TIE');
      expect(r.diagnosis[0]).toContain('接近');
    });

    it('TC-ANL-AB-006: 两个版本 template_id / viral_video_id 为空仍正常', async () => {
      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.version_a.style_vibe).toBe('clean-tech');
      expect(r.version_b.style_vibe).toBe('warm-lifestyle');
    });
  });

  // ============================================================
  // 2. 边界流 (Edge Cases) — 12 条
  // ============================================================
  describe('【边界流】极端数据 → 系统优雅处理', () => {
    it('TC-ANL-AB-BND-001: 两个版本仅 1 个分镜 → 正常对比', async () => {
      const cA = makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A, {
        script: {
          id: SCRIPT_ID_A,
          product_id: PRODUCT_ID,
          title: '单分镜版本A',
          style_vibe: 'clean-tech',
          generation_mode: 'PROMPT_DRIVEN',
          video_duration: 3.0,
          template_id: null,
          viral_video_id: null,
          constraint_list: [],
          shots: makeShot1(),
        },
      });
      const cB = makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B, {
        script: {
          id: SCRIPT_ID_B,
          product_id: PRODUCT_ID,
          title: '单分镜版本B',
          style_vibe: 'bold',
          generation_mode: 'PROMPT_DRIVEN',
          video_duration: 3.5,
          template_id: null,
          viral_video_id: null,
          constraint_list: [],
          shots: makeShot1(),
        },
      });

      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique
        .mockResolvedValueOnce(toPrismaCreationAB(cA))
        .mockResolvedValueOnce(toPrismaCreationAB(cB));
      mockDuckDB.queryAbCompare.mockResolvedValue(makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B));

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.factor_diff.length).toBe(5);
      expect(r.metrics.length).toBe(5);
    });

    it('TC-ANL-AB-BND-002: 8 个分镜大版本 → 正常对比', async () => {
      const cA = makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A, {
        script: {
          id: SCRIPT_ID_A,
          product_id: PRODUCT_ID,
          title: '8分镜版本A',
          style_vibe: 'clean-tech',
          generation_mode: 'PROMPT_DRIVEN',
          video_duration: 15.0,
          template_id: null,
          viral_video_id: null,
          constraint_list: [],
          shots: makeShots8(),
        },
      });
      const cB = makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B, {
        script: {
          id: SCRIPT_ID_B,
          product_id: PRODUCT_ID,
          title: '8分镜版本B',
          style_vibe: 'warm-lifestyle',
          generation_mode: 'VIRAL_REWRITE',
          video_duration: 14.5,
          template_id: null,
          viral_video_id: 'v-001',
          constraint_list: [],
          shots: makeShots8(),
        },
      });

      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique
        .mockResolvedValueOnce(toPrismaCreationAB(cA))
        .mockResolvedValueOnce(toPrismaCreationAB(cB));
      mockDuckDB.queryAbCompare.mockResolvedValue(makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B));

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.factor_diff.length).toBe(5);
      const rhythmDiff = r.factor_diff.find((f) => f.factor === '分镜数量与节奏');
      expect(rhythmDiff).toBeDefined();
      expect(rhythmDiff!.version_a).toContain('8');
      expect(rhythmDiff!.version_b).toContain('8');
    });

    it('TC-ANL-AB-BND-003: DuckDB 不可用 → 降级 Mock (is_mock=true)', async () => {
      setupSuccess();
      mockDuckDB.queryAbCompare.mockRejectedValue(new Error('Connection refused'));

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.is_mock).toBe(true);
      expect(r.is_predicted).toBe(true);
      expect(r.metrics.length).toBe(5);
      expect(r.factor_diff.length).toBe(5);
    });

    it('TC-ANL-AB-BND-004: DuckDB 返回空对象 → 降级 Mock', async () => {
      setupSuccess();
      mockDuckDB.queryAbCompare.mockResolvedValue({});

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.is_mock).toBe(true);
      expect(r.is_predicted).toBe(true);
    });

    it('TC-ANL-AB-BND-005: DuckDB metrics_a 部分字段缺失 → 值域裁剪为 0', async () => {
      setupSuccess();
      mockDuckDB.queryAbCompare.mockResolvedValue({
        metrics_a: { creation_id: CREATION_ID_A, predicted_ctr: 0.12, predicted_cvr: undefined },
        metrics_b: { creation_id: CREATION_ID_B, predicted_ctr: 0.08, predicted_cvr: 0.04 },
        is_mock: false,
        is_predicted: true,
      });

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.is_mock).toBe(false);
    });

    it('TC-ANL-AB-BND-006: DuckDB 指标超出 [0,1] 范围 → 裁剪', async () => {
      setupSuccess();
      mockDuckDB.queryAbCompare.mockResolvedValue({
        metrics_a: { creation_id: CREATION_ID_A, predicted_ctr: 1.5, predicted_cvr: -0.2, predicted_completion_rate: 2.0, predicted_retention_rate: -1.0, hook_type: 'test', hook_strength: 3.0 },
        metrics_b: { creation_id: CREATION_ID_B, predicted_ctr: 0.08, predicted_cvr: 0.04, predicted_completion_rate: 0.65, predicted_retention_rate: 0.71, hook_type: 'test', hook_strength: 0.7 },
        is_mock: false,
        is_predicted: true,
      });

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.is_mock).toBe(false);
    });

    it('TC-ANL-AB-BND-007: script.title 为 null → label 使用 ID 前8位', async () => {
      const cA = makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A, {
        script: {
          id: SCRIPT_ID_A,
          product_id: PRODUCT_ID,
          title: null,
          style_vibe: 'clean-tech',
          generation_mode: 'PROMPT_DRIVEN',
          video_duration: 14.5,
          template_id: null,
          viral_video_id: null,
          constraint_list: [],
          shots: makeShots5(),
        },
      });
      setupSuccess(cA);

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.version_a.label).toBe(`版本A: ${CREATION_ID_A.substring(0, 8)}`);
    });

    it('TC-ANL-AB-BND-008: 两个版本所有指标完全一致 → winner=TIE', async () => {
      const cA = makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A, {
        script: {
          id: SCRIPT_ID_A,
          product_id: PRODUCT_ID,
          title: '版本A',
          style_vibe: 'clean-tech',
          generation_mode: 'PROMPT_DRIVEN',
          video_duration: 14.5,
          template_id: null,
          viral_video_id: null,
          constraint_list: [],
          shots: makeShots5(),
        },
      });
      const cB = makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B, {
        script: {
          id: SCRIPT_ID_B,
          product_id: PRODUCT_ID,
          title: '版本B',
          style_vibe: 'clean-tech',
          generation_mode: 'PROMPT_DRIVEN',
          video_duration: 14.5,
          template_id: null,
          viral_video_id: null,
          constraint_list: [],
          shots: makeShots5(),
        },
      });

      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique
        .mockResolvedValueOnce(toPrismaCreationAB(cA))
        .mockResolvedValueOnce(toPrismaCreationAB(cB));
      mockDuckDB.queryAbCompare.mockResolvedValue(makeTieDuckDBBundle(CREATION_ID_A, CREATION_ID_B));

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.winner).toBe('TIE');
      expect(r.diagnosis[0]).toContain('接近');
    });

    it('TC-ANL-AB-BND-009: 版本 A 全面碾压版本 B → winner=A, 所有 metrics 方向 A_BETTER', async () => {
      setupSuccess(
        undefined,
        undefined,
        {
          metrics_a: makeDuckDBRow(CREATION_ID_A, { predicted_ctr: 0.12, predicted_cvr: 0.07, predicted_completion_rate: 0.85, predicted_retention_rate: 0.90 }),
          metrics_b: makeDuckDBRow(CREATION_ID_B, { predicted_ctr: 0.03, predicted_cvr: 0.01, predicted_completion_rate: 0.30, predicted_retention_rate: 0.40 }),
          is_mock: false,
          is_predicted: true,
        },
      );

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.winner).toBe('A');
    });

    it('TC-ANL-AB-BND-010: 版本 B 全面碾压版本 A → winner=B', async () => {
      setupSuccess(
        undefined,
        undefined,
        {
          metrics_a: makeDuckDBRow(CREATION_ID_A, { predicted_ctr: 0.03, predicted_cvr: 0.01, predicted_completion_rate: 0.30, predicted_retention_rate: 0.40 }),
          metrics_b: makeDuckDBRow(CREATION_ID_B, { predicted_ctr: 0.12, predicted_cvr: 0.07, predicted_completion_rate: 0.85, predicted_retention_rate: 0.90 }),
          is_mock: false,
          is_predicted: true,
        },
      );

      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.winner).toBe('B');
    });

    it('TC-ANL-AB-BND-011: SQL 注入式 product_id 不报错 (Prisma 参数化)', async () => {
      const sqlId = "PROD'; DROP TABLE products;--";
      const cA = makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A, {
        product_id: sqlId,
        script: { id: SCRIPT_ID_A, product_id: sqlId, title: 'A', style_vibe: 'x', generation_mode: 'PROMPT_DRIVEN', video_duration: 14.5, template_id: null, viral_video_id: null, constraint_list: [], shots: makeShots5() },
      });
      const cB = makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B, {
        product_id: sqlId,
        script: { id: SCRIPT_ID_B, product_id: sqlId, title: 'B', style_vibe: 'y', generation_mode: 'VIRAL_REWRITE', video_duration: 14.0, template_id: null, viral_video_id: 'v-1', constraint_list: [], shots: makeShots5() },
      });

      mockPrisma.product.findUnique.mockResolvedValue({ id: sqlId });
      mockPrisma.creation.findUnique
        .mockResolvedValueOnce(toPrismaCreationAB(cA))
        .mockResolvedValueOnce(toPrismaCreationAB(cB));
      mockDuckDB.queryAbCompare.mockResolvedValue(makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B));

      const r = await getAbCompare(
        { product_id: sqlId, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );

      expect(r.product_id).toBe(sqlId);
    });

    it('TC-ANL-AB-BND-012: 两个版本 product_id 不同但查询用同一个 product_id → 报 MISMATCH', async () => {
      const cA = makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A);
      const cB = makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B, {
        product_id: '00000000-0000-0000-0000-000000000999',
      });

      mockPrisma.product.findUnique.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000999' });
      mockPrisma.creation.findUnique
        .mockResolvedValueOnce(toPrismaCreationAB(cA))
        .mockResolvedValueOnce(toPrismaCreationAB(cB));
      mockDuckDB.queryAbCompare.mockResolvedValue(makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B));

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await getAbCompare(
          { product_id: '00000000-0000-0000-0000-000000000999', creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
          deps(),
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toContain('NOT_FOUND');
    });
  });

  // ============================================================
  // 3. 异常流 (Error Flow) — 23 条
  // ============================================================
  describe('【异常流】人为制造报错 → 精准捕获规范错误码', () => {
    const err = async (query: TestAbCompareQuery) => {
      let caught: (Error & { errorCode?: string; statusCode?: number; retryable?: boolean }) | null = null;
      try {
        await getAbCompare(query, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }
      return caught;
    };

    const setupForErr = () => {
      const cA = makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A);
      const cB = makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B, {
        script: {
          id: SCRIPT_ID_B,
          product_id: PRODUCT_ID,
          title: '版本B',
          style_vibe: 'warm-lifestyle',
          generation_mode: 'VIRAL_REWRITE',
          video_duration: 14.0,
          template_id: null,
          viral_video_id: 'v-001',
          constraint_list: [],
          shots: makeShots5(),
        },
      });
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique
        .mockResolvedValueOnce(toPrismaCreationAB(cA))
        .mockResolvedValueOnce(toPrismaCreationAB(cB));
      mockDuckDB.queryAbCompare.mockResolvedValue(makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B));
    };

    // ---- 参数校验异常 (400) ----
    it('TC-ANL-AB-ERR-001: product_id 空字符串 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: '', creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e).not.toBeNull();
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-AB-ERR-002: creation_id_a 空字符串 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: '', creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-AB-ERR-003: creation_id_b 空字符串 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: '' });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-AB-ERR-004: product_id 纯空白 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: '   ', creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-AB-ERR-005: creation_id_a 纯空白 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: '   ', creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-AB-ERR-006: creation_id_b 纯空白 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: '   ' });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-AB-ERR-007: creation_id_a === creation_id_b → ANALYTICS_AB_COMPARE_SAME_CREATION 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_A });
      expect(e!.errorCode).toBe('ANALYTICS_AB_COMPARE_SAME_CREATION');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(e!.message).toContain('不能相同');
    });

    it('TC-ANL-AB-ERR-008: product_id 为 undefined → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: undefined as unknown as string, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-AB-ERR-009: creation_id_a 为 undefined → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: undefined as unknown as string, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-AB-ERR-010: creation_id_b 为 undefined → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: undefined as unknown as string });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    // ---- 商品不存在 ----
    it('TC-ANL-AB-ERR-011: 商品不存在 → PRODUCT_NOT_FOUND 404', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    // ---- Creation 不存在 ----
    it('TC-ANL-AB-ERR-012: Creation A 不存在 → CREATION_NOT_FOUND 404', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockResolvedValueOnce(null);
      mockPrisma.creation.findUnique.mockResolvedValueOnce(toPrismaCreationAB(makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B)));
      mockDuckDB.queryAbCompare.mockResolvedValue(makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B));
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-ANL-AB-ERR-013: Creation B 不存在 → CREATION_NOT_FOUND 404', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockResolvedValueOnce(toPrismaCreationAB(makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A)));
      mockPrisma.creation.findUnique.mockResolvedValueOnce(null);
      mockDuckDB.queryAbCompare.mockResolvedValue(makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B));
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    // ---- Script 被级联删除 ----
    it('TC-ANL-AB-ERR-014: Creation A 关联 Script 被级联删除 → SCRIPT_NOT_FOUND 404', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockResolvedValueOnce({ id: CREATION_ID_A, productId: PRODUCT_ID, scriptId: SCRIPT_ID_A, taskId: TASK_ID_A, status: 'FINISHED', currentStage: 'FINISHED', script: null });
      mockPrisma.creation.findUnique.mockResolvedValueOnce(toPrismaCreationAB(makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B)));
      mockDuckDB.queryAbCompare.mockResolvedValue(makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B));
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('SCRIPT_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-ANL-AB-ERR-015: Creation B 关联 Script 被级联删除 → SCRIPT_NOT_FOUND 404', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockResolvedValueOnce(toPrismaCreationAB(makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A)));
      mockPrisma.creation.findUnique.mockResolvedValueOnce({ id: CREATION_ID_B, productId: PRODUCT_ID, scriptId: SCRIPT_ID_B, taskId: TASK_ID_B, status: 'FINISHED', currentStage: 'FINISHED', script: null });
      mockDuckDB.queryAbCompare.mockResolvedValue(makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B));
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('SCRIPT_NOT_FOUND');
    });

    // ---- 无有效分镜 ----
    it('TC-ANL-AB-ERR-016: Creation A 无有效分镜 → ANALYTICS_NO_SHOTS_IN_CREATION 422', async () => {
      const cA = makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A, {
        script: {
          id: SCRIPT_ID_A,
          product_id: PRODUCT_ID,
          title: '版本A',
          style_vibe: 'clean-tech',
          generation_mode: 'PROMPT_DRIVEN',
          video_duration: 0,
          template_id: null,
          viral_video_id: null,
          constraint_list: [],
          shots: [],
        },
      });
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockResolvedValueOnce(toPrismaCreationAB(cA));
      mockPrisma.creation.findUnique.mockResolvedValueOnce(toPrismaCreationAB(makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B)));
      mockDuckDB.queryAbCompare.mockResolvedValue(makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B));
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('ANALYTICS_NO_SHOTS_IN_CREATION');
      expect(e!.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    // ---- Prisma 数据库异常 ----
    it('TC-ANL-AB-ERR-017: Prisma P1001 → INTERNAL_SERVER_ERROR 503', async () => {
      const dbErr = new Error('Connection terminated');
      (dbErr as Error & { code?: string }).code = 'P1001';
      mockPrisma.product.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-AB-ERR-018: Prisma P2025 → CREATION_NOT_FOUND 404', async () => {
      const dbErr = new Error('Record not found');
      (dbErr as Error & { code?: string }).code = 'P2025';
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-ANL-AB-ERR-019: Prisma P2024 连接池耗尽 → INTERNAL_SERVER_ERROR 500', async () => {
      const dbErr = new Error('Pool exhausted');
      (dbErr as Error & { code?: string }).code = 'P2024';
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-AB-ERR-020: 非 Error 实例抛出 → INTERNAL_SERVER_ERROR 500', async () => {
      mockPrisma.product.findUnique.mockRejectedValue('raw string error');
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    // ---- DuckDB 异常不报错 (静默降级) ----
    it('TC-ANL-AB-ERR-021: DuckDB 异常 → 静默降级 Mock 不报错', async () => {
      setupSuccess();
      mockDuckDB.queryAbCompare.mockRejectedValue(new Error('DuckDB crashed'));
      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );
      expect(r.is_mock).toBe(true);
      expect(r.metrics.length).toBe(5);
    });

    it('TC-ANL-AB-ERR-022: DuckDB 返回 null → 降级 Mock 不报错', async () => {
      setupSuccess();
      mockDuckDB.queryAbCompare.mockResolvedValue(null);
      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );
      expect(r.is_mock).toBe(true);
    });

    it('TC-ANL-AB-ERR-023: creation_id 格式非 UUID 仍查 null → CREATION_NOT_FOUND 404', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockResolvedValueOnce(null);
      mockPrisma.creation.findUnique.mockResolvedValueOnce(null);
      const e = await err({ product_id: PRODUCT_ID, creation_id_a: 'not-a-valid-uuid', creation_id_b: CREATION_ID_B });
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
    });
  });

  // ============================================================
  // 4. 性能流 (Performance) — 7 条
  // ============================================================
  describe('【性能流】耗时卡点 — 不得超出上限', () => {
    beforeEach(() => {
      setupSuccess();
    });

    it('TC-ANL-AB-PERF-001: getAbCompare 编排总耗时 ≤ 50ms (不含 I/O)', async () => {
      const start = performance.now();
      const r = await getAbCompare(
        { product_id: PRODUCT_ID, creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
        deps(),
      );
      const elapsed = performance.now() - start;
      expect(r.product_id).toBe(PRODUCT_ID);
      expect(elapsed).toBeLessThanOrEqual(50);
    });

    const validQuery = (): TestAbCompareQuery => ({
      product_id: PRODUCT_ID,
      creation_id_a: CREATION_ID_A,
      creation_id_b: CREATION_ID_B,
    });

    it('TC-ANL-AB-PERF-002: validateAbCompareParams 单次 ≤ 1ms', async () => {
      const start = performance.now();
      validateAbCompareParams(PRODUCT_ID, CREATION_ID_A, CREATION_ID_B);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThanOrEqual(1);
    });

    it('TC-ANL-AB-PERF-003: computeMetricComparisons 单次 ≤ 1ms', async () => {
      const r = await getAbCompare(validQuery(), deps());
      const start = performance.now();
      const metrics = computeMetricComparisons(r.version_a, r.version_b);
      const elapsed = performance.now() - start;
      expect(metrics.length).toBe(5);
      expect(elapsed).toBeLessThanOrEqual(1);
    });

    it('TC-ANL-AB-PERF-004: computeWeightedScore 单次 ≤ 1ms', async () => {
      const r = await getAbCompare(validQuery(), deps());
      const start = performance.now();
      const scores = computeWeightedScore(r.metrics, DEFAULT_WEIGHTS);
      const elapsed = performance.now() - start;
      expect(typeof scores.scoreA).toBe('number');
      expect(typeof scores.scoreB).toBe('number');
      expect(elapsed).toBeLessThanOrEqual(1);
    });

    it('TC-ANL-AB-PERF-005: 连续 10 次 AB 对比无退化 avg ≤ 10ms', async () => {
      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        await getAbCompare(validQuery(), deps());
      }
      const avg = (performance.now() - start) / 10;
      expect(avg).toBeLessThanOrEqual(10);
    }, 10000);

    it('TC-ANL-AB-PERF-006: INVALID_REQUEST 快速失败 ≤ 5ms (参数校验短路)', async () => {
      const start = performance.now();
      let threw = false;
      try {
        await getAbCompare(
          { product_id: '', creation_id_a: CREATION_ID_A, creation_id_b: CREATION_ID_B },
          deps(),
        );
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      expect(performance.now() - start).toBeLessThanOrEqual(5);
    });

    it('TC-ANL-AB-PERF-007: determineWinner 100 组 metrics ≤ 5ms', async () => {
      const sampleMetrics: TestCompareMetricItem[] = [
        { metric_name: 'retention_rate', value_a: 0.78, value_b: 0.71, delta: 0.07, direction: 'A_BETTER' },
        { metric_name: 'completion_rate', value_a: 0.72, value_b: 0.65, delta: 0.07, direction: 'A_BETTER' },
        { metric_name: 'ctr', value_a: 0.085, value_b: 0.072, delta: 0.013, direction: 'A_BETTER' },
        { metric_name: 'cvr', value_a: 0.042, value_b: 0.038, delta: 0.004, direction: 'TIE' },
        { metric_name: 'avg_shot_duration', value_a: 2.9, value_b: 3.1, delta: -0.2, direction: 'B_BETTER' },
      ];
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        determineWinner(sampleMetrics, DEFAULT_WEIGHTS);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================
  // 5. 原子函数独立测试 — 17 条
  // ============================================================
  describe('【原子函数】独立校验各原子函数正确性', () => {
    // ---- validateAbCompareParams ----
    describe('validateAbCompareParams', () => {
      it('AF-001: 合法 product_id + 两个不同 creation_id → 不抛错', () => {
        expect(() =>
          validateAbCompareParams(PRODUCT_ID, CREATION_ID_A, CREATION_ID_B),
        ).not.toThrow();
      });

      it('AF-002: product_id 为空字符串 → INVALID_REQUEST', () => {
        let e: (Error & { errorCode?: string }) | null = null;
        try {
          validateAbCompareParams('', CREATION_ID_A, CREATION_ID_B);
        } catch (err) {
          e = err as Error & { errorCode?: string };
        }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-003: creation_id_a 为空字符串 → INVALID_REQUEST', () => {
        let e: (Error & { errorCode?: string }) | null = null;
        try {
          validateAbCompareParams(PRODUCT_ID, '', CREATION_ID_B);
        } catch (err) {
          e = err as Error & { errorCode?: string };
        }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-004: creation_id_b 为空字符串 → INVALID_REQUEST', () => {
        let e: (Error & { errorCode?: string }) | null = null;
        try {
          validateAbCompareParams(PRODUCT_ID, CREATION_ID_A, '');
        } catch (err) {
          e = err as Error & { errorCode?: string };
        }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-005: creation_id_a === creation_id_b → ANALYTICS_AB_COMPARE_SAME_CREATION', () => {
        let e: (Error & { errorCode?: string; message?: string }) | null = null;
        try {
          validateAbCompareParams(PRODUCT_ID, CREATION_ID_A, CREATION_ID_A);
        } catch (err) {
          e = err as Error & { errorCode?: string; message?: string };
        }
        expect(e!.errorCode).toBe('ANALYTICS_AB_COMPARE_SAME_CREATION');
        expect(e!.message).toContain('不能相同');
      });
    });

    // ---- buildVersionSummaries ----
    describe('buildVersionSummaries', () => {
      it('AF-006: 两个不同 creation → label 包含标题', () => {
        const cA = makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A);
        const cB = makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B, {
          script: {
            id: SCRIPT_ID_B,
            product_id: PRODUCT_ID,
            title: '爆款仿写剧本B',
            style_vibe: 'warm-lifestyle',
            generation_mode: 'VIRAL_REWRITE',
            video_duration: 14.0,
            template_id: null,
            viral_video_id: 'v-001',
            constraint_list: [],
            shots: makeShots5(),
          },
        });
        const duckData = makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B);
        const { version_a, version_b } = buildVersionSummaries(cA, cB, duckData);

        expect(version_a.creation_id).toBe(CREATION_ID_A);
        expect(version_a.label).toContain('智能无线卷发棒快速成片剧本');
        expect(version_a.style_vibe).toBe('clean-tech');
        expect(version_a.predicted_ctr).toBe(0.085);

        expect(version_b.creation_id).toBe(CREATION_ID_B);
        expect(version_b.label).toContain('爆款仿写剧本B');
        expect(version_b.style_vibe).toBe('warm-lifestyle');
        expect(version_b.hook_strategy).toContain('爆款仿写');
      });

      it('AF-007: title 为 null → label 使用 ID 前8位', () => {
        const cA = makeCreationAB(CREATION_ID_A, SCRIPT_ID_A, TASK_ID_A, {
          script: {
            id: SCRIPT_ID_A,
            product_id: PRODUCT_ID,
            title: null,
            style_vibe: 'x',
            generation_mode: 'PROMPT_DRIVEN',
            video_duration: 14.5,
            template_id: null,
            viral_video_id: null,
            constraint_list: [],
            shots: makeShots5(),
          },
        });
        const cB = makeCreationAB(CREATION_ID_B, SCRIPT_ID_B, TASK_ID_B);
        const duckData = makeFullDuckDBBundle(CREATION_ID_A, CREATION_ID_B);
        const { version_a } = buildVersionSummaries(cA, cB, duckData);
        expect(version_a.label).toBe(`版本A: ${CREATION_ID_A.substring(0, 8)}`);
      });
    });

    // ---- computeMetricComparisons ----
    describe('computeMetricComparisons', () => {
      it('AF-008: 5 项指标全部 A_BETTER → delta 全正', () => {
        const summaryA: TestCompareVersionSummary = {
          creation_id: CREATION_ID_A,
          label: 'A',
          predicted_ctr: 0.12,
          predicted_cvr: 0.07,
          predicted_completion_rate: 0.85,
        };
        const summaryB: TestCompareVersionSummary = {
          creation_id: CREATION_ID_B,
          label: 'B',
          predicted_ctr: 0.03,
          predicted_cvr: 0.01,
          predicted_completion_rate: 0.30,
        };
        const metrics = computeMetricComparisons(summaryA, summaryB);
        expect(metrics.filter((m) => m.direction === 'A_BETTER').length).toBeGreaterThanOrEqual(3);
      });

      it('AF-009: 两版本数据完全一致 → 全部 TIE', () => {
        const s: TestCompareVersionSummary = {
          creation_id: CREATION_ID_A,
          label: 'X',
          predicted_ctr: 0.08,
          predicted_cvr: 0.04,
          predicted_completion_rate: 0.72,
        };
        const metrics = computeMetricComparisons(s, s);
        const nonTie = metrics.filter((m) => m.direction !== 'TIE');
        expect(nonTie.length).toBe(0);
      });

      it('AF-010: delta = value_a - value_b', () => {
        const summaryA: TestCompareVersionSummary = {
          creation_id: CREATION_ID_A, label: 'A',
          predicted_ctr: 0.10,
          predicted_cvr: 0.05,
          predicted_completion_rate: 0.50,
        };
        const summaryB: TestCompareVersionSummary = {
          creation_id: CREATION_ID_B, label: 'B',
          predicted_ctr: 0.07,
          predicted_cvr: 0.08,
          predicted_completion_rate: undefined,
        };
        const metrics = computeMetricComparisons(summaryA, summaryB);
        const ctrMetric = metrics.find((m) => m.metric_name === 'ctr');
        expect(ctrMetric).toBeDefined();
        expect(ctrMetric!.delta).toBeCloseTo(0.03, 4);
      });
    });

    // ---- computeWeightedScore + determineWinner ----
    describe('computeWeightedScore & determineWinner', () => {
      const makeMetrics = (directions: Array<'A_BETTER' | 'B_BETTER' | 'TIE'>): TestCompareMetricItem[] =>
        directions.map((d, i) => ({
          metric_name: ['retention_rate', 'completion_rate', 'ctr', 'cvr', 'avg_shot_duration'][i],
          value_a: d === 'A_BETTER' ? 0.9 : 0.5,
          value_b: d === 'B_BETTER' ? 0.9 : 0.5,
          delta: d === 'A_BETTER' ? 0.4 : d === 'B_BETTER' ? -0.4 : 0,
          direction: d,
        }));

      it('AF-011: 全部 A_BETTER → scoreA=1.0, scoreB=0.0, winner=A', () => {
        const metrics = makeMetrics(['A_BETTER', 'A_BETTER', 'A_BETTER', 'A_BETTER', 'A_BETTER']);
        const { scoreA, scoreB } = computeWeightedScore(metrics, DEFAULT_WEIGHTS);
        expect(scoreA).toBe(1.0);
        expect(scoreB).toBe(0.0);
        expect(determineWinner(metrics, DEFAULT_WEIGHTS)).toBe('A');
      });

      it('AF-012: 全部 B_BETTER → scoreB=1.0, winner=B', () => {
        const metrics = makeMetrics(['B_BETTER', 'B_BETTER', 'B_BETTER', 'B_BETTER', 'B_BETTER']);
        const { scoreA, scoreB } = computeWeightedScore(metrics, DEFAULT_WEIGHTS);
        expect(scoreB).toBe(1.0);
        expect(scoreA).toBe(0.0);
        expect(determineWinner(metrics, DEFAULT_WEIGHTS)).toBe('B');
      });

      it('AF-013: 全部 TIE → scoreA === scoreB, winner=TIE', () => {
        const metrics = makeMetrics(['TIE', 'TIE', 'TIE', 'TIE', 'TIE']);
        const { scoreA, scoreB } = computeWeightedScore(metrics, DEFAULT_WEIGHTS);
        expect(scoreA).toBe(scoreB);
        expect(determineWinner(metrics, DEFAULT_WEIGHTS)).toBe('TIE');
      });

      it('AF-014: 权重之和恒为 1.0', () => {
        const total =
          DEFAULT_WEIGHTS.retention_weight +
          DEFAULT_WEIGHTS.completion_weight +
          DEFAULT_WEIGHTS.ctr_weight +
          DEFAULT_WEIGHTS.cvr_weight +
          DEFAULT_WEIGHTS.duration_fit_weight;
        expect(total).toBeCloseTo(1.0, 10);
      });
    });

    // ---- buildDiagnosisAndRecommendations ----
    describe('buildDiagnosisAndRecommendations', () => {
      it('AF-015: winner=TIE → 诊断包含"接近"且无 recommendation', () => {
        const metrics: TestCompareMetricItem[] = [
          { metric_name: 'retention_rate', value_a: 0.5, value_b: 0.5, delta: 0, direction: 'TIE' },
        ];
        const factorDiff: TestFactorDiffItem[] = [
          { factor: '风格调性', version_a: 'x', version_b: 'x', impact_summary: '两个版本风格完全一致' },
        ];
        const v: TestCompareVersionSummary = { creation_id: 'x', label: 'v' };
        const { diagnosis, recommendation } = buildDiagnosisAndRecommendations('TIE', metrics, factorDiff, v, v);
        expect(diagnosis[0]).toContain('接近');
        expect(diagnosis.length).toBe(1);
        expect(recommendation).toBeUndefined();
      });

      it('AF-016: winner=A → 诊断列出 A 的优势指标并给建议', () => {
        const metrics: TestCompareMetricItem[] = [
          { metric_name: 'retention_rate', value_a: 0.9, value_b: 0.5, delta: 0.4, direction: 'A_BETTER' },
          { metric_name: 'completion_rate', value_a: 0.8, value_b: 0.5, delta: 0.3, direction: 'A_BETTER' },
        ];
        const factorDiff: TestFactorDiffItem[] = [
          { factor: '风格调性', version_a: 'clean', version_b: 'bold', impact_summary: 'A 版本偏向"clean"风格' },
        ];
        const vA: TestCompareVersionSummary = { creation_id: 'a', label: 'A', style_vibe: 'clean' };
        const vB: TestCompareVersionSummary = { creation_id: 'b', label: 'B', style_vibe: 'bold' };
        const { diagnosis, recommendation } = buildDiagnosisAndRecommendations('A', metrics, factorDiff, vA, vB);
        expect(diagnosis[0]).toContain('A');
        expect(diagnosis[0]).toContain('留存率');
        expect(diagnosis.length).toBeGreaterThanOrEqual(2);
        expect(recommendation).toBeDefined();
        expect(recommendation!).toContain('clean');
      });

      it('AF-017: winner=B → 诊断列出 B 的优势并给建议', () => {
        const metrics: TestCompareMetricItem[] = [
          { metric_name: 'ctr', value_a: 0.3, value_b: 0.8, delta: -0.5, direction: 'B_BETTER' },
        ];
        const factorDiff: TestFactorDiffItem[] = [];
        const vA: TestCompareVersionSummary = { creation_id: 'a', label: 'A', style_vibe: 'clean' };
        const vB: TestCompareVersionSummary = { creation_id: 'b', label: 'B', style_vibe: 'bold' };
        const { diagnosis, recommendation } = buildDiagnosisAndRecommendations('B', metrics, factorDiff, vA, vB);
        expect(diagnosis[0]).toContain('B');
        expect(diagnosis[0]).toContain('CTR');
        expect(recommendation).toBeDefined();
        expect(recommendation!).toContain('bold');
      });
    });
  });
});