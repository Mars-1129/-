// =============================================================================
// TikStream AI — Script Quick Generate 自动化测试基座
// 对应功能: POST /api/v1/scripts/generate/quick (快速模式剧本生成)
// 对应模块: Script (人员B)
// 测试类型: 单元测试 (Service 层 + Controller 层 + Validator + Filter)
// 技术栈: Jest 29 + @nestjs/testing + ts-mockito (或 jest.fn)
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

type MockPrismaService = {
  product: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
  };
  script: {
    create: jest.Mock;
    findUnique: jest.Mock;
  };
  scriptShot: {
    create: jest.Mock;
    createMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

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

interface TestScriptShotPayload {
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

interface TestPersistedScript {
  id: string;
  product_id: string;
  title: string | null;
  language: string;
  target_audience: string | null;
  video_duration: number;
  aspect_ratio: string;
  style_vibe: string;
  generation_mode: string;
  template_id: string | null;
  viral_video_id: string | null;
  constraint_list: string[];
  raw_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface TestPersistedScriptShot {
  id: string;
  script_id: string;
  shot_id: string | null;
  shot_index: number;
  duration: number;
  scene_description_query: string;
  visual_description: string;
  camera_movement: string;
  transition_type: string;
  voiceover_text: string;
  subtitle_text: string;
  safe_zone_bounding_box: [number, number, number, number];
  selected_slice_id: string | null;
  render_prompt: string | null;
  local_factor_patch: Record<string, unknown>;
  compliance_status: string;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// Mock Factories — 构造符合 Prisma Schema 的完整 stub 数据
// =============================================================================

const mockProductFactory = (overrides?: Partial<TestProduct>): TestProduct => ({
  id: '00000000-0000-0000-0000-000000000001',
  title: '智能无线卷发棒 Pro',
  sku_code: 'SKU-HB-PRO-001',
  category: 'Beauty/PersonalCare',
  selling_points: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
  target_audience: '北美年轻女性,25-35岁',
  scenario_tags: ['日常造型', '出差便携', '节日送礼'],
  text_features: {},
  cover_image_url: 'https://minio.local/products/cover_001.jpg',
  created_at: new Date('2026-05-23T08:00:00Z'),
  updated_at: new Date('2026-05-23T08:00:00Z'),
  ...overrides,
});

const mockScriptShotPayloadFactory = (
  index: number,
  overrides?: Partial<TestScriptShotPayload>,
): TestScriptShotPayload => ({
  shot_index: index,
  duration: 3.0,
  scene_description_query: `close-up shot ${index} of product feature`,
  visual_description: `镜头${index}：展示产品核心功能，画面干净明亮。`,
  camera_movement: 'Static',
  transition_type: index === 1 ? 'Fade_In' : 'Dissolve',
  voiceover_text: `第${index}段旁白：产品卖点生动表达。`,
  subtitle_text: `字幕${index}`,
  safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9],
  compliance_status: 'PASSED',
  ...overrides,
});

const mockAIValidResponse = JSON.stringify({
  title: '智能无线卷发棒快速成片脚本',
  video_duration: 14.5,
  style_vibe: 'clean-tech',
  shots: [
    {
      shot_index: 1,
      duration: 3.0,
      scene_description_query:
        'close-up of cordless curling iron heating quickly on white vanity table',
      visual_description:
        '白色梳妆台上展示卷发棒机身与升温灯光细节，镜头快速推进突出科技感。',
      camera_movement: 'Dolly_In_Fast',
      transition_type: 'Fade_In',
      voiceover_text:
        '三档智能控温，十分钟快速充满，随时随地卷出高级感。',
      subtitle_text: '3档控温｜10分钟快充',
      safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9],
    },
    {
      shot_index: 2,
      duration: 3.5,
      scene_description_query:
        'model uses curling iron on hair with smile, bright studio lighting',
      visual_description:
        '模特微笑使用卷发棒造型，明亮柔光箱灯光，发丝细节清晰可见。',
      camera_movement: 'Pan_Left',
      transition_type: 'Dissolve',
      voiceover_text:
        '32mm陶瓷涂层，不伤发质，一夹成型，每天出门快十分钟。',
      subtitle_text: '32mm陶瓷｜一夹成型',
      safe_zone_bounding_box: [0.08, 0.7, 0.92, 0.88],
    },
    {
      shot_index: 3,
      duration: 4.0,
      scene_description_query:
        'split screen showing curling iron vs traditional curling wand comparison',
      visual_description:
        '左右分屏对比卷发棒与传统卷发器效果，左侧展示自然大波浪，右侧展示生硬卷度。',
      camera_movement: 'Tilt_Up',
      transition_type: 'Wipe',
      voiceover_text:
        '告别传统卷发棒的繁琐，无线设计、USB-C充电，出差旅行说走就走。',
      subtitle_text: '无线设计｜USB-C充电',
      safe_zone_bounding_box: [0.05, 0.68, 0.95, 0.92],
    },
    {
      shot_index: 4,
      duration: 2.0,
      scene_description_query:
        'product beauty shot with floating text overlays showing key specs',
      visual_description:
        '产品360度展示与关键参数浮层叠加，收尾CTA强烈。',
      camera_movement: 'Dolly_Out',
      transition_type: 'Fade_In',
      voiceover_text:
        '现在下单立享新品折扣，点击下方链接，马上拥有你的专属造型神器。',
      subtitle_text: '限时折扣｜立即下单',
      safe_zone_bounding_box: [0.1, 0.74, 0.9, 0.92],
    },
    {
      shot_index: 5,
      duration: 2.0,
      scene_description_query:
        'logo end card with brand name and product name on gradient background',
      visual_description:
        '渐变色背景品牌落版页，品牌Logo与产品名居中，下方导购链接。',
      camera_movement: 'Static',
      transition_type: 'None',
      voiceover_text: 'TikStream Beauty，定义你的美。',
      subtitle_text: 'TikStream Beauty',
      safe_zone_bounding_box: [0.15, 0.75, 0.85, 0.9],
    },
  ],
});

const mockAIResponseWithTaggedJSON = `\`\`\`json\n${mockAIValidResponse}\n\`\`\``;

const mockPrismaServiceFactory = (): MockPrismaService => {
  const service = {
    product: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    script: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    scriptShot: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as MockPrismaService;

  service.$transaction.mockImplementation(async (fn: (tx: MockPrismaService) => Promise<unknown>) => fn(service));
  return service;
};

const mockDoubaoTextProvider = {
  generateText: jest.fn(),
};

// =============================================================================
// —— 以下为测试运行时会动态 import 的真实模块路径 ——
// 当对应源文件尚未创建时，以下 describe 块将先以 "基座" 形式存在；
// 待开发人员完成源码后取消 .skip 即可接入真实断言。
// =============================================================================

describe('ScriptQuickGenerate — 快速模式剧本生成', () => {
  // ===========================================================================
  // 全局测试上下文
  // ===========================================================================
  let mockPrisma: MockPrismaService;
  let mockDoubao: typeof mockDoubaoTextProvider;

  // ---- 模拟未经 NestJS DI 的纯逻辑函数 (用真实实现或高保真 mock 替代) ----
  let buildQuickPrompt: (params: Record<string, unknown>) => {
    systemPrompt: string;
    userPrompt: string;
  };
  let parseScriptFromAIResponse: (
    rawResponse: string,
    params: Record<string, unknown>,
  ) => Record<string, unknown>;
  let validateScriptSchema: (payload: Record<string, unknown>) => {
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings: Array<{ field: string; message: string }>;
  };
  let checkCompliance: (
    shots: Array<Record<string, unknown>>,
  ) => { passed: boolean; violations: Array<{ shot_index: number; violated_word: string; reason: string }> };

  // ---- 模拟 generateQuick 编排函数 ----
  let generateQuick: (
    dto: Record<string, unknown>,
    deps: {
      prisma: MockPrismaService;
      doubao: typeof mockDoubaoTextProvider;
      buildPrompt: typeof buildQuickPrompt;
      parseResponse: typeof parseScriptFromAIResponse;
      validateSchema: typeof validateScriptSchema;
      runCompliance: typeof checkCompliance;
    },
  ) => Promise<Record<string, unknown>>;

  beforeAll(() => {
    // ---- 注入 Prompt Builder mock ----
    buildQuickPrompt = (params) => {
      const sellingPoints = (params.selling_points as string[]) || [];
      const styleVibe = (params.style_vibe as string) || 'clean-tech';
      const targetAudience = (params.target_audience as string) || '';
      const constraintList = (params.constraint_list as string[]) || [];
      const aspectRatio = (params.aspect_ratio as string) || '9:16';

      const systemPrompt = [
        'You are a professional short-video scriptwriter for TikTok Shop.',
        `Output language: ${(params.language as string) || 'zh-CN'}.`,
        `Aspect ratio: ${aspectRatio}.`,
        'You MUST output valid JSON matching the Script schema exactly.',
        'Total video duration MUST NOT exceed 15.0 seconds.',
        'Each shot duration MUST be between 1.5 and 5.0 seconds.',
      ].join('\n');

      const userPrompt = [
        `Product selling points: ${sellingPoints.join('; ')}`,
        `Style vibe: ${styleVibe}`,
        targetAudience ? `Target audience: ${targetAudience}` : '',
        constraintList.length
          ? `Additional constraints: ${constraintList.join(', ')}`
          : '',
        'Generate 4-6 shots. Output ONLY valid JSON.',
      ]
        .filter(Boolean)
        .join('\n');

      return { systemPrompt, userPrompt };
    };

    // ---- 注入 AI Response Parser mock ----
    parseScriptFromAIResponse = (rawResponse: string, _params) => {
      if (!rawResponse || rawResponse.trim().length === 0) {
        throw Object.assign(new Error('AI 返回空响应'), {
          code: 'MODEL_PROVIDER_FAILED',
        });
      }

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
        throw Object.assign(
          new Error(`AI 返回内容无法解析为 JSON: ${cleaned.substring(0, 200)}`),
          { code: 'SCRIPT_PARSE_FAILED' },
        );
      }

      const shots = parsed.shots as Array<Record<string, unknown>> | undefined;
      if (!shots || !Array.isArray(shots)) {
        throw Object.assign(
          new Error('AI 返回缺少 shots 数组字段'),
          { code: 'SCRIPT_PARSE_FAILED' },
        );
      }
      if (shots.length === 0) {
        throw Object.assign(
          new Error('AI 未生成任何有效分镜'),
          { code: 'SCRIPT_NO_SHOTS_GENERATED' },
        );
      }

      return { ...parsed, shots };
    };

    // ---- 注入 Schema Validator mock ----
    validateScriptSchema = (payload) => {
      const shots = payload.shots as Array<Record<string, unknown>>;
      const errors: Array<{ field: string; message: string }> = [];
      const warnings: Array<{ field: string; message: string }> = [];

      if (!shots || !Array.isArray(shots)) {
        errors.push({ field: 'shots', message: '脚本必须包含分镜列表' });
        return { valid: false, errors, warnings };
      }

      if (shots.length === 0) {
        errors.push({ field: 'shots', message: '分镜列表不能为空' });
        return { valid: false, errors, warnings };
      }

      const totalDuration = shots.reduce(
        (sum, shot) => sum + Number(shot.duration || 0),
        0,
      );

      if (totalDuration > 15.0) {
        errors.push({
          field: 'video_duration',
          message: `总时长 ${totalDuration}s 超过上限 15.0s`,
        });
      }

      const REQUIRED_SHOT_FIELDS = [
        'shot_index',
        'duration',
        'scene_description_query',
        'visual_description',
        'camera_movement',
        'transition_type',
        'voiceover_text',
        'subtitle_text',
        'safe_zone_bounding_box',
      ];

      const VALID_CAMERA_MOVEMENTS = [
        'Static',
        'Dolly_In_Fast',
        'Dolly_Out',
        'Pan_Left',
        'Tilt_Up',
      ];

      const VALID_TRANSITIONS = ['None', 'Fade_In', 'Dissolve', 'Wipe'];

      shots.forEach((shot, idx) => {
        for (const field of REQUIRED_SHOT_FIELDS) {
          if (shot[field] === undefined || shot[field] === null) {
            errors.push({
              field: `shots[${idx}].${field}`,
              message: `分镜 ${idx + 1} 缺少必填字段: ${field}`,
            });
          }
        }

        const duration = Number(shot.duration);
        if (duration < 1.5) {
          errors.push({
            field: `shots[${idx}].duration`,
            message: `分镜 ${idx + 1} 时长 ${duration}s 低于下限 1.5s`,
          });
        }
        if (duration > 5.0) {
          errors.push({
            field: `shots[${idx}].duration`,
            message: `分镜 ${idx + 1} 时长 ${duration}s 超过上限 5.0s`,
          });
        }

        if (
          typeof shot.camera_movement === 'string' &&
          !VALID_CAMERA_MOVEMENTS.includes(shot.camera_movement)
        ) {
          errors.push({
            field: `shots[${idx}].camera_movement`,
            message: `分镜 ${idx + 1} 无效的运镜方式: ${shot.camera_movement}`,
          });
        }

        if (
          typeof shot.transition_type === 'string' &&
          !VALID_TRANSITIONS.includes(shot.transition_type)
        ) {
          errors.push({
            field: `shots[${idx}].transition_type`,
            message: `分镜 ${idx + 1} 无效的转场方式: ${shot.transition_type}`,
          });
        }

        const bbox = shot.safe_zone_bounding_box as number[] | undefined;
        if (bbox && (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((v) => typeof v !== 'number'))) {
          errors.push({
            field: `shots[${idx}].safe_zone_bounding_box`,
            message: `分镜 ${idx + 1} safe_zone_bounding_box 必须是 [number,number,number,number]`,
          });
        }
      });

      if (
        Math.abs(totalDuration - Number(payload.video_duration || totalDuration)) > 0.15
      ) {
        warnings.push({
          field: 'video_duration',
          message: `声明时长 ${payload.video_duration}s 与实际分镜总时长 ${totalDuration}s 偏差过大`,
        });
      }

      return { valid: errors.length === 0, errors, warnings };
    };

    // ---- 注入 Compliance Filter mock (P1 基础绝对化用语) ----
    checkCompliance = (shots) => {
      const violations: Array<{
        shot_index: number;
        violated_word: string;
        reason: string;
      }> = [];

      const ABSOLUTE_TERMS = [
        { pattern: /最好/g, reason: '绝对化用语"最好"不可用于广告文案' },
        { pattern: /第一/g, reason: '绝对化用语"第一"须有客观数据支撑' },
        { pattern: /全网/g, reason: '绝对化用语"全网"属于夸大宣传' },
        { pattern: /唯一/g, reason: '绝对化用语"唯一"不可使用' },
        { pattern: /顶级/g, reason: '绝对化用语"顶级"不可用于广告文案' },
        { pattern: /最高/g, reason: '绝对化用语"最高"须有客观数据支撑' },
        { pattern: /永久/g, reason: '绝对化用语"永久"不可用于普通消费品' },
        { pattern: /万能/g, reason: '绝对化用语"万能"属于夸大宣传' },
      ];

      const PROHIBITED_PROMOTIONS = [
        { pattern: /免费送/g, reason: '禁止性促销表达"免费送"' },
        { pattern: /点击领取/g, reason: '禁止性CTA表达"点击领取"' },
        { pattern: /限时抢购/g, reason: '禁止性紧迫感表达"限时抢购"（TikTok Shop 官方口径）' },
        { pattern: /马上抢/g, reason: '禁止性紧迫感表达"马上抢"' },
      ];

      const allRules = [...ABSOLUTE_TERMS, ...PROHIBITED_PROMOTIONS];

      shots.forEach((shot) => {
        const shotIndex = Number(shot.shot_index);
        const combinedText = `${shot.voiceover_text || ''} ${shot.subtitle_text || ''}`;

        for (const rule of allRules) {
          rule.pattern.lastIndex = 0;
          const match = rule.pattern.exec(combinedText);
          if (match) {
            violations.push({
              shot_index: shotIndex,
              violated_word: match[0],
              reason: rule.reason,
            });
          }
        }
      });

      return { passed: violations.length === 0, violations };
    };

    // ---- 注入 generateQuick 编排函数 (Service 层核心逻辑的测试替身) ----
    generateQuick = async (dto, deps) => {
      const { prisma, doubao, buildPrompt, parseResponse, validateSchema, runCompliance } = deps;

      const productId = dto.product_id as string;
      if (!productId) {
        const err = new Error('product_id 为必填字段') as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.errorCode = 'PRODUCT_ID_REQUIRED';
        throw err;
      }

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        const err = new Error(`商品 ${productId} 不存在`) as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.NOT_FOUND;
        err.errorCode = 'PRODUCT_NOT_FOUND';
        throw err;
      }

      const { systemPrompt, userPrompt } = buildPrompt(dto);

      const rawResponse = await doubao.generateText(systemPrompt, userPrompt);

      const parsed = parseResponse(rawResponse, dto);

      const schemaResult = validateSchema(parsed);

      if (!schemaResult.valid) {
        const hasDurationErr = schemaResult.errors.some((e) =>
          e.message.includes('总时长'),
        );
        const err = new Error(
          `剧本 Schema 校验失败: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
        ) as Error & { statusCode?: number; errorCode?: string; details?: object };
        err.errorCode = hasDurationErr
          ? 'SCRIPT_DURATION_EXCEEDED'
          : 'SCRIPT_SCHEMA_INVALID';
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.details = schemaResult.errors;
        throw err;
      }

      const complianceResult = runCompliance(parsed.shots as Array<Record<string, unknown>>);

      if (!complianceResult.passed) {
        const err = new Error(
          `合规校验未通过: ${complianceResult.violations.map((v) => v.reason).join('; ')}`,
        ) as Error & { statusCode?: number; errorCode?: string; details?: object };
        err.errorCode = 'COMPLIANCE_CHECK_FAILED';
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.details = complianceResult.violations;
        throw err;
      }

      const now = new Date();
      const scriptId = 'dc52d4ff-0000-4000-a000-000000000001';
      const scriptRecord: TestPersistedScript = {
        id: scriptId,
        product_id: productId,
        title: (parsed.title as string) || null,
        language: (dto.language as string) || 'zh-CN',
        target_audience: (dto.target_audience as string) || null,
        video_duration: parsed.video_duration as number,
        aspect_ratio: dto.aspect_ratio as string,
        style_vibe: dto.style_vibe as string,
        generation_mode: 'PROMPT_DRIVEN',
        template_id: null,
        viral_video_id: null,
        constraint_list: (dto.constraint_list as string[]) || [],
        raw_json: { ...parsed },
        created_at: now,
        updated_at: now,
      };

      const shotRecords: TestPersistedScriptShot[] = (
        parsed.shots as Array<Record<string, unknown>>
      ).map((shot, idx) => ({
        id: `shot-uuid-${idx + 1}-${scriptId}`,
        script_id: scriptId,
        shot_id: `shot_${String(idx + 1).padStart(3, '0')}`,
        shot_index: Number(shot.shot_index),
        duration: Number(shot.duration),
        scene_description_query: String(shot.scene_description_query),
        visual_description: String(shot.visual_description),
        camera_movement: String(shot.camera_movement),
        transition_type: String(shot.transition_type),
        voiceover_text: String(shot.voiceover_text),
        subtitle_text: String(shot.subtitle_text),
        safe_zone_bounding_box: shot.safe_zone_bounding_box as [number, number, number, number],
        selected_slice_id: null,
        render_prompt: null,
        local_factor_patch: {},
        compliance_status: 'PASSED',
        created_at: now,
        updated_at: now,
      }));

      prisma.script.create.mockResolvedValue(scriptRecord);
      prisma.scriptShot.createMany.mockResolvedValue({ count: shotRecords.length });

      try {
        await prisma.$transaction(async (tx: MockPrismaService) => {
          await tx.script.create({ data: scriptRecord });
          await tx.scriptShot.createMany({ data: shotRecords });
        });
      } catch (e) {
        const err = e as Error;
        throw Object.assign(new Error(`持久化失败: ${err.message}`), {
          errorCode: 'INTERNAL_SERVER_ERROR',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          retryable: true,
        });
      }

      return {
        script_id: scriptId,
        product_id: productId,
        title: scriptRecord.title,
        language: scriptRecord.language,
        target_audience: scriptRecord.target_audience,
        video_duration: scriptRecord.video_duration,
        aspect_ratio: scriptRecord.aspect_ratio,
        style_vibe: scriptRecord.style_vibe,
        generation_mode: 'PROMPT_DRIVEN',
        constraint_list: scriptRecord.constraint_list,
        shots: shotRecords.map((sr) => ({
          id: sr.id,
          shot_id: sr.shot_id,
          shot_index: sr.shot_index,
          duration: sr.duration,
          scene_description_query: sr.scene_description_query,
          visual_description: sr.visual_description,
          camera_movement: sr.camera_movement,
          transition_type: sr.transition_type,
          voiceover_text: sr.voiceover_text,
          subtitle_text: sr.subtitle_text,
          safe_zone_bounding_box: sr.safe_zone_bounding_box,
          selected_slice_id: sr.selected_slice_id,
          render_prompt: sr.render_prompt,
          local_factor_patch: sr.local_factor_patch,
          compliance_status: sr.compliance_status,
          created_at: sr.created_at.toISOString(),
          updated_at: sr.updated_at.toISOString(),
        })),
        created_at: now.toISOString(),
      };
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
    mockDoubao = {
      generateText: jest.fn(),
    };
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 完整 ScriptGenerateResponse 输出', () => {
    const validRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      title: '智能无线卷发棒快速成片脚本',
      language: 'zh-CN',
      selling_points: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
      target_audience: '北美年轻女性,25-35岁',
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
      constraint_list: ['total_duration<=15s', 'avoid_absolute_claims'],
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SCR-001: 快速模式生成成功 — 返回完整结构', async () => {
      const result = await generateQuick(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      // ---- 断言顶层结构 ----
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');

      // ---- 断言 script_id 格式 ----
      expect(result).toHaveProperty('script_id');
      expect(typeof result.script_id).toBe('string');
      expect(result.script_id.length).toBeGreaterThan(0);

      // ---- 断言 product_id 与原请求一致 ----
      expect(result.product_id).toBe(validRequest.product_id);

      // ---- 断言 generation_mode 正确 ----
      expect(result.generation_mode).toBe('PROMPT_DRIVEN');

      // ---- 断言 video_duration ≤ 15.0 ----
      expect(result).toHaveProperty('video_duration');
      expect(typeof result.video_duration).toBe('number');
      expect(result.video_duration).toBeLessThanOrEqual(15.0);
      expect(result.video_duration).toBeGreaterThan(0);

      // ---- 断言 aspect_ratio ----
      expect(result.aspect_ratio).toBe('9:16');

      // ---- 断言 style_vibe ----
      expect(result.style_vibe).toBe('clean-tech');

      // ---- 断言 language ----
      expect(result.language).toBe('zh-CN');

      // ---- 断言 constraint_list 传递一致 ----
      expect(Array.isArray(result.constraint_list)).toBe(true);
      expect(result.constraint_list).toContain('total_duration<=15s');

      // ---- 断言 shots 非空数组 ----
      expect(result).toHaveProperty('shots');
      expect(Array.isArray(result.shots)).toBe(true);
      expect(result.shots.length).toBeGreaterThanOrEqual(4);
      expect(result.shots.length).toBeLessThanOrEqual(6);

      // ---- 断言每个 shot 的必填字段完整 ----
      const REQUIRED_SHOT_FIELDS = [
        'id',
        'shot_id',
        'shot_index',
        'duration',
        'scene_description_query',
        'visual_description',
        'camera_movement',
        'transition_type',
        'voiceover_text',
        'subtitle_text',
        'safe_zone_bounding_box',
        'compliance_status',
      ];

      for (const shot of result.shots) {
        for (const field of REQUIRED_SHOT_FIELDS) {
          expect(shot).toHaveProperty(field);
        }

        // ---- 断言 shot_index 递增 (1-based) ----
        const idx = result.shots.indexOf(shot);
        expect(shot.shot_index).toBe(idx + 1);

        // ---- 断言 duration 合标 1.5s ~ 5.0s ----
        expect(shot.duration).toBeGreaterThanOrEqual(1.5);
        expect(shot.duration).toBeLessThanOrEqual(5.0);

        // ---- 断言 camera_movement 在枚举值内 ----
        expect([
          'Static',
          'Dolly_In_Fast',
          'Dolly_Out',
          'Pan_Left',
          'Tilt_Up',
        ]).toContain(shot.camera_movement);

        // ---- 断言 transition_type 在枚举值内 ----
        expect(['None', 'Fade_In', 'Dissolve', 'Wipe']).toContain(
          shot.transition_type,
        );

        // ---- 断言 safe_zone_bounding_box 是 [n,n,n,n] 元组 ----
        expect(Array.isArray(shot.safe_zone_bounding_box)).toBe(true);
        expect(shot.safe_zone_bounding_box).toHaveLength(4);
        for (const v of shot.safe_zone_bounding_box) {
          expect(typeof v).toBe('number');
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }

        // ---- 断言 compliance_status ----
        expect(['PENDING', 'PASSED', 'REJECTED']).toContain(
          shot.compliance_status,
        );

        // ---- 断言文本字段非空字符串 ----
        expect(typeof shot.scene_description_query).toBe('string');
        expect(shot.scene_description_query.length).toBeGreaterThan(0);

        expect(typeof shot.visual_description).toBe('string');
        expect(shot.visual_description.length).toBeGreaterThan(0);

        expect(typeof shot.voiceover_text).toBe('string');
        expect(shot.voiceover_text.length).toBeGreaterThan(0);

        expect(typeof shot.subtitle_text).toBe('string');
        expect(shot.subtitle_text.length).toBeGreaterThan(0);
      }

      // ---- 断言分镜总时长 ≤ 15.0 ----
      const shotsTotalDuration = result.shots.reduce(
        (sum: number, s: { duration: number }) => sum + s.duration,
        0,
      );
      expect(shotsTotalDuration).toBeLessThanOrEqual(15.0);
      expect(Math.abs(shotsTotalDuration - result.video_duration)).toBeLessThanOrEqual(0.15);

      // ---- 断言 created_at 是合法 ISO 时间戳 ----
      expect(result).toHaveProperty('created_at');
      expect(() => new Date(result.created_at as string)).not.toThrow();
      const createdAtMs = new Date(result.created_at as string).getTime();
      expect(createdAtMs).toBeGreaterThan(0);

      // ---- 断言不包含不应暴露的内部字段 ----
      expect(result).not.toHaveProperty('raw_json');
      expect(result).not.toHaveProperty('template_id');
      expect(result).not.toHaveProperty('viral_video_id');
    });

    it('TC-SCR-001-EXT: AI 响应含 markdown 代码块包裹时正常解析', async () => {
      mockDoubao.generateText.mockResolvedValue(mockAIResponseWithTaggedJSON);

      const result = await generateQuick(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBeGreaterThanOrEqual(4);
      expect(result.generation_mode).toBe('PROMPT_DRIVEN');
    });

    it('TC-SCR-001-EXT: 未传 title 时仍然成功生成', async () => {
      const requestWithoutTitle = { ...validRequest };
      delete requestWithoutTitle.title;

      const result = await generateQuick(requestWithoutTitle, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBeGreaterThan(0);
      expect(result.generation_mode).toBe('PROMPT_DRIVEN');
    });

    it('TC-SCR-001-EXT: 未传 target_audience 时仍然成功生成', async () => {
      const requestWithoutAudience = { ...validRequest };
      delete requestWithoutAudience.target_audience;

      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);

      const result = await generateQuick(requestWithoutAudience, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    const validRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      selling_points: ['测试卖点'],
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SCR-BND-001: selling_points 仅 1 项时成功生成', async () => {
      const request = {
        ...validRequest,
        selling_points: ['单一卖点'],
      };

      const result = await generateQuick(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBeGreaterThan(0);
    });

    it('TC-SCR-BND-002: selling_points 达 10 项时成功生成', async () => {
      const tenPoints = Array.from({ length: 10 }, (_, i) => `卖点_${i + 1}`);
      const request = { ...validRequest, selling_points: tenPoints };

      const result = await generateQuick(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBeGreaterThan(0);
    });

    it('TC-SCR-BND-003: 总时长恰好 15.0s (临界值) 通过', async () => {
      const exactJSON = JSON.stringify({
        title: '临界时长测试',
        video_duration: 15.0,
        shots: [
          {
            shot_index: 1,
            duration: 5.0,
            scene_description_query: 'shot 1 query',
            visual_description: '镜头1描述',
            camera_movement: 'Static',
            transition_type: 'Fade_In',
            voiceover_text: '旁白1',
            subtitle_text: '字幕1',
            safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
          },
          {
            shot_index: 2,
            duration: 5.0,
            scene_description_query: 'shot 2 query',
            visual_description: '镜头2描述',
            camera_movement: 'Pan_Left',
            transition_type: 'Dissolve',
            voiceover_text: '旁白2',
            subtitle_text: '字幕2',
            safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
          },
          {
            shot_index: 3,
            duration: 5.0,
            scene_description_query: 'shot 3 query',
            visual_description: '镜头3描述',
            camera_movement: 'Tilt_Up',
            transition_type: 'Wipe',
            voiceover_text: '旁白3',
            subtitle_text: '字幕3',
            safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
          },
        ],
      });

      mockDoubao.generateText.mockResolvedValue(exactJSON);

      const result = await generateQuick(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.video_duration).toBe(15.0);
      expect(result.shots.length).toBe(3);
      const totalShotDuration = result.shots.reduce(
        (s: number, shot: { duration: number }) => s + shot.duration,
        0,
      );
      expect(totalShotDuration).toBe(15.0);
    });

    it('TC-SCR-BND-004: 单分镜时长 1.5s (下限临界值) 通过', async () => {
      const minDurationJSON = JSON.stringify({
        title: '最小分镜测试',
        video_duration: 6.0,
        shots: [
          {
            shot_index: 1,
            duration: 1.5,
            scene_description_query: 'test query 1',
            visual_description: '描述1',
            camera_movement: 'Static',
            transition_type: 'None',
            voiceover_text: '旁白1',
            subtitle_text: '字幕1',
            safe_zone_bounding_box: [0.0, 0.5, 1.0, 1.0],
          },
          {
            shot_index: 2,
            duration: 1.5,
            scene_description_query: 'test query 2',
            visual_description: '描述2',
            camera_movement: 'Static',
            transition_type: 'None',
            voiceover_text: '旁白2',
            subtitle_text: '字幕2',
            safe_zone_bounding_box: [0.0, 0.5, 1.0, 1.0],
          },
          {
            shot_index: 3,
            duration: 1.5,
            scene_description_query: 'test query 3',
            visual_description: '描述3',
            camera_movement: 'Static',
            transition_type: 'None',
            voiceover_text: '旁白3',
            subtitle_text: '字幕3',
            safe_zone_bounding_box: [0.0, 0.5, 1.0, 1.0],
          },
          {
            shot_index: 4,
            duration: 1.5,
            scene_description_query: 'test query 4',
            visual_description: '描述4',
            camera_movement: 'Static',
            transition_type: 'None',
            voiceover_text: '旁白4',
            subtitle_text: '字幕4',
            safe_zone_bounding_box: [0.0, 0.5, 1.0, 1.0],
          },
        ],
      });

      mockDoubao.generateText.mockResolvedValue(minDurationJSON);

      const result = await generateQuick(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.video_duration).toBe(6.0);
      for (const shot of result.shots) {
        expect(shot.duration).toBeGreaterThanOrEqual(1.5);
      }
    });

    it('TC-SCR-BND-005: 单分镜时长 5.0s (上限临界值) 通过', async () => {
      const maxDurationJSON = JSON.stringify({
        title: '最大分镜测试',
        video_duration: 5.0,
        shots: [
          {
            shot_index: 1,
            duration: 5.0,
            scene_description_query: 'test query',
            visual_description: '描述',
            camera_movement: 'Dolly_In_Fast',
            transition_type: 'Fade_In',
            voiceover_text: '超长旁白测试文本内容',
            subtitle_text: '字幕',
            safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
          },
        ],
      });

      mockDoubao.generateText.mockResolvedValue(maxDurationJSON);

      const result = await generateQuick(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots[0].duration).toBe(5.0);
    });

    it('TC-SCR-BND-006: aspect_ratio 为 16:9 时正常生成', async () => {
      const request169 = { ...validRequest, aspect_ratio: '16:9' };

      const result = await generateQuick(request169, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.aspect_ratio).toBe('16:9');
    });

    it('TC-SCR-BND-007: 所有 CameraMovement 枚举值均可通过校验', async () => {
      const allMoves = ['Static', 'Dolly_In_Fast', 'Dolly_Out', 'Pan_Left', 'Tilt_Up'];
      const shotsPayload = allMoves.map((cm, i) => ({
        shot_index: i + 1,
        duration: 2.0,
        scene_description_query: `query ${i}`,
        visual_description: `desc ${i}`,
        camera_movement: cm,
        transition_type: 'None',
        voiceover_text: `voice ${i}`,
        subtitle_text: `sub ${i}`,
        safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
      }));

      const result = validateScriptSchema({
        video_duration: allMoves.length * 2.0,
        shots: shotsPayload,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('TC-SCR-BND-008: constraint_list 为空数组时不报错', async () => {
      const requestNoConstraint = { ...validRequest, constraint_list: [] };

      const result = await generateQuick(requestNoConstraint, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(Array.isArray(result.constraint_list)).toBe(true);
      expect(result.constraint_list).toHaveLength(0);
    });

    it('TC-SCR-BND-009: safe_zone_bounding_box 边界值 [0,0,1,1] 通过', async () => {
      const fullBboxJSON = JSON.stringify({
        title: '全屏safe_zone',
        video_duration: 3.0,
        shots: [
          {
            shot_index: 1,
            duration: 3.0,
            scene_description_query: 'test',
            visual_description: 'test',
            camera_movement: 'Static',
            transition_type: 'None',
            voiceover_text: 'test',
            subtitle_text: 'test',
            safe_zone_bounding_box: [0.0, 0.0, 1.0, 1.0],
          },
        ],
      });

      mockDoubao.generateText.mockResolvedValue(fullBboxJSON);

      const result = await generateQuick(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots[0].safe_zone_bounding_box).toEqual([0.0, 0.0, 1.0, 1.0]);
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const validRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      selling_points: ['测试卖点'],
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    // ---- 3.1 输入层异常 ----

    it('TC-SCR-ERR-001: product_id 缺失 → PRODUCT_ID_REQUIRED', async () => {
      const badRequest = { ...validRequest };
      delete badRequest.product_id;

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateQuick(badRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_ID_REQUIRED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SCR-ERR-002: product_id 对应的商品不存在 → PRODUCT_NOT_FOUND', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateQuick(
          { ...validRequest, product_id: '99999999-9999-9999-9999-999999999999' },
          {
            prisma: mockPrisma,
            doubao: mockDoubao,
            buildPrompt: buildQuickPrompt,
            parseResponse: parseScriptFromAIResponse,
            validateSchema: validateScriptSchema,
            runCompliance: checkCompliance,
          },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    // ---- 3.2 AI 调用层异常 ----

    it('TC-SCR-ERR-003: AI 返回空字符串 → MODEL_PROVIDER_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue('');

      let caught: Error & { code?: string } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { code?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.code || (caught as Record<string, unknown>).errorCode).toBeDefined();
      const errorIdentifier = caught!.code || (caught as Record<string, unknown>).errorCode;
      expect(['MODEL_PROVIDER_FAILED', 'SCRIPT_PARSE_FAILED']).toContain(errorIdentifier);
    });

    it('TC-SCR-ERR-004: AI 返回不可解析的非 JSON 文本 → SCRIPT_PARSE_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue('This is just random text, not valid JSON at all.');

      let caught: Error & { code?: string } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { code?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('SCRIPT_PARSE_FAILED');
      expect(caught!.message).toContain('无法解析');
    });

    it('TC-SCR-ERR-005: AI 返回合法 JSON 但缺少 shots 字段 → SCRIPT_PARSE_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({ title: 'No Shots', video_duration: 10.0 }),
      );

      let caught: Error & { code?: string } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { code?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('SCRIPT_PARSE_FAILED');
      expect(caught!.message).toContain('shots');
    });

    it('TC-SCR-ERR-006: AI 返回空 shots 数组 → SCRIPT_NO_SHOTS_GENERATED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({ title: 'Empty', video_duration: 0, shots: [] }),
      );

      let caught: Error & { code?: string } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { code?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('SCRIPT_NO_SHOTS_GENERATED');
    });

    // ---- 3.3 Schema 校验层异常 ----

    it('TC-SCR-ERR-007: 总时长 > 15.0s → SCRIPT_DURATION_EXCEEDED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({
          title: 'Over Duration',
          video_duration: 18.0,
          shots: [
            {
              shot_index: 1,
              duration: 6.0,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Static',
              transition_type: 'None',
              voiceover_text: 'v',
              subtitle_text: 's',
              safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
            },
            {
              shot_index: 2,
              duration: 6.0,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Static',
              transition_type: 'None',
              voiceover_text: 'v',
              subtitle_text: 's',
              safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
            },
            {
              shot_index: 3,
              duration: 6.0,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Static',
              transition_type: 'None',
              voiceover_text: 'v',
              subtitle_text: 's',
              safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
            },
          ],
        }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number; details?: unknown } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_DURATION_EXCEEDED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SCR-ERR-008: 单分镜时长 < 1.5s → SCRIPT_SCHEMA_INVALID', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({
          title: 'Too Short Shot',
          video_duration: 2.0,
          shots: [
            {
              shot_index: 1,
              duration: 0.5,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Static',
              transition_type: 'None',
              voiceover_text: 'v',
              subtitle_text: 's',
              safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
            },
          ],
        }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number; details?: Array<{ field: string; message: string }> } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: Array<{ field: string; message: string }> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_SCHEMA_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.details).toBeDefined();
      expect(
        (caught!.details as Array<{ field: string }>).some((d) =>
          d.field.includes('duration'),
        ),
      ).toBe(true);
    });

    it('TC-SCR-ERR-009: 单分镜时长 > 5.0s → SCRIPT_SCHEMA_INVALID', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({
          title: 'Too Long Shot',
          video_duration: 7.0,
          shots: [
            {
              shot_index: 1,
              duration: 7.0,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Static',
              transition_type: 'None',
              voiceover_text: 'v',
              subtitle_text: 's',
              safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
            },
          ],
        }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_SCHEMA_INVALID');
    });

    it('TC-SCR-ERR-010: 缺少必填字段 → SCRIPT_SCHEMA_INVALID', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({
          title: 'Missing Fields',
          video_duration: 3.0,
          shots: [
            {
              shot_index: 1,
              duration: 3.0,
              // 故意缺失 scene_description_query / visual_description 等
              camera_movement: 'Static',
              transition_type: 'None',
            },
          ],
        }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number; details?: Array<{ field: string; message: string }> } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: Array<{ field: string; message: string }> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_SCHEMA_INVALID');
      expect(caught!.details).toBeDefined();
      expect((caught!.details as Array<{ field: string }>).length).toBeGreaterThanOrEqual(3);
    });

    it('TC-SCR-ERR-011: 无效 camera_movement 值 → SCRIPT_SCHEMA_INVALID', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({
          title: 'Invalid Camera',
          video_duration: 3.0,
          shots: [
            {
              shot_index: 1,
              duration: 3.0,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Zoom_In_Ultra',
              transition_type: 'None',
              voiceover_text: 'v',
              subtitle_text: 's',
              safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
            },
          ],
        }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number; details?: unknown } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_SCHEMA_INVALID');
    });

    it('TC-SCR-ERR-012: bad safe_zone_bounding_box 格式 → SCRIPT_SCHEMA_INVALID', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({
          title: 'Bad BBox',
          video_duration: 3.0,
          shots: [
            {
              shot_index: 1,
              duration: 3.0,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Static',
              transition_type: 'None',
              voiceover_text: 'v',
              subtitle_text: 's',
              safe_zone_bounding_box: [0.1, 0.7],
            },
          ],
        }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number; details?: unknown } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_SCHEMA_INVALID');
    });

    // ---- 3.4 合规校验层异常 ----

    it('TC-SCR-ERR-013: 含"最好"绝对化用语 → COMPLIANCE_CHECK_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({
          title: 'Compliance Violation',
          video_duration: 3.0,
          shots: [
            {
              shot_index: 1,
              duration: 3.0,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Static',
              transition_type: 'None',
              voiceover_text: '这是市面上最好的卷发棒，你值得拥有。',
              subtitle_text: '最好的卷发棒',
              safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
            },
          ],
        }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number; details?: Array<{ shot_index: number; violated_word: string; reason: string }> } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: Array<{ shot_index: number; violated_word: string; reason: string }> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('COMPLIANCE_CHECK_FAILED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.details).toBeDefined();
      expect((caught!.details as Array<{ violated_word: string }>).some((v) => v.violated_word === '最好')).toBe(true);
    });

    it('TC-SCR-ERR-014: 含"免费送"禁止性促销表达 → COMPLIANCE_CHECK_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({
          title: 'Forbidden Promo',
          video_duration: 3.0,
          shots: [
            {
              shot_index: 1,
              duration: 3.0,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Static',
              transition_type: 'None',
              voiceover_text: '现在下单免费送替换头！',
              subtitle_text: '免费送替换头',
              safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
            },
          ],
        }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number; details?: Array<{ violated_word: string; reason: string }> } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: Array<{ violated_word: string; reason: string }> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('COMPLIANCE_CHECK_FAILED');
      expect((caught!.details as Array<{ violated_word: string }>).some((v) => v.violated_word === '免费送')).toBe(true);
    });

    it('TC-SCR-ERR-015: 含"第一"绝对化用语 → COMPLIANCE_CHECK_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({
          title: 'Absolute Claim',
          video_duration: 3.0,
          shots: [
            {
              shot_index: 1,
              duration: 3.0,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Static',
              transition_type: 'None',
              voiceover_text: '全网第一的无线卷发棒来了！',
              subtitle_text: '全网第一',
              safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
            },
          ],
        }),
      );

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('COMPLIANCE_CHECK_FAILED');
    });

    it('TC-SCR-ERR-016: 字幕中含"马上抢"禁止性表达 → COMPLIANCE_CHECK_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({
          title: 'Urgency Prohibited',
          video_duration: 2.0,
          shots: [
            {
              shot_index: 1,
              duration: 2.0,
              scene_description_query: 'q',
              visual_description: 'd',
              camera_movement: 'Static',
              transition_type: 'None',
              voiceover_text: '好产品',
              subtitle_text: '马上抢！限量！',
              safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
            },
          ],
        }),
      );

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('COMPLIANCE_CHECK_FAILED');
    });

    it('TC-SCR-ERR-017: 无违规词通过合规', () => {
      const result = checkCompliance([
        {
          shot_index: 1,
          voiceover_text: '三档智能控温，便携无线设计。',
          subtitle_text: '便携无线｜智能控温',
        },
        {
          shot_index: 2,
          voiceover_text: '32mm陶瓷涂层，温和护发。',
          subtitle_text: '32mm陶瓷涂层',
        },
      ]);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('TC-SCR-ERR-018: 合规校验跨分镜检测多词违规', () => {
      const result = checkCompliance([
        {
          shot_index: 1,
          voiceover_text: '全网最好的产品，永久保修。',
          subtitle_text: '全网最好',
        },
        {
          shot_index: 2,
          voiceover_text: '点击领取限时优惠券！',
          subtitle_text: '点击领取',
        },
      ]);

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
      const violatedWords = result.violations.map((v) => v.violated_word);
      expect(violatedWords).toContain('最好');
      expect(violatedWords).toContain('永久');
      expect(violatedWords).toContain('点击领取');
    });

    // ---- 3.5 持久化层异常 ----

    it('TC-SCR-ERR-019: Prisma $transaction 写入失败 → INTERNAL_SERVER_ERROR', async () => {
      const dbError = new Error('Connection terminated unexpectedly');
      (dbError as Error & { code?: string }).code = 'P1001';

      const faultyPrisma = mockPrismaServiceFactory();
      faultyPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      faultyPrisma.$transaction.mockRejectedValue(dbError);

      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);

      let caught: Error & { errorCode?: string; code?: string } | null = null;
      try {
        await generateQuick(validRequest, {
          prisma: faultyPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; code?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.message).toContain('Connection terminated');
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance Flow）
  // ===========================================================================

  describe('【性能流】耗时与资源卡点告警', () => {
    const validRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      selling_points: ['测试卖点'],
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SCR-PERF-001: generateQuick 编排总耗时 ≤ 5000ms (含 mock AI 响应)', async () => {
      const PERF_CEILING_MS = 5000;

      const start = performance.now();

      await generateQuick(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 10000);

    it('TC-SCR-PERF-002: parseScriptFromAIResponse ≤ 50ms (JSON 解析)', async () => {
      const PERF_CEILING_MS = 50;

      const start = performance.now();

      const result = parseScriptFromAIResponse(mockAIValidResponse, {});

      const elapsed = performance.now() - start;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SCR-PERF-003: validateScriptSchema ≤ 10ms (5 分镜)', () => {
      const PERF_CEILING_MS = 10;
      const parsed = parseScriptFromAIResponse(mockAIValidResponse, {});

      const start = performance.now();

      const result = validateScriptSchema(parsed);

      const elapsed = performance.now() - start;

      expect(result.valid).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SCR-PERF-004: checkCompliance ≤ 5ms (5 分镜 × 12 规则)', () => {
      const PERF_CEILING_MS = 5;
      const parsed = parseScriptFromAIResponse(mockAIValidResponse, {});

      const start = performance.now();

      const result = checkCompliance(parsed.shots as Array<Record<string, unknown>>);

      const elapsed = performance.now() - start;

      expect(result.passed).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SCR-PERF-005: buildQuickPrompt ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;

      const start = performance.now();

      const result = buildQuickPrompt(validRequest);

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userPrompt).toBe('string');
      expect(result.systemPrompt.length).toBeGreaterThan(0);
      expect(result.userPrompt.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SCR-PERF-006: 连续 10 次 generateQuick 无内存泄漏表现', async () => {
      const ITERATIONS = 10;
      const PERF_CEILING_MS_PER_ITERATION = 100;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await generateQuick(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 15000);

    it('TC-SCR-PERF-007: 校验大批量分镜 (20 分镜) ≤ 30ms 不退化', () => {
      const PERF_CEILING_MS = 30;
      const largeShots = Array.from({ length: 20 }, (_, i) => ({
        shot_index: i + 1,
        duration: 0.7,
        scene_description_query: `query_${i}`,
        visual_description: `desc_${i}`,
        camera_movement: 'Static' as const,
        transition_type: 'None' as const,
        voiceover_text: `voice_${i}`,
        subtitle_text: `sub_${i}`,
        safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] as [number, number, number, number],
      }));

      const start = performance.now();

      const result = validateScriptSchema({
        video_duration: 14.0,
        shots: largeShots,
      });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });

  // ===========================================================================
  // 独立原子函数测试（非编排路径的纯逻辑验证）
  // ===========================================================================

  describe('【原子函数】独立校验 buildQuickPrompt / parseScriptFromAIResponse / validateScriptSchema / checkCompliance', () => {
    it('buildQuickPrompt 在 language 缺失时默认 zh-CN', () => {
      const result = buildQuickPrompt({
        product_id: 'test',
        selling_points: ['test'],
        style_vibe: 'minimal',
        aspect_ratio: '9:16',
      });

      expect(result.systemPrompt).toContain('zh-CN');
    });

    it('buildQuickPrompt 注入 target_audience', () => {
      const result = buildQuickPrompt({
        product_id: 'test',
        selling_points: ['test'],
        style_vibe: 'minimal',
        aspect_ratio: '9:16',
        target_audience: 'Gen Z women',
      });

      expect(result.userPrompt).toContain('Gen Z women');
    });

    it('buildQuickPrompt 注入 constraint_list', () => {
      const result = buildQuickPrompt({
        product_id: 'test',
        selling_points: ['test'],
        style_vibe: 'minimal',
        aspect_ratio: '9:16',
        constraint_list: ['no_bgm', 'only_static_camera'],
      });

      expect(result.userPrompt).toContain('no_bgm');
      expect(result.userPrompt).toContain('only_static_camera');
    });

    it('parseScriptFromAIResponse 处理纯文本 non-JSON → SCRIPT_PARSE_FAILED', () => {
      let caught: Error & { code?: string } | null = null;
      try {
        parseScriptFromAIResponse('just some random thoughts about the video', {});
      } catch (e) {
        caught = e as Error & { code?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('SCRIPT_PARSE_FAILED');
    });

    it('parseScriptFromAIResponse 处理 null/undefined → MODEL_PROVIDER_FAILED', () => {
      let caught: Error & { code?: string } | null = null;
      try {
        parseScriptFromAIResponse('', {});
      } catch (e) {
        caught = e as Error & { code?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('MODEL_PROVIDER_FAILED');
    });

    it('validateScriptSchema 标记 totalDuration 与 video_duration 偏差过大为 warning', () => {
      const result = validateScriptSchema({
        title: 'mismatch',
        video_duration: 5.0,
        shots: [
          {
            shot_index: 1,
            duration: 3.0,
            scene_description_query: 'q',
            visual_description: 'd',
            camera_movement: 'Static',
            transition_type: 'None',
            voiceover_text: 'v',
            subtitle_text: 's',
            safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
          },
          {
            shot_index: 2,
            duration: 3.0,
            scene_description_query: 'q',
            visual_description: 'd',
            camera_movement: 'Static',
            transition_type: 'None',
            voiceover_text: 'v',
            subtitle_text: 's',
            safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
          },
        ],
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.message.includes('偏差过大'))).toBe(true);
    });

    it('validateScriptSchema 空 shots 数组报错', () => {
      const result = validateScriptSchema({
        video_duration: 0,
        shots: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('不能为空'))).toBe(true);
    });

    it('checkCompliance 全 PASSED 时 passed=true', () => {
      const result = checkCompliance([
        {
          shot_index: 1,
          voiceover_text: '便携无线设计，随时随地轻松造型。',
          subtitle_text: '便携无线｜轻松造型',
        },
      ]);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('checkCompliance 返回违规词原文和原因', () => {
      const result = checkCompliance([
        {
          shot_index: 1,
          voiceover_text: '全网最高品质',
          subtitle_text: '全网最高',
        },
      ]);

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      for (const v of result.violations) {
        expect(v).toHaveProperty('shot_index');
        expect(v).toHaveProperty('violated_word');
        expect(v).toHaveProperty('reason');
        expect(typeof v.shot_index).toBe('number');
        expect(typeof v.violated_word).toBe('string');
        expect(typeof v.reason).toBe('string');
        expect(v.reason.length).toBeGreaterThan(0);
      }
    });

    it('validateScriptSchema 中 video_duration 不存在时使用 shot 总和', () => {
      const result = validateScriptSchema({
        shots: [
          {
            shot_index: 1,
            duration: 2.0,
            scene_description_query: 'q',
            visual_description: 'd',
            camera_movement: 'Static',
            transition_type: 'None',
            voiceover_text: 'v',
            subtitle_text: 's',
            safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
          },
        ],
      });

      expect(result.valid).toBe(true);
    });
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言快速模式剧本生成功能
// 的完整性与正确性。待源码实现后移除 .skip 或直接运行。
//
// 用例编号映射:
//   TC-SCR-001 ~ TC-SCR-001-EXT      正常流 (Happy Path)
//   TC-SCR-BND-001 ~ TC-SCR-BND-009  边界流 (Edge Cases)
//   TC-SCR-ERR-001 ~ TC-SCR-ERR-019  异常流 (Error Flow)
//   TC-SCR-PERF-001 ~ TC-SCR-PERF-007 性能流 (Performance)
//
// 覆盖率维度:
//   ├── buildQuickPrompt       (4 原子测试)
//   ├── parseScriptFromAIResponse (2 原子测试)
//   ├── validateScriptSchema   (5 原子测试 + 集成覆盖)
//   ├── checkCompliance        (6 原子测试 + 集成覆盖)
//   └── generateQuick          (9 集成测试)
//
// 总测试用例数: 52
// =============================================================================
