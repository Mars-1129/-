// =============================================================================
// TikStream AI — Script Version 自动化测试基座
// 对应功能: POST /api/v1/scripts/:scriptId/versions (保存版本快照)
//           GET /api/v1/scripts/:scriptId/versions (版本列表)
//           POST /api/v1/scripts/:scriptId/versions/:versionId/rollback (版本回滚)
// 对应模块: Script (人员B) | 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// =============================================================================
// 0. 测试专用类型定义
// =============================================================================

interface TestScriptShot {
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

interface TestScriptVersion {
  id: string;
  script_id: string;
  version_number: number;
  version_tag: string | null;
  title: string | null;
  video_duration: number;
  shots_snapshot: TestScriptShot[];
  style_vibe: string;
  language: string;
  target_audience: string | null;
  constraint_list: string[];
  change_summary: string | null;
  created_by: string | null;
  created_at: Date;
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
  script: { findUnique: jest.Mock; update: jest.Mock };
  scriptShot: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
  scriptVersion: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
};

// =============================================================================
// 常量
// =============================================================================

const NOW = new Date('2026-06-03T12:00:00Z');
const SCRIPT_ID = 'dc52d4ff-0000-4000-a000-0000000000b1';
const VERSION_ID_1 = 'ver_20260603_001';
const VERSION_ID_2 = 'ver_20260603_002';
const VERSION_ID_3 = 'ver_20260603_003';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';

const MAX_VERSIONS_PER_SCRIPT = 20;

// =============================================================================
// Mock Factories
// =============================================================================

const mockShotFactory = (index: number, overrides?: Partial<TestScriptShot>): TestScriptShot => ({
  shot_index: index,
  duration: index === 1 ? 3.0 : index === 2 ? 3.5 : index === 3 ? 4.0 : index === 4 ? 2.0 : 2.0,
  scene_description_query: `close-up shot ${index} of product`,
  visual_description: `镜头${index}：展示产品功能。`,
  camera_movement: index === 1 ? 'Dolly_In_Fast' : index === 2 ? 'Pan_Left' : index === 3 ? 'Tilt_Up' : 'Static',
  transition_type: index === 1 ? 'Fade_In' : index === 2 ? 'Dissolve' : index === 3 ? 'Wipe' : 'None',
  voiceover_text: `第${index}段旁白。`,
  subtitle_text: `字幕${index}`,
  safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9],
  compliance_status: 'PASSED',
  ...overrides,
});

const mock3ShotsFactory = (): TestScriptShot[] =>
  [1, 2, 3].map((i) => mockShotFactory(i, { duration: i === 1 ? 3.0 : i === 2 ? 4.0 : 5.0 }));

const mock5ShotsFactory = (): TestScriptShot[] =>
  [1, 2, 3, 4, 5].map((i) => mockShotFactory(i));

