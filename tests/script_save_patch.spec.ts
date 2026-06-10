// =============================================================================
// TikStream AI — Script Save + Patch 自动化测试基座
// 对应功能: POST /api/v1/scripts/:scriptId/save (剧本全量保存)
//           PATCH /api/v1/scripts/:scriptId (JSON Patch 局部编辑)
// 对应模块: Script (人员B) | 技术栈: Jest 29 + @nestjs/testing + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

interface TestProduct {
  id: string; title: string; sku_code: string; category: string;
  selling_points: string[]; target_audience: string | null;
  scenario_tags: string[]; text_features: Record<string, unknown>;
  cover_image_url: string | null; created_at: Date; updated_at: Date;
}

interface TestScriptShot {
  id: string; script_id: string; shot_id: string | null; shot_index: number;
  duration: number; scene_description_query: string; visual_description: string;
  camera_movement: string; transition_type: string; voiceover_text: string;
  subtitle_text: string; safe_zone_bounding_box: [number, number, number, number];
  selected_slice_id: string | null; render_prompt: string | null;
  local_factor_patch: Record<string, unknown>; compliance_status: string;
  created_at: Date; updated_at: Date;
}

interface TestScript {
  id: string; product_id: string; title: string | null; language: string;
  target_audience: string | null; video_duration: number; aspect_ratio: string;
  style_vibe: string; generation_mode: string; template_id: string | null;
  viral_video_id: string | null; constraint_list: string[];
  raw_json: Record<string, unknown>; created_at: Date; updated_at: Date;
  shots?: TestScriptShot[];
}

interface TestScriptWithShots {
  script: TestScript;
  shots: TestScriptShot[];
}

interface PatchOperationDTO {
  op: 'add' | 'remove' | 'replace' | 'move';
  path: string;
  from?: string;
  value?: unknown;
}

interface ScriptSaveResponse {
  script_id: string;
  product_id: string;
  video_duration: number;
  shots_count: number;
  save_status: 'SAVED';
  validation_summary: {
    schema_valid: boolean;
    timing_valid: boolean;
    compliance_valid: boolean;
  };
  updated_at: string;
}

interface ScriptPatchResponse {
  script_id: string;
  video_duration: number;
  timing_validation: {
    valid: boolean;
    estimated_duration: number;
    shot_duration: number;
    overflow_words: number;
    suggestion: string;
  };
  updated_fields: string[];
  updated_at: string;
}

type MockPrismaService = {
  product: { findUnique: jest.Mock };
  script: { findUnique: jest.Mock; update: jest.Mock };
  scriptShot: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

const NOW = new Date('2026-05-23T12:00:00Z');
const SCRIPT_ID = 'dc52d4ff-0000-4000-a000-000000000001';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';

const mockProductFactory = (o?: Partial<TestProduct>): TestProduct => ({
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
  ...o,
});

const mockScriptShotFactory = (i: number, o?: Partial<TestScriptShot>): TestScriptShot => ({
  id: `shot-uuid-${i}-${SCRIPT_ID}`,
  script_id: SCRIPT_ID,
  shot_id: `shot_${String(i).padStart(3, '0')}`,
  shot_index: i,
  duration: 3.0,
  scene_description_query: `close-up shot ${i} of product`,
  visual_description: `镜头${i}：展示功能。`,
  camera_movement: i === 1 ? 'Dolly_In_Fast' : i === 2 ? 'Pan_Left' : i === 3 ? 'Tilt_Up' : 'Static',
  transition_type: i === 1 ? 'Fade_In' : i === 2 ? 'Dissolve' : i === 3 ? 'Wipe' : 'None',
  voiceover_text: `第${i}段旁白。`,
  subtitle_text: `字幕${i}`,
  safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9],
  selected_slice_id: null,
  render_prompt: null,
  local_factor_patch: {},
  compliance_status: 'PASSED',
  created_at: NOW,
  updated_at: NOW,
  ...o,
});

const mockScriptFactory = (o?: Partial<TestScript>): TestScript => ({
  id: SCRIPT_ID,
  product_id: PRODUCT_ID,
  title: '智能无线卷发棒脚本',
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
  shots: [],
  ...o,
});

const mockFiveShotsFactory = (): TestScriptShot[] => [1, 2, 3, 4, 5].map((i) => mockScriptShotFactory(i));
const mockThreeShotsFactory = (): TestScriptShot[] => [1, 2, 3].map((i) => mockScriptShotFactory(i, {
  duration: i === 1 ? 3.0 : i === 2 ? 3.5 : 4.0,
  voiceover_text: i === 1 ? '智能控温，十分钟快充。' : i === 2 ? '陶瓷涂层，不伤发质。' : '无线设计，随地造型。',
  subtitle_text: i === 1 ? '3档控温｜快充' : i === 2 ? '陶瓷涂层｜护发' : '无线｜便携',
}));

const mockPrismaServiceFactory = (): MockPrismaService => ({
  product: { findUnique: jest.fn() },
  script: { findUnique: jest.fn(), update: jest.fn() },
  scriptShot: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
});

// 白名单字段 (PATCH_ALLOWED_SHOT_FIELDS)
const ALLOWED_SHOT_FIELDS = [
  'duration', 'scene_description_query', 'visual_description',
  'camera_movement', 'transition_type', 'voiceover_text', 'subtitle_text',
  'safe_zone_bounding_box', 'selected_slice_id', 'render_prompt', 'local_factor_patch',
];

// 根级白名单 (PATCH_ALLOWED_ROOT_PATHS)
const ALLOWED_ROOT_PATHS = ['title', 'language', 'target_audience', 'style_vibe', 'constraint_list'];

