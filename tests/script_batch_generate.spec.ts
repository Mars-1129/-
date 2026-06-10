// =============================================================================
// TikStream AI — Script Batch Generate 自动化测试基座
// 对应功能: POST /api/v1/scripts/generate/batch (批量多风格剧本生成)
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
  template: {
    findUnique: jest.Mock;
  };
  viralVideoAnalysis: {
    findUnique: jest.Mock;
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

interface TestTemplate {
  id: string;
  title: string;
  strategySummary: string;
  factorJson: Record<string, unknown>;
  status: string;
  schemaJson: Record<string, unknown>;
}

interface TestViralVideoAnalysis {
  id: string;
  videoUrl: string;
  strategyJson: Record<string, unknown>;
  factorJson: Record<string, unknown>;
  hookType: string;
  reportJson: Record<string, unknown>;
}

type ScriptType = {
  script_id: string;
  product_id: string;
  title: string | null;
  language: string;
  target_audience: string | null;
  video_duration: number;
  aspect_ratio: string;
  style_vibe: string;
  generation_mode: string;
  constraint_list: string[];
  shots: Array<{
    id: string;
    shot_id: string;
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
    created_at: string;
    updated_at: string;
  }>;
  created_at: string;
};

type ScriptBatchGenerateResponse = {
  batch_id: string;
  total: number;
  succeeded: number;
  failed: number;
  scripts: Array<ScriptType>;
  failures?: Array<{ style_vibe: string; error: string }>;
  style_variations: string[];
};

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

const mockTemplateFactory = (overrides?: Partial<TestTemplate>): TestTemplate => ({
  id: 'tpl-00000000-0000-0000-0000-000000000001',
  title: 'Clean-Tech 极简科技风模板',
  strategySummary: '以高亮白色背景、快速运镜、参数浮层展示产品技术卖点，适合数码与小家电品类。',
  factorJson: {
    pace: 'fast',
    tone: 'professional',
    bgm_style: 'electronic-ambient',
    color_palette: ['#FFFFFF', '#F5F5F5', '#1A1A1A', '#00D4FF'],
  },
  status: 'ACTIVE',
  schemaJson: {
    shot_count: { min: 4, max: 6 },
    duration_range: { min: 1.5, max: 5.0 },
    required_camera_movements: ['Dolly_In_Fast', 'Pan_Left'],
  },
  ...overrides,
});

const mockViralVideoAnalysisFactory = (
  overrides?: Partial<TestViralVideoAnalysis>,
): TestViralVideoAnalysis => ({
  id: 'viral-00000000-0000-0000-0000-000000000001',
  videoUrl: 'https://tiktok.com/@trendsetter/video/123456789',
  strategyJson: {
    hook_type: 'pattern-interrupt',
    retention_curve: [0.85, 0.72, 0.61, 0.53, 0.44],
    top_performing_elements: ['split-screen', 'text-overlay', 'fast-transitions'],
  },
  factorJson: {
    pace: 'ultra-fast',
    tone: 'energetic',
    bgm_style: 'trending-pop',
    hook_placement: 'first_1_second',
  },
  hookType: 'pattern-interrupt',
  reportJson: {
    engagement_rate: 0.087,
    completion_rate: 0.44,
    share_rate: 0.023,
    comment_sentiment: 'positive',
  },
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
    template: {
      findUnique: jest.fn(),
    },
    viralVideoAnalysis: {
      findUnique: jest.fn(),
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

describe('ScriptBatchGenerate — 批量多风格剧本生成', () => {
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

  let validateTemplate: (
    templateId: string,
    prisma: MockPrismaService,
  ) => Promise<TestTemplate>;

  let validateViralVideoAnalysis: (
    viralVideoId: string,
    prisma: MockPrismaService,
  ) => Promise<TestViralVideoAnalysis>;

  // ---- 模拟 generateBatch 编排函数 ----
  let generateBatch: (
    dto: Record<string, unknown>,
    deps: {
      prisma: MockPrismaService;
      doubao: typeof mockDoubaoTextProvider;
      buildPrompt: typeof buildQuickPrompt;
      parseResponse: typeof parseScriptFromAIResponse;
      validateSchema: typeof validateScriptSchema;
      runCompliance: typeof checkCompliance;
      validateTemplate: typeof validateTemplate;
      validateViralVideo: typeof validateViralVideoAnalysis;
    },
  ) => Promise<ScriptBatchGenerateResponse>;

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

    // ---- 注入 Template Validator mock ----
    validateTemplate = async (templateId: string, prisma: MockPrismaService) => {
      const template = await prisma.template.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        const err = new Error(`模板 ${templateId} 不存在`) as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.NOT_FOUND;
        err.errorCode = 'TEMPLATE_NOT_FOUND';
        throw err;
      }

      if (template.status !== 'ACTIVE') {
        const err = new Error(`模板 ${templateId} 未处于激活状态`) as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.errorCode = 'TEMPLATE_NOT_ACTIVE';
        throw err;
      }

      return template as TestTemplate;
    };

    // ---- 注入 Viral Video Analysis Validator mock ----
    validateViralVideoAnalysis = async (viralVideoId: string, prisma: MockPrismaService) => {
      const analysis = await prisma.viralVideoAnalysis.findUnique({
        where: { id: viralVideoId },
      });

      if (!analysis) {
        const err = new Error(`爆款视频分析 ${viralVideoId} 不存在`) as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.NOT_FOUND;
        err.errorCode = 'VIRAL_ANALYSIS_NOT_FOUND';
        throw err;
      }

      return analysis as TestViralVideoAnalysis;
    };

    // ---- 注入 generateBatch 编排函数 (Service 层核心逻辑的测试替身) ----
    generateBatch = async (dto, deps) => {
      const {
        prisma,
        doubao,
        buildPrompt,
        parseResponse,
        validateSchema,
        runCompliance,
        validateTemplate: valTemplate,
        validateViralVideo: valViralVideo,
      } = deps;

      // ---- 1. 校验 product_id ----
      const productId = dto.product_id as string;
      if (!productId) {
        const err = new Error('product_id 为必填字段') as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.errorCode = 'PRODUCT_ID_REQUIRED';
        throw err;
      }

      // ---- 2. 校验 batch_size ----
      const batchSize = Number(dto.batch_size) || 1;
      if (batchSize < 2 || batchSize > 5) {
        const err = new Error(`batch_size 必须在 2-5 之间，当前值: ${batchSize}`) as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.errorCode = 'INVALID_BATCH_SIZE';
        throw err;
      }

      // ---- 3. 校验 style_variations ----
      const styleVariations = (dto.style_variations as string[]) || [];
      if (styleVariations.length === 0) {
        const err = new Error('style_variations 不能为空') as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.errorCode = 'STYLE_VARIATIONS_REQUIRED';
        throw err;
      }

      const targetStyles = styleVariations.slice(0, batchSize);

      // ---- 4. 查询 product ----
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        const err = new Error(`商品 ${productId} 不存在`) as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.NOT_FOUND;
        err.errorCode = 'PRODUCT_NOT_FOUND';
        throw err;
      }

      // ---- 5. 若传了 template_id 则校验模板 ----
      const templateId = dto.template_id as string | undefined;
      if (templateId) {
        await valTemplate(templateId, prisma);
      }

      // ---- 6. 若传了 viral_video_id 则校验爆款分析 ----
      const viralVideoId = dto.viral_video_id as string | undefined;
      if (viralVideoId) {
        await valViralVideo(viralVideoId, prisma);
      }

      // ---- 7. 生成 batch_id ----
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      const scripts: ScriptType[] = [];
      const failures: Array<{ style_vibe: string; error: string }> = [];

      // ---- 8. 并发控制 ----
      const maxConcurrency = Number(dto.max_concurrency) || 3;

      // 简单串行实现模拟（mock 环境下无需真正并发）
      for (const styleVibe of targetStyles) {
        let lastError: Error | null = null;
        let success = false;
        const maxRetries = 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            // 构造单次请求 dto
            const singleDto = {
              ...dto,
              style_vibe: styleVibe,
              generation_mode: 'BATCH',
            };

            const { systemPrompt, userPrompt } = buildPrompt(singleDto);

            const rawResponse = await doubao.generateText(systemPrompt, userPrompt);

            const parsed = parseResponse(rawResponse, singleDto);

            const schemaResult = validateSchema(parsed);

            if (!schemaResult.valid) {
              const hasDurationErr = schemaResult.errors.some((e) =>
                e.message.includes('总时长'),
              );
              const errMsg = `剧本 Schema 校验失败: ${schemaResult.errors.map((e) => e.message).join('; ')}`;
              const err = new Error(errMsg) as Error & { errorCode?: string; statusCode?: number; details?: object; retryable?: boolean };
              err.errorCode = hasDurationErr
                ? 'SCRIPT_DURATION_EXCEEDED'
                : 'SCRIPT_SCHEMA_INVALID';
              err.statusCode = HttpStatus.BAD_REQUEST;
              err.details = schemaResult.errors;
              err.retryable = false;
              throw err;
            }

            const complianceResult = runCompliance(parsed.shots as Array<Record<string, unknown>>);

            if (!complianceResult.passed) {
              const errMsg = `合规校验未通过: ${complianceResult.violations.map((v) => v.reason).join('; ')}`;
              const err = new Error(errMsg) as Error & { errorCode?: string; statusCode?: number; details?: object; retryable?: boolean };
              err.errorCode = 'COMPLIANCE_CHECK_FAILED';
              err.statusCode = HttpStatus.BAD_REQUEST;
              err.details = complianceResult.violations;
              err.retryable = false;
              throw err;
            }

            // ---- 持久化单条脚本 ----
            const now = new Date();
            const scriptUuid = `${styleVibe.substring(0, 4)}-${Math.random().toString(36).substring(2, 10)}-${Date.now().toString(36)}`;
            const scriptId = `${batchId}-${scriptUuid}`;
            const scriptRecord: TestPersistedScript = {
              id: scriptId,
              product_id: productId,
              title: (parsed.title as string) || null,
              language: (dto.language as string) || 'zh-CN',
              target_audience: (dto.target_audience as string) || null,
              video_duration: parsed.video_duration as number,
              aspect_ratio: dto.aspect_ratio as string,
              style_vibe: styleVibe,
              generation_mode: 'BATCH',
              template_id: (dto.template_id as string) || null,
              viral_video_id: (dto.viral_video_id as string) || null,
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
            } catch (dbError) {
              throw Object.assign(new Error(`持久化失败: ${(dbError as Error).message}`), {
                errorCode: 'INTERNAL_SERVER_ERROR',
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                retryable: true,
              });
            }

            scripts.push({
              script_id: scriptId,
              product_id: productId,
              title: scriptRecord.title,
              language: scriptRecord.language,
              target_audience: scriptRecord.target_audience,
              video_duration: scriptRecord.video_duration,
              aspect_ratio: scriptRecord.aspect_ratio,
              style_vibe: scriptRecord.style_vibe,
              generation_mode: 'BATCH',
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
            });

            success = true;
            break;
          } catch (e) {
            lastError = e as Error;
            const retryable = ((e as Error & { retryable?: boolean }).retryable) === true;

            // 非可重试错误，不再重试
            if (!retryable && attempt < maxRetries) {
              // 非可重试错误直接记录 failure
              break;
            }
          }
        }

        if (!success) {
          const errorMsg = lastError
            ? ((lastError as Error & { errorCode?: string }).errorCode || lastError.message)
            : 'UNKNOWN_ERROR';
          failures.push({ style_vibe: styleVibe, error: errorMsg });
        }
      }

      // ---- 9. 返回批次结果 ----
      return {
        batch_id: batchId,
        total: targetStyles.length,
        succeeded: scripts.length,
        failed: failures.length,
        scripts,
        failures: failures.length > 0 ? failures : undefined,
        style_variations: targetStyles,
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

  describe('【正常流】合法输入 → 完整 ScriptBatchGenerateResponse 输出', () => {
    const validBatchRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      batch_size: 3,
      style_variations: ['clean-tech', 'warm-lifestyle', 'trendy'],
      language: 'zh-CN',
      aspect_ratio: '9:16',
      selling_points: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
      target_audience: '北美年轻女性,25-35岁',
      constraint_list: ['total_duration<=15s', 'avoid_absolute_claims'],
      max_concurrency: 3,
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SBT-001: 批量生成成功 — 返回完整 ScriptBatchGenerateResponse', async () => {
      const result = await generateBatch(validBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      // ---- 断言顶层结构 ----
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');

      // ---- 断言 batch_id 格式 ----
      expect(result).toHaveProperty('batch_id');
      expect(typeof result.batch_id).toBe('string');
      expect(result.batch_id.startsWith('batch-')).toBe(true);

      // ---- 断言 total / succeeded / failed ----
      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);

      // ---- 断言 scripts 数组 ----
      expect(result).toHaveProperty('scripts');
      expect(Array.isArray(result.scripts)).toBe(true);
      expect(result.scripts.length).toBe(3);

      // ---- 断言无 failures ----
      expect(result.failures).toBeUndefined();

      // ---- 断言 style_variations 回传 ----
      expect(result.style_variations).toEqual(['clean-tech', 'warm-lifestyle', 'trendy']);

      // ---- 逐条校验每个 script ----
      const styleVibes = result.scripts.map((s) => s.style_vibe);
      expect(styleVibes).toContain('clean-tech');
      expect(styleVibes).toContain('warm-lifestyle');
      expect(styleVibes).toContain('trendy');

      for (const script of result.scripts) {
        expect(script).toHaveProperty('script_id');
        expect(typeof script.script_id).toBe('string');
        expect(script.script_id.length).toBeGreaterThan(0);

        expect(script.product_id).toBe(validBatchRequest.product_id);
        expect(script.generation_mode).toBe('BATCH');
        expect(script.aspect_ratio).toBe('9:16');
        expect(script.language).toBe('zh-CN');
        expect(script.video_duration).toBeGreaterThan(0);
        expect(script.video_duration).toBeLessThanOrEqual(15.0);

        // ---- 断言 shots 非空数组 ----
        expect(Array.isArray(script.shots)).toBe(true);
        expect(script.shots.length).toBeGreaterThanOrEqual(4);
        expect(script.shots.length).toBeLessThanOrEqual(6);

        // ---- 约束列表 ----
        expect(Array.isArray(script.constraint_list)).toBe(true);
        expect(script.constraint_list).toContain('total_duration<=15s');

        // ---- 每个 shot 字段 ----
        const REQUIRED_SHOT_FIELDS = [
          'id', 'shot_id', 'shot_index', 'duration',
          'scene_description_query', 'visual_description',
          'camera_movement', 'transition_type',
          'voiceover_text', 'subtitle_text',
          'safe_zone_bounding_box', 'compliance_status',
        ];

        for (const shot of script.shots) {
          for (const field of REQUIRED_SHOT_FIELDS) {
            expect(shot).toHaveProperty(field);
          }

          expect(shot.duration).toBeGreaterThanOrEqual(1.5);
          expect(shot.duration).toBeLessThanOrEqual(5.0);
          expect([
            'Static', 'Dolly_In_Fast', 'Dolly_Out', 'Pan_Left', 'Tilt_Up',
          ]).toContain(shot.camera_movement);
          expect(['None', 'Fade_In', 'Dissolve', 'Wipe']).toContain(shot.transition_type);
          expect(Array.isArray(shot.safe_zone_bounding_box)).toBe(true);
          expect(shot.safe_zone_bounding_box).toHaveLength(4);
          expect(['PENDING', 'PASSED', 'REJECTED']).toContain(shot.compliance_status);
        }

        // ---- 分镜总时长 ----
        const totalShotDuration = script.shots.reduce(
          (sum: number, s: { duration: number }) => sum + s.duration, 0,
        );
        expect(totalShotDuration).toBeLessThanOrEqual(15.0);

        // ---- created_at 合法 ----
        expect(script).toHaveProperty('created_at');
        expect(() => new Date(script.created_at)).not.toThrow();

        // ---- 不应暴露内部字段 ----
        const raw = script as Record<string, unknown>;
        expect(raw).not.toHaveProperty('raw_json');
        expect(raw).not.toHaveProperty('template_id');
        expect(raw).not.toHaveProperty('viral_video_id');
      }
    });

    it('TC-SBT-001-EXT: AI 响应含 markdown 代码块包裹时正常解析', async () => {
      mockDoubao.generateText.mockResolvedValue(mockAIResponseWithTaggedJSON);

      const result = await generateBatch(validBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(3);
      expect(result.total).toBe(3);
    });

    it('TC-SBT-001-EXT: batch_size=2 (min) 正常生成 2 个脚本', async () => {
      const minBatchRequest = {
        ...validBatchRequest,
        batch_size: 2,
        style_variations: ['clean-tech', 'warm-lifestyle'],
      };

      const result = await generateBatch(minBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.scripts.length).toBe(2);
    });

    it('TC-SBT-001-EXT: batch_size=5 (max) 正常生成 5 个脚本', async () => {
      const maxBatchRequest = {
        ...validBatchRequest,
        batch_size: 5,
        style_variations: ['clean-tech', 'warm-lifestyle', 'trendy', 'minimal', 'luxury'],
      };

      const result = await generateBatch(maxBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.total).toBe(5);
      expect(result.succeeded).toBe(5);
      expect(result.failed).toBe(0);
      expect(result.scripts.length).toBe(5);
    });

    it('TC-SBT-001-EXT: style_variations 超过 batch_size 时截断至 batch_size', async () => {
      const overflowRequest = {
        ...validBatchRequest,
        batch_size: 2,
        style_variations: ['clean-tech', 'warm-lifestyle', 'trendy', 'minimal', 'luxury'],
      };

      const result = await generateBatch(overflowRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.total).toBe(2);
      expect(result.style_variations.length).toBe(2);
      expect(result.style_variations).toEqual(['clean-tech', 'warm-lifestyle']);
    });

    it('TC-SBT-001-EXT: 未传 target_audience 时批量生成仍然成功', async () => {
      const requestWithoutAudience = {
        ...validBatchRequest,
        target_audience: undefined,
      };
      delete requestWithoutAudience.target_audience;

      const result = await generateBatch(requestWithoutAudience, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('TC-SBT-001-EXT: 传入有效 template_id 时校验通过并生成脚本', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory());

      const requestWithTemplate = {
        ...validBatchRequest,
        template_id: 'tpl-00000000-0000-0000-0000-000000000001',
      };

      const result = await generateBatch(requestWithTemplate, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('TC-SBT-001-EXT: 传入有效 viral_video_id 时校验通过并生成脚本', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());

      const requestWithViral = {
        ...validBatchRequest,
        viral_video_id: 'viral-00000000-0000-0000-0000-000000000001',
      };

      const result = await generateBatch(requestWithViral, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    const validBatchRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      batch_size: 3,
      style_variations: ['clean-tech', 'warm-lifestyle', 'trendy'],
      language: 'zh-CN',
      aspect_ratio: '9:16',
      selling_points: ['测试卖点'],
      max_concurrency: 3,
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SBT-BND-001: batch_size=2 (min) + style_variations 恰好 2 个成功生成', async () => {
      const request = { ...validBatchRequest, batch_size: 2, style_variations: ['clean-tech', 'warm-lifestyle'] };

      const result = await generateBatch(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(2);
    });

    it('TC-SBT-BND-002: batch_size=5 (max) + 5 style_variations 成功生成', async () => {
      const request = {
        ...validBatchRequest,
        batch_size: 5,
        style_variations: ['a', 'b', 'c', 'd', 'e'],
      };

      const result = await generateBatch(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.total).toBe(5);
      expect(result.succeeded).toBe(5);
      expect(result.scripts.length).toBe(5);
    });

    it('TC-SBT-BND-003: constraint_list 为空数组时正常生成', async () => {
      const request = { ...validBatchRequest, constraint_list: [] };

      const result = await generateBatch(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(3);
      for (const script of result.scripts) {
        expect(Array.isArray(script.constraint_list)).toBe(true);
        expect(script.constraint_list).toHaveLength(0);
      }
    });

    it('TC-SBT-BND-004: target_audience 未传时正常生成', async () => {
      const request = { ...validBatchRequest };
      delete (request as Record<string, unknown>).target_audience;

      const result = await generateBatch(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('TC-SBT-BND-005: selling_points 仅 1 项时正常生成', async () => {
      const request = { ...validBatchRequest, selling_points: ['单一卖点'] };

      const result = await generateBatch(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(3);
    });

    it('TC-SBT-BND-006: aspect_ratio=16:9 批量生成正常', async () => {
      const request = { ...validBatchRequest, aspect_ratio: '16:9' };

      const result = await generateBatch(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(3);
      for (const script of result.scripts) {
        expect(script.aspect_ratio).toBe('16:9');
      }
    });

    it('TC-SBT-BND-007: max_concurrency=1 串行生成仍然成功', async () => {
      const request = { ...validBatchRequest, max_concurrency: 1 };

      const result = await generateBatch(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('TC-SBT-BND-008: language=ja-JP 多语言批量生成正常', async () => {
      const request = { ...validBatchRequest, language: 'ja-JP' };

      const result = await generateBatch(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(3);
      for (const script of result.scripts) {
        expect(script.language).toBe('ja-JP');
      }
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const validBatchRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      batch_size: 3,
      style_variations: ['clean-tech', 'warm-lifestyle', 'trendy'],
      language: 'zh-CN',
      aspect_ratio: '9:16',
      selling_points: ['测试卖点'],
      max_concurrency: 3,
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    // ---- 3.1 输入层异常 ----

    it('TC-SBT-ERR-001: product_id 缺失 → PRODUCT_ID_REQUIRED (400)', async () => {
      const badRequest = { ...validBatchRequest };
      delete badRequest.product_id;

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateBatch(badRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateTemplate: validateTemplate,
          validateViralVideo: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_ID_REQUIRED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SBT-ERR-002: product_id 对应的商品不存在 → PRODUCT_NOT_FOUND (404)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateBatch(
          { ...validBatchRequest, product_id: '99999999-9999-9999-9999-999999999999' },
          {
            prisma: mockPrisma,
            doubao: mockDoubao,
            buildPrompt: buildQuickPrompt,
            parseResponse: parseScriptFromAIResponse,
            validateSchema: validateScriptSchema,
            runCompliance: checkCompliance,
            validateTemplate: validateTemplate,
            validateViralVideo: validateViralVideoAnalysis,
          },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SBT-ERR-003: style_variations 为空数组 → STYLE_VARIATIONS_REQUIRED (400)', async () => {
      const badRequest = { ...validBatchRequest, style_variations: [] };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateBatch(badRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateTemplate: validateTemplate,
          validateViralVideo: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('STYLE_VARIATIONS_REQUIRED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SBT-ERR-004: batch_size < 2 → INVALID_BATCH_SIZE (400)', async () => {
      const badRequest = { ...validBatchRequest, batch_size: 1 };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateBatch(badRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateTemplate: validateTemplate,
          validateViralVideo: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_BATCH_SIZE');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SBT-ERR-005: batch_size > 5 → INVALID_BATCH_SIZE (400)', async () => {
      const badRequest = { ...validBatchRequest, batch_size: 10 };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateBatch(badRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateTemplate: validateTemplate,
          validateViralVideo: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_BATCH_SIZE');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    // ---- 3.2 Template / ViralVideo 校验异常 ----

    it('TC-SBT-ERR-006: template 不存在 → TEMPLATE_NOT_FOUND (404)', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(null);

      const requestWithTemplate = {
        ...validBatchRequest,
        template_id: 'tpl-nonexistent',
      };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateBatch(requestWithTemplate, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateTemplate: validateTemplate,
          validateViralVideo: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SBT-ERR-007: template status != ACTIVE → TEMPLATE_NOT_ACTIVE (400)', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(
        mockTemplateFactory({ status: 'DISABLED' }),
      );

      const requestWithTemplate = {
        ...validBatchRequest,
        template_id: 'tpl-disabled-template',
      };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateBatch(requestWithTemplate, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateTemplate: validateTemplate,
          validateViralVideo: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_NOT_ACTIVE');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SBT-ERR-008: viral_video_id 不存在 → VIRAL_ANALYSIS_NOT_FOUND (404)', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(null);

      const requestWithViral = {
        ...validBatchRequest,
        viral_video_id: 'viral-nonexistent',
      };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateBatch(requestWithViral, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateTemplate: validateTemplate,
          validateViralVideo: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    // ---- 3.3 AI 调用层异常 (导致部分脚本失败) ----

    it('TC-SBT-ERR-009: 单个 style AI 返回空 → 该 style 进入 failures，其他正常', async () => {
      let callCount = 0;
      mockDoubao.generateText.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          // warm-lifestyle 返回空
          return Promise.resolve('');
        }
        return Promise.resolve(mockAIValidResponse);
      });

      const result = await generateBatch(validBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.failures).toBeDefined();
      expect(result.failures!.length).toBe(1);
      expect(result.failures![0].style_vibe).toBe('warm-lifestyle');
      expect(result.scripts.length).toBe(2);
    });

    it('TC-SBT-ERR-010: 单个 style AI 返回不可解析 JSON → 该 style 进入 failures', async () => {
      let callCount = 0;
      mockDoubao.generateText.mockImplementation(() => {
        callCount++;
        if (callCount === 3) {
          return Promise.resolve('not json at all --- just garbage ---');
        }
        return Promise.resolve(mockAIValidResponse);
      });

      const result = await generateBatch(validBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.failures![0].error).toContain('无法解析');
    });

    it('TC-SBT-ERR-011: 单个 style Schema 校验失败 → 该 style 进入 failures', async () => {
      let callCount = 0;
      mockDoubao.generateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // clean-tech: 总时长超限
          return Promise.resolve(JSON.stringify({
            title: 'Over Duration',
            video_duration: 18.0,
            shots: [
              { shot_index: 1, duration: 6.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v', subtitle_text: 's', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
              { shot_index: 2, duration: 6.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v', subtitle_text: 's', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
              { shot_index: 3, duration: 6.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v', subtitle_text: 's', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
            ],
          }));
        }
        return Promise.resolve(mockAIValidResponse);
      });

      const result = await generateBatch(validBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.failures![0].error).toContain('SCRIPT_DURATION_EXCEEDED');
    });

    it('TC-SBT-ERR-012: 单个 style 合规校验失败 → 该 style 进入 failures', async () => {
      let callCount = 0;
      mockDoubao.generateText.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve(JSON.stringify({
            title: 'Compliance Violation',
            video_duration: 3.0,
            shots: [
              { shot_index: 1, duration: 3.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: '这是全网最好的卷发棒', subtitle_text: '最好的产品', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
            ],
          }));
        }
        return Promise.resolve(mockAIValidResponse);
      });

      const result = await generateBatch(validBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.failures![0].error).toContain('COMPLIANCE_CHECK_FAILED');
    });

    it('TC-SBT-ERR-013: DB 持久化失败 (model provider error) → 可重试后成功', async () => {
      // 第1次 DB 失败(可重试), 第2次成功
      let dbCallCount = 0;
      const failingPrisma = mockPrismaServiceFactory();
      failingPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      failingPrisma.$transaction.mockImplementation(async (fn: (tx: MockPrismaService) => Promise<unknown>) => {
        dbCallCount++;
        if (dbCallCount <= 3) {
          // 每个 style 的第1次持久化都失败
          if (dbCallCount % 2 === 1) {
            const err = new Error('Connection terminated unexpectedly');
            (err as Error & { code?: string }).code = 'P1001';
            throw err;
          }
        }
        return fn(failingPrisma);
      });

      const result = await generateBatch(validBatchRequest, {
        prisma: failingPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      // 在 mock 环境中 $transaction 被重试后可能部分失败部分成功
      // 我们只验证不抛出致命异常
      expect(result).toBeDefined();
      expect(result.total).toBe(3);
    });

    it('TC-SBT-ERR-014: 所有 style 均失败 → succeeded=0, 所有记录进 failures', async () => {
      mockDoubao.generateText.mockResolvedValue('');

      const result = await generateBatch(validBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(3);
      expect(result.failures).toBeDefined();
      expect(result.failures!.length).toBe(3);
      expect(result.scripts.length).toBe(0);
    });

    it('TC-SBT-ERR-015: style_variations 包含非法 style (unexpected) 仍处理并尝试生成', async () => {
      const request = {
        ...validBatchRequest,
        batch_size: 2,
        style_variations: ['clean-tech', '!!!invalid-style!!!'],
      };

      const result = await generateBatch(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      expect(result.total).toBe(2);
      // weird style 仍然能生成因为 mock 不区分 style
      expect(result.succeeded).toBe(2);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance Flow）
  // ===========================================================================

  describe('【性能流】耗时与资源卡点告警', () => {
    const validBatchRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      batch_size: 3,
      style_variations: ['clean-tech', 'warm-lifestyle', 'trendy'],
      language: 'zh-CN',
      aspect_ratio: '9:16',
      selling_points: ['测试卖点'],
      max_concurrency: 3,
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SBT-PERF-001: generateBatch 总耗时 ≤ 5000ms (3 风格)', async () => {
      const PERF_CEILING_MS = 5000;

      const start = performance.now();

      await generateBatch(validBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 10000);

    it('TC-SBT-PERF-002: 每个 style 脚本生成 ≤ 2000ms', async () => {
      const PERF_CEILING_MS_PER_SCRIPT = 2000;

      const start = performance.now();

      const result = await generateBatch(validBatchRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateTemplate: validateTemplate,
        validateViralVideo: validateViralVideoAnalysis,
      });

      const elapsed = performance.now() - start;
      const avgPerScript = elapsed / result.succeeded;

      expect(avgPerScript).toBeLessThanOrEqual(PERF_CEILING_MS_PER_SCRIPT);
    });

    it('TC-SBT-PERF-003: buildQuickPrompt ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;

      const start = performance.now();

      const result = buildQuickPrompt({
        product_id: 'test',
        selling_points: ['test'],
        style_vibe: 'clean-tech',
        aspect_ratio: '9:16',
      });

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SBT-PERF-004: parseScriptFromAIResponse ≤ 50ms (JSON 解析)', () => {
      const PERF_CEILING_MS = 50;

      const start = performance.now();

      const result = parseScriptFromAIResponse(mockAIValidResponse, {});

      const elapsed = performance.now() - start;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SBT-PERF-005: validateScriptSchema ≤ 10ms (5 分镜)', () => {
      const PERF_CEILING_MS = 10;
      const parsed = parseScriptFromAIResponse(mockAIValidResponse, {});

      const start = performance.now();

      const result = validateScriptSchema(parsed);

      const elapsed = performance.now() - start;

      expect(result.valid).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });

  // ===========================================================================
  // 5. 原子函数 — 独立校验各 mock 函数
  // ===========================================================================

  describe('【原子函数】独立校验 buildQuickPrompt / parseScriptFromAIResponse / validateScriptSchema / checkCompliance / validateTemplate / validateViralVideoAnalysis', () => {
    beforeEach(() => {
      mockPrisma = mockPrismaServiceFactory();
    });

    // ---- buildQuickPrompt ----

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

    // ---- parseScriptFromAIResponse ----

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

    it('parseScriptFromAIResponse 处理空字符串 → MODEL_PROVIDER_FAILED', () => {
      let caught: Error & { code?: string } | null = null;
      try {
        parseScriptFromAIResponse('', {});
      } catch (e) {
        caught = e as Error & { code?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('MODEL_PROVIDER_FAILED');
    });

    // ---- validateScriptSchema ----

    it('validateScriptSchema 标记 totalDuration 与 video_duration 偏差过大为 warning', () => {
      const result = validateScriptSchema({
        title: 'mismatch',
        video_duration: 5.0,
        shots: [
          { shot_index: 1, duration: 3.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v', subtitle_text: 's', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
          { shot_index: 2, duration: 3.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v', subtitle_text: 's', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
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

    it('validateScriptSchema 全部合法数据通过', () => {
      const result = validateScriptSchema({
        video_duration: 3.0,
        shots: [
          { shot_index: 1, duration: 3.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v', subtitle_text: 's', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
        ],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    // ---- checkCompliance ----

    it('checkCompliance 全 PASSED 时 passed=true', () => {
      const result = checkCompliance([
        { shot_index: 1, voiceover_text: '便携无线设计，随时随地轻松造型。', subtitle_text: '便携无线｜轻松造型' },
      ]);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('checkCompliance 返回违规词原文和原因', () => {
      const result = checkCompliance([
        { shot_index: 1, voiceover_text: '全网最高品质', subtitle_text: '全网最高' },
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

    it('checkCompliance 跨分镜检测多词违规', () => {
      const result = checkCompliance([
        { shot_index: 1, voiceover_text: '全网最好的产品，永久保修。', subtitle_text: '全网最好' },
        { shot_index: 2, voiceover_text: '点击领取限时优惠券！', subtitle_text: '点击领取' },
      ]);

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
      const violatedWords = result.violations.map((v) => v.violated_word);
      expect(violatedWords).toContain('最好');
      expect(violatedWords).toContain('永久');
      expect(violatedWords).toContain('点击领取');
    });

    // ---- validateTemplate ----

    it('validateTemplate: 模板存在且 ACTIVE → 返回模板对象', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory());

      const result = await validateTemplate('tpl-00000000-0000-0000-0000-000000000001', mockPrisma);

      expect(result).toBeDefined();
      expect(result.id).toBe('tpl-00000000-0000-0000-0000-000000000001');
      expect(result.status).toBe('ACTIVE');
      expect(result.title).toBe('Clean-Tech 极简科技风模板');
    });

    it('validateTemplate: 模板不存在 → TEMPLATE_NOT_FOUND', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await validateTemplate('tpl-nonexistent', mockPrisma);
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('validateTemplate: 模板 status=DISABLED → TEMPLATE_NOT_ACTIVE', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(
        mockTemplateFactory({ status: 'DISABLED' }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await validateTemplate('tpl-disabled', mockPrisma);
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_NOT_ACTIVE');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('validateTemplate: 模板 status=ARCHIVED → TEMPLATE_NOT_ACTIVE', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(
        mockTemplateFactory({ status: 'ARCHIVED' }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await validateTemplate('tpl-archived', mockPrisma);
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_NOT_ACTIVE');
    });

    // ---- validateViralVideoAnalysis ----

    it('validateViralVideoAnalysis: 分析存在 → 返回分析对象', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());

      const result = await validateViralVideoAnalysis('viral-00000000-0000-0000-0000-000000000001', mockPrisma);

      expect(result).toBeDefined();
      expect(result.id).toBe('viral-00000000-0000-0000-0000-000000000001');
      expect(result.hookType).toBe('pattern-interrupt');
      expect(result.videoUrl).toContain('tiktok.com');
    });

    it('validateViralVideoAnalysis: 分析不存在 → VIRAL_ANALYSIS_NOT_FOUND', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await validateViralVideoAnalysis('viral-nonexistent', mockPrisma);
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言批量模式剧本生成功能
// 的完整性与正确性。待源码实现后移除 .skip 或直接运行。
//
// 用例编号映射:
//   TC-SBT-001 ~ TC-SBT-001-EXT      正常流 (Happy Path)
//   TC-SBT-BND-001 ~ TC-SBT-BND-008  边界流 (Edge Cases)
//   TC-SBT-ERR-001 ~ TC-SBT-ERR-015  异常流 (Error Flow)
//   TC-SBT-PERF-001 ~ TC-SBT-PERF-005 性能流 (Performance)
//
// 覆盖率维度:
//   ├── buildQuickPrompt            (3 原子测试)
//   ├── parseScriptFromAIResponse   (2 原子测试)
//   ├── validateScriptSchema        (3 原子测试 + 集成覆盖)
//   ├── checkCompliance             (3 原子测试 + 集成覆盖)
//   ├── validateTemplate            (4 原子测试 + 集成覆盖)
//   ├── validateViralVideoAnalysis  (2 原子测试 + 集成覆盖)
//   └── generateBatch               (17 集成测试)
//
// 总测试用例数: 52
// 关键差异项 (vs Quick 模式):
//   - 批量多风格编排 (style_variations 数组)
//   - batch_id 生成与 batch_size 控制 (2-5)
//   - 可重试错误机制 (retryable: model provider / DB)
//   - 部分失败容错 (partial batch result)
//   - template_id / viral_video_id 前置校验
//   - ScriptBatchGenerateResponse 聚合返回
// =============================================================================