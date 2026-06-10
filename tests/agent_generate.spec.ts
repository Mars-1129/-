// =============================================================================
// TikStream AI — Agent Generate 自动化测试基座
// 对应功能: POST /api/v1/agents/generate (Agent 7节点工作流剧本生成, SSE 进度推送)
// 对应模块: Agent (人员B) | 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// =============================================================================
// 0. 测试专用类型定义
// =============================================================================

type AgentNodeType =
  | 'PRODUCT_ANALYZER'
  | 'STRATEGY_PLANNER'
  | 'SHOT_SCRIPT_GENERATOR'
  | 'COMPLIANCE_CHECKER'
  | 'TIMING_OPTIMIZER'
  | 'RENDER_PROMPT_WRITER'
  | 'FINAL_AGGREGATOR';

type AgentNodeStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

interface TestAgentNode {
  node_key: AgentNodeType;
  display_name: string;
  status: AgentNodeStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  node_output?: Record<string, unknown>;
  error?: string | null;
}

interface TestShotPayload {
  shot_index: number;
  duration: number;
  scene_description_query: string;
  visual_description: string;
  camera_movement: string;
  transition_type: string;
  voiceover_text: string;
  subtitle_text: string;
  safe_zone_bounding_box: [number, number, number, number];
  compliance_status: string;
}

interface TestAgentGenerateRequest {
  product_id: string;
  template_id?: string | null;
  language?: string;
  target_audience?: string | null;
  style_vibe?: string;
  aspect_ratio?: string;
  constraint_list?: string[];
}

interface TestAgentGenerateResponse {
  agent_id: string;
  product_id: string;
  script_id: string | null;
  status: 'COMPLETED' | 'FAILED' | 'RUNNING';
  nodes: TestAgentNode[];
  shots: TestShotPayload[];
  total_duration_ms: number;
  video_duration: number;
  created_at: string;
  completed_at: string;
}

interface TestProduct {
  id: string;
  title: string;
  sku_code: string;
  category: string;
  selling_points: string[];
  target_audience: string | null;
  scenario_tags: string[];
  text_features: Record<string, unknown>;
  cover_image_url: string | null;
  created_at: Date;
  updated_at: Date;
}

