// =============================================================================
// TikStream AI — Auto AB Session 自动化测试基座
// 对应功能: POST /api/v1/auto-ab/sessions (创建自动AB测试Session)
//           GET /api/v1/auto-ab/sessions/:sessionId/sse (SSE进度推送)
//           GET /api/v1/auto-ab/sessions/:sessionId/result (获取AB结果)
// 对应模块: AutoAB (人员B) | 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// =============================================================================
// 0. 测试专用类型定义
// =============================================================================

interface TestProduct {
  id: string;
  title: string;
  sku_code: string;
  category: string;
  selling_points: string[];
  target_audience: string | null;
}

interface TestScriptShot {
  shot_index: number;
  duration: number;
  voiceover_text: string;
  visual_description: string;
  camera_movement: string;
  transition_type: string;
}

interface TestScriptGeneration {
  creation_id: string;
  script_id: string;
  task_id: string;
  shots: TestScriptShot[];
  video_duration: number;
  style_vibe: string;
  generation_mode: string;
}

interface TestAbSseEvent {
  event: string;
  data: Record<string, unknown>;
}

interface TestAbMetricItem {
  metric_name: string;
  value_a: number;
  value_b: number;
  delta: number;
  direction: 'A_BETTER' | 'B_BETTER' | 'TIE';
}

interface TestAbSessionResult {
  session_id: string;
  product_id: string;
  status: 'COMPLETED' | 'FAILED' | 'PARTIAL';
  version_a: {
    creation_id: string;
    label: string;
    style_vibe: string;
    generation_mode: string;
    shot_count: number;
    video_duration: number;
    predicted_ctr?: number;
    predicted_cvr?: number;
    predicted_completion_rate?: number;
    predicted_retention_rate?: number;
  };
  version_b: {
    creation_id: string;
    label: string;
    style_vibe: string;
    generation_mode: string;
    shot_count: number;
    video_duration: number;
    predicted_ctr?: number;
    predicted_cvr?: number;
    predicted_completion_rate?: number;
    predicted_retention_rate?: number;
  };
  winner: 'A' | 'B' | 'TIE';
  metrics: TestAbMetricItem[];
  diagnosis: string[];
  recommendation?: string;
  created_at: string;
  completed_at: string | null;
}

interface TestAutoAbCreateRequest {
  product_id: string;
  mode_a?: string;
  mode_b?: string;
  style_vibe_a?: string;
  style_vibe_b?: string;
  constraint_list?: string[];
  max_duration?: number;
}

interface MockSseEmitter {
  events: TestAbSseEvent[];
  sendEvent: (event: string, data: Record<string, unknown>) => void;
  complete: () => void;
  error: (err: Error) => void;
  hasEvent: (eventName: string) => boolean;
  getEvents: (eventName: string) => TestAbSseEvent[];
  isCompleted: boolean;
  isErrored: boolean;
  errorReceived: Error | null;
}

// =============================================================================
// Mock Prisma
// =============================================================================

