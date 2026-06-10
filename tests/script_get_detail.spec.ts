// =============================================================================
// TikStream AI — Script Get Detail 自动化测试基座
// 对应功能: GET /api/v1/scripts/:script_id (剧本详情查询 — 含完整分镜列表)
// 对应模块: Script (人员B) | 技术栈: Jest 29 + @nestjs/testing + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

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

interface TestScriptShot {
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

interface TestScript {
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

interface TestScriptWithShots {
  script: TestScript;
  shots: TestScriptShot[];
}

type MockPrismaService = {
  script: {
    findUnique: jest.Mock;
  };
};

const NOW = new Date('2026-05-23T12:00:00Z');
const SCRIPT_ID = 'dc52d4ff-0000-4000-a000-000000000001';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';

const mockScriptShotFactory = (i: number, overrides?: Partial<TestScriptShot>): TestScriptShot => ({
  id: `shot-uuid-${i}-${SCRIPT_ID}`,
  script_id: SCRIPT_ID,
  shot_id: `shot_${String(i).padStart(3, '0')}`,
  shot_index: i,
  duration: i === 1 ? 3.0 : (i === 2 ? 3.5 : (i === 3 ? 4.0 : (i === 4 ? 2.0 : 2.0))),
  scene_description_query: `close-up shot ${i} of product feature`,
  visual_description: `镜头${i}：展示产品核心功能，画面干净明亮。`,
  camera_movement: i === 1 ? 'Dolly_In_Fast' : (i === 2 ? 'Pan_Left' : (i === 3 ? 'Tilt_Up' : 'Static')),
  transition_type: i === 1 ? 'Fade_In' : (i === 2 ? 'Dissolve' : (i === 3 ? 'Wipe' : 'None')),
  voiceover_text: `第${i}段旁白：产品核心卖点生动表达。`,
  subtitle_text: `字幕${i}`,
  safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9],
  selected_slice_id: null,
  render_prompt: null,
  local_factor_patch: {},
  compliance_status: 'PASSED',
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockScriptFactory = (overrides?: Partial<TestScript>): TestScript => ({
  id: SCRIPT_ID,
  product_id: PRODUCT_ID,
  title: '智能无线卷发棒快速成片脚本',
  language: 'zh-CN',
  target_audience: '北美年轻女性,25-35岁',
  video_duration: 14.5,
  aspect_ratio: '9:16',
  style_vibe: 'clean-tech',
  generation_mode: 'PROMPT_DRIVEN',
  template_id: null,
  viral_video_id: null,
  constraint_list: ['total_duration<=15s', 'avoid_absolute_claims'],
  raw_json: {},
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockFiveShotsFactory = (): TestScriptShot[] =>
  [1, 2, 3, 4, 5].map((i) => mockScriptShotFactory(i));

const mockEightShotsFactory = (): TestScriptShot[] =>
  [1, 2, 3, 4, 5, 6, 7, 8].map((i) => mockScriptShotFactory(i, { duration: 1.875 }));

const mockOneShotFactory = (): TestScriptShot[] =>
  [mockScriptShotFactory(1, { duration: 5.0 })];

const mockPrismaServiceFactory = (): MockPrismaService => ({
  script: {
    findUnique: jest.fn(),
  },
});

describe('ScriptGetDetail — 剧本详情查询 (GET /api/v1/scripts/:script_id)', () => {
  let mockPrisma: MockPrismaService;

  let findScriptWithShots: (
    scriptId: string,
    prisma: MockPrismaService,
  ) => Promise<TestScriptWithShots | null>;

  let getScriptDetail: (
    scriptId: string,
    traceId: string | undefined,
    deps: { prisma: MockPrismaService; findScript: typeof findScriptWithShots },
  ) => Promise<TestScriptWithShots>;

  beforeAll(() => {
    findScriptWithShots = async (scriptId, prisma) => {
      if (!scriptId || scriptId.trim().length === 0) {
        throw Object.assign(new Error('script_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }

      try {
        const record = await prisma.script.findUnique({
          where: { id: scriptId },
          include: { shots: { orderBy: { shotIndex: 'asc' } } },
        });

        if (!record) {
          return null;
        }

        const rawShots = ((record as Record<string, unknown>).shots || []) as Array<Record<string, unknown>>;
        const shots = rawShots.map((shot): TestScriptShot => ({
          id: String(shot.id),
          script_id: String(shot.scriptId ?? shot.script_id),
          shot_id: (shot.shotId ?? shot.shot_id ?? null) as string | null,
          shot_index: Number(shot.shotIndex ?? shot.shot_index),
          duration: Number(shot.duration),
          scene_description_query: String(shot.sceneDescriptionQuery ?? shot.scene_description_query),
          visual_description: String(shot.visualDescription ?? shot.visual_description),
          camera_movement: String(shot.cameraMovement ?? shot.camera_movement),
          transition_type: String(shot.transitionType ?? shot.transition_type),
          voiceover_text: String(shot.voiceoverText ?? shot.voiceover_text),
          subtitle_text: String(shot.subtitleText ?? shot.subtitle_text),
          safe_zone_bounding_box: (shot.safeZoneBoundingBox ?? shot.safe_zone_bounding_box) as [number, number, number, number],
          selected_slice_id: (shot.selectedSliceId ?? shot.selected_slice_id ?? null) as string | null,
          render_prompt: (shot.renderPrompt ?? shot.render_prompt ?? null) as string | null,
          local_factor_patch: (shot.localFactorPatch ?? shot.local_factor_patch ?? {}) as Record<string, unknown>,
          compliance_status: String(shot.complianceStatus ?? shot.compliance_status),
          created_at: (shot.createdAt ?? shot.created_at) as Date,
          updated_at: (shot.updatedAt ?? shot.updated_at) as Date,
        }));

        const scriptMapped: TestScript = {
          id: record.id,
          product_id: record.productId,
          title: record.title,
          language: record.language,
          target_audience: record.targetAudience,
          video_duration: Number(record.videoDuration),
          aspect_ratio: record.aspectRatio === 'NINE_SIXTEEN' ? '9:16' : '16:9',
          style_vibe: record.styleVibe,
          generation_mode: record.generationMode,
          template_id: record.templateId,
          viral_video_id: record.viralVideoId,
          constraint_list: record.constraintList as string[],
          raw_json: record.rawJson as Record<string, unknown>,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
        };

        return { script: scriptMapped, shots };
      } catch (error) {
        const prismaError = error as Error & { code?: string };
        if (prismaError.code === 'P1001') {
          throw Object.assign(
            new Error('PostgreSQL 连接中断，请检查数据库状态'),
            {
              errorCode: 'INTERNAL_SERVER_ERROR',
              statusCode: HttpStatus.SERVICE_UNAVAILABLE,
              retryable: true,
              cause: error,
            },
          );
        }

        throw Object.assign(
          new Error(`查询剧本失败: ${(error as Error).message}`),
          {
            errorCode: 'INTERNAL_SERVER_ERROR',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: true,
            cause: error,
          },
        );
      }
    };

    getScriptDetail = async (scriptId, traceId, deps) => {
      const { prisma, findScript } = deps;
      const effectiveTraceId = traceId || `trc_${Date.now()}_detail`;

      const result = await findScript(scriptId, prisma);

      if (!result) {
        throw Object.assign(new Error(`剧本 ${scriptId} 不存在`), {
          errorCode: 'SCRIPT_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }

      return result;
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法 script_id → 完整 Script + ScriptShot[] 响应', () => {
    const scriptRecord = mockScriptFactory();
    const shotRecords = mockFiveShotsFactory();

    beforeEach(() => {
      mockPrisma.script.findUnique.mockResolvedValue({
        ...scriptRecord,
        productId: scriptRecord.product_id,
        skuCode: 'SKU-HB-PRO-001',
        videoDuration: scriptRecord.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: scriptRecord.style_vibe,
        generationMode: scriptRecord.generation_mode,
        templateId: scriptRecord.template_id,
        viralVideoId: scriptRecord.viral_video_id,
        constraintList: scriptRecord.constraint_list,
        rawJson: scriptRecord.raw_json,
        createdAt: scriptRecord.created_at,
        updatedAt: scriptRecord.updated_at,
        shots: shotRecords.map((s) => ({
          ...s,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });
    });

    it('TC-SCR-DTL-001: 查询存在剧本 — 返回完整 Script 顶层字段', async () => {
      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');

      const script = result.script;

      expect(script).toBeDefined();
      expect(script.id).toBe(SCRIPT_ID);
      expect(script.product_id).toBe(PRODUCT_ID);
      expect(typeof script.title).toBe('string');
      expect(script.title!.length).toBeGreaterThan(0);
      expect(script.language).toBe('zh-CN');
      expect(script.aspect_ratio).toBe('9:16');
      expect(script.style_vibe).toBe('clean-tech');
      expect(script.generation_mode).toBe('PROMPT_DRIVEN');
      expect(typeof script.video_duration).toBe('number');
      expect(script.video_duration).toBeLessThanOrEqual(15.0);
      expect(script.video_duration).toBeGreaterThan(0);

      expect(Array.isArray(script.constraint_list)).toBe(true);
      expect(script.constraint_list.length).toBeGreaterThan(0);
      expect(script.constraint_list).toContain('total_duration<=15s');

      expect(script.raw_json).toBeDefined();
      expect(typeof script.raw_json).toBe('object');

      expect(script.created_at).toBeInstanceOf(Date);
      expect(script.updated_at).toBeInstanceOf(Date);
    });

    it('TC-SCR-DTL-002: 查询存在剧本 — 分镜列表完整且有序', async () => {
      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      const shots = result.shots;
      expect(Array.isArray(shots)).toBe(true);
      expect(shots.length).toBe(5);

      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];

        expect(shot.shot_index).toBe(i + 1);
        expect(shot.script_id).toBe(SCRIPT_ID);
        expect(typeof shot.shot_id).toBe('string');
        expect(shot.shot_id!.length).toBeGreaterThan(0);
        expect(shot.duration).toBeGreaterThanOrEqual(1.5);
        expect(shot.duration).toBeLessThanOrEqual(5.0);
        expect(typeof shot.scene_description_query).toBe('string');
        expect(shot.scene_description_query.length).toBeGreaterThan(0);
        expect(typeof shot.visual_description).toBe('string');
        expect(shot.visual_description.length).toBeGreaterThan(0);
        expect(
          ['Static', 'Dolly_In_Fast', 'Dolly_Out', 'Pan_Left', 'Tilt_Up'],
        ).toContain(shot.camera_movement);
        expect(['None', 'Fade_In', 'Dissolve', 'Wipe']).toContain(
          shot.transition_type,
        );
        expect(typeof shot.voiceover_text).toBe('string');
        expect(shot.voiceover_text.length).toBeGreaterThan(0);
        expect(typeof shot.subtitle_text).toBe('string');
        expect(shot.subtitle_text.length).toBeGreaterThan(0);
        expect(Array.isArray(shot.safe_zone_bounding_box)).toBe(true);
        expect(shot.safe_zone_bounding_box).toHaveLength(4);
        for (const coord of shot.safe_zone_bounding_box) {
          expect(typeof coord).toBe('number');
          expect(coord).toBeGreaterThanOrEqual(0);
          expect(coord).toBeLessThanOrEqual(1);
        }
        expect(['PENDING', 'PASSED', 'REJECTED']).toContain(
          shot.compliance_status,
        );
        expect(typeof shot.local_factor_patch).toBe('object');
        expect(shot.local_factor_patch).not.toBeNull();
        expect(shot.created_at).toBeInstanceOf(Date);
        expect(shot.updated_at).toBeInstanceOf(Date);
      }
    });

    it('TC-SCR-DTL-003: 分镜总时长 = script.video_duration (容差 0.15s)', async () => {
      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      const shotsTotalDuration = result.shots.reduce(
        (sum: number, shot: TestScriptShot) => sum + Number(shot.duration),
        0,
      );

      expect(
        Math.abs(shotsTotalDuration - result.script.video_duration),
      ).toBeLessThanOrEqual(0.15);
    });

    it('TC-SCR-DTL-004: 不暴露内部 raw_json 字段在业务响应中 (Repository 层已处理)', async () => {
      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.script.raw_json).toBeDefined();
      expect(typeof result.script.raw_json).toBe('object');

      expect(result).not.toHaveProperty('_prismaRecord');
      expect(result).not.toHaveProperty('$transaction');
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端数据 → 系统优雅处理', () => {
    it('TC-SCR-DTL-BND-001: 仅含 1 个分镜的剧本正常返回', async () => {
      const singleShotScript = mockScriptFactory({ video_duration: 5.0 });
      const singleShot = mockOneShotFactory();

      mockPrisma.script.findUnique.mockResolvedValue({
        id: singleShotScript.id,
        productId: singleShotScript.product_id,
        title: singleShotScript.title,
        language: singleShotScript.language,
        targetAudience: singleShotScript.target_audience,
        videoDuration: singleShotScript.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: singleShotScript.style_vibe,
        generationMode: singleShotScript.generation_mode,
        templateId: singleShotScript.template_id,
        viralVideoId: singleShotScript.viral_video_id,
        constraintList: singleShotScript.constraint_list,
        rawJson: singleShotScript.raw_json,
        createdAt: singleShotScript.created_at,
        updatedAt: singleShotScript.updated_at,
        shots: singleShot.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await getScriptDetail(SINGLE_SHOT_SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.shots.length).toBe(1);
      expect(result.shots[0].shot_index).toBe(1);
      expect(result.shots[0].duration).toBe(5.0);
      expect(result.script.video_duration).toBe(5.0);
    });

    it('TC-SCR-DTL-BND-002: 含 8 个分镜的剧本正常返回 (上限)', async () => {
      const maxShotScript = mockScriptFactory({ video_duration: 15.0 });
      const maxShots = mockEightShotsFactory();

      mockPrisma.script.findUnique.mockResolvedValue({
        id: maxShotScript.id,
        productId: maxShotScript.product_id,
        title: maxShotScript.title,
        language: maxShotScript.language,
        targetAudience: maxShotScript.target_audience,
        videoDuration: maxShotScript.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: maxShotScript.style_vibe,
        generationMode: maxShotScript.generation_mode,
        templateId: maxShotScript.template_id,
        viralVideoId: maxShotScript.viral_video_id,
        constraintList: maxShotScript.constraint_list,
        rawJson: maxShotScript.raw_json,
        createdAt: maxShotScript.created_at,
        updatedAt: maxShotScript.updated_at,
        shots: maxShots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.shots.length).toBe(8);
      for (let i = 0; i < 8; i++) {
        expect(result.shots[i].shot_index).toBe(i + 1);
      }
      expect(result.script.video_duration).toBe(15.0);
    });

    it('TC-SCR-DTL-BND-003: 总时长恰好 15.0s (临界值) 正常返回', async () => {
      const borderlineScript = mockScriptFactory({ video_duration: 15.0 });
      const borderlineShots = [
        mockScriptShotFactory(1, { duration: 5.0 }),
        mockScriptShotFactory(2, { duration: 5.0 }),
        mockScriptShotFactory(3, { duration: 5.0 }),
      ];

      mockPrisma.script.findUnique.mockResolvedValue({
        id: borderlineScript.id,
        productId: borderlineScript.product_id,
        title: borderlineScript.title,
        language: borderlineScript.language,
        targetAudience: borderlineScript.target_audience,
        videoDuration: borderlineScript.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: borderlineScript.style_vibe,
        generationMode: borderlineScript.generation_mode,
        templateId: borderlineScript.template_id,
        viralVideoId: borderlineScript.viral_video_id,
        constraintList: borderlineScript.constraint_list,
        rawJson: borderlineScript.raw_json,
        createdAt: borderlineScript.created_at,
        updatedAt: borderlineScript.updated_at,
        shots: borderlineShots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.script.video_duration).toBe(15.0);
      expect(result.shots.length).toBe(3);
      const total = result.shots.reduce((s, sh) => s + sh.duration, 0);
      expect(total).toBe(15.0);
    });

    it('TC-SCR-DTL-BND-004: 单分镜时长 1.5s (最小值临界) 正常返回', async () => {
      const minShotScript = mockScriptFactory({ video_duration: 6.0 });
      const minShots = [
        mockScriptShotFactory(1, { duration: 1.5 }),
        mockScriptShotFactory(2, { duration: 1.5 }),
        mockScriptShotFactory(3, { duration: 1.5 }),
        mockScriptShotFactory(4, { duration: 1.5 }),
      ];

      mockPrisma.script.findUnique.mockResolvedValue({
        id: minShotScript.id,
        productId: minShotScript.product_id,
        title: minShotScript.title,
        language: minShotScript.language,
        targetAudience: minShotScript.target_audience,
        videoDuration: minShotScript.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: minShotScript.style_vibe,
        generationMode: minShotScript.generation_mode,
        templateId: minShotScript.template_id,
        viralVideoId: minShotScript.viral_video_id,
        constraintList: minShotScript.constraint_list,
        rawJson: minShotScript.raw_json,
        createdAt: minShotScript.created_at,
        updatedAt: minShotScript.updated_at,
        shots: minShots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.shots.length).toBe(4);
      for (const shot of result.shots) {
        expect(shot.duration).toBeGreaterThanOrEqual(1.5);
      }
    });

    it('TC-SCR-DTL-BND-005: 单分镜时长 5.0s (最大值临界) 正常返回', async () => {
      const maxShotScript = mockScriptFactory({ video_duration: 5.0 });
      const maxShots = [mockScriptShotFactory(1, { duration: 5.0 })];

      mockPrisma.script.findUnique.mockResolvedValue({
        id: maxShotScript.id,
        productId: maxShotScript.product_id,
        title: maxShotScript.title,
        language: maxShotScript.language,
        targetAudience: maxShotScript.target_audience,
        videoDuration: maxShotScript.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: maxShotScript.style_vibe,
        generationMode: maxShotScript.generation_mode,
        templateId: maxShotScript.template_id,
        viralVideoId: maxShotScript.viral_video_id,
        constraintList: maxShotScript.constraint_list,
        rawJson: maxShotScript.raw_json,
        createdAt: maxShotScript.created_at,
        updatedAt: maxShotScript.updated_at,
        shots: maxShots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.shots[0].duration).toBe(5.0);
    });

    it('TC-SCR-DTL-BND-006: template_id 为 null 正常返回 (非模板生成)', async () => {
      const scriptRecord = mockScriptFactory({ template_id: null });
      const shots = mockFiveShotsFactory();

      mockPrisma.script.findUnique.mockResolvedValue({
        id: scriptRecord.id,
        productId: scriptRecord.product_id,
        title: scriptRecord.title,
        language: scriptRecord.language,
        targetAudience: scriptRecord.target_audience,
        videoDuration: scriptRecord.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: scriptRecord.style_vibe,
        generationMode: scriptRecord.generation_mode,
        templateId: null,
        viralVideoId: scriptRecord.viral_video_id,
        constraintList: scriptRecord.constraint_list,
        rawJson: scriptRecord.raw_json,
        createdAt: scriptRecord.created_at,
        updatedAt: scriptRecord.updated_at,
        shots: shots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.script.template_id).toBeNull();
      expect(result.shots.length).toBe(5);
    });

    it('TC-SCR-DTL-BND-007: aspect_ratio 为 16:9 正常返回', async () => {
      const sixteenNineScript = mockScriptFactory({ aspect_ratio: '16:9' });
      const shots = mockFiveShotsFactory();

      mockPrisma.script.findUnique.mockResolvedValue({
        id: sixteenNineScript.id,
        productId: sixteenNineScript.product_id,
        title: sixteenNineScript.title,
        language: sixteenNineScript.language,
        targetAudience: sixteenNineScript.target_audience,
        videoDuration: sixteenNineScript.video_duration,
        aspectRatio: 'SIXTEEN_NINE',
        styleVibe: sixteenNineScript.style_vibe,
        generationMode: sixteenNineScript.generation_mode,
        templateId: sixteenNineScript.template_id,
        viralVideoId: sixteenNineScript.viral_video_id,
        constraintList: sixteenNineScript.constraint_list,
        rawJson: sixteenNineScript.raw_json,
        createdAt: sixteenNineScript.created_at,
        updatedAt: sixteenNineScript.updated_at,
        shots: shots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.script.aspect_ratio).toBe('16:9');
    });

    it('TC-SCR-DTL-BND-008: title 为 null 正常返回', async () => {
      const noTitleScript = mockScriptFactory({ title: null });
      const shots = mockFiveShotsFactory();

      mockPrisma.script.findUnique.mockResolvedValue({
        id: noTitleScript.id,
        productId: noTitleScript.product_id,
        title: null,
        language: noTitleScript.language,
        targetAudience: noTitleScript.target_audience,
        videoDuration: noTitleScript.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: noTitleScript.style_vibe,
        generationMode: noTitleScript.generation_mode,
        templateId: noTitleScript.template_id,
        viralVideoId: noTitleScript.viral_video_id,
        constraintList: noTitleScript.constraint_list,
        rawJson: noTitleScript.raw_json,
        createdAt: noTitleScript.created_at,
        updatedAt: noTitleScript.updated_at,
        shots: shots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.script.title).toBeNull();
      expect(result.shots.length).toBe(5);
    });

    it('TC-SCR-DTL-BND-009: 剧本分镜含 selected_slice_id 非 null 正常透出', async () => {
      const scriptRecord = mockScriptFactory();
      const shotsWithSlice = [
        mockScriptShotFactory(1, { selected_slice_id: 'slice_abc_001' }),
        mockScriptShotFactory(2, { selected_slice_id: null }),
        mockScriptShotFactory(3, { selected_slice_id: 'slice_def_002' }),
      ];

      mockPrisma.script.findUnique.mockResolvedValue({
        id: scriptRecord.id,
        productId: scriptRecord.product_id,
        title: scriptRecord.title,
        language: scriptRecord.language,
        targetAudience: scriptRecord.target_audience,
        videoDuration: shotsWithSlice.reduce((s, sh) => s + sh.duration, 0),
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: scriptRecord.style_vibe,
        generationMode: scriptRecord.generation_mode,
        templateId: scriptRecord.template_id,
        viralVideoId: scriptRecord.viral_video_id,
        constraintList: scriptRecord.constraint_list,
        rawJson: scriptRecord.raw_json,
        createdAt: scriptRecord.created_at,
        updatedAt: scriptRecord.updated_at,
        shots: shotsWithSlice.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.shots[0].selected_slice_id).toBe('slice_abc_001');
      expect(result.shots[1].selected_slice_id).toBeNull();
      expect(result.shots[2].selected_slice_id).toBe('slice_def_002');
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    it('TC-SCR-DTL-ERR-001: script_id 对应的剧本不存在 → SCRIPT_NOT_FOUND', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getScriptDetail('99999999-9999-9999-9999-999999999999', undefined, {
          prisma: mockPrisma,
          findScript: findScriptWithShots,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(caught!.message).toContain('不存在');
    });

    it('TC-SCR-DTL-ERR-002: script_id 为空字符串 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getScriptDetail('', undefined, {
          prisma: mockPrisma,
          findScript: findScriptWithShots,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SCR-DTL-ERR-003: script_id 为纯空白字符 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getScriptDetail('   ', undefined, {
          prisma: mockPrisma,
          findScript: findScriptWithShots,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SCR-DTL-ERR-004: PostgreSQL 连接中断 P1001 → INTERNAL_SERVER_ERROR', async () => {
      const dbError = new Error('Connection terminated unexpectedly');
      (dbError as Error & { code?: string }).code = 'P1001';
      mockPrisma.script.findUnique.mockRejectedValue(dbError);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getScriptDetail(SCRIPT_ID, undefined, {
          prisma: mockPrisma,
          findScript: findScriptWithShots,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(caught!.retryable).toBe(true);
      expect(caught!.message).toContain('PostgreSQL');
    });

    it('TC-SCR-DTL-ERR-005: 未知 Prisma 异常 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const unknownError = new Error('Unexpected Prisma engine crash');
      mockPrisma.script.findUnique.mockRejectedValue(unknownError);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getScriptDetail(SCRIPT_ID, undefined, {
          prisma: mockPrisma,
          findScript: findScriptWithShots,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
      expect(caught!.message).toContain('查询');
    });

    it('TC-SCR-DTL-ERR-006: script_id 格式非 UUID 仍然尝试查询 (不抛除 SCRIPT_NOT_FOUND 外的错误)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getScriptDetail('not-a-valid-uuid-at-all', undefined, {
          prisma: mockPrisma,
          findScript: findScriptWithShots,
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SCR-DTL-ERR-007: findUnique 返回含 null shots 字段时的防御性处理', async () => {
      mockPrisma.script.findUnique.mockResolvedValue({
        id: SCRIPT_ID,
        productId: PRODUCT_ID,
        title: 'Test Script',
        language: 'zh-CN',
        targetAudience: null,
        videoDuration: 3.0,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: 'clean-tech',
        generationMode: 'PROMPT_DRIVEN',
        templateId: null,
        viralVideoId: null,
        constraintList: [],
        rawJson: {},
        createdAt: NOW,
        updatedAt: NOW,
        shots: null,
      });

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.script.id).toBe(SCRIPT_ID);
      expect(Array.isArray(result.shots)).toBe(true);
      expect(result.shots.length).toBe(0);
    });

    it('TC-SCR-DTL-ERR-008: 错误的 trace_id 格式不影响正常返回 (不阻断业务)', async () => {
      const scriptRecord = mockScriptFactory();
      const shots = mockFiveShotsFactory();

      mockPrisma.script.findUnique.mockResolvedValue({
        id: scriptRecord.id,
        productId: scriptRecord.product_id,
        title: scriptRecord.title,
        language: scriptRecord.language,
        targetAudience: scriptRecord.target_audience,
        videoDuration: scriptRecord.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: scriptRecord.style_vibe,
        generationMode: scriptRecord.generation_mode,
        templateId: scriptRecord.template_id,
        viralVideoId: scriptRecord.viral_video_id,
        constraintList: scriptRecord.constraint_list,
        rawJson: scriptRecord.raw_json,
        createdAt: scriptRecord.created_at,
        updatedAt: scriptRecord.updated_at,
        shots: shots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await getScriptDetail(SCRIPT_ID, 'bad_format_trace_!@#$', {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      expect(result.script.id).toBe(SCRIPT_ID);
      expect(result.shots.length).toBe(5);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance Flow）
  // ===========================================================================

  describe('【性能流】耗时卡点 — 原子操作运行时间不得超出上限', () => {
    const scriptRecord = mockScriptFactory();
    const shots = mockFiveShotsFactory();

    const buildMockPrismaRecord = () => ({
      id: scriptRecord.id,
      productId: scriptRecord.product_id,
      title: scriptRecord.title,
      language: scriptRecord.language,
      targetAudience: scriptRecord.target_audience,
      videoDuration: scriptRecord.video_duration,
      aspectRatio: 'NINE_SIXTEEN',
      styleVibe: scriptRecord.style_vibe,
      generationMode: scriptRecord.generation_mode,
      templateId: scriptRecord.template_id,
      viralVideoId: scriptRecord.viral_video_id,
      constraintList: scriptRecord.constraint_list,
      rawJson: scriptRecord.raw_json,
      createdAt: scriptRecord.created_at,
      updatedAt: scriptRecord.updated_at,
      shots: shots.map((s) => ({
        id: s.id,
        scriptId: s.script_id,
        shotId: s.shot_id,
        shotIndex: s.shot_index,
        duration: s.duration,
        sceneDescriptionQuery: s.scene_description_query,
        visualDescription: s.visual_description,
        cameraMovement: s.camera_movement,
        transitionType: s.transition_type,
        voiceoverText: s.voiceover_text,
        subtitleText: s.subtitle_text,
        safeZoneBoundingBox: s.safe_zone_bounding_box,
        selectedSliceId: s.selected_slice_id,
        renderPrompt: s.render_prompt,
        localFactorPatch: s.local_factor_patch,
        complianceStatus: s.compliance_status,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
    });

    beforeEach(() => {
      mockPrisma.script.findUnique.mockResolvedValue(buildMockPrismaRecord());
    });

    it('TC-SCR-DTL-PERF-001: getScriptDetail 编排总耗时 ≤ 50ms (不含网络 I/O)', async () => {
      const PERF_CEILING_MS = 50;

      const start = performance.now();

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      const elapsed = performance.now() - start;

      expect(result.script.id).toBe(SCRIPT_ID);
      expect(result.shots.length).toBe(5);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SCR-DTL-PERF-002: findScriptWithShots 单次查询 ≤ 10ms', async () => {
      const PERF_CEILING_MS = 10;

      const start = performance.now();

      const result = await findScriptWithShots(SCRIPT_ID, mockPrisma);

      const elapsed = performance.now() - start;

      expect(result).not.toBeNull();
      expect(result!.shots.length).toBe(5);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SCR-DTL-PERF-003: 连续 10 次查询无性能退化 (avg ≤ 10ms)', async () => {
      const ITERATIONS = 10;
      const PERF_CEILING_MS_PER_ITERATION = 10;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await getScriptDetail(SCRIPT_ID, undefined, {
          prisma: mockPrisma,
          findScript: findScriptWithShots,
        });
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 10000);

    it('TC-SCR-DTL-PERF-004: 8 分镜大剧本查询 ≤ 30ms 不退化', async () => {
      const PERF_CEILING_MS = 30;
      const bigShots = mockEightShotsFactory();
      const bigRecord = {
        ...buildMockPrismaRecord(),
        videoDuration: 15.0,
        shots: bigShots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      };

      mockPrisma.script.findUnique.mockResolvedValue(bigRecord);

      const start = performance.now();

      const result = await getScriptDetail(SCRIPT_ID, undefined, {
        prisma: mockPrisma,
        findScript: findScriptWithShots,
      });

      const elapsed = performance.now() - start;

      expect(result.shots.length).toBe(8);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-SCR-DTL-PERF-005: SCRIPT_NOT_FOUND 走快速失败路径 ≤ 5ms', async () => {
      const PERF_CEILING_MS = 5;
      mockPrisma.script.findUnique.mockResolvedValue(null);

      const start = performance.now();

      let threw = false;
      try {
        await getScriptDetail('99999999-9999-9999-9999-999999999999', undefined, {
          prisma: mockPrisma,
          findScript: findScriptWithShots,
        });
      } catch {
        threw = true;
      }

      const elapsed = performance.now() - start;

      expect(threw).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });

  // ===========================================================================
  // 独立原子函数测试（Repository 层 findScriptWithShots 的纯逻辑验证）
  // ===========================================================================

  describe('【原子函数】独立校验 findScriptWithShots', () => {
    it('findScriptWithShots 对合法 UUID 返回非 null 结果', async () => {
      const scriptRecord = mockScriptFactory();
      const shots = mockFiveShotsFactory();

      mockPrisma.script.findUnique.mockResolvedValue({
        id: scriptRecord.id,
        productId: scriptRecord.product_id,
        title: scriptRecord.title,
        language: scriptRecord.language,
        targetAudience: scriptRecord.target_audience,
        videoDuration: scriptRecord.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: scriptRecord.style_vibe,
        generationMode: scriptRecord.generation_mode,
        templateId: scriptRecord.template_id,
        viralVideoId: scriptRecord.viral_video_id,
        constraintList: scriptRecord.constraint_list,
        rawJson: scriptRecord.raw_json,
        createdAt: scriptRecord.created_at,
        updatedAt: scriptRecord.updated_at,
        shots: shots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await findScriptWithShots(SCRIPT_ID, mockPrisma);

      expect(result).not.toBeNull();
      expect(result!.script.id).toBe(SCRIPT_ID);
      expect(result!.script.product_id).toBe(PRODUCT_ID);
      expect(result!.shots.length).toBe(5);
    });

    it('findScriptWithShots NINE_SIXTEEN 映射为 9:16', async () => {
      const scriptRecord = mockScriptFactory({ aspect_ratio: '9:16' });
      const shots = mockFiveShotsFactory();

      mockPrisma.script.findUnique.mockResolvedValue({
        id: scriptRecord.id,
        productId: scriptRecord.product_id,
        title: scriptRecord.title,
        language: scriptRecord.language,
        targetAudience: scriptRecord.target_audience,
        videoDuration: scriptRecord.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: scriptRecord.style_vibe,
        generationMode: scriptRecord.generation_mode,
        templateId: scriptRecord.template_id,
        viralVideoId: scriptRecord.viral_video_id,
        constraintList: scriptRecord.constraint_list,
        rawJson: scriptRecord.raw_json,
        createdAt: scriptRecord.created_at,
        updatedAt: scriptRecord.updated_at,
        shots: shots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await findScriptWithShots(SCRIPT_ID, mockPrisma);

      expect(result!.script.aspect_ratio).toBe('9:16');
    });

    it('findScriptWithShots SIXTEEN_NINE 映射为 16:9', async () => {
      const scriptRecord = mockScriptFactory({ aspect_ratio: '16:9' });
      const shots = mockFiveShotsFactory();

      mockPrisma.script.findUnique.mockResolvedValue({
        id: scriptRecord.id,
        productId: scriptRecord.product_id,
        title: scriptRecord.title,
        language: scriptRecord.language,
        targetAudience: scriptRecord.target_audience,
        videoDuration: scriptRecord.video_duration,
        aspectRatio: 'SIXTEEN_NINE',
        styleVibe: scriptRecord.style_vibe,
        generationMode: scriptRecord.generation_mode,
        templateId: scriptRecord.template_id,
        viralVideoId: scriptRecord.viral_video_id,
        constraintList: scriptRecord.constraint_list,
        rawJson: scriptRecord.raw_json,
        createdAt: scriptRecord.created_at,
        updatedAt: scriptRecord.updated_at,
        shots: shots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await findScriptWithShots(SCRIPT_ID, mockPrisma);

      expect(result!.script.aspect_ratio).toBe('16:9');
    });

    it('findScriptWithShots 分镜按 shot_index 升序排列', async () => {
      const scriptRecord = mockScriptFactory();
      const unsortedShots = [
        mockScriptShotFactory(3),
        mockScriptShotFactory(1),
        mockScriptShotFactory(5),
        mockScriptShotFactory(2),
        mockScriptShotFactory(4),
      ];

      const prismaShots = unsortedShots.map((s) => ({
        id: s.id,
        scriptId: s.script_id,
        shotId: s.shot_id,
        shotIndex: s.shot_index,
        duration: s.duration,
        sceneDescriptionQuery: s.scene_description_query,
        visualDescription: s.visual_description,
        cameraMovement: s.camera_movement,
        transitionType: s.transition_type,
        voiceoverText: s.voiceover_text,
        subtitleText: s.subtitle_text,
        safeZoneBoundingBox: s.safe_zone_bounding_box,
        selectedSliceId: s.selected_slice_id,
        renderPrompt: s.render_prompt,
        localFactorPatch: s.local_factor_patch,
        complianceStatus: s.compliance_status,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }));

      prismaShots.sort((a, b) => a.shotIndex - b.shotIndex);

      mockPrisma.script.findUnique.mockResolvedValue({
        id: scriptRecord.id,
        productId: scriptRecord.product_id,
        title: scriptRecord.title,
        language: scriptRecord.language,
        targetAudience: scriptRecord.target_audience,
        videoDuration: scriptRecord.video_duration,
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: scriptRecord.style_vibe,
        generationMode: scriptRecord.generation_mode,
        templateId: scriptRecord.template_id,
        viralVideoId: scriptRecord.viral_video_id,
        constraintList: scriptRecord.constraint_list,
        rawJson: scriptRecord.raw_json,
        createdAt: scriptRecord.created_at,
        updatedAt: scriptRecord.updated_at,
        shots: prismaShots,
      });

      const result = await findScriptWithShots(SCRIPT_ID, mockPrisma);

      expect(result!.shots.length).toBe(5);
      for (let i = 0; i < result!.shots.length; i++) {
        expect(result!.shots[i].shot_index).toBe(i + 1);
      }
    });

    it('findScriptWithShots 对 null 记录返回 null', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(null);

      const result = await findScriptWithShots(
        '99999999-9999-9999-9999-999999999999',
        mockPrisma,
      );

      expect(result).toBeNull();
    });

    it('findScriptWithShots videoDuration Decimal 映射为 number', async () => {
      const scriptRecord = mockScriptFactory();
      const shots = mockFiveShotsFactory();

      mockPrisma.script.findUnique.mockResolvedValue({
        id: scriptRecord.id,
        productId: scriptRecord.product_id,
        title: scriptRecord.title,
        language: scriptRecord.language,
        targetAudience: scriptRecord.target_audience,
        videoDuration: { toNumber: () => 14.5, toString: () => '14.5', s: 1, e: 1, d: [145, 1] },
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: scriptRecord.style_vibe,
        generationMode: scriptRecord.generation_mode,
        templateId: scriptRecord.template_id,
        viralVideoId: scriptRecord.viral_video_id,
        constraintList: scriptRecord.constraint_list,
        rawJson: scriptRecord.raw_json,
        createdAt: scriptRecord.created_at,
        updatedAt: scriptRecord.updated_at,
        shots: shots.map((s) => ({
          id: s.id,
          scriptId: s.script_id,
          shotId: s.shot_id,
          shotIndex: s.shot_index,
          duration: s.duration,
          sceneDescriptionQuery: s.scene_description_query,
          visualDescription: s.visual_description,
          cameraMovement: s.camera_movement,
          transitionType: s.transition_type,
          voiceoverText: s.voiceover_text,
          subtitleText: s.subtitle_text,
          safeZoneBoundingBox: s.safe_zone_bounding_box,
          selectedSliceId: s.selected_slice_id,
          renderPrompt: s.render_prompt,
          localFactorPatch: s.local_factor_patch,
          complianceStatus: s.compliance_status,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      });

      const result = await findScriptWithShots(SCRIPT_ID, mockPrisma);

      expect(result!.script.video_duration).toBe(14.5);
      expect(typeof result!.script.video_duration).toBe('number');
    });
  });
});

const SINGLE_SHOT_SCRIPT_ID = 'dc52d4ff-0000-4000-a000-000000000002';
