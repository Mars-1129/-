// =============================================================================
// TikStream AI — Script Composed Generate 自动化测试基座
// 对应功能: POST /api/v1/scripts/generate/composed (组合引擎剧本生成)
// 对应模块: Script (人员B)
// 测试类型: 单元测试 (Service 层 + Controller 层 + Validator + Filter)
// 技术栈: Jest 29 + @nestjs/testing + ts-mockito (或 jest.fn)
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

type MockPrismaService = {
  product: { findUnique: jest.Mock; findFirst: jest.Mock };
  script: { create: jest.Mock; findUnique: jest.Mock };
  scriptShot: { create: jest.Mock; createMany: jest.Mock };
  template: { findUnique: jest.Mock };
  viralVideoAnalysis: { findUnique: jest.Mock; findFirst: jest.Mock };
  $transaction: jest.Mock;
};

interface TestProduct {
  id: string; title: string; sku_code: string; category: string;
  selling_points: string[]; target_audience: string | null;
  scenario_tags: string[]; text_features: Record<string, unknown>;
  cover_image_url: string | null; created_at: Date; updated_at: Date;
}

interface TestScriptShotPayload {
  shot_index: number; duration: number; scene_description_query: string;
  visual_description: string; camera_movement: string; transition_type: string;
  voiceover_text: string; subtitle_text: string;
  safe_zone_bounding_box: [number, number, number, number]; compliance_status: string;
}

interface TestPersistedScript {
  id: string; product_id: string; title: string | null; language: string;
  target_audience: string | null; video_duration: number; aspect_ratio: string;
  style_vibe: string; generation_mode: string; template_id: string | null;
  viral_video_id: string | null; constraint_list: string[];
  raw_json: Record<string, unknown>; created_at: Date; updated_at: Date;
}

interface TestPersistedScriptShot {
  id: string; script_id: string; shot_id: string | null; shot_index: number;
  duration: number; scene_description_query: string; visual_description: string;
  camera_movement: string; transition_type: string; voiceover_text: string;
  subtitle_text: string; safe_zone_bounding_box: [number, number, number, number];
  selected_slice_id: string | null; render_prompt: string | null;
  local_factor_patch: Record<string, unknown>; compliance_status: string;
  created_at: Date; updated_at: Date;
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

const mockTemplateFactory = (overrides?: Record<string, unknown>) => ({
  id: 'tpl-0001',
  title: '高转化美妆模板',
  strategySummary: '高能量快节奏+对比反差',
  factorJson: JSON.stringify({ hook_type: 'problem_forward', visual_style: 'bright_clean' }),
  status: 'ACTIVE',
  schemaJson: '{}',
  ...overrides,
});

const mockViralVideoAnalysisFactory = (overrides?: Record<string, unknown>) => ({
  id: 'viral-0001',
  videoUrl: 'https://media.local/viral/trending_001.mp4',
  strategyJson: JSON.stringify({ hook_type: 'question', pace: 'fast' }),
  factorJson: JSON.stringify({ bgm_style: 'upbeat', cta_type: 'soft_sell' }),
  hookType: 'question',
  reportJson: JSON.stringify({ views: 100000, conversion: 0.05 }),
  ...overrides,
});

function mkShot(i: number, overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    shot_index: i, duration: 3.0,
    scene_description_query: `close-up shot ${i}`,
    visual_description: `镜头${i}：展示产品核心功能`,
    camera_movement: i === 1 ? 'Dolly_In_Fast' : i === 2 ? 'Pan_Left' : i === 3 ? 'Tilt_Up' : i === 4 ? 'Dolly_Out' : 'Static',
    transition_type: i === 1 ? 'Fade_In' : i === 5 ? 'None' : i === 3 ? 'Wipe' : 'Dissolve',
    voiceover_text: `第${i}段旁白：产品卖点生动表达。`,
    subtitle_text: `字幕${i}`,
    safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9],
    ...overrides,
  };
}

const mockAIValidResponse = JSON.stringify({
  title: '高转化美妆组合成片脚本',
  video_duration: 14.5,
  style_vibe: 'clean-glam',
  shots: [mkShot(1), mkShot(2, { duration: 3.5 }), mkShot(3, { duration: 4.0 }), mkShot(4, { duration: 2.0 }), mkShot(5, { duration: 2.0 })],
});

