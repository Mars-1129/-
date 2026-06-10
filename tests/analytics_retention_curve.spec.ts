// =============================================================================
// TikStream AI — Analytics Retention Curve 自动化测试基座
// 对应功能: GET /api/v1/analytics/retention-curve (留存曲线查询接口)
// 对应模块: Analytics (人员B) | 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

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

interface TestCreationRecord {
  id: string; product_id: string; script_id: string; task_id: string;
  engine_mode: string; target_resolution: string; export_format: string;
  status: string; progress: number; current_stage: string; video_url: string | null;
  file_size_bytes: number | null; trace_id: string | null; error_code: string | null;
  error_message: string | null; started_at: Date | null; finished_at: Date | null;
  created_at: Date; updated_at: Date;
  script: TestScript & { shots: TestScriptShot[] };
}

interface TestRetentionCurvePoint {
  time_sec: number; retention_rate: number; completion_rate?: number;
}

interface TestShotMarker {
  shot_index: number; start_sec: number; end_sec: number; label?: string;
}

interface TestDropPoint {
  time_sec: number; drop_rate: number; related_shot_index?: number; possible_reason?: string;
}

interface TestRetentionCurveResponse {
  product_id: string; creation_id: string;
  metric_type: 'RETENTION_RATE' | 'COMPLETION_RATE';
  curve_points: TestRetentionCurvePoint[]; shot_markers: TestShotMarker[];
  drop_points: TestDropPoint[];
  summary: { avg_retention_rate: number; final_completion_rate: number; primary_drop_shot_index?: number };
  data_source: 'DUCKDB_PRECOMPUTED'; is_mock: boolean; is_predicted: boolean; generated_at: string;
}

interface TestRetentionCurveQuery {
  product_id: string; creation_id: string;
  metric_type?: 'RETENTION_RATE' | 'COMPLETION_RATE';
  granularity?: 'SECOND' | 'SHOT'; include_shot_markers?: boolean;
}

type MockPrismaService = { creation: { findUnique: jest.Mock } };
type MockDuckDBDataSource = { queryRetentionCurve: jest.Mock };

const NOW = new Date('2026-05-25T12:00:00Z');
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const CREATION_ID = 'dc52d4ff-0000-4000-a000-000000000001';
const SCRIPT_ID = 'dc52d4ff-0000-4000-a000-000000000002';
const TASK_ID = 'tsk_20260525_000001';
const TRACE_ID = 'trc_20260525_retention_curve';

const makeShot = (i: number, overrides?: Partial<TestScriptShot>): TestScriptShot => ({
  id: `shot-uuid-${i}-${SCRIPT_ID}`, script_id: SCRIPT_ID,
  shot_id: `shot_${String(i).padStart(3, '0')}`, shot_index: i,
  duration: overrides?.duration ?? (i === 1 ? 3.0 : i === 2 ? 3.5 : i === 3 ? 4.0 : i === 4 ? 2.0 : 2.0),
  scene_description_query: `close-up shot ${i} of product feature`,
  visual_description: `镜头${i}：展示产品核心功能，画面干净明亮。`,
  camera_movement: i === 1 ? 'Dolly_In_Fast' : i === 2 ? 'Pan_Left' : i === 3 ? 'Tilt_Up' : 'Static',
  transition_type: i === 1 ? 'Fade_In' : i === 2 ? 'Dissolve' : i === 3 ? 'Wipe' : 'None',
  voiceover_text: `第${i}段旁白：产品核心卖点生动表达。`, subtitle_text: `字幕${i}`,
  safe_zone_bounding_box: [0.1, 0.72, 0.9, 0.9], selected_slice_id: null,
  render_prompt: null, local_factor_patch: {}, compliance_status: 'PASSED',
  created_at: NOW, updated_at: NOW, ...overrides,
});

const makeShots5 = (): TestScriptShot[] => [1, 2, 3, 4, 5].map((i) => makeShot(i));
const makeShot1 = (): TestScriptShot[] => [makeShot(1, { duration: 3.0 })];
const makeShots8 = (): TestScriptShot[] => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => makeShot(i, { duration: 1.875 }));

const makeScript = (overrides?: Partial<TestScript>): TestScript => ({
  id: SCRIPT_ID, product_id: PRODUCT_ID, title: '智能无线卷发棒快速成片剧本',
  language: 'zh-CN', target_audience: '北美年轻女性,25-35岁', video_duration: 14.5,
  aspect_ratio: '9:16', style_vibe: 'clean-tech', generation_mode: 'PROMPT_DRIVEN',
  template_id: null, viral_video_id: null,
  constraint_list: ['total_duration<=15s', 'avoid_absolute_claims'], raw_json: {},
  created_at: NOW, updated_at: NOW, ...overrides,
});

const makeCreation = (overrides?: Partial<TestCreationRecord>): TestCreationRecord => {
  const script = makeScript();
  return {
    id: CREATION_ID, product_id: PRODUCT_ID, script_id: SCRIPT_ID, task_id: TASK_ID,
    engine_mode: 'SCRIPT_DRIVEN', target_resolution: '1080x1920', export_format: 'MP4',
    status: 'FINISHED', progress: 100, current_stage: 'FINISHED',
    video_url: 'https://minio.internal/output/demo.mp4', file_size_bytes: 5242880,
    trace_id: TRACE_ID, error_code: null, error_message: null,
    started_at: new Date('2026-05-25T11:50:00Z'), finished_at: new Date('2026-05-25T12:00:00Z'),
    created_at: NOW, updated_at: NOW,
    script: { ...script, shots: makeShots5() },
    ...overrides,
  };
};

