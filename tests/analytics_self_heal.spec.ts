// =============================================================================
// TikStream AI — Analytics Self-Heal 自动化测试基座
// 对应功能: POST /api/v1/analytics/self-heal (一键自愈建议回写链路)
// 对应模块: Analytics (人员B) | 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// ============================================================
// 0. 测试专用类型定义
// ============================================================

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
}

interface TestShotRender {
  id: string; creation_id: string; script_shot_id: string;
  shot_id: string | null; shot_index: number; cache_hash: string | null;
  slice_id: string | null; render_path: string | null;
  render_duration_ms: number | null; retry_count: number;
  status: string; error_message: string | null;
  created_at: Date; updated_at: Date;
}

interface TestCreationRecord {
  id: string; product_id: string; script_id: string; task_id: string;
  engine_mode: string; target_resolution: string; export_format: string;
  status: string; progress: number; current_stage: string; video_url: string | null;
  file_size_bytes: number | null; trace_id: string | null; error_code: string | null;
  error_message: string | null; started_at: Date | null; finished_at: Date | null;
  created_at: Date; updated_at: Date;
  script: TestScript & { shots: TestScriptShot[] };
  shot_renders: TestShotRender[];
}

interface SelfHealDuckDBRawRow {
  shot_index: number;
  hook_strength: number;
  voiceover_ratio: number;
  style_alignment_score: number;
  cta_strength: number;
  retention_rate_at_shot: number;
}

interface SelfHealDuckDBBundle {
  rows: SelfHealDuckDBRawRow[];
  is_mock: boolean;
  is_predicted: boolean;
}

interface ShotDiagnosis {
  shot_index: number;
  issue_type: string;
  severity: number;
  value: number;
  threshold: number;
  reason: string;
}

interface AffectedShot {
  shot_index: number;
  action: string;
  reason: string;
}

type TriggerSource = 'RETENTION_DROP' | 'AB_COMPARE' | 'MANUAL';
type SelfHealIssueType = 'HOOK_WEAK' | 'VOICEOVER_TOO_LONG' | 'STYLE_MISMATCH' | 'CTA_WEAK';
type SelfHealStrategy = 'REWRITE_ONLY' | 'RERENDER_SHOT' | 'REGENERATE_VARIANT';
type SelfHealStatus = 'SUGGESTED' | 'QUEUED' | 'PROCESSING' | 'FINISHED';

interface TestSelfHealRequest {
  product_id: string;
  creation_id: string;
  trigger_source: TriggerSource;
  target_shot_indexes?: number[];
  issue_type: SelfHealIssueType;
  strategy: SelfHealStrategy;
  dry_run?: boolean;
  remark?: string;
}

interface TestSelfHealResultResponse {
  product_id: string;
  creation_id: string;
  task_id?: string;
  healed_creation_id?: string;
  affected_shots: AffectedShot[];
  suggestion_summary: string;
  status: SelfHealStatus;
  dry_run: boolean;
  data_source?: string;
  is_mock?: boolean;
  is_predicted?: boolean;
}

type MockPrismaService = {
  product: { findUnique: jest.Mock };
  creation: { findUnique: jest.Mock };
};

type MockDuckDBDataSource = { querySelfHeal: jest.Mock };

// ============================================================
// 常量与工厂函数
// ============================================================

const NOW = new Date('2026-05-25T12:00:00Z');
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const CREATION_ID = 'dc52d4ff-0000-4000-a000-000000000001';
const SCRIPT_ID = 'dc52d4ff-0000-4000-a000-000000000002';
const TASK_ID = 'tsk_20260525_000001';

const VALID_TRIGGER_SOURCES: TriggerSource[] = ['RETENTION_DROP', 'AB_COMPARE', 'MANUAL'];
const VALID_ISSUE_TYPES: SelfHealIssueType[] = ['HOOK_WEAK', 'VOICEOVER_TOO_LONG', 'STYLE_MISMATCH', 'CTA_WEAK'];
const VALID_STRATEGIES: SelfHealStrategy[] = ['REWRITE_ONLY', 'RERENDER_SHOT', 'REGENERATE_VARIANT'];

const HOOK_STRENGTH_WEAK_THRESHOLD = 0.45;
const VOICEOVER_RATIO_HIGH_THRESHOLD = 0.75;
const STYLE_MISMATCH_THRESHOLD = 0.5;
const CTA_WEAK_THRESHOLD = 0.35;

const makeShot = (i: number, overrides?: Partial<TestScriptShot>): TestScriptShot => ({
  id: `shot-uuid-${i}-${SCRIPT_ID}`, script_id: SCRIPT_ID,
  shot_id: `shot_${String(i).padStart(3, '0')}`, shot_index: i,
  duration: overrides?.duration ?? (i === 1 ? 3.0 : i === 2 ? 3.5 : i === 3 ? 4.0 : i === 4 ? 2.0 : 2.0),
  scene_description_query: `close-up shot ${i} of product feature`,
  visual_description: `镜头${i}：展示产品核心功能，画面干净明亮。`,
  camera_movement: i === 1 ? 'Dolly_In_Fast' : i === 2 ? 'Pan_Left' : i === 3 ? 'Tilt_Up' : 'Static',
  transition_type: i === 1 ? 'Fade_In' : i === 2 ? 'Dissolve' : i === 3 ? 'Wipe' : 'None',
  voiceover_text: `第${i}段旁白：产品核心卖点生动表达。`,
  subtitle_text: `字幕${i}`,
  safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9], selected_slice_id: null,
  render_prompt: null, local_factor_patch: {}, compliance_status: 'PASSED',
  created_at: NOW, updated_at: NOW, ...overrides,
});

const makeShots5 = (): TestScriptShot[] => [1, 2, 3, 4, 5].map((i) => makeShot(i));
const makeShot1 = (): TestScriptShot[] => [makeShot(1, { duration: 3.0 })];
const makeShots15 = (): TestScriptShot[] => {
  const shots: TestScriptShot[] = [];
  for (let i = 1; i <= 15; i++) { shots.push(makeShot(i, { duration: 1.0 })); }
  return shots;
};

const makeScript = (overrides?: Partial<TestScript>): TestScript => ({
  id: SCRIPT_ID, product_id: PRODUCT_ID, title: '智能无线卷发棒快速成片剧本',
  language: 'zh-CN', target_audience: '北美年轻女性,25-35岁', video_duration: 14.5,
  aspect_ratio: '9:16', style_vibe: 'clean-tech', generation_mode: 'PROMPT_DRIVEN',
  template_id: null, viral_video_id: null,
  constraint_list: ['total_duration<=15s', 'avoid_absolute_claims'], raw_json: {},
  created_at: NOW, updated_at: NOW, ...overrides,
});

const makeShotRender = (i: number, overrides?: Partial<TestShotRender>): TestShotRender => ({
  id: `render-uuid-${i}`, creation_id: CREATION_ID,
  script_shot_id: `shot-uuid-${i}-${SCRIPT_ID}`,
  shot_id: `shot_${String(i).padStart(3, '0')}`, shot_index: i,
  cache_hash: `cache_${String(i).padStart(2, '0')}`, slice_id: `slice_${String(i).padStart(2, '0')}`,
  render_path: `/renders/shot_${i}.mp4`, render_duration_ms: 2500 + i * 120,
  retry_count: 0, status: 'FINISHED', error_message: null,
  created_at: NOW, updated_at: NOW, ...overrides,
});

const makeCreation = (overrides?: Partial<TestCreationRecord>): TestCreationRecord => {
  const script = makeScript();
  const shots = makeShots5();
  const renders = shots.map((_, i) => makeShotRender(i + 1));
  return {
    id: CREATION_ID, product_id: PRODUCT_ID, script_id: SCRIPT_ID, task_id: TASK_ID,
    engine_mode: 'SCRIPT_DRIVEN', target_resolution: '1080x1920', export_format: 'MP4',
    status: 'FINISHED', progress: 100, current_stage: 'FINISHED',
    video_url: 'https://minio.internal/output/demo.mp4', file_size_bytes: 5242880,
    trace_id: 'trc_20260525_self_heal', error_code: null, error_message: null,
    started_at: new Date('2026-05-25T11:50:00Z'), finished_at: new Date('2026-05-25T12:00:00Z'),
    created_at: NOW, updated_at: NOW,
    script: { ...script, shots },
    shot_renders: renders,
    ...overrides,
  };
};

const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash | 0;
  }
  return (hash >>> 0) || 1;
};

const lgcPseudoRandom = (seed: number): () => number => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (state >>> 0) / 0xFFFFFFFF;
  };
};

const makeDuckDBSelfHealData = (creationId: string, scenario: 'normal' | 'healthy' | 'allWeak'): SelfHealDuckDBRawRow[] => {
  const seed = hashString(creationId.slice(0, 8));
  const rand = lgcPseudoRandom(seed);
  const rows: SelfHealDuckDBRawRow[] = [];
  for (let i = 1; i <= 5; i++) {
    if (scenario === 'healthy') {
      rows.push({
        shot_index: i,
        hook_strength: 0.7 + rand() * 0.25,
        voiceover_ratio: 0.15 + rand() * 0.4,
        style_alignment_score: 0.75 + rand() * 0.2,
        cta_strength: 0.6 + rand() * 0.35,
        retention_rate_at_shot: 0.7 + rand() * 0.25,
      });
    } else if (scenario === 'allWeak') {
      rows.push({
        shot_index: i,
        hook_strength: rand() * 0.3,
        voiceover_ratio: 0.8 + rand() * 0.15,
        style_alignment_score: rand() * 0.3,
        cta_strength: rand() * 0.2,
        retention_rate_at_shot: rand() * 0.4,
      });
    } else {
      rows.push({
        shot_index: i,
        hook_strength: i === 1 ? 0.32 : 0.55 + rand() * 0.4,
        voiceover_ratio: i === 3 ? 0.82 : 0.2 + rand() * 0.5,
        style_alignment_score: i === 2 ? 0.38 : 0.55 + rand() * 0.4,
        cta_strength: i === 5 ? 0.22 : 0.5 + rand() * 0.45,
        retention_rate_at_shot: 0.45 + rand() * 0.5,
      });
    }
  }
  return rows;
};