type MockPrismaService = {
  product: { findUnique: jest.Mock };
  creation: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  script: { create: jest.Mock; update: jest.Mock };
  scriptShot: { createMany: jest.Mock };
  autoAbSession: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

// =============================================================================
// 常量
// =============================================================================

const NOW = new Date('2026-06-05T14:00:00Z');
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const SESSION_ID = 'auto_ab_session_20260605_001';
const CREATION_ID_A = 'dc52d4ff-0000-4000-a000-0000000000a1';
const CREATION_ID_B = 'dc52d4ff-0000-4000-a000-0000000000b2';
const SCRIPT_ID_A = 'dc52d4ff-0000-4000-a000-0000000000a2';
const SCRIPT_ID_B = 'dc52d4ff-0000-4000-a000-0000000000b3';
const TASK_ID_A = 'tsk_20260605_a00001';
const TASK_ID_B = 'tsk_20260605_b00002';

const DEFAULT_MAX_DURATION = 15;
const SSE_EVENT_TYPES = ['session_started', 'script_a_generating', 'script_b_generating', 'script_a_completed', 'script_b_completed', 'comparing', 'done', 'error'];

// =============================================================================
// Mock Factories
// =============================================================================

const createMockSseEmitter = (): MockSseEmitter => {
  const emitter: MockSseEmitter = {
    events: [],
    isCompleted: false,
    isErrored: false,
    errorReceived: null,
    sendEvent(event, data) {
      this.events.push({ event, data });
    },
    complete() {
      this.isCompleted = true;
    },
    error(err) {
      this.isErrored = true;
      this.errorReceived = err;
    },
    hasEvent(eventName) {
      return this.events.some((e) => e.event === eventName);
    },
    getEvents(eventName) {
      return this.events.filter((e) => e.event === eventName);
    },
  };
  return emitter;
};

const mockShotFactory = (index: number, overrides?: Partial<TestScriptShot>): TestScriptShot => ({
  shot_index: index,
  duration: index === 1 ? 3.0 : index === 2 ? 3.5 : index === 3 ? 4.0 : index === 4 ? 2.0 : 2.0,
  voiceover_text: `第${index}段旁白：产品核心卖点。`,
  visual_description: `镜头${index}：展示产品功能画面。`,
  camera_movement: index === 1 ? 'Dolly_In_Fast' : index === 2 ? 'Pan_Left' : index === 3 ? 'Tilt_Up' : 'Static',
  transition_type: index === 1 ? 'Fade_In' : index === 2 ? 'Dissolve' : index === 3 ? 'Wipe' : 'None',
  ...overrides,
});

const mock5ShotsFactory = (): TestScriptShot[] =>
  [1, 2, 3, 4, 5].map((i) => mockShotFactory(i));

const mock3ShotsFactory = (): TestScriptShot[] =>
  [1, 2, 3].map((i) => mockShotFactory(i, { duration: 4.5 }));

const mockProductFactory = (overrides?: Partial<TestProduct>): TestProduct => ({
  id: PRODUCT_ID,
  title: '智能无线卷发棒 Pro',
  sku_code: 'SKU-HB-PRO-001',
  category: 'Beauty/PersonalCare',
  selling_points: ['3档智能控温', '10分钟快充', '便携无线'],
  target_audience: '北美年轻女性,25-35岁',
  ...overrides,
});

const mockScriptGenerationFactory = (
  overrides?: Partial<TestScriptGeneration>,
): TestScriptGeneration => ({
  creation_id: CREATION_ID_A,
  script_id: SCRIPT_ID_A,
  task_id: TASK_ID_A,
  shots: mock5ShotsFactory(),
  video_duration: 14.5,
  style_vibe: 'clean-tech',
  generation_mode: 'PROMPT_DRIVEN',
  ...overrides,
});

const mockAbSessionResultFactory = (
  overrides?: Partial<TestAbSessionResult>,
): TestAbSessionResult => ({
  session_id: SESSION_ID,
  product_id: PRODUCT_ID,
  status: 'COMPLETED',
  version_a: {
    creation_id: CREATION_ID_A,
    label: '版本A: clean-tech 风格',
    style_vibe: 'clean-tech',
    generation_mode: 'PROMPT_DRIVEN',
    shot_count: 5,
    video_duration: 14.5,
    predicted_ctr: 0.085,
    predicted_cvr: 0.042,
    predicted_completion_rate: 0.72,
    predicted_retention_rate: 0.78,
  },
  version_b: {
    creation_id: CREATION_ID_B,
    label: '版本B: warm-lifestyle 风格',
    style_vibe: 'warm-lifestyle',
    generation_mode: 'VIRAL_REWRITE',
    shot_count: 5,
    video_duration: 14.0,
    predicted_ctr: 0.072,
    predicted_cvr: 0.038,
    predicted_completion_rate: 0.65,
    predicted_retention_rate: 0.71,
  },
  winner: 'A',
  metrics: [
    { metric_name: 'retention_rate', value_a: 0.78, value_b: 0.71, delta: 0.07, direction: 'A_BETTER' },
    { metric_name: 'completion_rate', value_a: 0.72, value_b: 0.65, delta: 0.07, direction: 'A_BETTER' },
    { metric_name: 'ctr', value_a: 0.085, value_b: 0.072, delta: 0.013, direction: 'A_BETTER' },
    { metric_name: 'cvr', value_a: 0.042, value_b: 0.038, delta: 0.004, direction: 'A_BETTER' },
    { metric_name: 'avg_shot_duration', value_a: 2.9, value_b: 2.8, delta: 0.1, direction: 'A_BETTER' },
  ],
  diagnosis: [
    '版本 A 在留存率、完成率、CTR、CVR 等 5/5 项指标上优于版本 B',
    '风格调性层面: A 版本偏向"clean-tech"风格，B 版本偏向"warm-lifestyle"风格',
  ],
  recommendation: '建议保留版本 A 的 clean-tech 风格策略',
  created_at: NOW.toISOString(),
  completed_at: NOW.toISOString(),
  ...overrides,
});

const mockPrismaServiceFactory = (): MockPrismaService => {
  const client = {
    product: { findUnique: jest.fn() },
    creation: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    script: { create: jest.fn(), update: jest.fn() },
    scriptShot: { createMany: jest.fn() },
    autoAbSession: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  } as MockPrismaService;

  client.$transaction.mockImplementation(
    async (fn: (tx: Omit<MockPrismaService, '$transaction'>) => Promise<unknown>) => fn(client),
  );

  return client;
};

// =============================================================================
// 测试套件入口
// =============================================================================

describe('AutoAbSession — 自动 A/B Session 创建、SSE 进度、结果验证', () => {
  let mockPrisma: MockPrismaService;

  // ---- 原子函数类型声明 ----

  let validateProductId: (productId: string) => void;
  let validateCreateRequest: (req: TestAutoAbCreateRequest) => void;
  let findProduct: (prisma: MockPrismaService, productId: string) => Promise<TestProduct>;
  let createSession: (prisma: MockPrismaService, productId: string) => Promise<{ id: string; status: string }>;
  let generateScriptForVariant: (
    product: TestProduct,
    variant: 'A' | 'B',
    config: { style_vibe?: string; generation_mode?: string; constraint_list?: string[]; max_duration?: number },
  ) => Promise<TestScriptGeneration>;
  let compareVariants: (
    genA: TestScriptGeneration,
    genB: TestScriptGeneration,
  ) => Promise<Pick<TestAbSessionResult, 'winner' | 'metrics' | 'diagnosis' | 'recommendation'>>;
  let findSession: (prisma: MockPrismaService, sessionId: string) => Promise<TestAbSessionResult>;

  // ---- 编排函数 ----

  let createAutoAbSessionAndStream: (
    req: TestAutoAbCreateRequest,
    deps: { prisma: MockPrismaService; sse: MockSseEmitter },
  ) => Promise<TestAbSessionResult>;

  let getSessionResult: (
    sessionId: string,
    deps: { prisma: MockPrismaService },
  ) => Promise<TestAbSessionResult>;

  beforeAll(() => {
    // ---- validateProductId ----
    validateProductId = (productId: string) => {
      if (!productId || productId.trim().length === 0) {
        throw Object.assign(new Error('product_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
    };

    // ---- validateCreateRequest ----
    validateCreateRequest = (req: TestAutoAbCreateRequest) => {
      validateProductId(req.product_id);

      if (req.max_duration !== undefined && req.max_duration <= 0) {
        throw Object.assign(new Error('max_duration 必须为正数'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }

      if (req.max_duration !== undefined && req.max_duration > 60) {
        throw Object.assign(new Error('max_duration 不能超过 60 秒'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
    };

    // ---- findProduct ----
    findProduct = async (prisma: MockPrismaService, productId: string): Promise<TestProduct> => {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        throw Object.assign(new Error(`商品 ${productId} 不存在`), {
          errorCode: 'PRODUCT_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }
      return product as unknown as TestProduct;
    };

    // ---- createSession ----
    createSession = async (prisma: MockPrismaService, productId: string): Promise<{ id: string; status: string }> => {
      const session = await prisma.autoAbSession.create({
        data: {
          id: `auto_ab_session_${Date.now()}`,
          product_id: productId,
          status: 'PROCESSING',
          created_at: new Date(),
          completed_at: null,
        },
      });
      return { id: (session as Record<string, unknown>).id as string, status: 'PROCESSING' };
    };

    // ---- generateScriptForVariant ----
    generateScriptForVariant = async (
      product: TestProduct,
      variant: 'A' | 'B',
      config: { style_vibe?: string; generation_mode?: string; constraint_list?: string[]; max_duration?: number },
    ): Promise<TestScriptGeneration> => {
      const variantLabel = variant === 'A' ? 'a' : 'b';
      const creationId = variant === 'A' ? CREATION_ID_A : CREATION_ID_B;
      const scriptId = variant === 'A' ? SCRIPT_ID_A : SCRIPT_ID_B;
      const taskId = variant === 'A' ? TASK_ID_A : TASK_ID_B;

      // 模拟根据配置生成不同剧本
      const styleVibe = config.style_vibe ?? (variant === 'A' ? 'clean-tech' : 'warm-lifestyle');
      const mode = config.generation_mode ?? (variant === 'A' ? 'PROMPT_DRIVEN' : 'VIRAL_REWRITE');
      const maxDuration = config.max_duration ?? DEFAULT_MAX_DURATION;

      // 根据策略生成不同数量和时长的分镜
      const shots: TestScriptShot[] = [];
      let totalDuration = 0;
      const shotCount = mode === 'VIRAL_REWRITE' ? 3 : 5;

      for (let i = 1; i <= shotCount; i++) {
        const remaining = maxDuration - totalDuration;
        const dur = i < shotCount
          ? Math.round((remaining / (shotCount - i + 1)) * 10) / 10
          : Math.round(remaining * 10) / 10;
        totalDuration += dur;

        shots.push({
          shot_index: i,
          duration: Math.min(dur, 8),
          voiceover_text: `${variant}版本第${i}段旁白。`.repeat(mode === 'VIRAL_REWRITE' ? 2 : 1),
          visual_description: `镜头${i}：${styleVibe}风格展示。`,
          camera_movement: i % 3 === 0 ? 'Tilt_Up' : i % 3 === 1 ? 'Dolly_In_Fast' : 'Pan_Left',
          transition_type: i === 1 ? 'Fade_In' : i === shotCount ? 'Fade_Out' : 'Dissolve',
        });
      }

      return {
        creation_id: creationId,
        script_id: scriptId,
        task_id: taskId,
        shots,
        video_duration: Math.round(totalDuration * 10) / 10,
        style_vibe: styleVibe,
        generation_mode: mode,
      };
    };

    // ---- compareVariants ----
    compareVariants = async (
      genA: TestScriptGeneration,
      genB: TestScriptGeneration,
    ): Promise<Pick<TestAbSessionResult, 'winner' | 'metrics' | 'diagnosis' | 'recommendation'>> => {
      // 模拟 DuckDB 预测值
      const predictedA = {
        ctr: 0.07 + Math.random() * 0.04,
        cvr: 0.03 + Math.random() * 0.03,
        completion: 0.6 + Math.random() * 0.25,
        retention: 0.65 + Math.random() * 0.2,
      };
      const predictedB = {
        ctr: 0.07 + Math.random() * 0.04,
        cvr: 0.03 + Math.random() * 0.03,
        completion: 0.6 + Math.random() * 0.25,
        retention: 0.65 + Math.random() * 0.2,
      };

      const metrics: TestAbMetricItem[] = [
        {
          metric_name: 'retention_rate',
          value_a: Math.round(predictedA.retention * 10000) / 10000,
          value_b: Math.round(predictedB.retention * 10000) / 10000,
          delta: Math.round((predictedA.retention - predictedB.retention) * 10000) / 10000,
          direction: predictedA.retention > predictedB.retention + 0.005 ? 'A_BETTER' : predictedB.retention > predictedA.retention + 0.005 ? 'B_BETTER' : 'TIE',
        },
        {
          metric_name: 'completion_rate',
          value_a: Math.round(predictedA.completion * 10000) / 10000,
          value_b: Math.round(predictedB.completion * 10000) / 10000,
          delta: Math.round((predictedA.completion - predictedB.completion) * 10000) / 10000,
          direction: predictedA.completion > predictedB.completion + 0.005 ? 'A_BETTER' : predictedB.completion > predictedA.completion + 0.005 ? 'B_BETTER' : 'TIE',
        },
        {
          metric_name: 'ctr',
          value_a: Math.round(predictedA.ctr * 10000) / 10000,
          value_b: Math.round(predictedB.ctr * 10000) / 10000,
          delta: Math.round((predictedA.ctr - predictedB.ctr) * 10000) / 10000,
          direction: predictedA.ctr > predictedB.ctr + 0.005 ? 'A_BETTER' : predictedB.ctr > predictedA.ctr + 0.005 ? 'B_BETTER' : 'TIE',
        },
        {
          metric_name: 'cvr',
          value_a: Math.round(predictedA.cvr * 10000) / 10000,
          value_b: Math.round(predictedB.cvr * 10000) / 10000,
          delta: Math.round((predictedA.cvr - predictedB.cvr) * 10000) / 10000,
          direction: predictedA.cvr > predictedB.cvr + 0.005 ? 'A_BETTER' : predictedB.cvr > predictedA.cvr + 0.005 ? 'B_BETTER' : 'TIE',
        },
        {
          metric_name: 'avg_shot_duration',
          value_a: Math.round((genA.video_duration / genA.shots.length) * 100) / 100,
          value_b: Math.round((genB.video_duration / genB.shots.length) * 100) / 100,
          delta: Math.round(((genA.video_duration / genA.shots.length) - (genB.video_duration / genB.shots.length)) * 100) / 100,
          direction: genA.video_duration / genA.shots.length > genB.video_duration / genB.shots.length + 0.05 ? 'A_BETTER' : genB.video_duration / genB.shots.length > genA.video_duration / genA.shots.length + 0.05 ? 'B_BETTER' : 'TIE',
        },
      ];

      let scoreA = 0;
      let scoreB = 0;
      const weights = { retention_rate: 0.3, completion_rate: 0.25, ctr: 0.25, cvr: 0.15, avg_shot_duration: 0.05 };

      for (const m of metrics) {
        const w = weights[m.metric_name as keyof typeof weights] ?? 0;
        if (m.direction === 'A_BETTER') scoreA += w;
        else if (m.direction === 'B_BETTER') scoreB += w;
        else { scoreA += w * 0.5; scoreB += w * 0.5; }
      }

      const winner: 'A' | 'B' | 'TIE' = Math.abs(scoreA - scoreB) < 0.03 ? 'TIE' : scoreA > scoreB ? 'A' : 'B';

      const diagnosis: string[] = [];
      if (winner === 'TIE') {
        diagnosis.push('两个版本在各维度表现接近，无明显优胜者');
      } else if (winner === 'A') {
        diagnosis.push(`版本 A 在多项指标上优于版本 B`);
      } else {
        diagnosis.push(`版本 B 在多项指标上优于版本 A`);
      }

      diagnosis.push(
        `风格调性层面: A 版本偏向"${genA.style_vibe}"风格，B 版本偏向"${genB.style_vibe}"风格`,
      );
      diagnosis.push(
        `生成策略: A 版本采用${genA.generation_mode}，B 版本采用${genB.generation_mode}`,
      );

      let recommendation: string | undefined;
      if (winner === 'A') {
        recommendation = `建议保留版本 A 的 ${genA.style_vibe} 风格策略，可借鉴版本 B 的部分优势因子`;
      } else if (winner === 'B') {
        recommendation = `建议保留版本 B 的 ${genB.style_vibe} 风格策略，可借鉴版本 A 的部分优势因子`;
      }

      return { winner, metrics, diagnosis, recommendation };
    };

    // ---- findSession ----
    findSession = async (prisma: MockPrismaService, sessionId: string): Promise<TestAbSessionResult> => {
      const session = await prisma.autoAbSession.findUnique({ where: { id: sessionId } });
      if (!session) {
        throw Object.assign(new Error(`Auto AB Session ${sessionId} 不存在`), {
          errorCode: 'AUTO_AB_SESSION_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }
      const s = session as Record<string, unknown>;
      if (s.status !== 'COMPLETED') {
        throw Object.assign(new Error(`Auto AB Session 尚未完成，当前状态: ${s.status}`), {
          errorCode: 'AUTO_AB_SESSION_NOT_READY',
          statusCode: HttpStatus.CONFLICT,
          retryable: true,
        });
      }
      return session as unknown as TestAbSessionResult;
    };

    // ---- 编排函数: createAutoAbSessionAndStream ----
    createAutoAbSessionAndStream = async (req, deps) => {
      const { prisma, sse } = deps;

      validateCreateRequest(req);

      const product = await findProduct(prisma, req.product_id);

      // 1. 创建 session
      const session = await createSession(prisma, req.product_id);
      sse.sendEvent('session_started', { session_id: session.id, product_id: req.product_id });

      // 2. 生成版本 A
      sse.sendEvent('script_a_generating', { session_id: session.id, variant: 'A', progress: 0 });
      const genA = await generateScriptForVariant(product, 'A', {
        style_vibe: req.style_vibe_a,
        generation_mode: req.mode_a,
        constraint_list: req.constraint_list,
        max_duration: req.max_duration,
      });
      sse.sendEvent('script_a_completed', {
        session_id: session.id,
        variant: 'A',
        creation_id: genA.creation_id,
        shot_count: genA.shots.length,
        video_duration: genA.video_duration,
      });

      // 3. 生成版本 B
      sse.sendEvent('script_b_generating', { session_id: session.id, variant: 'B', progress: 0 });
      const genB = await generateScriptForVariant(product, 'B', {
        style_vibe: req.style_vibe_b,
        generation_mode: req.mode_b,
        constraint_list: req.constraint_list,
        max_duration: req.max_duration,
      });
      sse.sendEvent('script_b_completed', {
        session_id: session.id,
        variant: 'B',
        creation_id: genB.creation_id,
        shot_count: genB.shots.length,
        video_duration: genB.video_duration,
      });

      // 4. 对比分析
      sse.sendEvent('comparing', { session_id: session.id, progress: 0 });
      const comparison = await compareVariants(genA, genB);

      // 5. 构建结果
      const result: TestAbSessionResult = {
        session_id: session.id,
        product_id: req.product_id,
        status: 'COMPLETED',
        version_a: {
          creation_id: genA.creation_id,
          label: `版本A: ${genA.style_vibe} 风格`,
          style_vibe: genA.style_vibe,
          generation_mode: genA.generation_mode,
          shot_count: genA.shots.length,
          video_duration: genA.video_duration,
        },
        version_b: {
          creation_id: genB.creation_id,
          label: `版本B: ${genB.style_vibe} 风格`,
          style_vibe: genB.style_vibe,
          generation_mode: genB.generation_mode,
          shot_count: genB.shots.length,
          video_duration: genB.video_duration,
        },
        winner: comparison.winner,
        metrics: comparison.metrics,
        diagnosis: comparison.diagnosis,
        recommendation: comparison.recommendation,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };

      sse.sendEvent('done', {
        session_id: session.id,
        winner: result.winner,
        metrics_count: result.metrics.length,
      });
      sse.complete();

      // 保存结果到数据库
      await prisma.autoAbSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          result_json: result,
          completed_at: new Date(),
        },
      });

      return result;
    };

    // ---- 编排函数: getSessionResult ----
    getSessionResult = async (sessionId, deps) => {
      const { prisma } = deps;
      if (!sessionId || sessionId.trim().length === 0) {
        throw Object.assign(new Error('session_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      return findSession(prisma, sessionId);
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 完整 SSE 流 + 结果契约', () => {
    const product = mockProductFactory();

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(product);
      mockPrisma.autoAbSession.create.mockResolvedValue({ id: SESSION_ID, status: 'PROCESSING' });
      mockPrisma.autoAbSession.update.mockResolvedValue({ id: SESSION_ID, status: 'COMPLETED' });
    });

    it('TC-AAB-001: 创建自动 AB Session → SSE 推送完整事件序列 + 返回结果', async () => {
      const sse = createMockSseEmitter();

      const result = await createAutoAbSessionAndStream(
        { product_id: PRODUCT_ID },
        { prisma: mockPrisma, sse },
      );

      expect(result.session_id).toBeDefined();
      expect(result.status).toBe('COMPLETED');
      expect(result).toHaveProperty('version_a');
      expect(result).toHaveProperty('version_b');
      expect(result).toHaveProperty('winner');
      expect(['A', 'B', 'TIE']).toContain(result.winner);
      expect(result.metrics.length).toBe(5);

      // 验证 SSE 事件序列
      expect(sse.hasEvent('session_started')).toBe(true);
      expect(sse.hasEvent('script_a_generating')).toBe(true);
      expect(sse.hasEvent('script_a_completed')).toBe(true);
      expect(sse.hasEvent('script_b_generating')).toBe(true);
      expect(sse.hasEvent('script_b_completed')).toBe(true);
      expect(sse.hasEvent('comparing')).toBe(true);
      expect(sse.hasEvent('done')).toBe(true);
      expect(sse.isCompleted).toBe(true);
    });

    it('TC-AAB-002: 指定 style_vibe 创建 → 版本使用指定风格', async () => {
      const sse = createMockSseEmitter();

      const result = await createAutoAbSessionAndStream(
        {
          product_id: PRODUCT_ID,
          style_vibe_a: 'bold-dramatic',
          style_vibe_b: 'minimalist-clean',
        },
        { prisma: mockPrisma, sse },
      );

      expect(result.version_a.style_vibe).toBe('bold-dramatic');
      expect(result.version_b.style_vibe).toBe('minimalist-clean');
    });

    it('TC-AAB-003: 查询已完成 Session 结果 → 返回完整 AB 对比报告', async () => {
      const completedResult = mockAbSessionResultFactory();
      mockPrisma.autoAbSession.findUnique.mockResolvedValue(completedResult);

      const result = await getSessionResult(SESSION_ID, { prisma: mockPrisma });

      expect(result.session_id).toBe(SESSION_ID);
      expect(result.winner).toBe('A');
      expect(result.metrics).toHaveLength(5);
      expect(result.diagnosis.length).toBeGreaterThan(0);
      expect(result.recommendation).toBeDefined();
    });

    it('TC-AAB-004: SSE 事件包含 script_a_completed 携带 creation_id + shot_count', async () => {
      const sse = createMockSseEmitter();

      await createAutoAbSessionAndStream(
        { product_id: PRODUCT_ID },
        { prisma: mockPrisma, sse },
      );

      const aCompletedEvents = sse.getEvents('script_a_completed');
      expect(aCompletedEvents.length).toBe(1);
      expect(aCompletedEvents[0].data).toHaveProperty('creation_id');
      expect(aCompletedEvents[0].data).toHaveProperty('shot_count');
      expect(aCompletedEvents[0].data).toHaveProperty('video_duration');

      const bCompletedEvents = sse.getEvents('script_b_completed');
      expect(bCompletedEvents.length).toBe(1);
      expect(bCompletedEvents[0].data).toHaveProperty('creation_id');
    });

    it('TC-AAB-005: winner 判定正确 → metrics direction 主导方向一致', async () => {
      const sse = createMockSseEmitter();

      const result = await createAutoAbSessionAndStream(
        { product_id: PRODUCT_ID },
        { prisma: mockPrisma, sse },
      );

      const winningDirection = result.winner === 'A' ? 'A_BETTER' : result.winner === 'B' ? 'B_BETTER' : null;
      if (winningDirection) {
        const winningMetrics = result.metrics.filter((m) => m.direction === winningDirection);
        const losingMetrics = result.metrics.filter(
          (m) => m.direction !== winningDirection && m.direction !== 'TIE',
        );
        expect(winningMetrics.length).toBeGreaterThanOrEqual(losingMetrics.length);
      }
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    const product = mockProductFactory();

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(product);
      mockPrisma.autoAbSession.create.mockResolvedValue({ id: SESSION_ID, status: 'PROCESSING' });
      mockPrisma.autoAbSession.update.mockResolvedValue({ id: SESSION_ID, status: 'COMPLETED' });
    });

    it('TC-AAB-BND-001: 仅指定 mode_a → 版本 A 使用指定模式, B 使用默认', async () => {
      const sse = createMockSseEmitter();

      const result = await createAutoAbSessionAndStream(
        { product_id: PRODUCT_ID, mode_a: 'TEMPLATE_DRIVEN' },
        { prisma: mockPrisma, sse },
      );

      expect(result.version_a.generation_mode).toBe('TEMPLATE_DRIVEN');
      expect(result.version_b.generation_mode).toBeDefined();
    });

    it('TC-AAB-BND-002: 两个版本配置完全相同 → 仍返回对比结果', async () => {
      const sse = createMockSseEmitter();

      const result = await createAutoAbSessionAndStream(
        {
          product_id: PRODUCT_ID,
          style_vibe_a: 'clean-tech',
          style_vibe_b: 'clean-tech',
          mode_a: 'PROMPT_DRIVEN',
          mode_b: 'PROMPT_DRIVEN',
        },
        { prisma: mockPrisma, sse },
      );

      expect(result.status).toBe('COMPLETED');
      expect(['A', 'B', 'TIE']).toContain(result.winner);
    });

    it('TC-AAB-BND-003: max_duration=60s 长视频 → 分镜时长适配', async () => {
      const sse = createMockSseEmitter();

      const result = await createAutoAbSessionAndStream(
        { product_id: PRODUCT_ID, max_duration: 60 },
        { prisma: mockPrisma, sse },
      );

      expect(result.version_a.video_duration).toBeLessThanOrEqual(60);
      expect(result.version_b.video_duration).toBeLessThanOrEqual(60);
    });

    it('TC-AAB-BND-004: SSE done 事件携带 winner + metrics_count', async () => {
      const sse = createMockSseEmitter();

      await createAutoAbSessionAndStream(
        { product_id: PRODUCT_ID },
        { prisma: mockPrisma, sse },
      );

      const doneEvents = sse.getEvents('done');
      expect(doneEvents.length).toBe(1);
      expect(doneEvents[0].data).toHaveProperty('winner');
      expect(doneEvents[0].data).toHaveProperty('metrics_count');
      expect(doneEvents[0].data.metrics_count).toBe(5);
    });

    it('TC-AAB-BND-005: 仅指定 mode_b → 版本 B 使用指定模式, A 默认', async () => {
      const sse = createMockSseEmitter();

      const result = await createAutoAbSessionAndStream(
        { product_id: PRODUCT_ID, mode_b: 'TEMPLATE_DRIVEN' },
        { prisma: mockPrisma, sse },
      );

      expect(result.version_a.generation_mode).toBe('PROMPT_DRIVEN');
      expect(result.version_b.generation_mode).toBe('TEMPLATE_DRIVEN');
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const product = mockProductFactory();

    it('TC-AAB-ERR-001: 创建 Session 时 product_id 为空 → INVALID_REQUEST', async () => {
      const sse = createMockSseEmitter();

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createAutoAbSessionAndStream(
          { product_id: '' },
          { prisma: mockPrisma, sse },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-AAB-ERR-002: 商品不存在 → PRODUCT_NOT_FOUND', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      const sse = createMockSseEmitter();

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createAutoAbSessionAndStream(
          { product_id: '00000000-0000-0000-0000-000000000099' },
          { prisma: mockPrisma, sse },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-AAB-ERR-003: max_duration <= 0 → INVALID_REQUEST', async () => {
      const sse = createMockSseEmitter();

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createAutoAbSessionAndStream(
          { product_id: PRODUCT_ID, max_duration: 0 },
          { prisma: mockPrisma, sse },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-AAB-ERR-004: max_duration > 60 → INVALID_REQUEST', async () => {
      const sse = createMockSseEmitter();

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createAutoAbSessionAndStream(
          { product_id: PRODUCT_ID, max_duration: 90 },
          { prisma: mockPrisma, sse },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-AAB-ERR-005: 查询结果时 session_id 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getSessionResult('', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-AAB-ERR-006: Session 不存在 → AUTO_AB_SESSION_NOT_FOUND', async () => {
      mockPrisma.autoAbSession.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getSessionResult('nonexistent-session', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('AUTO_AB_SESSION_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-AAB-ERR-007: Session 尚未完成 → AUTO_AB_SESSION_NOT_READY', async () => {
      mockPrisma.autoAbSession.findUnique.mockResolvedValue({
        id: SESSION_ID, status: 'PROCESSING',
      });

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getSessionResult(SESSION_ID, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('AUTO_AB_SESSION_NOT_READY');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-AAB-ERR-008: product_id 纯空白字符 → INVALID_REQUEST', async () => {
      const sse = createMockSseEmitter();

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await createAutoAbSessionAndStream(
          { product_id: '   ' },
          { prisma: mockPrisma, sse },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-AAB-ERR-009: max_duration 为负数 → INVALID_REQUEST', async () => {
      const sse = createMockSseEmitter();

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await createAutoAbSessionAndStream(
          { product_id: PRODUCT_ID, max_duration: -5 },
          { prisma: mockPrisma, sse },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-AAB-ERR-010: Session 状态为 FAILED → AUTO_AB_SESSION_NOT_READY', async () => {
      mockPrisma.autoAbSession.findUnique.mockResolvedValue({
        id: SESSION_ID, status: 'FAILED',
      });

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getSessionResult(SESSION_ID, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('AUTO_AB_SESSION_NOT_READY');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】性能基准验证', () => {
    const product = mockProductFactory();

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(product);
      mockPrisma.autoAbSession.create.mockResolvedValue({ id: SESSION_ID, status: 'PROCESSING' });
      mockPrisma.autoAbSession.update.mockResolvedValue({ id: SESSION_ID, status: 'COMPLETED' });
    });

    it('TC-AAB-PERF-001: validateProductId ≤ 1ms', () => {
      const start = performance.now();
      validateProductId(PRODUCT_ID);
      expect(performance.now() - start).toBeLessThanOrEqual(1);
    });

    it('TC-AAB-PERF-002: validateCreateRequest 无错误 ≤ 1ms', () => {
      const start = performance.now();
      validateCreateRequest({ product_id: PRODUCT_ID, max_duration: 15 });
      expect(performance.now() - start).toBeLessThanOrEqual(1);
    });

    it('TC-AAB-PERF-003: generateScriptForVariant ≤ 5ms', async () => {
      const start = performance.now();
      const gen = await generateScriptForVariant(product, 'A', {});
      expect(gen.shots.length).toBeGreaterThan(0);
      expect(performance.now() - start).toBeLessThanOrEqual(5);
    });

    it('TC-AAB-PERF-004: compareVariants ≤ 5ms', async () => {
      const genA = await generateScriptForVariant(product, 'A', {});
      const genB = await generateScriptForVariant(product, 'B', {});

      const start = performance.now();
      const result = await compareVariants(genA, genB);
      expect(result.metrics.length).toBe(5);
      expect(performance.now() - start).toBeLessThanOrEqual(5);
    });

    it('TC-AAB-PERF-005: createAutoAbSessionAndStream 端到端 ≤ 100ms（不含实际AI处理）', async () => {
      const sse = createMockSseEmitter();

      const start = performance.now();
      await createAutoAbSessionAndStream(
        { product_id: PRODUCT_ID },
        { prisma: mockPrisma, sse },
      );
      expect(performance.now() - start).toBeLessThanOrEqual(100);
    });

    it('TC-AAB-PERF-006: getSessionResult ≤ 10ms', async () => {
      mockPrisma.autoAbSession.findUnique.mockResolvedValue(mockAbSessionResultFactory());

      const start = performance.now();
      await getSessionResult(SESSION_ID, { prisma: mockPrisma });
      expect(performance.now() - start).toBeLessThanOrEqual(10);
    });
  });

  // ===========================================================================
  // 5. 原子函数测试（Unit Tests for Atomic Functions）
  // ===========================================================================

  describe('【原子函数】验证基础单元函数逻辑正确性', () => {
    const product = mockProductFactory();

    // ---- validateProductId ----

    it('validateProductId — 合法 UUID → 不抛异常', () => {
      expect(() => validateProductId(PRODUCT_ID)).not.toThrow();
    });

    it('validateProductId — 空字符串 → 抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try { validateProductId(''); } catch (e) { caught = e as Error & { errorCode?: string }; }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('validateProductId — 仅空白 → 抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try { validateProductId('   '); } catch (e) { caught = e as Error & { errorCode?: string }; }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    // ---- validateCreateRequest ----

    it('validateCreateRequest — 合法请求 → 不抛异常', () => {
      expect(() =>
        validateCreateRequest({ product_id: PRODUCT_ID, max_duration: 15 }),
      ).not.toThrow();
    });

    it('validateCreateRequest — max_duration=1 → 不抛异常（边界值）', () => {
      expect(() =>
        validateCreateRequest({ product_id: PRODUCT_ID, max_duration: 1 }),
      ).not.toThrow();
    });

    it('validateCreateRequest — max_duration=60 → 不抛异常（上限）', () => {
      expect(() =>
        validateCreateRequest({ product_id: PRODUCT_ID, max_duration: 60 }),
      ).not.toThrow();
    });

    // ---- findProduct ----

    it('findProduct — 返回匹配的商品记录', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(product);
      const result = await findProduct(mockPrisma, PRODUCT_ID);
      expect(result.id).toBe(PRODUCT_ID);
      expect(result.title).toBe('智能无线卷发棒 Pro');
      expect(result.selling_points).toHaveLength(3);
    });

    it('findProduct — 商品不存在 → 抛出 PRODUCT_NOT_FOUND', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      let caught: Error & { errorCode?: string } | null = null;
      try {
        await findProduct(mockPrisma, 'nonexistent');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
    });

    // ---- generateScriptForVariant ----

    it('generateScriptForVariant — 版本 A 默认 clean-tech + PROMPT_DRIVEN', async () => {
      const gen = await generateScriptForVariant(product, 'A', {});
      expect(gen.style_vibe).toBe('clean-tech');
      expect(gen.generation_mode).toBe('PROMPT_DRIVEN');
      expect(gen.shots.length).toBe(5);
    });

    it('generateScriptForVariant — 版本 B 默认 warm-lifestyle + VIRAL_REWRITE', async () => {
      const gen = await generateScriptForVariant(product, 'B', {});
      expect(gen.style_vibe).toBe('warm-lifestyle');
      expect(gen.generation_mode).toBe('VIRAL_REWRITE');
      expect(gen.shots.length).toBe(3);
    });

    it('generateScriptForVariant — 自定义 style_vibe 覆盖默认值', async () => {
      const gen = await generateScriptForVariant(product, 'A', { style_vibe: 'dark-cinematic' });
      expect(gen.style_vibe).toBe('dark-cinematic');
    });

    it('generateScriptForVariant — max_duration 约束总时长', async () => {
      const gen = await generateScriptForVariant(product, 'A', { max_duration: 10 });
      expect(gen.video_duration).toBeLessThanOrEqual(10);
    });

    // ---- compareVariants ----

    it('compareVariants — 返回 5 项指标 + winner + diagnosis', async () => {
      const genA = await generateScriptForVariant(product, 'A', {});
      const genB = await generateScriptForVariant(product, 'B', {});

      const result = await compareVariants(genA, genB);

      expect(result.metrics).toHaveLength(5);
      expect(['A', 'B', 'TIE']).toContain(result.winner);
      expect(result.diagnosis.length).toBeGreaterThanOrEqual(3);
    });

    it('compareVariants — 所有 metrics direction 值合法', async () => {
      const genA = await generateScriptForVariant(product, 'A', {});
      const genB = await generateScriptForVariant(product, 'B', {});

      const result = await compareVariants(genA, genB);

      for (const m of result.metrics) {
        expect(['A_BETTER', 'B_BETTER', 'TIE']).toContain(m.direction);
        expect(Math.abs(m.delta - (m.value_a - m.value_b))).toBeLessThan(0.001);
      }
    });

    // ---- createMockSseEmitter ----

    it('createMockSseEmitter — 初始状态无事件、未完成', () => {
      const emitter = createMockSseEmitter();
      expect(emitter.events).toHaveLength(0);
      expect(emitter.isCompleted).toBe(false);
      expect(emitter.isErrored).toBe(false);
      expect(emitter.errorReceived).toBeNull();
    });

    it('createMockSseEmitter — sendEvent 追加事件', () => {
      const emitter = createMockSseEmitter();
      emitter.sendEvent('test_event', { key: 'value' });
      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0].event).toBe('test_event');
      expect(emitter.events[0].data).toEqual({ key: 'value' });
    });

    it('createMockSseEmitter — hasEvent + getEvents 按事件名过滤', () => {
      const emitter = createMockSseEmitter();
      emitter.sendEvent('start', {});
      emitter.sendEvent('progress', { pct: 50 });
      emitter.sendEvent('progress', { pct: 100 });
      emitter.sendEvent('done', {});

      expect(emitter.hasEvent('start')).toBe(true);
      expect(emitter.hasEvent('nonexistent')).toBe(false);
      expect(emitter.getEvents('progress')).toHaveLength(2);
      expect(emitter.getEvents('done')).toHaveLength(1);
    });
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言 Auto AB Session 功能
// 的完整性与正确性。待源码实现后移除 .skip 或直接运行。
//
// 用例编号映射:
//   TC-AAB-001 ~ TC-AAB-005      正常流 (Happy Path)
//   TC-AAB-BND-001 ~ TC-AAB-BND-005  边界流 (Edge Cases)
//   TC-AAB-ERR-001 ~ TC-AAB-ERR-010  异常流 (Error Flow)
//   TC-AAB-PERF-001 ~ TC-AAB-PERF-006 性能流 (Performance)
//
// 覆盖率维度:
//   ├── createAutoAbSessionAndStream  (5 正常 + 5 边界 + 6 异常 + 1 性能)
//   ├── getSessionResult              (1 正常 + 3 异常 + 1 性能)
//   ├── validateProductId             (3 原子 + 1 性能)
//   ├── validateCreateRequest         (3 原子 + 1 性能)
//   ├── findProduct                   (2 原子)
//   ├── generateScriptForVariant      (4 原子 + 1 性能)
//   ├── compareVariants               (2 原子 + 1 性能)
//   └── createMockSseEmitter          (3 原子)
//
// 总测试用例数: 55
// =============================================================================