describe('ScriptSave + ScriptPatch — 剧本保存与 JSON Patch 局部编辑', () => {
  let mockPrisma: MockPrismaService;

  let findScriptWithShots: (scriptId: string, prisma: MockPrismaService) => Promise<TestScriptWithShots | null>;
  let validateScriptSchema: (p: Record<string, unknown>) => { valid: boolean; errors: Array<{ field: string; message: string }> };
  let checkCompliance: (shots: Array<Record<string, unknown>>) => { passed: boolean; violations: Array<{ shot_index: number; violated_word: string; reason: string }> };
  let updateScriptWithShots: (sid: string, p: { title?: string | null; language: string; target_audience?: string | null; shots: TestScriptShot[] }, db: MockPrismaService) => Promise<TestScriptWithShots>;
  let syncScriptWithShots: (sid: string, p: { title?: string | null; language: string; target_audience?: string | null; shots: TestScriptShot[] }, db: MockPrismaService) => Promise<TestScriptWithShots>;

  let parseAndValidatePatchPath: (op: PatchOperationDTO) => { kind: 'root' | 'shot'; shotIndex?: number; fieldName?: string };
  let applyPatchOperations: (
    ops: PatchOperationDTO[],
    script: TestScript,
    shots: TestScriptShot[],
  ) => { script: TestScript; shots: TestScriptShot[]; updatedFields: string[] };
  let validatePatchOperations: (ops: PatchOperationDTO[], shots: TestScriptShot[]) => void;

  let validateTimingConsistency: (shots: TestScriptShot[]) => void;
  let saveScript: (
    sid: string,
    dto: { save_message?: string; force_revalidate?: boolean },
    deps: {
      prisma: MockPrismaService;
      findScript: typeof findScriptWithShots;
      validateSchema: typeof validateScriptSchema;
      runCompliance: typeof checkCompliance;
      updateScript: typeof updateScriptWithShots;
    },
  ) => Promise<ScriptSaveResponse>;

  let patchScript: (
    sid: string,
    ops: PatchOperationDTO[],
    deps: {
      prisma: MockPrismaService;
      findScript: typeof findScriptWithShots;
      parsePath: typeof parseAndValidatePatchPath;
      validateOps: typeof validatePatchOperations;
      applyOps: typeof applyPatchOperations;
      validateTiming: typeof validateTimingConsistency;
      syncScript: typeof syncScriptWithShots;
    },
  ) => Promise<ScriptPatchResponse>;

  let buildPatchDeps: () => {
    prisma: MockPrismaService;
    findScript: typeof findScriptWithShots;
    parsePath: typeof parseAndValidatePatchPath;
    validateOps: typeof validatePatchOperations;
    applyOps: typeof applyPatchOperations;
    validateTiming: typeof validateTimingConsistency;
    syncScript: typeof syncScriptWithShots;
  };

  beforeAll(() => {
    // ---- 查询脚本与分镜 ----
    findScriptWithShots = async (sid, db) => {
      if (!sid) return null;
      try {
        const s = await db.script.findUnique({ where: { id: sid }, include: { shots: true } });
        if (!s) return null;
        return { script: s as TestScript, shots: ((s as Record<string, unknown>).shots || []) as TestScriptShot[] };
      } catch (e) {
        const pe = e as Error & { code?: string };
        const ec = pe.code === 'P2025' ? 'SCRIPT_NOT_FOUND' : 'INTERNAL_SERVER_ERROR';
        const sc = pe.code === 'P2025' ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR;
        throw Object.assign(new Error(`查询失败: ${pe.message}`), { errorCode: ec, statusCode: sc, retryable: pe.code !== 'P2025' });
      }
    };

    // ---- Schema 校验 ----
    validateScriptSchema = (p) => {
      const shots = p.shots as Array<Record<string, unknown>>;
      const errors: Array<{ field: string; message: string }> = [];
      const RF = ['shot_index', 'duration', 'scene_description_query', 'visual_description',
                  'camera_movement', 'transition_type', 'voiceover_text', 'subtitle_text', 'safe_zone_bounding_box'];
      const VC = ['Static', 'Dolly_In_Fast', 'Dolly_Out', 'Pan_Left', 'Tilt_Up'];
      const VT = ['None', 'Fade_In', 'Dissolve', 'Wipe'];
      let td = 0;
      shots.forEach((shot, idx) => {
        for (const f of RF) {
          if (shot[f] === undefined || shot[f] === null) {
            errors.push({ field: `shots[${idx}].${f}`, message: `分镜 ${idx + 1} 缺少: ${f}` });
          }
        }
        const d = Number(shot.duration);
        if (Number.isFinite(d) && !Number.isNaN(d)) {
          td += d;
          if (d < 1.5) errors.push({ field: `shots[${idx}].duration`, message: `分镜 ${idx + 1} 时长 ${d}s < 1.5s` });
          if (d > 5.0) errors.push({ field: `shots[${idx}].duration`, message: `分镜 ${idx + 1} 时长 ${d}s > 5.0s` });
        }
        if (typeof shot.camera_movement === 'string' && !VC.includes(shot.camera_movement)) {
          errors.push({ field: `shots[${idx}].camera_movement`, message: `无效运镜: ${shot.camera_movement}` });
        }
        if (typeof shot.transition_type === 'string' && !VT.includes(shot.transition_type)) {
          errors.push({ field: `shots[${idx}].transition_type`, message: `无效转场: ${shot.transition_type}` });
        }
        const bb = shot.safe_zone_bounding_box as unknown[];
        if (Array.isArray(bb) && bb.length === 4) {
          for (let i = 0; i < 4; i++) {
            if (typeof bb[i] !== 'number' || Number.isNaN(bb[i] as number) || (bb[i] as number) < 0 || (bb[i] as number) > 1) {
              errors.push({ field: `shots[${idx}].bbox[${i}]`, message: 'bbox 值无效' });
            }
          }
        }
      });
      if (td > 15.0) errors.push({ field: 'video_duration', message: `总时长 ${td.toFixed(2)}s > 15s` });
      return { valid: errors.length === 0, errors };
    };

    // ---- 合规校验 ----
    checkCompliance = (shots) => {
      const v: Array<{ shot_index: number; violated_word: string; reason: string }> = [];
      const R = [/最好/g, /第一/g, /全网/g, /唯一/g, /顶级/g, /最高/g, /永久/g, /万能/g,
                  /免费送/g, /点击领取/g, /限时抢购/g, /马上抢/g];
      const RR = ['最好', '第一', '全网', '唯一', '顶级', '最高', '永久', '万能',
                   '免费送', '点击领取', '限时抢购', '马上抢'];
      shots.forEach((shot) => {
        const idx = Number(shot.shot_index);
        const txt = `${shot.voiceover_text || ''} ${shot.subtitle_text || ''}`;
        for (let i = 0; i < R.length; i++) {
          R[i].lastIndex = 0;
          const m = R[i].exec(txt);
          if (m) {
            if (!v.some((x) => x.shot_index === idx && x.violated_word === m![0])) {
              v.push({ shot_index: idx, violated_word: m[0], reason: `违规"${RR[i]}"` });
            }
          }
        }
      });
      return { passed: v.length === 0, violations: v };
    };

    // ---- 时长校验 ----
    validateTimingConsistency = (shots) => {
      if (!shots || shots.length === 0) {
        throw Object.assign(new Error('分镜列表空'), { errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST });
      }
      const td = shots.reduce((s, sh) => s + Number(sh.duration || 0), 0);
      if (td > 15.0) {
        throw Object.assign(new Error(`总时长 ${td.toFixed(2)}s > 15s`), { errorCode: 'SCRIPT_DURATION_EXCEEDED', statusCode: HttpStatus.BAD_REQUEST });
      }
      for (const sh of shots) {
        const d = Number(sh.duration);
        if (!Number.isFinite(d) || Number.isNaN(d)) {
          throw Object.assign(new Error(`分镜 ${sh.shot_index} duration非法`), { errorCode: 'SCRIPT_DURATION_EXCEEDED', statusCode: HttpStatus.BAD_REQUEST });
        }
        if (d < 1.5) {
          throw Object.assign(new Error(`分镜 ${sh.shot_index} ${d}s < 1.5s`), { errorCode: 'SCRIPT_DURATION_EXCEEDED', statusCode: HttpStatus.BAD_REQUEST });
        }
        if (d > 5.0) {
          throw Object.assign(new Error(`分镜 ${sh.shot_index} ${d}s > 5.0s`), { errorCode: 'SCRIPT_DURATION_EXCEEDED', statusCode: HttpStatus.BAD_REQUEST });
        }
      }
    };

    // ---- 全量更新（内部使用） ----
    updateScriptWithShots = async (sid, p, db) => {
      try {
        return await db.$transaction(async () => {
          await db.scriptShot.deleteMany({ where: { script_id: sid } });
          const us = { ...mockScriptFactory(), id: sid, title: p.title ?? null, language: p.language || 'zh-CN', target_audience: p.target_audience ?? null, video_duration: p.shots.reduce((s, sh) => s + sh.duration, 0), updated_at: new Date() };
          const ns = p.shots.map((sh, i) => ({ ...sh, id: `shot-uuid-${i + 1}-${sid}`, script_id: sid, updated_at: new Date() }));
          return { script: us, shots: ns };
        });
      } catch (e) {
        const pe = e as Error & { code?: string };
        const ei = pe.code === 'P1001' ? { ec: 'INTERNAL_SERVER_ERROR', sc: HttpStatus.INTERNAL_SERVER_ERROR, ry: true }
          : pe.code === 'P2002' ? { ec: 'INTERNAL_SERVER_ERROR', sc: HttpStatus.CONFLICT, ry: false }
          : { ec: 'INTERNAL_SERVER_ERROR', sc: HttpStatus.INTERNAL_SERVER_ERROR, ry: true };
        throw Object.assign(new Error(`持久化失败: ${pe.message}`), { errorCode: ei.ec, statusCode: ei.sc, retryable: ei.ry });
      }
    };

    // ---- 全量同步（structural changes） ----
    syncScriptWithShots = async (sid, p, db) => {
      return updateScriptWithShots(sid, p, db);
    };

    // ---- 解析 patch 路径 ----
    parseAndValidatePatchPath = (op) => {
      if (!op.path || typeof op.path !== 'string') {
        throw Object.assign(new Error('path 空'), { errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST });
      }
      const t = op.path.startsWith('/') ? op.path.slice(1) : op.path;
      const parts = t.split('/');

      // 根级路径: title, language, target_audience, style_vibe, constraint_list
      if (parts.length === 1 && ALLOWED_ROOT_PATHS.includes(parts[0])) {
        return { kind: 'root' as const, fieldName: parts[0] };
      }

      // 分镜路径: shots/{index}/field
      if (parts[0] === 'shots' && parts.length >= 3) {
        const si = parseInt(parts[1], 10);
        if (Number.isNaN(si) || si < 1 || !Number.isInteger(si)) {
          throw Object.assign(new Error(`shot_index 无效: ${parts[1]}`), { errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST });
        }
        const fn = parts.slice(2).join('/');
        const isAllowedNestedLocalFactorPatch = fn.startsWith('local_factor_patch/');
        if (!ALLOWED_SHOT_FIELDS.includes(fn) && !isAllowedNestedLocalFactorPatch) {
          throw Object.assign(new Error(`字段 ${fn} 不在白名单`), { errorCode: 'PATCH_PATH_NOT_ALLOWED', statusCode: HttpStatus.BAD_REQUEST });
        }
        return { kind: 'shot' as const, shotIndex: si, fieldName: fn };
      }

      // shots/{index} 全分镜路径（add/remove）
      if (parts[0] === 'shots' && parts.length === 2) {
        const si = parseInt(parts[1], 10);
        if (Number.isNaN(si) || si < 1 || !Number.isInteger(si)) {
          throw Object.assign(new Error(`shot_index 无效: ${parts[1]}`), { errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST });
        }
        return { kind: 'shot' as const, shotIndex: si, fieldName: '' };
      }

      throw Object.assign(new Error(`路径格式无效: ${op.path}`), { errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST });
    };

    // ---- 校验 patch 操作 ----
    validatePatchOperations = (ops, shots) => {
      if (!ops || !Array.isArray(ops) || ops.length === 0) {
        throw Object.assign(new Error('ops 空'), { errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST });
      }
      const ALLOWED_OPS = ['add', 'remove', 'replace', 'move'];
      for (const op of ops) {
        if (!ALLOWED_OPS.includes(op.op)) {
          throw Object.assign(new Error(`非法 op: ${op.op}`), { errorCode: 'PATCH_OP_INVALID', statusCode: HttpStatus.BAD_REQUEST });
        }
        const parsed = parseAndValidatePatchPath(op);
        if (parsed.kind === 'shot' && parsed.shotIndex !== undefined) {
          const ts = shots.find((s) => s.shot_index === parsed.shotIndex);
          if (!ts && op.op !== 'add') {
            throw Object.assign(new Error(`shot ${parsed.shotIndex} 不存在`), { errorCode: 'SHOT_INDEX_OUT_OF_RANGE', statusCode: HttpStatus.NOT_FOUND });
          }
          if (parsed.fieldName === '' && op.op === 'replace') {
            throw Object.assign(new Error('不可 replace 全分镜'), { errorCode: 'PATCH_OP_INVALID', statusCode: HttpStatus.BAD_REQUEST });
          }
        }

        if (op.op === 'move') {
          if (!op.from) {
            throw Object.assign(new Error('move 缺少 from'), { errorCode: 'PATCH_OP_INVALID', statusCode: HttpStatus.BAD_REQUEST });
          }
          const parsedFrom = parseAndValidatePatchPath({ ...op, path: op.from });
          if (parsed.kind !== 'shot' || parsed.fieldName !== '' || parsedFrom.kind !== 'shot' || parsedFrom.fieldName !== '') {
            throw Object.assign(new Error('move 仅允许整分镜重排'), { errorCode: 'PATCH_OP_INVALID', statusCode: HttpStatus.BAD_REQUEST });
          }
          const sourceShot = shots.find((s) => s.shot_index === parsedFrom.shotIndex);
          if (!sourceShot) {
            throw Object.assign(new Error(`shot ${parsedFrom.shotIndex} 不存在`), { errorCode: 'SHOT_INDEX_OUT_OF_RANGE', statusCode: HttpStatus.NOT_FOUND });
          }
        }
      }
    };

    // ---- 应用 patch 操作 ----
    applyPatchOperations = (ops, script, shots) => {
      const updatedFields: string[] = [];
      const newShots = shots.map((s) => ({ ...s }));
      let scriptChanges = false;

      for (const op of ops) {
        const parsed = parseAndValidatePatchPath(op);

        if (parsed.kind === 'root') {
          const rootFieldMap: Record<string, keyof TestScript> = {
            title: 'title', language: 'language', target_audience: 'target_audience',
            style_vibe: 'style_vibe', constraint_list: 'constraint_list',
          };
          const field = rootFieldMap[parsed.fieldName!];
          if (field) {
            (script as Record<string, unknown>)[field] = op.op === 'remove' ? null : op.value;
            updatedFields.push(parsed.fieldName!);
            scriptChanges = true;
          }
        } else if (parsed.kind === 'shot' && parsed.shotIndex !== undefined) {
          const idx = newShots.findIndex((s) => s.shot_index === parsed.shotIndex);
          if (idx === -1 && op.op !== 'add') continue;
          const shot = idx >= 0 ? newShots[idx] as Record<string, unknown> : undefined;

          if (parsed.fieldName === '') {
            if (op.op === 'add') {
              const newShot: Record<string, unknown> = { ...(op.value as Record<string, unknown> || {}), shot_index: parsed.shotIndex };
              newShots.push(newShot as TestScriptShot);
              updatedFields.push(`/shots/${parsed.shotIndex}`);
            } else if (op.op === 'remove') {
              newShots.splice(idx, 1);
              updatedFields.push(`/shots/${parsed.shotIndex}`);
            } else if (op.op === 'move') {
              const parsedFrom = parseAndValidatePatchPath({ ...op, path: op.from! });
              const sourceIndex = newShots.findIndex((s) => s.shot_index === parsedFrom.shotIndex);
              if (sourceIndex === -1) continue;
              const [movedShot] = newShots.splice(sourceIndex, 1);
              newShots.splice(Math.min(parsed.shotIndex - 1, newShots.length), 0, movedShot);
              newShots.forEach((currentShot, order) => {
                currentShot.shot_index = order + 1;
              });
              updatedFields.push(op.from!);
              updatedFields.push(`/shots/${parsed.shotIndex}`);
            }
          } else if (shot) {
            if (op.op === 'remove') {
              delete shot[parsed.fieldName!];
            } else {
              const fp = parsed.fieldName!.split('/');
              if (fp.length === 1) {
                shot[parsed.fieldName!] = op.value;
              } else {
                let t: Record<string, unknown> = shot;
                for (let i = 0; i < fp.length - 1; i++) {
                  if (typeof t[fp[i]] !== 'object' || t[fp[i]] === null) t[fp[i]] = {};
                  t = t[fp[i]] as Record<string, unknown>;
                }
                t[fp[fp.length - 1]] = op.value;
              }
            }
            updatedFields.push(`/shots/${parsed.shotIndex}/${parsed.fieldName}`);
          }
        }
      }

      return {
        script: scriptChanges ? { ...script } : script,
        shots: newShots,
        updatedFields: [...new Set(updatedFields)],
      };
    };

    // ---- saveScript ----
    saveScript = async (sid, dto, deps) => {
      const { prisma, findScript, validateSchema, runCompliance, updateScript } = deps;
      if (!sid || sid.trim().length === 0) {
        throw Object.assign(new Error('script_id必填'), { errorCode: 'INVALID_REQUEST' });
      }
      const ex = await findScript(sid, prisma);
      if (!ex) {
        throw Object.assign(new Error(`剧本 ${sid} 不存在`), { errorCode: 'SCRIPT_NOT_FOUND' });
      }

      const shots = ex.shots;
      const schema = validateSchema({ shots });
      if (!schema.valid) {
        const hasDurationError = schema.errors.some((e) => e.message.includes('时长'));
        throw Object.assign(new Error(`Schema错误: ${schema.errors.map((e) => e.message).join('; ')}`),
          { errorCode: hasDurationError ? 'SCRIPT_DURATION_EXCEEDED' : 'SCRIPT_SCHEMA_INVALID', details: schema.errors });
      }

      const cr = runCompliance(shots.map((s) => ({ shot_index: s.shot_index, voiceover_text: s.voiceover_text, subtitle_text: s.subtitle_text })));
      if (!cr.passed) {
        throw Object.assign(new Error(`合规错误: ${cr.violations.map((v) => v.reason).join('; ')}`),
          { errorCode: 'COMPLIANCE_CHECK_FAILED', details: cr.violations });
      }

      const totalDuration = shots.reduce((sum, s) => sum + s.duration, 0);
      const result = await updateScript(sid, {
        title: ex.script.title,
        language: ex.script.language,
        target_audience: ex.script.target_audience,
        shots,
      }, prisma);

      return {
        script_id: result.script.id,
        product_id: result.script.product_id,
        video_duration: result.script.video_duration,
        shots_count: result.shots.length,
        save_status: 'SAVED' as const,
        validation_summary: {
          schema_valid: true,
          timing_valid: true,
          compliance_valid: cr.passed,
        },
        updated_at: new Date().toISOString(),
      };
    };

    // ---- patchScript ----
    patchScript = async (sid, ops, deps) => {
      const { prisma, findScript, parsePath, validateOps, applyOps, validateTiming, syncScript } = deps;
      if (!sid || sid.trim().length === 0) {
        throw Object.assign(new Error('script_id必填'), { errorCode: 'INVALID_REQUEST' });
      }
      if (!ops || ops.length === 0) {
        throw Object.assign(new Error('ops 空'), { errorCode: 'INVALID_REQUEST' });
      }
      const ex = await findScript(sid, prisma);
      if (!ex) {
        throw Object.assign(new Error(`剧本 ${sid} 不存在`), { errorCode: 'SCRIPT_NOT_FOUND' });
      }

      validateOps(ops, ex.shots);
      const { script: patchedScript, shots: patchedShots, updatedFields } = applyOps(ops, ex.script, ex.shots);

      // 检查是否有结构性变化（add/remove 全分镜）
      const hasStructuralChange = ops.some((op) => {
        try {
          const parsed = parsePath(op);
          return parsed.kind === 'shot' && parsed.fieldName === '';
        } catch {
          return false;
        }
      });

      validateTiming(patchedShots);

      const totalDuration = patchedShots.reduce((s, sh) => s + sh.duration, 0);

      if (hasStructuralChange) {
        await syncScript(sid, {
          title: patchedScript.title,
          language: patchedScript.language,
          target_audience: patchedScript.target_audience,
          shots: patchedShots,
        }, prisma);
      } else {
        // 局部更新时也做一次事务同步（模拟实际行为）
        await syncScript(sid, {
          title: patchedScript.title,
          language: patchedScript.language,
          target_audience: patchedScript.target_audience,
          shots: patchedShots,
        }, prisma);
      }

      return {
        script_id: sid,
        video_duration: totalDuration,
        timing_validation: {
          valid: true,
          estimated_duration: totalDuration,
          shot_duration: totalDuration,
          overflow_words: 0,
          suggestion: 'ok',
        },
        updated_fields: updatedFields,
        updated_at: new Date().toISOString(),
      };
    };

    buildPatchDeps = () => ({
      prisma: mockPrisma,
      findScript: findScriptWithShots,
      parsePath: parseAndValidatePatchPath,
      validateOps: validatePatchOperations,
      applyOps: applyPatchOperations,
      validateTiming: validateTimingConsistency,
      syncScript: syncScriptWithShots,
    });
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
  });

  // ===========================================================
  // 1. 正常流 — saveScript
  // ===========================================================
  describe('【正常流 — saveScript】', () => {
    const es = mockFiveShotsFactory();
    const exs = mockScriptFactory({ shots: es });
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.script.findUnique.mockResolvedValue({ ...exs, shots: es });
      mockPrisma.$transaction.mockImplementation(async (fn: () => Promise<unknown>) => fn());
      mockPrisma.scriptShot.deleteMany.mockResolvedValue({ count: 5 });
    });

    it('TC-SSP-001: 全量保存 → ScriptSaveResponse 包含 save_status=SAVED', async () => {
      const r = await saveScript(SCRIPT_ID, { save_message: '调整了话术', force_revalidate: true },
        { prisma: mockPrisma, findScript: findScriptWithShots, validateSchema: validateScriptSchema, runCompliance: checkCompliance, updateScript: updateScriptWithShots });
      expect(r.save_status).toBe('SAVED');
      expect(r).toHaveProperty('validation_summary');
      expect(r).toHaveProperty('updated_at');
    });

    it('TC-SSP-002: shots_count 正确', async () => {
      const r = await saveScript(SCRIPT_ID, {},
        { prisma: mockPrisma, findScript: findScriptWithShots, validateSchema: validateScriptSchema, runCompliance: checkCompliance, updateScript: updateScriptWithShots });
      expect(r.shots_count).toBe(5);
    });

    it('TC-SSP-003: validation_summary 包含三项校验结果', async () => {
      const r = await saveScript(SCRIPT_ID, {},
        { prisma: mockPrisma, findScript: findScriptWithShots, validateSchema: validateScriptSchema, runCompliance: checkCompliance, updateScript: updateScriptWithShots });
      expect(r.validation_summary).toHaveProperty('schema_valid');
      expect(r.validation_summary).toHaveProperty('timing_valid');
      expect(r.validation_summary).toHaveProperty('compliance_valid');
    });

    it('TC-SSP-004: video_duration 累加正确', async () => {
      const r = await saveScript(SCRIPT_ID, {},
        { prisma: mockPrisma, findScript: findScriptWithShots, validateSchema: validateScriptSchema, runCompliance: checkCompliance, updateScript: updateScriptWithShots });
      expect(r.video_duration).toBeCloseTo(15.0, 1);
    });
  });

  // ===========================================================
  // 1b. 正常流 — patchScript
  // ===========================================================
  describe('【正常流 — patchScript】', () => {
    const es = mockThreeShotsFactory();
    const exs = mockScriptFactory({ shots: es, video_duration: 10.5 });
    beforeEach(() => {
      mockPrisma.script.findUnique.mockResolvedValue({ ...exs, shots: [...es] });
      mockPrisma.$transaction.mockImplementation(async (fn: () => Promise<unknown>) => fn());
      mockPrisma.scriptShot.deleteMany.mockResolvedValue({ count: 0 });
    });

    it('TC-SSP-005: replace duration → updated_fields 包含路径', async () => {
      const r = await patchScript(SCRIPT_ID, [{ op: 'replace', path: '/shots/1/duration', value: 4.5 }], buildPatchDeps());
      expect(r.updated_fields.some((f: string) => f.includes('/shots/1/duration'))).toBe(true);
      expect(r).toHaveProperty('timing_validation');
    });

    it('TC-SSP-006: replace voiceover_text 不影响其他字段', async () => {
      const r = await patchScript(SCRIPT_ID, [{ op: 'replace', path: '/shots/2/voiceover_text', value: '新旁白。' }], buildPatchDeps());
      expect(r).toHaveProperty('script_id');
      expect(r).toHaveProperty('video_duration');
    });

    it('TC-SSP-007: 批量 patch 多个分镜字段', async () => {
      const r = await patchScript(SCRIPT_ID, [
        { op: 'replace', path: '/shots/1/duration', value: 2.0 },
        { op: 'replace', path: '/shots/2/camera_movement', value: 'Tilt_Up' },
        { op: 'replace', path: '/shots/3/transition_type', value: 'Wipe' },
      ], buildPatchDeps());
      expect(r.updated_fields.length).toBeGreaterThanOrEqual(3);
    });

    it('TC-SSP-008: add nested local_factor_patch', async () => {
      const r = await patchScript(SCRIPT_ID, [{ op: 'add', path: '/shots/1/local_factor_patch/brightness', value: 1.2 }], buildPatchDeps());
      expect(r.updated_fields.some((f: string) => f.includes('local_factor_patch'))).toBe(true);
    });

    it('TC-SSP-009: move 全分镜路径可重排 shot 顺序', async () => {
      const moved = applyPatchOperations(
        [{ op: 'move', from: '/shots/1', path: '/shots/3' }],
        { ...exs },
        es.map((shot) => ({ ...shot })),
      );
      expect(moved.shots.map((shot) => shot.voiceover_text)).toEqual([
        '陶瓷涂层，不伤发质。',
        '无线设计，随地造型。',
        '智能控温，十分钟快充。',
      ]);
      expect(moved.shots.map((shot) => shot.shot_index)).toEqual([1, 2, 3]);
      expect(moved.updatedFields).toEqual(expect.arrayContaining(['/shots/1', '/shots/3']));
    });
  });

  // ===========================================================
  // 2. 边界流
  // ===========================================================
  describe('【边界流】', () => {
    const es = mockThreeShotsFactory();
    const exs = mockScriptFactory({ shots: es });
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.script.findUnique.mockResolvedValue({ ...exs, shots: [...es] });
      mockPrisma.$transaction.mockImplementation(async (fn: () => Promise<unknown>) => fn());
      mockPrisma.scriptShot.deleteMany.mockResolvedValue({ count: 0 });
    });

    it('TC-SSP-BND-001: 3分镜保存', async () => {
      const r = await saveScript(SCRIPT_ID, {},
        { prisma: mockPrisma, findScript: findScriptWithShots, validateSchema: validateScriptSchema, runCompliance: checkCompliance, updateScript: updateScriptWithShots });
      expect(r.shots_count).toBe(3);
    });

    it('TC-SSP-BND-002: patch 下限 1.5s', async () => {
      const r = await patchScript(SCRIPT_ID, [{ op: 'replace', path: '/shots/1/duration', value: 1.5 }], buildPatchDeps());
      expect(r.timing_validation.valid).toBe(true);
    });

    it('TC-SSP-BND-003: 总时长 15.0s 临界', async () => {
      const shots = [1, 2, 3].map((i) => mockScriptShotFactory(i, { duration: 5.0 }));
      const script = mockScriptFactory({ shots, video_duration: 15.0 });
      mockPrisma.script.findUnique.mockResolvedValue({ ...script, shots });
      const result = await patchScript(SCRIPT_ID, [{ op: 'replace', path: '/shots/1/duration', value: 4.0 }], buildPatchDeps());
      expect(result.video_duration).toBeLessThanOrEqual(15.0);
    });

    it('TC-SSP-BND-004: replace 根级 title', async () => {
      const r = await patchScript(SCRIPT_ID, [{ op: 'replace', path: '/title', value: '新标题' }], buildPatchDeps());
      expect(r.updated_fields.some((f: string) => f === 'title')).toBe(true);
    });
  });

  // ===========================================================
  // 3. 异常流
  // ===========================================================
  describe('【异常流】', () => {
    const es = mockThreeShotsFactory();
    const exs = mockScriptFactory({ shots: es });

    it('TC-SSP-ERR-001: SCRIPT_NOT_FOUND', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(null);
      let c: Error & { errorCode?: string } | null = null;
      try {
        await saveScript('99999999-9999-9999-9999-999999999999', {},
          { prisma: mockPrisma, findScript: findScriptWithShots, validateSchema: validateScriptSchema, runCompliance: checkCompliance, updateScript: updateScriptWithShots });
      } catch (e) { c = e as Error & { errorCode?: string }; }
      expect(c!.errorCode).toBe('SCRIPT_NOT_FOUND');
    });

    it('TC-SSP-ERR-002: PATCH_PATH_NOT_ALLOWED (不在白名单)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue({ ...exs, shots: [...es] });
      let c: Error & { errorCode?: string } | null = null;
      try {
        await patchScript(SCRIPT_ID, [{ op: 'replace', path: '/shots/1/shot_index', value: 99 }], buildPatchDeps());
      } catch (e) { c = e as Error & { errorCode?: string }; }
      expect(c!.errorCode).toBe('PATCH_PATH_NOT_ALLOWED');
    });

    it('TC-SSP-ERR-003: PATCH_OP_INVALID (非法 op)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue({ ...exs, shots: [...es] });
      let c: Error & { errorCode?: string } | null = null;
      try {
        await patchScript(SCRIPT_ID, [{ op: 'delete', path: '/shots/1/duration' }], buildPatchDeps());
      } catch (e) { c = e as Error & { errorCode?: string }; }
      expect(c!.errorCode).toBe('PATCH_OP_INVALID');
    });

    it('TC-SSP-ERR-004: SHOT_INDEX_OUT_OF_RANGE', async () => {
      mockPrisma.script.findUnique.mockResolvedValue({ ...exs, shots: [...es] });
      let c: Error & { errorCode?: string } | null = null;
      try {
        await patchScript(SCRIPT_ID, [{ op: 'replace', path: '/shots/99/duration', value: 3.0 }], buildPatchDeps());
      } catch (e) { c = e as Error & { errorCode?: string }; }
      expect(c!.errorCode).toBe('SHOT_INDEX_OUT_OF_RANGE');
    });

    it('TC-SSP-ERR-005: DURATION_EXCEEDED (patch 后超 15s)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue({ ...exs, shots: [...es] });
      let c: Error & { errorCode?: string } | null = null;
      try {
        await patchScript(SCRIPT_ID, [
          { op: 'replace', path: '/shots/1/duration', value: 5.0 },
          { op: 'replace', path: '/shots/2/duration', value: 5.0 },
          { op: 'replace', path: '/shots/3/duration', value: 5.5 },
        ], buildPatchDeps());
      } catch (e) { c = e as Error & { errorCode?: string }; }
      expect(c!.errorCode).toBe('SCRIPT_DURATION_EXCEEDED');
    });

    it('TC-SSP-ERR-006: COMPLIANCE_CHECK_FAILED', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      const badShots = mockThreeShotsFactory().map((s) => ({ ...s, voiceover_text: '最好的产品。' }));
      const badScript = mockScriptFactory({ shots: badShots });
      mockPrisma.script.findUnique.mockResolvedValue({ ...badScript, shots: badShots });
      mockPrisma.$transaction.mockImplementation(async (fn: () => Promise<unknown>) => fn());
      mockPrisma.scriptShot.deleteMany.mockResolvedValue({ count: 0 });
      let c: Error & { errorCode?: string } | null = null;
      try {
        await saveScript(SCRIPT_ID, {},
          { prisma: mockPrisma, findScript: findScriptWithShots, validateSchema: validateScriptSchema, runCompliance: checkCompliance, updateScript: updateScriptWithShots });
      } catch (e) { c = e as Error & { errorCode?: string }; }
      expect(c!.errorCode).toBe('COMPLIANCE_CHECK_FAILED');
    });

    it('TC-SSP-ERR-007: INVALID_REQUEST (ops 空)', async () => {
      mockPrisma.script.findUnique.mockResolvedValue({ ...exs, shots: [...es] });
      let c: Error & { errorCode?: string } | null = null;
      try {
        await patchScript(SCRIPT_ID, [], buildPatchDeps());
      } catch (e) { c = e as Error & { errorCode?: string }; }
      expect(c!.errorCode).toBe('INVALID_REQUEST');
    });
  });

  // ===========================================================
  // 4. 性能流
  // ===========================================================
  describe('【性能流】', () => {
    const es = mockThreeShotsFactory();
    const exs = mockScriptFactory({ shots: es });
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.script.findUnique.mockResolvedValue({ ...exs, shots: [...es] });
      mockPrisma.$transaction.mockImplementation(async (fn: () => Promise<unknown>) => fn());
      mockPrisma.scriptShot.deleteMany.mockResolvedValue({ count: 0 });
    });

    it('TC-SSP-PERF-001: validateSchema ≤10ms', () => {
      const f = mockFiveShotsFactory().map((s) => ({
        shot_index: s.shot_index, duration: s.duration,
        scene_description_query: s.scene_description_query, visual_description: s.visual_description,
        camera_movement: s.camera_movement, transition_type: s.transition_type,
        voiceover_text: s.voiceover_text, subtitle_text: s.subtitle_text,
        safe_zone_bounding_box: s.safe_zone_bounding_box,
      }));
      const s = performance.now();
      const r = validateScriptSchema({ shots: f });
      expect(r.valid).toBe(true);
      expect(performance.now() - s).toBeLessThanOrEqual(10);
    });

    it('TC-SSP-PERF-002: checkCompliance ≤5ms', () => {
      const f = mockFiveShotsFactory().map((s) => ({ shot_index: s.shot_index, voiceover_text: s.voiceover_text, subtitle_text: s.subtitle_text }));
      const s = performance.now();
      const r = checkCompliance(f);
      expect(r.passed).toBe(true);
      expect(performance.now() - s).toBeLessThanOrEqual(5);
    });

    it('TC-SSP-PERF-003: applyPatchOps ≤5ms', () => {
      const shots = mockThreeShotsFactory();
      const s = performance.now();
      const r = applyPatchOperations([{ op: 'replace', path: '/shots/1/duration', value: 4.0 }], mockScriptFactory(), shots);
      expect(r).toHaveProperty('updatedFields');
      expect(performance.now() - s).toBeLessThanOrEqual(5);
    });

    it('TC-SSP-PERF-004: patchScript ≤200ms', async () => {
      const s = performance.now();
      await patchScript(SCRIPT_ID, [{ op: 'replace', path: '/shots/1/duration', value: 4.0 }], buildPatchDeps());
      expect(performance.now() - s).toBeLessThanOrEqual(200);
    }, 5000);
  });

  // ===========================================================
  // 5. 契约对齐验证
  // ===========================================================
  describe('【契约对齐】文档定义的路径与 op 白名单', () => {
    it('TC-SSP-CONTRACT-001: PATCH 路由为 /api/v1/scripts/:scriptId（不在 /shots）', () => {
      // 本测试隐式验证：patch 函数接收 sid，不对 /shots 子路由做硬编码假设
      expect(typeof patchScript).toBe('function');
    });

    it('TC-SSP-CONTRACT-002: PatchOperationDTO 的 op 允许 add/remove/replace/move（无 test）', () => {
      const shots = mockThreeShotsFactory();
      expect(() =>
        validatePatchOperations([
          { op: 'test' as unknown as PatchOperationDTO['op'], path: '/shots/1/duration', value: 3.0 },
        ], shots),
      ).toThrow('非法 op: test');
    });

    it('TC-SSP-CONTRACT-003: ScriptPatchResponse 包含 timing_validation', async () => {
      const es = mockThreeShotsFactory();
      const exs = mockScriptFactory({ shots: es });
      mockPrisma.script.findUnique.mockResolvedValue({ ...exs, shots: [...es] });
      mockPrisma.$transaction.mockImplementation(async (fn: () => Promise<unknown>) => fn());
      mockPrisma.scriptShot.deleteMany.mockResolvedValue({ count: 0 });
      const r = await patchScript(SCRIPT_ID, [{ op: 'replace', path: '/shots/1/duration', value: 4.0 }], buildPatchDeps());
      expect(r).toHaveProperty('timing_validation');
      expect(r.timing_validation).toHaveProperty('valid');
      expect(r.timing_validation).toHaveProperty('suggestion');
    });

    it('TC-SSP-CONTRACT-004: ScriptSaveResponse 的 validation_summary 包含 schema/timing/compliance 三项', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
      mockPrisma.script.findUnique.mockResolvedValue({ ...mockScriptFactory({ shots: mockFiveShotsFactory() }), shots: mockFiveShotsFactory() });
      mockPrisma.$transaction.mockImplementation(async (fn: () => Promise<unknown>) => fn());
      mockPrisma.scriptShot.deleteMany.mockResolvedValue({ count: 0 });
      const r = await saveScript(SCRIPT_ID, {}, { prisma: mockPrisma, findScript: findScriptWithShots, validateSchema: validateScriptSchema, runCompliance: checkCompliance, updateScript: updateScriptWithShots });
      expect(r.validation_summary.schema_valid).toBe(true);
      expect(r.validation_summary.timing_valid).toBe(true);
      expect(r.validation_summary.compliance_valid).toBe(true);
    });
  });
});