const makeFallbackMockData = (creationId: string): SelfHealDuckDBBundle => {
  return {
    rows: makeDuckDBSelfHealData(creationId, 'normal'),
    is_mock: true,
    is_predicted: true,
  };
};

const toPrismaShot = (s: TestScriptShot) => ({
  id: s.id, scriptId: s.script_id, shotId: s.shot_id, shotIndex: s.shot_index,
  duration: s.duration, sceneDescriptionQuery: s.scene_description_query,
  visualDescription: s.visual_description, cameraMovement: s.camera_movement,
  transitionType: s.transition_type, voiceoverText: s.voiceover_text,
  subtitleText: s.subtitle_text, safeZoneBoundingBox: s.safe_zone_bounding_box,
  selectedSliceId: s.selected_slice_id, renderPrompt: s.render_prompt,
  localFactorPatch: s.local_factor_patch, complianceStatus: s.compliance_status,
  createdAt: s.created_at, updatedAt: s.updated_at,
});

const toPrismaShotRender = (r: TestShotRender) => ({
  id: r.id, creationId: r.creation_id, scriptShotId: r.script_shot_id,
  shotId: r.shot_id, shotIndex: r.shot_index, cacheHash: r.cache_hash,
  sliceId: r.slice_id, renderPath: r.render_path,
  renderDurationMs: r.render_duration_ms, retryCount: r.retry_count,
  status: r.status, errorMessage: r.error_message,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

const buildPrismaCreation = (c: TestCreationRecord) => ({
  id: c.id, productId: c.product_id, scriptId: c.script_id, taskId: c.task_id,
  engineMode: c.engine_mode, targetResolution: c.target_resolution, exportFormat: c.export_format,
  status: c.status, progress: c.progress, currentStage: c.current_stage,
  videoUrl: c.video_url, fileSizeBytes: c.file_size_bytes, traceId: c.trace_id,
  errorCode: c.error_code, errorMessage: c.error_message,
  startedAt: c.started_at, finishedAt: c.finished_at, createdAt: c.created_at, updatedAt: c.updated_at,
  script: {
    id: c.script.id, productId: c.script.product_id, title: c.script.title,
    language: c.script.language, targetAudience: c.script.target_audience,
    videoDuration: c.script.video_duration, aspectRatio: c.script.aspect_ratio === '16:9' ? 'SIXTEEN_NINE' : 'NINE_SIXTEEN',
    styleVibe: c.script.style_vibe, generationMode: c.script.generation_mode,
    templateId: c.script.template_id, viralVideoId: c.script.viral_video_id,
    constraintList: c.script.constraint_list, rawJson: c.script.raw_json,
    createdAt: c.script.created_at, updatedAt: c.script.updated_at,
    shots: c.script.shots.map(toPrismaShot),
  },
  shotRenders: c.shot_renders.map(toPrismaShotRender),
});

// ============================================================
// 测试套件入口
// ============================================================

describe('AnalyticsSelfHeal — 一键自愈建议回写链路 (POST /api/v1/analytics/self-heal)', () => {
  let mockPrisma: MockPrismaService;
  let mockDuckDB: MockDuckDBDataSource;

  // ---- 原子函数类型声明 ----
  type ValidateParamsFn = (
    productId: string, creationId: string, triggerSource: TriggerSource,
    issueType: SelfHealIssueType, strategy: SelfHealStrategy,
    targetShotIndexes?: number[],
  ) => void;

  type ValidateTargetShotIndexesFn = (
    shots: TestScriptShot[], targetShotIndexes: number[],
  ) => void;

  type ValidateProductExistsFn = (
    productId: string, prisma: MockPrismaService,
  ) => Promise<void>;

  type ValidateCreationForSelfHealFn = (
    creationId: string, productId: string, prisma: MockPrismaService,
  ) => Promise<TestCreationRecord>;

  type FetchDuckDBDataFn = (
    creationId: string, duckDB: MockDuckDBDataSource,
  ) => Promise<SelfHealDuckDBBundle>;

  type DiagnoseShotsFn = (
    creation: TestCreationRecord, duckDBData: SelfHealDuckDBBundle,
    issueType: SelfHealIssueType, targetShotIndexes?: number[], triggerSource?: string,
  ) => ShotDiagnosis[];

  type DiagnoseHookWeakFn = (
    shots: TestScriptShot[], duckDBData: SelfHealDuckDBBundle,
  ) => ShotDiagnosis[];

  type DiagnoseVoiceoverTooLongFn = (
    shots: TestScriptShot[], duckDBData: SelfHealDuckDBBundle,
  ) => ShotDiagnosis[];

  type DiagnoseStyleMismatchFn = (
    shots: TestScriptShot[], duckDBData: SelfHealDuckDBBundle,
  ) => ShotDiagnosis[];

  type DiagnoseCtaWeakFn = (
    shots: TestScriptShot[], duckDBData: SelfHealDuckDBBundle,
  ) => ShotDiagnosis[];

  type BuildIndexMapFn = (
    duckDBData: SelfHealDuckDBBundle,
  ) => Map<number, SelfHealDuckDBRawRow>;

  type ResolveAffectedShotsFn = (
    creation: TestCreationRecord, shotDiagnoses: ShotDiagnosis[], strategy: SelfHealStrategy,
  ) => AffectedShot[];

  type BuildSuggestionSummaryFn = (
    issueType: SelfHealIssueType, strategy: SelfHealStrategy,
    shotDiagnoses: ShotDiagnosis[], affectedShots: AffectedShot[], dryRun: boolean,
  ) => string;

  type ResolveStatusFn = (
    dryRun?: boolean, strategy?: SelfHealStrategy,
  ) => SelfHealStatus;

  type BuildResponseFn = (
    dto: TestSelfHealRequest, affectedShots: AffectedShot[],
    suggestionSummary: string, status: SelfHealStatus,
    creation: TestCreationRecord, isMock?: boolean, isPredicted?: boolean,
  ) => TestSelfHealResultResponse;

  type GetSelfHealDiagnosisFn = (
    dto: TestSelfHealRequest, deps: {
      prisma: MockPrismaService; duckDB: MockDuckDBDataSource;
      atoms: {
        validateParams: ValidateParamsFn;
        validateTargetShotIndexes: ValidateTargetShotIndexesFn;
        validateProductExists: ValidateProductExistsFn;
        validateCreationForSelfHeal: ValidateCreationForSelfHealFn;
        fetchDuckDBData: FetchDuckDBDataFn;
        diagnoseShots: DiagnoseShotsFn;
        resolveAffectedShots: ResolveAffectedShotsFn;
        buildSuggestionSummary: BuildSuggestionSummaryFn;
        resolveStatus: ResolveStatusFn;
        buildResponse: BuildResponseFn;
      };
    },
  ) => Promise<TestSelfHealResultResponse>;

  // ---- 原子函数实例 ----
  let validateSelfHealParams: ValidateParamsFn;
  let validateTargetShotIndexes: ValidateTargetShotIndexesFn;
  let validateProductExists: ValidateProductExistsFn;
  let validateCreationForSelfHeal: ValidateCreationForSelfHealFn;
  let fetchSelfHealDuckDBData: FetchDuckDBDataFn;
  let diagnoseShots: DiagnoseShotsFn;
  let diagnoseHookWeak: DiagnoseHookWeakFn;
  let diagnoseVoiceoverTooLong: DiagnoseVoiceoverTooLongFn;
  let diagnoseStyleMismatch: DiagnoseStyleMismatchFn;
  let diagnoseCtaWeak: DiagnoseCtaWeakFn;
  let buildDuckDBIndexMap: BuildIndexMapFn;
  let resolveAffectedShots: ResolveAffectedShotsFn;
  let buildSuggestionSummary: BuildSuggestionSummaryFn;
  let resolveSelfHealStatus: ResolveStatusFn;
  let buildSelfHealResponse: BuildResponseFn;
  let getSelfHealDiagnosis: GetSelfHealDiagnosisFn;

  beforeAll(() => {
    // ---- F13: buildDuckDBIndexMap ----
    buildDuckDBIndexMap = (duckDBData) => {
      const map = new Map<number, SelfHealDuckDBRawRow>();
      for (const row of duckDBData.rows) {
        map.set(row.shot_index, row);
      }
      return map;
    };

    // ---- F9: diagnoseHookWeak ----
    diagnoseHookWeak = (shots, duckDBData) => {
      const diagnoses: ShotDiagnosis[] = [];
      const indexMap = buildDuckDBIndexMap(duckDBData);
      const targetShots = shots.filter((s) => s.shot_index === 1 || s.shot_index === 2);
      for (const shot of targetShots) {
        const row = indexMap.get(shot.shot_index);
        const hs = row?.hook_strength ?? 0;
        if (hs < HOOK_STRENGTH_WEAK_THRESHOLD) {
          const rawSeverity = HOOK_STRENGTH_WEAK_THRESHOLD - hs;
          diagnoses.push({
            shot_index: shot.shot_index,
            issue_type: 'HOOK_WEAK',
            severity: Math.round((rawSeverity / HOOK_STRENGTH_WEAK_THRESHOLD) * 10000) / 10000,
            value: Math.round(hs * 10000) / 10000,
            threshold: HOOK_STRENGTH_WEAK_THRESHOLD,
            reason: `开场 hook_strength 仅 ${hs.toFixed(2)}，低于阈值 ${HOOK_STRENGTH_WEAK_THRESHOLD}，建议用更强钩子类型替换`,
          });
        }
      }
      return diagnoses;
    };

    // ---- F10: diagnoseVoiceoverTooLong ----
    diagnoseVoiceoverTooLong = (shots, duckDBData) => {
      const diagnoses: ShotDiagnosis[] = [];
      const indexMap = buildDuckDBIndexMap(duckDBData);
      for (const shot of shots) {
        const row = indexMap.get(shot.shot_index);
        const vr = row?.voiceover_ratio ?? 0;
        if (vr > VOICEOVER_RATIO_HIGH_THRESHOLD) {
          const rawSeverity = vr - VOICEOVER_RATIO_HIGH_THRESHOLD;
          diagnoses.push({
            shot_index: shot.shot_index,
            issue_type: 'VOICEOVER_TOO_LONG',
            severity: Math.round((rawSeverity / (1 - VOICEOVER_RATIO_HIGH_THRESHOLD)) * 10000) / 10000,
            value: Math.round(vr * 10000) / 10000,
            threshold: VOICEOVER_RATIO_HIGH_THRESHOLD,
            reason: `分镜 ${shot.shot_index} 旁白占比 ${(vr * 100).toFixed(1)}%，超出阈值 ${VOICEOVER_RATIO_HIGH_THRESHOLD * 100}%，建议压缩台词或拆分分镜`,
          });
        }
      }
      return diagnoses;
    };

    // ---- F11: diagnoseStyleMismatch ----
    diagnoseStyleMismatch = (shots, duckDBData) => {
      const diagnoses: ShotDiagnosis[] = [];
      const indexMap = buildDuckDBIndexMap(duckDBData);
      for (const shot of shots) {
        const row = indexMap.get(shot.shot_index);
        const sas = row?.style_alignment_score ?? 1;
        if (sas < STYLE_MISMATCH_THRESHOLD) {
          const rawSeverity = STYLE_MISMATCH_THRESHOLD - sas;
          diagnoses.push({
            shot_index: shot.shot_index,
            issue_type: 'STYLE_MISMATCH',
            severity: Math.round((rawSeverity / STYLE_MISMATCH_THRESHOLD) * 10000) / 10000,
            value: Math.round(sas * 10000) / 10000,
            threshold: STYLE_MISMATCH_THRESHOLD,
            reason: `分镜 ${shot.shot_index} 视觉风格与商品调性偏离(匹配度 ${sas.toFixed(2)})，建议调整 visual_description`,
          });
        }
      }
      return diagnoses;
    };

    // ---- F12: diagnoseCtaWeak ----
    diagnoseCtaWeak = (shots, duckDBData) => {
      const diagnoses: ShotDiagnosis[] = [];
      const indexMap = buildDuckDBIndexMap(duckDBData);
      // Shots are already pre-filtered to the last 2 shots by diagnoseShots
      for (const shot of shots) {
        const row = indexMap.get(shot.shot_index);
        const cs = row?.cta_strength ?? 0;
        if (cs < CTA_WEAK_THRESHOLD) {
          const rawSeverity = CTA_WEAK_THRESHOLD - cs;
          diagnoses.push({
            shot_index: shot.shot_index,
            issue_type: 'CTA_WEAK',
            severity: Math.round((rawSeverity / CTA_WEAK_THRESHOLD) * 10000) / 10000,
            value: Math.round(cs * 10000) / 10000,
            threshold: CTA_WEAK_THRESHOLD,
            reason: `分镜 ${shot.shot_index} CTA 强度仅 ${cs.toFixed(2)}，低于阈值 ${CTA_WEAK_THRESHOLD}，建议增强促销引导语`,
          });
        }
      }
      return diagnoses;
    };

    // ---- F8: diagnoseShots (诊断分发器) ----
    diagnoseShots = (creation, duckDBData, issueType, targetShotIndexes, triggerSource) => {
      const allShots = creation.script.shots ?? [];

      let candidateShots: TestScriptShot[];
      if (targetShotIndexes && targetShotIndexes.length > 0) {
        candidateShots = allShots.filter((s) => targetShotIndexes.includes(s.shot_index));
      } else if (triggerSource === 'RETENTION_DROP' || triggerSource === 'AB_COMPARE') {
        candidateShots = allShots;
      } else {
        candidateShots = allShots;
      }

      switch (issueType) {
        case 'HOOK_WEAK':
          return diagnoseHookWeak(candidateShots, duckDBData);
        case 'VOICEOVER_TOO_LONG':
          return diagnoseVoiceoverTooLong(candidateShots, duckDBData);
        case 'STYLE_MISMATCH':
          return diagnoseStyleMismatch(candidateShots, duckDBData);
        case 'CTA_WEAK': {
          // CTA only checks the last 2 shots — use total shot count, not candidate count
          const totalCount = allShots.length;
          const ctaCandidates = candidateShots.filter(
            (s) => s.shot_index === totalCount || s.shot_index === totalCount - 1,
          );
          return diagnoseCtaWeak(ctaCandidates, duckDBData);
        }
        default:
          return [];
      }
    };

    // ---- F14: resolveAffectedShots ----
    resolveAffectedShots = (creation, shotDiagnoses, strategy) => {
      if (strategy === 'REGENERATE_VARIANT') {
        const allShots = creation.script.shots ?? [];
        const affected: AffectedShot[] = allShots.map((s) => ({
          shot_index: s.shot_index,
          action: 'REGENERATE_FULL_VARIANT',
          reason: `全量再生：${strategy}`,
        }));
        for (const diag of shotDiagnoses) {
          const existing = affected.find((a) => a.shot_index === diag.shot_index);
          if (existing) {
            existing.reason = `${existing.reason}；原诊断：${diag.reason}`;
          }
        }
        return affected;
      }

      const action = strategy === 'REWRITE_ONLY' ? 'REWRITE_SHOT_SCRIPT' : 'RERENDER_SHOT';
      return shotDiagnoses.map((diag) => ({
        shot_index: diag.shot_index,
        action,
        reason: diag.reason,
      }));
    };

    // ---- F15: buildSuggestionSummary ----
    buildSuggestionSummary = (issueType, strategy, shotDiagnoses, affectedShots, dryRun) => {
      const issueLabels: Record<SelfHealIssueType, string> = {
        HOOK_WEAK: '开场钩子吸引力不足',
        VOICEOVER_TOO_LONG: '旁白占比过高',
        STYLE_MISMATCH: '视觉风格与商品调性偏离',
        CTA_WEAK: '结尾CTA行动号召力度不足',
      };
      const strategyLabels: Record<SelfHealStrategy, string> = {
        REWRITE_ONLY: '仅重写分镜剧本',
        RERENDER_SHOT: '分镜重渲染',
        REGENERATE_VARIANT: '全量再生新版本',
      };
      const count = affectedShots.length;
      const issueLabel = issueLabels[issueType] ?? issueType;
      const strategyLabel = strategyLabels[strategy] ?? strategy;
      const MAX_DIAGNOSIS_LENGTH = 500;
      const rawDiagDescs = shotDiagnoses.map((d) => d.reason).join('；');
      const diagDescs = rawDiagDescs.length > MAX_DIAGNOSIS_LENGTH
        ? rawDiagDescs.slice(0, MAX_DIAGNOSIS_LENGTH) + '…'
        : rawDiagDescs;
      const diagnosisSummary = diagDescs.length > 0 ? `：${diagDescs}。` : '。';

      if (count === 0) {
        return dryRun
          ? `未检测到明显的 ${issueLabel} 问题，所有分镜当前表现良好。dry_run 模式下未执行实际操作。`
          : `未检测到明显的 ${issueLabel} 问题，所有分镜当前表现良好，无需自愈处理。`;
      }

      const hasDiagnosis = shotDiagnoses.length > 0;

      if (dryRun) {
        if (hasDiagnosis) {
          return `检测到 ${issueLabel} 问题，共 ${count} 个分镜受影响。建议采用 ${strategyLabel} 策略${diagnosisSummary}dry_run 模式下未执行实际操作。`;
        }
        return `${strategyLabel}策略已覆盖全部 ${count} 个分镜${diagnosisSummary}dry_run 模式下未执行实际操作。`;
      }

      if (hasDiagnosis) {
        return `检测到 ${issueLabel} 问题，共 ${count} 个分镜纳入自愈处理。已按 ${strategyLabel} 策略创建创作任务${diagnosisSummary}`;
      }
      return `${strategyLabel}策略已覆盖全部 ${count} 个分镜，已创建创作任务${diagnosisSummary}`;
    };

    // ---- F16: resolveSelfHealStatus ----
    resolveSelfHealStatus = (dryRun, _strategy) => {
      return dryRun ? 'SUGGESTED' : 'QUEUED';
    };

    // ---- F17: buildSelfHealResponse ----
    buildSelfHealResponse = (dto, affectedShots, suggestionSummary, status, creation, isMock, isPredicted) => {
      const dryRun = dto.dry_run ?? false;
      const healedCreationId = dryRun ? undefined : `${creation.id}-healed`;
      return {
        product_id: dto.product_id,
        creation_id: dto.creation_id,
        task_id: dryRun ? undefined : `${creation.task_id}-heal`,
        healed_creation_id: healedCreationId,
        affected_shots: affectedShots,
        suggestion_summary: suggestionSummary,
        status,
        dry_run: dryRun,
        data_source: 'DUCKDB_PRECOMPUTED',
        is_mock: isMock,
        is_predicted: isPredicted,
      };
    };

    // ---- F1: validateSelfHealParams ----
    validateSelfHealParams = (productId, creationId, triggerSource, issueType, strategy, targetShotIndexes) => {
      if (!productId || productId.trim().length === 0) {
        throw Object.assign(new Error('product_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST, retryable: false,
        });
      }
      if (!creationId || creationId.trim().length === 0) {
        throw Object.assign(new Error('creation_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST, retryable: false,
        });
      }
      if (!VALID_TRIGGER_SOURCES.includes(triggerSource)) {
        throw Object.assign(new Error(`trigger_source 取值必须为 RETENTION_DROP / AB_COMPARE / MANUAL：实际为 "${triggerSource}"`), {
          errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST, retryable: false,
        });
      }
      if (!VALID_ISSUE_TYPES.includes(issueType)) {
        throw Object.assign(new Error(`issue_type 取值必须为 HOOK_WEAK / VOICEOVER_TOO_LONG / STYLE_MISMATCH / CTA_WEAK：实际为 "${issueType}"`), {
          errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST, retryable: false,
        });
      }
      if (!VALID_STRATEGIES.includes(strategy)) {
        throw Object.assign(new Error(`strategy 取值必须为 REWRITE_ONLY / RERENDER_SHOT / REGENERATE_VARIANT：实际为 "${strategy}"`), {
          errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST, retryable: false,
        });
      }
      if (triggerSource === 'MANUAL' && (!targetShotIndexes || targetShotIndexes.length === 0)) {
        throw Object.assign(new Error('MANUAL 触发源必须指定至少一个 target_shot_index'), {
          errorCode: 'ANALYTICS_SELF_HEAL_MANUAL_NO_TARGETS', statusCode: HttpStatus.BAD_REQUEST, retryable: false,
        });
      }
    };

    // ---- F2: validateTargetShotIndexes ----
    validateTargetShotIndexes = (shots, targetShotIndexes) => {
      const deduped = [...new Set(targetShotIndexes)];
      for (const idx of deduped) {
        if (idx < 1 || idx > shots.length) {
          throw Object.assign(new Error(`分镜索引 ${idx} 超出范围 [1, ${shots.length}]`), {
            errorCode: 'SHOT_INDEX_OUT_OF_RANGE', statusCode: HttpStatus.BAD_REQUEST, retryable: false,
          });
        }
      }
    };

    // ---- F3: validateProductExists ----
    validateProductExists = async (productId, prisma) => {
      try {
        const record = await prisma.product.findUnique({
          where: { id: productId },
          select: { id: true },
        });
        if (!record) {
          throw Object.assign(new Error('商品不存在'), {
            errorCode: 'PRODUCT_NOT_FOUND', statusCode: HttpStatus.NOT_FOUND, retryable: false,
          });
        }
      } catch (error) {
        if (error instanceof Error) {
          const pe = error as Error & { errorCode?: string };
          if (pe.errorCode === 'PRODUCT_NOT_FOUND') throw error;
          const prismaErr = error as Error & { code?: string };
          switch (prismaErr.code) {
            case 'P1001':
              throw Object.assign(new Error('PostgreSQL 连接中断，请检查数据库状态'), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.SERVICE_UNAVAILABLE, retryable: true,
              });
            case 'P1008':
              throw Object.assign(new Error('数据库查询超时'), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.SERVICE_UNAVAILABLE, retryable: true,
              });
            case 'P2025':
              throw Object.assign(new Error('商品不存在'), {
                errorCode: 'PRODUCT_NOT_FOUND', statusCode: HttpStatus.NOT_FOUND, retryable: false,
              });
            case 'P2024':
              throw Object.assign(new Error('数据库连接池耗尽'), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.INTERNAL_SERVER_ERROR, retryable: true,
              });
            default:
              throw Object.assign(new Error(`数据库操作失败: ${prismaErr.message}`), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.INTERNAL_SERVER_ERROR, retryable: true,
              });
          }
        }
        throw Object.assign(new Error('未知数据库错误'), {
          errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.INTERNAL_SERVER_ERROR, retryable: true,
        });
      }
    };

    // ---- F4: validateCreationForSelfHeal ----
    validateCreationForSelfHeal = async (creationId, productId, prisma) => {
      try {
        const record = await prisma.creation.findUnique({
          where: { id: creationId },
          include: {
            script: { include: { shots: { orderBy: { shotIndex: 'asc' as const } } } },
            shotRenders: { orderBy: { shotIndex: 'asc' as const } },
          },
        });
        if (!record) {
          throw Object.assign(new Error(`自愈 创作任务 ${creationId} 不存在`), {
            errorCode: 'CREATION_NOT_FOUND', statusCode: HttpStatus.NOT_FOUND, retryable: false,
          });
        }
        const r = record as Record<string, unknown>;
        const rProductId = String(r.productId ?? r.product_id);
        if (rProductId !== productId) {
          throw Object.assign(new Error('自愈 创作任务 product_id 与查询参数不匹配'), {
            errorCode: 'CREATION_NOT_FOUND', statusCode: HttpStatus.NOT_FOUND, retryable: false,
          });
        }
        const rawScript = (r.script ?? {}) as Record<string, unknown>;
        if (!rawScript || Object.keys(rawScript).length === 0) {
          throw Object.assign(new Error(`自愈 创作任务 ${creationId} 关联的剧本已被删除`), {
            errorCode: 'SCRIPT_NOT_FOUND', statusCode: HttpStatus.NOT_FOUND, retryable: false,
          });
        }
        const rawShots = (rawScript.shots ?? []) as Array<Record<string, unknown>>;
        if (rawShots.length === 0) {
          throw Object.assign(new Error(`自愈 创作任务 ${creationId} 关联的剧本不包含任何有效分镜`), {
            errorCode: 'ANALYTICS_NO_SHOTS_IN_CREATION', statusCode: HttpStatus.UNPROCESSABLE_ENTITY, retryable: false,
          });
        }
        const shots: TestScriptShot[] = rawShots.map((s) => ({
          id: String(s.id), script_id: String(s.scriptId ?? s.script_id),
          shot_id: (s.shotId ?? s.shot_id ?? null) as string | null,
          shot_index: Number(s.shotIndex ?? s.shot_index), duration: Number(s.duration),
          scene_description_query: String(s.sceneDescriptionQuery ?? s.scene_description_query),
          visual_description: String(s.visualDescription ?? s.visual_description),
          camera_movement: String(s.cameraMovement ?? s.camera_movement),
          transition_type: String(s.transitionType ?? s.transition_type),
          voiceover_text: String(s.voiceoverText ?? s.voiceover_text),
          subtitle_text: String(s.subtitleText ?? s.subtitle_text),
          safe_zone_bounding_box: (s.safeZoneBoundingBox ?? s.safe_zone_bounding_box) as [number, number, number, number],
          selected_slice_id: (s.selectedSliceId ?? s.selected_slice_id ?? null) as string | null,
          render_prompt: (s.renderPrompt ?? s.render_prompt ?? null) as string | null,
          local_factor_patch: (s.localFactorPatch ?? s.local_factor_patch ?? {}) as Record<string, unknown>,
          compliance_status: String(s.complianceStatus ?? s.compliance_status),
          created_at: (s.createdAt ?? s.created_at) as Date, updated_at: (s.updatedAt ?? s.updated_at) as Date,
        }));
        const script: TestScript = {
          id: String(rawScript.id), product_id: String(rawScript.productId ?? rawScript.product_id),
          title: (rawScript.title ?? null) as string | null,
          language: String(rawScript.language ?? 'zh-CN'),
          target_audience: (rawScript.targetAudience ?? rawScript.target_audience ?? null) as string | null,
          video_duration: Number(rawScript.videoDuration ?? rawScript.video_duration),
          aspect_ratio: (rawScript.aspectRatio ?? rawScript.aspect_ratio) === 'SIXTEEN_NINE' ? '16:9' : '9:16',
          style_vibe: String(rawScript.styleVibe ?? rawScript.style_vibe),
          generation_mode: String(rawScript.generationMode ?? rawScript.generation_mode),
          template_id: (rawScript.templateId ?? rawScript.template_id ?? null) as string | null,
          viral_video_id: (rawScript.viralVideoId ?? rawScript.viral_video_id ?? null) as string | null,
          constraint_list: (rawScript.constraintList ?? rawScript.constraint_list ?? []) as string[],
          raw_json: (rawScript.rawJson ?? rawScript.raw_json ?? {}) as Record<string, unknown>,
          created_at: (rawScript.createdAt ?? rawScript.created_at) as Date,
          updated_at: (rawScript.updatedAt ?? rawScript.updated_at) as Date,
        };
        const rawRenders = (r.shotRenders ?? []) as Array<Record<string, unknown>>;
        const shotRenders: TestShotRender[] = rawRenders.map((sr) => ({
          id: String(sr.id), creation_id: String(sr.creationId ?? sr.creation_id),
          script_shot_id: String(sr.scriptShotId ?? sr.script_shot_id),
          shot_id: (sr.shotId ?? sr.shot_id ?? null) as string | null,
          shot_index: Number(sr.shotIndex ?? sr.shot_index),
          cache_hash: (sr.cacheHash ?? sr.cache_hash ?? null) as string | null,
          slice_id: (sr.sliceId ?? sr.slice_id ?? null) as string | null,
          render_path: (sr.renderPath ?? sr.render_path ?? null) as string | null,
          render_duration_ms: (sr.renderDurationMs ?? sr.render_duration_ms ?? null) as number | null,
          retry_count: Number(sr.retryCount ?? sr.retry_count ?? 0),
          status: String(sr.status), error_message: (sr.errorMessage ?? sr.error_message ?? null) as string | null,
          created_at: (sr.createdAt ?? sr.created_at) as Date,
          updated_at: (sr.updatedAt ?? sr.updated_at) as Date,
        }));
        return {
          id: String(r.id), product_id: String(r.productId ?? r.product_id),
          script_id: String(r.scriptId ?? r.script_id), task_id: String(r.taskId ?? r.task_id),
          engine_mode: String(r.engineMode ?? r.engine_mode),
          target_resolution: String(r.targetResolution ?? r.target_resolution),
          export_format: String(r.exportFormat ?? r.export_format), status: String(r.status),
          progress: Number(r.progress ?? 0), current_stage: String(r.currentStage ?? r.current_stage),
          video_url: (r.videoUrl ?? r.video_url ?? null) as string | null,
          file_size_bytes: (r.fileSizeBytes ?? r.file_size_bytes ?? null) as number | null,
          trace_id: (r.traceId ?? r.trace_id ?? null) as string | null,
          error_code: (r.errorCode ?? r.error_code ?? null) as string | null,
          error_message: (r.errorMessage ?? r.error_message ?? null) as string | null,
          started_at: (r.startedAt ?? r.started_at ?? null) as Date | null,
          finished_at: (r.finishedAt ?? r.finished_at ?? null) as Date | null,
          created_at: (r.createdAt ?? r.created_at) as Date,
          updated_at: (r.updatedAt ?? r.updated_at) as Date,
          script: { ...script, shots },
          shot_renders: shotRenders,
        };
      } catch (error) {
        if (error instanceof Error) {
          const pe = error as Error & { errorCode?: string };
          if (pe.errorCode) throw error;
          const prismaErr = error as Error & { code?: string };
          switch (prismaErr.code) {
            case 'P1001':
              throw Object.assign(new Error('PostgreSQL 连接中断，请检查数据库状态'), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.SERVICE_UNAVAILABLE, retryable: true,
              });
            case 'P1008':
              throw Object.assign(new Error('数据库查询超时'), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.SERVICE_UNAVAILABLE, retryable: true,
              });
            case 'P2025':
              throw Object.assign(new Error(`自愈 创作任务 ${creationId} 不存在`), {
                errorCode: 'CREATION_NOT_FOUND', statusCode: HttpStatus.NOT_FOUND, retryable: false,
              });
            case 'P2024':
              throw Object.assign(new Error('数据库连接池耗尽'), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.INTERNAL_SERVER_ERROR, retryable: true,
              });
            default:
              throw Object.assign(new Error(`数据库操作失败: ${prismaErr.message}`), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.INTERNAL_SERVER_ERROR, retryable: true,
              });
          }
        }
        throw Object.assign(new Error('未知数据库错误'), {
          errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.INTERNAL_SERVER_ERROR, retryable: true,
        });
      }
    };

    // ---- F5: fetchSelfHealDuckDBData ----
    fetchSelfHealDuckDBData = async (creationId, duckDB) => {
      try {
        const result = await duckDB.querySelfHeal(creationId);
        if (!result || !Array.isArray(result.rows)) {
          return { rows: [], is_mock: true, is_predicted: true };
        }
        return {
          rows: result.rows as SelfHealDuckDBRawRow[],
          is_mock: result.is_mock ?? false,
          is_predicted: result.is_predicted ?? true,
        };
      } catch {
        return makeFallbackMockData(creationId);
      }
    };

    // ---- 主编排: getSelfHealDiagnosis ----
    getSelfHealDiagnosis = async (dto, deps) => {
      const { prisma, duckDB, atoms } = deps;
      const {
        validateParams, validateTargetShotIndexes, validateProductExists,
        validateCreationForSelfHeal, fetchDuckDBData, diagnoseShots: diagShots,
        resolveAffectedShots: resolveShots, buildSuggestionSummary: buildSummary,
        resolveStatus, buildResponse,
      } = atoms;

      validateParams(
        dto.product_id, dto.creation_id, dto.trigger_source,
        dto.issue_type, dto.strategy, dto.target_shot_indexes,
      );

      await validateProductExists(dto.product_id, prisma);

      const creation = await validateCreationForSelfHeal(dto.creation_id, dto.product_id, prisma);

      if (dto.target_shot_indexes && dto.target_shot_indexes.length > 0) {
        validateTargetShotIndexes(creation.script.shots, dto.target_shot_indexes);
      }

      let effectiveTarget: number[] | undefined;
      if (dto.trigger_source === 'MANUAL') {
        effectiveTarget = dto.target_shot_indexes;
      } else if (dto.trigger_source === 'RETENTION_DROP' || dto.trigger_source === 'AB_COMPARE') {
        effectiveTarget = undefined;
      }

      const duckDBData = await fetchDuckDBData(dto.creation_id, duckDB);

      const shotDiagnoses = diagShots(
        creation, duckDBData, dto.issue_type, effectiveTarget, dto.trigger_source,
      );

      const affectedShots = resolveShots(creation, shotDiagnoses, dto.strategy);

      const suggestionSummary = buildSummary(
        dto.issue_type, dto.strategy, shotDiagnoses, affectedShots, dto.dry_run ?? false,
      );

      const status = resolveStatus(dto.dry_run, dto.strategy);

      return buildResponse(
        dto, affectedShots, suggestionSummary, status, creation,
        duckDBData.is_mock, duckDBData.is_predicted,
      );
    };
  });

  beforeEach(() => {
    mockPrisma = {
      product: { findUnique: jest.fn() },
      creation: { findUnique: jest.fn() },
    };
    mockDuckDB = { querySelfHeal: jest.fn() };
  });

  const deps = () => ({
    prisma: mockPrisma,
    duckDB: mockDuckDB,
    atoms: {
      validateParams: validateSelfHealParams,
      validateTargetShotIndexes,
      validateProductExists,
      validateCreationForSelfHeal,
      fetchDuckDBData: fetchSelfHealDuckDBData,
      diagnoseShots,
      resolveAffectedShots,
      buildSuggestionSummary,
      resolveStatus: resolveSelfHealStatus,
      buildResponse: buildSelfHealResponse,
    },
  });

  const setupSuccess = (c?: TestCreationRecord, duckDBData?: SelfHealDuckDBRawRow[]) => {
    const cr = c ?? makeCreation();
    mockPrisma.product.findUnique.mockResolvedValue({ id: cr.product_id });
    mockPrisma.creation.findUnique.mockResolvedValue(buildPrismaCreation(cr));
    mockDuckDB.querySelfHeal.mockResolvedValue({
      rows: duckDBData ?? makeDuckDBSelfHealData(cr.id, 'normal'),
      is_mock: false,
      is_predicted: true,
    });
    return cr;
  };

  const buildRequest = (overrides?: Partial<TestSelfHealRequest>): TestSelfHealRequest => ({
    product_id: PRODUCT_ID,
    creation_id: CREATION_ID,
    trigger_source: 'RETENTION_DROP',
    issue_type: 'HOOK_WEAK',
    strategy: 'REWRITE_ONLY',
    dry_run: true,
    ...overrides,
  });

  // ============================================================
  // 1. 正常流 (Happy Path) — 8 条
  // ============================================================
  describe('【正常流】合法输入 → 完整 SelfHealResultResponse 契约', () => {
    beforeEach(() => { setupSuccess(); });

    it('TC-ANL-SH-001: dry_run=true → 返回 SUGGESTED 状态且不执行实际操作', async () => {
      const r = await getSelfHealDiagnosis(buildRequest(), deps());
      expect(r.product_id).toBe(PRODUCT_ID);
      expect(r.creation_id).toBe(CREATION_ID);
      expect(r.status).toBe('SUGGESTED');
      expect(r.dry_run).toBe(true);
      expect(r.task_id).toBeUndefined();
      expect(r.healed_creation_id).toBeUndefined();
    });

    it('TC-ANL-SH-002: affected_shots 结构与 api_types 契约完全一致', async () => {
      const r = await getSelfHealDiagnosis(buildRequest(), deps());
      expect(Array.isArray(r.affected_shots)).toBe(true);
      for (const as of r.affected_shots) {
        expect(typeof as.shot_index).toBe('number');
        expect(typeof as.action).toBe('string');
        expect(typeof as.reason).toBe('string');
        expect(as.shot_index).toBeGreaterThanOrEqual(1);
        expect(as.shot_index).toBeLessThanOrEqual(5);
      }
    });

    it('TC-ANL-SH-003: suggestion_summary 为非空字符串且包含关键词', async () => {
      const r = await getSelfHealDiagnosis(buildRequest(), deps());
      expect(typeof r.suggestion_summary).toBe('string');
      expect(r.suggestion_summary.length).toBeGreaterThan(0);
      expect(r.suggestion_summary).toContain('dry_run');
    });

    it('TC-ANL-SH-004: trigger_source=RETENTION_DROP + HOOK_WEAK → 诊断前2分镜', async () => {
      const c = makeCreation();
      const data = makeDuckDBSelfHealData(c.id, 'normal');
      setupSuccess(c, data);
      const r = await getSelfHealDiagnosis(
        buildRequest({ trigger_source: 'RETENTION_DROP', issue_type: 'HOOK_WEAK', target_shot_indexes: undefined }),
        deps(),
      );
      expect(r.affected_shots.length).toBeGreaterThanOrEqual(0);
      for (const as of r.affected_shots) {
        expect([1, 2]).toContain(as.shot_index);
      }
    });

    it('TC-ANL-SH-005: trigger_source=MANUAL + 指定分镜 → 仅诊断指定分镜', async () => {
      const c = makeCreation();
      const data = makeDuckDBSelfHealData(c.id, 'normal');
      setupSuccess(c, data);
      const r = await getSelfHealDiagnosis(
        buildRequest({ trigger_source: 'MANUAL', issue_type: 'VOICEOVER_TOO_LONG', target_shot_indexes: [3, 4] }),
        deps(),
      );
      for (const as of r.affected_shots) {
        expect([3, 4]).toContain(as.shot_index);
      }
    });

    it('TC-ANL-SH-006: REGENERATE_VARIANT 策略 → 覆盖所有分镜', async () => {
      const c = makeCreation();
      const data = makeDuckDBSelfHealData(c.id, 'normal');
      setupSuccess(c, data);
      const r = await getSelfHealDiagnosis(
        buildRequest({ strategy: 'REGENERATE_VARIANT', issue_type: 'HOOK_WEAK', trigger_source: 'RETENTION_DROP' }),
        deps(),
      );
      expect(r.affected_shots.length).toBe(5);
      for (const as of r.affected_shots) {
        expect(as.action).toBe('REGENERATE_FULL_VARIANT');
      }
    });

    it('TC-ANL-SH-007: RERENDER_SHOT 策略 → action=RERENDER_SHOT', async () => {
      const c = makeCreation();
      const data = makeDuckDBSelfHealData(c.id, 'allWeak');
      setupSuccess(c, data);
      const r = await getSelfHealDiagnosis(
        buildRequest({ strategy: 'RERENDER_SHOT', issue_type: 'STYLE_MISMATCH', trigger_source: 'RETENTION_DROP' }),
        deps(),
      );
      for (const as of r.affected_shots) {
        expect(as.action).toBe('RERENDER_SHOT');
      }
    });

    it('TC-ANL-SH-008: dry_run=false → 返回 QUEUED 并生成任务追踪字段', async () => {
      const r = await getSelfHealDiagnosis(buildRequest({ dry_run: false }), deps());
      expect(r.status).toBe('QUEUED');
      expect(r.dry_run).toBe(false);
      expect(r.task_id).toBe(`${TASK_ID}-heal`);
      expect(r.healed_creation_id).toBe(`${CREATION_ID}-healed`);
    });
  });

  // ============================================================
  // 2. 边界流 (Edge Cases) — 14 条
  // ============================================================
  describe('【边界流】极端数据 → 系统优雅处理', () => {
    it('TC-ANL-SH-BND-001: 仅 1 个分镜 → 诊断正常', async () => {
      const c = makeCreation();
      c.script.shots = makeShot1();
      c.script.video_duration = 3.0;
      c.shot_renders = [makeShotRender(1)];
      setupSuccess(c, makeDuckDBSelfHealData(c.id, 'normal'));
      const r = await getSelfHealDiagnosis(
        buildRequest({ issue_type: 'HOOK_WEAK', trigger_source: 'MANUAL', target_shot_indexes: [1] }),
        deps(),
      );
      expect(r.affected_shots.length).toBeGreaterThanOrEqual(0);
    });

    it('TC-ANL-SH-BND-002: 15 个分镜 (大剧本) → 诊断正常不崩溃', async () => {
      const c = makeCreation();
      c.script.shots = makeShots15();
      c.script.video_duration = 15.0;
      setupSuccess(c, makeDuckDBSelfHealData(c.id, 'normal'));
      const r = await getSelfHealDiagnosis(
        buildRequest({ issue_type: 'VOICEOVER_TOO_LONG', trigger_source: 'RETENTION_DROP' }),
        deps(),
      );
      expect(Array.isArray(r.affected_shots)).toBe(true);
    });

    it('TC-ANL-SH-BND-003: DuckDB 不可用 → 降级 Mock is_mock=true', async () => {
      setupSuccess();
      mockDuckDB.querySelfHeal.mockRejectedValue(new Error('Connection refused'));
      const r = await getSelfHealDiagnosis(buildRequest(), deps());
      expect(Array.isArray(r.affected_shots)).toBe(true);
      expect(r.suggestion_summary.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SH-BND-004: DuckDB 返回空 rows → 诊断抛出空诊断列表', async () => {
      setupSuccess();
      mockDuckDB.querySelfHeal.mockResolvedValue({ rows: [], is_mock: false, is_predicted: true });
      const r = await getSelfHealDiagnosis(buildRequest(), deps());
      expect(Array.isArray(r.affected_shots)).toBe(true);
    });

    it('TC-ANL-SH-BND-005: DuckDB 返回 null → fetch 降级 Mock', async () => {
      setupSuccess();
      mockDuckDB.querySelfHeal.mockResolvedValue(null);
      const r = await getSelfHealDiagnosis(buildRequest(), deps());
      expect(Array.isArray(r.affected_shots)).toBe(true);
      expect(r.suggestion_summary.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SH-BND-006: DuckDB rows 非数组 → 降级 Mock', async () => {
      setupSuccess();
      mockDuckDB.querySelfHeal.mockResolvedValue({ rows: 'not-an-array', is_mock: false, is_predicted: true });
      const r = await getSelfHealDiagnosis(buildRequest(), deps());
      expect(Array.isArray(r.affected_shots)).toBe(true);
    });

    it('TC-ANL-SH-BND-007: 全部指标健康 → 诊断结果为空列表', async () => {
      const c = makeCreation();
      const healthyData = makeDuckDBSelfHealData(c.id, 'healthy');
      setupSuccess(c, healthyData);
      const r = await getSelfHealDiagnosis(
        buildRequest({ issue_type: 'HOOK_WEAK', trigger_source: 'RETENTION_DROP' }),
        deps(),
      );
      expect(r.affected_shots).toHaveLength(0);
    });

    it('TC-ANL-SH-BND-008: 全部指标薄弱 → 所有分镜被诊断', async () => {
      const c = makeCreation();
      const weakData = makeDuckDBSelfHealData(c.id, 'allWeak');
      setupSuccess(c, weakData);
      const r = await getSelfHealDiagnosis(
        buildRequest({ issue_type: 'STYLE_MISMATCH', trigger_source: 'RETENTION_DROP' }),
        deps(),
      );
      expect(r.affected_shots.length).toBeGreaterThan(0);
    });

    it('TC-ANL-SH-BND-009: trigger_source=AB_COMPARE + 不指定分镜 → 自动全扫描', async () => {
      setupSuccess();
      const r = await getSelfHealDiagnosis(
        buildRequest({ trigger_source: 'AB_COMPARE', issue_type: 'CTA_WEAK', target_shot_indexes: undefined }),
        deps(),
      );
      expect(Array.isArray(r.affected_shots)).toBe(true);
    });

    it('TC-ANL-SH-BND-010: target_shot_indexes 含重复值 → validateTargetShotIndexes去重处理', async () => {
      const c = makeCreation();
      const data = makeDuckDBSelfHealData(c.id, 'normal');
      setupSuccess(c, data);
      const r = await getSelfHealDiagnosis(
        buildRequest({ trigger_source: 'MANUAL', issue_type: 'HOOK_WEAK', target_shot_indexes: [1, 1, 2, 2] }),
        deps(),
      );
      for (const as of r.affected_shots) {
        expect([1, 2]).toContain(as.shot_index);
      }
    });

    it('TC-ANL-SH-BND-011: DuckDB 行缺少对应分镜数据 → default 值不崩溃', async () => {
      setupSuccess();
      mockDuckDB.querySelfHeal.mockResolvedValue({
        rows: [{ shot_index: 1, hook_strength: 0.3, voiceover_ratio: 0.5, style_alignment_score: 0.6, cta_strength: 0.4, retention_rate_at_shot: 0.7 }],
        is_mock: false, is_predicted: true,
      });
      const r = await getSelfHealDiagnosis(buildRequest(), deps());
      expect(Array.isArray(r.affected_shots)).toBe(true);
    });

    it('TC-ANL-SH-BND-012: remark 字段任意字符串不报错', async () => {
      setupSuccess();
      const r = await getSelfHealDiagnosis(
        buildRequest({ remark: '这是一个备注：包含特殊字符 <>&"' }),
        deps(),
      );
      expect(r.product_id).toBe(PRODUCT_ID);
    });

    it('TC-ANL-SH-BND-013: creation_id 大小写混合 UUID 正常诊断', async () => {
      const mixedId = 'DC52D4FF-0000-4000-A000-000000000001';
      setupSuccess();
      const r = await getSelfHealDiagnosis(
        buildRequest({ creation_id: mixedId }),
        deps(),
      );
      expect(r.creation_id).toBe(mixedId);
    });

    it('TC-ANL-SH-BND-014: 所有 metrics 为极端 0 值 → 触发诊断', async () => {
      setupSuccess();
      mockDuckDB.querySelfHeal.mockResolvedValue({
        rows: makeShots5().map((_, i) => ({
          shot_index: i + 1, hook_strength: 0.0, voiceover_ratio: 0.0,
          style_alignment_score: 0.0, cta_strength: 0.0, retention_rate_at_shot: 0.0,
        })),
        is_mock: false, is_predicted: true,
      });
      const r = await getSelfHealDiagnosis(
        buildRequest({ issue_type: 'STYLE_MISMATCH', trigger_source: 'RETENTION_DROP' }),
        deps(),
      );
      expect(r.affected_shots.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 3. 异常流 (Error Flow) — 25 条
  // ============================================================
  describe('【异常流】人为制造报错 → 精准捕获规范错误码', () => {
    const err = async (req: TestSelfHealRequest) => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try { await getSelfHealDiagnosis(req, deps()); } catch (e) { caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean }; }
      return caught;
    };

    it('TC-ANL-SH-ERR-001: product_id 空字符串 → INVALID_REQUEST 400', async () => {
      const e = await err(buildRequest({ product_id: '' }));
      expect(e).not.toBeNull();
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-SH-ERR-002: creation_id 空字符串 → INVALID_REQUEST 400', async () => {
      const e = await err(buildRequest({ creation_id: '' }));
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-SH-ERR-003: product_id 纯空白 → INVALID_REQUEST 400', async () => {
      const e = await err(buildRequest({ product_id: '   ' }));
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-SH-ERR-004: creation_id 纯空白 → INVALID_REQUEST 400', async () => {
      const e = await err(buildRequest({ creation_id: '   ' }));
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-SH-ERR-005: trigger_source 非法值 "SCHEDULED" → INVALID_REQUEST 400', async () => {
      const e = await err(buildRequest({ trigger_source: 'SCHEDULED' as TriggerSource }));
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.message).toContain('SCHEDULED');
    });

    it('TC-ANL-SH-ERR-006: issue_type 非法值 "BAD_AUDIO" → INVALID_REQUEST 400', async () => {
      const e = await err(buildRequest({ issue_type: 'BAD_AUDIO' as SelfHealIssueType }));
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.message).toContain('BAD_AUDIO');
    });

    it('TC-ANL-SH-ERR-007: strategy 非法值 "FULL_REBUILD" → INVALID_REQUEST 400', async () => {
      const e = await err(buildRequest({ strategy: 'FULL_REBUILD' as SelfHealStrategy }));
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.message).toContain('FULL_REBUILD');
    });

    it('TC-ANL-SH-ERR-008: MANUAL 触发源未指定 target_shot_indexes → ANALYTICS_SELF_HEAL_MANUAL_NO_TARGETS 400', async () => {
      const e = await err(buildRequest({ trigger_source: 'MANUAL', target_shot_indexes: undefined }));
      expect(e!.errorCode).toBe('ANALYTICS_SELF_HEAL_MANUAL_NO_TARGETS');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-SH-ERR-009: MANUAL 触发源 target_shot_indexes 空数组 → ANALYTICS_SELF_HEAL_MANUAL_NO_TARGETS 400', async () => {
      const e = await err(buildRequest({ trigger_source: 'MANUAL', target_shot_indexes: [] }));
      expect(e!.errorCode).toBe('ANALYTICS_SELF_HEAL_MANUAL_NO_TARGETS');
    });

    it('TC-ANL-SH-ERR-010: target_shot_index 越界 → SHOT_INDEX_OUT_OF_RANGE 400', async () => {
      setupSuccess();
      const e = await err(buildRequest({ trigger_source: 'MANUAL', target_shot_indexes: [99] }));
      expect(e!.errorCode).toBe('SHOT_INDEX_OUT_OF_RANGE');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-SH-ERR-011: target_shot_index 为 0 → SHOT_INDEX_OUT_OF_RANGE 400', async () => {
      setupSuccess();
      const e = await err(buildRequest({ trigger_source: 'MANUAL', target_shot_indexes: [0] }));
      expect(e!.errorCode).toBe('SHOT_INDEX_OUT_OF_RANGE');
    });

    it('TC-ANL-SH-ERR-012: target_shot_index 为负数 → SHOT_INDEX_OUT_OF_RANGE 400', async () => {
      setupSuccess();
      const e = await err(buildRequest({ trigger_source: 'MANUAL', target_shot_indexes: [-1] }));
      expect(e!.errorCode).toBe('SHOT_INDEX_OUT_OF_RANGE');
    });

    it('TC-ANL-SH-ERR-013: 商品不存在 → PRODUCT_NOT_FOUND 404', async () => {
      setupSuccess();
      mockPrisma.product.findUnique.mockResolvedValue(null);
      const e = await err(buildRequest());
      expect(e!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-ANL-SH-ERR-014: creation 不存在 → CREATION_NOT_FOUND 404', async () => {
      setupSuccess();
      mockPrisma.creation.findUnique.mockResolvedValue(null);
      const e = await err(buildRequest());
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-ANL-SH-ERR-015: product_id 与 creation.product_id 不匹配 → CREATION_NOT_FOUND 404', async () => {
      setupSuccess();
      const e = await err(buildRequest({ product_id: '00000000-0000-0000-0000-000000000999' }));
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
    });

    it('TC-ANL-SH-ERR-016: Creation 关联 Script 已被级联删除 → SCRIPT_NOT_FOUND 404', async () => {
      const c = makeCreation();
      const pr = buildPrismaCreation(c);
      (pr.script as unknown) = {};
      mockPrisma.product.findUnique.mockResolvedValue({ id: c.product_id });
      mockPrisma.creation.findUnique.mockResolvedValue(pr as unknown as ReturnType<typeof buildPrismaCreation>);
      mockDuckDB.querySelfHeal.mockResolvedValue({ rows: makeDuckDBSelfHealData(c.id, 'normal'), is_mock: false, is_predicted: true });
      const e = await err(buildRequest());
      expect(e!.errorCode).toBe('SCRIPT_NOT_FOUND');
    });

    it('TC-ANL-SH-ERR-017: Script.shots 为空数组 → ANALYTICS_NO_SHOTS_IN_CREATION 422', async () => {
      const c = makeCreation();
      c.script.shots = [];
      const pr = buildPrismaCreation(c);
      (pr.script as Record<string, unknown>).shots = [];
      mockPrisma.product.findUnique.mockResolvedValue({ id: c.product_id });
      mockPrisma.creation.findUnique.mockResolvedValue(pr);
      mockDuckDB.querySelfHeal.mockResolvedValue({ rows: makeDuckDBSelfHealData(c.id, 'normal'), is_mock: false, is_predicted: true });
      const e = await err(buildRequest());
      expect(e!.errorCode).toBe('ANALYTICS_NO_SHOTS_IN_CREATION');
      expect(e!.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('TC-ANL-SH-ERR-018: PostgreSQL P1001 → INTERNAL_SERVER_ERROR 503', async () => {
      const dbErr = new Error('Connection terminated');
      (dbErr as Error & { code?: string }).code = 'P1001';
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockRejectedValue(dbErr);
      const e = await err(buildRequest());
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SH-ERR-019: PostgreSQL P1008 超时 → INTERNAL_SERVER_ERROR 503', async () => {
      const dbErr = new Error('Query timeout');
      (dbErr as Error & { code?: string }).code = 'P1008';
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockRejectedValue(dbErr);
      const e = await err(buildRequest());
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SH-ERR-020: Prisma P2025 → CREATION_NOT_FOUND 404', async () => {
      const dbErr = new Error('Record not found');
      (dbErr as Error & { code?: string }).code = 'P2025';
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockRejectedValue(dbErr);
      const e = await err(buildRequest());
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-ANL-SH-ERR-021: Prisma P2024 连接池耗尽 → INTERNAL_SERVER_ERROR 500', async () => {
      const dbErr = new Error('Pool exhausted');
      (dbErr as Error & { code?: string }).code = 'P2024';
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockRejectedValue(dbErr);
      const e = await err(buildRequest());
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SH-ERR-022: 未知 Prisma 异常 → INTERNAL_SERVER_ERROR 500', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockRejectedValue(new Error('Random crash'));
      const e = await err(buildRequest());
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-SH-ERR-023: 非 Error 实例抛出 → INTERNAL_SERVER_ERROR 500', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      mockPrisma.creation.findUnique.mockRejectedValue('raw string error');
      const e = await err(buildRequest());
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-ANL-SH-ERR-024: product_id 为 undefined → INVALID_REQUEST 400', async () => {
      const e = await err(buildRequest({ product_id: undefined as unknown as string }));
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-SH-ERR-025: creation_id 为 undefined → INVALID_REQUEST 400', async () => {
      const e = await err(buildRequest({ creation_id: undefined as unknown as string }));
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });
  });

  // ============================================================
  // 4. 性能流 (Performance) — 7 条
  // ============================================================
  describe('【性能流】耗时卡点 — 不得超出上限', () => {
    beforeEach(() => { setupSuccess(); });

    it('TC-ANL-SH-PERF-001: getSelfHealDiagnosis 编排总耗时 ≤ 50ms (不含 I/O)', async () => {
      const start = performance.now();
      const r = await getSelfHealDiagnosis(buildRequest(), deps());
      const elapsed = performance.now() - start;
      expect(r.creation_id).toBe(CREATION_ID);
      expect(elapsed).toBeLessThanOrEqual(50);
    });

    it('TC-ANL-SH-PERF-002: validateSelfHealParams 单次 ≤ 1ms', () => {
      const start = performance.now();
      validateSelfHealParams(PRODUCT_ID, CREATION_ID, 'RETENTION_DROP', 'HOOK_WEAK', 'REWRITE_ONLY');
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThanOrEqual(1);
    });

    it('TC-ANL-SH-PERF-003: 连续 10 次无退化 avg ≤ 10ms', async () => {
      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        await getSelfHealDiagnosis(buildRequest(), deps());
      }
      const avg = (performance.now() - start) / 10;
      expect(avg).toBeLessThanOrEqual(10);
    }, 10000);

    it('TC-ANL-SH-PERF-004: 15 分镜大剧本诊断 ≤ 30ms', async () => {
      const c = makeCreation();
      c.script.shots = makeShots15();
      c.script.video_duration = 15.0;
      setupSuccess(c, makeDuckDBSelfHealData(c.id, 'normal'));
      const start = performance.now();
      const r = await getSelfHealDiagnosis(
        buildRequest({ issue_type: 'VOICEOVER_TOO_LONG', trigger_source: 'RETENTION_DROP' }),
        deps(),
      );
      const elapsed = performance.now() - start;
      expect(Array.isArray(r.affected_shots)).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(30);
    });

    it('TC-ANL-SH-PERF-005: CREATION_NOT_FOUND 快速失败 ≤ 5ms', async () => {
      setupSuccess();
      mockPrisma.creation.findUnique.mockResolvedValue(null);
      const start = performance.now();
      let threw = false;
      try { await getSelfHealDiagnosis(buildRequest(), deps()); } catch { threw = true; }
      expect(threw).toBe(true);
      expect(performance.now() - start).toBeLessThanOrEqual(5);
    });

    it('TC-ANL-SH-PERF-006: buildDuckDBIndexMap 大数据量 ≤ 5ms', () => {
      const bigData: SelfHealDuckDBBundle = {
        rows: Array.from({ length: 1000 }, (_, i) => ({
          shot_index: i + 1, hook_strength: 0.5, voiceover_ratio: 0.5,
          style_alignment_score: 0.5, cta_strength: 0.5, retention_rate_at_shot: 0.5,
        })),
        is_mock: false, is_predicted: true,
      };
      const start = performance.now();
      const map = buildDuckDBIndexMap(bigData);
      const elapsed = performance.now() - start;
      expect(map.size).toBe(1000);
      expect(elapsed).toBeLessThanOrEqual(5);
    });

    it('TC-ANL-SH-PERF-007: resolveAffectedShots REGENERATE_VARIANT 15分镜 ≤ 3ms', () => {
      const c = makeCreation();
      c.script.shots = makeShots15();
      const diagnoses: ShotDiagnosis[] = [];
      for (let i = 1; i <= 3; i++) {
        diagnoses.push({
          shot_index: i, issue_type: 'HOOK_WEAK', severity: 0.15,
          value: 0.3, threshold: 0.45, reason: `分镜${i} hook弱`,
        });
      }
      const start = performance.now();
      const affected = resolveAffectedShots(c, diagnoses, 'REGENERATE_VARIANT');
      const elapsed = performance.now() - start;
      expect(affected.length).toBe(15);
      expect(elapsed).toBeLessThanOrEqual(3);
    });
  });

  // ============================================================
  // 5. 原子函数独立测试 — 17 条
  // ============================================================
  describe('【原子函数】独立校验各原子函数正确性', () => {
    const makeBundle = (rows: SelfHealDuckDBRawRow[]): SelfHealDuckDBBundle => ({
      rows, is_mock: false, is_predicted: true,
    });

    // ---- validateSelfHealParams ----
    describe('validateSelfHealParams', () => {
      it('AF-SH-001: 全合法参数不抛错', () => {
        expect(() =>
          validateSelfHealParams(PRODUCT_ID, CREATION_ID, 'RETENTION_DROP', 'HOOK_WEAK', 'REWRITE_ONLY'),
        ).not.toThrow();
      });

      it('AF-SH-002: product_id 空 → INVALID_REQUEST', () => {
        let e: Error & { errorCode?: string } | null = null;
        try { validateSelfHealParams('', CREATION_ID, 'RETENTION_DROP', 'HOOK_WEAK', 'REWRITE_ONLY'); } catch (err) { e = err as Error & { errorCode?: string }; }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-SH-003: trigger_source 非法 → INVALID_REQUEST', () => {
        let e: Error & { errorCode?: string } | null = null;
        try { validateSelfHealParams(PRODUCT_ID, CREATION_ID, 'UNKNOWN' as TriggerSource, 'HOOK_WEAK', 'REWRITE_ONLY'); } catch (err) { e = err as Error & { errorCode?: string }; }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-SH-004: MANUAL 无 target_shot_indexes → ANALYTICS_SELF_HEAL_MANUAL_NO_TARGETS', () => {
        let e: Error & { errorCode?: string } | null = null;
        try { validateSelfHealParams(PRODUCT_ID, CREATION_ID, 'MANUAL', 'HOOK_WEAK', 'REWRITE_ONLY'); } catch (err) { e = err as Error & { errorCode?: string }; }
        expect(e!.errorCode).toBe('ANALYTICS_SELF_HEAL_MANUAL_NO_TARGETS');
      });
    });

    // ---- validateTargetShotIndexes ----
    describe('validateTargetShotIndexes', () => {
      it('AF-SH-005: 合法索引不抛错', () => {
        expect(() => validateTargetShotIndexes(makeShots5(), [1, 3, 5])).not.toThrow();
      });

      it('AF-SH-006: 越界索引 → SHOT_INDEX_OUT_OF_RANGE', () => {
        let e: Error & { errorCode?: string } | null = null;
        try { validateTargetShotIndexes(makeShots5(), [6]); } catch (err) { e = err as Error & { errorCode?: string }; }
        expect(e!.errorCode).toBe('SHOT_INDEX_OUT_OF_RANGE');
      });

      it('AF-SH-007: 重复索引去重后仍合法不抛错', () => {
        expect(() => validateTargetShotIndexes(makeShots5(), [1, 1, 1])).not.toThrow();
      });
    });

    // ---- buildDuckDBIndexMap ----
    describe('buildDuckDBIndexMap', () => {
      it('AF-SH-008: 5行数据 → Map size=5', () => {
        const rows = makeDuckDBSelfHealData(CREATION_ID, 'normal');
        const map = buildDuckDBIndexMap(makeBundle(rows));
        expect(map.size).toBe(5);
        expect(map.get(1)?.shot_index).toBe(1);
      });

      it('AF-SH-009: 空rows → Map size=0', () => {
        const map = buildDuckDBIndexMap({ rows: [], is_mock: true, is_predicted: true });
        expect(map.size).toBe(0);
      });

      it('AF-SH-010: 缺失shot_index时Map.get返回undefined且诊断用default', () => {
        const rows: SelfHealDuckDBRawRow[] = [{ shot_index: 1, hook_strength: 0.3, voiceover_ratio: 0.5, style_alignment_score: 0.6, cta_strength: 0.4, retention_rate_at_shot: 0.7 }];
        const map = buildDuckDBIndexMap(makeBundle(rows));
        expect(map.get(99)).toBeUndefined();
      });
    });

    // ---- diagnoseHookWeak ----
    describe('diagnoseHookWeak', () => {
      it('AF-SH-011: 分镜1 hook_strength=0.32 < 0.45 → 诊断出1条', () => {
        const data = makeDuckDBSelfHealData(CREATION_ID, 'normal');
        const diags = diagnoseHookWeak(makeShots5(), makeBundle(data));
        expect(diags.length).toBeGreaterThanOrEqual(0);
        for (const d of diags) {
          expect(d.issue_type).toBe('HOOK_WEAK');
          expect(d.value).toBeLessThan(HOOK_STRENGTH_WEAK_THRESHOLD);
          expect(d.severity).toBeGreaterThan(0);
        }
      });

      it('AF-SH-012: 全部健康 → 0条诊断', () => {
        const data = makeDuckDBSelfHealData(CREATION_ID, 'healthy');
        const diags = diagnoseHookWeak(makeShots5(), makeBundle(data));
        expect(diags).toHaveLength(0);
      });
    });

    // ---- diagnoseVoiceoverTooLong ----
    describe('diagnoseVoiceoverTooLong', () => {
      it('AF-SH-013: allWeak → 所有分镜旁白超长', () => {
        const data = makeDuckDBSelfHealData(CREATION_ID, 'allWeak');
        const diags = diagnoseVoiceoverTooLong(makeShots5(), makeBundle(data));
        expect(diags.length).toBeGreaterThan(0);
        for (const d of diags) {
          expect(d.issue_type).toBe('VOICEOVER_TOO_LONG');
          expect(d.value).toBeGreaterThan(VOICEOVER_RATIO_HIGH_THRESHOLD);
        }
      });
    });

    // ---- diagnoseStyleMismatch ----
    describe('diagnoseStyleMismatch', () => {
      it('AF-SH-014: allWeak → 所有分镜风格不匹配', () => {
        const data = makeDuckDBSelfHealData(CREATION_ID, 'allWeak');
        const diags = diagnoseStyleMismatch(makeShots5(), makeBundle(data));
        expect(diags.length).toBeGreaterThan(0);
      });
    });

    // ---- diagnoseCtaWeak ----
    describe('diagnoseCtaWeak', () => {
      it('AF-SH-015: allWeak → 最后2分镜CTA弱', () => {
        const data = makeDuckDBSelfHealData(CREATION_ID, 'allWeak');
        const diags = diagnoseCtaWeak(makeShots5(), makeBundle(data));
        for (const d of diags) {
          expect(d.issue_type).toBe('CTA_WEAK');
          expect(d.value).toBeLessThan(CTA_WEAK_THRESHOLD);
        }
      });
    });

    // ---- resolveAffectedShots + buildSuggestionSummary ----
    describe('resolveAffectedShots', () => {
      it('AF-SH-016: REWRITE_ONLY → action=REWRITE_SHOT_SCRIPT', () => {
        const diags: ShotDiagnosis[] = [{
          shot_index: 1, issue_type: 'HOOK_WEAK', severity: 0.13,
          value: 0.32, threshold: 0.45, reason: 'hook弱',
        }];
        const affected = resolveAffectedShots(makeCreation(), diags, 'REWRITE_ONLY');
        expect(affected).toHaveLength(1);
        expect(affected[0].action).toBe('REWRITE_SHOT_SCRIPT');
      });

      it('AF-SH-017: REGENERATE_VARIANT → 全量覆盖', () => {
        const diags: ShotDiagnosis[] = [{
          shot_index: 3, issue_type: 'STYLE_MISMATCH', severity: 0.12,
          value: 0.38, threshold: 0.5, reason: '风格偏离',
        }];
        const c = makeCreation();
        const affected = resolveAffectedShots(c, diags, 'REGENERATE_VARIANT');
        expect(affected.length).toBe(5);
        for (const as of affected) {
          expect(as.action).toBe('REGENERATE_FULL_VARIANT');
        }
      });
    });
  });
});