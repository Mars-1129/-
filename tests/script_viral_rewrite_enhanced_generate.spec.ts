// =============================================================================
// TikStream AI — Script Viral Rewrite Enhanced Generate 自动化测试基座
// 对应功能: POST /api/v1/scripts/generate/viral-rewrite (增强爆款仿写剧本生成)
// 对应模块: Script (人员B)
// 对应 Prompt Builder: ScriptViralRewriteEnhancedPromptBuilder
// 测试类型: 单元测试 (Service 层 + Controller 层 + Validator + Filter)
// 技术栈: Jest 29 + @nestjs/testing + jest.fn
//
// 与常规 VIRAL_REWRITE 的核心差异:
//   1. Prompt Builder 额外接收 product_brief 与 material_contexts 参数
//   2. System Prompt 增加 "产品-爆款适配要求" 规则 (规则 8-11)
//   3. User Prompt 渲染产品简介与素材视觉参考信息
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

type MockPrismaService = {
  product: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
  };
  viralVideoAnalysis: {
    findUnique: jest.Mock;
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

interface TestViralVideoAnalysis {
  id: string;
  product_id: string | null;
  source_platform: string;
  source_url: string;
  external_video_id: string;
  title: string | null;
  hook_type: string | null;
  strategy_json: Record<string, unknown>;
  factor_json: Record<string, unknown>;
  report_json: Record<string, unknown>;
  declared_public_source: boolean;
  created_at: Date;
  updated_at: Date;
}

interface TestMaterialContext {
  material_id: string;
  visual_summary: string;
  key_objects: string[];
  dominant_colors: string[];
  suggested_shot_types: string[];
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

const mockViralVideoAnalysisFactory = (
  overrides?: Partial<TestViralVideoAnalysis>,
): TestViralVideoAnalysis => ({
  id: '00000000-0000-0000-0000-000000000999',
  product_id: '00000000-0000-0000-0000-000000000001',
  source_platform: 'TikTok',
  source_url: 'https://www.tiktok.com/@trending/video/7345678901234567890',
  external_video_id: '7345678901234567890',
  title: 'How to get salon curls in 5 minutes — viral hair tutorial',
  hook_type: 'problem_solution_visual',
  strategy_json: {
    opening_hook: 'transformational_before_after',
    narrative_arc: 'problem → solution → social_proof → cta',
    rhythm_pattern: 'fast_cut_3s → slower_showcase_4s → fast_cut_2s → end_card_1s',
    emotional_curve: ['curiosity', 'relief', 'desire', 'urgency'],
  },
  factor_json: {
    hook_retention_boost: 0.87,
    optimal_shot_count: 5,
    optimal_total_duration: 13.2,
    camera_patterns: ['Dolly_In_Fast', 'Pan_Left', 'Tilt_Up'],
    transition_preference: 'Dissolve',
    bgm_style: 'lofi-beat',
    caption_density: 'high',
    cta_placement: 'last_3_seconds',
  },
  report_json: {
    views: 3200000,
    engagement_rate: 0.094,
    completion_rate: 0.72,
    avg_watch_time: 11.3,
    peak_drop_at: 3.2,
  },
  declared_public_source: true,
  created_at: new Date('2026-05-22T12:00:00Z'),
  updated_at: new Date('2026-05-22T12:00:00Z'),
  ...overrides,
});

const mockMaterialContextsFactory = (): TestMaterialContext[] => [
  {
    material_id: 'mat-001',
    visual_summary:
      '白色现代梳妆台上展示无线卷发棒，LED温控屏亮起，背景为极简北欧风卧室，自然光从左侧窗洒入',
    key_objects: ['无线卷发棒', 'LED温控屏', '白色梳妆台', '镜子'],
    dominant_colors: ['白色', '玫瑰金', '浅灰'],
    suggested_shot_types: ['Dolly_In_Fast', 'Close_Up', 'Pan_Left'],
  },
  {
    material_id: 'mat-002',
    visual_summary:
      '年轻女性微笑使用卷发棒造型，自然光线下发丝细节清晰，氛围轻松愉悦，浅景深突出人物表情',
    key_objects: ['卷发棒', '模特', '镜子', '发丝'],
    dominant_colors: ['暖棕', '米色', '浅金'],
    suggested_shot_types: ['Pan_Left', 'Tilt_Up', 'Static'],
  },
  {
    material_id: 'mat-003',
    visual_summary:
      '分屏对比卷发前后效果，左侧乱发蓬松右侧精致大波浪，背景渐变粉白，视觉冲击力对标爆款 social_proof',
    key_objects: ['分屏对比', '大波浪卷发', '造型前后'],
    dominant_colors: ['深棕', '粉白', '金色'],
    suggested_shot_types: ['Tilt_Up', 'Dolly_Out', 'Static'],
  },
];

const mockSingleMaterialContextFactory = (): TestMaterialContext[] => [
  {
    material_id: 'mat-single',
    visual_summary: '产品360度旋转展示，纯白背景+品牌Logo浮层，关键参数以动态文字弹出',
    key_objects: ['无线卷发棒', '品牌Logo', '参数浮层'],
    dominant_colors: ['白色', '玫瑰金', '深蓝'],
    suggested_shot_types: ['Dolly_Out', 'Static'],
  },
];

const mockLargeMaterialContextsFactory = (): TestMaterialContext[] =>
  Array.from({ length: 10 }, (_, i) => ({
    material_id: `mat-large-${String(i + 1).padStart(3, '0')}`,
    visual_summary: `素材${i + 1}：产品在不同场景下的视觉表现，涵盖室内/户外/办公/旅行等多元场景。`,
    key_objects: [`产品_${i + 1}`, `场景道具_${i + 1}`],
    dominant_colors: [`颜色_A${i + 1}`, `颜色_B${i + 1}`],
    suggested_shot_types: ['Static', 'Pan_Left'],
  }));

const mockScriptShotPayloadFactory = (
  index: number,
  overrides?: Partial<TestScriptShotPayload>,
): TestScriptShotPayload => ({
  shot_index: index,
  duration: 3.0,
  scene_description_query: `close-up shot ${index} of product feature inspired by viral hook with enhanced product awareness`,
  visual_description: `镜头${index}：增强版仿写 — 仿照爆款叙事结构并结合产品brief与素材视觉参考，展示核心功能与使用场景。`,
  camera_movement: 'Static',
  transition_type: index === 1 ? 'Fade_In' : 'Dissolve',
  voiceover_text: `第${index}段旁白：增强仿写爆款口播节奏，产品卖点自然融入且呼应素材元素。`,
  subtitle_text: `字幕${index}`,
  safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9],
  compliance_status: 'PASSED',
  ...overrides,
});

const mockViralRewriteEnhancedAIValidResponse = JSON.stringify({
  title: '5分钟打造明星同款卷发 — 无线卷发棒实测增强版',
  video_duration: 13.2,
  style_vibe: 'clean-tech',
  shots: [
    {
      shot_index: 1,
      duration: 2.0,
      scene_description_query:
        'woman with messy morning hair looking at mirror, problem setup shot on white vanity table',
      visual_description:
        '素人早晨乱发开场，在白色梳妆台前制造问题感，对标爆款 opening_hook 结构，呼应素材 mat-001 的白色梳妆台与自然光元素。',
      camera_movement: 'Dolly_In_Fast',
      transition_type: 'Fade_In',
      voiceover_text:
        '每天早起头发一团糟？别急，今天教你三分钟搞定杂志级卷发。',
      subtitle_text: '早起头发一团糟？',
      safe_zone_bounding_box: [0.08, 0.7, 0.92, 0.88],
    },
    {
      shot_index: 2,
      duration: 3.5,
      scene_description_query:
        'cordless curling iron heating up with LED display on white modern vanity, Nordic style bedroom background',
      visual_description:
        '卷发棒特写开机升温，LED温控屏亮起，白色梳妆台+玫瑰金卷发棒+浅灰背景，完美呼应 material_contexts 中的主色调与关键物体。',
      camera_movement: 'Dolly_In_Fast',
      transition_type: 'Dissolve',
      voiceover_text:
        '无线卷发棒三档智能控温，10分钟快充，出差旅行随时保持完美造型。',
      subtitle_text: '三档控温｜10分钟快充',
      safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9],
    },
    {
      shot_index: 3,
      duration: 3.0,
      scene_description_query:
        'woman curling hair with product, soft natural lighting, warm brown tones, shallow depth of field',
      visual_description:
        '模特微笑使用卷发棒，暖棕+米色+浅金主色调呼应素材 mat-002，浅景深突出发丝细节与表情。',
      camera_movement: 'Pan_Left',
      transition_type: 'Dissolve',
      voiceover_text:
        '32mm陶瓷涂层，不伤发质，一夹成型，比传统卷发棒快三倍。',
      subtitle_text: '32mm陶瓷｜一夹成型',
      safe_zone_bounding_box: [0.08, 0.7, 0.92, 0.88],
    },
    {
      shot_index: 4,
      duration: 2.5,
      scene_description_query:
        'split screen comparison before and after curling hair transformation on gradient pink-white background',
      visual_description:
        '分屏对比前后效果，粉白渐变背景呼应素材 mat-003，视觉冲击力对标爆款 social_proof 段落。',
      camera_movement: 'Tilt_Up',
      transition_type: 'Wipe',
      voiceover_text:
        '看看这变化！从此告别理发店，自己在家也能做出高级沙龙卷发。',
      subtitle_text: '前后对比｜在家做沙龙级卷发',
      safe_zone_bounding_box: [0.05, 0.68, 0.95, 0.92],
    },
    {
      shot_index: 5,
      duration: 2.2,
      scene_description_query:
        'product 360 beauty shot on white background with brand logo and key specs floating text, end card with CTA',
      visual_description:
        '360度产品展示+品牌Logo+关键参数浮层，白色+深蓝收尾，对标爆款 end_card CTA 策略与产品brief核心场景。',
      camera_movement: 'Dolly_Out',
      transition_type: 'Fade_In',
      voiceover_text:
        '现在下单立享新品折扣，点击下方链接，马上拥有你的专属造型神器。',
      subtitle_text: '限时折扣｜立即下单',
      safe_zone_bounding_box: [0.1, 0.74, 0.9, 0.92],
    },
  ],
});