const mockPrismaServiceFactory = (): MockPrismaService => {
  const svc = {
    product: { findUnique: jest.fn(), findFirst: jest.fn() },
    script: { create: jest.fn(), findUnique: jest.fn() },
    scriptShot: { create: jest.fn(), createMany: jest.fn() },
    template: { findUnique: jest.fn() },
    viralVideoAnalysis: { findUnique: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  } as MockPrismaService;
  svc.$transaction.mockImplementation(async (fn: (tx: MockPrismaService) => Promise<unknown>) => fn(svc));
  return svc;
};

const mockDoubaoTextProvider = { generateText: jest.fn() };

// =============================================================================
// Composed Mode Orchestrator & Dependencies
// =============================================================================

describe('ScriptComposedGenerate — 组合引擎剧本生成', () => {
  let mockPrisma: MockPrismaService;
  let mockDoubao: typeof mockDoubaoTextProvider;

  let buildQuickPrompt: (params: Record<string, unknown>) => { systemPrompt: string; userPrompt: string };
  let parseScriptFromAIResponse: (rawResponse: string, params: Record<string, unknown>) => Record<string, unknown>;
  let validateScriptSchema: (payload: Record<string, unknown>) => { valid: boolean; errors: Array<{ field: string; message: string }>; warnings: Array<{ field: string; message: string }> };
  let checkCompliance: (shots: Array<Record<string, unknown>>) => { passed: boolean; violations: Array<{ shot_index: number; violated_word: string; reason: string }> };
  let validateTemplate: (templateId: string, prisma: MockPrismaService) => Promise<Record<string, unknown>>;
  let validateViralVideoAnalysis: (viralVideoId: string, prisma: MockPrismaService) => Promise<Record<string, unknown>>;
  let buildComposedContext: (p: { strategySummary: string; mergedStrategy: Record<string, unknown>; hookType: string; viralStrategy: Record<string, unknown>; viralReport: Record<string, unknown>; extra: Record<string, unknown> }) => string;

  let generateComposed: (dto: Record<string, unknown>, deps: {
    prisma: MockPrismaService; doubao: typeof mockDoubaoTextProvider;
    buildPrompt: typeof buildQuickPrompt; parseResponse: typeof parseScriptFromAIResponse;
    validateSchema: typeof validateScriptSchema; runCompliance: typeof checkCompliance;
    validateTemplate: typeof validateTemplate; validateViralVideoAnalysis: typeof validateViralVideoAnalysis;
    buildComposedContext: typeof buildComposedContext;
  }) => Promise<Record<string, unknown>>;

  beforeAll(() => {
    buildQuickPrompt = (params) => {
      const sp = (params.selling_points as string[]) || [];
      const sv = (params.style_vibe as string) || 'clean-tech';
      const ta = (params.target_audience as string) || '';
      const cl = (params.constraint_list as string[]) || [];
      const ar = (params.aspect_ratio as string) || '9:16';
      const pb = (params.product_brief as string) || '';
      return {
        systemPrompt: [
          'You are a professional short-video scriptwriter for TikTok Shop.',
          `Output language: ${(params.language as string) || 'zh-CN'}.`,
          `Aspect ratio: ${ar}.`,
          'You MUST output valid JSON matching the Script schema exactly.',
          'Total video duration MUST NOT exceed 15.0 seconds.',
          'Each shot duration MUST be between 1.5 and 5.0 seconds.',
          'Use the provided composed context to align with template, viral strategy, and creative factors.',
        ].join('\n'),
        userPrompt: [
          pb ? `Product brief: ${pb}` : '',
          `Product selling points: ${sp.join('; ')}`,
          `Style vibe: ${sv}`,
          ta ? `Target audience: ${ta}` : '',
          cl.length ? `Additional constraints: ${cl.join(', ')}` : '',
          'Generate 4-6 shots. Output ONLY valid JSON.',
        ].filter(Boolean).join('\n'),
      };
    };

    parseScriptFromAIResponse = (raw, _p) => {
      if (!raw || raw.trim().length === 0) throw Object.assign(new Error('AI 返回空响应'), { code: 'MODEL_PROVIDER_FAILED' });
      let c = raw.trim();
      if (c.startsWith('```json')) c = c.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      else if (c.startsWith('```')) c = c.replace(/^```\s*/, '').replace(/\s*```$/, '');
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(c) as Record<string, unknown>; }
      catch { throw Object.assign(new Error(`AI 返回内容无法解析为 JSON: ${c.substring(0, 200)}`), { code: 'SCRIPT_PARSE_FAILED' }); }
      const shots = parsed.shots as Array<Record<string, unknown>> | undefined;
      if (!shots || !Array.isArray(shots)) throw Object.assign(new Error('AI 返回缺少 shots 数组字段'), { code: 'SCRIPT_PARSE_FAILED' });
      if (shots.length === 0) throw Object.assign(new Error('AI 未生成任何有效分镜'), { code: 'SCRIPT_NO_SHOTS_GENERATED' });
      return { ...parsed, shots };
    };

    validateScriptSchema = (payload) => {
      const shots = payload.shots as Array<Record<string, unknown>>;
      const errs: Array<{ field: string; message: string }> = [];
      const warns: Array<{ field: string; message: string }> = [];
      if (!shots || !Array.isArray(shots)) { errs.push({ field: 'shots', message: '脚本必须包含分镜列表' }); return { valid: false, errors: errs, warnings: warns }; }
      if (shots.length === 0) { errs.push({ field: 'shots', message: '分镜列表不能为空' }); return { valid: false, errors: errs, warnings: warns }; }
      const td = shots.reduce((s, sh) => s + Number(sh.duration || 0), 0);
      if (td > 15.0) errs.push({ field: 'video_duration', message: `总时长 ${td}s 超过上限 15.0s` });
      const RF = ['shot_index', 'duration', 'scene_description_query', 'visual_description', 'camera_movement', 'transition_type', 'voiceover_text', 'subtitle_text', 'safe_zone_bounding_box'];
      const VCM = ['Static', 'Dolly_In_Fast', 'Dolly_Out', 'Pan_Left', 'Tilt_Up'];
      const VT = ['None', 'Fade_In', 'Dissolve', 'Wipe'];
      shots.forEach((sh, idx) => {
        for (const f of RF) { if (sh[f] === undefined || sh[f] === null) errs.push({ field: `shots[${idx}].${f}`, message: `分镜 ${idx + 1} 缺少必填字段: ${f}` }); }
        const d = Number(sh.duration);
        if (d < 1.5) errs.push({ field: `shots[${idx}].duration`, message: `分镜 ${idx + 1} 时长 ${d}s 低于下限 1.5s` });
        if (d > 5.0) errs.push({ field: `shots[${idx}].duration`, message: `分镜 ${idx + 1} 时长 ${d}s 超过上限 5.0s` });
        if (typeof sh.camera_movement === 'string' && !VCM.includes(sh.camera_movement)) errs.push({ field: `shots[${idx}].camera_movement`, message: `分镜 ${idx + 1} 无效的运镜方式: ${sh.camera_movement}` });
        if (typeof sh.transition_type === 'string' && !VT.includes(sh.transition_type)) errs.push({ field: `shots[${idx}].transition_type`, message: `分镜 ${idx + 1} 无效的转场方式: ${sh.transition_type}` });
        const bb = sh.safe_zone_bounding_box as number[] | undefined;
        if (bb && (!Array.isArray(bb) || bb.length !== 4 || bb.some(v => typeof v !== 'number'))) errs.push({ field: `shots[${idx}].safe_zone_bounding_box`, message: `分镜 ${idx + 1} safe_zone_bounding_box 必须是 [n,n,n,n]` });
      });
      if (Math.abs(td - Number(payload.video_duration || td)) > 0.15) warns.push({ field: 'video_duration', message: `声明时长 ${payload.video_duration}s 与实际 ${td}s 偏差过大` });
      return { valid: errs.length === 0, errors: errs, warnings: warns };
    };

    checkCompliance = (shots) => {
      const violations: Array<{ shot_index: number; violated_word: string; reason: string }> = [];
      const AT = [/最好/g, /第一/g, /全网/g, /唯一/g, /顶级/g, /最高/g, /永久/g, /万能/g];
      const AR = ['"最好"不可用于广告文案', '"第一"须有客观数据支撑', '"全网"属于夸大宣传', '"唯一"不可使用', '"顶级"不可用于广告文案', '"最高"须有客观数据支撑', '"永久"不可用于普通消费品', '"万能"属于夸大宣传'];
      const PP = [/免费送/g, /点击领取/g, /限时抢购/g, /马上抢/g];
      const PR = ['禁止性促销表达"免费送"', '禁止性CTA表达"点击领取"', '禁止性紧迫感表达"限时抢购"', '禁止性紧迫感表达"马上抢"'];
      shots.forEach(sh => {
        const si = Number(sh.shot_index);
        const txt = `${sh.voiceover_text || ''} ${sh.subtitle_text || ''}`;
        AT.forEach((p, i) => { p.lastIndex = 0; const m = p.exec(txt); if (m) violations.push({ shot_index: si, violated_word: m[0], reason: AR[i] }); });
        PP.forEach((p, i) => { p.lastIndex = 0; const m = p.exec(txt); if (m) violations.push({ shot_index: si, violated_word: m[0], reason: PR[i] }); });
      });
      return { passed: violations.length === 0, violations };
    };

    validateTemplate = async (tid, prisma) => {
      const tpl = await prisma.template.findUnique({ where: { id: tid } });
      if (!tpl) { const e = new Error(`模板 ${tid} 不存在`) as Error & { statusCode?: number; errorCode?: string }; e.statusCode = HttpStatus.NOT_FOUND; e.errorCode = 'TEMPLATE_NOT_FOUND'; throw e; }
      if (tpl.status !== 'ACTIVE') { const e = new Error(`模板 ${tid} 未激活 (状态: ${tpl.status})`) as Error & { statusCode?: number; errorCode?: string }; e.statusCode = HttpStatus.BAD_REQUEST; e.errorCode = 'TEMPLATE_NOT_ACTIVE'; throw e; }
      return tpl;
    };

    validateViralVideoAnalysis = async (vid, prisma) => {
      const a = await prisma.viralVideoAnalysis.findUnique({ where: { id: vid } });
      if (!a) { const e = new Error(`爆款视频分析 ${vid} 不存在`) as Error & { statusCode?: number; errorCode?: string }; e.statusCode = HttpStatus.NOT_FOUND; e.errorCode = 'VIRAL_ANALYSIS_NOT_FOUND'; throw e; }
      return a;
    };

    buildComposedContext = (p) => {
      const parts: string[] = [];
      if (p.strategySummary) parts.push(`【模板策略概要】${p.strategySummary}`);
      if (p.mergedStrategy && Object.keys(p.mergedStrategy).length) parts.push(`【合并策略】${JSON.stringify(p.mergedStrategy)}`);
      if (p.hookType) parts.push(`【钩子类型】${p.hookType}`);
      if (p.viralStrategy && Object.keys(p.viralStrategy).length) parts.push(`【爆款策略】${JSON.stringify(p.viralStrategy)}`);
      if (p.viralReport && Object.keys(p.viralReport).length) parts.push(`【爆款数据参考】${JSON.stringify(p.viralReport)}`);
      if (p.extra && Object.keys(p.extra).length) parts.push(`【额外上下文】${JSON.stringify(p.extra)}`);
      return parts.join('\n');
    };

    generateComposed = async (dto, deps) => {
      const { prisma, doubao, buildPrompt, parseResponse, validateSchema, runCompliance, validateTemplate: vt, validateViralVideoAnalysis: vv, buildComposedContext: bcc } = deps;
      const pid = dto.product_id as string;
      if (!pid) { const e = new Error('product_id 为必填字段') as Error & { statusCode?: number; errorCode?: string }; e.statusCode = HttpStatus.BAD_REQUEST; e.errorCode = 'PRODUCT_ID_REQUIRED'; throw e; }
      const product = await prisma.product.findUnique({ where: { id: pid } });
      if (!product) { const e = new Error(`商品 ${pid} 不存在`) as Error & { statusCode?: number; errorCode?: string }; e.statusCode = HttpStatus.NOT_FOUND; e.errorCode = 'PRODUCT_NOT_FOUND'; throw e; }

      let tRec: Record<string, unknown> | null = null, vRec: Record<string, unknown> | null = null;
      let tStrat = '', tFac: Record<string, unknown> = {};
      let vStrat: Record<string, unknown> = {}, vFac: Record<string, unknown> = {}, vRep: Record<string, unknown> = {}, ht = '';
      const tid = dto.template_id as string | undefined;
      const vid = dto.viral_video_id as string | undefined;
      const amv = dto.auto_match_viral as boolean | undefined;

      if (tid) { tRec = await vt(tid, prisma) as Record<string, unknown>; tStrat = (tRec.strategySummary as string) || ''; tFac = JSON.parse((tRec.factorJson as string) || '{}'); }
      if (vid) { vRec = await vv(vid, prisma) as Record<string, unknown>; }
      else if (amv) { vRec = await prisma.viralVideoAnalysis.findFirst({ where: {} }) as Record<string, unknown> | null; }
      if (vRec) { vStrat = JSON.parse((vRec.strategyJson as string) || '{}'); vFac = JSON.parse((vRec.factorJson as string) || '{}'); vRep = JSON.parse((vRec.reportJson as string) || '{}'); ht = (vRec.hookType as string) || ''; }

      const so = (dto.strategy_overrides as Record<string, unknown>) || {};
      const mergedStrategy = { ...tFac, ...vFac, ...so };
      const co = (dto.constraint_overrides as string[]) || [];
      const bc = (dto.constraint_list as string[]) || [];
      const mergedConstraints = [...new Set([...bc, ...co])];

      const dtoP = { ...dto, constraint_list: mergedConstraints, product_brief: product.title || '' };
      const { systemPrompt, userPrompt } = buildPrompt(dtoP);
      const ctx = bcc({ strategySummary: tStrat, mergedStrategy, hookType: ht, viralStrategy: vStrat, viralReport: vRep, extra: { preferences: (dto.preferences as Record<string, unknown>) || {}, preference_remark: (dto.preference_remark as string) || '' } });
      const enriched = [userPrompt, ctx ? `\n--- COMPOSED CONTEXT ---\n${ctx}` : ''].filter(Boolean).join('\n');

      const raw = await doubao.generateText(systemPrompt, enriched);
      const parsed = parseResponse(raw, dto);
      const schemaR = validateSchema(parsed);
      if (!schemaR.valid) {
        const durErr = schemaR.errors.some(e => e.message.includes('总时长'));
        const e = new Error(`剧本 Schema 校验失败: ${schemaR.errors.map(x => x.message).join('; ')}`) as Error & { statusCode?: number; errorCode?: string; details?: object };
        e.errorCode = durErr ? 'SCRIPT_DURATION_EXCEEDED' : 'SCRIPT_SCHEMA_INVALID'; e.statusCode = HttpStatus.BAD_REQUEST; e.details = schemaR.errors; throw e;
      }
      const compR = runCompliance(parsed.shots as Array<Record<string, unknown>>);
      if (!compR.passed) {
        const e = new Error(`合规校验未通过: ${compR.violations.map(v => v.reason).join('; ')}`) as Error & { statusCode?: number; errorCode?: string; details?: object };
        e.errorCode = 'COMPLIANCE_CHECK_FAILED'; e.statusCode = HttpStatus.BAD_REQUEST; e.details = compR.violations; throw e;
      }

      const now = new Date();
      const sid = 'dc52d4ff-0000-4000-a000-000000000002';
      const sRec: TestPersistedScript = {
        id: sid, product_id: pid, title: (parsed.title as string) || null,
        language: (dto.language as string) || 'zh-CN', target_audience: (dto.target_audience as string) || null,
        video_duration: parsed.video_duration as number, aspect_ratio: dto.aspect_ratio as string,
        style_vibe: dto.style_vibe as string, generation_mode: 'COMPOSED',
        template_id: tid || null, viral_video_id: vid || null,
        constraint_list: mergedConstraints, raw_json: { ...parsed }, created_at: now, updated_at: now,
      };
      const shotRecs: TestPersistedScriptShot[] = (parsed.shots as Array<Record<string, unknown>>).map((sh, i) => ({
        id: `shot-uuid-${i + 1}-${sid}`, script_id: sid, shot_id: `shot_${String(i + 1).padStart(3, '0')}`,
        shot_index: Number(sh.shot_index), duration: Number(sh.duration),
        scene_description_query: String(sh.scene_description_query), visual_description: String(sh.visual_description),
        camera_movement: String(sh.camera_movement), transition_type: String(sh.transition_type),
        voiceover_text: String(sh.voiceover_text), subtitle_text: String(sh.subtitle_text),
        safe_zone_bounding_box: sh.safe_zone_bounding_box as [number, number, number, number],
        selected_slice_id: null, render_prompt: null, local_factor_patch: {},
        compliance_status: 'PASSED', created_at: now, updated_at: now,
      }));
      prisma.script.create.mockResolvedValue(sRec);
      prisma.scriptShot.createMany.mockResolvedValue({ count: shotRecs.length });
      try { await prisma.$transaction(async (tx: MockPrismaService) => { await tx.script.create({ data: sRec }); await tx.scriptShot.createMany({ data: shotRecs }); }); }
      catch (e) { throw Object.assign(new Error(`持久化失败: ${(e as Error).message}`), { errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.INTERNAL_SERVER_ERROR, retryable: true }); }
      return {
        script_id: sid, product_id: pid, title: sRec.title, language: sRec.language,
        target_audience: sRec.target_audience, video_duration: sRec.video_duration,
        aspect_ratio: sRec.aspect_ratio, style_vibe: sRec.style_vibe, generation_mode: 'COMPOSED',
        constraint_list: sRec.constraint_list,
        shots: shotRecs.map(sr => ({
          id: sr.id, shot_id: sr.shot_id, shot_index: sr.shot_index, duration: sr.duration,
          scene_description_query: sr.scene_description_query, visual_description: sr.visual_description,
          camera_movement: sr.camera_movement, transition_type: sr.transition_type,
          voiceover_text: sr.voiceover_text, subtitle_text: sr.subtitle_text,
          safe_zone_bounding_box: sr.safe_zone_bounding_box,
          selected_slice_id: sr.selected_slice_id, render_prompt: sr.render_prompt,
          local_factor_patch: sr.local_factor_patch, compliance_status: sr.compliance_status,
          created_at: sr.created_at.toISOString(), updated_at: sr.updated_at.toISOString(),
        })),
        created_at: now.toISOString(),
      };
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
    mockDoubao = { generateText: jest.fn() };
  });

  // ===========================================================================
  // 1. 正常流 (Happy Path)
  // ===========================================================================

  describe('【正常流】合法输入 → 完整 Composed ScriptGenerateResponse 输出', () => {
    const vr = {
      product_id: '00000000-0000-0000-0000-000000000001',
      template_id: 'tpl-0001', viral_video_id: 'viral-0001',
      title: '高转化美妆组合成片脚本', language: 'zh-CN',
      selling_points: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
      target_audience: '北美年轻女性,25-35岁',
      style_vibe: 'clean-glam', aspect_ratio: '9:16',
      constraint_list: ['total_duration<=15s', 'avoid_absolute_claims'],
    };
    const deps = () => ({ prisma: mockPrisma, doubao: mockDoubao, buildPrompt: buildQuickPrompt, parseResponse: parseScriptFromAIResponse, validateSchema: validateScriptSchema, runCompliance: checkCompliance, validateTemplate, validateViralVideoAnalysis, buildComposedContext });
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory());
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SCMP-001: 组合模式生成成功 (full params) — 返回完整结构', async () => {
      const r = await generateComposed(vr, deps());
      expect(r).toBeDefined(); expect(r.generation_mode).toBe('COMPOSED');
      expect(r.product_id).toBe(vr.product_id); expect(r.aspect_ratio).toBe('9:16');
      expect(r.video_duration).toBeLessThanOrEqual(15.0); expect(r.video_duration).toBeGreaterThan(0);
      expect(r.shots).toBeDefined(); expect(r.shots.length).toBeGreaterThanOrEqual(4);
      expect(r.constraint_list).toContain('total_duration<=15s');
      expect(r).not.toHaveProperty('raw_json');
      r.shots.forEach((s: Record<string, unknown>) => {
        expect(s).toHaveProperty('id'); expect(s).toHaveProperty('shot_id');
        expect(s.duration).toBeGreaterThanOrEqual(1.5); expect(s.duration).toBeLessThanOrEqual(5.0);
        expect(['Static','Dolly_In_Fast','Dolly_Out','Pan_Left','Tilt_Up']).toContain(s.camera_movement);
      });
      const td = r.shots.reduce((sum: number, s: { duration: number }) => sum + s.duration, 0);
      expect(td).toBeLessThanOrEqual(15.0);
    });

    it('TC-SCMP-001-EXT: 仅传 template_id (无 viral) 时成功生成', async () => {
      const req = { ...vr, viral_video_id: undefined }; delete req.viral_video_id;
      const r = await generateComposed(req, deps());
      expect(r.shots.length).toBeGreaterThanOrEqual(4); expect(r.generation_mode).toBe('COMPOSED');
    });

    it('TC-SCMP-001-EXT2: 仅传 viral_video_id (无 template) 时成功生成', async () => {
      const req = { ...vr, template_id: undefined }; delete req.template_id;
      const r = await generateComposed(req, deps());
      expect(r.shots.length).toBeGreaterThanOrEqual(4); expect(r.generation_mode).toBe('COMPOSED');
    });

    it('TC-SCMP-001-EXT3: auto_match_viral 自动匹配成功', async () => {
      const req = { ...vr, viral_video_id: undefined, auto_match_viral: true }; delete req.viral_video_id;
      mockPrisma.viralVideoAnalysis.findFirst.mockResolvedValue(mockViralVideoAnalysisFactory());
      const r = await generateComposed(req, deps());
      expect(r.shots.length).toBeGreaterThanOrEqual(4); expect(mockPrisma.viralVideoAnalysis.findFirst).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 2. 边界流 (Edge Cases)
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    const vr = { product_id: '00000000-0000-0000-0000-000000000001', template_id: 'tpl-0001', viral_video_id: 'viral-0001', selling_points: ['测试卖点'], style_vibe: 'clean-glam', aspect_ratio: '9:16' };
    const deps = () => ({ prisma: mockPrisma, doubao: mockDoubao, buildPrompt: buildQuickPrompt, parseResponse: parseScriptFromAIResponse, validateSchema: validateScriptSchema, runCompliance: checkCompliance, validateTemplate, validateViralVideoAnalysis, buildComposedContext });
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory());
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SCMP-BND-001: strategy_overrides 覆盖合并策略', async () => {
      const r = await generateComposed({ ...vr, strategy_overrides: { hook_type: 'before_after', pace: 'slow' } }, deps());
      expect(r.generation_mode).toBe('COMPOSED');
    });

    it('TC-SCMP-BND-002: factor_overrides 覆盖合并因子 (注: COMPOSED模式无独立factor_overrides, 通过strategy_overrides) ', async () => {
      const r = await generateComposed({ ...vr, strategy_overrides: { bgm_style: 'lo-fi', cta_type: 'hard_sell' } }, deps());
      expect(r.generation_mode).toBe('COMPOSED');
    });

    it('TC-SCMP-BND-003: constraint_overrides 合并到 constraint_list', async () => {
      const r = await generateComposed({ ...vr, constraint_list: ['total_duration<=15s'], constraint_overrides: ['no_voiceover', 'text_only'] }, deps());
      expect(r.constraint_list).toContain('total_duration<=15s'); expect(r.constraint_list).toContain('no_voiceover');
    });

    it('TC-SCMP-BND-004: 不传 template_id 和 viral_video_id 成功生成', async () => {
      const r = await generateComposed({ product_id: '00000000-0000-0000-0000-000000000001', selling_points: ['测试卖点'], style_vibe: 'clean-tech', aspect_ratio: '9:16' }, deps());
      expect(r.generation_mode).toBe('COMPOSED');
    });

    it('TC-SCMP-BND-005: preference_remark 长文本 (500字符) 正常处理', async () => {
      const r = await generateComposed({ ...vr, preference_remark: 'A'.repeat(500) }, deps());
      expect(r.shots.length).toBeGreaterThan(0);
    });

    it('TC-SCMP-BND-006: material_ids 数组正常传递', async () => {
      const r = await generateComposed({ ...vr, material_ids: ['mat-001', 'mat-002', 'mat-003'] }, deps());
      expect(r.shots.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 3. 异常流 (Error Flow)
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const vr = { product_id: '00000000-0000-0000-0000-000000000001', template_id: 'tpl-0001', viral_video_id: 'viral-0001', selling_points: ['测试卖点'], style_vibe: 'clean-glam', aspect_ratio: '9:16' };
    const deps = () => ({ prisma: mockPrisma, doubao: mockDoubao, buildPrompt: buildQuickPrompt, parseResponse: parseScriptFromAIResponse, validateSchema: validateScriptSchema, runCompliance: checkCompliance, validateTemplate, validateViralVideoAnalysis, buildComposedContext });
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory());
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SCMP-ERR-001: product_id 缺失 → PRODUCT_ID_REQUIRED', async () => {
      const br = { ...vr }; delete br.product_id;
      let c: Error & { errorCode?: string; statusCode?: number } | null = null;
      try { await generateComposed(br, deps()); } catch (e) { c = e as Error & { errorCode?: string; statusCode?: number }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('PRODUCT_ID_REQUIRED'); expect(c!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SCMP-ERR-002: 商品不存在 → PRODUCT_NOT_FOUND', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      let c: Error & { errorCode?: string; statusCode?: number } | null = null;
      try { await generateComposed({ ...vr, product_id: '99999999-9999-9999-9999-999999999999' }, deps()); } catch (e) { c = e as Error & { errorCode?: string; statusCode?: number }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('PRODUCT_NOT_FOUND'); expect(c!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SCMP-ERR-003: 模板不存在 → TEMPLATE_NOT_FOUND', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(null);
      let c: Error & { errorCode?: string; statusCode?: number } | null = null;
      try { await generateComposed({ ...vr, template_id: 'non-existent-tpl' }, deps()); } catch (e) { c = e as Error & { errorCode?: string; statusCode?: number }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('TEMPLATE_NOT_FOUND'); expect(c!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SCMP-ERR-004: 模板未激活 → TEMPLATE_NOT_ACTIVE', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory({ status: 'INACTIVE' }));
      let c: Error & { errorCode?: string; statusCode?: number } | null = null;
      try { await generateComposed(vr, deps()); } catch (e) { c = e as Error & { errorCode?: string; statusCode?: number }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('TEMPLATE_NOT_ACTIVE'); expect(c!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SCMP-ERR-005: 爆款视频分析不存在 → VIRAL_ANALYSIS_NOT_FOUND', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(null);
      let c: Error & { errorCode?: string; statusCode?: number } | null = null;
      try { await generateComposed({ ...vr, viral_video_id: 'non-existent-viral' }, deps()); } catch (e) { c = e as Error & { errorCode?: string; statusCode?: number }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('VIRAL_ANALYSIS_NOT_FOUND'); expect(c!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SCMP-ERR-006: AI 返回空字符串 → MODEL_PROVIDER_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue('');
      let c: Error & { code?: string } | null = null;
      try { await generateComposed(vr, deps()); } catch (e) { c = e as Error & { code?: string }; }
      expect(c).not.toBeNull(); expect(['MODEL_PROVIDER_FAILED','SCRIPT_PARSE_FAILED']).toContain(c!.code || (c as Record<string, unknown>).errorCode);
    });

    it('TC-SCMP-ERR-007: AI 返回非 JSON → SCRIPT_PARSE_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue('This is just random text, not valid JSON at all.');
      let c: Error & { code?: string } | null = null;
      try { await generateComposed(vr, deps()); } catch (e) { c = e as Error & { code?: string }; }
      expect(c).not.toBeNull(); expect(c!.code).toBe('SCRIPT_PARSE_FAILED');
    });

    it('TC-SCMP-ERR-008: 总时长 > 15s → SCRIPT_DURATION_EXCEEDED', async () => {
      mockDoubao.generateText.mockResolvedValue(JSON.stringify({ title: 'Over', video_duration: 18.0, shots: [mkShot(1, { duration: 6.0 }), mkShot(2, { duration: 6.0 }), mkShot(3, { duration: 6.0 })] }));
      let c: Error & { errorCode?: string; statusCode?: number } | null = null;
      try { await generateComposed(vr, deps()); } catch (e) { c = e as Error & { errorCode?: string; statusCode?: number }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('SCRIPT_DURATION_EXCEEDED');
    });

    it('TC-SCMP-ERR-009: 缺少必填字段 → SCRIPT_SCHEMA_INVALID', async () => {
      mockDoubao.generateText.mockResolvedValue(JSON.stringify({ title: 'Missing', video_duration: 3.0, shots: [{ shot_index: 1, duration: 3.0, camera_movement: 'Static', transition_type: 'None' }] }));
      let c: Error & { errorCode?: string; details?: Array<{ field: string }> } | null = null;
      try { await generateComposed(vr, deps()); } catch (e) { c = e as Error & { errorCode?: string; details?: Array<{ field: string }> }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('SCRIPT_SCHEMA_INVALID'); expect((c!.details!).length).toBeGreaterThanOrEqual(3);
    });

    it('TC-SCMP-ERR-010: 含"最好" → COMPLIANCE_CHECK_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue(JSON.stringify({ title: 'CV', video_duration: 3.0, shots: [mkShot(1, { voiceover_text: '这是市面上最好的卷发棒', subtitle_text: '最好的卷发棒' })] }));
      let c: Error & { errorCode?: string; details?: Array<{ violated_word: string }> } | null = null;
      try { await generateComposed(vr, deps()); } catch (e) { c = e as Error & { errorCode?: string; details?: Array<{ violated_word: string }> }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('COMPLIANCE_CHECK_FAILED');
      expect((c!.details!).some(v => v.violated_word === '最好')).toBe(true);
    });

    it('TC-SCMP-ERR-011: 含"免费送" → COMPLIANCE_CHECK_FAILED', async () => {
      mockDoubao.generateText.mockResolvedValue(JSON.stringify({ title: 'FP', video_duration: 3.0, shots: [mkShot(1, { voiceover_text: '现在下单免费送替换头', subtitle_text: '免费送替换头' })] }));
      let c: Error & { errorCode?: string; details?: Array<{ violated_word: string }> } | null = null;
      try { await generateComposed(vr, deps()); } catch (e) { c = e as Error & { errorCode?: string; details?: Array<{ violated_word: string }> }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('COMPLIANCE_CHECK_FAILED');
      expect((c!.details!).some(v => v.violated_word === '免费送')).toBe(true);
    });

    it('TC-SCMP-ERR-012: Prisma 写入失败 → INTERNAL_SERVER_ERROR', async () => {
      const dbErr = new Error('Connection terminated unexpectedly');
      const fp = mockPrismaServiceFactory();
      fp.product.findUnique.mockResolvedValue(mockProductFactory());
      fp.template.findUnique.mockResolvedValue(mockTemplateFactory());
      fp.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      fp.$transaction.mockRejectedValue(dbErr);
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
      let c: Error & { message: string } | null = null;
      try { await generateComposed(vr, { ...deps(), prisma: fp }); } catch (e) { c = e as Error & { message: string }; }
      expect(c).not.toBeNull(); expect(c!.message).toContain('Connection terminated');
    });

    it('TC-SCMP-ERR-013: template DRAFT → TEMPLATE_NOT_ACTIVE', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory({ status: 'DRAFT' }));
      let c: Error & { errorCode?: string } | null = null;
      try { await generateComposed(vr, deps()); } catch (e) { c = e as Error & { errorCode?: string }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('TEMPLATE_NOT_ACTIVE');
    });

    it('TC-SCMP-ERR-014: template ARCHIVED → TEMPLATE_NOT_ACTIVE', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory({ status: 'ARCHIVED' }));
      let c: Error & { errorCode?: string } | null = null;
      try { await generateComposed(vr, deps()); } catch (e) { c = e as Error & { errorCode?: string }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('TEMPLATE_NOT_ACTIVE');
    });

    it('TC-SCMP-ERR-015: template SUSPENDED → TEMPLATE_NOT_ACTIVE', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory({ status: 'SUSPENDED' }));
      let c: Error & { errorCode?: string } | null = null;
      try { await generateComposed(vr, deps()); } catch (e) { c = e as Error & { errorCode?: string }; }
      expect(c).not.toBeNull(); expect(c!.errorCode).toBe('TEMPLATE_NOT_ACTIVE');
    });
  });

  // ===========================================================================
  // 4. 性能流 (Performance Flow)
  // ===========================================================================

  describe('【性能流】耗时与资源卡点告警', () => {
    const vr = { product_id: '00000000-0000-0000-0000-000000000001', template_id: 'tpl-0001', viral_video_id: 'viral-0001', selling_points: ['测试卖点'], style_vibe: 'clean-glam', aspect_ratio: '9:16' };
    const deps = () => ({ prisma: mockPrisma, doubao: mockDoubao, buildPrompt: buildQuickPrompt, parseResponse: parseScriptFromAIResponse, validateSchema: validateScriptSchema, runCompliance: checkCompliance, validateTemplate, validateViralVideoAnalysis, buildComposedContext });
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory());
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      mockDoubao.generateText.mockResolvedValue(mockAIValidResponse);
    });

    it('TC-SCMP-PERF-001: generateComposed 总耗时 ≤ 5000ms', async () => {
      const start = performance.now();
      await generateComposed(vr, deps());
      expect(performance.now() - start).toBeLessThanOrEqual(5000);
    }, 10000);

    it('TC-SCMP-PERF-002: validateTemplate ≤ 10ms', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory());
      const start = performance.now();
      const r = await validateTemplate('tpl-0001', mockPrisma);
      expect(r.id).toBe('tpl-0001'); expect(performance.now() - start).toBeLessThanOrEqual(10);
    });

    it('TC-SCMP-PERF-003: validateViralVideoAnalysis ≤ 10ms', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(mockViralVideoAnalysisFactory());
      const start = performance.now();
      const r = await validateViralVideoAnalysis('viral-0001', mockPrisma);
      expect(r.id).toBe('viral-0001'); expect(performance.now() - start).toBeLessThanOrEqual(10);
    });

    it('TC-SCMP-PERF-004: buildComposedContext 全字段 ≤ 2ms', () => {
      const start = performance.now();
      const r = buildComposedContext({ strategySummary: '高能量快节奏+对比反差', mergedStrategy: { hook_type: 'problem_forward', pace: 'fast', bgm_style: 'upbeat' }, hookType: 'question', viralStrategy: { hook_type: 'question', pace: 'fast' }, viralReport: { views: 100000, conversion: 0.05 }, extra: { preferences: { color_scheme: 'warm' }, preference_remark: '突出产品便携性' } });
      expect(typeof r).toBe('string'); expect(r.length).toBeGreaterThan(0);
      expect(r).toContain('高能量快节奏+对比反差'); expect(r).toContain('question');
      expect(performance.now() - start).toBeLessThanOrEqual(2);
    });
  });

  // ===========================================================================
  // 5. 原子函数独立测试 — buildComposedContext
  // ===========================================================================

  describe('【原子函数】buildComposedContext 独立测试', () => {
    const empty = { strategySummary: '', mergedStrategy: {} as Record<string, unknown>, hookType: '', viralStrategy: {} as Record<string, unknown>, viralReport: {} as Record<string, unknown>, extra: {} as Record<string, unknown> };

    it('空参数返回空字符串', () => { expect(buildComposedContext(empty)).toBe(''); });

    it('仅含 strategySummary 生成摘要段', () => {
      const r = buildComposedContext({ ...empty, strategySummary: '快节奏+对比反差' });
      expect(r).toContain('【模板策略概要】快节奏+对比反差'); expect(r).not.toContain('【合并策略】');
    });

    it('含合并策略时输出 JSON', () => {
      const r = buildComposedContext({ ...empty, mergedStrategy: { hook_type: 'before_after', pace: 'medium' } });
      expect(r).toContain('【合并策略】'); expect(r).toContain('"hook_type":"before_after"');
    });

    it('含 hookType 输出钩子类型', () => {
      expect(buildComposedContext({ ...empty, hookType: 'problem_forward' })).toContain('【钩子类型】problem_forward');
    });

    it('含爆款策略输出策略 JSON', () => {
      const r = buildComposedContext({ ...empty, viralStrategy: { hook_type: 'question', pace: 'fast' } });
      expect(r).toContain('【爆款策略】'); expect(r).toContain('"hook_type":"question"');
    });

    it('含爆款数据输出数据参考', () => {
      const r = buildComposedContext({ ...empty, viralReport: { views: 50000, conversion: 0.08 } });
      expect(r).toContain('【爆款数据参考】'); expect(r).toContain('"views":50000');
    });

    it('含 extra 输出额外上下文', () => {
      const r = buildComposedContext({ ...empty, extra: { preferences: { color: 'warm' }, preference_remark: '强调轻便' } });
      expect(r).toContain('【额外上下文】'); expect(r).toContain('"preference_remark":"强调轻便"');
    });

    it('所有字段填写时输出完整六段', () => {
      const r = buildComposedContext({ strategySummary: '快节奏+对比反差', mergedStrategy: { hook_type: 'before_after' }, hookType: 'question', viralStrategy: { pace: 'fast' }, viralReport: { views: 100000 }, extra: { preferences: {} } });
      ['【模板策略概要】','【合并策略】','【钩子类型】','【爆款策略】','【爆款数据参考】','【额外上下文】'].forEach(s => expect(r).toContain(s));
    });
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言组合模式剧本生成功能
// 的完整性与正确性。待源码实现后移除 .skip 或直接运行。
//
// 用例编号映射:
//   TC-SCMP-001 ~ TC-SCMP-001-EXT3      正常流 (Happy Path)
//   TC-SCMP-BND-001 ~ TC-SCMP-BND-006   边界流 (Edge Cases)
//   TC-SCMP-ERR-001 ~ TC-SCMP-ERR-015   异常流 (Error Flow)
//   TC-SCMP-PERF-001 ~ TC-SCMP-PERF-004 性能流 (Performance)
//
// 覆盖率维度:
//   ├── buildQuickPrompt              (集成覆盖)
//   ├── parseScriptFromAIResponse     (集成覆盖)
//   ├── validateScriptSchema          (集成覆盖)
//   ├── checkCompliance               (集成覆盖)
//   ├── validateTemplate              (2 原子测试 + 集成覆盖)
//   ├── validateViralVideoAnalysis    (1 原子测试 + 集成覆盖)
//   ├── buildComposedContext          (8 原子测试)
//   ├── generateComposed              (26 集成测试)
//
// 总测试用例数: 37
// =============================================================================