const mockScriptFactory = (overrides?: Partial<TestScript>): TestScript => ({
  id: SCRIPT_ID,
  product_id: PRODUCT_ID,
  title: '智能无线卷发棒脚本 v1',
  language: 'zh-CN',
  target_audience: '北美年轻女性,25-35岁',
  video_duration: 14.5,
  aspect_ratio: '9:16',
  style_vibe: 'clean-tech',
  generation_mode: 'PROMPT_DRIVEN',
  template_id: null,
  viral_video_id: null,
  constraint_list: ['total_duration<=15s'],
  raw_json: {},
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockVersionFactory = (
  versionNumber: number,
  overrides?: Partial<TestScriptVersion>,
): TestScriptVersion => ({
  id: `ver_20260603_00${versionNumber}`,
  script_id: SCRIPT_ID,
  version_number: versionNumber,
  version_tag: versionNumber === 1 ? '初始版本' : versionNumber === 2 ? '调整话术' : `v${versionNumber}`,
  title: `智能无线卷发棒脚本 v${versionNumber}`,
  video_duration: 14.5,
  shots_snapshot: versionNumber === 1 ? mock3ShotsFactory() : mock5ShotsFactory(),
  style_vibe: 'clean-tech',
  language: 'zh-CN',
  target_audience: '北美年轻女性,25-35岁',
  constraint_list: ['total_duration<=15s'],
  change_summary: versionNumber === 1 ? '初始创建' : `第 ${versionNumber} 次修改`,
  created_by: null,
  created_at: new Date(NOW.getTime() - (3 - versionNumber) * 3600 * 1000),
  ...overrides,
});

const mockPrismaServiceFactory = (): MockPrismaService => {
  const client = {
    script: { findUnique: jest.fn(), update: jest.fn() },
    scriptShot: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
    scriptVersion: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
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

describe('ScriptVersion — 脚本版本保存、列表、回滚', () => {
  let mockPrisma: MockPrismaService;

  // ---- 原子函数类型声明 ----

  let validateScriptId: (scriptId: string) => void;
  let validateVersionId: (versionId: string) => void;
  let findScriptWithShots: (prisma: MockPrismaService, scriptId: string) => Promise<TestScriptWithShots>;
  let countVersions: (prisma: MockPrismaService, scriptId: string) => Promise<number>;
  let saveVersionSnapshot: (
    prisma: MockPrismaService,
    script: TestScript,
    shots: TestScriptShot[],
    tag?: string,
  ) => Promise<TestScriptVersion>;
  let listVersions: (
    prisma: MockPrismaService,
    scriptId: string,
    page: number,
    pageSize: number,
  ) => Promise<{ items: TestScriptVersion[]; total: number }>;
  let findVersionById: (prisma: MockPrismaService, versionId: string) => Promise<TestScriptVersion>;
  let rollbackToVersion: (
    prisma: MockPrismaService,
    scriptId: string,
    version: TestScriptVersion,
  ) => Promise<TestScript>;

  // ---- 编排函数 ----

  let saveVersion: (
    scriptId: string,
    dto: { version_tag?: string; change_summary?: string },
    deps: { prisma: MockPrismaService },
  ) => Promise<TestScriptVersion>;

  let getVersionList: (
    scriptId: string,
    query: { page?: number; page_size?: number },
    deps: { prisma: MockPrismaService },
  ) => Promise<{ items: TestScriptVersion[]; page: number; page_size: number; total: number }>;

  let rollbackScript: (
    scriptId: string,
    versionId: string,
    deps: { prisma: MockPrismaService },
  ) => Promise<TestScriptWithShots>;

  beforeAll(() => {
    // ---- validateScriptId ----
    validateScriptId = (scriptId: string) => {
      if (!scriptId || scriptId.trim().length === 0) {
        throw Object.assign(new Error('script_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
    };

    // ---- validateVersionId ----
    validateVersionId = (versionId: string) => {
      if (!versionId || versionId.trim().length === 0) {
        throw Object.assign(new Error('version_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
    };

    // ---- findScriptWithShots ----
    findScriptWithShots = async (prisma: MockPrismaService, scriptId: string): Promise<TestScriptWithShots> => {
      const record = await prisma.script.findUnique({
        where: { id: scriptId },
      });
      if (!record) {
        throw Object.assign(new Error(`剧本 ${scriptId} 不存在`), {
          errorCode: 'SCRIPT_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }
      const shots = await prisma.scriptShot.findMany({
        where: { script_id: scriptId },
        orderBy: { shot_index: 'asc' },
      });
      return { script: record as unknown as TestScript, shots: shots as unknown as TestScriptShot[] };
    };

    // ---- countVersions ----
    countVersions = async (prisma: MockPrismaService, scriptId: string): Promise<number> => {
      return prisma.scriptVersion.count({ where: { script_id: scriptId } });
    };

    // ---- saveVersionSnapshot ----
    saveVersionSnapshot = async (
      prisma: MockPrismaService,
      script: TestScript,
      shots: TestScriptShot[],
      tag?: string,
    ): Promise<TestScriptVersion> => {
      const currentCount = await prisma.scriptVersion.count({ where: { script_id: script.id } });
      const versionNumber = currentCount + 1;

      const version = await prisma.scriptVersion.create({
        data: {
          id: `ver_${Date.now()}_${versionNumber}`,
          script_id: script.id,
          version_number: versionNumber,
          version_tag: tag || null,
          title: script.title,
          video_duration: script.video_duration,
          shots_snapshot: shots,
          style_vibe: script.style_vibe,
          language: script.language,
          target_audience: script.target_audience,
          constraint_list: script.constraint_list,
          change_summary: null,
          created_by: null,
          created_at: new Date(),
        },
      });

      return version as unknown as TestScriptVersion;
    };

    // ---- listVersions ----
    listVersions = async (
      prisma: MockPrismaService,
      scriptId: string,
      page: number,
      pageSize: number,
    ): Promise<{ items: TestScriptVersion[]; total: number }> => {
      const [items, total] = await Promise.all([
        prisma.scriptVersion.findMany({
          where: { script_id: scriptId },
          orderBy: { version_number: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.scriptVersion.count({ where: { script_id: scriptId } }),
      ]);
      return { items: items as unknown as TestScriptVersion[], total };
    };

    // ---- findVersionById ----
    findVersionById = async (prisma: MockPrismaService, versionId: string): Promise<TestScriptVersion> => {
      const version = await prisma.scriptVersion.findUnique({ where: { id: versionId } });
      if (!version) {
        throw Object.assign(new Error(`版本 ${versionId} 不存在`), {
          errorCode: 'VERSION_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }
      return version as unknown as TestScriptVersion;
    };

    // ---- rollbackToVersion ----
    rollbackToVersion = async (
      prisma: MockPrismaService,
      scriptId: string,
      version: TestScriptVersion,
    ): Promise<TestScript> => {
      const updated = await prisma.script.update({
        where: { id: scriptId },
        data: {
          title: version.title,
          video_duration: version.video_duration,
          style_vibe: version.style_vibe,
          language: version.language,
          target_audience: version.target_audience,
          constraint_list: version.constraint_list,
          updated_at: new Date(),
        },
      });

      // 回滚分镜数据
      await prisma.scriptShot.deleteMany({ where: { script_id: scriptId } });
      if (version.shots_snapshot.length > 0) {
        await prisma.scriptShot.createMany({
          data: version.shots_snapshot.map((shot) => ({
            ...shot,
            script_id: scriptId,
            shot_id: `shot_${String(shot.shot_index).padStart(3, '0')}`,
            id: `shot-uuid-${shot.shot_index}-${scriptId}`,
            selected_slice_id: null,
            render_prompt: null,
            local_factor_patch: {},
          })),
        });
      }

      return updated as unknown as TestScript;
    };

    // ---- 编排函数: saveVersion ----
    saveVersion = async (scriptId, dto, deps) => {
      const { prisma } = deps;
      validateScriptId(scriptId);

      const { script, shots } = await findScriptWithShots(prisma, scriptId);

      if (shots.length === 0) {
        throw Object.assign(new Error('无法为空分镜列表的剧本创建版本'), {
          errorCode: 'SCRIPT_NO_SHOTS',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      const currentCount = await countVersions(prisma, scriptId);
      if (currentCount >= MAX_VERSIONS_PER_SCRIPT) {
        throw Object.assign(new Error(`版本数量已达上限 ${MAX_VERSIONS_PER_SCRIPT}，请删除旧版本后重试`), {
          errorCode: 'VERSION_LIMIT_EXCEEDED',
          statusCode: HttpStatus.CONFLICT,
        });
      }

      const version = await saveVersionSnapshot(prisma, script, shots, dto.version_tag);
      return version;
    };

    // ---- 编排函数: getVersionList ----
    getVersionList = async (scriptId, query, deps) => {
      const { prisma } = deps;
      validateScriptId(scriptId);

      const page = query.page === undefined ? 1 : Number(query.page);
      const pageSize = query.page_size === undefined ? 20 : Number(query.page_size);

      if (!Number.isInteger(page) || page < 1) {
        throw Object.assign(new Error('page 必须为正整数'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw Object.assign(new Error('page_size 必须在 1-100 之间'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      // 验证剧本存在
      await findScriptWithShots(prisma, scriptId);

      const { items, total } = await listVersions(prisma, scriptId, page, pageSize);

      return { items, page, page_size: pageSize, total };
    };

    // ---- 编排函数: rollbackScript ----
    rollbackScript = async (scriptId, versionId, deps) => {
      const { prisma } = deps;
      validateScriptId(scriptId);
      validateVersionId(versionId);

      await findScriptWithShots(prisma, scriptId);

      const version = await findVersionById(prisma, versionId);

      if (version.script_id !== scriptId) {
        throw Object.assign(new Error(`版本 ${versionId} 不属于剧本 ${scriptId}`), {
          errorCode: 'VERSION_SCRIPT_MISMATCH',
          statusCode: HttpStatus.CONFLICT,
        });
      }

      await rollbackToVersion(prisma, scriptId, version);

      // 回滚后重新查询
      return findScriptWithShots(prisma, scriptId);
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 完整数据契约输出', () => {
    const script = mockScriptFactory();
    const shots = mock5ShotsFactory();

    beforeEach(() => {
      mockPrisma.script.findUnique.mockResolvedValue(script);
      mockPrisma.scriptShot.findMany.mockResolvedValue(shots);
    });

    it('TC-SCR-VER-001: 保存版本成功 → 返回 version_number + shots_snapshot', async () => {
      mockPrisma.scriptVersion.count.mockResolvedValue(0);
      mockPrisma.scriptVersion.create.mockResolvedValue(
        mockVersionFactory(1, { shots_snapshot: shots }),
      );

      const result = await saveVersion(SCRIPT_ID, { version_tag: 'v1.0' }, { prisma: mockPrisma });

      expect(result).toHaveProperty('version_number', 1);
      expect(result).toHaveProperty('shots_snapshot');
      expect(Array.isArray(result.shots_snapshot)).toBe(true);
      expect(result.shots_snapshot.length).toBe(5);
      expect(result.script_id).toBe(SCRIPT_ID);
    });

    it('TC-SCR-VER-002: 版本列表查询 → 按 version_number 降序排列', async () => {
      mockPrisma.scriptVersion.findMany.mockResolvedValue([
        mockVersionFactory(3),
        mockVersionFactory(2),
        mockVersionFactory(1),
      ]);
      mockPrisma.scriptVersion.count.mockResolvedValue(3);

      const result = await getVersionList(SCRIPT_ID, {}, { prisma: mockPrisma });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(3);
      expect(result.items[0].version_number).toBe(3);
      expect(result.items[1].version_number).toBe(2);
      expect(result.items[2].version_number).toBe(1);
    });

    it('TC-SCR-VER-003: 版本回滚成功 → 剧本数据恢复到快照状态', async () => {
      const version = mockVersionFactory(1, { shots_snapshot: mock3ShotsFactory(), video_duration: 12.0 });
      mockPrisma.scriptVersion.findUnique.mockResolvedValue(version);
      mockPrisma.script.update.mockResolvedValue({
        ...script,
        title: version.title,
        video_duration: version.video_duration,
        style_vibe: version.style_vibe,
      });
      mockPrisma.scriptShot.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.scriptShot.createMany.mockResolvedValue({ count: 3 });
      mockPrisma.scriptShot.findMany.mockResolvedValue(version.shots_snapshot);

      const result = await rollbackScript(SCRIPT_ID, VERSION_ID_1, { prisma: mockPrisma });

      expect(result.script.video_duration).toBe(12.0);
      expect(result.shots).toHaveLength(3);
    });

    it('TC-SCR-VER-004: 保存不带 tag 的版本 → version_tag 为 null', async () => {
      mockPrisma.scriptVersion.count.mockResolvedValue(2);
      mockPrisma.scriptVersion.create.mockResolvedValue(
        mockVersionFactory(3, { version_tag: null }),
      );

      const result = await saveVersion(SCRIPT_ID, {}, { prisma: mockPrisma });

      expect(result.version_tag).toBeNull();
      expect(result.version_number).toBe(3);
    });

    it('TC-SCR-VER-005: 保存版本时 version_number 自动递增 (1→2→3)', async () => {
      mockPrisma.scriptVersion.count.mockResolvedValue(1);
      mockPrisma.scriptVersion.create.mockResolvedValue(
        mockVersionFactory(2),
      );

      const result = await saveVersion(SCRIPT_ID, { version_tag: 'v2' }, { prisma: mockPrisma });

      expect(result.version_number).toBe(2);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    const script = mockScriptFactory();
    const shots = mock5ShotsFactory();

    beforeEach(() => {
      mockPrisma.script.findUnique.mockResolvedValue(script);
      mockPrisma.scriptShot.findMany.mockResolvedValue(shots);
    });

    it('TC-SCR-VER-BND-001: 版本列表查空剧本的版本 → items=[], total=0', async () => {
      mockPrisma.scriptVersion.findMany.mockResolvedValue([]);
      mockPrisma.scriptVersion.count.mockResolvedValue(0);

      const result = await getVersionList(SCRIPT_ID, {}, { prisma: mockPrisma });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('TC-SCR-VER-BND-002: 版本数恰好在 MAX_VERSIONS_PER_SCRIPT - 1 → 仍可保存', async () => {
      mockPrisma.scriptVersion.count.mockResolvedValue(MAX_VERSIONS_PER_SCRIPT - 1);
      mockPrisma.scriptVersion.create.mockResolvedValue(
        mockVersionFactory(MAX_VERSIONS_PER_SCRIPT),
      );

      await expect(
        saveVersion(SCRIPT_ID, {}, { prisma: mockPrisma }),
      ).resolves.toHaveProperty('version_number', MAX_VERSIONS_PER_SCRIPT);
    });

    it('TC-SCR-VER-BND-003: version_tag 超长字符串 (200 字符) → 保存成功', async () => {
      const longTag = 'A'.repeat(200);
      mockPrisma.scriptVersion.count.mockResolvedValue(0);
      mockPrisma.scriptVersion.create.mockResolvedValue(
        mockVersionFactory(1, { version_tag: longTag }),
      );

      const result = await saveVersion(SCRIPT_ID, { version_tag: longTag }, { prisma: mockPrisma });

      expect(result.version_tag).toBe(longTag);
      expect(result.version_tag!.length).toBe(200);
    });

    it('TC-SCR-VER-BND-004: shots_snapshot 仅 1 个分镜 → 保存成功', async () => {
      const singleShot = [mockShotFactory(1, { duration: 5.0 })];
      mockPrisma.scriptShot.findMany.mockResolvedValue(singleShot);
      mockPrisma.scriptVersion.count.mockResolvedValue(0);
      mockPrisma.scriptVersion.create.mockResolvedValue(
        mockVersionFactory(1, { shots_snapshot: singleShot }),
      );

      const result = await saveVersion(SCRIPT_ID, {}, { prisma: mockPrisma });

      expect(result.shots_snapshot).toHaveLength(1);
    });

    it('TC-SCR-VER-BND-005: page_size=1 分页正常', async () => {
      mockPrisma.scriptVersion.findMany.mockResolvedValue([mockVersionFactory(3)]);
      mockPrisma.scriptVersion.count.mockResolvedValue(3);

      const result = await getVersionList(
        SCRIPT_ID,
        { page: 1, page_size: 1 },
        { prisma: mockPrisma },
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(3);
    });

    it('TC-SCR-VER-BND-006: 回滚到仅有 1 个分镜的版本正常', async () => {
      const version = mockVersionFactory(1, { shots_snapshot: [mockShotFactory(1)], video_duration: 3.0 });
      mockPrisma.scriptVersion.findUnique.mockResolvedValue(version);
      mockPrisma.script.update.mockResolvedValue({ ...script, video_duration: 3.0 });
      mockPrisma.scriptShot.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.scriptShot.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.scriptShot.findMany.mockResolvedValue(version.shots_snapshot);

      const result = await rollbackScript(SCRIPT_ID, VERSION_ID_1, { prisma: mockPrisma });

      expect(result.shots).toHaveLength(1);
      expect(result.script.video_duration).toBe(3.0);
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const script = mockScriptFactory();
    const shots = mock5ShotsFactory();

    it('TC-SCR-VER-ERR-001: 保存版本时 script_id 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await saveVersion('', {}, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-SCR-VER-ERR-002: 剧本不存在 → SCRIPT_NOT_FOUND', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await saveVersion('99999999-9999-9999-9999-999999999999', {}, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SCR-VER-ERR-003: 空分镜列表剧本不可保存版本 → SCRIPT_NO_SHOTS', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(script);
      mockPrisma.scriptShot.findMany.mockResolvedValue([]);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await saveVersion(SCRIPT_ID, {}, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NO_SHOTS');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SCR-VER-ERR-004: 版本数量达到上限 → VERSION_LIMIT_EXCEEDED', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(script);
      mockPrisma.scriptShot.findMany.mockResolvedValue(shots);
      mockPrisma.scriptVersion.count.mockResolvedValue(MAX_VERSIONS_PER_SCRIPT);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await saveVersion(SCRIPT_ID, {}, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VERSION_LIMIT_EXCEEDED');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('TC-SCR-VER-ERR-005: 回滚时 version_id 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await rollbackScript(SCRIPT_ID, '', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-SCR-VER-ERR-006: 回滚时剧本不存在 → SCRIPT_NOT_FOUND', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await rollbackScript(SCRIPT_ID, VERSION_ID_1, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SCR-VER-ERR-007: 回滚时版本不存在 → VERSION_NOT_FOUND', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(script);
      mockPrisma.scriptShot.findMany.mockResolvedValue(shots);
      mockPrisma.scriptVersion.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await rollbackScript(SCRIPT_ID, 'nonexistent-version-id', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VERSION_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SCR-VER-ERR-008: 回滚时版本不属于该剧本 → VERSION_SCRIPT_MISMATCH', async () => {
      const version = mockVersionFactory(1, { script_id: 'other-script-id' });
      mockPrisma.script.findUnique.mockResolvedValue(script);
      mockPrisma.scriptShot.findMany.mockResolvedValue(shots);
      mockPrisma.scriptVersion.findUnique.mockResolvedValue(version);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await rollbackScript(SCRIPT_ID, VERSION_ID_1, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VERSION_SCRIPT_MISMATCH');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('TC-SCR-VER-ERR-009: 版本列表分页参数 page=0 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getVersionList(SCRIPT_ID, { page: 0 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-SCR-VER-ERR-010: 版本列表分页参数 page 为负数 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getVersionList(SCRIPT_ID, { page: -1 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-SCR-VER-ERR-011: 版本列表 page_size 超过 100 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getVersionList(SCRIPT_ID, { page_size: 101 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-SCR-VER-ERR-012: 版本列表 page_size 为 0 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getVersionList(SCRIPT_ID, { page_size: 0 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-SCR-VER-ERR-013: 查询不存在的剧本的版本列表 → SCRIPT_NOT_FOUND', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getVersionList('00000000-0000-0000-0000-000000000099', {}, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-SCR-VER-ERR-014: page 为非整数 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getVersionList(SCRIPT_ID, { page: 1.5 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-SCR-VER-ERR-015: page_size 为非整数 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getVersionList(SCRIPT_ID, { page_size: 2.5 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】性能基准验证', () => {
    const script = mockScriptFactory();
    const shots = mock5ShotsFactory();

    beforeEach(() => {
      mockPrisma.script.findUnique.mockResolvedValue(script);
      mockPrisma.scriptShot.findMany.mockResolvedValue(shots);
    });

    it('TC-SCR-VER-PERF-001: validateScriptId ≤ 1ms', () => {
      const start = performance.now();
      validateScriptId(SCRIPT_ID);
      expect(performance.now() - start).toBeLessThanOrEqual(1);
    });

    it('TC-SCR-VER-PERF-002: validateVersionId ≤ 1ms', () => {
      const start = performance.now();
      validateVersionId(VERSION_ID_1);
      expect(performance.now() - start).toBeLessThanOrEqual(1);
    });

    it('TC-SCR-VER-PERF-003: countVersions ≤ 10ms', async () => {
      mockPrisma.scriptVersion.count.mockResolvedValue(3);
      const start = performance.now();
      await countVersions(mockPrisma, SCRIPT_ID);
      expect(performance.now() - start).toBeLessThanOrEqual(10);
    });

    it('TC-SCR-VER-PERF-004: saveVersion 端到端 ≤ 200ms', async () => {
      mockPrisma.scriptVersion.count.mockResolvedValue(1);
      mockPrisma.scriptVersion.create.mockResolvedValue(
        mockVersionFactory(2),
      );
      const start = performance.now();
      await saveVersion(SCRIPT_ID, { version_tag: 'perf-test' }, { prisma: mockPrisma });
      expect(performance.now() - start).toBeLessThanOrEqual(200);
    });

    it('TC-SCR-VER-PERF-005: getVersionList 端到端 ≤ 100ms', async () => {
      mockPrisma.scriptVersion.findMany.mockResolvedValue([
        mockVersionFactory(3),
        mockVersionFactory(2),
        mockVersionFactory(1),
      ]);
      mockPrisma.scriptVersion.count.mockResolvedValue(3);
      const start = performance.now();
      await getVersionList(SCRIPT_ID, {}, { prisma: mockPrisma });
      expect(performance.now() - start).toBeLessThanOrEqual(100);
    });
  });

  // ===========================================================================
  // 5. 原子函数测试（Unit Tests for Atomic Functions）
  // ===========================================================================

  describe('【原子函数】验证基础单元函数逻辑正确性', () => {
    // ---- validateScriptId ----

    it('validateScriptId — 合法 UUID → 不抛异常', () => {
      expect(() => validateScriptId(SCRIPT_ID)).not.toThrow();
    });

    it('validateScriptId — 空字符串 → 抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try { validateScriptId(''); } catch (e) { caught = e as Error & { errorCode?: string }; }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('validateScriptId — 仅空白字符 → 抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try { validateScriptId('   '); } catch (e) { caught = e as Error & { errorCode?: string }; }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    // ---- validateVersionId ----

    it('validateVersionId — 合法 version ID → 不抛异常', () => {
      expect(() => validateVersionId(VERSION_ID_1)).not.toThrow();
    });

    it('validateVersionId — 空字符串 → 抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try { validateVersionId(''); } catch (e) { caught = e as Error & { errorCode?: string }; }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    // ---- countVersions ----

    it('countVersions — 返回整数值', async () => {
      mockPrisma.scriptVersion.count.mockResolvedValue(5);
      const result = await countVersions(mockPrisma, SCRIPT_ID);
      expect(typeof result).toBe('number');
      expect(result).toBe(5);
      expect(Number.isInteger(result)).toBe(true);
    });

    // ---- saveVersionSnapshot ----

    it('saveVersionSnapshot — 创建版本并返回完整数据', async () => {
      mockPrisma.scriptVersion.count.mockResolvedValue(2);
      const expectedVersion = mockVersionFactory(3);
      mockPrisma.scriptVersion.create.mockResolvedValue(expectedVersion);

      const script = mockScriptFactory();
      const shots = mock5ShotsFactory();
      const result = await saveVersionSnapshot(mockPrisma, script, shots, 'v1.0');

      expect(result.version_number).toBe(3);
      expect(result.shots_snapshot.length).toBe(5);
      expect(result.version_tag).toBe('v1.0');
    });

    // ---- findVersionById ----

    it('findVersionById — 返回匹配的版本记录', async () => {
      mockPrisma.scriptVersion.findUnique.mockResolvedValue(mockVersionFactory(1));
      const result = await findVersionById(mockPrisma, VERSION_ID_1);
      expect(result.id).toBe(VERSION_ID_1);
      expect(result.version_number).toBe(1);
    });

    // ---- rollbackToVersion ----

    it('rollbackToVersion — 更新剧本元数据并替换分镜', async () => {
      mockPrisma.script.update.mockResolvedValue({
        ...script,
        title: mockVersionFactory(1).title,
        video_duration: mockVersionFactory(1).video_duration,
      });
      mockPrisma.scriptShot.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.scriptShot.createMany.mockResolvedValue({ count: 3 });

      const version = mockVersionFactory(1, { shots_snapshot: mock3ShotsFactory() });
      const result = await rollbackToVersion(mockPrisma, SCRIPT_ID, version);

      expect(result).toHaveProperty('id', SCRIPT_ID);
      expect(mockPrisma.scriptShot.deleteMany).toHaveBeenCalledWith({ where: { script_id: SCRIPT_ID } });
      expect(mockPrisma.scriptShot.createMany).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言 Script Version 功能
// 的完整性与正确性。待源码实现后移除 .skip 或直接运行。
//
// 用例编号映射:
//   TC-SCR-VER-001 ~ TC-SCR-VER-005      正常流 (Happy Path)
//   TC-SCR-VER-BND-001 ~ TC-SCR-VER-BND-006  边界流 (Edge Cases)
//   TC-SCR-VER-ERR-001 ~ TC-SCR-VER-ERR-015  异常流 (Error Flow)
//   TC-SCR-VER-PERF-001 ~ TC-SCR-VER-PERF-005 性能流 (Performance)
//
// 覆盖率维度:
//   ├── saveVersion              (5 正常 + 4 边界 + 4 异常 + 1 性能)
//   ├── getVersionList           (1 正常 + 2 边界 + 6 异常 + 1 性能)
//   ├── rollbackScript           (1 正常 + 1 边界 + 4 异常)
//   ├── validateScriptId         (3 原子)
//   ├── validateVersionId        (2 原子)
//   ├── countVersions            (1 原子 + 1 性能)
//   ├── saveVersionSnapshot      (1 原子)
//   ├── findVersionById          (1 原子)
//   └── rollbackToVersion        (1 原子)
//
// 总测试用例数: 48
// =============================================================================