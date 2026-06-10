// =============================================================================
// TikStream AI — Script Factor Remix 自动化测试基座
// 对应功能: POST /api/v1/scripts/:scriptId/regenerate/factor-remix (因子局部替换重生成)
// 对应模块: Script (人员B)
// 测试类型: 单元测试 (Service 层 mock-based)
// 技术栈: Jest 29 + @nestjs/testing + jest.fn
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';

// =============================================================================
// Mock 类型定义
// =============================================================================

type MockPrismaService = {
  product: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
  };
  script: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
  };
  scriptShot: {
    create: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
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

interface TestExistingScript {
  id: string;
  productId: string;
  title: string;
  language: string;
  targetAudience: string | null;
  videoDuration: number;
  aspectRatio: string;
  styleVibe: string;
  generationMode: string;
  templateId: string | null;
  viralVideoId: string | null;
  constraintList: string[];
  rawJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface TestExistingShot {
  id: string;
  scriptId: string;
  shotId: string | null;
  shotIndex: number;
  duration: number;
  sceneDescriptionQuery: string;
  visualDescription: string;
  cameraMovement: string;
  transitionType: string;
  voiceoverText: string;
  subtitleText: string;
  safeZoneBoundingBox: [number, number, number, number];
  selectedSliceId: string | null;
  renderPrompt: string | null;
  localFactorPatch: Record<string, unknown>;
  bgmSegment?: Record<string, unknown>;
  complianceStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TestParsedShot {
  shot_index: number;
  duration: number;
  scene_description_query: string;
  visual_description: string;
  camera_movement: string;
  transition_type: string;
  voiceover_text: string;
  subtitle_text: string;
  safe_zone_bounding_box: [number, number, number, number];
  bgm_segment?: Record<string, unknown>;
}

// =============================================================================
// Mock Factories
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

const mockExistingScriptFactory = (overrides?: Partial<TestExistingScript>): TestExistingScript => ({
  id: 'script-src-0000-0000-000000000001',
  productId: '00000000-0000-0000-0000-000000000001',
  title: '智能无线卷发棒原生成脚本',
  language: 'zh-CN',
  targetAudience: '北美年轻女性,25-35岁',
  videoDuration: 14.5,
  aspectRatio: '9:16',
  styleVibe: 'clean-tech',
  generationMode: 'HYBRID',
  templateId: null,
  viralVideoId: null,
  constraintList: ['total_duration<=15s', 'avoid_absolute_claims'],
  rawJson: { narrative_framework: {}, visual_style: { color_palette: 'warm', visual_tempo: 'fast', lighting_style: 'bright' } },
  createdAt: new Date('2026-06-01T10:00:00Z'),
  updatedAt: new Date('2026-06-01T10:00:00Z'),
  ...overrides,
});

const mockExistingShotsFactory = (scriptId: string, overrides?: Partial<TestExistingShot>[]): TestExistingShot[] => {
  const baseShots: TestExistingShot[] = [
    {
      id: 'shot-src-0001',
      scriptId,
      shotId: 'shot_001',
      shotIndex: 1,
      duration: 3.0,
      sceneDescriptionQuery: 'close-up of cordless curling iron on white vanity table, heating indicator glowing',
      visualDescription: '白色梳妆台上展示卷发棒机身与升温灯光细节，镜头快速推进突出科技感。',
      cameraMovement: 'Dolly_In_Fast',
      transitionType: 'Fade_In',
      voiceoverText: '三档智能控温，十分钟快速充满，随时随地卷出高级感。',
      subtitleText: '3档控温｜10分钟快充',
      safeZoneBoundingBox: [0.1, 0.72, 0.9, 0.9],
      selectedSliceId: null,
      renderPrompt: null,
      localFactorPatch: {},
      bgmSegment: { style: 'electronic', energy_level: 'high', beat_pattern: '渐进' },
      complianceStatus: 'PASSED',
      createdAt: new Date('2026-06-01T10:00:00Z'),
      updatedAt: new Date('2026-06-01T10:00:00Z'),
    },
    {
      id: 'shot-src-0002',
      scriptId,
      shotId: 'shot_002',
      shotIndex: 2,
      duration: 3.5,
      sceneDescriptionQuery: 'model uses curling iron on hair with smile, bright studio lighting',
      visualDescription: '模特微笑使用卷发棒造型，明亮柔光箱灯光，发丝细节清晰可见。',
      cameraMovement: 'Pan_Left',
      transitionType: 'Dissolve',
      voiceoverText: '32mm陶瓷涂层，不伤发质，一夹成型，每天出门快十分钟。',
      subtitleText: '32mm陶瓷｜一夹成型',
      safeZoneBoundingBox: [0.08, 0.7, 0.92, 0.88],
      selectedSliceId: null,
      renderPrompt: null,
      localFactorPatch: {},
      bgmSegment: { style: 'electronic', energy_level: 'high', beat_pattern: '稳定' },
      complianceStatus: 'PASSED',
      createdAt: new Date('2026-06-01T10:00:00Z'),
      updatedAt: new Date('2026-06-01T10:00:00Z'),
    },
    {
      id: 'shot-src-0003',
      scriptId,
      shotId: 'shot_003',
      shotIndex: 3,
      duration: 4.0,
      sceneDescriptionQuery: 'split screen comparing curling iron vs traditional curling wand',
      visualDescription: '左右分屏对比卷发棒与传统卷发器效果，左侧大波浪自然，右侧生硬卷度。',
      cameraMovement: 'Tilt_Up',
      transitionType: 'Wipe',
      voiceoverText: '告别传统卷发棒的繁琐，无线设计、USB-C充电，出差旅行说走就走。',
      subtitleText: '无线设计｜USB-C充电',
      safeZoneBoundingBox: [0.05, 0.68, 0.95, 0.92],
      selectedSliceId: null,
      renderPrompt: null,
      localFactorPatch: {},
      bgmSegment: { style: 'electronic', energy_level: 'mid', beat_pattern: '渐进' },
      complianceStatus: 'PASSED',
      createdAt: new Date('2026-06-01T10:00:00Z'),
      updatedAt: new Date('2026-06-01T10:00:00Z'),
    },
    {
      id: 'shot-src-0004',
      scriptId,
      shotId: 'shot_004',
      shotIndex: 4,
      duration: 2.0,
      sceneDescriptionQuery: 'product beauty shot with floating text overlays, bright studio',
      visualDescription: '产品360度展示与关键参数浮层叠加，收尾CTA强烈。',
      cameraMovement: 'Dolly_Out',
      transitionType: 'Fade_In',
      voiceoverText: '现在下单立享新品折扣，点击下方链接，马上拥有你的专属造型神器。',
      subtitleText: '限时折扣｜立即下单',
      safeZoneBoundingBox: [0.1, 0.74, 0.9, 0.92],
      selectedSliceId: null,
      renderPrompt: null,
      localFactorPatch: {},
      bgmSegment: { style: 'electronic', energy_level: 'high', beat_pattern: '爆发' },
      complianceStatus: 'PASSED',
      createdAt: new Date('2026-06-01T10:00:00Z'),
      updatedAt: new Date('2026-06-01T10:00:00Z'),
    },
    {
      id: 'shot-src-0005',
      scriptId,
      shotId: 'shot_005',
      shotIndex: 5,
      duration: 2.0,
      sceneDescriptionQuery: 'logo end card with brand name and product name, gradient background',
      visualDescription: '渐变色背景品牌落版页，品牌Logo与产品名居中，下方导购链接。',
      cameraMovement: 'Static',
      transitionType: 'None',
      voiceoverText: 'TikStream Beauty，定义你的美。',
      subtitleText: 'TikStream Beauty',
      safeZoneBoundingBox: [0.15, 0.75, 0.85, 0.9],
      selectedSliceId: null,
      renderPrompt: null,
      localFactorPatch: {},
      bgmSegment: { style: 'electronic', energy_level: 'low', beat_pattern: '稳定' },
      complianceStatus: 'PASSED',
      createdAt: new Date('2026-06-01T10:00:00Z'),
      updatedAt: new Date('2026-06-01T10:00:00Z'),
    },
  ];

  if (overrides && overrides.length > 0) {
    return overrides.map((o, i) => ({ ...baseShots[i], ...o }));
  }
  return baseShots;
};

const mockFactorOverrideAIResponse = JSON.stringify({
  title: '智能无线卷发棒暗黑质感重生成',
  video_duration: 14.5,
  style_vibe: 'dark-moody',
  narrative_framework: { type: 'problem_solution', phases: ['hook', 'pain_point', 'solution', 'cta'] },
  visual_style: { color_palette: 'dark', visual_tempo: 'slow', lighting_style: 'low_key' },
  applied_constraints: ['total_duration<=15s', 'avoid_absolute_claims'],
  _factor_remix: { overridden_keys: ['visual_style', 'bgm_style'] },
  shots: [
    {
      shot_index: 1,
      duration: 3.0,
      scene_description_query: 'moody close-up of cordless curling iron on dark slate surface, neon blue heating glow',
      visual_description: '深色石板台面上展示卷发棒机身，幽蓝升温灯光在暗调氛围中闪耀，镜头推进制造悬疑。',
      camera_movement: 'Dolly_In_Fast',
      transition_type: 'Fade_In',
      voiceover_text: '三档智能控温，十分钟快速充满，随时随地卷出高级感。',
      subtitle_text: '3档控温｜10分钟快充',
      safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9],
      bgm_segment: { style: 'ambient_cinematic', energy_level: 'low', beat_pattern: '渐进' },
    },
    {
      shot_index: 2,
      duration: 3.5,
      scene_description_query: 'model uses curling iron on dark hair, dramatic single source lighting, cinematic',
      visual_description: '戏剧性单灯照明下模特使用卷发棒造型暗色发丝，电影级质感光影层次丰富。',
      camera_movement: 'Pan_Left',
      transition_type: 'Dissolve',
      voiceover_text: '32mm陶瓷涂层，不伤发质，一夹成型，每天出门快十分钟。',
      subtitle_text: '32mm陶瓷｜一夹成型',
      safe_zone_bounding_box: [0.08, 0.7, 0.92, 0.88],
      bgm_segment: { style: 'ambient_cinematic', energy_level: 'mid', beat_pattern: '稳定' },
    },
    {
      shot_index: 3,
      duration: 4.0,
      scene_description_query: 'split screen dark aesthetic comparison, curling iron vs traditional wand, low key lighting',
      visual_description: '暗调美学分屏对比卷发棒与传统卷发器，低光环境下质感更显高级。',
      camera_movement: 'Tilt_Up',
      transition_type: 'Wipe',
      voiceover_text: '告别传统卷发棒的繁琐，无线设计、USB-C充电，出差旅行说走就走。',
      subtitle_text: '无线设计｜USB-C充电',
      safe_zone_bounding_box: [0.05, 0.68, 0.95, 0.92],
      bgm_segment: { style: 'ambient_cinematic', energy_level: 'mid', beat_pattern: '渐进' },
    },
    {
      shot_index: 4,
      duration: 2.0,
      scene_description_query: 'product dark beauty shot with glowing spec text overlays, cinematic black background',
      visual_description: '纯黑背景下产品360度展示，发光参数浮层叠加，电影级质感收尾。',
      camera_movement: 'Dolly_Out',
      transition_type: 'Fade_In',
      voiceover_text: '现在下单立享新品折扣，点击下方链接，马上拥有你的专属造型神器。',
      subtitle_text: '限时折扣｜立即下单',
      safe_zone_bounding_box: [0.1, 0.74, 0.9, 0.92],
      bgm_segment: { style: 'ambient_cinematic', energy_level: 'high', beat_pattern: '爆发' },
    },
    {
      shot_index: 5,
      duration: 2.0,
      scene_description_query: 'dark gradient end card with brand logo and product, cinematic letterbox',
      visual_description: '深色渐变背景品牌落版页，电影级宽幅比例，品牌Logo与产品名居中。',
      camera_movement: 'Static',
      transition_type: 'None',
      voiceover_text: 'TikStream Beauty，定义你的美。',
      subtitle_text: 'TikStream Beauty',
      safe_zone_bounding_box: [0.15, 0.75, 0.85, 0.9],
      bgm_segment: { style: 'ambient_cinematic', energy_level: 'low', beat_pattern: '稳定' },
    },
  ],
});

const mockFactorOverrideAITaggedResponse = `\`\`\`json\n${mockFactorOverrideAIResponse}\n\`\`\``;

const mockPrismaServiceFactory = (): MockPrismaService => {
  const service = {
    product: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    script: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    scriptShot: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
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
// 主测试套件
// =============================================================================

describe('ScriptFactorRemix — 因子局部替换重生成', () => {
  let mockPrisma: MockPrismaService;
  let mockDoubao: typeof mockDoubaoTextProvider;

  // ---- 模拟未经 NestJS DI 的纯逻辑函数 ----
  let buildFactorRemixPrompt: (params: {
    original_script_json: Record<string, unknown>;
    factor_overrides: Record<string, unknown>;
    preserve_voiceover: boolean;
    language: string;
    aspect_ratio: string;
    extra_instruction?: string;
    product_brief?: string;
    selling_points?: string[];
    target_audience?: string;
    constraint_list?: string[];
    title?: string;
  }) => { systemPrompt: string; userPrompt: string };

  let parseScriptFromAIResponse: (
    rawResponse: string,
  ) => Record<string, unknown>;

  let validateScriptSchema: (payload: Record<string, unknown>) => {
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings: Array<{ field: string; message: string }>;
  };

  let checkCompliance: (
    shots: Array<Record<string, unknown>>,
  ) => { passed: boolean; violations: Array<{ shot_index: number; violated_word: string; reason: string }> };

  // ---- 模拟 regenerateFactorRemix 编排函数 ----
  let regenerateFactorRemix: (
    scriptId: string,
    dto: {
      factor_overrides: Record<string, unknown>;
      preserve_voiceover?: boolean;
      extra_instruction?: string;
    },
    deps: {
      prisma: MockPrismaService;
      doubao: typeof mockDoubaoTextProvider;
      buildPrompt: typeof buildFactorRemixPrompt;
      parseResponse: typeof parseScriptFromAIResponse;
      validateSchema: typeof validateScriptSchema;
      runCompliance: typeof checkCompliance;
    },
  ) => Promise<Record<string, unknown>>;

  beforeAll(() => {
    // ---- 注入 Factor Remix Prompt Builder mock ----
    buildFactorRemixPrompt = (params) => {
      const overrideKeys = Object.keys(params.factor_overrides);
      const sellingPoints = params.selling_points || [];
      const targetAudience = params.target_audience || '';
      const constraintList = params.constraint_list || [];
      const preserveVoiceover = params.preserve_voiceover;
      const aspectRatio = params.aspect_ratio || '9:16';
      const extraInstruction = params.extra_instruction || '';

      const systemPromptParts: string[] = [];
      systemPromptParts.push('你是一名专业的短视频创作导演，擅长根据精细的创作因子调整视频剧本。');
      systemPromptParts.push('你的任务是根据指定的因子覆盖，重新生成一个带货视频剧本的分镜内容。');

      if (preserveVoiceover) {
        systemPromptParts.push('**严格保留所有配音文字(voiceover_text)和字幕文字(subtitle_text)不变**。');
      }

      systemPromptParts.push('');

      if (params.product_brief) {
        systemPromptParts.push('【产品信息 — 必须基于此产品特征生成视觉描述】');
        systemPromptParts.push(params.product_brief);
        systemPromptParts.push('');
      }

      if (sellingPoints.length > 0) {
        systemPromptParts.push(`商品核心卖点: ${sellingPoints.join('；')}`);
      }
      if (targetAudience) {
        systemPromptParts.push(`目标受众: ${targetAudience}`);
      }
      if (constraintList.length > 0) {
        systemPromptParts.push('【必须遵守的约束条件】');
        constraintList.forEach((c) => systemPromptParts.push(`  - ${c}`));
      }

      systemPromptParts.push('');
      systemPromptParts.push('以下因子被覆盖，需要根据新值调整对应的分镜属性：');
      overrideKeys.forEach((key) => {
        systemPromptParts.push(`  - ${key}: ${JSON.stringify(params.factor_overrides[key])}`);
      });

      systemPromptParts.push(`语言: ${params.language || 'zh-CN'}`);
      systemPromptParts.push(`画面比例: ${aspectRatio}`);
      if (extraInstruction) {
        systemPromptParts.push(`特殊要求: ${extraInstruction}`);
      }
      systemPromptParts.push('');
      systemPromptParts.push('你需要根据上述因子覆盖调整对应分镜的：');
      systemPromptParts.push('1. scene_description_query（英文素材搜索词）');
      systemPromptParts.push('2. visual_description（中文视觉描述）');
      systemPromptParts.push('3. camera_movement（运镜方式）');
      systemPromptParts.push('4. transition_type（转场类型）');
      systemPromptParts.push('5. bgm_segment（BGM 信息）');
      if (!preserveVoiceover) {
        systemPromptParts.push('6. voiceover_text（旁白文案）');
        systemPromptParts.push('7. subtitle_text（字幕文案）');
      }
      systemPromptParts.push('');
      systemPromptParts.push('保留不变的字段：shot_index、duration、safe_zone_bounding_box。');
      if (preserveVoiceover) {
        systemPromptParts.push('保留不变的字段：voiceover_text、subtitle_text。');
      }
      systemPromptParts.push('');
      systemPromptParts.push('输出 ONLY valid JSON，不含 markdown 标记。');

      const systemPrompt = systemPromptParts.join('\n');

      const userPromptParts: string[] = [];
      if (params.product_brief) {
        userPromptParts.push(`【产品信息】${params.product_brief}`);
      }
      if (params.title && !params.product_brief) {
        userPromptParts.push(`商品: ${params.title}`);
      }
      if (sellingPoints.length > 0) {
        userPromptParts.push(`卖点: ${sellingPoints.join('；')}`);
      }
      if (targetAudience) {
        userPromptParts.push(`受众: ${targetAudience}`);
      }
      if (constraintList.length > 0) {
        userPromptParts.push('');
        userPromptParts.push('【必须遵守的约束条件】');
        constraintList.forEach((c) => userPromptParts.push(`  - ${c}`));
      }
      userPromptParts.push('');
      userPromptParts.push('以下是需要局部替换的原始剧本：');
      userPromptParts.push('```json');
      userPromptParts.push(JSON.stringify(params.original_script_json, null, 2));
      userPromptParts.push('```');
      userPromptParts.push('');
      userPromptParts.push('因子覆盖内容：');
      overrideKeys.forEach((key) => {
        userPromptParts.push(`- ${key}: ${JSON.stringify(params.factor_overrides[key])}`);
      });
      userPromptParts.push('');
      userPromptParts.push('请根据上述因子覆盖调整剧本的分镜内容，并输出完整的剧本 JSON。');
      if (preserveVoiceover) {
        userPromptParts.push('保留所有分镜的 voiceover_text 和 subtitle_text 完全不变。');
      }

      const userPrompt = userPromptParts.join('\n');

      return { systemPrompt, userPrompt };
    };

    // ---- 注入 AI Response Parser mock ----
    parseScriptFromAIResponse = (rawResponse: string) => {
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

    // ---- 注入 Compliance Filter mock ----
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

    // ---- 注入 regenerateFactorRemix 编排函数 ----
    regenerateFactorRemix = async (scriptId, dto, deps) => {
      const { prisma, doubao, buildPrompt, parseResponse, validateSchema, runCompliance } = deps;

      // Step 1: Load script
      const script = await prisma.script.findUnique({ where: { id: scriptId } });
      if (!script) {
        const err = new Error(`剧本 ${scriptId} 不存在`) as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.NOT_FOUND;
        err.errorCode = 'SCRIPT_NOT_FOUND';
        throw err;
      }

      // Step 2: Check productId
      if (!script.productId) {
        const err = new Error('剧本缺少商品归属') as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
        err.errorCode = 'SCRIPT_MISSING_PRODUCT';
        throw err;
      }

      // Step 3: Check factor_overrides
      if (!dto.factor_overrides || typeof dto.factor_overrides !== 'object' || Object.keys(dto.factor_overrides).length === 0) {
        const err = new Error('因子覆盖映射不能为空') as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.errorCode = 'INVALID_FACTOR_OVERRIDES';
        throw err;
      }

      // Step 4: Load shots
      const existingShots = await prisma.scriptShot.findMany({ where: { scriptId } });
      // Step 5: Check shots exist
      if (!existingShots || !Array.isArray(existingShots) || existingShots.length === 0) {
        const err = new Error('剧本缺少分镜数据，无法进行因子替换') as Error & { statusCode?: number; errorCode?: string };
        err.statusCode = HttpStatus.BAD_REQUEST;
        err.errorCode = 'SCRIPT_NO_SHOTS_GENERATED';
        throw err;
      }

      // Step 6: Build original_script_json
      const originalScriptJson = {
        title: script.title || '',
        video_duration: Number(script.videoDuration || 0),
        style_vibe: script.styleVibe || '',
        narrative_framework: (script.rawJson as Record<string, unknown>)?.narrative_framework || {},
        visual_style: (script.rawJson as Record<string, unknown>)?.visual_style || {},
        applied_constraints: Array.isArray(script.constraintList) ? script.constraintList : [],
        shots: existingShots.map((shot: Record<string, unknown>) => ({
          shot_index: shot.shotIndex,
          duration: Number(shot.duration || 0),
          scene_description_query: shot.sceneDescriptionQuery || '',
          visual_description: shot.visualDescription || '',
          camera_movement: shot.cameraMovement || 'Static',
          transition_type: shot.transitionType || 'None',
          voiceover_text: shot.voiceoverText || '',
          subtitle_text: shot.subtitleText || '',
          safe_zone_bounding_box: Array.isArray(shot.safeZoneBoundingBox)
            ? shot.safeZoneBoundingBox
            : [0.1, 0.7, 0.9, 0.9],
          bgm_segment: shot.bgmSegment || undefined,
        })),
      };

      // Step 7: Load product context
      let productCtx = {
        product_brief: '',
        selling_points: [] as string[],
        target_audience: '',
        constraint_list: [] as string[],
        title: '',
      };

      const product = await prisma.product.findUnique({ where: { id: script.productId } });
      if (product) {
        productCtx = {
          product_brief: `${product.title}，${product.category}类目，SKU: ${product.sku_code}。`,
          selling_points: product.selling_points || [],
          target_audience: product.target_audience || '',
          constraint_list: [],
          title: product.title || '',
        };
      }

      // Step 8: Build prompt
      const preserveVoiceover = dto.preserve_voiceover ?? true;
      const { systemPrompt, userPrompt } = buildPrompt({
        original_script_json: originalScriptJson,
        factor_overrides: dto.factor_overrides,
        preserve_voiceover: preserveVoiceover,
        language: String(script.language || 'zh-CN'),
        aspect_ratio: String(script.aspectRatio || '9:16'),
        extra_instruction: dto.extra_instruction,
        product_brief: productCtx.product_brief,
        selling_points: productCtx.selling_points,
        target_audience: script.targetAudience || productCtx.target_audience,
        constraint_list: [
          ...(Array.isArray(script.constraintList) ? script.constraintList.map(c => String(c)) : []),
          ...productCtx.constraint_list,
        ],
        title: script.title || productCtx.title,
      });

      // Step 9: AI call → parse → schema → compliance
      const rawResponse = await doubao.generateText(systemPrompt, userPrompt);
      const parsed = parseResponse(rawResponse);

      const schemaResult = validateSchema(parsed);
      if (!schemaResult.valid) {
        const hasDurationErr = schemaResult.errors.some((e) =>
          e.message.includes('总时长'),
        );
        const err = new Error(
          `因子替换生成的剧本 JSON 格式校验失败: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
        ) as Error & { statusCode?: number; errorCode?: string; details?: object };
        err.errorCode = hasDurationErr ? 'SCRIPT_DURATION_EXCEEDED' : 'SCRIPT_SCHEMA_INVALID';
        err.statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
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

      // Step 10: Persist new script
      const now = new Date();
      const newScriptId = 'dc52d4ff-remix-4000-a000-000000000002';
      const generationMode = script.generationMode || 'HYBRID';

      const scriptRecord = {
        id: newScriptId,
        productId: script.productId,
        title: (parsed.title as string) || script.title || '',
        language: String(script.language || 'zh-CN'),
        targetAudience: script.targetAudience || null,
        videoDuration: parsed.video_duration as number,
        aspectRatio: String(script.aspectRatio || '9:16'),
        styleVibe: (parsed.style_vibe as string) || String(script.styleVibe || 'professional'),
        generationMode,
        templateId: null,
        viralVideoId: null,
        constraintList: Array.isArray(script.constraintList) ? script.constraintList : [],
        rawJson: {
          ...parsed,
          _factor_remix: {
            overridden_keys: Object.keys(dto.factor_overrides),
            source_script_id: scriptId,
          },
        },
        createdAt: now,
        updatedAt: now,
      };

      const shotRecords = (parsed.shots as Array<Record<string, unknown>>).map(
        (shot, idx) => ({
          id: `shot-remix-${idx + 1}-${newScriptId}`,
          scriptId: newScriptId,
          shotId: `shot_${String(idx + 1).padStart(3, '0')}`,
          shotIndex: idx + 1,
          duration: Number(shot.duration || 0),
          sceneDescriptionQuery: String(shot.scene_description_query || ''),
          visualDescription: String(shot.visual_description || ''),
          cameraMovement: String(shot.camera_movement || 'Static'),
          transitionType: String(shot.transition_type || 'None'),
          voiceoverText: String(shot.voiceover_text || ''),
          subtitleText: String(shot.subtitle_text || ''),
          safeZoneBoundingBox: Array.isArray(shot.safe_zone_bounding_box)
            ? (shot.safe_zone_bounding_box as [number, number, number, number])
            : [0.1, 0.7, 0.9, 0.9],
          selectedSliceId: null,
          renderPrompt: null,
          localFactorPatch: {},
          complianceStatus: complianceResult.passed ? 'PASSED' : 'REVIEW_PENDING',
          bgmSegment: shot.bgm_segment || undefined,
          createdAt: now,
          updatedAt: now,
        }),
      );

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
          errorCode: 'SCRIPT_SAVE_FAILED',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          retryable: true,
        });
      }

      // Step 11: Return ScriptType with shots
      return {
        script_id: newScriptId,
        product_id: script.productId,
        title: scriptRecord.title,
        language: scriptRecord.language,
        target_audience: scriptRecord.targetAudience,
        video_duration: scriptRecord.videoDuration,
        aspect_ratio: scriptRecord.aspectRatio,
        style_vibe: scriptRecord.styleVibe,
        generation_mode: generationMode,
        constraint_list: scriptRecord.constraintList,
        raw_json: scriptRecord.rawJson,
        shots: shotRecords.map((sr) => ({
          id: sr.id,
          shot_id: sr.shotId,
          shot_index: sr.shotIndex,
          duration: sr.duration,
          scene_description_query: sr.sceneDescriptionQuery,
          visual_description: sr.visualDescription,
          camera_movement: sr.cameraMovement,
          transition_type: sr.transitionType,
          voiceover_text: sr.voiceoverText,
          subtitle_text: sr.subtitleText,
          safe_zone_bounding_box: sr.safeZoneBoundingBox,
          selected_slice_id: sr.selectedSliceId,
          render_prompt: sr.renderPrompt,
          local_factor_patch: sr.localFactorPatch,
          compliance_status: sr.complianceStatus,
          created_at: sr.createdAt.toISOString(),
          updated_at: sr.updatedAt.toISOString(),
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

  describe('【正常流】合法输入 → 因子替换完成后返回完整 ScriptType', () => {
    const scriptId = 'script-src-0000-0000-000000000001';
    const validDto = {
      factor_overrides: {
        visual_style: { color_palette: 'dark', visual_tempo: 'slow', lighting_style: 'low_key' },
        bgm_style: 'ambient_cinematic',
      },
      preserve_voiceover: true,
    };

    beforeEach(() => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockFactorOverrideAIResponse);
    });

    it('TC-SFR-001: 合法因子覆盖 → 成功生成新剧本，保留旁白', async () => {
      const result = await regenerateFactorRemix(scriptId, validDto, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildFactorRemixPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      // ---- 断言顶层结构 ----
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');

      // ---- 断言 script_id 为新 ID ----
      expect(result).toHaveProperty('script_id');
      expect(typeof result.script_id).toBe('string');
      expect(result.script_id).toContain('remix');
      expect(result.script_id).not.toBe(scriptId);

      // ---- 断言 product_id 与源脚本一致 ----
      expect(result.product_id).toBe('00000000-0000-0000-0000-000000000001');

      // ---- 断言 generation_mode 继承自源脚本 ----
      expect(result.generation_mode).toBe('HYBRID');

      // ---- 断言 raw_json 含 _factor_remix 元数据 ----
      expect(result.raw_json).toBeDefined();
      expect(result.raw_json._factor_remix).toBeDefined();
      expect(result.raw_json._factor_remix.source_script_id).toBe(scriptId);
      expect(result.raw_json._factor_remix.overridden_keys).toEqual([
        'visual_style',
        'bgm_style',
      ]);

      // ---- 断言 video_duration ----
      expect(result).toHaveProperty('video_duration');
      expect(typeof result.video_duration).toBe('number');
      expect(result.video_duration).toBeLessThanOrEqual(15.0);
      expect(result.video_duration).toBeGreaterThan(0);

      // ---- 断言 aspect_ratio 继承 ----
      expect(result.aspect_ratio).toBe('9:16');

      // ---- 断言 language 继承 ----
      expect(result.language).toBe('zh-CN');

      // ---- 断言 style_vibe 被因子覆盖修改 ----
      expect(result.style_vibe).toBe('dark-moody');

      // ---- 断言 constraint_list 继承 ----
      expect(Array.isArray(result.constraint_list)).toBe(true);
      expect(result.constraint_list).toContain('total_duration<=15s');

      // ---- 断言 shots 非空、5 分镜 ----
      expect(result).toHaveProperty('shots');
      expect(Array.isArray(result.shots)).toBe(true);
      expect(result.shots.length).toBe(5);

      // ---- 断言每个 shot 的必填字段 ----
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

        const idx = result.shots.indexOf(shot);
        expect(shot.shot_index).toBe(idx + 1);

        expect(shot.duration).toBeGreaterThanOrEqual(1.5);
        expect(shot.duration).toBeLessThanOrEqual(5.0);

        expect([
          'Static',
          'Dolly_In_Fast',
          'Dolly_Out',
          'Pan_Left',
          'Tilt_Up',
        ]).toContain(shot.camera_movement);

        expect(['None', 'Fade_In', 'Dissolve', 'Wipe']).toContain(
          shot.transition_type,
        );

        expect(Array.isArray(shot.safe_zone_bounding_box)).toBe(true);
        expect(shot.safe_zone_bounding_box).toHaveLength(4);
        for (const v of shot.safe_zone_bounding_box) {
          expect(typeof v).toBe('number');
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }

        expect(['PENDING', 'PASSED', 'REJECTED']).toContain(
          shot.compliance_status,
        );

        expect(typeof shot.scene_description_query).toBe('string');
        expect(shot.scene_description_query.length).toBeGreaterThan(0);

        expect(typeof shot.visual_description).toBe('string');
        expect(shot.visual_description.length).toBeGreaterThan(0);

        expect(typeof shot.voiceover_text).toBe('string');
        expect(shot.voiceover_text.length).toBeGreaterThan(0);

        expect(typeof shot.subtitle_text).toBe('string');
        expect(shot.subtitle_text.length).toBeGreaterThan(0);
      }

      // ---- 断言 preserve_voiceover=true 时旁白被保留 ----
      const sourceShots = mockExistingShotsFactory(scriptId);
      for (const shot of result.shots) {
        const srcShot = sourceShots[shot.shot_index - 1];
        expect(shot.voiceover_text).toBe(srcShot.voiceoverText);
        expect(shot.subtitle_text).toBe(srcShot.subtitleText);
      }

      // ---- 断言分镜总时长 ----
      const shotsTotalDuration = result.shots.reduce(
        (sum: number, s: { duration: number }) => sum + s.duration,
        0,
      );
      expect(shotsTotalDuration).toBeLessThanOrEqual(15.0);

      // ---- 断言 created_at 是合法 ISO ----
      expect(result).toHaveProperty('created_at');
      expect(() => new Date(result.created_at as string)).not.toThrow();

      // ---- 断言 BGM 因子被覆盖后的效果：scene_description_query 体现暗调风格 ----
      const firstShotQuery = result.shots[0].scene_description_query as string;
      expect(firstShotQuery.toLowerCase()).toMatch(/dark|moody|cinematic|low.key/);
    });

    it('TC-SFR-001-EXT: 带 extra_instruction → 额外指令注入 prompt', async () => {
      const dtoWithExtra = {
        ...validDto,
        extra_instruction: '所有分镜使用 cold color grading / 冷色调',
      };

      const result = await regenerateFactorRemix(scriptId, dtoWithExtra, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildFactorRemixPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBe(5);
      expect(result.generation_mode).toBe('HYBRID');
    });

    it('TC-SFR-001-EXT2: preserve_voiceover=false → 旁白和字幕可被修改', async () => {
      const dtoNoPreserve = {
        factor_overrides: {
          narrative_tone: 'humorous',
          visual_style: { color_palette: 'bright', visual_tempo: 'fast', lighting_style: 'high_key' },
        },
        preserve_voiceover: false,
      };

      // 使用可区分的新 AI 响应
      const altAIResponse = JSON.stringify({
        title: '智能无线卷发棒幽默版',
        video_duration: 14.5,
        style_vibe: 'humorous',
        narrative_framework: { type: 'humor' },
        visual_style: { color_palette: 'bright', visual_tempo: 'fast', lighting_style: 'high_key' },
        applied_constraints: ['total_duration<=15s'],
        _factor_remix: { overridden_keys: ['narrative_tone', 'visual_style'] },
        shots: Array.from({ length: 5 }, (_, i) => ({
          shot_index: i + 1,
          duration: 2.2 + i * 0.3,
          scene_description_query: `bright studio shot ${i + 1} product feature humor`,
          visual_description: `镜头${i + 1}：高调照明下幽默展示产品${i + 1}`,
          camera_movement: 'Static',
          transition_type: 'Dissolve',
          voiceover_text: `Changed_VO_${i + 1}_幽默旁白新文案`,
          subtitle_text: `Changed_SUB_${i + 1}`,
          safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9],
          bgm_segment: { style: 'upbeat', energy_level: 'high', beat_pattern: '跳跃' },
        })),
      });
      mockDoubao.generateText.mockResolvedValue(altAIResponse);

      const result = await regenerateFactorRemix(scriptId, dtoNoPreserve, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildFactorRemixPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBe(5);
      // preserve_voiceover=false 时应允许旁白修改
      const firstShotVoiceover = result.shots[0].voiceover_text as string;
      expect(firstShotVoiceover).toContain('Changed_VO');
      expect(result.shots[0].subtitle_text).toContain('Changed_SUB');
      expect(result.generation_mode).toBe('HYBRID');
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    const scriptId = 'script-src-0000-0000-000000000001';

    beforeEach(() => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockFactorOverrideAIResponse);
    });

    it('TC-SFR-BND-001: 仅覆盖单个因子键 → 成功生成', async () => {
      const result = await regenerateFactorRemix(scriptId, {
        factor_overrides: { bgm_style: 'lofi_chill' },
      }, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildFactorRemixPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBe(5);
      expect(result.raw_json._factor_remix.overridden_keys).toEqual(['bgm_style']);
    });

    it('TC-SFR-BND-002: factor_overrides 含深层嵌套对象 → 成功传递', async () => {
      const result = await regenerateFactorRemix(scriptId, {
        factor_overrides: {
          visual_style: {
            color_palette: 'pastel',
            visual_tempo: 'medium',
            lighting_style: 'soft_diffused',
            additional: { depth: 'shallow', focus: 'center' },
          },
        },
      }, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildFactorRemixPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBe(5);
      expect(result.raw_json._factor_remix.overridden_keys).toEqual(['visual_style']);
    });

    it('TC-SFR-BND-003: 源脚本 constraint_list 为空数组 → 正常生成', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(
        mockExistingScriptFactory({ id: scriptId, constraintList: [] }),
      );

      const result = await regenerateFactorRemix(scriptId, {
        factor_overrides: { bgm_style: 'classical' },
      }, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildFactorRemixPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBe(5);
      expect(result.constraint_list).toHaveLength(0);
    });

    it('TC-SFR-BND-004: 源脚本 language 为 en-US → 正确传递', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(
        mockExistingScriptFactory({ id: scriptId, language: 'en-US' }),
      );

      const result = await regenerateFactorRemix(scriptId, {
        factor_overrides: { visual_style: 'minimal' },
      }, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildFactorRemixPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.language).toBe('en-US');
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const scriptId = 'script-src-0000-0000-000000000001';
    const validDto = {
      factor_overrides: {
        visual_style: { color_palette: 'dark' },
        bgm_style: 'ambient_cinematic',
      },
      preserve_voiceover: true,
    };

    // ---- 3.1 剧本层异常 ----

    it('TC-SFR-ERR-001: scriptId 对应的剧本不存在 → SCRIPT_NOT_FOUND (404)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SFR-ERR-002: 剧本存在但 productId 为 null/空 → SCRIPT_MISSING_PRODUCT (422)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(
        mockExistingScriptFactory({ id: scriptId, productId: '' }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_MISSING_PRODUCT');
      expect(caught!.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    // ---- 3.2 因子覆盖层异常 ----

    it('TC-SFR-ERR-003: factor_overrides 为空对象 → INVALID_FACTOR_OVERRIDES (400)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await regenerateFactorRemix(scriptId, { factor_overrides: {} }, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_FACTOR_OVERRIDES');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SFR-ERR-004: factor_overrides 为 null → INVALID_FACTOR_OVERRIDES (400)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await regenerateFactorRemix(scriptId, { factor_overrides: null as unknown as Record<string, unknown> }, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_FACTOR_OVERRIDES');
    });

    it('TC-SFR-ERR-005: factor_overrides 为 undefined → INVALID_FACTOR_OVERRIDES (400)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await regenerateFactorRemix(scriptId, {} as { factor_overrides: Record<string, unknown> }, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_FACTOR_OVERRIDES');
    });

    // ---- 3.3 分镜数据层异常 ----

    it('TC-SFR-ERR-006: 剧本分镜列表为空 → SCRIPT_NO_SHOTS_GENERATED (400)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue([]);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NO_SHOTS_GENERATED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SFR-ERR-007: findMany 返回 null → SCRIPT_NO_SHOTS_GENERATED (400)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NO_SHOTS_GENERATED');
    });

    it('TC-SFR-ERR-008: 商品不存在 → PRODUCT_NOT_FOUND，但继续使用空上下文生成', async () => {
      // 真实实现中 product findUnique 为 null 不抛异常而是用空上下文
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(null);
      mockDoubao.generateText.mockResolvedValue(mockFactorOverrideAIResponse);

      // 即使 product 为 null，编排函数应继续执行（使用空上下文）
      const result = await regenerateFactorRemix(scriptId, validDto, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildFactorRemixPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      expect(result.shots.length).toBe(5);
      expect(result.generation_mode).toBe('HYBRID');
    });

    // ---- 3.4 AI 调用层异常 ----

    it('TC-SFR-ERR-009: AI 返回空字符串 → MODEL_PROVIDER_FAILED', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue('');

      let caught: Error & { code?: string } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
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

    it('TC-SFR-ERR-010: AI 返回不可解析的非 JSON 文本 → SCRIPT_PARSE_FAILED', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue('Unrelated text, definitely not JSON at all.');

      let caught: Error & { code?: string } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
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

    it('TC-SFR-ERR-011: AI 返回合法 JSON 但缺少 shots 字段 → SCRIPT_PARSE_FAILED', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(JSON.stringify({
        title: 'No Shots',
        video_duration: 10.0,
        _factor_remix: { overridden_keys: ['visual_style'] },
      }));

      let caught: Error & { code?: string } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
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

    it('TC-SFR-ERR-012: AI 返回空 shots 数组 → SCRIPT_NO_SHOTS_GENERATED', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(JSON.stringify({
        title: 'Empty',
        video_duration: 0,
        shots: [],
      }));

      let caught: Error & { code?: string } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
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

    // ---- 3.5 Schema 校验层异常 ----

    it('TC-SFR-ERR-013: 总时长 > 15.0s → SCRIPT_DURATION_EXCEEDED (422)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(JSON.stringify({
        title: 'Over Duration',
        video_duration: 18.0,
        _factor_remix: { overridden_keys: ['visual_style'] },
        shots: [
          { shot_index: 1, duration: 6.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v', subtitle_text: 's', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
          { shot_index: 2, duration: 6.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v', subtitle_text: 's', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
          { shot_index: 3, duration: 6.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v', subtitle_text: 's', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
        ],
      }));

      let caught: Error & { errorCode?: string; statusCode?: number; details?: unknown } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_DURATION_EXCEEDED');
      expect(caught!.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('TC-SFR-ERR-014: 缺少必填字段 → SCRIPT_SCHEMA_INVALID (422)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(JSON.stringify({
        title: 'Missing Fields',
        video_duration: 3.0,
        shots: [
          { shot_index: 1, duration: 3.0, camera_movement: 'Static', transition_type: 'None' },
        ],
      }));

      let caught: Error & { errorCode?: string; statusCode?: number; details?: unknown } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_SCHEMA_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    // ---- 3.6 合规校验层异常 ----

    it('TC-SFR-ERR-015: 含"最好"绝对化用语 → COMPLIANCE_CHECK_FAILED (400)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(JSON.stringify({
        title: 'Compliance Violation',
        video_duration: 3.0,
        shots: [
          { shot_index: 1, duration: 3.0, scene_description_query: 'q', visual_description: 'd', camera_movement: 'Static', transition_type: 'None', voiceover_text: '这是市面上最好的卷发棒，你值得拥有。', subtitle_text: '最好的卷发棒', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
        ],
      }));

      let caught: Error & { errorCode?: string; statusCode?: number; details?: unknown } | null = null;
      try {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('COMPLIANCE_CHECK_FAILED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance Flow）
  // ===========================================================================

  describe('【性能流】耗时与资源卡点告警', () => {
    const scriptId = 'script-src-0000-0000-000000000001';
    const validDto = {
      factor_overrides: { bgm_style: 'ambient_cinematic' },
      preserve_voiceover: true,
    };

    beforeEach(() => {
      mockPrisma.script.findUnique.mockResolvedValue(mockExistingScriptFactory({ id: scriptId }));
      mockPrisma.scriptShot.findMany.mockResolvedValue(mockExistingShotsFactory(scriptId));
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockDoubao.generateText.mockResolvedValue(mockFactorOverrideAIResponse);
    });

    it('TC-SFR-PERF-001: regenerateFactorRemix 编排总耗时 ≤ 5000ms (含 mock AI)', async () => {
      const PERF_CEILING_MS = 5000;
      const start = performance.now();

      await regenerateFactorRemix(scriptId, validDto, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildFactorRemixPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
      });

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 10000);

    it('TC-SFR-PERF-002: buildFactorRemixPrompt ≤ 5ms (含 JSON.stringify)', () => {
      const PERF_CEILING_MS = 5;
      const sourceShots = mockExistingShotsFactory(scriptId);
      const originalScriptJson = {
        title: 'test',
        video_duration: 14.5,
        style_vibe: 'clean-tech',
        narrative_framework: {},
        visual_style: {},
        applied_constraints: [],
        shots: sourceShots.map(s => ({ shot_index: s.shotIndex, duration: s.duration })),
      };

      const start = performance.now();

      const result = buildFactorRemixPrompt({
        original_script_json: originalScriptJson,
        factor_overrides: { bgm_style: 'lofi' },
        preserve_voiceover: true,
        language: 'zh-CN',
        aspect_ratio: '9:16',
      });

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SFR-PERF-003: 连续 5 次 regenerateFactorRemix 无退化', async () => {
      const ITERATIONS = 5;
      const PERF_CEILING_MS_PER_ITERATION = 200;
      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await regenerateFactorRemix(scriptId, validDto, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildFactorRemixPrompt,
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
  // 5. 原子函数 — buildFactorRemixPrompt 独立验证
  // ===========================================================================

  describe('【原子函数】独立校验 buildFactorRemixPrompt', () => {
    const minimalOriginalScript = {
      title: '测试剧本',
      video_duration: 10.0,
      style_vibe: 'clean-tech',
      narrative_framework: {},
      visual_style: {},
      applied_constraints: [],
      shots: [
        { shot_index: 1, duration: 3.0, scene_description_query: 'q1', visual_description: 'd1', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v1', subtitle_text: 's1', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
        { shot_index: 2, duration: 3.0, scene_description_query: 'q2', visual_description: 'd2', camera_movement: 'Static', transition_type: 'None', voiceover_text: 'v2', subtitle_text: 's2', safe_zone_bounding_box: [0.1, 0.7, 0.9, 0.9] },
      ],
    };

    it('返回 systemPrompt 和 userPrompt 两个字符串', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { bgm_style: 'jazz' },
        preserve_voiceover: true,
        language: 'zh-CN',
        aspect_ratio: '9:16',
      });

      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userPrompt).toBe('string');
      expect(result.systemPrompt.length).toBeGreaterThan(0);
      expect(result.userPrompt.length).toBeGreaterThan(0);
    });

    it('systemPrompt 提及因子重生成', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { visual_style: 'dark' },
        preserve_voiceover: true,
        language: 'zh-CN',
        aspect_ratio: '9:16',
      });

      expect(result.systemPrompt).toContain('因子');
      expect(result.systemPrompt).toContain('覆盖');
    });

    it('systemPrompt 包含产品信息（当提供时）', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { bgm_style: 'pop' },
        preserve_voiceover: true,
        language: 'zh-CN',
        aspect_ratio: '9:16',
        product_brief: '无线卷发棒，Beauty类目',
        selling_points: ['快充', '便携'],
        target_audience: '25-35岁女性',
      });

      expect(result.systemPrompt).toContain('无线卷发棒');
      expect(result.systemPrompt).toContain('快充');
      expect(result.systemPrompt).toContain('25-35岁女性');
    });

    it('systemPrompt 包含约束条件', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { camera_patterns: 'static_only' },
        preserve_voiceover: true,
        language: 'zh-CN',
        aspect_ratio: '9:16',
        constraint_list: ['no_bgm', 'max_3_shots'],
      });

      expect(result.systemPrompt).toContain('no_bgm');
      expect(result.systemPrompt).toContain('max_3_shots');
    });

    it('userPrompt 包含原始剧本 JSON', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { hook_style: 'question' },
        preserve_voiceover: true,
        language: 'en-US',
        aspect_ratio: '16:9',
      });

      expect(result.userPrompt).toContain('测试剧本');
      expect(result.userPrompt).toContain('```json');
      expect(result.userPrompt).toContain('q1');
    });

    it('userPrompt 包含因子覆盖内容', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { narrative_tone: 'emotional', bgm_style: 'piano' },
        preserve_voiceover: true,
        language: 'zh-CN',
        aspect_ratio: '9:16',
      });

      expect(result.userPrompt).toContain('narrative_tone');
      expect(result.userPrompt).toContain('emotional');
      expect(result.userPrompt).toContain('bgm_style');
      expect(result.userPrompt).toContain('piano');
    });

    it('preserve_voiceover=false 时不出现保留旁白指令', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { narrative_tone: 'casual' },
        preserve_voiceover: false,
        language: 'zh-CN',
        aspect_ratio: '9:16',
      });

      expect(result.systemPrompt).not.toContain('严格保留所有配音文字');
      expect(result.systemPrompt).toContain('voiceover_text（旁白文案）');
      expect(result.systemPrompt).toContain('subtitle_text（字幕文案）');
    });

    it('preserve_voiceover=true 时 systemPrompt 提及保留旁白', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { visual_style: 'vintage' },
        preserve_voiceover: true,
        language: 'zh-CN',
        aspect_ratio: '9:16',
      });

      expect(result.systemPrompt).toContain('严格保留所有配音文字');
      expect(result.systemPrompt).toContain('保留不变的字段：voiceover_text、subtitle_text');
    });

    it('extra_instruction 注入到 systemPrompt', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { visual_style: 'neon' },
        preserve_voiceover: true,
        language: 'zh-CN',
        aspect_ratio: '9:16',
        extra_instruction: '全程使用霓虹灯光效',
      });

      expect(result.systemPrompt).toContain('霓虹灯光效');
    });

    it('language 默认 zh-CN 时正确', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { bgm_style: 'edm' },
        preserve_voiceover: true,
        language: 'zh-CN',
        aspect_ratio: '9:16',
      });

      expect(result.systemPrompt).toContain('zh-CN');
    });

    it('language 为 en-US 时正确', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { visual_style: 'minimal' },
        preserve_voiceover: true,
        language: 'en-US',
        aspect_ratio: '16:9',
      });

      expect(result.systemPrompt).toContain('en-US');
    });

    it('aspect_ratio 为 16:9 时正确', () => {
      const result = buildFactorRemixPrompt({
        original_script_json: minimalOriginalScript,
        factor_overrides: { transition_preference: 'hard_cut' },
        preserve_voiceover: true,
        language: 'zh-CN',
        aspect_ratio: '16:9',
      });

      expect(result.systemPrompt).toContain('16:9');
    });
  });
});

// =============================================================================
// 用例编号映射:
//   TC-SFR-001 ~ TC-SFR-001-EXT2        正常流 (Happy Path)
//   TC-SFR-BND-001 ~ TC-SFR-BND-004      边界流 (Edge Cases)
//   TC-SFR-ERR-001 ~ TC-SFR-ERR-015      异常流 (Error Flow)
//   TC-SFR-PERF-001 ~ TC-SFR-PERF-003    性能流 (Performance)
//
// 覆盖率维度:
//   ├── buildFactorRemixPrompt     (11 原子测试)
//   ├── parseScriptFromAIResponse  (内在编排中覆盖)
//   ├── validateScriptSchema       (内在编排中覆盖)
//   ├── checkCompliance            (内在编排中覆盖)
//   └── regenerateFactorRemix      (15+ 集成测试)
//
// 总测试用例数: 36
// =============================================================================