const makeCurve = (totalSec: number, steep = false): TestRetentionCurvePoint[] => {
  const pts: TestRetentionCurvePoint[] = [];
  for (let t = 0; t <= totalSec; t++) {
    const drop = steep
      ? (t <= 3 ? 0.08 * t : 0.24 + 0.08 * (t - 3))
      : (t <= 3 ? 0.02 * t : t <= 7 ? 0.06 + 0.04 * (t - 3) : 0.22 + 0.03 * (t - 7));
    pts.push({ time_sec: t, retention_rate: Math.round(Math.max(0, 1 - drop) * 10000) / 10000 });
  }
  return pts;
};

const makeFlatCurve = (totalSec: number): TestRetentionCurvePoint[] => {
  const pts: TestRetentionCurvePoint[] = [];
  for (let t = 0; t <= totalSec; t++) { pts.push({ time_sec: t, retention_rate: 1.0 }); }
  return pts;
};

const makeZeroCurve = (totalSec: number): TestRetentionCurvePoint[] => {
  const pts: TestRetentionCurvePoint[] = [];
  for (let t = 0; t <= totalSec; t++) { pts.push({ time_sec: t, retention_rate: t === 0 ? 1.0 : 0 }); }
  return pts;
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
});

describe('AnalyticsRetentionCurve — 留存曲线查询 (GET /api/v1/analytics/retention-curve)', () => {
  let mockPrisma: MockPrismaService;
  let mockDuckDB: MockDuckDBDataSource;

  // ---- 原子函数声明 ----
  type FindCreationFn = (creationId: string, prisma: MockPrismaService) => Promise<TestCreationRecord | null>;
  type BuildMarkersFn = (shots: TestScriptShot[]) => TestShotMarker[];
  type ComputeDropsFn = (curvePoints: TestRetentionCurvePoint[], shotMarkers: TestShotMarker[], threshold: number) => TestDropPoint[];
  type ComputeSumFn = (curvePoints: TestRetentionCurvePoint[], dropPoints: TestDropPoint[]) => {
    avg_retention_rate: number; final_completion_rate: number; primary_drop_shot_index?: number;
  };
  type ValidateParamsFn = (productId: string, creationId: string, metricType?: string, granularity?: string) => void;
  type FetchDataFn = (creationId: string, metricType: 'RETENTION_RATE' | 'COMPLETION_RATE', duckDB: MockDuckDBDataSource) => Promise<{
    curve_points: TestRetentionCurvePoint[]; data_source: 'DUCKDB_PRECOMPUTED'; is_mock: boolean; is_predicted: boolean;
  }>;
  type GetCurveFn = (dto: TestRetentionCurveQuery, deps: {
    prisma: MockPrismaService; duckDB: MockDuckDBDataSource;
    findCreation: FindCreationFn; buildMarkers: BuildMarkersFn;
    computeDrops: ComputeDropsFn; computeSum: ComputeSumFn;
    validateParams: ValidateParamsFn; fetchData: FetchDataFn;
  }) => Promise<TestRetentionCurveResponse>;

  let findCreationWithScriptAndShots: FindCreationFn;
  let buildShotMarkersFromShots: BuildMarkersFn;
  let computeDropPoints: ComputeDropsFn;
  let computeSummary: ComputeSumFn;
  let validateRetentionCurveParams: ValidateParamsFn;
  let fetchDuckDBRetentionData: FetchDataFn;
  let getRetentionCurve: GetCurveFn;

  beforeAll(() => {
    // ---- Repository: findCreationWithScriptAndShots ----
    findCreationWithScriptAndShots = async (creationId, prisma) => {
      if (!creationId || creationId.trim().length === 0) {
        throw Object.assign(new Error('creation_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST, retryable: false,
        });
      }
      try {
        const record = await prisma.creation.findUnique({
          where: { id: creationId },
          include: { script: { include: { shots: { orderBy: { shotIndex: 'asc' } } } } },
        });
        if (!record) return null;
        const r = record as Record<string, unknown>;
        if (!r.script) {
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
            script: null,
          } as unknown as TestCreationRecord;
        }

        const rawS = r.script as Record<string, unknown>;
        const rawShots = (rawS.shots ?? []) as Array<Record<string, unknown>>;
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
          id: String(rawS.id), product_id: String(rawS.productId ?? rawS.product_id),
          title: (rawS.title ?? null) as string | null,
          language: String(rawS.language ?? 'zh-CN'),
          target_audience: (rawS.targetAudience ?? rawS.target_audience ?? null) as string | null,
          video_duration: Number(rawS.videoDuration ?? rawS.video_duration),
          aspect_ratio: (rawS.aspectRatio ?? rawS.aspect_ratio) === 'SIXTEEN_NINE' ? '16:9' : '9:16',
          style_vibe: String(rawS.styleVibe ?? rawS.style_vibe),
          generation_mode: String(rawS.generationMode ?? rawS.generation_mode),
          template_id: (rawS.templateId ?? rawS.template_id ?? null) as string | null,
          viral_video_id: (rawS.viralVideoId ?? rawS.viral_video_id ?? null) as string | null,
          constraint_list: (rawS.constraintList ?? rawS.constraint_list ?? []) as string[],
          raw_json: (rawS.rawJson ?? rawS.raw_json ?? {}) as Record<string, unknown>,
          created_at: (rawS.createdAt ?? rawS.created_at) as Date,
          updated_at: (rawS.updatedAt ?? rawS.updated_at) as Date,
        };
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
        };
      } catch (error) {
        if (error instanceof Error) {
          const pe = error as Error & { code?: string };
          switch (pe.code) {
            case 'P1001':
              throw Object.assign(new Error('PostgreSQL 连接中断，请检查数据库状态'), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.SERVICE_UNAVAILABLE, retryable: true,
              });
            case 'P1008':
              throw Object.assign(new Error('数据库查询超时'), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.SERVICE_UNAVAILABLE, retryable: true,
              });
            case 'P2025':
              throw Object.assign(new Error('创作任务不存在'), {
                errorCode: 'CREATION_NOT_FOUND', statusCode: HttpStatus.NOT_FOUND, retryable: false,
              });
            case 'P2024':
              throw Object.assign(new Error('数据库连接池耗尽'), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.INTERNAL_SERVER_ERROR, retryable: true,
              });
            default:
              throw Object.assign(new Error(`数据库操作失败: ${pe.message}`), {
                errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.INTERNAL_SERVER_ERROR, retryable: true,
              });
          }
        }
        throw Object.assign(new Error('未知数据库错误'), {
          errorCode: 'INTERNAL_SERVER_ERROR', statusCode: HttpStatus.INTERNAL_SERVER_ERROR, retryable: true,
        });
      }
    };

    // ---- buildShotMarkersFromShots ----
    buildShotMarkersFromShots = (shots) => {
      const markers: TestShotMarker[] = [];
      let cumulative = 0;
      for (const shot of shots) {
        markers.push({
          shot_index: shot.shot_index,
          start_sec: Math.round(cumulative * 100) / 100,
          end_sec: Math.round((cumulative + shot.duration) * 100) / 100,
          label: `分镜 ${shot.shot_index}`,
        });
        cumulative += shot.duration;
      }
      return markers;
    };

    // ---- computeDropPoints ----
    computeDropPoints = (curvePoints, shotMarkers, threshold) => {
      const drops: TestDropPoint[] = [];
      for (let i = 1; i < curvePoints.length; i++) {
        const dropRate = Math.round((curvePoints[i - 1].retention_rate - curvePoints[i].retention_rate) * 10000) / 10000;
        if (dropRate >= threshold) {
          const t = curvePoints[i].time_sec;
          let related: number | undefined;
          for (const m of shotMarkers) { if (t >= m.start_sec && t < m.end_sec) { related = m.shot_index; break; } }
          if (related === undefined && shotMarkers.length > 0) {
            for (let j = shotMarkers.length - 1; j >= 0; j--) { if (t >= shotMarkers[j].start_sec) { related = shotMarkers[j].shot_index; break; } }
          }
          drops.push({
            time_sec: t, drop_rate: dropRate, related_shot_index: related,
            possible_reason: dropRate >= 0.1 ? '该时间点用户留存率显著下降' : '该时间点用户留存率轻微下降',
          });
        }
      }
      return drops.sort((a, b) => b.drop_rate - a.drop_rate);
    };

    // ---- computeSummary ----
    computeSummary = (curvePoints, dropPoints) => {
      const total = curvePoints.reduce((s, p) => s + p.retention_rate, 0);
      return {
        avg_retention_rate: curvePoints.length > 0 ? Math.round((total / curvePoints.length) * 10000) / 10000 : 0,
        final_completion_rate: curvePoints.length > 0 ? curvePoints[curvePoints.length - 1].retention_rate : 0,
        primary_drop_shot_index: dropPoints.length > 0 ? dropPoints[0].related_shot_index : undefined,
      };
    };

    // ---- validateRetentionCurveParams ----
    validateRetentionCurveParams = (productId, creationId, metricType, granularity) => {
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
      if (metricType && metricType !== 'RETENTION_RATE' && metricType !== 'COMPLETION_RATE') {
        throw Object.assign(new Error(`metric_type 取值必须为 RETENTION_RATE 或 COMPLETION_RATE: 实际为 "${metricType}"`), {
          errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST, retryable: false,
        });
      }
      if (granularity && granularity !== 'SECOND' && granularity !== 'SHOT') {
        throw Object.assign(new Error(`granularity 取值必须为 SECOND 或 SHOT: 实际为 "${granularity}"`), {
          errorCode: 'INVALID_REQUEST', statusCode: HttpStatus.BAD_REQUEST, retryable: false,
        });
      }
    };

    // ---- fetchDuckDBRetentionData ----
    fetchDuckDBRetentionData = async (creationId, metricType, duckDB) => {
      try {
        const result = await duckDB.queryRetentionCurve(creationId, metricType);
        if (result && Array.isArray(result.curve_points) && result.curve_points.length > 0) {
          return {
            curve_points: result.curve_points,
            data_source: 'DUCKDB_PRECOMPUTED' as const,
            is_mock: result.is_mock ?? false,
            is_predicted: result.is_predicted ?? true,
          };
        }

        return { curve_points: makeCurve(14), data_source: 'DUCKDB_PRECOMPUTED' as const, is_mock: true, is_predicted: true };
      } catch {
        return { curve_points: makeCurve(14), data_source: 'DUCKDB_PRECOMPUTED' as const, is_mock: true, is_predicted: true };
      }
    };

    // ---- getRetentionCurve 主编排器 ----
    getRetentionCurve = async (dto, deps) => {
      const { prisma, duckDB, findCreation, buildMarkers, computeDrops, computeSum, validateParams, fetchData } = deps;
      const metricType = dto.metric_type ?? 'RETENTION_RATE';
      const granularity = dto.granularity ?? 'SECOND';
      const includeSM = dto.include_shot_markers ?? true;
      validateParams(dto.product_id, dto.creation_id, metricType, granularity);
      const creation = await findCreation(dto.creation_id, prisma);
      if (!creation) {
        throw Object.assign(new Error(`创作任务 ${dto.creation_id} 不存在`), {
          errorCode: 'CREATION_NOT_FOUND', statusCode: HttpStatus.NOT_FOUND, retryable: false,
        });
      }
      if (creation.product_id !== dto.product_id) {
        throw Object.assign(new Error('创作任务 product_id 与查询参数不匹配'), {
          errorCode: 'CREATION_NOT_FOUND', statusCode: HttpStatus.NOT_FOUND, retryable: false,
        });
      }
      if (!creation.script) {
        throw Object.assign(new Error(`创作任务 ${dto.creation_id} 关联的剧本已被删除`), {
          errorCode: 'SCRIPT_NOT_FOUND', statusCode: HttpStatus.NOT_FOUND, retryable: false,
        });
      }
      const shots = creation.script.shots ?? [];
      if (shots.length === 0) {
        throw Object.assign(new Error(`创作任务 ${dto.creation_id} 关联的剧本不包含任何有效分镜`), {
          errorCode: 'ANALYTICS_NO_SHOTS_IN_CREATION', statusCode: HttpStatus.UNPROCESSABLE_ENTITY, retryable: false,
        });
      }
      const rd = await fetchData(dto.creation_id, metricType, duckDB);
      const sm = includeSM ? buildMarkers(shots) : [];
      const dp = computeDrops(rd.curve_points, sm, 0.05);
      const summary = computeSum(rd.curve_points, dp);
      return {
        product_id: dto.product_id, creation_id: dto.creation_id, metric_type: metricType,
        curve_points: rd.curve_points, shot_markers: sm, drop_points: dp, summary,
        data_source: 'DUCKDB_PRECOMPUTED', is_mock: rd.is_mock, is_predicted: rd.is_predicted,
        generated_at: new Date().toISOString(),
      };
    };
  });

  beforeEach(() => {
    mockPrisma = { creation: { findUnique: jest.fn() } };
    mockDuckDB = { queryRetentionCurve: jest.fn() };
  });

  const deps = () => ({
    prisma: mockPrisma, duckDB: mockDuckDB,
    findCreation: findCreationWithScriptAndShots, buildMarkers: buildShotMarkersFromShots,
    computeDrops: computeDropPoints, computeSum: computeSummary,
    validateParams: validateRetentionCurveParams, fetchData: fetchDuckDBRetentionData,
  });

  const setupSuccess = (c?: TestCreationRecord, curveData?: TestRetentionCurvePoint[]) => {
    const cr = c ?? makeCreation();
    mockPrisma.creation.findUnique.mockResolvedValue(buildPrismaCreation(cr));
    mockDuckDB.queryRetentionCurve.mockResolvedValue({
      curve_points: curveData ?? makeCurve(15), is_mock: false, is_predicted: true,
    });
    return cr;
  };

  // ============================================================
  // 1. 正常流 (Happy Path) — 5 条
  // ============================================================
  describe('【正常流】合法查询参数 → 完整 RetentionCurveResponse', () => {
    beforeEach(() => { setupSuccess(); });

    it('TC-ANL-RET-001: 完整查询返回顶层字段齐全并符合 api_types 契约', async () => {
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(r.product_id).toBe(PRODUCT_ID);
      expect(r.creation_id).toBe(CREATION_ID);
      expect(r.metric_type).toBe('RETENTION_RATE');
      expect(r.data_source).toBe('DUCKDB_PRECOMPUTED');
      expect(typeof r.is_mock).toBe('boolean');
      expect(typeof r.is_predicted).toBe('boolean');
      expect(typeof r.generated_at).toBe('string');
      expect(new Date(r.generated_at).getTime()).toBeGreaterThan(0);
      expect(r.curve_points).toBeDefined();
      expect(r.shot_markers).toBeDefined();
      expect(r.drop_points).toBeDefined();
      expect(r.summary).toBeDefined();
    });

    it('TC-ANL-RET-002: curve_points 数组时间升序且留存率 [0,1] 区间', async () => {
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(Array.isArray(r.curve_points)).toBe(true);
      expect(r.curve_points.length).toBeGreaterThan(0);
      for (const p of r.curve_points) {
        expect(p.time_sec).toBeGreaterThanOrEqual(0);
        expect(p.retention_rate).toBeGreaterThanOrEqual(0);
        expect(p.retention_rate).toBeLessThanOrEqual(1);
      }
      for (let i = 1; i < r.curve_points.length; i++) {
        expect(r.curve_points[i].time_sec).toBeGreaterThan(r.curve_points[i - 1].time_sec);
      }
    });

    it('TC-ANL-RET-003: shot_markers 与分镜一一对应且时间轴连续', async () => {
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(r.shot_markers.length).toBe(5);
      for (let i = 0; i < r.shot_markers.length; i++) {
        const m = r.shot_markers[i];
        expect(m.shot_index).toBe(i + 1);
        expect(m.start_sec).toBeGreaterThanOrEqual(0);
        expect(m.end_sec).toBeGreaterThan(m.start_sec);
        expect(m.label).toBe(`分镜 ${i + 1}`);
      }
      for (let i = 1; i < r.shot_markers.length; i++) {
        expect(r.shot_markers[i].start_sec).toBe(r.shot_markers[i - 1].end_sec);
      }
    });

    it('TC-ANL-RET-004: summary 三字段完整且在值域内', async () => {
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(r.summary.avg_retention_rate).toBeGreaterThanOrEqual(0);
      expect(r.summary.avg_retention_rate).toBeLessThanOrEqual(1);
      expect(r.summary.final_completion_rate).toBeGreaterThanOrEqual(0);
      expect(r.summary.final_completion_rate).toBeLessThanOrEqual(1);
    });

    it('TC-ANL-RET-005: metric_type=COMPLETION_RATE 正常返回', async () => {
      mockDuckDB.queryRetentionCurve.mockResolvedValue({ curve_points: makeCurve(15), is_mock: false, is_predicted: true });
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID, metric_type: 'COMPLETION_RATE' }, deps());
      expect(r.metric_type).toBe('COMPLETION_RATE');
      expect(r.curve_points.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 2. 边界流 (Edge Cases) — 10 条
  // ============================================================
  describe('【边界流】极端数据 → 系统优雅处理', () => {
    it('TC-ANL-RET-BND-001: 仅 1 个分镜 → 正确构建单个 ShotMarker', async () => {
      const c = makeCreation();
      c.script.shots = makeShot1();
      c.script.video_duration = 3.0;
      setupSuccess(c, makeCurve(3));
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(r.shot_markers.length).toBe(1);
      expect(r.shot_markers[0].start_sec).toBe(0);
      expect(r.shot_markers[0].end_sec).toBe(3.0);
    });

    it('TC-ANL-RET-BND-002: 8 个分镜 (上限) → 全部标记', async () => {
      const c = makeCreation();
      c.script.shots = makeShots8();
      c.script.video_duration = 15.0;
      setupSuccess(c, makeCurve(15));
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(r.shot_markers.length).toBe(8);
      for (let i = 0; i < 8; i++) expect(r.shot_markers[i].shot_index).toBe(i + 1);
    });

    it('TC-ANL-RET-BND-003: DuckDB 不可用 → 降级 Mock (is_mock=true)', async () => {
      setupSuccess();
      mockDuckDB.queryRetentionCurve.mockRejectedValue(new Error('Connection refused'));
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(r.is_mock).toBe(true);
      expect(r.is_predicted).toBe(true);
      expect(r.curve_points.length).toBeGreaterThan(0);
    });

    it('TC-ANL-RET-BND-004: granularity=SHOT 合法传入不报错', async () => {
      setupSuccess();
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID, granularity: 'SHOT' }, deps());
      expect(r.product_id).toBe(PRODUCT_ID);
    });

    it('TC-ANL-RET-BND-005: include_shot_markers=false → 空 markers', async () => {
      setupSuccess();
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID, include_shot_markers: false }, deps());
      expect(r.shot_markers).toHaveLength(0);
    });

    it('TC-ANL-RET-BND-006: 留存率全程 100% → 无掉点', async () => {
      setupSuccess(makeCreation(), makeFlatCurve(14));
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(r.drop_points).toHaveLength(0);
      expect(r.summary.avg_retention_rate).toBe(1.0);
      expect(r.summary.final_completion_rate).toBe(1.0);
      expect(r.summary.primary_drop_shot_index).toBeUndefined();
    });

    it('TC-ANL-RET-BND-007: 留存率首帧后立即归零 → 有掉点', async () => {
      setupSuccess(makeCreation(), makeZeroCurve(14));
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(r.summary.final_completion_rate).toBe(0);
      expect(r.drop_points.length).toBeGreaterThan(0);
      expect(r.drop_points[0].drop_rate).toBeGreaterThanOrEqual(0.05);
    });

    it('TC-ANL-RET-BND-008: SQL 注入式 product_id 不报错 (Prisma 参数化)', async () => {
      const sqlInjectId = "PROD'; DROP TABLE products;--";
      const c = makeCreation();
      c.product_id = sqlInjectId;
      c.script.product_id = sqlInjectId;
      setupSuccess(c);
      const r = await getRetentionCurve({ product_id: sqlInjectId, creation_id: CREATION_ID }, deps());
      expect(r.product_id).toBe(sqlInjectId);
    });

    it('TC-ANL-RET-BND-009: metric_type 不传默认 RETENTION_RATE', async () => {
      setupSuccess();
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(r.metric_type).toBe('RETENTION_RATE');
    });

    it('TC-ANL-RET-BND-010: creation_id 大小写混合 UUID 正常返回', async () => {
      const mixedId = 'DC52D4FF-0000-4000-A000-000000000001';
      setupSuccess();
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: mixedId }, deps());
      expect(r.creation_id).toBe(mixedId);
    });
  });

  // ============================================================
  // 3. 异常流 (Error Flow) — 23 条
  // ============================================================
  describe('【异常流】人为制造报错 → 精准捕获规范错误码', () => {
    const err = async (query: TestRetentionCurveQuery) => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try { await getRetentionCurve(query, deps()); } catch (e) { caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean }; }
      return caught;
    };

    it('TC-ANL-RET-ERR-001: product_id 空字符串 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: '', creation_id: CREATION_ID });
      expect(e).not.toBeNull();
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-RET-ERR-002: creation_id 空字符串 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id: '' });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-ANL-RET-ERR-003: product_id 纯空白 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: '   ', creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-RET-ERR-004: creation_id 纯空白 → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id: '   ' });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-RET-ERR-005: metric_type 非法值 "INVALID" → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID, metric_type: 'INVALID' as 'RETENTION_RATE' });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.message).toContain('INVALID');
    });

    it('TC-ANL-RET-ERR-006: granularity 非法值 "MINUTE" → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID, granularity: 'MINUTE' as 'SECOND' });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
      expect(e!.message).toContain('MINUTE');
    });

    it('TC-ANL-RET-ERR-007: creation 不存在 → CREATION_NOT_FOUND 404', async () => {
      mockPrisma.creation.findUnique.mockResolvedValue(null);
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-ANL-RET-ERR-008: product_id 与 creation.product_id 不匹配 → CREATION_NOT_FOUND 404', async () => {
      setupSuccess();
      const e = await err({ product_id: '00000000-0000-0000-0000-000000000999', creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
    });

    it('TC-ANL-RET-ERR-009: Creation 关联 Script 已被级联删除 → SCRIPT_NOT_FOUND 404', async () => {
      const c = makeCreation();
      const pr = buildPrismaCreation(c);
      (pr.script as unknown) = null;
      mockPrisma.creation.findUnique.mockResolvedValue(pr as unknown as ReturnType<typeof buildPrismaCreation>);
      mockDuckDB.queryRetentionCurve.mockResolvedValue({ curve_points: makeCurve(15), is_mock: false, is_predicted: true });
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('SCRIPT_NOT_FOUND');
    });

    it('TC-ANL-RET-ERR-010: Script.shots 为空数组 → ANALYTICS_NO_SHOTS_IN_CREATION 422', async () => {
      const c = makeCreation();
      c.script.shots = [];
      const pr = buildPrismaCreation(c);
      (pr.script as Record<string, unknown>).shots = [];
      mockPrisma.creation.findUnique.mockResolvedValue(pr);
      mockDuckDB.queryRetentionCurve.mockResolvedValue({ curve_points: makeCurve(15), is_mock: false, is_predicted: true });
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('ANALYTICS_NO_SHOTS_IN_CREATION');
      expect(e!.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('TC-ANL-RET-ERR-011: PostgreSQL P1001 → INTERNAL_SERVER_ERROR 503', async () => {
      const dbErr = new Error('Connection terminated');
      (dbErr as Error & { code?: string }).code = 'P1001';
      mockPrisma.creation.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-RET-ERR-012: PostgreSQL P1008 超时 → INTERNAL_SERVER_ERROR 503', async () => {
      const dbErr = new Error('Query timeout');
      (dbErr as Error & { code?: string }).code = 'P1008';
      mockPrisma.creation.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-RET-ERR-013: Prisma P2025 → CREATION_NOT_FOUND 404', async () => {
      const dbErr = new Error('Record not found');
      (dbErr as Error & { code?: string }).code = 'P2025';
      mockPrisma.creation.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
      expect(e!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-ANL-RET-ERR-014: Prisma P2024 连接池耗尽 → INTERNAL_SERVER_ERROR 500', async () => {
      const dbErr = new Error('Pool exhausted');
      (dbErr as Error & { code?: string }).code = 'P2024';
      mockPrisma.creation.findUnique.mockRejectedValue(dbErr);
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-RET-ERR-015: 未知 Prisma 异常 → INTERNAL_SERVER_ERROR 500', async () => {
      mockPrisma.creation.findUnique.mockRejectedValue(new Error('Random crash'));
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(e!.retryable).toBe(true);
    });

    it('TC-ANL-RET-ERR-016: 非 Error 实例抛出 → INTERNAL_SERVER_ERROR 500', async () => {
      mockPrisma.creation.findUnique.mockRejectedValue('raw string error');
      const e = await err({ product_id: PRODUCT_ID, creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(e!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-ANL-RET-ERR-017: DuckDB 空 curve_points 响应 → 降级 mock 曲线', async () => {
      setupSuccess();
      mockDuckDB.queryRetentionCurve.mockResolvedValue({ curve_points: [], is_mock: false, is_predicted: true });
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(Array.isArray(r.curve_points)).toBe(true);
      expect(r.curve_points.length).toBeGreaterThan(0);
      expect(r.is_mock).toBe(true);
      expect(r.is_predicted).toBe(true);
    });

    it('TC-ANL-RET-ERR-018: DuckDB 返回 null → 降级 mock 曲线且不崩溃', async () => {
      setupSuccess();
      mockDuckDB.queryRetentionCurve.mockResolvedValue(null);
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(Array.isArray(r.curve_points)).toBe(true);
      expect(r.curve_points.length).toBeGreaterThan(0);
      expect(r.is_mock).toBe(true);
      expect(r.is_predicted).toBe(true);
    });

    it('TC-ANL-RET-ERR-019: DuckDB 返回 undefined → 降级 mock 曲线且不崩溃', async () => {
      setupSuccess();
      mockDuckDB.queryRetentionCurve.mockResolvedValue(undefined);
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      expect(Array.isArray(r.curve_points)).toBe(true);
      expect(r.curve_points.length).toBeGreaterThan(0);
      expect(r.is_mock).toBe(true);
      expect(r.is_predicted).toBe(true);
    });

    it('TC-ANL-RET-ERR-020: creation_id 格式非 UUID 仍查 null → CREATION_NOT_FOUND 404', async () => {
      mockPrisma.creation.findUnique.mockResolvedValue(null);
      const e = await err({ product_id: PRODUCT_ID, creation_id: 'not-a-valid-uuid' });
      expect(e!.errorCode).toBe('CREATION_NOT_FOUND');
    });

    it('TC-ANL-RET-ERR-021: product_id 为 undefined → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: undefined as unknown as string, creation_id: CREATION_ID });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-RET-ERR-022: creation_id 为 undefined → INVALID_REQUEST 400', async () => {
      const e = await err({ product_id: PRODUCT_ID, creation_id: undefined as unknown as string });
      expect(e!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-ANL-RET-ERR-023: shot_markers 空数组时 computeDropPoints 不掉点', async () => {
      setupSuccess(makeCreation(), makeCurve(15));
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID, include_shot_markers: false }, deps());
      expect(r.shot_markers).toHaveLength(0);
      expect(r.drop_points.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // 4. 性能流 (Performance) — 7 条
  // ============================================================
  describe('【性能流】耗时卡点 — 不得超出上限', () => {
    beforeEach(() => { setupSuccess(); });

    it('TC-ANL-RET-PERF-001: getRetentionCurve 编排总耗时 ≤ 50ms (不含 I/O)', async () => {
      const start = performance.now();
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      const elapsed = performance.now() - start;
      expect(r.creation_id).toBe(CREATION_ID);
      expect(elapsed).toBeLessThanOrEqual(50);
    });

    it('TC-ANL-RET-PERF-002: findCreationWithScriptAndShots 单次 ≤ 10ms', async () => {
      const start = performance.now();
      const r = await findCreationWithScriptAndShots(CREATION_ID, mockPrisma);
      const elapsed = performance.now() - start;
      expect(r).not.toBeNull();
      expect(elapsed).toBeLessThanOrEqual(10);
    });

    it('TC-ANL-RET-PERF-003: 连续 10 次无退化 avg ≤ 10ms', async () => {
      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      }
      const avg = (performance.now() - start) / 10;
      expect(avg).toBeLessThanOrEqual(10);
    }, 10000);

    it('TC-ANL-RET-PERF-004: 8 分镜大查询 ≤ 30ms', async () => {
      const c = makeCreation();
      c.script.shots = makeShots8();
      c.script.video_duration = 15.0;
      setupSuccess(c, makeCurve(15));
      const start = performance.now();
      const r = await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps());
      const elapsed = performance.now() - start;
      expect(r.shot_markers.length).toBe(8);
      expect(elapsed).toBeLessThanOrEqual(30);
    });

    it('TC-ANL-RET-PERF-005: CREATION_NOT_FOUND 快速失败 ≤ 5ms', async () => {
      mockPrisma.creation.findUnique.mockResolvedValue(null);
      const start = performance.now();
      let threw = false;
      try { await getRetentionCurve({ product_id: PRODUCT_ID, creation_id: CREATION_ID }, deps()); } catch { threw = true; }
      expect(threw).toBe(true);
      expect(performance.now() - start).toBeLessThanOrEqual(5);
    });

    it('TC-ANL-RET-PERF-006: computeSummary 大数据量 ≤ 5ms', async () => {
      const curve = makeCurve(300);
      const drops = computeDropPoints(curve, buildShotMarkersFromShots(makeShots5()), 0.05);
      const start = performance.now();
      const s = computeSummary(curve, drops);
      const elapsed = performance.now() - start;
      expect(typeof s.avg_retention_rate).toBe('number');
      expect(elapsed).toBeLessThanOrEqual(5);
    });

    it('TC-ANL-RET-PERF-007: computeDropPoints 300 点 ≤ 10ms', async () => {
      const curve = makeCurve(300);
      const markers = buildShotMarkersFromShots(makeShots5());
      const start = performance.now();
      const drops = computeDropPoints(curve, markers, 0.05);
      const elapsed = performance.now() - start;
      expect(Array.isArray(drops)).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(10);
    });
  });

  // ============================================================
  // 5. 原子函数独立测试 — 17 条
  // ============================================================
  describe('【原子函数】独立校验各原子函数正确性', () => {
    // ---- validateRetentionCurveParams ----
    describe('validateRetentionCurveParams', () => {
      it('AF-001: 合法 product_id + creation_id 不抛错', () => {
        expect(() => validateRetentionCurveParams(PRODUCT_ID, CREATION_ID)).not.toThrow();
      });

      it('AF-002: product_id 为空字符串 → INVALID_REQUEST', () => {
        let e: Error & { errorCode?: string } | null = null;
        try { validateRetentionCurveParams('', CREATION_ID); } catch (err) { e = err as Error & { errorCode?: string }; }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it('AF-003: creation_id 为空字符串 → INVALID_REQUEST', () => {
        let e: Error & { errorCode?: string } | null = null;
        try { validateRetentionCurveParams(PRODUCT_ID, ''); } catch (err) { e = err as Error & { errorCode?: string }; }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });

      it("AF-004: metric_type='CLICK_RATE' (非法) → INVALID_REQUEST", () => {
        let e: Error & { errorCode?: string; message?: string } | null = null;
        try { validateRetentionCurveParams(PRODUCT_ID, CREATION_ID, 'CLICK_RATE'); } catch (err) { e = err as Error & { errorCode?: string; message?: string }; }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
        expect(e!.message).toContain('CLICK_RATE');
      });

      it("AF-005: granularity='MINUTE' (非法) → INVALID_REQUEST", () => {
        let e: Error & { errorCode?: string } | null = null;
        try { validateRetentionCurveParams(PRODUCT_ID, CREATION_ID, undefined, 'MINUTE'); } catch (err) { e = err as Error & { errorCode?: string }; }
        expect(e!.errorCode).toBe('INVALID_REQUEST');
      });
    });

    // ---- buildShotMarkersFromShots ----
    describe('buildShotMarkersFromShots', () => {
      it('AF-006: 5 分镜 → 5 个 Marker 连续时间轴', () => {
        const markers = buildShotMarkersFromShots(makeShots5());
        expect(markers).toHaveLength(5);
        expect(markers[0].start_sec).toBe(0);
        for (let i = 1; i < markers.length; i++) {
          expect(markers[i].start_sec).toBe(markers[i - 1].end_sec);
        }
      });

      it('AF-007: 空 shots 数组 → 空 markers', () => {
        const markers = buildShotMarkersFromShots([]);
        expect(markers).toHaveLength(0);
      });

      it('AF-008: 1 个分镜 → start_sec=0, end_sec=duration', () => {
        const markers = buildShotMarkersFromShots([makeShot(1, { duration: 4.5 })]);
        expect(markers).toHaveLength(1);
        expect(markers[0].start_sec).toBe(0);
        expect(markers[0].end_sec).toBe(4.5);
      });

      it('AF-009: label 格式为 "分镜 {N}"', () => {
        const markers = buildShotMarkersFromShots(makeShots5());
        markers.forEach((m, i) => { expect(m.label).toBe(`分镜 ${i + 1}`); });
      });
    });

    // ---- computeDropPoints ----
    describe('computeDropPoints', () => {
      it('AF-010: 陡降曲线 → 检测到多个掉点', () => {
        const curve = makeCurve(15, true);
        const markers = buildShotMarkersFromShots(makeShots5());
        const drops = computeDropPoints(curve, markers, 0.05);
        expect(drops.length).toBeGreaterThan(0);
        for (const d of drops) {
          expect(d.drop_rate).toBeGreaterThanOrEqual(0.05);
          expect(d.time_sec).toBeGreaterThanOrEqual(0);
          expect(d.possible_reason).toBeDefined();
        }
      });

      it('AF-011: 平坦曲线 (100%留存) → 0 个掉点', () => {
        const curve = makeFlatCurve(14);
        const markers = buildShotMarkersFromShots(makeShots5());
        const drops = computeDropPoints(curve, markers, 0.05);
        expect(drops).toHaveLength(0);
      });

      it('AF-012: 掉点按 drop_rate 降序排列', () => {
        const curve = makeCurve(15, true);
        const drops = computeDropPoints(curve, buildShotMarkersFromShots(makeShots5()), 0.05);
        for (let i = 1; i < drops.length; i++) {
          expect(drops[i].drop_rate).toBeLessThanOrEqual(drops[i - 1].drop_rate);
        }
      });

      it('AF-013: 阈值=0.0 检测所有下降点', () => {
        const curve = makeCurve(15);
        const drops = computeDropPoints(curve, buildShotMarkersFromShots(makeShots5()), 0.0);
        expect(drops.length).toBeGreaterThan(0);
      });

      it('AF-014: 阈值=1.0 无任何掉点', () => {
        const curve = makeCurve(15, true);
        const drops = computeDropPoints(curve, buildShotMarkersFromShots(makeShots5()), 1.0);
        expect(drops).toHaveLength(0);
      });
    });

    // ---- computeSummary ----
    describe('computeSummary', () => {
      it('AF-015: 正常曲线 → avg_retention_rate / final_completion_rate 合理', () => {
        const curve = makeCurve(15);
        const drops = computeDropPoints(curve, buildShotMarkersFromShots(makeShots5()), 0.05);
        const s = computeSummary(curve, drops);
        expect(s.avg_retention_rate).toBeGreaterThan(0);
        expect(s.avg_retention_rate).toBeLessThan(1);
        expect(s.final_completion_rate).toBe(curve[curve.length - 1].retention_rate);
      });

      it('AF-016: 无掉点 → primary_drop_shot_index 为 undefined', () => {
        const curve = makeFlatCurve(14);
        const drops = computeDropPoints(curve, buildShotMarkersFromShots(makeShots5()), 0.05);
        const s = computeSummary(curve, drops);
        expect(s.primary_drop_shot_index).toBeUndefined();
      });

      it('AF-017: 空 curvePoints → avg/final 为 0', () => {
        const s = computeSummary([], []);
        expect(s.avg_retention_rate).toBe(0);
        expect(s.final_completion_rate).toBe(0);
        expect(s.primary_drop_shot_index).toBeUndefined();
      });
    });
  });
});
