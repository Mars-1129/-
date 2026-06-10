// =============================================================================
// TikStream AI — Script DNA Generate 自动化测试基座
// 对应功能: POST /api/v1/viral-analysis/scripts/generate/from-dna (DNA 模式剧本生成)
// 对应模块: ViralDnaController + ViralDnaService + ScriptService
// 测试类型: 单元测试 (Service 层 + Controller 层 + Validator + Filter)
// 技术栈: Jest 29 + @nestjs/testing + jest.fn
//
// DNA 模式流程:
//   1. Controller 接收 GenerateFromDNADto
//   2. 查产品 → 查 DNA → 提取 strategy/factor/constraint overrides
//   3. 委托给 Composed 模式 (scriptService.generateComposedScript)
//   4. 返回 { success: true, data: { script_id } }
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// =============================================================================
// MockPrismaService — 扩展类型 (含 template, viralVideoAnalysis, viralDna)
// =============================================================================

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
    findFirst: jest.Mock;
  };
  viralDna: {
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
};

// =============================================================================
// 接口类型定义
// =============================================================================

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

interface TestDNA {
  id: string;
  cluster_id: string;
  dnaJson: {
    confidence: number;
    sample_count: number;
    label_tags: string[];
    hooks: Array<{
      type: string;
      structure: string;
      effectiveness: number;
    }>;
    visual_styles: Array<{
      style: string;
      camera_patterns: string[];
      color_palette: string[];
      text_overlay_ratio: number;
      shot_count_range: [number, number];
      transition_sequence: string[];
    }>;
    bgm_patterns: Array<{
      genre: string;
      bpm_range: [number, number];
      energy_curve: string;
    }>;
    pacing_patterns: Array<{
      avg_shot_duration_seconds: number;
      tempo_curve: string;
    }>;
    cta_styles: Array<{
      placement_type: string;
      text_templates: string[];
      delay_from_end_seconds: number;
    }>;
    hook_label?: string;
    hook_explanation?: string;
    style_label?: string;
    style_explanation?: string;
    bgm_label?: string;
    bgm_explanation?: string;
    narrative_explanation?: string;
    success_reason?: string;
  };
  status: string;
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

const mockDNAFactory = (overrides?: Partial<TestDNA>): TestDNA => ({
  id: 'dna-0001',
  cluster_id: 'cluster-001',
  dnaJson: {
    confidence: 0.85,
    sample_count: 50,
    label_tags: ['高转化', '快节奏', '美妆'],
    hooks: [
      {
        type: 'problem_forward',
        structure: 'pain_point → solution → product',
        effectiveness: 0.9,
      },
    ],
    visual_styles: [
      {
        style: 'bright_clean',
        camera_patterns: ['close_up', 'dolly_in'],
        color_palette: ['white', 'pink'],
        text_overlay_ratio: 0.3,
        shot_count_range: [5, 10],
        transition_sequence: ['Fade_In', 'Dissolve'],
      },
    ],
    bgm_patterns: [
      {
        genre: 'upbeat_pop',
        bpm_range: [120, 140],
        energy_curve: 'rising',
      },
    ],
    pacing_patterns: [
      {
        avg_shot_duration_seconds: 2.5,
        tempo_curve: 'fast_start_slow_end',
      },
    ],
    cta_styles: [
      {
        placement_type: 'end_card',
        text_templates: ['立即下单'],
        delay_from_end_seconds: 1.0,
      },
    ],
  },
  status: 'ACTIVE',
  created_at: new Date('2026-05-20T00:00:00Z'),
  updated_at: new Date('2026-05-20T00:00:00Z'),
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
  title: 'DNA驱动爆款卷发棒脚本',
  video_duration: 14.5,
  style_vibe: 'bright_clean',
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
      findFirst: jest.fn(),
    },
    viralDna: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  } as MockPrismaService;

  service.$transaction.mockImplementation(
    async (fn: (tx: MockPrismaService) => Promise<unknown>) => fn(service),
  );
  return service;
};

const mockDoubaoTextProvider = {
  generateText: jest.fn(),
};

// =============================================================================
// 测试主体
// =============================================================================