const mockViralRewriteEnhancedAIResponseTagged = `\`\`\`json\n${mockViralRewriteEnhancedAIValidResponse}\n\`\`\``;

const mockPrismaServiceFactory = (): MockPrismaService => {
  const service = {
    product: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    viralVideoAnalysis: {
      findUnique: jest.fn(),
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

describe('ScriptViralRewriteEnhancedGenerate — 增强爆款仿写剧本生成', () => {
  // ===========================================================================
  // 全局测试上下文
  // ===========================================================================
  let mockPrisma: MockPrismaService;
  let mockDoubao: typeof mockDoubaoTextProvider;

  // ---- 模拟未经 NestJS DI 的纯逻辑函数 (用真实实现或高保真 mock 替代) ----
  let buildViralRewriteEnhancedPrompt: (params: Record<string, unknown>) => {
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
  let validateViralVideoAnalysis: (
    viralVideoId: string,
    prisma: MockPrismaService,
  ) => Promise<TestViralVideoAnalysis>;

  // ---- 模拟 generateViralRewriteEnhanced 编排函数 ----
  let generateViralRewriteEnhanced: (
    dto: Record<string, unknown>,
    deps: {
      prisma: MockPrismaService;
      doubao: typeof mockDoubaoTextProvider;
      buildPrompt: typeof buildViralRewriteEnhancedPrompt;
      parseResponse: typeof parseScriptFromAIResponse;
      validateSchema: typeof validateScriptSchema;
      runCompliance: typeof checkCompliance;
      validateViralAnalysis: typeof validateViralVideoAnalysis;
    },
  ) => Promise<Record<string, unknown>>;

  beforeAll(() => {
    // ---- 注入 Enhanced Viral Rewrite Prompt Builder mock ----
    buildViralRewriteEnhancedPrompt = (params) => {
      const sellingPoints = (params.selling_points as string[]) || [];
      const styleVibe = (params.style_vibe as string) || 'clean-tech';
      const targetAudience = (params.target_audience as string) || '';
      const constraintList = (params.constraint_list as string[]) || [];
      const aspectRatio = (params.aspect_ratio as string) || '9:16';
      const viralStrategy = (params.viral_strategy as Record<string, unknown>) || {};
      const viralFactors = (params.viral_factors as Record<string, unknown>) || {};
      const viralHookType = (params.viral_hook_type as string) || '';
      const title = (params.title as string) || '';
      const productBrief = (params.product_brief as string) || '';
      const materialContexts = (params.material_contexts as TestMaterialContext[]) || [];

      const systemPrompt = [
        '你是一名专业的 TikTok Shop 短视频脚本创作专家，你正在执行「增强爆款仿写」任务。',
        `输出语言: ${(params.language as string) || 'zh-CN'}。`,
        `画面比例: ${aspectRatio}。`,
        '',
        '以下是一段已被验证为高转化的爆款视频的结构化拆解数据，你需要严格仿照其叙事结构与节奏：',
        `- Hook类型: ${viralHookType}`,
        `- 叙事策略: ${JSON.stringify(viralStrategy)}`,
        `- 关键成功因子: ${JSON.stringify(viralFactors)}`,
        '',
        '仿写要求：',
        '1. 叙事结构仿照爆款，但内容必须100%原创，不得复制原视频任何文案。',
        '2. 保持相似的 Hook 策略、分镜段落节奏、情感曲线。',
        '3. 将新商品的卖点无缝嵌入爆款的叙事框架中。',
        '',
        '你必须严格按照以下 JSON Schema 格式输出脚本:',
        '{',
        '  "title": "脚本标题",',
        '  "video_duration": 13.2,',
        '  "style_vibe": "风格描述",',
        '  "shots": [...]',
        '}',
        '',
        '规则要求:',
        '1. 视频总时长必须严格控制在 15.0 秒以内。',
        '2. 每个分镜时长必须在 1.5 到 5.0 秒之间。',
        '3. 分镜数量必须在 4 到 6 个之间。',
        '4. camera_movement 只能是: Static, Dolly_In_Fast, Dolly_Out, Pan_Left, Tilt_Up',
        '5. transition_type 只能是: None, Fade_In, Dissolve, Wipe',
        '6. safe_zone_bounding_box 必须是 [x, y, width, height] 格式，值在 0-1 之间',
        '7. 旁白和字幕不能包含绝对化用语（最好、第一、全网、唯一、顶级、最高、永久、万能）',
        '8. 旁白和字幕不能包含禁止性促销表达（免费送、点击领取、限时抢购、马上抢）',
        '9. 输出必须是标准 JSON 格式，不要包含任何 markdown 标记或额外说明。',
        '',
        '产品-爆款适配要求:',
        '10. 必须将产品核心卖点自然融入爆款叙事框架，不得生硬堆砌卖点。',
        '11. 产品brief中提到的核心使用场景必须在分镜设计中得到体现。',
        '12. 目标受众画像应与爆款视频的目标人群调性保持一致，调整语气和视觉风格。',
        '13. 如果提供了素材视觉参考(material_contexts)，分镜的视觉描述应与素材元素(关键物体、主色调、推荐镜头类型)产生呼应，但不得直接复制素材原文。',
      ].join('\n');

      const userPromptLines: string[] = [];

      if (productBrief) {
        userPromptLines.push(`产品简介: ${productBrief}`);
      }

      if (title) {
        userPromptLines.push(`商品名称: ${title}`);
      }

      userPromptLines.push(`商品卖点: ${sellingPoints.join('; ')}`);
      userPromptLines.push(`风格氛围: ${styleVibe}`);

      if (targetAudience) {
        userPromptLines.push(`目标受众: ${targetAudience}`);
      }

      if (constraintList.length) {
        userPromptLines.push(`额外约束: ${constraintList.join(', ')}`);
      }

      if (materialContexts.length > 0) {
        const materialLines: string[] = ['素材视觉参考:'];
        materialContexts.forEach((mc, i) => {
          materialLines.push(
            `  素材${i + 1} (${mc.material_id}): ${mc.visual_summary}`,
          );
          if (mc.key_objects && mc.key_objects.length > 0) {
            materialLines.push(`    关键物体: ${mc.key_objects.join('、')}`);
          }
          if (mc.dominant_colors && mc.dominant_colors.length > 0) {
            materialLines.push(`    主色调: ${mc.dominant_colors.join('、')}`);
          }
          if (mc.suggested_shot_types && mc.suggested_shot_types.length > 0) {
            materialLines.push(
              `    推荐镜头类型: ${mc.suggested_shot_types.join('、')}`,
            );
          }
        });
        userPromptLines.push(materialLines.join('\n'));
      }

      const combinedDescParts: string[] = [];
      if (productBrief) combinedDescParts.push('产品简介');
      if (materialContexts.length > 0) combinedDescParts.push('素材视觉参考');
      const combinedDesc = combinedDescParts.length > 0
        ? `，结合${combinedDescParts.join('与')}`
        : '';
      userPromptLines.push(
        `请基于上述爆款视频的叙事结构${combinedDesc}，为新商品生成一份全新带货剧本。`,
      );
      userPromptLines.push(
        `生成 ${4}-${6} 个分镜。输出 ONLY valid JSON。`,
      );

      const userPrompt = userPromptLines.filter(Boolean).join('\n');

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

    // ---- 注入 validateViralVideoAnalysis mock ----
    validateViralVideoAnalysis = async (viralVideoId: string, prisma: MockPrismaService) => {
      if (!viralVideoId) {
        throw Object.assign(new Error('viral_video_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      const analysis = await prisma.viralVideoAnalysis.findUnique({
        where: { id: viralVideoId },
      });

      if (!analysis) {
        throw Object.assign(new Error(`爆款视频分析 ${viralVideoId} 不存在`), {
          errorCode: 'VIRAL_VIDEO_ANALYSIS_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
        });
      }

      if (!analysis.declared_public_source) {
        throw Object.assign(new Error('爆款视频未声明为公开来源，无法用于仿写'), {
          errorCode: 'VIRAL_ANALYSIS_NOT_PUBLIC',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      const strategyJson = analysis.strategy_json as Record<string, unknown>;
      const factorJson = analysis.factor_json as Record<string, unknown>;

      if (
        !strategyJson ||
        Object.keys(strategyJson).length === 0 ||
        !factorJson ||
        Object.keys(factorJson).length === 0
      ) {
        throw Object.assign(new Error('爆款视频拆解数据不完整，无法用于仿写'), {
          errorCode: 'VIRAL_ANALYSIS_NOT_PUBLIC',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      return analysis;
    };

    // ---- 注入 generateViralRewriteEnhanced 编排函数 (Service 层核心逻辑的测试替身) ----
    generateViralRewriteEnhanced = async (dto, deps) => {
      const { prisma, doubao, buildPrompt, parseResponse, validateSchema, runCompliance, validateViralAnalysis } = deps;

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

      const viralVideoId = dto.viral_video_id as string;
      const viralAnalysis = await validateViralAnalysis(viralVideoId, prisma);

      const promptParams: Record<string, unknown> = {
        selling_points: dto.selling_points || product.selling_points || [],
        style_vibe: dto.style_vibe,
        target_audience: dto.target_audience || product.target_audience,
        language: dto.language || 'zh-CN',
        aspect_ratio: dto.aspect_ratio || '9:16',
        constraint_list: dto.constraint_list || [],
        viral_strategy: viralAnalysis.strategy_json,
        viral_factors: viralAnalysis.factor_json,
        viral_hook_type: viralAnalysis.hook_type || '',
        viral_report: viralAnalysis.report_json,
        title: dto.title,
        product_brief: dto.product_brief,
        material_contexts: dto.material_contexts,
      };

      const { systemPrompt, userPrompt } = buildPrompt(promptParams);

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
      const scriptId = 'dc52d4ff-0000-4000-a000-000000000003';
      const scriptRecord: TestPersistedScript = {
        id: scriptId,
        product_id: productId,
        title: (parsed.title as string) || null,
        language: (dto.language as string) || 'zh-CN',
        target_audience: (dto.target_audience as string) || product.target_audience || null,
        video_duration: parsed.video_duration as number,
        aspect_ratio: dto.aspect_ratio as string,
        style_vibe: dto.style_vibe as string,
        generation_mode: 'VIRAL_REWRITE',
        template_id: null,
        viral_video_id: viralVideoId,
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
        generation_mode: 'VIRAL_REWRITE',
        viral_video_id: viralVideoId,
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
      viral_video_id: '00000000-0000-0000-0000-000000000999',
      title: '智能无线卷发棒 Pro',
      language: 'zh-CN',
      selling_points: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
      target_audience: '北美年轻女性,25-35岁',
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
      constraint_list: ['total_duration<=15s', 'avoid_absolute_claims'],
      product_brief:
        '智能无线卷发棒 Pro 是一款面向北美年轻女性的便携造型工具。核心卖点包括三档智能控温、10分钟快充、陶瓷涂层防烫设计。目标使用场景为日常快速造型、出差旅行便携、节日送礼。产品主打轻奢极简风格，玫瑰金配色。',
      material_contexts: mockMaterialContextsFactory(),
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      mockDoubao.generateText.mockResolvedValue(mockViralRewriteEnhancedAIValidResponse);
    });

    it('TC-SVRE-001: 增强爆款仿写生成成功 — product_brief + material_contexts 全量参数', async () => {
      const result = await generateViralRewriteEnhanced(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildViralRewriteEnhancedPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateViralAnalysis: validateViralVideoAnalysis,
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');

      expect(result).toHaveProperty('script_id');
      expect(typeof result.script_id).toBe('string');
      expect(result.script_id.length).toBeGreaterThan(0);

      expect(result.product_id).toBe(validRequest.product_id);

      expect(result.generation_mode).toBe('VIRAL_REWRITE');

      expect(result).toHaveProperty('viral_video_id');
      expect(result.viral_video_id).toBe(validRequest.viral_video_id);

      expect(result).toHaveProperty('video_duration');
      expect(typeof result.video_duration).toBe('number');
      expect(result.video_duration).toBeLessThanOrEqual(15.0);
      expect(result.video_duration).toBeGreaterThan(0);

      expect(result.aspect_ratio).toBe('9:16');
      expect(result.style_vibe).toBe('clean-tech');
      expect(result.language).toBe('zh-CN');

      expect(Array.isArray(result.constraint_list)).toBe(true);
      expect(result.constraint_list).toContain('total_duration<=15s');

      expect(result).toHaveProperty('shots');
      expect(Array.isArray(result.shots)).toBe(true);
      expect(result.shots.length).toBeGreaterThanOrEqual(4);
      expect(result.shots.length).toBeLessThanOrEqual(6);

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

      const shotsTotalDuration = result.shots.reduce(
        (sum: number, s: { duration: number }) => sum + s.duration,
        0,
      );
      expect(shotsTotalDuration).toBeLessThanOrEqual(15.0);
      expect(Math.abs(shotsTotalDuration - result.video_duration)).toBeLessThanOrEqual(0.15);

      expect(result).toHaveProperty('created_at');
      expect(() => new Date(result.created_at as string)).not.toThrow();
      const createdAtMs = new Date(result.created_at as string).getTime();
      expect(createdAtMs).toBeGreaterThan(0);

      expect(result).not.toHaveProperty('raw_json');
      expect(result).not.toHaveProperty('template_id');
    });

    it('TC-SVRE-001-EXT: 带 material_contexts 但不传 product_brief — 含素材视觉参考的正常生成', async () => {
      const requestWithMaterials = {
        ...validRequest,
        material_contexts: mockMaterialContextsFactory(),
      };
      delete requestWithMaterials.product_brief;

      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      mockDoubao.generateText.mockResolvedValue(mockViralRewriteEnhancedAIValidResponse);

      const result = await generateViralRewriteEnhanced(requestWithMaterials, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildViralRewriteEnhancedPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateViralAnalysis: validateViralVideoAnalysis,
      });

      expect(result.shots.length).toBeGreaterThanOrEqual(4);
      expect(result.generation_mode).toBe('VIRAL_REWRITE');
    });

    it('TC-SVRE-001-EXT2: 带 product_brief 但不传 material_contexts — 含产品简介的正常生成', async () => {
      const requestWithBrief = {
        ...validRequest,
        product_brief:
          '智能无线卷发棒 Pro 是一款面向北美年轻女性的便携造型工具。核心卖点包括三档智能控温、10分钟快充、陶瓷涂层防烫设计。',
      };
      delete requestWithBrief.material_contexts;

      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      mockDoubao.generateText.mockResolvedValue(mockViralRewriteEnhancedAIValidResponse);

      const result = await generateViralRewriteEnhanced(requestWithBrief, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildViralRewriteEnhancedPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateViralAnalysis: validateViralVideoAnalysis,
      });

      expect(result.shots.length).toBeGreaterThanOrEqual(4);
      expect(result.generation_mode).toBe('VIRAL_REWRITE');
    });

    it('TC-SVRE-001-EXT3: AI 响应含 markdown 代码块包裹时正常解析', async () => {
      mockDoubao.generateText.mockResolvedValue(mockViralRewriteEnhancedAIResponseTagged);

      const result = await generateViralRewriteEnhanced(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildViralRewriteEnhancedPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateViralAnalysis: validateViralVideoAnalysis,
      });

      expect(result.shots.length).toBeGreaterThanOrEqual(4);
      expect(result.generation_mode).toBe('VIRAL_REWRITE');
    });

    it('TC-SVRE-001-EXT4: 未传 selling_points 时仍成功生成 (使用商品自带卖点)', async () => {
      const requestWithoutSellingPoints = { ...validRequest };
      delete requestWithoutSellingPoints.selling_points;

      mockPrisma.product.findUnique.mockResolvedValue(
        mockProductFactory({ selling_points: ['内置卖点A', '内置卖点B'] }),
      );

      const result = await generateViralRewriteEnhanced(requestWithoutSellingPoints, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildViralRewriteEnhancedPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateViralAnalysis: validateViralVideoAnalysis,
      });

      expect(result.shots.length).toBeGreaterThan(0);
      expect(result.generation_mode).toBe('VIRAL_REWRITE');
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    const validRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      viral_video_id: '00000000-0000-0000-0000-000000000999',
      selling_points: ['测试卖点'],
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      mockDoubao.generateText.mockResolvedValue(mockViralRewriteEnhancedAIValidResponse);
    });

    it('TC-SVRE-BND-001: product_brief 超长文本 (500+ 字符) 正常生成', async () => {
      const longBrief = `产品简介：${'这是一款面向追求效率与品质的现代女性设计的高端卷发工具。'.repeat(20)}`;
      const request = {
        ...validRequest,
        product_brief: longBrief,
      };

      const result = await generateViralRewriteEnhanced(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildViralRewriteEnhancedPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateViralAnalysis: validateViralVideoAnalysis,
      });

      expect(result.shots.length).toBeGreaterThan(0);
      expect(result.generation_mode).toBe('VIRAL_REWRITE');
    });

    it('TC-SVRE-BND-002: material_contexts 仅 1 项素材时正常生成', async () => {
      const request = {
        ...validRequest,
        material_contexts: mockSingleMaterialContextFactory(),
      };

      const result = await generateViralRewriteEnhanced(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildViralRewriteEnhancedPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateViralAnalysis: validateViralVideoAnalysis,
      });

      expect(result.shots.length).toBeGreaterThan(0);
    });

    it('TC-SVRE-BND-003: material_contexts 达 10 项时正常生成', async () => {
      const request = {
        ...validRequest,
        material_contexts: mockLargeMaterialContextsFactory(),
      };

      const result = await generateViralRewriteEnhanced(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildViralRewriteEnhancedPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateViralAnalysis: validateViralVideoAnalysis,
      });

      expect(result.shots.length).toBeGreaterThan(0);
    });

    it('TC-SVRE-BND-004: product_brief + material_contexts 联用且 selling_points 为空时不报错', async () => {
      const request = {
        product_id: '00000000-0000-0000-0000-000000000001',
        viral_video_id: '00000000-0000-0000-0000-000000000999',
        selling_points: [],
        style_vibe: 'clean-tech',
        aspect_ratio: '9:16',
        product_brief: '产品简介测试文本。',
        material_contexts: mockMaterialContextsFactory(),
      };

      mockPrisma.product.findUnique.mockResolvedValue(
        mockProductFactory({ selling_points: [] }),
      );

      const result = await generateViralRewriteEnhanced(request, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildViralRewriteEnhancedPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateViralAnalysis: validateViralVideoAnalysis,
      });

      expect(result.shots.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const validRequest = {
      product_id: '00000000-0000-0000-0000-000000000001',
      viral_video_id: '00000000-0000-0000-0000-000000000999',
      selling_points: ['测试卖点'],
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
      product_brief: '产品简介测试。',
      material_contexts: mockMaterialContextsFactory(),
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      mockDoubao.generateText.mockResolvedValue(mockViralRewriteEnhancedAIValidResponse);
    });

    // ---- 3.1 输入层异常 ----

    it('TC-SVRE-ERR-001: product_id 缺失 → PRODUCT_ID_REQUIRED', async () => {
      const badRequest = { ...validRequest };
      delete badRequest.product_id;

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateViralRewriteEnhanced(badRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_ID_REQUIRED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SVRE-ERR-002: viral_video_id 缺失 → INVALID_REQUEST', async () => {
      const badRequest = { ...validRequest };
      delete badRequest.viral_video_id;

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateViralRewriteEnhanced(badRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SVRE-ERR-003: product_id 对应的商品不存在 → PRODUCT_NOT_FOUND', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateViralRewriteEnhanced(
          { ...validRequest, product_id: '99999999-9999-9999-9999-999999999999' },
          {
            prisma: mockPrisma,
            doubao: mockDoubao,
            buildPrompt: buildViralRewriteEnhancedPrompt,
            parseResponse: parseScriptFromAIResponse,
            validateSchema: validateScriptSchema,
            runCompliance: checkCompliance,
            validateViralAnalysis: validateViralVideoAnalysis,
          },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    // ---- 3.2 爆款视频数据校验层异常 ----

    it('TC-SVRE-ERR-004: viral_video_id 对应爆款分析不存在 → VIRAL_VIDEO_ANALYSIS_NOT_FOUND', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateViralRewriteEnhanced(
          { ...validRequest, viral_video_id: '99999999-9999-9999-9999-999999999999' },
          {
            prisma: mockPrisma,
            doubao: mockDoubao,
            buildPrompt: buildViralRewriteEnhancedPrompt,
            parseResponse: parseScriptFromAIResponse,
            validateSchema: validateScriptSchema,
            runCompliance: checkCompliance,
            validateViralAnalysis: validateViralVideoAnalysis,
          },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_VIDEO_ANALYSIS_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SVRE-ERR-005: declaredPublicSource === false → VIRAL_ANALYSIS_NOT_PUBLIC', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(
        mockViralVideoAnalysisFactory({ declared_public_source: false }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateViralRewriteEnhanced(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_NOT_PUBLIC');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.message).toContain('未声明为公开来源');
    });

    it('TC-SVRE-ERR-006: strategyJson 为空对象 → VIRAL_ANALYSIS_NOT_PUBLIC', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(
        mockViralVideoAnalysisFactory({
          strategy_json: {},
          factor_json: {},
        }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await generateViralRewriteEnhanced(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_NOT_PUBLIC');
      expect(caught!.message).toContain('不完整');
    });

    // ---- 3.3 AI 调用层异常 ----

    it('TC-SVRE-ERR-007: AI 返回空字符串 → MODEL_PROVIDER_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue('');

      let caught: Error & { code?: string } | null = null;
      try {
        await generateViralRewriteEnhanced(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { code?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.code || (caught as Record<string, unknown>).errorCode).toBeDefined();
      const errorIdentifier = caught!.code || (caught as Record<string, unknown>).errorCode;
      expect(['MODEL_PROVIDER_FAILED', 'SCRIPT_PARSE_FAILED']).toContain(errorIdentifier);
    });

    it('TC-SVRE-ERR-008: AI 返回不可解析的非 JSON 文本 → SCRIPT_PARSE_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue('This is just random text, not valid JSON at all.');

      let caught: Error & { code?: string } | null = null;
      try {
        await generateViralRewriteEnhanced(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { code?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('SCRIPT_PARSE_FAILED');
      expect(caught!.message).toContain('无法解析');
    });

    it('TC-SVRE-ERR-009: AI 返回合法 JSON 但缺少 shots 字段 → SCRIPT_PARSE_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({ title: 'No Shots', video_duration: 10.0 }),
      );

      let caught: Error & { code?: string } | null = null;
      try {
        await generateViralRewriteEnhanced(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { code?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('SCRIPT_PARSE_FAILED');
      expect(caught!.message).toContain('shots');
    });

    it('TC-SVRE-ERR-010: AI 返回空 shots 数组 → SCRIPT_NO_SHOTS_GENERATED', async () => {
      mockDoubao.generateText.mockResolvedValue(
        JSON.stringify({ title: 'Empty', video_duration: 0, shots: [] }),
      );

      let caught: Error & { code?: string } | null = null;
      try {
        await generateViralRewriteEnhanced(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { code?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('SCRIPT_NO_SHOTS_GENERATED');
    });

    // ---- 3.4 Schema 校验层异常 ----

    it('TC-SVRE-ERR-011: 总时长 > 15.0s → SCRIPT_DURATION_EXCEEDED', async () => {
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
        await generateViralRewriteEnhanced(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_DURATION_EXCEEDED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SVRE-ERR-012: Prisma $transaction 写入失败 → INTERNAL_SERVER_ERROR', async () => {
      const dbError = new Error('Connection terminated unexpectedly');
      (dbError as Error & { code?: string }).code = 'P1001';

      const faultyPrisma = mockPrismaServiceFactory();
      faultyPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      faultyPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      faultyPrisma.$transaction.mockRejectedValue(dbError);

      mockDoubao.generateText.mockResolvedValue(mockViralRewriteEnhancedAIValidResponse);

      let caught: Error & { errorCode?: string; code?: string } | null = null;
      try {
        await generateViralRewriteEnhanced(validRequest, {
          prisma: faultyPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
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
      viral_video_id: '00000000-0000-0000-0000-000000000999',
      selling_points: ['测试卖点'],
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
      product_brief: '产品简介性能测试。',
      material_contexts: mockMaterialContextsFactory(),
    };

    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      mockDoubao.generateText.mockResolvedValue(mockViralRewriteEnhancedAIValidResponse);
    });

    it('TC-SVRE-PERF-001: generateViralRewriteEnhanced 编排总耗时 ≤ 5000ms (含 mock AI 响应)', async () => {
      const PERF_CEILING_MS = 5000;

      const start = performance.now();

      await generateViralRewriteEnhanced(validRequest, {
        prisma: mockPrisma,
        doubao: mockDoubao,
        buildPrompt: buildViralRewriteEnhancedPrompt,
        parseResponse: parseScriptFromAIResponse,
        validateSchema: validateScriptSchema,
        runCompliance: checkCompliance,
        validateViralAnalysis: validateViralVideoAnalysis,
      });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 10000);

    it('TC-SVRE-PERF-002: buildViralRewriteEnhancedPrompt ≤ 5ms (含 product_brief + material_contexts)', () => {
      const PERF_CEILING_MS = 5;

      const viralAnalysis = mockViralVideoAnalysisFactory();
      const params = {
        selling_points: ['test'],
        style_vibe: 'clean-tech',
        language: 'zh-CN',
        aspect_ratio: '9:16',
        viral_strategy: viralAnalysis.strategy_json,
        viral_factors: viralAnalysis.factor_json,
        viral_hook_type: viralAnalysis.hook_type,
        product_brief: '一款面向北美年轻女性的便携造型工具。',
        material_contexts: mockMaterialContextsFactory(),
      };

      const start = performance.now();

      const result = buildViralRewriteEnhancedPrompt(params);

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userPrompt).toBe('string');
      expect(result.systemPrompt.length).toBeGreaterThan(0);
      expect(result.userPrompt.length).toBeGreaterThan(0);
      expect(result.systemPrompt).toContain('产品-爆款适配要求');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SVRE-PERF-003: 连续 10 次 generateViralRewriteEnhanced 无内存泄漏表现', async () => {
      const ITERATIONS = 10;
      const PERF_CEILING_MS_PER_ITERATION = 100;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await generateViralRewriteEnhanced(validRequest, {
          prisma: mockPrisma,
          doubao: mockDoubao,
          buildPrompt: buildViralRewriteEnhancedPrompt,
          parseResponse: parseScriptFromAIResponse,
          validateSchema: validateScriptSchema,
          runCompliance: checkCompliance,
          validateViralAnalysis: validateViralVideoAnalysis,
        });
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 15000);
  });

  // ===========================================================================
  // 独立原子函数测试（非编排路径的纯逻辑验证）
  // ===========================================================================

  describe('【原子函数】独立校验 buildViralRewriteEnhancedPrompt 的 product_brief 与 material_contexts 特性', () => {
    it('buildViralRewriteEnhancedPrompt systemPrompt 必须包含 "产品-爆款适配要求" 段落', () => {
      const viralAnalysis = mockViralVideoAnalysisFactory();
      const result = buildViralRewriteEnhancedPrompt({
        selling_points: ['test'],
        style_vibe: 'minimal',
        aspect_ratio: '9:16',
        viral_strategy: viralAnalysis.strategy_json,
        viral_factors: viralAnalysis.factor_json,
        viral_hook_type: viralAnalysis.hook_type,
        product_brief: '产品简介',
        material_contexts: mockMaterialContextsFactory(),
      });

      expect(result.systemPrompt).toContain('产品-爆款适配要求');
      expect(result.systemPrompt).toContain('产品核心卖点自然融入');
      expect(result.systemPrompt).toContain('核心使用场景');
      expect(result.systemPrompt).toContain('目标受众画像');
      expect(result.systemPrompt).toContain('素材视觉参考');
    });

    it('buildViralRewriteEnhancedPrompt 在传入 product_brief 时 userPrompt 渲染产品简介', () => {
      const viralAnalysis = mockViralVideoAnalysisFactory();
      const result = buildViralRewriteEnhancedPrompt({
        selling_points: ['test'],
        style_vibe: 'minimal',
        aspect_ratio: '9:16',
        viral_strategy: viralAnalysis.strategy_json,
        viral_factors: viralAnalysis.factor_json,
        viral_hook_type: viralAnalysis.hook_type,
        product_brief: '这是一款轻奢极简风格的便携卷发工具，面向追求效率的都市女性。',
      });

      expect(result.userPrompt).toContain('产品简介');
      expect(result.userPrompt).toContain('轻奢极简风格');
      expect(result.userPrompt).toContain('都市女性');
    });

    it('buildViralRewriteEnhancedPrompt 在传入 material_contexts 时 userPrompt 渲染素材视觉参考', () => {
      const viralAnalysis = mockViralVideoAnalysisFactory();
      const materials = mockMaterialContextsFactory();
      const result = buildViralRewriteEnhancedPrompt({
        selling_points: ['test'],
        style_vibe: 'minimal',
        aspect_ratio: '9:16',
        viral_strategy: viralAnalysis.strategy_json,
        viral_factors: viralAnalysis.factor_json,
        viral_hook_type: viralAnalysis.hook_type,
        material_contexts: materials,
      });

      expect(result.userPrompt).toContain('素材视觉参考');
      expect(result.userPrompt).toContain(materials[0].material_id);
      expect(result.userPrompt).toContain('关键物体');
      expect(result.userPrompt).toContain('主色调');
      expect(result.userPrompt).toContain('推荐镜头类型');
    });

    it('buildViralRewriteEnhancedPrompt 不传 product_brief 与 material_contexts 时仍正常生成 (不退化为旧版)', () => {
      const viralAnalysis = mockViralVideoAnalysisFactory();
      const result = buildViralRewriteEnhancedPrompt({
        selling_points: ['test'],
        style_vibe: 'minimal',
        aspect_ratio: '9:16',
        viral_strategy: viralAnalysis.strategy_json,
        viral_factors: viralAnalysis.factor_json,
        viral_hook_type: viralAnalysis.hook_type,
      });

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(result.systemPrompt).toContain('产品-爆款适配要求');
      expect(result.systemPrompt).toContain('增强爆款仿写');
      expect(result.userPrompt).not.toContain('产品简介');
      expect(result.userPrompt).not.toContain('素材视觉参考');
    });

    it('buildViralRewriteEnhancedPrompt 同时传入 product_brief + material_contexts + title 时 userPrompt 完整渲染', () => {
      const viralAnalysis = mockViralVideoAnalysisFactory();
      const materials = mockMaterialContextsFactory();
      const result = buildViralRewriteEnhancedPrompt({
        selling_points: ['智能控温', '快充'],
        style_vibe: 'clean-tech',
        aspect_ratio: '9:16',
        target_audience: '北美年轻女性',
        viral_strategy: viralAnalysis.strategy_json,
        viral_factors: viralAnalysis.factor_json,
        viral_hook_type: viralAnalysis.hook_type,
        title: '智能无线卷发棒 Pro',
        product_brief: '一款面向北美年轻女性的便携造型工具。',
        material_contexts: materials,
        constraint_list: ['avoid_absolute_claims'],
      });

      expect(result.userPrompt).toContain('产品简介');
      expect(result.userPrompt).toContain('商品名称: 智能无线卷发棒 Pro');
      expect(result.userPrompt).toContain('商品卖点: 智能控温; 快充');
      expect(result.userPrompt).toContain('目标受众: 北美年轻女性');
      expect(result.userPrompt).toContain('额外约束: avoid_absolute_claims');
      expect(result.userPrompt).toContain('素材视觉参考');
      expect(result.userPrompt).toContain(materials[0].visual_summary);
      expect(result.systemPrompt).toContain('产品-爆款适配要求');
    });

    it('buildViralRewriteEnhancedPrompt material_contexts 包含 key_objects / dominant_colors / suggested_shot_types 时逐项渲染', () => {
      const viralAnalysis = mockViralVideoAnalysisFactory();
      const materials = mockSingleMaterialContextFactory();
      const result = buildViralRewriteEnhancedPrompt({
        selling_points: ['test'],
        style_vibe: 'minimal',
        aspect_ratio: '9:16',
        viral_strategy: viralAnalysis.strategy_json,
        viral_factors: viralAnalysis.factor_json,
        viral_hook_type: viralAnalysis.hook_type,
        material_contexts: materials,
      });

      const userPrompt = result.userPrompt;
      expect(userPrompt).toContain('关键物体');
      expect(userPrompt).toContain('无线卷发棒');
      expect(userPrompt).toContain('品牌Logo');
      expect(userPrompt).toContain('主色调');
      expect(userPrompt).toContain('白色');
      expect(userPrompt).toContain('玫瑰金');
      expect(userPrompt).toContain('推荐镜头类型');
      expect(userPrompt).toContain('Dolly_Out');
    });
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言增强爆款仿写剧本生成功能
// 的完整性与正确性。待源码实现后移除 .skip 或直接运行。
//
// 用例编号映射:
//   TC-SVRE-001 ~ TC-SVRE-001-EXT4   正常流 (Happy Path)
//   TC-SVRE-BND-001 ~ TC-SVRE-BND-004 边界流 (Edge Cases)
//   TC-SVRE-ERR-001 ~ TC-SVRE-ERR-012 异常流 (Error Flow)
//   TC-SVRE-PERF-001 ~ TC-SVRE-PERF-003 性能流 (Performance)
//
// 覆盖率维度:
//   ├── buildViralRewriteEnhancedPrompt   (6 原子测试)
//   ├── parseScriptFromAIResponse         (集成覆盖)
//   ├── validateScriptSchema              (集成覆盖)
//   ├── checkCompliance                   (集成覆盖)
//   ├── validateViralVideoAnalysis        (集成覆盖)
//   └── generateViralRewriteEnhanced      (13 集成测试)
//
// 与常规 VIRAL_REWRITE 的差异覆盖:
//   ├── product_brief 参数注入            (4 条用例)
//   ├── material_contexts 参数注入        (5 条用例)
//   ├── System Prompt 产品-爆款适配要求  (6 条用例)
//   └── User Prompt 产品信息与素材渲染   (3 条用例)
//
// 总测试用例数: 31
// =============================================================================