type MockPrismaService = {
  product: { findUnique: jest.Mock };
  script: { create: jest.Mock; findUnique: jest.Mock };
  scriptShot: { createMany: jest.Mock };
  agentRun: { create: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

// =============================================================================
// 常量
// =============================================================================

const NOW = new Date('2026-06-02T12:00:00Z');
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const AGENT_RUN_ID = 'agr_dc52d4ff_20260602_001';

const AGENT_7_NODE_PIPELINE: TestAgentNode[] = [
  { node_key: 'PRODUCT_ANALYZER', display_name: '商品分析器', status: 'COMPLETED', started_at: '2026-06-02T12:00:00Z', completed_at: '2026-06-02T12:00:15Z', duration_ms: 1500 },
  { node_key: 'STRATEGY_PLANNER', display_name: '策略规划器', status: 'COMPLETED', started_at: '2026-06-02T12:00:15Z', completed_at: '2026-06-02T12:00:45Z', duration_ms: 3000 },
  { node_key: 'SHOT_SCRIPT_GENERATOR', display_name: '分镜脚本生成器', status: 'COMPLETED', started_at: '2026-06-02T12:00:45Z', completed_at: '2026-06-02T12:01:30Z', duration_ms: 4500 },
  { node_key: 'COMPLIANCE_CHECKER', display_name: '合规检查器', status: 'COMPLETED', started_at: '2026-06-02T12:01:30Z', completed_at: '2026-06-02T12:01:45Z', duration_ms: 1500 },
  { node_key: 'TIMING_OPTIMIZER', display_name: '时长优化器', status: 'COMPLETED', started_at: '2026-06-02T12:01:45Z', completed_at: '2026-06-02T12:02:05Z', duration_ms: 2000 },
  { node_key: 'RENDER_PROMPT_WRITER', display_name: '渲染提示词编写器', status: 'COMPLETED', started_at: '2026-06-02T12:02:05Z', completed_at: '2026-06-02T12:02:35Z', duration_ms: 3000 },
  { node_key: 'FINAL_AGGREGATOR', display_name: '最终聚合器', status: 'COMPLETED', started_at: '2026-06-02T12:02:35Z', completed_at: '2026-06-02T12:02:50Z', duration_ms: 1500 },
];

const AGENT_NODE_ORDER: AgentNodeType[] = [
  'PRODUCT_ANALYZER', 'STRATEGY_PLANNER', 'SHOT_SCRIPT_GENERATOR',
  'COMPLIANCE_CHECKER', 'TIMING_OPTIMIZER', 'RENDER_PROMPT_WRITER', 'FINAL_AGGREGATOR',
];

// =============================================================================
// Mock Factories
// =============================================================================

const mockProductFactory = (overrides?: Partial<TestProduct>): TestProduct => ({
  id: PRODUCT_ID,
  title: '智能无线卷发棒 Pro',
  sku_code: 'SKU-HB-PRO-001',
  category: 'Beauty/PersonalCare',
  selling_points: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
  target_audience: '北美年轻女性,25-35岁',
  scenario_tags: ['日常造型', '出差便携', '节日送礼'],
  text_features: {},
  cover_image_url: 'https://minio.local/products/cover_001.jpg',
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mock5ShotsPayloadFactory = (): TestShotPayload[] =>
  [1, 2, 3, 4, 5].map((i) => ({
    shot_index: i,
    duration: i === 1 ? 3.0 : i === 2 ? 3.5 : i === 3 ? 4.0 : i === 4 ? 2.0 : 2.0,
    scene_description_query: `close-up shot ${i} of product feature`,
    visual_description: `镜头${i}：展示产品核心功能，画面干净明亮。`,
    camera_movement: i === 1 ? 'Dolly_In_Fast' : i === 2 ? 'Pan_Left' : i === 3 ? 'Tilt_Up' : 'Static',
    transition_type: i === 1 ? 'Fade_In' : i === 2 ? 'Dissolve' : i === 3 ? 'Wipe' : 'None',
    voiceover_text: `第${i}段旁白：产品核心卖点生动表达。`,
    subtitle_text: `字幕${i}`,
    safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9],
    compliance_status: 'PASSED',
  }));

const mockPrismaServiceFactory = (): MockPrismaService => {
  const client = {
    product: { findUnique: jest.fn() },
    script: { create: jest.fn(), findUnique: jest.fn() },
    scriptShot: { createMany: jest.fn() },
    agentRun: { create: jest.fn(), update: jest.fn() },
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

describe('AgentGenerate — Agent 7节点剧本生成 (SSE 进度)', () => {
  let mockPrisma: MockPrismaService;

  // ---- 原子函数类型声明 ----

  let validateGenerateRequest: (dto: TestAgentGenerateRequest) => void;
  let buildPipelineNodes: () => TestAgentNode[];
  let executeNode: (
    nodeKey: AgentNodeType,
    context: Record<string, unknown>,
  ) => Promise<{ output: Record<string, unknown>; durationMs: number }>;
  let validateNodeOutput: (
    nodeKey: AgentNodeType,
    output: Record<string, unknown>,
  ) => { valid: boolean; errors: string[] };
  let aggregateFinalResult: (
    nodeOutputs: Map<AgentNodeType, Record<string, unknown>>,
  ) => { shots: TestShotPayload[]; videoDuration: number; styleVibe: string };
  let checkCompliance: (
    shots: TestShotPayload[],
  ) => { passed: boolean; violations: Array<{ shot_index: number; reason: string }> };

  // ---- SSE Emitter mock ----
  type SseCallback = (event: string, data: Record<string, unknown>) => void;
  let createMockSseEmitter: () => { emit: jest.Mock<SseCallback>; calls: Array<{ event: string; data: Record<string, unknown> }> };

  // ---- 编排函数 ----
  let generateWithAgent: (
    dto: TestAgentGenerateRequest,
    deps: {
      prisma: MockPrismaService;
      sseEmit: SseCallback;
    },
  ) => Promise<TestAgentGenerateResponse>;

  beforeAll(() => {
    // ---- validateGenerateRequest ----
    validateGenerateRequest = (dto: TestAgentGenerateRequest) => {
      if (!dto.product_id || dto.product_id.trim().length === 0) {
        throw Object.assign(new Error('product_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }
    };

    // ---- buildPipelineNodes ----
    buildPipelineNodes = (): TestAgentNode[] => {
      return AGENT_NODE_ORDER.map((key) => ({
        node_key: key,
        display_name: key.replace(/_/g, ' ').toLowerCase(),
        status: 'PENDING' as AgentNodeStatus,
        started_at: null,
        completed_at: null,
        duration_ms: null,
      }));
    };

    // ---- executeNode (mock) ----
    executeNode = async (
      nodeKey: AgentNodeType,
      _context: Record<string, unknown>,
    ): Promise<{ output: Record<string, unknown>; durationMs: number }> => {
      const mockDurations: Record<string, number> = {
        PRODUCT_ANALYZER: 1500,
        STRATEGY_PLANNER: 3000,
        SHOT_SCRIPT_GENERATOR: 4500,
        COMPLIANCE_CHECKER: 1500,
        TIMING_OPTIMIZER: 2000,
        RENDER_PROMPT_WRITER: 3000,
        FINAL_AGGREGATOR: 1500,
      };

      const mockOutputs: Record<string, Record<string, unknown>> = {
        PRODUCT_ANALYZER: { selling_points: ['智能控温', '快充'], category_tags: ['Beauty', 'Tech'] },
        STRATEGY_PLANNER: { hook_strategy: 'visual_hook', pacing_plan: 'fast-slow-fast' },
        SHOT_SCRIPT_GENERATOR: { shots: mock5ShotsPayloadFactory() },
        COMPLIANCE_CHECKER: { passed: true, violations: [] },
        TIMING_OPTIMIZER: { adjusted_shots: mock5ShotsPayloadFactory() },
        RENDER_PROMPT_WRITER: { render_prompts: ['prompt_1', 'prompt_2'] },
        FINAL_AGGREGATOR: { final_shots: mock5ShotsPayloadFactory(), video_duration: 14.5, style_vibe: 'clean-tech' },
      };

      // 模拟真实 I/O 延迟，确保 Date.now() 能体现时间差异
      await new Promise((resolve) => setTimeout(resolve, 1));

      return {
        output: mockOutputs[nodeKey] || { result: 'mock_output' },
        durationMs: mockDurations[nodeKey] || 1000,
      };
    };

    // ---- validateNodeOutput ----
    validateNodeOutput = (nodeKey: AgentNodeType, output: Record<string, unknown>) => {
      const errors: string[] = [];
      const required: Record<string, string[]> = {
        PRODUCT_ANALYZER: ['selling_points', 'category_tags'],
        STRATEGY_PLANNER: ['hook_strategy', 'pacing_plan'],
        SHOT_SCRIPT_GENERATOR: ['shots'],
        COMPLIANCE_CHECKER: ['passed', 'violations'],
        TIMING_OPTIMIZER: ['adjusted_shots'],
        RENDER_PROMPT_WRITER: ['render_prompts'],
        FINAL_AGGREGATOR: ['final_shots', 'video_duration', 'style_vibe'],
      };

      const fields = required[nodeKey] || [];
      for (const field of fields) {
        if (!(field in output)) {
          errors.push(`节点 ${nodeKey} 缺少输出字段: ${field}`);
        }
      }

      if (nodeKey === 'SHOT_SCRIPT_GENERATOR') {
        const shots = output.shots as Array<Record<string, unknown>> | undefined;
        if (shots && shots.length === 0) {
          errors.push('SHOT_SCRIPT_GENERATOR 未生成任何分镜');
        }
      }

      return { valid: errors.length === 0, errors };
    };

    // ---- aggregateFinalResult ----
    aggregateFinalResult = (nodeOutputs: Map<AgentNodeType, Record<string, unknown>>) => {
      const shotsOutput = nodeOutputs.get('SHOT_SCRIPT_GENERATOR') || {};
      const finalOutput = nodeOutputs.get('FINAL_AGGREGATOR') || {};

      return {
        shots: (finalOutput.final_shots as TestShotPayload[]) ||
          (shotsOutput.shots as TestShotPayload[]) ||
          mock5ShotsPayloadFactory(),
        videoDuration: (finalOutput.video_duration as number) || 14.5,
        styleVibe: (finalOutput.style_vibe as string) || 'clean-tech',
      };
    };

    // ---- checkCompliance ----
    checkCompliance = (shots: TestShotPayload[]) => {
      const violations: Array<{ shot_index: number; reason: string }> = [];
      const prohibitedWords = ['最好', '第一', '全网', '唯一', '免费送', '限时抢购'];

      shots.forEach((shot) => {
        const text = `${shot.voiceover_text} ${shot.subtitle_text}`;
        for (const word of prohibitedWords) {
          if (text.includes(word)) {
            violations.push({
              shot_index: shot.shot_index,
              reason: `分镜 ${shot.shot_index} 含违规词: "${word}"`,
            });
          }
        }
      });

      return { passed: violations.length === 0, violations };
    };

    // ---- createMockSseEmitter ----
    createMockSseEmitter = () => {
      const calls: Array<{ event: string; data: Record<string, unknown> }> = [];
      const emit = jest.fn((event: string, data: Record<string, unknown>) => {
        calls.push({ event, data });
      }) as unknown as jest.Mock<SseCallback> & { calls: Array<{ event: string; data: Record<string, unknown> }> };
      (emit as Record<string, unknown>).calls = calls;
      return { emit: emit as jest.Mock<SseCallback>, calls };
    };

    // ---- generateWithAgent 编排函数 ----
    generateWithAgent = async (dto, deps) => {
      const { prisma, sseEmit } = deps;

      validateGenerateRequest(dto);

      const product = await prisma.product.findUnique({ where: { id: dto.product_id } });
      if (!product) {
        throw Object.assign(new Error(`商品 ${dto.product_id} 不存在`), {
          errorCode: 'PRODUCT_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
        });
      }

      const nodes = buildPipelineNodes();
      const startTime = Date.now();

      // 创建 AgentRun 记录
      sseEmit('agent.start', { agent_id: AGENT_RUN_ID, nodes: nodes.length });

      const nodeOutputs = new Map<AgentNodeType, Record<string, unknown>>();
      let hasFailed = false;

      for (const node of nodes) {
        // SSE: node.started
        node.status = 'RUNNING';
        node.started_at = new Date().toISOString();
        sseEmit('node.started', { agent_id: AGENT_RUN_ID, node_key: node.node_key, display_name: node.display_name });

        // 构建上下文
        const context: Record<string, unknown> = {
          product,
          selling_points: (product as TestProduct).selling_points,
          previous_outputs: Object.fromEntries(nodeOutputs),
        };

        try {
          const { output, durationMs } = await executeNode(node.node_key, context);
          const validation = validateNodeOutput(node.node_key, output);

          if (!validation.valid) {
            throw new Error(`节点输出校验失败: ${validation.errors.join('; ')}`);
          }

          nodeOutputs.set(node.node_key, output);
          node.status = 'COMPLETED';
          node.duration_ms = durationMs;
          node.node_output = output;
          node.completed_at = new Date().toISOString();

          sseEmit('node.completed', {
            agent_id: AGENT_RUN_ID,
            node_key: node.node_key,
            display_name: node.display_name,
            duration_ms: durationMs,
            status: 'COMPLETED',
          });
        } catch (error) {
          node.status = 'FAILED';
          node.error = (error as Error).message;
          node.completed_at = new Date().toISOString();
          hasFailed = true;

          sseEmit('node.failed', {
            agent_id: AGENT_RUN_ID,
            node_key: node.node_key,
            display_name: node.display_name,
            error: node.error,
          });
          break;
        }
      }

      const totalDurationMs = Date.now() - startTime;

      if (hasFailed) {
        sseEmit('agent.failed', { agent_id: AGENT_RUN_ID, error: 'Pipeline execution failed', total_duration_ms: totalDurationMs });
        return {
          agent_id: AGENT_RUN_ID,
          product_id: dto.product_id,
          script_id: null,
          status: 'FAILED',
          nodes,
          shots: [],
          total_duration_ms: totalDurationMs,
          video_duration: 0,
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        };
      }

      // 合规检查
      const aggregated = aggregateFinalResult(nodeOutputs);
      const complianceResult = checkCompliance(aggregated.shots);

      if (!complianceResult.passed) {
        sseEmit('agent.failed', {
          agent_id: AGENT_RUN_ID,
          error: `合规检查未通过: ${complianceResult.violations.map((v) => v.reason).join('; ')}`,
        });
        return {
          agent_id: AGENT_RUN_ID,
          product_id: dto.product_id,
          script_id: null,
          status: 'FAILED',
          nodes,
          shots: aggregated.shots,
          total_duration_ms: totalDurationMs,
          video_duration: aggregated.videoDuration,
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        };
      }

      const scriptId = 'dc52d4ff-0000-4000-a000-0000000000b1';

      sseEmit('agent.completed', {
        agent_id: AGENT_RUN_ID,
        script_id: scriptId,
        shots_count: aggregated.shots.length,
        video_duration: aggregated.videoDuration,
        total_duration_ms: totalDurationMs,
      });

      return {
        agent_id: AGENT_RUN_ID,
        product_id: dto.product_id,
        script_id: scriptId,
        status: 'COMPLETED',
        nodes,
        shots: aggregated.shots,
        total_duration_ms: totalDurationMs,
        video_duration: aggregated.videoDuration,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 7节点全流程完成', () => {
    const validRequest: TestAgentGenerateRequest = {
      product_id: PRODUCT_ID,
      template_id: null,
      language: 'zh-CN',
      target_audience: '北美年轻女性,25-35岁',
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
      constraint_list: ['total_duration<=15s'],
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
    });

    it('TC-AGN-GEN-001: Agent 全流程成功 → 返回 COMPLETED 状态及 7 个节点', async () => {
      const { emit: sseEmit, calls } = createMockSseEmitter();

      const result = await generateWithAgent(validRequest, {
        prisma: mockPrisma,
        sseEmit,
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.nodes).toHaveLength(7);
      expect(result.script_id).not.toBeNull();
      expect(result.shots.length).toBeGreaterThanOrEqual(4);
      expect(result.total_duration_ms).toBeGreaterThan(0);
    });

    it('TC-AGN-GEN-002: SSE 推送完整事件序列 (start → 7×started/completed → completed)', async () => {
      const { emit: sseEmit, calls } = createMockSseEmitter();

      await generateWithAgent(validRequest, { prisma: mockPrisma, sseEmit });

      const events = calls.map((c) => c.event);
      expect(events).toContain('agent.start');
      expect(events).toContain('agent.completed');
      expect(events.filter((e) => e === 'node.started').length).toBe(7);
      expect(events.filter((e) => e === 'node.completed').length).toBe(7);
    });

    it('TC-AGN-GEN-003: 每个节点的 SSE 事件包含 node_key 和 display_name', async () => {
      const { emit: sseEmit, calls } = createMockSseEmitter();

      await generateWithAgent(validRequest, { prisma: mockPrisma, sseEmit });

      const nodeCompletedCalls = calls.filter((c) => c.event === 'node.completed');
      nodeCompletedCalls.forEach((call) => {
        expect(call.data).toHaveProperty('node_key');
        expect(call.data).toHaveProperty('display_name');
        expect(call.data).toHaveProperty('duration_ms');
        expect(call.data.status).toBe('COMPLETED');
      });
    });

    it('TC-AGN-GEN-004: 返回的 nodes 全部为 COMPLETED 状态', async () => {
      const { emit: sseEmit } = createMockSseEmitter();

      const result = await generateWithAgent(validRequest, { prisma: mockPrisma, sseEmit });

      for (const node of result.nodes) {
        expect(node.status).toBe('COMPLETED');
        expect(node.started_at).not.toBeNull();
        expect(node.completed_at).not.toBeNull();
        expect(node.duration_ms).toBeGreaterThan(0);
      }
    });

    it('TC-AGN-GEN-005: 不传 template_id 时正常执行', async () => {
      const requestWithoutTemplate = { ...validRequest, template_id: undefined };
      const { emit: sseEmit } = createMockSseEmitter();

      const result = await generateWithAgent(requestWithoutTemplate, {
        prisma: mockPrisma,
        sseEmit,
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.nodes).toHaveLength(7);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
    });

    it('TC-AGN-GEN-BND-001: pipeline 恰好 7 个节点不增不减', () => {
      const nodes = buildPipelineNodes();
      expect(nodes).toHaveLength(7);
      const nodeKeys = nodes.map((n) => n.node_key);
      expect(nodeKeys).toEqual(AGENT_NODE_ORDER);
    });

    it('TC-AGN-GEN-BND-002: 节点顺序固定 PRODUCT_ANALYZER → STRATEGY_PLANNER → ... → FINAL_AGGREGATOR', () => {
      const nodes = buildPipelineNodes();
      expect(nodes[0].node_key).toBe('PRODUCT_ANALYZER');
      expect(nodes[1].node_key).toBe('STRATEGY_PLANNER');
      expect(nodes[6].node_key).toBe('FINAL_AGGREGATOR');
    });

    it('TC-AGN-GEN-BND-003: 空 constraint_list 正常工作', async () => {
      const { emit: sseEmit } = createMockSseEmitter();
      const result = await generateWithAgent(
        { product_id: PRODUCT_ID, constraint_list: [] },
        { prisma: mockPrisma, sseEmit },
      );

      expect(result.status).toBe('COMPLETED');
    });

    it('TC-AGN-GEN-BND-004: target_audience 为 null 正常工作', async () => {
      const { emit: sseEmit } = createMockSseEmitter();
      const result = await generateWithAgent(
        { product_id: PRODUCT_ID, target_audience: null },
        { prisma: mockPrisma, sseEmit },
      );

      expect(result.status).toBe('COMPLETED');
    });

    it('TC-AGN-GEN-BND-005: total_duration_ms 为实际耗时非零', async () => {
      const { emit: sseEmit } = createMockSseEmitter();
      const result = await generateWithAgent(
        { product_id: PRODUCT_ID },
        { prisma: mockPrisma, sseEmit },
      );

      expect(result.total_duration_ms).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    it('TC-AGN-GEN-ERR-001: product_id 缺失 → INVALID_REQUEST', async () => {
      const { emit: sseEmit } = createMockSseEmitter();

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateWithAgent(
          { product_id: '' },
          { prisma: mockPrisma, sseEmit },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-AGN-GEN-ERR-002: 商品不存在 → PRODUCT_NOT_FOUND', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      const { emit: sseEmit } = createMockSseEmitter();

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateWithAgent(
          { product_id: '99999999-9999-9999-9999-999999999999' },
          { prisma: mockPrisma, sseEmit },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-AGN-GEN-ERR-003: 节点输出缺少必填字段 → validateNodeOutput 不通过', () => {
      const result = validateNodeOutput('SHOT_SCRIPT_GENERATOR', { wrong_field: 'value' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('shots'))).toBe(true);
    });

    it('TC-AGN-GEN-ERR-004: SHOT_SCRIPT_GENERATOR 输出空 shots 数组 → 校验失败', () => {
      const result = validateNodeOutput('SHOT_SCRIPT_GENERATOR', { shots: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('未生成任何分镜'))).toBe(true);
    });

    it('TC-AGN-GEN-ERR-005: 所有节点输出校验通过 → valid=true', () => {
      for (const nodeKey of AGENT_NODE_ORDER) {
        const mockOutputs: Record<string, Record<string, unknown>> = {
          PRODUCT_ANALYZER: { selling_points: ['p1'], category_tags: ['tag1'] },
          STRATEGY_PLANNER: { hook_strategy: 'visual', pacing_plan: 'fast' },
          SHOT_SCRIPT_GENERATOR: { shots: [{ shot_index: 1, duration: 3.0 }] },
          COMPLIANCE_CHECKER: { passed: true, violations: [] },
          TIMING_OPTIMIZER: { adjusted_shots: [] },
          RENDER_PROMPT_WRITER: { render_prompts: [] },
          FINAL_AGGREGATOR: { final_shots: [], video_duration: 0, style_vibe: 'clean' },
        };
        const result = validateNodeOutput(nodeKey, mockOutputs[nodeKey] || {});
        expect(result.valid).toBe(true);
      }
    });

    it('TC-AGN-GEN-ERR-006: 合规检查含违规词 → passed=false', () => {
      const shots: TestShotPayload[] = [{
        shot_index: 1, duration: 3.0,
        scene_description_query: 'test', visual_description: 'test',
        camera_movement: 'Static', transition_type: 'None',
        voiceover_text: '这是最好的产品', subtitle_text: '全网第一',
        safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
        compliance_status: 'PASSED',
      }];

      const result = checkCompliance(shots);
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('TC-AGN-GEN-ERR-007: 合规检查全通过 → passed=true', () => {
      const shots: TestShotPayload[] = [{
        shot_index: 1, duration: 3.0,
        scene_description_query: 'test', visual_description: 'test',
        camera_movement: 'Static', transition_type: 'None',
        voiceover_text: '智能控温便携设计', subtitle_text: '品质好物',
        safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
        compliance_status: 'PASSED',
      }];

      const result = checkCompliance(shots);
      expect(result.passed).toBe(true);
      expect(result.violations.length).toBe(0);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance Flow）
  // ===========================================================================

  describe('【性能流】耗时卡点告警', () => {
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
    });

    it('TC-AGN-GEN-PERF-001: generateWithAgent 编排总耗时 ≤ 5000ms (mock)', async () => {
      const PERF_CEILING_MS = 5000;
      const { emit: sseEmit } = createMockSseEmitter();

      const start = performance.now();
      await generateWithAgent({ product_id: PRODUCT_ID }, { prisma: mockPrisma, sseEmit });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 10000);

    it('TC-AGN-GEN-PERF-002: validateNodeOutput 单节点 ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const start = performance.now();
      validateNodeOutput('FINAL_AGGREGATOR', { final_shots: [], video_duration: 14.5, style_vibe: 'clean' });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-AGN-GEN-PERF-003: buildPipelineNodes ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const start = performance.now();
      const nodes = buildPipelineNodes();
      const elapsed = performance.now() - start;
      expect(nodes).toHaveLength(7);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-AGN-GEN-PERF-004: checkCompliance (5 shots) ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;
      const shots = mock5ShotsPayloadFactory();
      const start = performance.now();
      const result = checkCompliance(shots);
      const elapsed = performance.now() - start;
      expect(result.passed).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-AGN-GEN-PERF-005: 连续 5 次 generateWithAgent 无退化', async () => {
      const ITERATIONS = 5;
      const PERF_CEILING_MS_PER_ITERATION = 200;
      const { emit: sseEmit } = createMockSseEmitter();

      const start = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        await generateWithAgent({ product_id: PRODUCT_ID }, { prisma: mockPrisma, sseEmit });
      }
      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 15000);
  });

  // ===========================================================================
  // 5. 独立原子函数测试
  // ===========================================================================

  describe('【原子函数】独立校验 validateNodeOutput / checkCompliance / aggregateFinalResult', () => {
    it('validateNodeOutput — FINAL_AGGREGATOR 缺少 final_shots → 报错', () => {
      const result = validateNodeOutput('FINAL_AGGREGATOR', { video_duration: 10 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('final_shots'))).toBe(true);
    });

    it('validateNodeOutput — STRATEGY_PLANNER 含所有必填 → 通过', () => {
      const result = validateNodeOutput('STRATEGY_PLANNER', {
        hook_strategy: 'visual_contrast',
        pacing_plan: 'fast-slow-fast',
      });
      expect(result.valid).toBe(true);
    });

    it('validateNodeOutput — COMPLIANCE_CHECKER 含 violations 数组 → 通过', () => {
      const result = validateNodeOutput('COMPLIANCE_CHECKER', {
        passed: false,
        violations: [{ shot_index: 1, violated_word: '最好', reason: '绝对化用语' }],
      });
      expect(result.valid).toBe(true);
    });

    it('aggregateFinalResult — 优先使用 FINAL_AGGREGATOR 输出', () => {
      const map = new Map<AgentNodeType, Record<string, unknown>>();
      map.set('SHOT_SCRIPT_GENERATOR', { shots: [{ shot_index: 1, duration: 2.0 }] });
      map.set('FINAL_AGGREGATOR', {
        final_shots: [{ shot_index: 1, duration: 3.0 }, { shot_index: 2, duration: 3.0 }],
        video_duration: 6.0,
        style_vibe: 'minimal',
      });

      const result = aggregateFinalResult(map);
      expect(result.shots).toHaveLength(2);
      expect(result.videoDuration).toBe(6.0);
      expect(result.styleVibe).toBe('minimal');
    });

    it('aggregateFinalResult — FINAL_AGGREGATOR 无输出时回退到 SHOT_SCRIPT_GENERATOR', () => {
      const map = new Map<AgentNodeType, Record<string, unknown>>();
      map.set('SHOT_SCRIPT_GENERATOR', {
        shots: [{ shot_index: 1, duration: 4.5 }, { shot_index: 2, duration: 5.0 }],
      });

      const result = aggregateFinalResult(map);
      expect(result.shots).toHaveLength(2);
    });

    it('checkCompliance — 跨多分镜检测所有违规词', () => {
      const shots: TestShotPayload[] = [
        { shot_index: 1, duration: 3.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: '最好的产品', subtitle_text: '限时抢购', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9], compliance_status: 'PASSED' },
        { shot_index: 2, duration: 3.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: '全网唯一', subtitle_text: '免费送', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9], compliance_status: 'PASSED' },
      ];

      const result = checkCompliance(shots);
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });

    it('checkCompliance — 空 shots 数组 → passed=true', () => {
      const result = checkCompliance([]);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('validateGenerateRequest — product_id 为空字符串 → 抛出异常', () => {
      expect(() => validateGenerateRequest({ product_id: '' })).toThrow();
    });

    it('validateGenerateRequest — 合法请求 → 不抛异常', () => {
      expect(() => validateGenerateRequest({ product_id: PRODUCT_ID })).not.toThrow();
    });
  });
});