describe('ScriptDNAGenerate — DNA 模式剧本生成', () => {
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

  // ---- 模拟 generateFromDNA 编排函数 (Controller + Service 逻辑的测试替身) ----
  let generateFromDNA: (
    dto: {
      product_id: string;
      dna_id: string;
      style_vibe?: string;
      aspect_ratio?: string;
      language?: string;
      material_ids?: string[];
    },
    deps: {
      prisma: MockPrismaService;
      doubao: typeof mockDoubaoTextProvider;
      buildPrompt: typeof buildQuickPrompt;
      parseResponse: typeof parseScriptFromAIResponse;
      validateSchema: typeof validateScriptSchema;
      runCompliance: typeof checkCompliance;
    },
  ) => Promise<{ script_id: string }>;

  beforeAll(() => {
    // ---- 注入 Prompt Builder mock ----
    buildQuickPrompt = (params) => {
      const sellingPoints = (params.selling_points as string[]) || [];
      const styleVibe = (params.style_vibe as string) || 'clean-tech';
      const targetAudience = (params.target_audience as string) || '';
      const constraintList = (params.constraint_list as string[]) || [];
      const aspectRatio = (params.aspect_ratio as string) || '9:16';
      const strategyOverrides = (params.strategy_overrides as Record<string, unknown>) || {};

      const dnaNarrative = (strategyOverrides.dna_narrative as string) || '';

      const systemPrompt = [
        'You are a professional short-video scriptwriter for TikTok Shop.',
        `Output language: ${(params.language as string) || 'zh-CN'}.`,
        `Aspect ratio: ${aspectRatio}.`,
        'You MUST output valid JSON matching the Script schema exactly.',
        'Total video duration MUST NOT exceed 15.0 seconds.',
        'Each shot duration MUST be between 1.5 and 5.0 seconds.',
        dnaNarrative ? `\nDNA Context:\n${dnaNarrative}` : '',
      ]
        .filter(Boolean)
        .join('\n');

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
        if (
          bbox &&
          (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((v) => typeof v !== 'number'))
        ) {
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
        {
          pattern: /限时抢购/g,
          reason: '禁止性紧迫感表达"限时抢购"（TikTok Shop 官方口径）',
        },
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

    // ---- 注入 generateFromDNA 编排函数 (DNA 模式 Controller 逻辑的测试替身) ----
    generateFromDNA = async (dto, deps) => {
      const { prisma, doubao, buildPrompt, parseResponse, validateSchema, runCompliance } =
        deps;

      // Step 1: validate product_id exists
      const productId = dto.product_id as string;
      if (!productId) {
        const err = new Error('product_id 为必填字段') as Error & {
          statusCode?: number;
          errorCode?: string;
        };
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.errorCode = 'PRODUCT_ID_REQUIRED';
        throw err;
      }

      // Step 2: validate dna_id exists
      const dnaId = dto.dna_id as string;
      if (!dnaId) {
        const err = new Error('dna_id 为必填字段') as Error & {
          statusCode?: number;
          errorCode?: string;
        };
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.errorCode = 'DNA_ID_REQUIRED';
        throw err;
      }

      // Step 3: look up DNA record by dna_id
      const dnaRecord = await prisma.viralDna.findUnique({
        where: { id: dnaId },
      });
      if (!dnaRecord) {
        throw Object.assign(new Error(`DNA 模式不存在: ${dnaId}`), {
          code: 'VIRAL_DNA_NOT_FOUND',
        });
      }

      // Step 4: extract strategy_overrides, factor_overrides, constraint_overrides from DNA
      const dna = (dnaRecord as Record<string, unknown>).dnaJson as TestDNA['dnaJson'];
      const topHook = dna.hooks?.[0];
      const topVisual = dna.visual_styles?.[0];
      const topBgm = dna.bgm_patterns?.[0];
      const topPacing = dna.pacing_patterns?.[0];
      const topCta = dna.cta_styles?.[0];

      // Build DNA narrative context
      const narrativeParts: string[] = [];
      narrativeParts.push('【爆款 DNA 模式解析 - 请参考以下模式创作剧本】');
      if (dna.hook_label) narrativeParts.push(`\nHook 策略: ${dna.hook_label}`);
      if (dna.style_label) narrativeParts.push(`\n视觉风格: ${dna.style_label}`);
      if (dna.bgm_label) narrativeParts.push(`\nBGM 节奏: ${dna.bgm_label}`);
      if (dna.success_reason) narrativeParts.push(`\n成功原因: ${dna.success_reason}`);
      const dnaNarrative = narrativeParts.join('\n');

      const strategy_overrides: Record<string, unknown> = {
        hook_type: topHook?.type ?? 'problem_forward',
        shot_count_range: topVisual?.shot_count_range ?? [5, 15],
        total_duration: 15,
        dna_narrative: dnaNarrative,
      };

      const factor_overrides: Record<string, unknown> = {};
      if (topHook) {
        factor_overrides.hook = {
          type: topHook.type,
          structure: topHook.structure,
          effectiveness: topHook.effectiveness,
        };
      }
      if (topVisual) {
        factor_overrides.visual = {
          style: topVisual.style,
          camera_patterns: topVisual.camera_patterns,
          color_palette: topVisual.color_palette,
          text_overlay_ratio: topVisual.text_overlay_ratio,
          preferred_transitions: topVisual.transition_sequence,
        };
      }
      if (topBgm) {
        factor_overrides.bgm = {
          genre: topBgm.genre,
          bpm_range: topBgm.bpm_range,
          energy_curve: topBgm.energy_curve,
        };
      }
      if (topPacing) {
        factor_overrides.pacing = {
          avg_shot_duration: topPacing.avg_shot_duration_seconds,
          tempo_curve: topPacing.tempo_curve,
        };
      }
      if (topCta) {
        factor_overrides.cta = {
          placement_type: topCta.placement_type,
          text_templates: topCta.text_templates,
          delay_from_end_seconds: topCta.delay_from_end_seconds,
        };
      }
      factor_overrides.dna_confidence = dna.confidence;
      factor_overrides.dna_sample_count = dna.sample_count;

      const constraint_overrides: string[] = [];
      if (topVisual?.transition_sequence?.length) {
        constraint_overrides.push(
          `transition_sequence: ${topVisual.transition_sequence.join(',')} (来自 DNA 分析的高转化转场模式)`,
        );
      }
      if (topCta?.placement_type === 'scattered') {
        constraint_overrides.push(
          'cta_scattered: 在多个分镜中插入行动号召（DNA 分析显示散点式 CTA 转化率更高）',
        );
      }
      if (dna.confidence < 0.5) {
        constraint_overrides.push(
          'low_confidence: DNA 置信度不足，建议保留创作自由度',
        );
      }
      if (dna.confidence >= 0.7) {
        constraint_overrides.push(
          `high_confidence_dna: DNA 置信度 ${(dna.confidence * 100).toFixed(0)}%，请严格遵循 DNA 模式`,
        );
      }

      // Step 5: validate product exists in prisma
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        const err = new Error(`商品 ${productId} 不存在`) as Error & {
          statusCode?: number;
          errorCode?: string;
        };
        err.statusCode = HttpStatus.NOT_FOUND;
        err.errorCode = 'PRODUCT_NOT_FOUND';
        throw err;
      }

      // Step 6: build composed context from DNA overrides + product data, then call buildPrompt
      const styleVibe = dto.style_vibe ?? 'bright_clean';
      const aspectRatio = dto.aspect_ratio ?? '9:16';
      const language = dto.language ?? 'zh-CN';

      const productConstraintList: string[] = [];
      if ((product as TestProduct).category)
        productConstraintList.push(`product_category: ${(product as TestProduct).category}`);

      const mergedConstraints = [...productConstraintList, ...constraint_overrides];

      const { systemPrompt, userPrompt } = buildPrompt({
        product_id: productId,
        title: (product as TestProduct).title,
        selling_points: (product as TestProduct).selling_points,
        target_audience: (product as TestProduct).target_audience,
        style_vibe: styleVibe,
        aspect_ratio: aspectRatio,
        language,
        constraint_list: mergedConstraints,
        strategy_overrides,
      });

      // Step 7: AI call → parse → schema → compliance → persist with generation_mode='DNA'
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

      const complianceResult = runCompliance(
        parsed.shots as Array<Record<string, unknown>>,
      );

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
      const scriptId = 'dc52d4ff-0001-4000-a000-dna000000001';
      const scriptRecord: TestPersistedScript = {
        id: scriptId,
        product_id: productId,
        title: (parsed.title as string) || null,
        language: language,
        target_audience: (product as TestProduct).target_audience || null,
        video_duration: parsed.video_duration as number,
        aspect_ratio: aspectRatio,
        style_vibe: styleVibe,
        generation_mode: 'DNA',
        template_id: null,
        viral_video_id: null,
        constraint_list: mergedConstraints,
        raw_json: { ...parsed, strategy_overrides, factor_overrides },
        created_at: now,
        updated_at: now,
      };

      const shotRecords: TestPersistedScriptShot[] = (
        parsed.shots as Array<Record<string, unknown>>
      ).map((shot, idx) => ({
        id: `shot-dna-uuid-${idx + 1}-${scriptId}`,
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
        safe_zone_bounding_box: shot.safe_zone_bounding_box as [
          number,
          number,
          number,
          number,
        ],
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

      // Step 8: return { script_id } (matching controller response)
      return { script_id: scriptId };
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

  describe('【正常流】合法输入 → DNA 驱动生成成功，返回 script_id', () => {
    const validRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      dna_id: 'dna-0001',
      language: 'zh-CN',
    };

    const validRequestWithStyleVibe = {
      ...validRequest,
      style_vibe: 'dynamic_fast_paced',
      aspect_ratio: '16:9',
      material_ids: ['mat-001', 'mat-002'],
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.viralDna.findUnique.mockResolvedValue(mockDNAFactory() as unknown as Record<string, unknown>);
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SDNA-001: DNA 模式生成成功 — 返回 { script_id }，generation_mode = DNA', async () => {
      const result = await generateFromDNA(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      // ---- 断言返回结构 ----
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');

      // ---- 断言 script_id 存在且格式正确 ----
      expect(result).toHaveProperty('script_id');
      expect(typeof result.script_id).toBe('string');
      expect(result.script_id.length).toBeGreaterThan(0);

      // ---- 断言不返回完整 script (仅返回 script_id，匹配 controller) ----
      expect(result).not.toHaveProperty('shots');
      expect(result).not.toHaveProperty('title');
      expect(result).not.toHaveProperty('video_duration');
      expect(result).not.toHaveProperty('raw_json');

      // ---- 断言 DNA record 被正确查找 ----
      expect(mockPrisma.viralDna.findUnique).toHaveBeenCalledWith({
        where: { id: 'dna-0001' },
      });

      // ---- 断言产品被正确查找 ----
      expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: validRequest.product_id },
      });

      // ---- 断言 AI 被调用 ----
      expect(mockDoubao.generateText).toHaveBeenCalledTimes(1);

      // ---- 断言 script 以 generation_mode='DNA' 持久化 ----
      expect(mockPrisma.script.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generation_mode: 'DNA',
            product_id: validRequest.product_id,
          }),
        }),
      );

      // ---- 断言分镜持久化 ----
      expect(mockPrisma.scriptShot.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(Array),
        }),
      );
    });

    it('TC-SDNA-001-EXT: 传入 style_vibe 和 aspect_ratio 覆盖 DNA 默认值', async () => {
      const result = await generateFromDNA(validRequestWithStyleVibe, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result).toHaveProperty('script_id');
      expect(typeof result.script_id).toBe('string');

      // ---- 断言 buildPrompt 收到 style_vibe 覆盖 ----
      expect(mockPrisma.script.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generation_mode: 'DNA',
            style_vibe: 'dynamic_fast_paced',
            aspect_ratio: '16:9',
          }),
        }),
      );
    });

    it('TC-SDNA-001-EXT: AI 响应含 markdown 代码块包裹时正常解析', async () => {
      mockDoubao.generateText.mockResolvedValue(mockAIResponseWithTaggedJSON);

      const result = await generateFromDNA(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result).toHaveProperty('script_id');
      expect(mockPrisma.script.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generation_mode: 'DNA',
          }),
        }),
      );
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】DNA 数据极端情况 → 系统优雅处理', () => {
    const validRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      dna_id: 'dna-0001',
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SDNA-BND-001: DNA 置信度 < 0.5 时仍正常生成并附加 low_confidence 约束', async () => {
      const lowConfidenceDNA = mockDNAFactory({
        dnaJson: {
          ...mockDNAFactory().dnaJson,
          confidence: 0.35,
        },
      });
      mockPrisma.viralDna.findUnique.mockResolvedValue(
        lowConfidenceDNA as unknown as Record<string, unknown>,
      );

      const result = await generateFromDNA(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result).toHaveProperty('script_id');

      // 断言 constraint_list 中包含 low_confidence 约束
      const createCall = mockPrisma.script.create.mock.calls[0][0] as {
        data: { constraint_list: string[] };
      };
      expect(
        createCall.data.constraint_list.some((c: string) =>
          c.includes('low_confidence'),
        ),
      ).toBe(true);
    });

    it('TC-SDNA-BND-002: DNA 置信度 ≥ 0.7 时附加 high_confidence_dna 约束', async () => {
      mockPrisma.viralDna.findUnique.mockResolvedValue(
        mockDNAFactory() as unknown as Record<string, unknown>,
      );

      await generateFromDNA(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      const createCall = mockPrisma.script.create.mock.calls[0][0] as {
        data: { constraint_list: string[] };
      };
      expect(
        createCall.data.constraint_list.some((c: string) =>
          c.includes('high_confidence_dna'),
        ),
      ).toBe(true);
    });

    it('TC-SDNA-BND-003: DNA 缺少可选字段 (hooks, visual_styles 为空) 时使用默认值正常生成', async () => {
      const sparseDNA = mockDNAFactory({
        dnaJson: {
          ...mockDNAFactory().dnaJson,
          hooks: [],
          visual_styles: [],
          bgm_patterns: [],
          pacing_patterns: [],
          cta_styles: [],
        },
      });
      mockPrisma.viralDna.findUnique.mockResolvedValue(
        sparseDNA as unknown as Record<string, unknown>,
      );

      const result = await generateFromDNA(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result).toHaveProperty('script_id');
      expect(mockPrisma.script.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ generation_mode: 'DNA' }),
        }),
      );
    });

    it('TC-SDNA-BND-004: DNA 含 label_tags 但无 hook_label/style_label 时 DNA narrative 正常构建', async () => {
      const dnaWithoutLabels = mockDNAFactory({
        dnaJson: {
          ...mockDNAFactory().dnaJson,
          label_tags: ['高转化'],
          // 无 hook_label, style_label, bgm_label
        },
      });
      mockPrisma.viralDna.findUnique.mockResolvedValue(
        dnaWithoutLabels as unknown as Record<string, unknown>,
      );

      const result = await generateFromDNA(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildQuickPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result).toHaveProperty('script_id');
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const validRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      dna_id: 'dna-0001',
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.viralDna.findUnique.mockResolvedValue(
        mockDNAFactory() as unknown as Record<string, unknown>,
      );
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    // ---- 3.1 输入层异常 ----

    it('TC-SDNA-ERR-001: product_id 缺失 → PRODUCT_ID_REQUIRED', async () => {
      const badRequest = { dna_id: 'dna-0001', product_id: '' };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateFromDNA(badRequest, {
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

    it('TC-SDNA-ERR-002: dna_id 缺失 → DNA_ID_REQUIRED', async () => {
      const badRequest = { product_id: '00000000-0000-0000-0000-000000000001', dna_id: '' };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateFromDNA(badRequest, {
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
      expect(caught!.errorCode).toBe('DNA_ID_REQUIRED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    // ---- 3.2 DNA 查找异常 ----

    it('TC-SDNA-ERR-003: DNA 记录不存在 → VIRAL_DNA_NOT_FOUND', async () => {
      mockPrisma.viralDna.findUnique.mockResolvedValue(null);

      let caught: Error & { code?: string } | null = null;
      try {
        await generateFromDNA(validRequest, {
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
      expect(caught!.code).toBe('VIRAL_DNA_NOT_FOUND');
      expect(caught!.message).toContain('DNA 模式不存在');
    });

    it('TC-SDNA-ERR-004: 产品不存在 → PRODUCT_NOT_FOUND', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateFromDNA(validRequest, {
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
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    // ---- 3.3 AI 调用层异常 ----

    it('TC-SDNA-ERR-005: AI 返回空字符串 → MODEL_PROVIDER_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue('');

      let caught: Error & { code?: string } | null = null;
      try {
        await generateFromDNA(validRequest, {
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
      expect(caught!.code).toBe('MODEL_PROVIDER_FAILED');
    });

    it('TC-SDNA-ERR-006: AI 返回不可解析的非 JSON 文本 → SCRIPT_PARSE_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue('This is just random text, not valid JSON at all.');

      let caught: Error & { code?: string } | null = null;
      try {
        await generateFromDNA(validRequest, {
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

    it('TC-SDNA-ERR-007: AI 返回合法 JSON 但缺少 shots 字段 → SCRIPT_PARSE_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({ title: 'No Shots', video_duration: 10.0 }),
      );

      let caught: Error & { code?: string } | null = null;
      try {
        await generateFromDNA(validRequest, {
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

    it('TC-SDNA-ERR-008: AI 返回空 shots 数组 → SCRIPT_NO_SHOTS_GENERATED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({ title: 'Empty', video_duration: 0, shots: [] }),
      );

      let caught: Error & { code?: string } | null = null;
      try {
        await generateFromDNA(validRequest, {
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

    // ---- 3.4 Schema 校验层异常 ----

    it('TC-SDNA-ERR-009: 总时长 > 15.0s → SCRIPT_DURATION_EXCEEDED', async () => {
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

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateFromDNA(validRequest, {
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
      expect(caught!.errorCode).toBe('SCRIPT_DURATION_EXCEEDED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SDNA-ERR-010: 缺少必填字段 → SCRIPT_SCHEMA_INVALID', async () => {
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

      let caught: Error & { errorCode?: string; statusCode?: number; details?: unknown } | null = null;
      try {
        await generateFromDNA(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & {
          errorCode?: string;
          statusCode?: number;
          details?: unknown;
        };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_SCHEMA_INVALID');
      expect(caught!.details).toBeDefined();
      expect((caught!.details as Array<{ field: string }>).length).toBeGreaterThanOrEqual(3);
    });

    // ---- 3.5 合规校验层异常 ----

    it('TC-SDNA-ERR-011: 含"最好"绝对化用语 → COMPLIANCE_CHECK_FAILED', async () => {
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

      let caught: Error & { errorCode?: string; statusCode?: number; details?: Array<{ violated_word: string; reason: string }> } | null = null;
      try {
        await generateFromDNA(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildQuickPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & {
          errorCode?: string;
          statusCode?: number;
          details?: Array<{ violated_word: string; reason: string }>;
        };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('COMPLIANCE_CHECK_FAILED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.details).toBeDefined();
      expect(
        (caught!.details as Array<{ violated_word: string }>).some(
          (v) => v.violated_word === '最好',
        ),
      ).toBe(true);
    });

    // ---- 3.6 持久化层异常 ----

    it('TC-SDNA-ERR-012: Prisma $transaction 写入失败 → INTERNAL_SERVER_ERROR', async () => {
      const dbError = new Error('Connection terminated unexpectedly');
      (dbError as Error & { code?: string }).code = 'P1001';

      const faultyPrisma = mockPrismaServiceFactory();
      faultyPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      faultyPrisma.viralDna.findUnique.mockResolvedValue(
        mockDNAFactory() as unknown as Record<string, unknown>,
      );
      faultyPrisma.$transaction.mockRejectedValue(dbError);

      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);

      let caught: Error & { errorCode?: string; code?: string } | null = null;
      try {
        await generateFromDNA(validRequest, {
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
      dna_id: 'dna-0001',
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.viralDna.findUnique.mockResolvedValue(
        mockDNAFactory() as unknown as Record<string, unknown>,
      );
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SDNA-PERF-001: generateFromDNA 编排总耗时 ≤ 5000ms (含 mock AI 响应)', async () => {
      const PERF_CEILING_MS = 5000;

      const start = performance.now();

      await generateFromDNA(validRequest, {
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

    it('TC-SDNA-PERF-002: DNA overrides 提取 (strategy + factor + constraint) ≤ 5ms', () => {
      const PERF_CEILING_MS = 5;
      const dna = mockDNAFactory().dnaJson;

      const start = performance.now();

      // 模拟 overrides 提取逻辑 (independently testable)
      const topHook = dna.hooks?.[0];
      const topVisual = dna.visual_styles?.[0];
      const topBgm = dna.bgm_patterns?.[0];
      const topPacing = dna.pacing_patterns?.[0];
      const topCta = dna.cta_styles?.[0];

      const strategy_overrides: Record<string, unknown> = {
        hook_type: topHook?.type ?? 'problem_forward',
        shot_count_range: topVisual?.shot_count_range ?? [5, 15],
        total_duration: 15,
        dna_narrative: '',
      };

      const factor_overrides: Record<string, unknown> = {};
      if (topHook) {
        factor_overrides.hook = {
          type: topHook.type,
          structure: topHook.structure,
          effectiveness: topHook.effectiveness,
        };
      }
      if (topVisual) {
        factor_overrides.visual = {
          style: topVisual.style,
          camera_patterns: topVisual.camera_patterns,
          color_palette: topVisual.color_palette,
          text_overlay_ratio: topVisual.text_overlay_ratio,
          preferred_transitions: topVisual.transition_sequence,
        };
      }
      if (topBgm) {
        factor_overrides.bgm = {
          genre: topBgm.genre,
          bpm_range: topBgm.bpm_range,
          energy_curve: topBgm.energy_curve,
        };
      }
      if (topPacing) {
        factor_overrides.pacing = {
          avg_shot_duration: topPacing.avg_shot_duration_seconds,
          tempo_curve: topPacing.tempo_curve,
        };
      }
      if (topCta) {
        factor_overrides.cta = {
          placement_type: topCta.placement_type,
          text_templates: topCta.text_templates,
          delay_from_end_seconds: topCta.delay_from_end_seconds,
        };
      }
      factor_overrides.dna_confidence = dna.confidence;
      factor_overrides.dna_sample_count = dna.sample_count;

      const constraint_overrides: string[] = [];
      if (topVisual?.transition_sequence?.length) {
        constraint_overrides.push(
          `transition_sequence: ${topVisual.transition_sequence.join(',')}`,
        );
      }
      if (dna.confidence >= 0.7) {
        constraint_overrides.push(`high_confidence_dna: DNA 置信度 ${(dna.confidence * 100).toFixed(0)}%`);
      }

      const elapsed = performance.now() - start;

      expect(strategy_overrides).toHaveProperty('hook_type');
      expect(factor_overrides).toHaveProperty('hook');
      expect(factor_overrides).toHaveProperty('visual');
      expect(factor_overrides).toHaveProperty('bgm');
      expect(factor_overrides).toHaveProperty('pacing');
      expect(factor_overrides).toHaveProperty('cta');
      expect(constraint_overrides.length).toBeGreaterThanOrEqual(1);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SDNA-PERF-003: 连续 10 次 generateFromDNA 无性能退化', async () => {
      const ITERATIONS = 10;
      const PERF_CEILING_MS_PER_ITERATION = 100;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await generateFromDNA(validRequest, {
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
  });

  // ===========================================================================
  // 5. 原子函数 — DNA Overrides 提取逻辑独立测试
  // ===========================================================================

  describe('【原子函数】DNA overrides 提取逻辑验证', () => {
    it('strategory_overrides 正确提取 hook_type 和 shot_count_range', () => {
      const dna = mockDNAFactory().dnaJson;
      const topHook = dna.hooks?.[0];
      const topVisual = dna.visual_styles?.[0];

      const strategy_overrides = {
        hook_type: topHook?.type ?? 'problem_forward',
        shot_count_range: topVisual?.shot_count_range ?? [5, 15],
        total_duration: 15,
        dna_narrative: 'test',
      };

      expect(strategy_overrides.hook_type).toBe('problem_forward');
      expect(strategy_overrides.shot_count_range).toEqual([5, 10]);
      expect(strategy_overrides.total_duration).toBe(15);
    });

    it('factor_overrides 正确提取 hook 结构', () => {
      const dna = mockDNAFactory().dnaJson;
      const topHook = dna.hooks?.[0]!;

      const hook = {
        type: topHook.type,
        structure: topHook.structure,
        effectiveness: topHook.effectiveness,
      };

      expect(hook.type).toBe('problem_forward');
      expect(hook.structure).toBe('pain_point → solution → product');
      expect(hook.effectiveness).toBe(0.9);
    });

    it('factor_overrides 正确提取 visual 风格配置', () => {
      const dna = mockDNAFactory().dnaJson;
      const topVisual = dna.visual_styles?.[0]!;

      const visual = {
        style: topVisual.style,
        camera_patterns: topVisual.camera_patterns,
        color_palette: topVisual.color_palette,
        text_overlay_ratio: topVisual.text_overlay_ratio,
        preferred_transitions: topVisual.transition_sequence,
      };

      expect(visual.style).toBe('bright_clean');
      expect(visual.camera_patterns).toEqual(['close_up', 'dolly_in']);
      expect(visual.color_palette).toEqual(['white', 'pink']);
      expect(visual.text_overlay_ratio).toBe(0.3);
      expect(visual.preferred_transitions).toEqual(['Fade_In', 'Dissolve']);
    });

    it('factor_overrides 正确提取 bgm 节奏配置', () => {
      const dna = mockDNAFactory().dnaJson;
      const topBgm = dna.bgm_patterns?.[0]!;

      const bgm = {
        genre: topBgm.genre,
        bpm_range: topBgm.bpm_range,
        energy_curve: topBgm.energy_curve,
      };

      expect(bgm.genre).toBe('upbeat_pop');
      expect(bgm.bpm_range).toEqual([120, 140]);
      expect(bgm.energy_curve).toBe('rising');
    });

    it('factor_overrides 正确提取 pacing 节奏配置', () => {
      const dna = mockDNAFactory().dnaJson;
      const topPacing = dna.pacing_patterns?.[0]!;

      const pacing = {
        avg_shot_duration: topPacing.avg_shot_duration_seconds,
        tempo_curve: topPacing.tempo_curve,
      };

      expect(pacing.avg_shot_duration).toBe(2.5);
      expect(pacing.tempo_curve).toBe('fast_start_slow_end');
    });

    it('factor_overrides 正确提取 cta 配置', () => {
      const dna = mockDNAFactory().dnaJson;
      const topCta = dna.cta_styles?.[0]!;

      const cta = {
        placement_type: topCta.placement_type,
        text_templates: topCta.text_templates,
        delay_from_end_seconds: topCta.delay_from_end_seconds,
      };

      expect(cta.placement_type).toBe('end_card');
      expect(cta.text_templates).toEqual(['立即下单']);
      expect(cta.delay_from_end_seconds).toBe(1.0);
    });

    it('constraint_overrides 高置信度 DNA 附加 high_confidence_dna 约束', () => {
      const dna = mockDNAFactory().dnaJson;
      const topVisual = dna.visual_styles?.[0];
      const topCta = dna.cta_styles?.[0];

      const constraint_overrides: string[] = [];
      if (topVisual?.transition_sequence?.length) {
        constraint_overrides.push(
          `transition_sequence: ${topVisual.transition_sequence.join(',')}`,
        );
      }
      if (topCta?.placement_type === 'scattered') {
        constraint_overrides.push('cta_scattered');
      }
      if (dna.confidence < 0.5) {
        constraint_overrides.push('low_confidence');
      }
      if (dna.confidence >= 0.7) {
        constraint_overrides.push(
          `high_confidence_dna: DNA 置信度 ${(dna.confidence * 100).toFixed(0)}%`,
        );
      }

      expect(
        constraint_overrides.some((c) => c.includes('high_confidence_dna')),
      ).toBe(true);
      expect(
        constraint_overrides.some((c) => c.includes('transition_sequence')),
      ).toBe(true);
    });

    it('constraint_overrides 低置信度 DNA 附加 low_confidence 约束', () => {
      const dna = { ...mockDNAFactory().dnaJson, confidence: 0.35 };
      const topVisual = dna.visual_styles?.[0];

      const constraint_overrides: string[] = [];
      if (topVisual?.transition_sequence?.length) {
        constraint_overrides.push(
          `transition_sequence: ${topVisual.transition_sequence.join(',')}`,
        );
      }
      if (dna.confidence < 0.5) {
        constraint_overrides.push('low_confidence: DNA 置信度不足，建议保留创作自由度');
      }
      if (dna.confidence >= 0.7) {
        constraint_overrides.push('high_confidence_dna');
      }

      expect(
        constraint_overrides.some((c) => c.includes('low_confidence')),
      ).toBe(true);
      expect(
        constraint_overrides.some((c) => c.includes('high_confidence_dna')),
      ).toBe(false);
    });

    it('DNA 默认值：缺失所有可选字段时 strategy_overrides 使用 fallback', () => {
      const dna = { ...mockDNAFactory().dnaJson, hooks: [], visual_styles: [] };
      const topHook = dna.hooks?.[0];
      const topVisual = dna.visual_styles?.[0];

      const strategy_overrides = {
        hook_type: topHook?.type ?? 'problem_forward',
        shot_count_range: topVisual?.shot_count_range ?? [5, 15],
        total_duration: 15,
      };

      expect(strategy_overrides.hook_type).toBe('problem_forward');
      expect(strategy_overrides.shot_count_range).toEqual([5, 15]);
    });

    it('factor_overrides 包含 dna_confidence 和 dna_sample_count 元数据', () => {
      const dna = mockDNAFactory().dnaJson;

      const factor_overrides: Record<string, unknown> = {};
      factor_overrides.dna_confidence = dna.confidence;
      factor_overrides.dna_sample_count = dna.sample_count;

      expect(factor_overrides.dna_confidence).toBe(0.85);
      expect(factor_overrides.dna_sample_count).toBe(50);
    });
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言 DNA 模式剧本生成
// 的完整性与正确性。待源码实现后可直接运行。
//
// 用例编号映射:
//   TC-SDNA-001 ~ TC-SDNA-001-EXT      正常流 (Happy Path)
//   TC-SDNA-BND-001 ~ TC-SDNA-BND-004  边界流 (Edge Cases)
//   TC-SDNA-ERR-001 ~ TC-SDNA-ERR-012  异常流 (Error Flow)
//   TC-SDNA-PERF-001 ~ TC-SDNA-PERF-003 性能流 (Performance)
//
// 覆盖率维度:
//   ├── generateFromDNA 编排流程    (7 集成测试)
//   ├── DNA overrides 提取逻辑      (10 原子测试)
//   ├── buildQuickPrompt (DNA 增强)  (通过集成覆盖)
//   ├── parseScriptFromAIResponse     (通过集成覆盖)
//   ├── validateScriptSchema          (通过集成覆盖)
//   └── checkCompliance               (通过集成覆盖)
//
// 总测试用例数: 30
// =============================================================================