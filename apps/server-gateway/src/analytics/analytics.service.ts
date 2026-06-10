// =============================================================================
// TikStream AI — Analytics Service
// 业务编排层: 6 步调用链
//   [1] validateRetentionCurveParams  [2] validateCreationExists
//   [3] fetchDuckDBRetentionData       [4] buildShotMarkersFromShots
//   [5] computeDropPoints              [6] computeSummary
// =============================================================================

import { Injectable, Logger, HttpStatus, HttpException, OnModuleInit } from '@nestjs/common';
import { AnalyticsRepository, CreationRecord } from './analytics.repository';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { serviceException } from '../common/service-exception';
import { ANALYTICS_CONSTANTS } from './analytics.constants';
import { env } from '../common/env';
import { isMockMode, findMockProductById, getMockCreationRecord, getMockProducts, generateFallbackMockCreationRecord } from './mock-data.provider';
import type { MockCreationRecord } from './mock-data.provider';
import {
  RetentionCurveResponse,
  RetentionCurvePoint,
  ShotMarker,
  DropPoint,
  StyleFactorHeatmapResponse,
  HeatmapCell,
  AnalyticsMetric,
  HeatmapDimension,
  ConfidenceTag,
  AudioVisualSankeyResponse,
  SankeyNode,
  SankeyLink,
  CompareVersionSummary,
  CompareMetricItem,
  FactorDiffItem,
} from '@tikstream/shared-types';

export interface RetentionCurveDto {
  product_id: string;
  creation_id: string;
  metric_type?: 'RETENTION_RATE' | 'COMPLETION_RATE';
  granularity?: 'SECOND' | 'SHOT' | 'DAY';
  include_shot_markers?: boolean;
  time_range?: '7d' | '30d' | '90d';
}

export interface DuckDBRetentionData {
  curve_points: RetentionCurvePoint[];
  data_source: 'DUCKDB_PRECOMPUTED';
  is_mock: boolean;
  is_predicted: boolean;
}

export interface StyleFactorHeatmapDto {
  product_id: string;
  metric: AnalyticsMetric;
  x_dimension: HeatmapDimension;
  y_dimension: HeatmapDimension;
  top_n: number;
  time_range?: '7d' | '30d' | '90d';
}

export interface AudioVisualSankeyDto {
  product_id: string;
  creation_id?: string;
  metric?: string;
  source_dimension?: HeatmapDimension;
  middle_dimension?: HeatmapDimension;
  target_dimension?: string;
  time_range?: '7d' | '30d' | '90d';
}

interface AudioVisualSankeyDuckDBRow {
  bgm_style: string;
  visual_style: string;
  retention_bucket: string;
  flow_count: number;
  avg_retention_rate: number;
}

interface AudioVisualSankeyDataBundle {
  bgm_nodes: SankeyNode[];
  visual_nodes: SankeyNode[];
  retention_nodes: SankeyNode[];
  bgm_to_visual_links: SankeyLink[];
  visual_to_retention_links: SankeyLink[];
  is_mock: boolean;
  is_predicted: boolean;
}

// ===========================================================================
// DuckDB API 类型定义（手写，对应 @duckdb/node-api v1.x 动态导入接口）
// 注意：当 @duckdb/node-api 安装后，应优先使用其导出的 DuckDBConnection / DuckDBInstance 类型
// ===========================================================================

interface DuckDBConnection {
  query: (sql: string, params: unknown[]) => Promise<Iterable<Record<string, unknown>>>;
  run?: (...args: unknown[]) => Promise<{ getRowObjectsJson: () => Array<Record<string, unknown>> }>;
  close: () => Promise<void>;
}

interface DuckDBInstance {
  connect: () => Promise<DuckDBConnection>;
  close?: () => Promise<void>;
}

/** duckdb 动态导入模块的形状 */
type DuckDBModuleShape = {
  DuckDBInstance?: new () => DuckDBInstance;
  connect?: (path: string) => Promise<DuckDBConnection>;
};

interface StyleFactorDuckDBRow {
  x_key: string;
  y_key: string;
  score: number;
  contribution_rate: number;
  sample_size: number;
}

interface DuckDBStyleFactorResult {
  x_axis_labels: string[];
  y_axis_labels: string[];
  cells: HeatmapCell[];
}

interface AbCompareDuckDBRow {
  creation_id: string;
  predicted_ctr: number;
  predicted_cvr: number;
  predicted_completion_rate: number;
  predicted_retention_rate: number;
  hook_type: string;
  hook_strength: number;
}

interface AbCompareDuckDBRowPair {
  metrics_a: AbCompareDuckDBRow;
  metrics_b: AbCompareDuckDBRow;
  is_mock: boolean;
  is_predicted: boolean;
}

interface AbCompareDuckDBDataBundle {
  metrics_a: AbCompareDuckDBRow | null;
  metrics_b: AbCompareDuckDBRow | null;
  is_mock: boolean;
  is_predicted: boolean;
}

interface CreationWithScript {
  id?: string | number;
  productId?: string;
  product_id?: string;
  scriptId?: string;
  script_id?: string;
  taskId?: string;
  task_id?: string;
  status?: string;
  currentStage?: string;
  current_stage?: string;
  script?:
    | Record<string, unknown>
    | {
        id?: string | number;
        productId?: string;
        product_id?: string;
        title?: string | null;
        styleVibe?: string;
        style_vibe?: string;
        generationMode?: string;
        generation_mode?: string;
        videoDuration?: number;
        video_duration?: number;
        templateId?: string | null;
        template_id?: string | null;
        viralVideoId?: string | null;
        viral_video_id?: string | null;
        constraintList?: unknown;
        constraint_list?: unknown;
        shots?: Array<{
          shotIndex?: number;
          shot_index?: number;
          duration?: number;
          voiceoverText?: string;
          voiceover_text?: string;
          visualDescription?: string;
          visual_description?: string;
          cameraMovement?: string;
          camera_movement?: string;
          transitionType?: string;
          transition_type?: string;
        }>;
      }
    | null;
}

export interface SelfHealDuckDBRawRow {
  shot_index: number;
  hook_strength: number;
  voiceover_ratio: number;
  style_alignment_score: number;
  cta_strength: number;
  retention_rate_at_shot: number;
}

export interface SelfHealDuckDBBundle {
  rows: SelfHealDuckDBRawRow[];
  data_source: typeof ANALYTICS_CONSTANTS.DATA_SOURCE;
  is_mock: boolean;
  is_predicted: boolean;
}

export interface ShotDiagnosis {
  shot_index: number;
  issue_type: string;
  severity: number;
  value: number;
  threshold: number;
  reason: string;
}

export interface AffectedShot {
  shot_index: number;
  action: string;
  reason: string;
}

export type SelfHealTriggerSource = 'RETENTION_DROP' | 'AB_COMPARE' | 'MANUAL';
export type SelfHealIssueType = 'HOOK_WEAK' | 'VOICEOVER_TOO_LONG' | 'STYLE_MISMATCH' | 'CTA_WEAK';
export type SelfHealStrategy = 'REWRITE_ONLY' | 'RERENDER_SHOT' | 'REGENERATE_VARIANT';
export type SelfHealStatusValue = 'SUGGESTED' | 'QUEUED' | 'PROCESSING' | 'FINISHED';

export interface SelfHealRequestDto {
  product_id: string;
  creation_id: string;
  trigger_source: SelfHealTriggerSource;
  target_shot_indexes?: number[];
  issue_type: SelfHealIssueType;
  strategy: SelfHealStrategy;
  dry_run?: boolean;
  remark?: string;
}

export interface SelfHealResultResponse {
  product_id: string;
  creation_id: string;
  task_id?: string;
  healed_creation_id?: string;
  affected_shots: AffectedShot[];
  suggestion_summary: string;
  status: SelfHealStatusValue;
  dry_run: boolean;
  data_source?: string;
  is_mock?: boolean;
  is_predicted?: boolean;
}

interface SelfHealTaskExecutionResult {
  task_id?: string;
  healed_creation_id?: string;
}

/** 自愈 Pipeline 中传递的商品信息（camelCase，匹配 Prisma 返回值） */
export interface ProductInfo {
  title: string;
  category: string;
  sellingPoints: string[];
  targetAudience?: string;
}

@Injectable()
export class AnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly cache = new Map<string, { data: unknown; expires: number; lastAccess: number }>();
  private readonly CACHE_TTL_MS =
    Number(process.env.ANALYTICS_CACHE_TTL_MS) || 300_000; // Default 5min for production; override via env for mock/testing
  private readonly MAX_CACHE_SIZE = ANALYTICS_CONSTANTS.CACHE.MAX_SIZE; // 最大缓存条目数，防止内存泄漏

  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly doubaoTextProvider: DoubaoTextProvider,
  ) {}

  onModuleInit() {
    // 在 NestJS 依赖全部初始化完成后启动定时过期缓存清理
    this.cleanIntervalId = setInterval(
      () => this.cleanExpiredCache(),
      ANALYTICS_CONSTANTS.CACHE.CLEANUP_INTERVAL_MS,
    );

    // DuckDB 启动诊断（异步，不阻塞模块初始化）
    void this.logDuckDBStartupStatus();
  }

  /**
   * DuckDB 启动诊断 —— 检查 DuckDB 是否启用并输出清晰状态日志。
   * 此方法在模块初始化时调用，不会阻塞应用启动。
   */
  private logDuckDBStartupStatus(): void {
    const duckDBEnv = env('DB_ENABLED', 'DUCKDB_ENABLED');
    const duckDBPath = env('DB_PATH', 'DUCKDB_PATH');

    if (duckDBEnv !== 'true' || !duckDBPath) {
      this.logger.warn(
        `[DuckDB] 未启用 —— DB_ENABLED=${duckDBEnv || '(unset)'}, DB_PATH=${duckDBPath || '(unset)'}。` +
        'Analytics 数据将使用 Mock 降级 (is_mock: true)。' +
        '如需真实数据，请设置 DB_ENABLED=true 并配置 DB_PATH。',
      );
      return;
    }

    // 尝试动态导入 @duckdb/node-api 验证可用性
    // @ts-expect-error @duckdb/node-api 可选依赖
    import('@duckdb/node-api')
      .then(() => {
        this.logger.log('[DuckDB] 已启用 —— @duckdb/node-api 模块加载成功，将使用真实预计算数据。');
      })
      .catch((err) => {
        this.logger.warn(
          `[DuckDB] @duckdb/node-api 加载失败，将降级为 Mock 数据。错误: ${(err as Error).message}`,
        );
      });
  }

  /**
   * 获取 DuckDB 运行状态（供 Health Check 使用）
   */
  getDuckDBStatus(): { duckdb: 'enabled' | 'disabled' | 'error'; mock_mode: boolean } {
    const duckDBEnv = env('DB_ENABLED', 'DUCKDB_ENABLED');
    const duckDBPath = env('DB_PATH', 'DUCKDB_PATH');
    const duckDBEnabled = duckDBEnv === 'true' && !!duckDBPath;
    const mockMode = process.env.ANALYTICS_MOCK_MODE === 'true' || !duckDBEnabled;

    return {
      duckdb: duckDBEnabled ? 'enabled' : 'disabled',
      mock_mode: mockMode,
    };
  }

  onModuleDestroy() {
    if (this.cleanIntervalId) {
      clearInterval(this.cleanIntervalId);
      this.cleanIntervalId = null;
    }
  }

  private cleanIntervalId: ReturnType<typeof setInterval> | null = null;

  private cacheGet<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) {
      this.logger.debug(`Cache HIT: ${key}`);
      entry.lastAccess = Date.now();
      return entry.data as T;
    }
    if (entry) {
      this.cache.delete(key);
    }
    return null;
  }

  private cacheSet(key: string, data: unknown): void {
    const now = Date.now();
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // 基于显式 lastAccess 时间戳淘汰最久未访问的条目，消除 Map 迭代顺序的隐式依赖
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [itemKey, itemEntry] of this.cache) {
        if (itemEntry.lastAccess < oldestTime) {
          oldestTime = itemEntry.lastAccess;
          oldestKey = itemKey;
        }
      }
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        this.logger.log(`Cache EVICT: ${oldestKey} (lastAccess=${oldestTime}, size=${this.cache.size})`);
      }
    }
    this.cache.set(key, { data, expires: now + this.CACHE_TTL_MS, lastAccess: now });
    this.logger.debug(`Cache SET: ${key}`);
  }

  /** Bug 24: 定时清理所有过期缓存条目 */
  private cleanExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expires <= now) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  async getRetentionCurve(dto: RetentionCurveDto): Promise<RetentionCurveResponse> {
    this.logger.log(
      `查询留存曲线: product_id=${dto.product_id}, creation_id=${dto.creation_id}, metric_type=${dto.metric_type ?? 'RETENTION_RATE'}, granularity=${dto.granularity ?? 'SECOND'}`,
    );

    this.validateRetentionCurveParams(
      dto.product_id,
      dto.creation_id,
      dto.metric_type,
      dto.granularity,
    );

    const metricType = dto.metric_type ?? ANALYTICS_CONSTANTS.DEFAULT_METRIC_TYPE;
    const isDayMode = dto.granularity === 'DAY';

    // DAY 模式：生成日级留存趋势，天数由 time_range 决定（默认 90 天）
    if (isDayMode) {
      const dayData = this.fallbackToDayMockData(dto.creation_id, dto.product_id, dto.time_range);
      const response: RetentionCurveResponse = {
        product_id: dto.product_id,
        creation_id: dto.creation_id,
        metric_type: metricType,
        curve_points: dayData.curve_points,
        shot_markers: [],
        drop_points: dayData.drop_points,
        summary: dayData.summary,
        data_source: 'MOCK_PRECOMPUTED',
        is_mock: true,
        is_predicted: true,
        generated_at: new Date().toISOString(),
      };
      this.logger.log(
        `日级留存曲线计算完成: creation_id=${dto.creation_id}, days=${dayData.curve_points.length}, drops=${dayData.drop_points.length}`,
      );
      return response;
    }

    const creation = await this.validateCreationExists(
      dto.creation_id,
      dto.product_id,
    );

    const includeShotMarkers = dto.include_shot_markers ?? ANALYTICS_CONSTANTS.DEFAULT_INCLUDE_SHOT_MARKERS;

    const shots = creation.script?.shots ?? [];

    // 从分镜时长计算视频总时长，用于 Mock 数据生成
    const totalDuration = shots.length > 0
      ? Math.ceil(shots.reduce((sum, shot) => sum + Number(shot.duration || 0), 0))
      : 60;

    const retentionData = await this.fetchDuckDBRetentionData(dto.creation_id, metricType, totalDuration);

    const shotMarkers = includeShotMarkers
      ? this.buildShotMarkersFromShots(shots)
      : [];

    const dropPoints = this.computeDropPoints(
      retentionData.curve_points,
      shotMarkers,
      ANALYTICS_CONSTANTS.DROP_POINT_THRESHOLD,
    );

    const summary = this.computeSummary(retentionData.curve_points, dropPoints);

    const response: RetentionCurveResponse = {
      product_id: dto.product_id,
      creation_id: dto.creation_id,
      metric_type: metricType,
      curve_points: retentionData.curve_points,
      shot_markers: shotMarkers,
      drop_points: dropPoints,
      summary,
      data_source: retentionData.is_mock ? 'MOCK_PRECOMPUTED' : 'DUCKDB_PRECOMPUTED',
      is_mock: retentionData.is_mock,
      is_predicted: retentionData.is_predicted,
      generated_at: new Date().toISOString(),
    };

    this.logger.log(
      `留存曲线计算完成: creation_id=${dto.creation_id}, points=${retentionData.curve_points.length}, drops=${dropPoints.length}, is_mock=${retentionData.is_mock}`,
    );

    return response;
  }

  // ===========================================================================
  // [1] validateRetentionCurveParams — 参数校验
  // ===========================================================================

  private validateRetentionCurveParams(
    productId: string,
    creationId: string,
    metricType?: string,
    granularity?: string,
  ): void {
    if (!productId || productId.trim().length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.PRODUCT_ID_REQUIRED,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!creationId || creationId.trim().length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.CREATION_ID_REQUIRED,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      metricType !== undefined &&
      metricType !== 'RETENTION_RATE' &&
      metricType !== 'COMPLETION_RATE'
    ) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.METRIC_TYPE_INVALID}: 实际为 "${metricType}"`,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      granularity !== undefined &&
      granularity !== 'SECOND' &&
      granularity !== 'SHOT' &&
      granularity !== 'DAY'
    ) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.GRANULARITY_INVALID}: 实际为 "${granularity}"`,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ===========================================================================
  // [2] validateCreationExists — 存在性校验 + product_id 一致性
  // ===========================================================================

  private async validateCreationExists(
    creationId: string,
    productId: string,
  ): Promise<CreationRecord> {
    // Mock 模式：完全跳过数据库，使用 mock 数据降级链
    if (isMockMode()) {
      let mockRecord = getMockCreationRecord(creationId, productId);
      if (!mockRecord) {
        mockRecord = getMockCreationRecord(productId, productId);
      }
      if (!mockRecord) {
        const firstProductId = getMockProducts()[0]?.id || '00000000-0000-0000-0000-000000000001';
        mockRecord = getMockCreationRecord(firstProductId, firstProductId);
      }
      if (mockRecord) {
        this.logger.log(`[Mock mode] validateCreationExists: using mock for creationId=${creationId.slice(0, 8)}`);
        return mockRecord as unknown as CreationRecord;
      }
    }

    // 尝试从数据库查询
    let creation: CreationRecord | null = null;
    try {
      creation = await this.repository.findCreationWithScriptAndShots(creationId);
    } catch (error) {
      this.logger.warn(`Database query failed for creation ${creationId}, will try mock fallback: ${(error as Error)?.message}`);
    }

    // 数据库查不到时，使用 Mock 数据降级
    if (!creation) {
      const mockRecord = getMockCreationRecord(creationId, productId);
      if (mockRecord) {
        this.logger.log(`[Mock fallback] Using mock creation record for id=${creationId}`);
        creation = mockRecord as unknown as CreationRecord;
      }
    }

    if (!creation) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.CREATION_NOT_FOUND}: ${creationId}`,
          error: {
            code: 'CREATION_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Mock 模式下 product_id 可能来自 mock 数据的种子，跳过校验
    if (!isMockMode() && creation.productId !== productId) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.PRODUCT_MISMATCH,
          error: {
            code: 'CREATION_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!creation.script) {
      this.logger.warn(
        `创作任务缺少关联剧本: creationId=${creationId}`,
      );
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.SCRIPT_NOT_FOUND}: 创作任务 ${creationId} 关联的剧本已被删除`,
          error: {
            code: 'SCRIPT_NOT_FOUND',
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const shots = creation.script.shots ?? [];
    if (shots.length === 0) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.NO_SHOTS_IN_CREATION}: 创作任务 ${creationId}`,
          error: {
            code: 'ANALYTICS_NO_SHOTS_IN_CREATION',
            retryable: false,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (shots.length > ANALYTICS_CONSTANTS.MAX_SHOTS_WARN_THRESHOLD) {
      this.logger.warn(
        `Creation ${creationId} 包含 ${shots.length} 个分镜，超出建议上限 ${ANALYTICS_CONSTANTS.MAX_SHOTS_WARN_THRESHOLD}，计算耗时可能增加`,
      );
    }

    return creation;
  }

  // ===========================================================================
  // [3] fetchDuckDBRetentionData — DuckDB 数据获取 + 降级
  // ===========================================================================

  private async fetchDuckDBRetentionData(
    creationId: string,
    metricType: 'RETENTION_RATE' | 'COMPLETION_RATE',
    totalSeconds = 60,
  ): Promise<DuckDBRetentionData> {
    try {
      const data = await this.queryDuckDBWithTimeout(creationId, metricType);

      if (data && data.curve_points && Array.isArray(data.curve_points) && data.curve_points.length > 0) {
        return {
          curve_points: data.curve_points,
          data_source: 'DUCKDB_PRECOMPUTED',
          is_mock: false,
          is_predicted: false,
        };
      }

      this.logger.warn(
        `DuckDB 查询返回空数据集: creationId=${creationId}, metricType=${metricType}, 降级为预测数据`,
      );
      return this.fallbackToMockData(creationId, totalSeconds);
    } catch (error) {
      this.logger.warn(
        `DuckDB 查询异常, 降级为预测数据: creationId=${creationId}, metricType=${metricType}, error=${error instanceof Error ? error.message : String(error)}`,
      );
      return this.fallbackToMockData(creationId, totalSeconds);
    }
  }

  private queryDuckDBWithTimeout(
    creationId: string,
    metricType: 'RETENTION_RATE' | 'COMPLETION_RATE',
  ): Promise<{ curve_points: RetentionCurvePoint[] } | null> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `DuckDB 查询超时: creationId=${creationId}, timeout=${ANALYTICS_CONSTANTS.DUCKDB_TIMEOUT_MS}ms`,
          ),
        );
      }, ANALYTICS_CONSTANTS.DUCKDB_TIMEOUT_MS);

      this.queryDuckDBNative(creationId, metricType)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async queryDuckDBNative(
    creationId: string,
    metricType: 'RETENTION_RATE' | 'COMPLETION_RATE',
  ): Promise<{ curve_points: RetentionCurvePoint[] } | null> {
    const duckDBEnv = env('DB_ENABLED', 'DUCKDB_ENABLED');
    const duckDBPath = env('DB_PATH', 'DUCKDB_PATH');

    if (duckDBEnv !== 'true' || !duckDBPath) {
      this.logger.debug(
        `DuckDB 未启用 (DB_ENABLED=${duckDBEnv}, DB_PATH=${duckDBPath}), 跳过真实查询`,
      );
      return null;
    }

    try {
      const duckModule = (await this.loadDuckDBModule()) as DuckDBModuleShape | null;
      if (!duckModule) {
        return null;
      }

      const DuckDB = duckModule.DuckDBInstance;

    if (!DuckDB) {
      return null;
    }

    const instance = new DuckDB();
    const DUCKDB_CONNECT_TIMEOUT_MS = 10000;

      let connection: DuckDBConnection | null = null;
      let connectPromise: Promise<DuckDBConnection> | null = null;

      try {
        connectPromise = instance.connect().then((raw) => raw as DuckDBConnection);

        connection = await Promise.race([
          connectPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('DuckDB connection timeout')), DUCKDB_CONNECT_TIMEOUT_MS),
          ),
        ]);

        const metricColumn = metricType === 'COMPLETION_RATE' ? 'completion_rate' : 'retention_rate';

        const result = await connection.query(
          `SELECT time_sec, ${metricColumn} as metric_value
           FROM analytics.retention_curves
           WHERE creation_id = ?::uuid
           ORDER BY time_sec ASC`,
          [String(creationId)],
        );

        const rawRows = Array.from(result as Iterable<Record<string, unknown>>);
        if (rawRows.length === 0) {
          return null;
        }

        const curvePoints: RetentionCurvePoint[] = rawRows.map((row) => {
          const rawValue = Number(row.metric_value) || 0;
          const clamped = Math.max(0, Math.min(1, rawValue));
          const point: RetentionCurvePoint = {
            time_sec: Number(row.time_sec) || 0,
            retention_rate: 0,
          };
          if (metricType === 'COMPLETION_RATE') {
            point.retention_rate = clamped;
            point.completion_rate = clamped;
          } else {
            point.retention_rate = clamped;
          }
          return point;
        });

        for (const point of curvePoints) {
        point.retention_rate = Math.max(0, Math.min(1, point.retention_rate));
        if (point.completion_rate !== undefined) {
          point.completion_rate = Math.max(0, Math.min(1, point.completion_rate));
        }
      }

      return { curve_points: curvePoints };
      } catch (error) {
        // 超时后 connectPromise 可能仍未完成 → 注册清理钩子关闭泄漏连接
        if (connectPromise && !connection) {
          connectPromise
            .then((leakedConn) => {
              this.logger.warn('DuckDB connection completed after timeout, closing leaked connection');
              return leakedConn.close();
            })
            .catch(() => {});
        }

        const err = error as Error | undefined;
        const errorType = err?.constructor?.name || typeof error;
        this.logger.warn(
          `DuckDB 原生查询失败: creationId=${creationId}, error_type=${errorType}`,
        );
        return null;
      } finally {
        if (connection) {
          try {
            await connection.close();
          } catch (closeErr) {
            this.logger.warn('DuckDB 连接关闭失败');
          }
        }
      }
    } catch (error) {
      const err = error as Error | undefined;
      const errorType = err?.constructor?.name || typeof error;
      this.logger.warn(
        `DuckDB 原生查询失败: creationId=${creationId}, error_type=${errorType}`,
      );
      return null;
    }
  }

  private async loadDuckDBModule(): Promise<unknown> {
    try {
      // @ts-expect-error @duckdb/node-api 可选依赖，无类型声明
      const duckdb = await import('@duckdb/node-api');
      return duckdb;
    } catch {
      this.logger.warn('DuckDB @duckdb/node-api 模块未安装或不可用，跳过真实查询');
      return null;
    }
  }

  // ===========================================================================
  // 降级: 基于总秒数生成模拟留存曲线（秒级）
  //
  // 模型：幂律衰减 + 分镜切换回流
  // R(t) = max(0, 1 - α · t^β) + Σ peak_i(t)
  //
  // 短视频留存遵循"钩子筛选→内容消化→CTA尾流"三段式：
  //   - 前3s：急速下降（观众判断是否感兴趣），由 α 控制
  //   - 3s后：幂律衰减，β 越小衰减越慢（内容质量高）
  //   - 分镜切换点：高斯型内容回流峰值，模拟 new_info 钩子效应
  // ===========================================================================

  private fallbackToMockData(creationId: string, totalSeconds = 60): DuckDBRetentionData {
    const seed = this.hashProductId(creationId);
    let s = seed;

    // α — 初始留存衰减系数
    //   0.25~0.50，越低 = 钩子越强 = 前3秒流失越少
    //   参考：TikTok电商视频普遍在0.30~0.45区间
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const alpha = 0.28 + this.u32ToFloat(s) * 0.20;

    // β — 衰减曲率指数
    //   0.30~0.55，越低 = 中期留存越好（内容质量高）
    //   参考：优质带货视频 β≈0.32，普通 β≈0.48
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const beta = 0.32 + this.u32ToFloat(s) * 0.23;

    //  分镜切换回流：模拟每个分镜开头 new_info 的注意力拉回效应
    //  2~4个回流峰，避开开头2s和结尾2s
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const reboundCount = 2 + Math.floor(this.u32ToFloat(s) * 3);
    const minSpacing = Math.max(3, Math.floor(totalSeconds / (reboundCount + 1)));

    const rebounds: Array<{ time: number; strength: number; width: number }> = [];
    for (let i = 0; i < reboundCount; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const time = 2 + i * minSpacing + Math.floor(this.u32ToFloat(s) * minSpacing);
      if (time >= totalSeconds - 2) break;

      // 每个峰值强度 1.8%~5.0%（模拟内容亮点）
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const strength = 1.8 + this.u32ToFloat(s) * 3.2;
      // 宽度 2~5秒（信息消化的持续吸引力）
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const width = 2 + Math.floor(this.u32ToFloat(s) * 4);
      rebounds.push({ time, strength, width });
    }

    const curvePoints: RetentionCurvePoint[] = [];
    for (let t = 0; t <= totalSeconds; t++) {
      // 基础幂律衰减
      const rawDrop = alpha * Math.pow(t, beta);
      const clampedDrop = Math.min(0.96, rawDrop);
      let retention = 1 - clampedDrop;

      // 叠加高斯型分镜回流
      for (const r of rebounds) {
        const dist = Math.abs(t - r.time);
        if (dist < r.width) {
          const peakFactor = Math.exp(-0.5 * Math.pow(dist / (r.width * 0.35), 2));
          retention = Math.min(0.99, retention + (r.strength / 100) * peakFactor);
        }
      }

      // 逐秒统计噪声：±0.6%（模拟真实秒级波动，远小于日级）
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const noise = (this.u32ToFloat(s) - 0.5) * 0.012;
      retention = Math.round(Math.max(0.01, Math.min(0.99, retention + noise)) * 10000) / 10000;

      curvePoints.push({ time_sec: t, retention_rate: retention });
    }

    this.logger.debug(
      `生成模拟留存曲线(s): creationId=${creationId}, total=${totalSeconds}s, ` +
      `α=${alpha.toFixed(3)} β=${beta.toFixed(3)} rebounds=${rebounds.length}`,
    );

    return {
      curve_points: curvePoints,
      data_source: 'DUCKDB_PRECOMPUTED',
      is_mock: true,
      is_predicted: true,
    };
  }

  /**
   * DAY 粒度：生成日级留存 Mock 数据
   *
   * 模型：Weibull 分布 — 新媒体/电商留存分析的标准模型
   *   R(d) = exp(-(d/λ)^k)
   *
   * 其中：
   *   - λ (scale)：中位生命期（天），即留存率降至~37%所需天数
   *                优质内容 15~30天，普通内容 5~12天
   *   - k (shape)：形状参数
   *                k<1: "婴儿死亡率"型 — 早期快速流失后稳定（短视频典型）
   *                k=1: 指数衰减
   *                k>1: 平台期后骤降（直播/长视频典型）
   *
   * 叠加效应：
   *   1. 周末效应：周六/日留存率额外下降 1.5%~4%（用户休闲行为变化）
   *   2. 内容回流：每7~14天出现微幅回升（平台算法推荐周期）
   *   3. 白噪声：±0.4%（模拟数据采集的统计波动）
   *
   * 参考来源：
   *   - "Modeling user retention in social media" (Zhou et al., 2021)
   *   - TikTok e-commerce retention benchmarks (2024 industry report)
   */
  private fallbackToDayMockData(
    creationId: string,
    productId: string,
    timeRange?: '7d' | '30d' | '90d',
  ): {
    curve_points: RetentionCurvePoint[];
    drop_points: DropPoint[];
    summary: { avg_retention_rate: number; final_completion_rate: number; primary_drop_shot_index?: number };
  } {
    const seed = this.hashProductId(productId || creationId);
    let s = seed;

    // ---- Weibull 参数 ----
    // k ∈ [0.35, 0.65] — 短视频电商典型"婴儿死亡率"型曲线
    //   低值(0.35): 前3天流失极快→随后稳定→代表短平快内容
    //   高值(0.65): 衰减更均匀→代表深度种草内容
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const k = 0.38 + this.u32ToFloat(s) * 0.27;

    // λ ∈ [8, 28] — 中位生命期8~28天
    //   低值(8): 快消品/冲动消费类 — 热度几天就散
    //   高值(28): 耐用品/强种草类 — 长尾效应明显
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const lambda = 8 + this.u32ToFloat(s) * 20;

    // ---- 叠加效应 ----
    // 周末效应：周六/日额外下降（用户社交/娱乐分流）
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const weekendDip = 0.015 + this.u32ToFloat(s) * 0.025; // 1.5%~4.0%

    // 内容回流：平台推荐算法的周期性曝光脉冲，间隔9~16天
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const recirculationInterval = 9 + Math.floor(this.u32ToFloat(s) * 7); // 9~16天
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const recirculationStrength = 0.008 + this.u32ToFloat(s) * 0.025; // 0.8%~3.3%回升
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const recirculationPhase = Math.floor(this.u32ToFloat(s) * 5); // 首次脉冲延迟 0~5天

    // ---- 生成数据 ----
    const totalDays = timeRange ? parseInt(timeRange) : 90;
    const curvePoints: RetentionCurvePoint[] = [];
    const dropPoints: DropPoint[] = [];

    // 收集所有留存率用于后续统计
    const retentionValues: number[] = [];
    let prevRetention = 1.0;

    for (let day = 0; day <= totalDays; day++) {
      if (day === 0) {
        curvePoints.push({ time_sec: 0, retention_rate: 1.0 });
        retentionValues.push(1.0);
        continue;
      }

      // ---- 核心：Weibull 衰减 ----
      let retention = Math.exp(-Math.pow(day / lambda, k));

      // ---- 周末效应 ----
      const dayOfWeek = day % 7;
      // 周六(6)和周日(0)有额外下降
      if (dayOfWeek === 6 || dayOfWeek === 0) {
        retention = Math.max(0.02, retention - weekendDip);
      }

      // ---- 内容回流 ----
      const cycleDay = (day - recirculationPhase) % recirculationInterval;
      // 在回流周期中心附近有微幅脉冲
      if (cycleDay >= -1 && cycleDay <= 1) {
        const pulseFactor = recirculationStrength * (1 - Math.abs(cycleDay) * 0.3);
        retention = Math.min(0.98, retention + pulseFactor);
      }

      // ---- 白噪声 ----
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const noise = (this.u32ToFloat(s) - 0.5) * 0.008; // ±0.4%
      retention = Math.round(Math.max(0.01, Math.min(0.99, retention + noise)) * 10000) / 10000;

      curvePoints.push({ time_sec: day, retention_rate: retention });
      retentionValues.push(retention);

      // ---- 掉点检测：Z-score 自适应 ----
      if (retentionValues.length >= 4) {
        const recentValues = retentionValues.slice(-4);
        const mean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
        const variance = recentValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / recentValues.length;
        const stdDev = Math.sqrt(Math.max(variance, 1e-8));
        const zScore = (prevRetention - retention) / stdDev;

        // Z-score > 1.8 视为显著掉点（约p<0.07单尾）
        if (zScore > 1.8 && prevRetention - retention > 0.01) {
          const dropRate = prevRetention - retention;
          const severity = zScore > 3.0 ? '显著' : zScore > 2.2 ? '明显' : '轻度';
          dropPoints.push({
            time_sec: day,
            drop_rate: Math.round(dropRate * 10000) / 10000,
            possible_reason: zScore > 3.0
              ? `第${day}天出现${severity}流失(${dayOfWeek===6||dayOfWeek===0?'周末效应叠加)':''}，流失${(dropRate*100).toFixed(1)}%` +
                `，Z-score=${zScore.toFixed(2)}`
              : `第${day}天出现${severity}流失(${(dropRate*100).toFixed(1)}%)` +
                (dayOfWeek === 6 || dayOfWeek === 0 ? '，可能与周末行为变化有关' : ''),
          });
        }
      }
      prevRetention = retention;
    }

    // 汇总统计
    const sum = retentionValues.reduce((a, b) => a + b, 0);
    const avgRetention = sum / retentionValues.length;
    const finalRetention = retentionValues[retentionValues.length - 1];

    // 找出最主要的掉点
    const primaryDrop = dropPoints.length > 0
      ? dropPoints.reduce((max, d) => d.drop_rate > max.drop_rate ? d : max)
      : null;

    this.logger.debug(
      `生成日级留存 Mock 数据(Weibull): ${totalDays}天, ` +
      `k=${k.toFixed(3)} λ=${lambda.toFixed(1)} 最终=${finalRetention.toFixed(3)} ` +
      `掉点=${dropPoints.length} Z-score检测`,
    );

    return {
      curve_points: curvePoints,
      drop_points: dropPoints.sort((a, b) => b.drop_rate - a.drop_rate),
      summary: {
        avg_retention_rate: Math.round(avgRetention * 10000) / 10000,
        final_completion_rate: Math.round(finalRetention * 10000) / 10000,
        primary_drop_shot_index: primaryDrop?.time_sec,
      },
    };
  }

  // ===========================================================================
  // [4] buildShotMarkersFromShots — 分镜标记构建
  // ===========================================================================

  private buildShotMarkersFromShots(
    shots: CreationRecord['script']['shots'],
  ): ShotMarker[] {
    if (!shots || shots.length === 0) {
      return [];
    }

    const markers: ShotMarker[] = [];
    let cumulativeStart = 0;

    for (const shot of shots) {
      const duration = Number(shot.duration) || 0;

      if (duration <= 0) {
        this.logger.warn(
          `分镜 ${shot.shotIndex} 时长为零或负值 (duration=${shot.duration})，跳过标记构建`,
        );
        continue;
      }

      markers.push({
        shot_index: shot.shotIndex,
        start_sec: Math.round(cumulativeStart * 100) / 100,
        end_sec: Math.round((cumulativeStart + duration) * 100) / 100,
        label:
          ANALYTICS_CONSTANTS.SHOT_LABEL_TEMPLATE.replace(
            '{index}',
            String(shot.shotIndex),
          ),
      });

      cumulativeStart += duration;
    }

    this.logger.debug(
      `分镜标记构建完成: shots=${shots.length}, markers=${markers.length}, totalDuration=${Math.round(cumulativeStart * 100) / 100}s`,
    );

    return markers;
  }

  // ===========================================================================
  // [5] computeDropPoints — 掉点检测
  // ===========================================================================

  private computeDropPoints(
    curvePoints: RetentionCurvePoint[],
    shotMarkers: ShotMarker[],
    threshold: number,
  ): DropPoint[] {
    if (!curvePoints || curvePoints.length < 2) {
      return [];
    }

    const drops: DropPoint[] = [];

    for (let i = 1; i < curvePoints.length; i++) {
      const prevRate = curvePoints[i - 1].retention_rate;
      const currRate = curvePoints[i].retention_rate;
      const dropRate = Math.round((prevRate - currRate) * 10000) / 10000;

      if (dropRate >= threshold) {
        const timeSec = curvePoints[i].time_sec;

        let relatedShotIndex: number | undefined;
        let precedingShotIndex: number | undefined;

        if (shotMarkers.length > 0) {
          for (let j = 0; j < shotMarkers.length; j++) {
            const marker = shotMarkers[j];
            if (timeSec >= marker.start_sec && timeSec < marker.end_sec) {
              relatedShotIndex = marker.shot_index;
              // 若掉点靠近分镜边界(≤1s)，同时记录前一个分镜以提高诊断精度
              if (j > 0 && timeSec - marker.start_sec <= 1.0) {
                precedingShotIndex = shotMarkers[j - 1].shot_index;
              }
              break;
            }
          }

          if (relatedShotIndex === undefined) {
            for (let j = shotMarkers.length - 1; j >= 0; j--) {
              if (timeSec >= shotMarkers[j].start_sec) {
                relatedShotIndex = shotMarkers[j].shot_index;
                break;
              }
            }
          }
        }

        const shotLabel = precedingShotIndex !== undefined
          ? `分镜${precedingShotIndex}→${relatedShotIndex ?? '未知'}`
          : `分镜${relatedShotIndex ?? '未知'}`;

        drops.push({
          time_sec: timeSec,
          drop_rate: dropRate,
          related_shot_index: relatedShotIndex,
          possible_reason:
            dropRate >= ANALYTICS_CONSTANTS.SIGNIFICANT_DROP_THRESHOLD
              ? `在第${timeSec}秒处用户留存率显著下降 ${Math.round(dropRate * 100)}%，可能与${shotLabel}的内容吸引力不足或节奏突变有关`
              : `在第${timeSec}秒处用户留存率轻微下降 ${Math.round(dropRate * 100)}%`,
        });
      }
    }

    drops.sort((a, b) => b.drop_rate - a.drop_rate);

    this.logger.debug(
      `掉点检测完成: total_points=${curvePoints.length}, drops_found=${drops.length}, threshold=${threshold}`,
    );

    return drops;
  }

  // ===========================================================================
  // [6] computeSummary — 汇总统计
  // ===========================================================================

  private computeSummary(
    curvePoints: RetentionCurvePoint[],
    dropPoints: DropPoint[],
  ): {
    avg_retention_rate: number;
    final_completion_rate: number;
    primary_drop_shot_index?: number;
  } {
    if (!curvePoints || curvePoints.length === 0) {
      return {
        avg_retention_rate: 0,
        final_completion_rate: 0,
        primary_drop_shot_index: undefined,
      };
    }

    const totalRate = curvePoints.reduce(
      (sum, point) => sum + point.retention_rate,
      0,
    );
    const avgRetentionRate =
      Math.round((totalRate / curvePoints.length) * 10000) / 10000;

    const finalCompletionRate = curvePoints[curvePoints.length - 1].retention_rate;

    const primaryDropShotIndex =
      dropPoints.length > 0
        ? dropPoints[0].related_shot_index
        : undefined;

    this.logger.debug(
      `汇总统计完成: avg=${avgRetentionRate}, final=${finalCompletionRate}, primary_drop=${primaryDropShotIndex ?? 'none'}`,
    );

    return {
      avg_retention_rate: avgRetentionRate,
      final_completion_rate: finalCompletionRate,
      primary_drop_shot_index: primaryDropShotIndex,
    };
  }

  // ===========================================================================
  // [7] getStyleFactors — 风格因子热力图主编排 (8 步调用链)
  //   [7.1] validateStyleFactorParams    [7.2] validateProductExists
  //   [7.3] fetchDuckDBStyleFactors      [7.4] computeTopContributors
  //   [7.5] buildHeatmapSummary
  // ===========================================================================

  async getStyleFactors(dto: StyleFactorHeatmapDto): Promise<StyleFactorHeatmapResponse> {
    const cacheKey = `style:${dto.product_id}:${dto.metric}:${dto.x_dimension}:${dto.y_dimension}:${dto.time_range ?? '30d'}`;
    const cached = this.cacheGet<StyleFactorHeatmapResponse>(cacheKey);
    if (cached) {
      return {
        ...cached,
        top_positive_factors: cached.top_positive_factors?.slice(0, dto.top_n) ?? [],
        top_negative_factors: cached.top_negative_factors?.slice(0, dto.top_n) ?? [],
      };
    }

    this.logger.log(
      `查询风格因子热力图: product_id=${dto.product_id}, metric=${dto.metric}, x=${dto.x_dimension}, y=${dto.y_dimension}, top_n=${dto.top_n}, time_range=${dto.time_range ?? '30d'}`,
    );

    this.validateStyleFactorParams(
      dto.product_id,
      dto.metric,
      dto.x_dimension,
      dto.y_dimension,
      dto.top_n,
    );

    await this.validateProductExists(dto.product_id);

    const factorData = await this.fetchDuckDBStyleFactors(
      dto.product_id,
      dto.metric,
      dto.x_dimension,
      dto.y_dimension,
      dto.time_range,
    );

    const { top_positive_factors, top_negative_factors } = this.computeTopContributors(
      factorData.cells,
      dto.top_n,
    );

    const summary = this.buildHeatmapSummary(factorData.cells, dto.metric);

    const response: StyleFactorHeatmapResponse = {
      product_id: dto.product_id,
      metric: dto.metric,
      x_dimension: dto.x_dimension,
      y_dimension: dto.y_dimension,
      x_axis_labels: factorData.x_axis_labels,
      y_axis_labels: factorData.y_axis_labels,
      cells: factorData.cells,
      top_positive_factors,
      top_negative_factors,
      summary,
      data_source: 'DUCKDB_PRECOMPUTED',
      is_mock: factorData.is_mock,
      is_predicted: factorData.is_predicted,
      generated_at: new Date().toISOString(),
    };

    this.logger.log(
      `风格因子热力图计算完成: product_id=${dto.product_id}, cells=${factorData.cells.length}, positive=${top_positive_factors.length}, negative=${top_negative_factors.length}`,
    );

    this.cacheSet(cacheKey, response);
    return response;
  }

  // ===========================================================================
  // [7.1] validateStyleFactorParams — 参数白名单校验 + 维度冲突检测
  // ===========================================================================

  private validateStyleFactorParams(
    productId: string,
    metric: string,
    xDim: string,
    yDim: string,
    topN: number,
  ): void {
    if (!productId || productId.trim().length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.PRODUCT_ID_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      metric !== 'CTR' &&
      metric !== 'CVR' &&
      metric !== 'COMPLETION_RATE' &&
      metric !== 'RETENTION_RATE'
    ) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.ANALYTICS_METRIC_INVALID}: 实际为 "${metric}"`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      xDim !== 'NARRATIVE_STRATEGY' &&
      xDim !== 'VISUAL_STYLE' &&
      xDim !== 'BGM_STYLE' &&
      xDim !== 'CTA_STYLE'
    ) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.DIMENSION_INVALID}: 实际为 "${xDim}"`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      yDim !== 'NARRATIVE_STRATEGY' &&
      yDim !== 'VISUAL_STYLE' &&
      yDim !== 'BGM_STYLE' &&
      yDim !== 'CTA_STYLE'
    ) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.DIMENSION_INVALID}: 实际为 "${yDim}"`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (xDim === yDim) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.DIMENSION_CONFLICT}: 均为 "${xDim}"`,
          error: {
            code: 'ANALYTICS_STYLE_FACTOR_DIMENSION_CONFLICT',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (Number.isNaN(topN) || topN < ANALYTICS_CONSTANTS.TOP_N_MIN || topN > ANALYTICS_CONSTANTS.TOP_N_MAX) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.TOP_N_OUT_OF_RANGE}: 实际为 ${topN}`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ===========================================================================
  // [7.2] validateProductExists — 商品存在性校验
  // ===========================================================================

  private async validateProductExists(productId: string): Promise<ProductInfo> {
    // Mock 模式：完全跳过 DB 查询，避免阻塞
    if (isMockMode()) {
      const mockProduct = findMockProductById(productId);
      if (mockProduct) {
        this.logger.log(`[SelfHeal] Mock product found: ${mockProduct.title}`);
        return {
          title: mockProduct.title,
          category: mockProduct.category,
          sellingPoints: mockProduct.selling_points ?? [],
          targetAudience: mockProduct.target_audience ?? undefined,
        };
      }
      // Mock 模式下允许任意 product_id（开发/测试环境兼容性），不进行真实 DB 校验
      this.logger.log(`[SelfHeal] Mock mode: skip DB validation for product_id=${productId}`);
      // 返回兜底数据，确保 AI prompt 有基本商品上下文
      return {
        title: '未知商品',
        category: '未知类目',
        sellingPoints: [],
        targetAudience: undefined,
      };
    }

    const product = await this.repository.findProductById(productId);

    if (!product) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.PRODUCT_NOT_FOUND}: ${productId}`,
          error: { code: 'PRODUCT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      title: product.title,
      category: product.category,
      sellingPoints: product.sellingPoints ?? [],
      targetAudience: product.targetAudience ?? undefined,
    };
  }

  // ===========================================================================
  // [7.3] fetchDuckDBStyleFactors — DuckDB 数据获取 + 静默降级 Mock
  // ===========================================================================

  private async fetchDuckDBStyleFactors(
    productId: string,
    metric: string,
    xDim: string,
    yDim: string,
    timeRange?: '7d' | '30d' | '90d',
  ): Promise<DuckDBStyleFactorResult & { is_mock: boolean; is_predicted: boolean }> {
    try {
      const data = await this.queryDuckDBStyleFactorsNative(productId, metric, xDim, yDim);

      if (
        data &&
        data.cells &&
        Array.isArray(data.cells) &&
        data.cells.length > 0
      ) {
        return {
          x_axis_labels: data.x_axis_labels,
          y_axis_labels: data.y_axis_labels,
          cells: data.cells,
          is_mock: false,
          is_predicted: true,
        };
      }

      this.logger.warn(
        `DuckDB 风格因子查询返回空数据集: productId=${productId}, metric=${metric}, 降级为预测数据`,
      );
      const mockData = this.fallbackToMockStyleFactors(productId, metric, xDim, yDim, timeRange);
      return { ...mockData, is_mock: true, is_predicted: true };
    } catch (error) {
      this.logger.warn(
        `DuckDB 风格因子查询异常, 降级为预测数据: productId=${productId}, metric=${metric}, error=${(error as Error)?.message ?? error}`,
      );
      const mockData = this.fallbackToMockStyleFactors(productId, metric, xDim, yDim, timeRange);
      return { ...mockData, is_mock: true, is_predicted: true };
    }
  }

  // ===========================================================================
  // [7.3a] queryDuckDBStyleFactorsNative — DuckDB 原生查询 (门控 + 超时 + 动态 import)
  // ===========================================================================

  private async queryDuckDBStyleFactorsNative(
    productId: string,
    metric: string,
    xDim: string,
    yDim: string,
  ): Promise<DuckDBStyleFactorResult | null> {
    const duckDBEnv = env('DB_ENABLED', 'DUCKDB_ENABLED');
    const duckDBPath = env('DB_PATH', 'DUCKDB_PATH');

    if (duckDBEnv !== 'true' || !duckDBPath) {
      this.logger.debug(
        `DuckDB 未启用 (DB_ENABLED=${duckDBEnv}, DB_PATH=${duckDBPath}), 跳过真实风格因子查询`,
      );
      return null;
    }

    try {
      const duckdb = await this.loadDuckDBModule();
      if (!duckdb) {
        return null;
      }
      // @ts-expect-error @duckdb/node-api 无官方类型声明，运行时动态可用
      const connection = await duckdb.connect(duckDBPath);

      const xColumn = this.dimensionToColumnName(xDim);
      const yColumn = this.dimensionToColumnName(yDim);

      const result = await connection.query(
        `SELECT DISTINCT
           ${xColumn} as x_key,
           ${yColumn} as y_key,
           score,
           contribution_rate,
           sample_size
         FROM analytics.style_factor_contributions
         WHERE product_id = ? AND metric = ?
         ORDER BY score DESC`,
        [productId, metric],
      );

      await connection.close();

      if (!result || !Array.isArray(result) || result.length === 0) {
        this.logger.debug(
          `DuckDB 风格因子查询返回 0 行: productId=${productId}, metric=${metric}`,
        );
        return null;
      }

      const rows = result as StyleFactorDuckDBRow[];
      const cells: HeatmapCell[] = [];
      const xLabelSet = new Set<string>();
      const yLabelSet = new Set<string>();
      const xLabels: string[] = [];
      const yLabels: string[] = [];

      for (const row of rows) {
        const safeScore = Math.max(0, Math.min(1, Number(row.score) || 0));
        const safeContributionRate = Math.max(-1, Math.min(1, Number(row.contribution_rate) || 0));
        const safeSampleSize = Math.max(0, Math.floor(Number(row.sample_size) || 0));

        let confidenceTag: ConfidenceTag;
        if (safeSampleSize >= ANALYTICS_CONSTANTS.CONFIDENCE_HIGH_THRESHOLD) {
          confidenceTag = 'HIGH';
        } else if (safeSampleSize >= ANALYTICS_CONSTANTS.CONFIDENCE_MEDIUM_THRESHOLD) {
          confidenceTag = 'MEDIUM';
        } else {
          confidenceTag = 'LOW';
        }

        const insufficientData = safeSampleSize < ANALYTICS_CONSTANTS.INSUFFICIENT_DATA_THRESHOLD;

        cells.push({
          x_key: String(row.x_key),
          y_key: String(row.y_key),
          score: Math.round(safeScore * 10000) / 10000,
          contribution_rate: Math.round(safeContributionRate * 10000) / 10000,
          sample_size: safeSampleSize,
          confidence_tag: confidenceTag,
          insufficient_data: insufficientData,
        });

        if (!xLabelSet.has(String(row.x_key))) {
          xLabelSet.add(String(row.x_key));
          xLabels.push(String(row.x_key));
        }
        if (!yLabelSet.has(String(row.y_key))) {
          yLabelSet.add(String(row.y_key));
          yLabels.push(String(row.y_key));
        }
      }

      return {
        x_axis_labels: xLabels,
        y_axis_labels: yLabels,
        cells,
      };
    } catch (error) {
      this.logger.warn(
        `DuckDB 原生风格因子查询失败: productId=${productId}, error=${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  private dimensionToColumnName(dimension: string): string {
    switch (dimension) {
      case 'NARRATIVE_STRATEGY':
        return 'narrative_strategy';
      case 'VISUAL_STYLE':
        return 'visual_style';
      case 'BGM_STYLE':
        return 'bgm_style';
      case 'CTA_STYLE':
        return 'cta_style';
      default:
        return 'narrative_strategy';
    }
  }

  // ===========================================================================
  // [7.3b] fallbackToMockStyleFactors — 基于 product_id 种子的确定性 Mock 生成
  // ===========================================================================

  private fallbackToMockStyleFactors(
    productId: string,
    metric: string,
    xDim: string,
    yDim: string,
    timeRange?: '7d' | '30d' | '90d',
  ): DuckDBStyleFactorResult {
    const xLabels = this.getMockLabelsForDimension(xDim);
    const yLabels = this.getMockLabelsForDimension(yDim);

    const seed = this.hashProductId(productId);
    // 将 time_range 混入 profile 选择：7d/30d/90d 各自映射到不同的 profile 组
    const timeRangeOffset = timeRange === '7d' ? 0 : timeRange === '30d' ? 3 : timeRange === '90d' ? 6 : 0;
    const cells: HeatmapCell[] = [];
    let s = seed;

    // 9 套差异化的亲和矩阵 profile，由 productId 的 hash + time_range 决定使用哪一套
    // Profile 0 = 默认全部混合; 1-8 分别侧重不同维度组合
    const profileIndex = ((seed % 3) + timeRangeOffset) % 9;

    const getBaseScore = (xKey: string, yKey: string): number => {
      const pair = `${xKey}|||${yKey}`;

      // 所有 9 套 profile 的高/低亲和映射
      // 每套都将原始的最佳/最差组合重映射到不同维度对上
      const profileHigh: Record<string, Record<string, number>> = {
        // Profile 0: 默认 (原矩阵，四维平衡)
        0: {
          '问题前置型|||产品特写':0.85,'悬念递进型|||场景展示':0.83,'对比反差型|||产品特写':0.80,
          '故事叙述型|||场景展示':0.82,'清单罗列型|||文字叠加':0.78,
          '问题前置型|||快节奏电子':0.84,'悬念递进型|||激昂管弦':0.82,'故事叙述型|||舒缓钢琴':0.85,
          '问题前置型|||直接促销':0.83,'悬念递进型|||软性引导':0.81,'故事叙述型|||软性引导':0.82,
          '产品特写|||快节奏电子':0.86,'场景展示|||舒缓钢琴':0.84,'真人出镜|||舒缓钢琴':0.81,'动画演示|||快节奏电子':0.83,
          '产品特写|||限时优惠':0.85,'场景展示|||软性引导':0.82,'真人出镜|||软性引导':0.83,
          '快节奏电子|||直接促销':0.87,'舒缓钢琴|||软性引导':0.85,'轻松吉他|||软性引导':0.81,
        },
        // Profile 1: 重叙事 → NARRATIVE_STRATEGY 相关组合得分高
        1: {
          '问题前置型|||产品特写':0.88,'问题前置型|||文字叠加':0.85,'问题前置型|||真人出镜':0.82,
          '悬念递进型|||场景展示':0.87,'悬念递进型|||真人出镜':0.84,'悬念递进型|||动画演示':0.80,
          '对比反差型|||产品特写':0.84,'对比反差型|||文字叠加':0.81,
          '故事叙述型|||场景展示':0.86,'故事叙述型|||动画演示':0.78,
          '清单罗列型|||产品特写':0.80,'清单罗列型|||文字叠加':0.82,
          '问题前置型|||快节奏电子':0.87,'悬念递进型|||激昂管弦':0.85,'故事叙述型|||舒缓钢琴':0.88,
          '对比反差型|||快节奏电子':0.84,
          '问题前置型|||直接促销':0.86,'悬念递进型|||软性引导':0.84,'故事叙述型|||软性引导':0.85,'对比反差型|||直接促销':0.83,
          '产品特写|||快节奏电子':0.82,'场景展示|||舒缓钢琴':0.80,'真人出镜|||舒缓钢琴':0.78,'动画演示|||快节奏电子':0.80,
        },
        // Profile 2: 重视觉 → VISUAL_STYLE 相关组合得分高
        2: {
          '产品特写|||快节奏电子':0.89,'产品特写|||激昂管弦':0.82,'产品特写|||限时优惠':0.88,'产品特写|||直接促销':0.84,
          '场景展示|||舒缓钢琴':0.87,'场景展示|||轻松吉他':0.83,'场景展示|||软性引导':0.85,'场景展示|||问题引导':0.81,
          '文字叠加|||轻松吉他':0.81,'文字叠加|||无BGM':0.77,'文字叠加|||直接促销':0.83,'文字叠加|||限时优惠':0.80,
          '真人出镜|||舒缓钢琴':0.85,'真人出镜|||快节奏电子':0.82,'真人出镜|||软性引导':0.86,'真人出镜|||问题引导':0.80,
          '动画演示|||快节奏电子':0.86,'动画演示|||轻松吉他':0.80,'动画演示|||软性引导':0.82,
          '问题前置型|||产品特写':0.80,'悬念递进型|||场景展示':0.78,'故事叙述型|||场景展示':0.77,
          '快节奏电子|||直接促销':0.80,'舒缓钢琴|||软性引导':0.79,
        },
        // Profile 3: 重BGM → BGM_STYLE 相关组合得分高
        3: {
          '快节奏电子|||直接促销':0.90,'快节奏电子|||限时优惠':0.86,'快节奏电子|||产品特写':0.88,'快节奏电子|||问题前置型':0.87,
          '激昂管弦|||直接促销':0.84,'激昂管弦|||限时优惠':0.81,'激昂管弦|||悬念递进型':0.85,
          '舒缓钢琴|||软性引导':0.88,'舒缓钢琴|||问题引导':0.83,'舒缓钢琴|||场景展示':0.86,'舒缓钢琴|||故事叙述型':0.87,
          '轻松吉他|||软性引导':0.85,'轻松吉他|||问题引导':0.80,'轻松吉他|||文字叠加':0.82,
          '无BGM|||问题引导':0.77,'无BGM|||软性引导':0.74,
          '产品特写|||快节奏电子':0.84,'场景展示|||舒缓钢琴':0.82,'真人出镜|||快节奏电子':0.80,
          '悬念递进型|||场景展示':0.75,'故事叙述型|||真人出镜':0.74,'清单罗列型|||文字叠加':0.73,
        },
        // Profile 4: 重CTA → CTA_STYLE 相关组合得分高
        4: {
          '直接促销|||产品特写':0.89,'直接促销|||快节奏电子':0.91,'直接促销|||问题前置型':0.87,'直接促销|||对比反差型':0.84,
          '限时优惠|||产品特写':0.86,'限时优惠|||激昂管弦':0.82,'限时优惠|||悬念递进型':0.83,
          '软性引导|||场景展示':0.85,'软性引导|||故事叙述型':0.86,'软性引导|||真人出镜':0.87,'软性引导|||舒缓钢琴':0.88,
          '问题引导|||场景展示':0.81,'问题引导|||故事叙述型':0.79,'问题引导|||无BGM':0.77,
          '无CTA|||N/A':0.30, // placeholder to avoid zero-profile
          '产品特写|||限时优惠':0.83,'真人出镜|||软性引导':0.82,'动画演示|||软性引导':0.80,
          '悬念递进型|||场景展示':0.73,'清单罗列型|||产品特写':0.72,
        },
        // Profile 5: 美妆类 → 故事+真人+舒缓组合突出
        5: {
          '故事叙述型|||真人出镜':0.88,'故事叙述型|||场景展示':0.86,'故事叙述型|||舒缓钢琴':0.89,'故事叙述型|||软性引导':0.87,
          '问题前置型|||真人出镜':0.84,'问题前置型|||舒缓钢琴':0.85,'问题前置型|||软性引导':0.82,
          '真人出镜|||舒缓钢琴':0.86,'真人出镜|||软性引导':0.85,'真人出镜|||场景展示':0.83,
          '场景展示|||舒缓钢琴':0.85,'场景展示|||轻松吉他':0.82,'场景展示|||软性引导':0.84,
          '产品特写|||限时优惠':0.82,'产品特写|||快节奏电子':0.80,
          '对比反差型|||快节奏电子':0.72,'清单罗列型|||直接促销':0.70,'悬念递进型|||产品特写':0.71,
        },
        // Profile 6: 数码电子类 → 产品特写+快节奏+直接促销组合突出
        6: {
          '产品特写|||快节奏电子':0.90,'产品特写|||激昂管弦':0.85,'产品特写|||直接促销':0.88,'产品特写|||限时优惠':0.86,
          '快节奏电子|||直接促销':0.91,'快节奏电子|||限时优惠':0.87,'快节奏电子|||产品特写':0.89,
          '对比反差型|||产品特写':0.86,'对比反差型|||快节奏电子':0.85,'对比反差型|||直接促销':0.84,
          '动画演示|||快节奏电子':0.85,'动画演示|||产品特写':0.83,
          '清单罗列型|||文字叠加':0.81,'清单罗列型|||产品特写':0.80,'清单罗列型|||限时优惠':0.79,
          '故事叙述型|||场景展示':0.71,'故事叙述型|||舒缓钢琴':0.70,'真人出镜|||舒缓钢琴':0.68,
        },
        // Profile 7: 食品类 → 对比反差+轻松+限时优惠组合突出
        7: {
          '对比反差型|||产品特写':0.87,'对比反差型|||文字叠加':0.84,'对比反差型|||轻松吉他':0.86,'对比反差型|||限时优惠':0.85,
          '悬念递进型|||场景展示':0.84,'悬念递进型|||轻松吉他':0.83,'悬念递进型|||限时优惠':0.82,
          '文字叠加|||轻松吉他':0.84,'文字叠加|||限时优惠':0.83,'文字叠加|||无BGM':0.80,
          '轻松吉他|||限时优惠':0.85,'轻松吉他|||直接促销':0.82,
          '清单罗列型|||产品特写':0.81,'清单罗列型|||限时优惠':0.80,
          '快节奏电子|||直接促销':0.82,'场景展示|||软性引导':0.80,
          '问题前置型|||真人出镜':0.72,'故事叙述型|||场景展示':0.70,'真人出镜|||舒缓钢琴':0.71,
        },
        // Profile 8: 家居类 → 场景展示+无BGM+问题引导组合突出
        8: {
          '场景展示|||无BGM':0.87,'场景展示|||轻松吉他':0.85,'场景展示|||问题引导':0.84,'场景展示|||软性引导':0.83,
          '动画演示|||无BGM':0.84,'动画演示|||轻松吉他':0.83,'动画演示|||问题引导':0.82,
          '文字叠加|||无BGM':0.83,'文字叠加|||问题引导':0.81,'文字叠加|||软性引导':0.80,
          '无BGM|||问题引导':0.86,'无BGM|||软性引导':0.83,
          '清单罗列型|||场景展示':0.80,'清单罗列型|||轻松吉他':0.79,
          '故事叙述型|||场景展示':0.82,'故事叙述型|||无BGM':0.81,
          '产品特写|||快节奏电子':0.72,'快节奏电子|||直接促销':0.70,
        },
      };

      const lowAffinity: Record<string, Record<string, number>> = {
        0: {
          '问题前置型|||场景展示':0.22,'悬念递进型|||产品特写':0.28,'对比反差型|||场景展示':0.25,
          '故事叙述型|||产品特写':0.28,'清单罗列型|||场景展示':0.20,'清单罗列型|||真人出镜':0.25,
          '问题前置型|||舒缓钢琴':0.22,'悬念递进型|||舒缓钢琴':0.24,'对比反差型|||舒缓钢琴':0.20,
          '故事叙述型|||快节奏电子':0.26,'清单罗列型|||快节奏电子':0.28,
          '问题前置型|||软性引导':0.25,'悬念递进型|||直接促销':0.28,'对比反差型|||软性引导':0.24,
          '故事叙述型|||直接促销':0.26,'清单罗列型|||软性引导':0.28,
          '产品特写|||舒缓钢琴':0.20,'场景展示|||快节奏电子':0.24,'文字叠加|||快节奏电子':0.28,
          '真人出镜|||激昂管弦':0.26,'动画演示|||舒缓钢琴':0.22,
          '产品特写|||软性引导':0.22,'场景展示|||直接促销':0.28,'文字叠加|||软性引导':0.26,
          '真人出镜|||直接促销':0.20,'动画演示|||限时优惠':0.22,
          '快节奏电子|||软性引导':0.20,'激昂管弦|||软性引导':0.22,'舒缓钢琴|||直接促销':0.28,
          '轻松吉他|||直接促销':0.22,'无BGM|||直接促销':0.30,
        },
        // Profile 1: 叙事主导 → 视觉/BGM/CTA 组合为低亲和
        1: {
          '产品特写|||舒缓钢琴':0.18,'产品特写|||轻松吉他':0.20,'产品特写|||软性引导':0.19,'产品特写|||问题引导':0.22,
          '场景展示|||快节奏电子':0.20,'场景展示|||激昂管弦':0.18,'场景展示|||直接促销':0.22,'场景展示|||限时优惠':0.24,
          '文字叠加|||快节奏电子':0.22,'文字叠加|||激昂管弦':0.20,'文字叠加|||软性引导':0.21,'文字叠加|||问题引导':0.24,
          '真人出镜|||激昂管弦':0.22,'真人出镜|||无BGM':0.25,'真人出镜|||直接促销':0.18,'真人出镜|||限时优惠':0.20,
          '动画演示|||舒缓钢琴':0.18,'动画演示|||无BGM':0.22,'动画演示|||限时优惠':0.19,'动画演示|||问题引导':0.24,
          '快节奏电子|||软性引导':0.18,'快节奏电子|||问题引导':0.20,
          '激昂管弦|||软性引导':0.19,'激昂管弦|||问题引导':0.22,
          '舒缓钢琴|||直接促销':0.22,'舒缓钢琴|||限时优惠':0.20,
          '轻松吉他|||直接促销':0.18,'轻松吉他|||限时优惠':0.22,
          '无BGM|||直接促销':0.24,'无BGM|||限时优惠':0.22,
        },
        // Profile 2: 视觉主导 → 叙事/BGM/CTA 组合为低亲和
        2: {
          '问题前置型|||快节奏电子':0.22,'问题前置型|||激昂管弦':0.24,'问题前置型|||直接促销':0.25,'问题前置型|||限时优惠':0.22,
          '悬念递进型|||快节奏电子':0.20,'悬念递进型|||激昂管弦':0.22,'悬念递进型|||直接促销':0.24,'悬念递进型|||限时优惠':0.26,
          '对比反差型|||快节奏电子':0.24,'对比反差型|||激昂管弦':0.22,'对比反差型|||直接促销':0.20,'对比反差型|||限时优惠':0.18,
          '故事叙述型|||快节奏电子':0.22,'故事叙述型|||激昂管弦':0.26,'故事叙述型|||直接促销':0.24,'故事叙述型|||限时优惠':0.20,
          '清单罗列型|||快节奏电子':0.24,'清单罗列型|||激昂管弦':0.22,'清单罗列型|||直接促销':0.26,'清单罗列型|||限时优惠':0.24,
          '快节奏电子|||问题引导':0.24,'快节奏电子|||无CTA':0.22,
          '激昂管弦|||问题引导':0.26,'激昂管弦|||无CTA':0.24,
          '舒缓钢琴|||直接促销':0.28,'舒缓钢琴|||限时优惠':0.26,'舒缓钢琴|||问题引导':0.24,
          '轻松吉他|||直接促销':0.24,'轻松吉他|||限时优惠':0.28,'轻松吉他|||问题引导':0.26,
          '无BGM|||直接促销':0.22,'无BGM|||限时优惠':0.26,'无BGM|||无CTA':0.28,
        },
        // Profile 3: BGM主导 → 叙事/视觉/CTA 为低亲和
        3: {
          '问题前置型|||产品特写':0.20,'问题前置型|||文字叠加':0.22,'问题前置型|||直接促销':0.24,
          '悬念递进型|||场景展示':0.22,'悬念递进型|||真人出镜':0.24,'悬念递进型|||直接促销':0.26,
          '对比反差型|||产品特写':0.24,'对比反差型|||动画演示':0.22,'对比反差型|||直接促销':0.20,
          '故事叙述型|||产品特写':0.22,'故事叙述型|||文字叠加':0.24,'故事叙述型|||直接促销':0.26,
          '清单罗列型|||产品特写':0.20,'清单罗列型|||场景展示':0.22,
          '产品特写|||软性引导':0.20,'产品特写|||问题引导':0.18,'产品特写|||直接促销':0.22,'产品特写|||限时优惠':0.24,
          '场景展示|||直接促销':0.24,'场景展示|||限时优惠':0.22,
          '文字叠加|||软性引导':0.26,'文字叠加|||问题引导':0.24,'文字叠加|||直接促销':0.22,'文字叠加|||限时优惠':0.20,
          '真人出镜|||直接促销':0.18,'真人出镜|||限时优惠':0.22,'真人出镜|||软性引导':0.20,'真人出镜|||问题引导':0.24,
          '动画演示|||直接促销':0.22,'动画演示|||限时优惠':0.18,'动画演示|||软性引导':0.20,'动画演示|||问题引导':0.24,
        },
        // Profile 4: CTA主导 → 叙事/视觉/BGM 为低亲和
        4: {
          '问题前置型|||产品特写':0.22,'问题前置型|||场景展示':0.20,'问题前置型|||快节奏电子':0.18,
          '悬念递进型|||场景展示':0.24,'悬念递进型|||动画演示':0.22,'悬念递进型|||激昂管弦':0.20,
          '对比反差型|||产品特写':0.20,'对比反差型|||场景展示':0.18,'对比反差型|||快节奏电子':0.22,
          '故事叙述型|||产品特写':0.24,'故事叙述型|||文字叠加':0.22,'故事叙述型|||快节奏电子':0.20,
          '清单罗列型|||场景展示':0.22,'清单罗列型|||真人出镜':0.20,'清单罗列型|||激昂管弦':0.18,
          '产品特写|||舒缓钢琴':0.24,'产品特写|||轻松吉他':0.22,'产品特写|||无BGM':0.26,
          '场景展示|||快节奏电子':0.22,'场景展示|||激昂管弦':0.24,'场景展示|||无BGM':0.28,
          '文字叠加|||舒缓钢琴':0.26,'文字叠加|||轻松吉他':0.24,'文字叠加|||无BGM':0.28,
          '真人出镜|||快节奏电子':0.22,'真人出镜|||激昂管弦':0.24,'真人出镜|||无BGM':0.26,
          '动画演示|||舒缓钢琴':0.24,'动画演示|||激昂管弦':0.28,'动画演示|||无BGM':0.30,
        },
        // Profile 5: 美妆 → 快节奏+直接促销+对比反差为低
        5: {
          '对比反差型|||产品特写':0.22,'对比反差型|||快节奏电子':0.18,'对比反差型|||直接促销':0.20,
          '清单罗列型|||产品特写':0.24,'清单罗列型|||快节奏电子':0.22,'清单罗列型|||直接促销':0.20,
          '悬念递进型|||产品特写':0.26,'悬念递进型|||直接促销':0.24,
          '产品特写|||激昂管弦':0.22,
          '快节奏电子|||直接促销':0.20,'快节奏电子|||限时优惠':0.22,'快节奏电子|||软性引导':0.18,'快节奏电子|||问题引导':0.24,
          '激昂管弦|||直接促销':0.22,'激昂管弦|||限时优惠':0.20,'激昂管弦|||软性引导':0.24,'激昂管弦|||问题引导':0.26,
          '无BGM|||直接促销':0.26,'无BGM|||限时优惠':0.24,
        },
        // Profile 6: 数码 → 舒缓+故事+软性引导为低
        6: {
          '故事叙述型|||场景展示':0.22,'故事叙述型|||真人出镜':0.20,'故事叙述型|||舒缓钢琴':0.18,'故事叙述型|||软性引导':0.22,
          '问题前置型|||舒缓钢琴':0.24,'问题前置型|||软性引导':0.22,
          '真人出镜|||舒缓钢琴':0.20,'真人出镜|||软性引导':0.24,'真人出镜|||轻松吉他':0.22,
          '场景展示|||舒缓钢琴':0.24,'场景展示|||软性引导':0.22,
          '舒缓钢琴|||软性引导':0.22,'舒缓钢琴|||问题引导':0.26,'舒缓钢琴|||直接促销':0.24,
          '轻松吉他|||软性引导':0.28,'轻松吉他|||问题引导':0.26,'轻松吉他|||直接促销':0.24,
          '无BGM|||软性引导':0.26,'无BGM|||问题引导':0.28,
          '动画演示|||舒缓钢琴':0.22,'动画演示|||软性引导':0.24,
        },
        // Profile 7: 食品 → 真人出镜+舒缓+无BGM为低
        7: {
          '问题前置型|||真人出镜':0.20,'问题前置型|||舒缓钢琴':0.22,'问题前置型|||无BGM':0.24,
          '故事叙述型|||真人出镜':0.22,'故事叙述型|||舒缓钢琴':0.20,'故事叙述型|||产品特写':0.24,
          '真人出镜|||舒缓钢琴':0.20,'真人出镜|||无BGM':0.22,'真人出镜|||快节奏电子':0.24,
          '场景展示|||快节奏电子':0.26,'场景展示|||激昂管弦':0.24,'场景展示|||无BGM':0.22,
          '快节奏电子|||软性引导':0.26,'快节奏电子|||问题引导':0.24,
          '激昂管弦|||软性引导':0.28,'激昂管弦|||问题引导':0.26,
          '舒缓钢琴|||直接促销':0.26,'舒缓钢琴|||限时优惠':0.24,'舒缓钢琴|||软性引导':0.22,
          '无BGM|||直接促销':0.24,'无BGM|||限时优惠':0.22,'无BGM|||软性引导':0.20,
          '动画演示|||舒缓钢琴':0.22,'文字叠加|||快节奏电子':0.24,
        },
        // Profile 8: 家居 → 快节奏+激昂+直接促销+紧迫CTA为低
        8: {
          '产品特写|||快节奏电子':0.22,'产品特写|||激昂管弦':0.24,'产品特写|||直接促销':0.20,
          '快节奏电子|||直接促销':0.22,'快节奏电子|||限时优惠':0.24,'快节奏电子|||软性引导':0.20,'快节奏电子|||问题引导':0.26,
          '激昂管弦|||直接促销':0.24,'激昂管弦|||限时优惠':0.22,'激昂管弦|||软性引导':0.26,'激昂管弦|||问题引导':0.28,
          '问题前置型|||快节奏电子':0.26,'问题前置型|||激昂管弦':0.24,'问题前置型|||直接促销':0.22,
          '悬念递进型|||快节奏电子':0.24,'悬念递进型|||激昂管弦':0.26,'悬念递进型|||直接促销':0.28,
          '对比反差型|||快节奏电子':0.28,'对比反差型|||激昂管弦':0.26,'对比反差型|||直接促销':0.24,
          '真人出镜|||快节奏电子':0.22,'真人出镜|||激昂管弦':0.24,
          '动画演示|||快节奏电子':0.26,'动画演示|||激昂管弦':0.28,
        },
      };

      const high = profileHigh[profileIndex];
      const low = lowAffinity[profileIndex];

      if (high && high[pair]) return high[pair];
      const reversePair = `${yKey}|||${xKey}`;
      if (high && high[reversePair]) return high[reversePair];
      if (low && low[pair]) return low[pair];
      if (low && low[reversePair]) return low[reversePair];

      // 中等亲和：未在矩阵中定义的组合，用基于标签索引的散列生成差异化基准 (0.35~0.65，加上 profile 偏移)
      const xIdx = xLabels.indexOf(xKey);
      const yIdx = yLabels.indexOf(yKey);
      if (xIdx >= 0 && yIdx >= 0) {
        const indexHash = ((xIdx * 31 + yIdx * 17 + seed + profileIndex * 7) & 0x7fffffff);
        return 0.35 + (indexHash % 301) / 1000; // 0.35 ~ 0.65
      }
      return 0.50;
    };

    for (const xKey of xLabels) {
      for (const yKey of yLabels) {
        const baseScore = getBaseScore(xKey, yKey);

        // 添加基于种子的噪声，范围 ±0.10
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const noise = (this.u32ToFloat(s) - 0.5) * 0.20;
        const rawScore = Math.max(0.1, Math.min(0.95, baseScore + noise));
        const score = Math.round(rawScore * 10000) / 10000;

        // contribution_rate: baseScore 减均值(0.5) 映射为 ±0.3 贡献区间
        const baseContrib = (baseScore - 0.5) * 0.6;
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const contribNoise = (this.u32ToFloat(s) - 0.5) * 0.15;
        const contributionRate = Math.round(Math.max(-0.4, Math.min(0.4, baseContrib + contribNoise)) * 10000) / 10000;

        // sample_size: 高亲和组合有更大样本量
        const sampleSizeBase = baseScore > 0.65 ? 350 : 100;
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const sampleSize = Math.floor(sampleSizeBase + (this.u32ToFloat(s) - 0.5) * 200 + 100);

        let confidenceTag: ConfidenceTag;
        if (sampleSize >= ANALYTICS_CONSTANTS.CONFIDENCE_HIGH_THRESHOLD) {
          confidenceTag = 'HIGH';
        } else if (sampleSize >= ANALYTICS_CONSTANTS.CONFIDENCE_MEDIUM_THRESHOLD) {
          confidenceTag = 'MEDIUM';
        } else {
          confidenceTag = 'LOW';
        }

        const insufficientData = sampleSize < ANALYTICS_CONSTANTS.INSUFFICIENT_DATA_THRESHOLD;

        cells.push({
          x_key: xKey,
          y_key: yKey,
          score,
          contribution_rate: contributionRate,
          sample_size: sampleSize,
          confidence_tag: confidenceTag,
          insufficient_data: insufficientData,
        });
      }
    }

    this.logger.debug(
      `生成模拟风格因子热力图(亲和矩阵profile=${profileIndex}): productId=${productId}, cells=${cells.length}`,
    );

    return {
      x_axis_labels: xLabels.slice(),
      y_axis_labels: yLabels.slice(),
      cells,
    };
  }

  private hashProductId(productId: string): number {
    let hash = 5381;
    for (let i = 0; i < productId.length; i++) {
      hash = ((hash << 5) + hash + productId.charCodeAt(i)) & 0x7fffffff;
    }
    return hash || 1;
  }

  private u32ToFloat(u32: number): number {
    return (u32 & 0x7fffffff) / 0x7fffffff;
  }

  private getMockLabelsForDimension(dimension: string): readonly string[] {
    const map = ANALYTICS_CONSTANTS.MOCK_LABEL_MAP;
    if (dimension === 'NARRATIVE_STRATEGY') {
      return map.NARRATIVE_STRATEGY;
    }
    if (dimension === 'VISUAL_STYLE') {
      return map.VISUAL_STYLE;
    }
    if (dimension === 'BGM_STYLE') {
      return map.BGM_STYLE;
    }
    if (dimension === 'CTA_STYLE') {
      return map.CTA_STYLE;
    }
    return map.NARRATIVE_STRATEGY;
  }

  // ===========================================================================
  // [7.4] computeTopContributors — 正负贡献 TopN 排序提取 O(n log n)
  // ===========================================================================

  private computeTopContributors(
    cells: HeatmapCell[],
    topN: number,
  ): {
    top_positive_factors: Array<{ factor: string; contribution: number }>;
    top_negative_factors: Array<{ factor: string; contribution: number }>;
  } {
    if (!cells || cells.length === 0) {
      return {
        top_positive_factors: [],
        top_negative_factors: [],
      };
    }

    const filtered = cells.filter(
      (c) => c.contribution_rate !== undefined && c.contribution_rate !== null,
    );

    const sorted = [...filtered].sort(
      (a, b) => (b.contribution_rate as number) - (a.contribution_rate as number),
    );

    const positives: Array<{ factor: string; contribution: number }> = [];
    for (const cell of sorted) {
      const rate = cell.contribution_rate as number;
      if (rate > 0 && positives.length < topN) {
        positives.push({
          factor: `${cell.x_key} × ${cell.y_key}`,
          contribution: Math.round(rate * 10000) / 10000,
        });
      }
      if (positives.length >= topN) {
        break;
      }
    }

    const negatives: Array<{ factor: string; contribution: number }> = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const rate = sorted[i].contribution_rate as number;
      if (rate < 0 && negatives.length < topN) {
        negatives.push({
          factor: `${sorted[i].x_key} × ${sorted[i].y_key}`,
          contribution: Math.round(rate * 10000) / 10000,
        });
      }
      if (negatives.length >= topN) {
        break;
      }
    }

    return {
      top_positive_factors: positives,
      top_negative_factors: negatives,
    };
  }

  // ===========================================================================
  // [7.5] buildHeatmapSummary — 汇总统计 O(n) 单次遍历
  // ===========================================================================

  private buildHeatmapSummary(
    cells: HeatmapCell[],
    metric: string,
  ): Record<string, unknown> {
    if (!cells || cells.length === 0) {
      return { total_cells: 0, metric };
    }

    let totalScore = 0;
    let maxScore = -Infinity;
    let minScore = Infinity;
    let totalContribution = 0;
    let contributionCount = 0;
    let insufficientCount = 0;

    for (const cell of cells) {
      totalScore += cell.score;
      if (cell.score > maxScore) {
        maxScore = cell.score;
      }
      if (cell.score < minScore) {
        minScore = cell.score;
      }
      if (cell.contribution_rate !== undefined && cell.contribution_rate !== null) {
        totalContribution += cell.contribution_rate;
        contributionCount++;
      }
      if (cell.insufficient_data) {
        insufficientCount++;
      }
    }

    const meanScore =
      Math.round((totalScore / cells.length) * 10000) / 10000;
    const meanContributionRate =
      contributionCount > 0
        ? Math.round((totalContribution / contributionCount) * 10000) / 10000
        : 0;

    return {
      total_cells: cells.length,
      mean_score: meanScore,
      max_score: Math.round(maxScore * 10000) / 10000,
      min_score: Math.round(minScore * 10000) / 10000,
      mean_contribution_rate: meanContributionRate,
      cells_with_insufficient_data: insufficientCount,
      metric,
    };
  }

  // ===========================================================================
  // [8] getAudioVisualSankey — 视听留存桑基图主编排 (6 步调用链)
  //   [8.1] validateAudioVisualSankeyParams  [8.2] validateProductExists
  //   [8.3] fetchAudioVisualSankeyData        [8.4] buildSankeyNodes
  //   [8.5] buildSankeyLinks                  [8.6] buildSankeySummary
  // ===========================================================================

  async getAudioVisualSankey(dto: AudioVisualSankeyDto): Promise<AudioVisualSankeyResponse> {
    this.logger.log(
      `查询视听留存桑基图: product_id=${dto.product_id}, creation_id=${dto.creation_id ?? 'ALL'}, source=${dto.source_dimension ?? 'BGM_STYLE'}, middle=${dto.middle_dimension ?? 'VISUAL_STYLE'}, target=${dto.target_dimension ?? 'RETENTION_BUCKET'}, time_range=${dto.time_range ?? '30d'}`,
    );

    this.validateAudioVisualSankeyParams(
      dto.product_id,
      dto.creation_id,
      dto.source_dimension,
      dto.middle_dimension,
      dto.target_dimension,
    );

    await this.validateProductExists(dto.product_id);

    const sankeyData = await this.fetchAudioVisualSankeyData(
      dto.product_id,
      dto.creation_id ?? undefined,
      dto.time_range,
    );

    const allNodes = this.buildSankeyNodes(
      sankeyData.bgm_nodes.map((n) => n.name),
      sankeyData.visual_nodes.map((n) => n.name),
      sankeyData.retention_nodes.map((n) => n.name),
    );

    const allLinks = this.buildSankeyLinks(
      sankeyData.bgm_to_visual_links.map((l) => ({
        source: l.source,
        target: l.target,
        flow_count: l.value,
      })),
      sankeyData.visual_to_retention_links.map((l) => ({
        source: l.source,
        target: l.target,
        flow_count: l.value,
      })),
    );

    const summary = this.buildSankeySummary(allNodes, allLinks);

    const response: AudioVisualSankeyResponse = {
      product_id: dto.product_id,
      creation_id: dto.creation_id,
      metric: ANALYTICS_CONSTANTS.SANKEY_DEFAULT_METRIC,
      nodes: allNodes,
      links: allLinks,
      summary,
      data_source: 'DUCKDB_PRECOMPUTED',
      is_mock: sankeyData.is_mock,
      is_predicted: sankeyData.is_predicted,
      generated_at: new Date().toISOString(),
    };

    this.logger.log(
      `视听留存桑基图计算完成: product_id=${dto.product_id}, nodes=${allNodes.length}, links=${allLinks.length}, is_mock=${sankeyData.is_mock}`,
    );

    return response;
  }

  // ===========================================================================
  // [8.1] validateAudioVisualSankeyParams — 参数白名单校验
  // ===========================================================================

  private validateAudioVisualSankeyParams(
    productId: string,
    creationId?: string,
    sourceDimension?: HeatmapDimension,
    middleDimension?: HeatmapDimension,
    targetDimension?: string,
  ): void {
    if (!productId || productId.trim().length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.PRODUCT_ID_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      creationId !== undefined &&
      creationId !== null &&
      creationId.trim().length === 0
    ) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.CREATION_ID_BLANK,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      sourceDimension !== undefined &&
      !(ANALYTICS_CONSTANTS.SANKEY_VALID_SOURCE_DIMENSIONS as readonly string[]).includes(sourceDimension)
    ) {
      throw serviceException(
        {
          message: `source_dimension 取值必须为 ${ANALYTICS_CONSTANTS.SANKEY_VALID_SOURCE_DIMENSIONS.join(' / ')}，实际为 "${sourceDimension}"`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      middleDimension !== undefined &&
      !(ANALYTICS_CONSTANTS.SANKEY_VALID_MIDDLE_DIMENSIONS as readonly string[]).includes(middleDimension)
    ) {
      throw serviceException(
        {
          message: `middle_dimension 取值必须为 ${ANALYTICS_CONSTANTS.SANKEY_VALID_MIDDLE_DIMENSIONS.join(' / ')}，实际为 "${middleDimension}"`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      targetDimension !== undefined &&
      targetDimension !== null &&
      !(ANALYTICS_CONSTANTS.SANKEY_VALID_TARGET_DIMENSIONS as readonly string[]).includes(targetDimension)
    ) {
      throw serviceException(
        {
          message: `target_dimension 取值必须为 ${ANALYTICS_CONSTANTS.SANKEY_VALID_TARGET_DIMENSIONS.join(' / ')}，实际为 "${targetDimension}"`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ===========================================================================
  // [8.3] fetchAudioVisualSankeyData — DuckDB 数据获取 + 静默降级 Mock
  // ===========================================================================

  private async fetchAudioVisualSankeyData(
    productId: string,
    creationId: string | undefined,
    timeRange?: '7d' | '30d' | '90d',
  ): Promise<AudioVisualSankeyDataBundle> {
    try {
      const data = await this.queryDuckDBSankeyNative(productId, creationId);

      if (
        data &&
        data.rows &&
        Array.isArray(data.rows) &&
        data.rows.length > 0
      ) {
        const rows = data.rows as AudioVisualSankeyDuckDBRow[];

        const bgmSet = new Set<string>();
        const visualSet = new Set<string>();
        const retentionSet = new Set<string>();
        const bgmToVisualMap = new Map<string, number>();
        const visualToRetentionMap = new Map<string, number>();

        for (const row of rows) {
          bgmSet.add(row.bgm_style);
          visualSet.add(row.visual_style);
          retentionSet.add(row.retention_bucket);

          const bvKey = `${row.bgm_style}${ANALYTICS_CONSTANTS.SANKEY_BGM_VISUAL_DELIMITER}${row.visual_style}`;
          bgmToVisualMap.set(bvKey, (bgmToVisualMap.get(bvKey) ?? 0) + row.flow_count);

          const vrKey = `${row.visual_style}${ANALYTICS_CONSTANTS.SANKEY_BGM_VISUAL_DELIMITER}${row.retention_bucket}`;
          visualToRetentionMap.set(vrKey, (visualToRetentionMap.get(vrKey) ?? 0) + row.flow_count);
        }

        const bgmNodeList = Array.from(bgmSet);
        const visualNodeList = Array.from(visualSet);
        const retentionNodeList = Array.from(retentionSet);

        const bgm_nodes: SankeyNode[] = bgmNodeList.map((name, i) => ({
          node_id: `bgm_${i}`,
          name,
          dimension: 'BGM_STYLE' as const,
        }));
        const visual_nodes: SankeyNode[] = visualNodeList.map((name, i) => ({
          node_id: `visual_${i}`,
          name,
          dimension: 'VISUAL_STYLE' as const,
        }));
        const retention_nodes: SankeyNode[] = retentionNodeList.map((name, i) => ({
          node_id: `retention_${i}`,
          name,
          dimension: 'RETENTION_BUCKET' as const,
        }));

        const bgmToVisualLinks: SankeyLink[] = [];
        for (const [key, flow] of bgmToVisualMap.entries()) {
          const parts = key.split(ANALYTICS_CONSTANTS.SANKEY_BGM_VISUAL_DELIMITER);
          const sourceName = parts[0];
          const targetName = parts[1];
          const sourceIdx = bgmNodeList.indexOf(sourceName);
          const targetIdx = visualNodeList.indexOf(targetName);
          bgmToVisualLinks.push({
            source: `bgm_${sourceIdx}`,
            target: `visual_${targetIdx}`,
            value: flow,
          });
        }

        const visualToRetentionLinks: SankeyLink[] = [];
        for (const [key, flow] of visualToRetentionMap.entries()) {
          const parts = key.split(ANALYTICS_CONSTANTS.SANKEY_BGM_VISUAL_DELIMITER);
          const sourceName = parts[0];
          const targetName = parts[1];
          const sourceIdx = visualNodeList.indexOf(sourceName);
          const targetIdx = retentionNodeList.indexOf(targetName);
          if (sourceIdx === -1 || targetIdx === -1) {
            this.logger.warn(`Sankey Visual→Retention 节点未找到: source=${sourceName}(${sourceIdx}), target=${targetName}(${targetIdx})`);
            continue;
          }
          visualToRetentionLinks.push({
            source: `visual_${sourceIdx}`,
            target: `retention_${targetIdx}`,
            value: flow,
          });
        }

        return {
          bgm_nodes,
          visual_nodes,
          retention_nodes,
          bgm_to_visual_links: bgmToVisualLinks,
          visual_to_retention_links: visualToRetentionLinks,
          is_mock: false,
          is_predicted: true,
        };
      }

      this.logger.warn(
        `DuckDB 桑基图查询返回空数据集: productId=${productId}, creationId=${creationId ?? 'ALL'}, 降级为预测数据`,
      );
      return this.fallbackToMockAudioVisualSankey(productId, timeRange);
    } catch (error) {
      this.logger.warn(
        `DuckDB 桑基图查询异常, 降级为预测数据: productId=${productId}, creationId=${creationId ?? 'ALL'}, error=${(error as Error)?.message ?? error}`,
      );
      return this.fallbackToMockAudioVisualSankey(productId, timeRange);
    }
  }

  // ===========================================================================
  // [8.3a] queryDuckDBSankeyNative — DuckDB 原生桑基图查询 (门控 + 超时 + 动态 import)
  // ===========================================================================

  private async queryDuckDBSankeyNative(
    productId: string,
    creationId: string | undefined,
  ): Promise<{ rows: AudioVisualSankeyDuckDBRow[] } | null> {
    const duckDBEnv = env('DB_ENABLED', 'DUCKDB_ENABLED');
    const duckDBPath = env('DB_PATH', 'DUCKDB_PATH');

    if (duckDBEnv !== 'true' || !duckDBPath) {
      this.logger.debug(
        `DuckDB 未启用 (DB_ENABLED=${duckDBEnv}, DB_PATH=${duckDBPath}), 跳过桑基图真实查询`,
      );
      return null;
    }

    try {
      const duckdb = await this.loadDuckDBModule();
      if (!duckdb) {
        return null;
      }

      // @ts-expect-error @duckdb/node-api 无官方类型声明，运行时动态可用
      const connection = await duckdb.connect(duckDBPath);

      const hasCreationFilter = creationId !== undefined && creationId !== null && creationId.trim().length > 0;
      let sql: string;
      let params: string[];

      if (hasCreationFilter) {
        sql = `SELECT bgm_style, visual_style, retention_bucket, flow_count, avg_retention_rate
FROM analytics.audio_visual_sankey
WHERE product_id = ? AND creation_id = ?
ORDER BY flow_count DESC`;
        params = [productId, creationId];
      } else {
        sql = `SELECT bgm_style, visual_style, retention_bucket, flow_count, avg_retention_rate
FROM analytics.audio_visual_sankey
WHERE product_id = ?
ORDER BY flow_count DESC`;
        params = [productId];
      }

      const result = await connection.query(sql, params);

      await connection.close();

      if (!result || !Array.isArray(result) || result.length === 0) {
        this.logger.debug(
          `DuckDB 桑基图查询返回 0 行: productId=${productId}, creationId=${creationId ?? 'ALL'}`,
        );
        return null;
      }

      const rows = result as AudioVisualSankeyDuckDBRow[];

      const sanitizedRows: AudioVisualSankeyDuckDBRow[] = [];
      for (const row of rows) {
        sanitizedRows.push({
          bgm_style: String(row.bgm_style ?? ''),
          visual_style: String(row.visual_style ?? ''),
          retention_bucket: String(row.retention_bucket ?? ''),
          flow_count: Math.max(0, Number(row.flow_count) || 0),
          avg_retention_rate: Math.max(0, Math.min(1, Number(row.avg_retention_rate) || 0)),
        });
      }

      return { rows: sanitizedRows };
    } catch (error) {
      this.logger.warn(
        `DuckDB 原生桑基图查询失败: productId=${productId}, creationId=${creationId ?? 'ALL'}, error=${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  // ===========================================================================
  // [8.3b] fallbackToMockAudioVisualSankey — 确定性 Mock 桑基图生成
  // ===========================================================================

  private fallbackToMockAudioVisualSankey(productId: string, timeRange?: '7d' | '30d' | '90d'): AudioVisualSankeyDataBundle {
    const seed = this.hashProductId(productId);
    // 将 time_range 混入种子：7d/30d/90d 产生不同流转分布
    const timeRangeOffset = timeRange === '7d' ? 100 : timeRange === '30d' ? 200 : timeRange === '90d' ? 300 : 200;
    let s = seed + timeRangeOffset;

    const bgmLabels = [...ANALYTICS_CONSTANTS.MOCK_LABEL_MAP.BGM_STYLE];
    const visualLabels = [...ANALYTICS_CONSTANTS.MOCK_LABEL_MAP.VISUAL_STYLE];
    const retentionLabels = [...ANALYTICS_CONSTANTS.RETENTION_BUCKET_NAMES];

    const bgm_nodes: SankeyNode[] = bgmLabels.map((name, i) => ({
      node_id: `bgm_${i}`,
      name,
      dimension: 'BGM_STYLE' as const,
    }));
    const visual_nodes: SankeyNode[] = visualLabels.map((name, i) => ({
      node_id: `visual_${i}`,
      name,
      dimension: 'VISUAL_STYLE' as const,
    }));
    const retention_nodes: SankeyNode[] = retentionLabels.map((name, i) => ({
      node_id: `retention_${i}`,
      name,
      dimension: 'RETENTION_BUCKET' as const,
    }));

    // BGM→Visual 风格亲和矩阵（基于听觉-视觉一致性研究）
    // 直接使用中文标签作为键，确保与 MOCK_LABEL_MAP 对齐
    // time_range 旋转：7d 不变，30d 右移1，90d 右移2
    const visualRotate = timeRange === '7d' ? 0 : timeRange === '30d' ? 1 : 2;
    const bgmVisualAffinity: Record<string, Record<string, number>> = {
      '快节奏电子': { '产品特写': 0.38, '文字叠加': 0.30, '动画演示': 0.15, '场景展示': 0.07, '真人出镜': 0.04 },
      '舒缓钢琴':   { '场景展示': 0.32, '真人出镜': 0.28, '文字叠加': 0.18, '产品特写': 0.08, '动画演示': 0.05 },
      '激昂管弦':   { '产品特写': 0.30, '文字叠加': 0.22, '动画演示': 0.18, '场景展示': 0.12, '真人出镜': 0.07 },
      '轻松吉他':   { '场景展示': 0.35, '真人出镜': 0.25, '产品特写': 0.18, '文字叠加': 0.10, '动画演示': 0.05 },
      '无BGM':      { '文字叠加': 0.40, '产品特写': 0.25, '场景展示': 0.15, '动画演示': 0.10, '真人出镜': 0.05 },
    };

    const bgm_to_visual_links: SankeyLink[] = [];
    for (let bi = 0; bi < bgmLabels.length; bi++) {
      const bgmKey = bgmLabels[bi];
      const affinities = bgmVisualAffinity[bgmKey] || {};
      for (let vi = 0; vi < visualLabels.length; vi++) {
        // 根据 time_range 旋转视觉标签索引
        const rotatedVi = (vi + visualRotate) % visualLabels.length;
        const visualKey = visualLabels[rotatedVi];
        const baseAffinity = affinities[visualKey] || 0.08;
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const noise = (this.u32ToFloat(s) - 0.5) * 0.06;
        const flowRatio = Math.max(0.02, baseAffinity + noise);
        const value = Math.max(1, Math.floor(flowRatio * 1000));
        bgm_to_visual_links.push({
          source: `bgm_${bi}`,
          target: `visual_${vi}`,
          value,
        });
      }
    }

    // Visual→Retention 映射：不同视觉风格有不同的留存分布特征
    // time_range 旋转留存分布：7d 不变，30d 右移1，90d 右移2
    const retentionRotate = timeRange === '7d' ? 0 : timeRange === '30d' ? 1 : 2;
    const visualRetentionAffinity: Record<string, number[]> = {
      '产品特写': [0.32, 0.28, 0.21, 0.13, 0.06],
      '场景展示': [0.22, 0.25, 0.24, 0.20, 0.09],
      '文字叠加': [0.35, 0.28, 0.20, 0.12, 0.05],
      '真人出镜': [0.30, 0.27, 0.22, 0.15, 0.06],
      '动画演示': [0.28, 0.30, 0.22, 0.14, 0.06],
    };

    const visual_to_retention_links: SankeyLink[] = [];
    for (let vi = 0; vi < visualLabels.length; vi++) {
      const visualKey = visualLabels[vi];
      const dist = visualRetentionAffinity[visualKey] || [0.20, 0.22, 0.23, 0.21, 0.14];
      for (let ri = 0; ri < retentionLabels.length; ri++) {
        // 根据 time_range 旋转留存桶索引
        const rotatedRi = (ri + retentionRotate) % retentionLabels.length;
        const baseFlow = dist[rotatedRi] || 0.1;
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const noise = (this.u32ToFloat(s) - 0.5) * 0.05;
        const value = Math.floor(Math.max(1, (baseFlow + noise) * 1000));
        visual_to_retention_links.push({
          source: `visual_${vi}`,
          target: `retention_${ri}`,
          value,
        });
      }
    }

    this.logger.debug(
      `生成模拟视听留存桑基图(含亲和模型): productId=${productId}, bgm_nodes=${bgm_nodes.length}, visual_nodes=${visual_nodes.length}, retention_nodes=${retention_nodes.length}, bv_links=${bgm_to_visual_links.length}, vr_links=${visual_to_retention_links.length}`,
    );

    return {
      bgm_nodes,
      visual_nodes,
      retention_nodes,
      bgm_to_visual_links,
      visual_to_retention_links,
      is_mock: true,
      is_predicted: true,
    };
  }

  // ===========================================================================
  // [8.4] buildSankeyNodes — 节点去重构建 (BGM_STYLE → VISUAL_STYLE → RETENTION_BUCKET)
  // ===========================================================================

  private buildSankeyNodes(
    bgmLabels: string[],
    visualLabels: string[],
    retentionLabels: string[],
  ): SankeyNode[] {
    const nodes: SankeyNode[] = [];

    for (let i = 0; i < bgmLabels.length; i++) {
      nodes.push({
        node_id: `bgm_${i}`,
        name: bgmLabels[i],
        dimension: 'BGM_STYLE' as const,
      });
    }
    for (let i = 0; i < visualLabels.length; i++) {
      nodes.push({
        node_id: `visual_${i}`,
        name: visualLabels[i],
        dimension: 'VISUAL_STYLE' as const,
      });
    }
    for (let i = 0; i < retentionLabels.length; i++) {
      nodes.push({
        node_id: `retention_${i}`,
        name: retentionLabels[i],
        dimension: 'RETENTION_BUCKET' as const,
      });
    }

    return nodes;
  }

  // ===========================================================================
  // [8.5] buildSankeyLinks — 链接构建 + contribution_rate 计算 O(n)
  // ===========================================================================

  private buildSankeyLinks(
    bgmToVisualRows: Array<{ source: string; target: string; flow_count: number }>,
    visualToRetentionRows: Array<{ source: string; target: string; flow_count: number }>,
  ): SankeyLink[] {
    const links: SankeyLink[] = [];

    for (const row of bgmToVisualRows) {
      links.push({
        source: row.source,
        target: row.target,
        value: Math.max(0, row.flow_count),
      });
    }
    for (const row of visualToRetentionRows) {
      links.push({
        source: row.source,
        target: row.target,
        value: Math.max(0, row.flow_count),
      });
    }

    const sourceFlowSum = new Map<string, number>();
    for (const link of links) {
      sourceFlowSum.set(link.source, (sourceFlowSum.get(link.source) ?? 0) + link.value);
    }

    for (const link of links) {
      const totalSourceFlow = sourceFlowSum.get(link.source) ?? link.value;
      const value = Number.isFinite(link.value) ? link.value : 0;
      if (totalSourceFlow > 0 && value > 0) {
        link.contribution_rate = Math.round((value / totalSourceFlow) * 10000) / 10000;
      } else {
        link.contribution_rate = 0;
      }
    }

    return links;
  }

  // ===========================================================================
  // [8.6] buildSankeySummary — 汇总统计 O(n) 单次遍历
  // ===========================================================================

  private buildSankeySummary(
    nodes: SankeyNode[],
    links: SankeyLink[],
  ): Record<string, unknown> {
    if (!nodes || nodes.length === 0) {
      return {
        total_nodes: 0,
        total_links: 0,
        total_flow: 0,
        bgm_style_count: 0,
        visual_style_count: 0,
        retention_bucket_count: 0,
        max_flow_link: null,
        dominant_retention_bucket: null,
        low_retention_flow_pct: 0,
      };
    }

    let totalFlow = 0;
    let maxFlowLink: SankeyLink | null = null;
    let maxFlow = -Infinity;

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      totalFlow += link.value;
      if (link.value > maxFlow) {
        maxFlow = link.value;
        maxFlowLink = link;
      }
    }

    let bgmCount = 0;
    let visualCount = 0;
    let retentionCount = 0;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.dimension === 'BGM_STYLE') {
        bgmCount++;
      } else if (node.dimension === 'VISUAL_STYLE') {
        visualCount++;
      } else if (node.dimension === 'RETENTION_BUCKET') {
        retentionCount++;
      }
    }

    const retentionFlowMap = new Map<string, number>();
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].dimension === 'RETENTION_BUCKET') {
        retentionFlowMap.set(nodes[i].node_id, 0);
      }
    }
    for (let i = 0; i < links.length; i++) {
      const targetId = links[i].target;
      if (retentionFlowMap.has(targetId)) {
        retentionFlowMap.set(targetId, (retentionFlowMap.get(targetId) ?? 0) + links[i].value);
      }
    }

    let dominantBucket: string | null = null;
    let dominantFlow = -Infinity;
    let lowFlowTotal = 0;
    let totalRetentionFlow = 0;

    const entries = Array.from(retentionFlowMap.entries());
    for (let i = 0; i < entries.length; i++) {
      const [nodeId, flow] = entries[i];
      totalRetentionFlow += flow;
      if (flow > dominantFlow) {
        dominantFlow = flow;
        dominantBucket = nodeId;
      }
      for (let j = 0; j < nodes.length; j++) {
        if (nodes[j].node_id === nodeId) {
          const bucketName = nodes[j].name;
          if (bucketName.includes('低留存') || bucketName.includes('流失')) {
            lowFlowTotal += flow;
          }
          break;
        }
      }
    }

    const lowRetentionPct =
      totalRetentionFlow > 0
        ? Math.round((lowFlowTotal / totalRetentionFlow) * 10000) / 10000
        : 0;

    return {
      total_nodes: nodes.length,
      total_links: links.length,
      total_flow: totalFlow,
      bgm_style_count: bgmCount,
      visual_style_count: visualCount,
      retention_bucket_count: retentionCount,
      max_flow_link: maxFlowLink
        ? {
            source: maxFlowLink.source,
            target: maxFlowLink.target,
            value: maxFlowLink.value,
            contribution_rate: maxFlowLink.contribution_rate,
          }
        : null,
      dominant_retention_bucket: dominantBucket,
      low_retention_flow_pct: lowRetentionPct,
    };
  }

  async getAbCompare(dto: {
    product_id: string;
    creation_id_a: string;
    creation_id_b: string;
    metric_set?: string;
  }): Promise<{
    product_id: string;
    version_a: CompareVersionSummary;
    version_b: CompareVersionSummary;
    winner: 'A' | 'B' | 'TIE';
    metrics: CompareMetricItem[];
    factor_diff: FactorDiffItem[];
    diagnosis: string[];
    recommendation?: string;
    data_source: 'DUCKDB_PRECOMPUTED';
    is_mock: boolean;
    is_predicted: boolean;
    generated_at: string;
  }> {
    const { product_id, creation_id_a, creation_id_b, metric_set } = dto;

    this.validateAbCompareParams(product_id, creation_id_a, creation_id_b);

    await this.validateProductExists(product_id);

    let creationA: CreationWithScript | null;
    let creationB: CreationWithScript | null;

    if (isMockMode()) {
      // Mock 模式：为任意 creation_id 生成模拟数据，不做 ID 匹配
      // （前端从 DB 获取的创作任务 UUID 与 mock 数据的 SHA256 生成 ID 不匹配）
      const resolveMock = (creationId: string, pid: string): MockCreationRecord => {
        let mock = getMockCreationRecord(creationId, pid);
        if (!mock) {
          // 生成一个全新的 mock Creation Record
          mock = generateFallbackMockCreationRecord(creationId, pid);
        }
        return mock;
      };
      creationA = resolveMock(creation_id_a, product_id) as unknown as CreationWithScript;
      creationB = resolveMock(creation_id_b, product_id) as unknown as CreationWithScript;
    } else {
      [creationA, creationB] = await Promise.all([
        this.repository.findCreationWithScriptOnly(creation_id_a) as Promise<CreationWithScript | null>,
        this.repository.findCreationWithScriptOnly(creation_id_b) as Promise<CreationWithScript | null>,
      ]);
    }

    this.validateCreationForAbCompare(creationA, creation_id_a, product_id, 'A');
    this.validateCreationForAbCompare(creationB, creation_id_b, product_id, 'B');

    const duckData = await this.fetchAbCompareDuckDBData(creation_id_a, creation_id_b);

    const { version_a, version_b } = this.buildAbCompareVersionSummaries(
      creationA,
      creationB,
      duckData,
    );

    const metrics = this.computeAbCompareMetricComparisons(
      version_a,
      version_b,
      duckData.metrics_a?.predicted_retention_rate,
      duckData.metrics_b?.predicted_retention_rate,
      creationA,
      creationB,
    );

    const factorDiff = this.computeAbCompareFactorDiff(creationA, creationB);

    const weights = {
      retention_weight: ANALYTICS_CONSTANTS.AB_COMPARE_WEIGHTS.RETENTION,
      completion_weight: ANALYTICS_CONSTANTS.AB_COMPARE_WEIGHTS.COMPLETION,
      ctr_weight: ANALYTICS_CONSTANTS.AB_COMPARE_WEIGHTS.CTR,
      cvr_weight: ANALYTICS_CONSTANTS.AB_COMPARE_WEIGHTS.CVR,
      duration_fit_weight: ANALYTICS_CONSTANTS.AB_COMPARE_WEIGHTS.DURATION_FIT,
    };

    const winner = this.determineAbCompareWinner(metrics, weights);

    const { diagnosis, recommendation } = this.buildAbCompareDiagnosisAndRecommendations(
      winner,
      metrics,
      factorDiff,
      version_a,
      version_b,
    );

    return {
      product_id,
      version_a,
      version_b,
      winner,
      metrics,
      factor_diff: factorDiff,
      diagnosis,
      recommendation,
      data_source: 'DUCKDB_PRECOMPUTED',
      is_mock: duckData.is_mock,
      is_predicted: duckData.is_predicted,
      generated_at: new Date().toISOString(),
    };
  }

  private validateAbCompareParams(
    productId: string,
    creationIdA: string,
    creationIdB: string,
  ): void {
    if (!productId || productId.trim().length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.PRODUCT_ID_REQUIRED,
          error: {
            code: 'INVALID_REQUEST',
            details: 'product_id 为必填字段',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!creationIdA || creationIdA.trim().length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.CREATION_ID_A_REQUIRED,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!creationIdB || creationIdB.trim().length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.CREATION_ID_B_REQUIRED,
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (creationIdA === creationIdB) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.CREATION_IDS_SAME,
          error: {
            code: 'ANALYTICS_AB_COMPARE_SAME_CREATION',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private validateCreationForAbCompare(
    creation: CreationWithScript | null,
    creationId: string,
    productId: string,
    label: 'A' | 'B',
  ): asserts creation is NonNullable<CreationWithScript> {
    const labelKey = label === 'A' ? 'AB_COMPARE_CREATION_A_NOT_FOUND' : 'AB_COMPARE_CREATION_B_NOT_FOUND';
    const productMismatchKey = label === 'A' ? 'AB_COMPARE_CREATION_A_PRODUCT_MISMATCH' : 'AB_COMPARE_CREATION_B_PRODUCT_MISMATCH';
    const scriptDeletedKey = label === 'A' ? 'AB_COMPARE_CREATION_A_SCRIPT_DELETED' : 'AB_COMPARE_CREATION_B_SCRIPT_DELETED';
    const noShotsKey = label === 'A' ? 'AB_COMPARE_CREATION_A_NO_SHOTS' : 'AB_COMPARE_CREATION_B_NO_SHOTS';

    if (!creation) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES[labelKey],
          error: { code: 'CREATION_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const creationProductId = (creation as Record<string, unknown>).productId
      ?? (creation as Record<string, unknown>).product_id;
    // Mock 模式下跳过 productId 校验（mock 数据用不同 ID 作为种子）
    if (!isMockMode() && String(creationProductId) !== productId) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES[productMismatchKey],
          error: { code: 'CREATION_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const script = (creation as Record<string, unknown>).script as Record<string, unknown> | null | undefined;
    if (!script || Object.keys(script).length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES[scriptDeletedKey],
          error: { code: 'SCRIPT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const shots = (script.shots ?? []) as Array<Record<string, unknown>>;
    if (shots.length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES[noShotsKey],
          error: { code: 'ANALYTICS_NO_SHOTS_IN_CREATION', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async fetchAbCompareDuckDBData(
    creationIdA: string,
    creationIdB: string,
  ): Promise<AbCompareDuckDBDataBundle> {
    const nativeResult = await this.queryAbCompareDuckDBNative(creationIdA, creationIdB);
    if (
      nativeResult &&
      nativeResult.metrics_a &&
      nativeResult.metrics_b &&
      typeof nativeResult.metrics_a.predicted_ctr === 'number' &&
      typeof nativeResult.metrics_b.predicted_ctr === 'number'
    ) {
      return {
        metrics_a: this.clampAbCompareDuckDBRow(nativeResult.metrics_a, creationIdA),
        metrics_b: this.clampAbCompareDuckDBRow(nativeResult.metrics_b, creationIdB),
        is_mock: false,
        is_predicted: true,
      };
    }

    this.logger.warn(
      ANALYTICS_CONSTANTS.ERROR_MESSAGES.DUCKDB_AB_COMPARE_QUERY_FAILED,
    );
    return this.buildMockAbCompareData(creationIdA, creationIdB);
  }

  private async queryAbCompareDuckDBNative(
    creationIdA: string,
    creationIdB: string,
  ): Promise<AbCompareDuckDBRowPair | null> {
    if (
      env('DB_ENABLED', 'DUCKDB_ENABLED') !== 'true' ||
      !env('DB_PATH', 'DUCKDB_PATH')
    ) {
      return null;
    }

    let duckModule: Record<string, unknown> | null = null;

    try {
      // @ts-expect-error @duckdb/node-api 可选依赖，无类型声明，运行时动态导入
      duckModule = await import('@duckdb/node-api') as Record<string, unknown>;
    } catch {
      return null;
    }

    const DuckDB = duckModule?.DuckDBInstance as
      | (new () => DuckDBInstance)
      | undefined;

    if (!DuckDB) {
      return null;
    }

    let connection: DuckDBConnection | null = null;

    try {
      const instance = new DuckDB();
      connection = await instance.connect();

      const sql = `
        SELECT
          creation_id,
          predicted_ctr,
          predicted_cvr,
          predicted_completion_rate,
          predicted_retention_rate,
          hook_type,
          hook_strength
        FROM analytics.ab_compare_predictions
        WHERE creation_id IN (?, ?)
      `;

      const runFn = connection.run as (
        sql: string,
        params?: unknown[],
      ) => Promise<{ getRowObjectsJson: () => Array<Record<string, unknown>> }>;
      const result = await runFn(sql, [creationIdA, creationIdB]);

      const rows = result.getRowObjectsJson();

      if (!Array.isArray(rows) || rows.length < 2) {
        return null;
      }

      const rowA = rows.find(
        (r) => String(r.creation_id) === creationIdA,
      );
      const rowB = rows.find(
        (r) => String(r.creation_id) === creationIdB,
      );

      if (!rowA || !rowB) {
        return null;
      }

      return {
        metrics_a: {
          creation_id: creationIdA,
          predicted_ctr: Number(rowA.predicted_ctr) || 0,
          predicted_cvr: Number(rowA.predicted_cvr) || 0,
          predicted_completion_rate: Number(rowA.predicted_completion_rate) || 0,
          predicted_retention_rate: Number(rowA.predicted_retention_rate) || 0,
          hook_type: String(rowA.hook_type ?? ''),
          hook_strength: Number(rowA.hook_strength) || 0,
        },
        metrics_b: {
          creation_id: creationIdB,
          predicted_ctr: Number(rowB.predicted_ctr) || 0,
          predicted_cvr: Number(rowB.predicted_cvr) || 0,
          predicted_completion_rate: Number(rowB.predicted_completion_rate) || 0,
          predicted_retention_rate: Number(rowB.predicted_retention_rate) || 0,
          hook_type: String(rowB.hook_type ?? ''),
          hook_strength: Number(rowB.hook_strength) || 0,
        },
        is_mock: false,
        is_predicted: true,
      };
    } catch (error) {
      this.logger.warn(
        `DuckDB AB对比原生查询失败: ${(error as Error)?.message ?? error}`,
      );
      return null;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeError) {
          this.logger.warn(
            `DuckDB连接关闭失败: ${(closeError as Error)?.message ?? closeError}`,
          );
        }
      }
    }
  }

  private clampAbCompareDuckDBRow(
    row: AbCompareDuckDBRow,
    creationId: string,
  ): AbCompareDuckDBRow {
    return {
      creation_id: creationId,
      predicted_ctr: Math.max(0, Math.min(1, row.predicted_ctr || 0)),
      predicted_cvr: Math.max(0, Math.min(1, row.predicted_cvr || 0)),
      predicted_completion_rate: Math.max(
        0,
        Math.min(1, row.predicted_completion_rate || 0),
      ),
      predicted_retention_rate: Math.max(
        0,
        Math.min(1, row.predicted_retention_rate || 0),
      ),
      hook_type: String(row.hook_type ?? ''),
      hook_strength: Math.max(0, Math.min(1, row.hook_strength || 0)),
    };
  }

  private buildMockAbCompareData(
    creationIdA: string,
    creationIdB: string,
  ): AbCompareDuckDBDataBundle {
    const seedA = this.hashAbCompareSeed(creationIdA);
    const seedB = this.hashAbCompareSeed(creationIdB);

    // 使用单一种子为每个版本生成一个"质量潜变量" q ∈ [0.3, 0.8]
    // 从 q 推导所有指标（带相关性），模拟真实 A/B 测试中指标间的联动效应：
    // - hook_strength ↑ → CTR ↑ (强钩子吸引点击)
    // - hook_strength ↑ + quality ↓ → completion ↓ (标题党效应)
    // - quality ↑ → retention ↑, CVR ↑
    // - CTR 和 completion 存在天然 tradeoff
    const deriveMetrics = (
      seed: number,
    ): {
      quality: number;
      hook_strength: number;
      predicted_ctr: number;
      predicted_cvr: number;
      predicted_completion_rate: number;
      predicted_retention_rate: number;
    } => {
      let s = seed;

      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const quality = 0.3 + this.u32ToFloat(s) * 0.5; // 0.3 ~ 0.8

      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const hookStrength = 0.4 + this.u32ToFloat(s) * 0.5; // 0.4 ~ 0.9

      // CTR 由 hook_strength 主导 (r≈0.8) + quality 辅助 (r≈0.2)
      const ctr = 0.03 + hookStrength * 0.10 + quality * 0.02;
      // CVR 主要由 quality 主导 (r≈0.7)
      const cvr = 0.01 + quality * 0.04;
      // Completion 和 hook_strength 负相关（钩子越强越容易早期跳出）
      const completion = 0.2 + quality * 0.5 - hookStrength * 0.15;
      // Retention 和 completion 高度一致
      const retention = completion * 0.9 + quality * 0.08;

      return {
        quality: Math.round(quality * 10000) / 10000,
        hook_strength: Math.round(hookStrength * 10000) / 10000,
        predicted_ctr: Math.round(Math.max(0.01, Math.min(0.15, ctr)) * 10000) / 10000,
        predicted_cvr: Math.round(Math.max(0.005, Math.min(0.06, cvr)) * 10000) / 10000,
        predicted_completion_rate: Math.round(Math.max(0.1, Math.min(0.95, completion)) * 10000) / 10000,
        predicted_retention_rate: Math.round(Math.max(0.1, Math.min(0.95, retention)) * 10000) / 10000,
      };
    };

    const mA = deriveMetrics(seedA);
    const mB = deriveMetrics(seedB);

    const hookTypes = ANALYTICS_CONSTANTS.MOCK_AB_COMPARE_HOOK_TYPES;

    this.logger.debug(
      `AB对比模拟数据: A(q=${mA.quality}, hs=${mA.hook_strength}, ctr=${mA.predicted_ctr}, cvr=${mA.predicted_cvr}, comp=${mA.predicted_completion_rate}) vs B(q=${mB.quality}, hs=${mB.hook_strength}, ctr=${mB.predicted_ctr}, cvr=${mB.predicted_cvr}, comp=${mB.predicted_completion_rate})`,
    );

    return {
      metrics_a: {
        creation_id: creationIdA,
        predicted_ctr: mA.predicted_ctr,
        predicted_cvr: mA.predicted_cvr,
        predicted_completion_rate: mA.predicted_completion_rate,
        predicted_retention_rate: mA.predicted_retention_rate,
        hook_type: hookTypes[(seedA % hookTypes.length + hookTypes.length) % hookTypes.length],
        hook_strength: mA.hook_strength,
      },
      metrics_b: {
        creation_id: creationIdB,
        predicted_ctr: mB.predicted_ctr,
        predicted_cvr: mB.predicted_cvr,
        predicted_completion_rate: mB.predicted_completion_rate,
        predicted_retention_rate: mB.predicted_retention_rate,
        hook_type: hookTypes[(seedB % hookTypes.length + hookTypes.length) % hookTypes.length],
        hook_strength: mB.hook_strength,
      },
      is_mock: true,
      is_predicted: true,
    };
  }

  private hashAbCompareSeed(id: string): number {
    let hash = 0;
    const len = Math.min(id.length, 8);
    for (let i = 0; i < len; i++) {
      hash = (((hash << 5) - hash) + id.charCodeAt(i)) | 0;
    }
    return (hash >>> 0) || 1;
  }

  private buildAbCompareVersionSummaries(
    creationA: CreationWithScript,
    creationB: CreationWithScript,
    duckData: AbCompareDuckDBDataBundle,
  ): {
    version_a: CompareVersionSummary;
    version_b: CompareVersionSummary;
  } {
    const scriptA = (creationA.script ?? {}) as Record<string, unknown>;
    const scriptB = (creationB.script ?? {}) as Record<string, unknown>;

    const titleA =
      (scriptA.title as string | null) ?? (creationA.id as string).substring(0, 8);
    const titleB =
      (scriptB.title as string | null) ?? (creationB.id as string).substring(0, 8);

    const genModeA = String(scriptA.generationMode ?? scriptA.generation_mode ?? 'PROMPT_DRIVEN');
    const genModeB = String(scriptB.generationMode ?? scriptB.generation_mode ?? 'PROMPT_DRIVEN');

    const hookStrategyMap: Record<string, string> = {
      PROMPT_DRIVEN: ANALYTICS_CONSTANTS.AB_COMPARE_HOOK_STRATEGY_MAP.PROMPT_DRIVEN,
      VIRAL_REWRITE: ANALYTICS_CONSTANTS.AB_COMPARE_HOOK_STRATEGY_MAP.VIRAL_REWRITE,
      TEMPLATE_DRIVEN: ANALYTICS_CONSTANTS.AB_COMPARE_HOOK_STRATEGY_MAP.TEMPLATE_DRIVEN,
    };

    const shotsA = ((creationA.script?.shots ?? []) as Array<Record<string, unknown>>).map((s) => ({
      shot_index: Number(s.shotIndex ?? s.shot_index ?? 0),
      duration_sec: Number(s.durationSec ?? s.duration_sec ?? 0),
    }));
    const shotsB = ((creationB.script?.shots ?? []) as Array<Record<string, unknown>>).map((s) => ({
      shot_index: Number(s.shotIndex ?? s.shot_index ?? 0),
      duration_sec: Number(s.durationSec ?? s.duration_sec ?? 0),
    }));

    return {
      version_a: {
        creation_id: String(creationA.id ?? ''),
        label: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.AB_COMPARE_LABEL_A}: ${titleA}`,
        style_vibe: String(scriptA.styleVibe ?? scriptA.style_vibe ?? ''),
        hook_strategy: hookStrategyMap[genModeA] ?? genModeA,
        predicted_completion_rate: duckData.metrics_a?.predicted_completion_rate,
        predicted_ctr: duckData.metrics_a?.predicted_ctr,
        predicted_cvr: duckData.metrics_a?.predicted_cvr,
        shots: shotsA,
      },
      version_b: {
        creation_id: String(creationB.id ?? ''),
        label: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.AB_COMPARE_LABEL_B}: ${titleB}`,
        style_vibe: String(scriptB.styleVibe ?? scriptB.style_vibe ?? ''),
        hook_strategy: hookStrategyMap[genModeB] ?? genModeB,
        predicted_completion_rate: duckData.metrics_b?.predicted_completion_rate,
        predicted_ctr: duckData.metrics_b?.predicted_ctr,
        predicted_cvr: duckData.metrics_b?.predicted_cvr,
        shots: shotsB,
      },
    };
  }

  private computeAbCompareMetricComparisons(
    summaryA: CompareVersionSummary,
    summaryB: CompareVersionSummary,
    retentionA: number | undefined,
    retentionB: number | undefined,
    creationA: CreationWithScript,
    creationB: CreationWithScript,
  ): CompareMetricItem[] {
    const cmp = (
      name: string,
      valueA: number | undefined,
      valueB: number | undefined,
    ): CompareMetricItem => {
      const safeA = valueA ?? 0;
      const safeB = valueB ?? 0;
      const delta = Math.round((safeA - safeB) * 10000) / 10000;

      let direction: 'A_BETTER' | 'B_BETTER' | 'TIE';
      if (delta > ANALYTICS_CONSTANTS.AB_COMPARE_DIRECTION_THRESHOLD) {
        direction = 'A_BETTER';
      } else if (delta < -ANALYTICS_CONSTANTS.AB_COMPARE_DIRECTION_THRESHOLD) {
        direction = 'B_BETTER';
      } else {
        direction = 'TIE';
      }

      return {
        metric_name: name,
        value_a: Math.round(safeA * 10000) / 10000,
        value_b: Math.round(safeB * 10000) / 10000,
        delta,
        direction,
      };
    };

    const avgShotA = this.computeAvgShotDuration(creationA);
    const avgShotB = this.computeAvgShotDuration(creationB);

    return [
      cmp(
        'retention_rate',
        retentionA,
        retentionB,
      ),
      cmp(
        'completion_rate',
        summaryA.predicted_completion_rate,
        summaryB.predicted_completion_rate,
      ),
      cmp('ctr', summaryA.predicted_ctr, summaryB.predicted_ctr),
      cmp('cvr', summaryA.predicted_cvr, summaryB.predicted_cvr),
      cmp('avg_shot_duration', avgShotA, avgShotB),
    ];
  }

  private computeAvgShotDuration(creation: CreationWithScript): number | undefined {
    const script = creation.script as Record<string, unknown> | undefined;
    const shots = (script?.shots ?? []) as Array<Record<string, unknown>>;

    if (shots.length === 0) {
      return undefined;
    }

    const totalDuration = shots.reduce(
      (sum, shot) => sum + (Number(shot.duration ?? shot.duration_seconds ?? 0) || 0),
      0,
    );

    return Math.round((totalDuration / shots.length) * 100) / 100;
  }

  private computeAbCompareFactorDiff(
    creationA: CreationWithScript,
    creationB: CreationWithScript,
  ): FactorDiffItem[] {
    const diffs: FactorDiffItem[] = [];
    const scriptA = creationA.script as Record<string, unknown>;
    const scriptB = creationB.script as Record<string, unknown>;

    const genModeA = String(scriptA.generationMode ?? scriptA.generation_mode ?? 'PROMPT_DRIVEN');
    const genModeB = String(scriptB.generationMode ?? scriptB.generation_mode ?? 'PROMPT_DRIVEN');

    diffs.push({
      factor: '叙事策略',
      version_a: genModeA,
      version_b: genModeB,
      impact_summary:
        genModeA === genModeB
          ? '两个版本采用相同的生成策略，叙事结构一致'
          : `A 版本采用${genModeA}，B 版本采用${genModeB}，叙事结构存在差异`,
    });

    const styleA = String(scriptA.styleVibe ?? scriptA.style_vibe ?? '');
    const styleB = String(scriptB.styleVibe ?? scriptB.style_vibe ?? '');

    diffs.push({
      factor: '风格调性',
      version_a: styleA,
      version_b: styleB,
      impact_summary:
        styleA === styleB
          ? '两个版本风格完全一致'
          : `A 版本偏向"${styleA}"风格，B 版本偏向"${styleB}"风格`,
    });

    const shotsA = (scriptA.shots ?? []) as Array<Record<string, unknown>>;
    const shotsB = (scriptB.shots ?? []) as Array<Record<string, unknown>>;

    const camCountA: Record<string, number> = {};
    const camCountB: Record<string, number> = {};
    for (const s of shotsA) {
      const key = String(s.cameraMovement ?? s.camera_movement ?? 'Static');
      camCountA[key] = (camCountA[key] ?? 0) + 1;
    }
    for (const s of shotsB) {
      const key = String(s.cameraMovement ?? s.camera_movement ?? 'Static');
      camCountB[key] = (camCountB[key] ?? 0) + 1;
    }
    const modeA = Object.entries(camCountA).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Static';
    const modeB = Object.entries(camCountB).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Static';

    diffs.push({
      factor: '镜头运动',
      version_a: modeA,
      version_b: modeB,
      impact_summary:
        modeA === modeB
          ? '两个版本镜头运动风格一致'
          : `A 版本偏重"${modeA}"运动，B 版本偏重"${modeB}"运动`,
    });

    const transCountA: Record<string, number> = {};
    const transCountB: Record<string, number> = {};
    for (const s of shotsA) {
      const key = String(s.transitionType ?? s.transition_type ?? 'None');
      transCountA[key] = (transCountA[key] ?? 0) + 1;
    }
    for (const s of shotsB) {
      const key = String(s.transitionType ?? s.transition_type ?? 'None');
      transCountB[key] = (transCountB[key] ?? 0) + 1;
    }
    const tModeA = Object.entries(transCountA).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'None';
    const tModeB = Object.entries(transCountB).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'None';

    diffs.push({
      factor: '转场类型',
      version_a: tModeA,
      version_b: tModeB,
      impact_summary:
        tModeA === tModeB
          ? '两个版本转场风格一致'
          : `A 版本偏重"${tModeA}"转场，B 版本偏重"${tModeB}"转场`,
    });

    const avgDurA =
      shotsA.length > 0
        ? Math.round(
            (shotsA.reduce((sum, s) => sum + Number(s.duration) || 0, 0) / shotsA.length) *
              100,
          ) / 100
        : 0;
    const avgDurB =
      shotsB.length > 0
        ? Math.round(
            (shotsB.reduce((sum, s) => sum + Number(s.duration) || 0, 0) / shotsB.length) *
              100,
          ) / 100
        : 0;

    diffs.push({
      factor: '分镜数量与节奏',
      version_a: `${shotsA.length}个分镜 / 均长${avgDurA}s`,
      version_b: `${shotsB.length}个分镜 / 均长${avgDurB}s`,
      impact_summary:
        shotsA.length === shotsB.length
          ? '两个版本分镜数量一致'
          : shotsA.length > shotsB.length
            ? `A 版本分镜更多（${shotsA.length} vs ${shotsB.length}），节奏更快`
            : `B 版本分镜更多（${shotsB.length} vs ${shotsA.length}），节奏更快`,
    });

    return diffs;
  }

  private computeAbCompareWeightedScore(
    metrics: CompareMetricItem[],
    weights: {
      retention_weight: number;
      completion_weight: number;
      ctr_weight: number;
      cvr_weight: number;
      duration_fit_weight: number;
    },
  ): { scoreA: number; scoreB: number } {
    const weightMap: Record<string, number> = {
      retention_rate: weights.retention_weight,
      completion_rate: weights.completion_weight,
      ctr: weights.ctr_weight,
      cvr: weights.cvr_weight,
      avg_shot_duration: weights.duration_fit_weight,
    };

    let scoreA = 0;
    let scoreB = 0;

    for (const m of metrics) {
      const w = weightMap[m.metric_name] ?? 0;
      if (m.direction === 'A_BETTER') {
        scoreA += w;
      } else if (m.direction === 'B_BETTER') {
        scoreB += w;
      } else {
        // TIE（差异不显著）：双方各得一半权重
        scoreA += w * 0.5;
        scoreB += w * 0.5;
      }
    }

    return {
      scoreA,
      scoreB,
    };
  }

  private determineAbCompareWinner(
    metrics: CompareMetricItem[],
    weights: {
      retention_weight: number;
      completion_weight: number;
      ctr_weight: number;
      cvr_weight: number;
      duration_fit_weight: number;
    },
  ): 'A' | 'B' | 'TIE' {
    const { scoreA, scoreB } = this.computeAbCompareWeightedScore(metrics, weights);
    const diff = scoreA - scoreB;

    if (Math.abs(diff) < ANALYTICS_CONSTANTS.AB_COMPARE_TIE_THRESHOLD) {
      return 'TIE';
    }
    return diff > 0 ? 'A' : 'B';
  }

  private buildAbCompareDiagnosisAndRecommendations(
    winner: 'A' | 'B' | 'TIE',
    metrics: CompareMetricItem[],
    factorDiff: FactorDiffItem[],
    versionA: CompareVersionSummary,
    versionB: CompareVersionSummary,
  ): { diagnosis: string[]; recommendation?: string } {
    const diagnosis: string[] = [];

    const labelMap = ANALYTICS_CONSTANTS.AB_COMPARE_METRIC_LABEL_MAP as Record<string, string>;

    if (winner === 'TIE') {
      diagnosis.push(
        '两个版本在各维度表现接近，无明显优胜者，建议关注细分指标差异进行微调',
      );
    } else if (winner === 'A') {
      const leadingMetrics = metrics
        .filter((m) => m.direction === 'A_BETTER')
        .map((m) => labelMap[m.metric_name] ?? m.metric_name);
      const totalLeading = metrics.filter((m) => m.direction !== 'TIE').length;
      diagnosis.push(
        `版本 A 在 ${leadingMetrics.join('、')} 等 ${leadingMetrics.length}/${totalLeading} 项指标上优于版本 B`,
      );
    } else {
      const leadingMetrics = metrics
        .filter((m) => m.direction === 'B_BETTER')
        .map((m) => labelMap[m.metric_name] ?? m.metric_name);
      const totalLeading = metrics.filter((m) => m.direction !== 'TIE').length;
      diagnosis.push(
        `版本 B 在 ${leadingMetrics.join('、')} 等 ${leadingMetrics.length}/${totalLeading} 项指标上优于版本 A`,
      );
    }

    for (const fd of factorDiff) {
      if (!fd.impact_summary.includes('一致')) {
        diagnosis.push(`${fd.factor} 层面: ${fd.impact_summary}`);
      }
    }

    const shotsA = versionA.shots ?? [];
    const shotsB = versionB.shots ?? [];

    if (shotsA.length > 0 && shotsB.length > 0) {
      const stdA = this.computeShotDurationStd(shotsA);
      const stdB = this.computeShotDurationStd(shotsB);
      if (stdA > 1.5 || stdB > 1.5) {
        diagnosis.push(
          stdA > 1.5 && stdB > 1.5
            ? '两个版本均存在分镜时长跨度过大问题，建议收敛节奏方差'
            : stdA > 1.5
              ? '版本 A 分镜时长跨度过大，节奏不够统一'
              : '版本 B 分镜时长跨度过大，节奏不够统一',
        );
      }
    }

    let recommendation: string | undefined;
    if (winner === 'A') {
      recommendation = `建议保留版本 A 的${(versionA.style_vibe ?? '风格').replace(/[\n\r\t]/g, ' ')}策略，可借鉴版本 B 的部分优势因子进行增量优化`;
    } else if (winner === 'B') {
      recommendation = `建议保留版本 B 的${(versionB.style_vibe ?? '风格').replace(/[\n\r\t]/g, ' ')}策略，可借鉴版本 A 的部分优势因子进行增量优化`;
    }

    return { diagnosis, recommendation };
  }

  private computeShotDurationStd(
    shots: Array<{ shot_index: number; duration_sec: number }>,
  ): number {
    if (shots.length === 0) return 0;
    const durations = shots.map((s) => {
      const val = Number(s.duration_sec ?? 0);
      return Number.isFinite(val) ? val : 0;
    });
    const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const variance =
      durations.reduce((sum, d) => sum + (d - mean) * (d - mean), 0) /
      durations.length;
    return Math.sqrt(variance);
  }

  async getSelfHealDiagnosis(dto: SelfHealRequestDto): Promise<SelfHealResultResponse> {
    const dryRun = dto.dry_run ?? false;

    this.logger.log(
      `自愈诊断请求: product_id=${dto.product_id}, creation_id=${dto.creation_id}, trigger=${dto.trigger_source}, issue=${dto.issue_type}, strategy=${dto.strategy}, dry_run=${dryRun}`,
    );

    this.validateSelfHealParams(
      dto.product_id,
      dto.creation_id,
      dto.trigger_source,
      dto.issue_type,
      dto.strategy,
      dto.target_shot_indexes,
    );

    const [product, creation] = await Promise.all([
      this.validateProductExists(dto.product_id),
      this.validateCreationForSelfHeal(dto.creation_id, dto.product_id),
    ]);

    if (dto.target_shot_indexes && dto.target_shot_indexes.length > 0) {
      const shots = creation.script.shots ?? [];
      this.validateTargetShotIndexes(
        shots,
        dto.target_shot_indexes,
      );
    }

    let effectiveTarget: number[] | undefined;
    if (dto.trigger_source === 'MANUAL') {
      effectiveTarget = dto.target_shot_indexes;
    }

    const duckDBData = await this.fetchSelfHealDuckDBData(
      dto.creation_id,
      creation.script?.shots?.length ?? 5,
      creation.script?.shots,
    );

    const shotDiagnoses = this.diagnoseShots(
      creation,
      duckDBData,
      dto.issue_type,
      effectiveTarget,
      dto.trigger_source,
    );

    const affectedShots = this.resolveAffectedShots(
      creation,
      shotDiagnoses,
      dto.strategy,
    );

    const suggestionSummary = await this.generateSelfHealSuggestion(
      dto,
      creation,
      product,
      shotDiagnoses,
      affectedShots,
      dryRun,
    );

    const taskExecution = await this.createSelfHealTaskExecution(
      creation,
      dryRun,
    );

    const status = this.resolveSelfHealStatus(dryRun);

    const response = this.buildSelfHealResponse(
      dto,
      affectedShots,
      suggestionSummary,
      status,
      duckDBData,
      taskExecution,
    );

    this.logger.log(
      `自愈诊断完成: creation_id=${dto.creation_id}, affected=${affectedShots.length}, status=${status}, dry_run=${dryRun}`,
    );

    return response;
  }

  /**
   * 自愈诊断（带进度回调版）
   *
   * 与 getSelfHealDiagnosis 逻辑一致，但通过 onProgress 回调实时推送各阶段进度，
   * 供 SSE 流式端点使用。AI 调用阶段使用真实的 Doubao LLM API。
   */
  async getSelfHealDiagnosisWithProgress(
    dto: SelfHealRequestDto,
    onProgress: (event: { step: string; message: string; data?: unknown }) => void,
  ): Promise<SelfHealResultResponse> {
    const dryRun = dto.dry_run ?? false;
    const SELF_HEAL_GLOBAL_TIMEOUT_MS = 60_000; // 全局 60s 超时（AI 最多 45s + DB 10s + buffer）

    this.logger.log(
      `[自愈进度] 开始: product_id=${dto.product_id}, creation_id=${dto.creation_id}, trigger=${dto.trigger_source}, issue=${dto.issue_type}, strategy=${dto.strategy}, dry_run=${dryRun}`,
    );

    // ---- 耗时埋点 ----
    const pipelineStartTs = Date.now();
    const timings: Record<string, number> = {};

    // 立即发送首个进度事件，让前端知道流程已启动
    onProgress({ step: 'validating', message: '开始自愈诊断...' });

    // 全局超时 Promise，超时后自动降级为 fallback 结果
    const timeoutPromise = new Promise<SelfHealResultResponse>((resolve) => {
      setTimeout(() => {
        this.logger.warn(`[自愈进度] 全局超时 (${SELF_HEAL_GLOBAL_TIMEOUT_MS / 1000}s)，返回降级结果`);
        const fallback = this.buildSelfHealFallbackResponse(dto, 'timeout');
        onProgress({
          step: 'completing',
          message: `诊断超时 (${SELF_HEAL_GLOBAL_TIMEOUT_MS / 1000}s)，返回部分结果`,
          data: { status: fallback.status, affected_count: 0 },
        });
        resolve(fallback);
      }, SELF_HEAL_GLOBAL_TIMEOUT_MS);
    });

    const mainPromise = (async (): Promise<SelfHealResultResponse> => {
    this.validateSelfHealParams(
      dto.product_id,
      dto.creation_id,
      dto.trigger_source,
      dto.issue_type,
      dto.strategy,
      dto.target_shot_indexes,
    );

    // ---- 2. 校验商品存在 + 获取创作任务（并行） ----
    onProgress({ step: 'fetching_product', message: '正在查询商品信息...' });
    onProgress({ step: 'fetching_creation', message: '正在获取创作任务...' });

    const [product, creation] = await Promise.all([
      this.validateProductExists(dto.product_id),
      this.validateCreationForSelfHeal(dto.creation_id, dto.product_id),
    ]);

    if (dto.target_shot_indexes && dto.target_shot_indexes.length > 0) {
      const shots = creation.script.shots ?? [];
      this.validateTargetShotIndexes(shots, dto.target_shot_indexes);
    }

    let effectiveTarget: number[] | undefined;
    if (dto.trigger_source === 'MANUAL') {
      effectiveTarget = dto.target_shot_indexes;
    }

    // ---- 4. 获取分析数据 ----
    onProgress({ step: 'fetching_data', message: '正在获取留存分析数据...' });
    const duckDBData = await this.fetchSelfHealDuckDBData(
      dto.creation_id,
      creation.script?.shots?.length ?? 5,
      creation.script?.shots,
    );
    timings['duckdb_fetch'] = Date.now() - pipelineStartTs - (timings['db_queries'] ?? 0);

    // ---- 5. 诊断分镜 ----
    onProgress({
      step: 'diagnosing',
      message: `正在诊断 ${creation.script?.shots?.length ?? 5} 个分镜...`,
      data: { total_shots: creation.script?.shots?.length ?? 5 },
    });
    const shotDiagnoses = this.diagnoseShots(
      creation,
      duckDBData,
      dto.issue_type,
      effectiveTarget,
      dto.trigger_source,
    );

    const affectedShots = this.resolveAffectedShots(
      creation,
      shotDiagnoses,
      dto.strategy,
    );

    // ---- 6. AI 生成建议 ----
    onProgress({
      step: 'ai_generating',
      message: '正在调用 AI 生成自愈建议...',
      data: { affected_count: affectedShots.length },
    });

    const suggestionSummary = await this.generateSelfHealSuggestion(
      dto,
      creation,
      product,
      shotDiagnoses,
      affectedShots,
      dryRun,
    );
    timings['ai_generation'] = Date.now() - pipelineStartTs - (timings['db_queries'] ?? 0) - (timings['duckdb_fetch'] ?? 0);

    // ---- 7. 完成 ----
    const taskExecution = await this.createSelfHealTaskExecution(creation, dryRun);
    const status = this.resolveSelfHealStatus(dryRun);

    onProgress({
      step: 'completing',
      message: '自愈诊断完成',
      data: { status, affected_count: affectedShots.length },
    });

    const response = this.buildSelfHealResponse(
      dto,
      affectedShots,
      suggestionSummary,
      status,
      duckDBData,
      taskExecution,
    );

    this.logger.log(
      `[自愈进度] 完成: creation_id=${dto.creation_id}, affected=${affectedShots.length}, status=${status}, dry_run=${dryRun}`,
    );

    timings['total'] = Date.now() - pipelineStartTs;
    this.logger.log(
      `[自愈耗时] total=${timings['total']}ms | db_queries=${timings['db_queries'] ?? 'N/A'}ms | duckdb=${timings['duckdb_fetch'] ?? 'N/A'}ms | ai=${timings['ai_generation'] ?? 'N/A'}ms | shots=${shotDiagnoses.length} | avg_severity=${shotDiagnoses.length > 0 ? (shotDiagnoses.reduce((s,d) => s+d.severity,0) / shotDiagnoses.length).toFixed(4) : 0}`,
    );

    return response;
    })(); // mainPromise IIFE

    return await Promise.race([mainPromise, timeoutPromise]);
  }

  private validateSelfHealParams(
    productId: string,
    creationId: string,
    triggerSource: SelfHealTriggerSource,
    issueType: SelfHealIssueType,
    strategy: SelfHealStrategy,
    targetShotIndexes?: number[],
  ): void {
    if (!productId || productId.trim().length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.PRODUCT_ID_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!creationId || creationId.trim().length === 0) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.CREATION_ID_REQUIRED,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!(ANALYTICS_CONSTANTS.SELF_HEAL_TRIGGER_SOURCES as readonly string[]).includes(triggerSource)) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.SELF_HEAL_TRIGGER_SOURCE_INVALID}: 实际为 "${triggerSource}"`,
          error: { code: 'SELF_HEAL_INVALID_TRIGGER_SOURCE', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!(ANALYTICS_CONSTANTS.SELF_HEAL_ISSUE_TYPES as readonly string[]).includes(issueType)) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.SELF_HEAL_ISSUE_TYPE_INVALID}: 实际为 "${issueType}"`,
          error: { code: 'SELF_HEAL_INVALID_ISSUE_TYPE', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!(ANALYTICS_CONSTANTS.SELF_HEAL_STRATEGIES as readonly string[]).includes(strategy)) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.SELF_HEAL_STRATEGY_INVALID}: 实际为 "${strategy}"`,
          error: { code: 'SELF_HEAL_INVALID_STRATEGY', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (triggerSource === 'MANUAL' && (!targetShotIndexes || targetShotIndexes.length === 0)) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.SELF_HEAL_MANUAL_NO_TARGETS,
          error: { code: 'ANALYTICS_SELF_HEAL_MANUAL_NO_TARGETS', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (strategy === 'REGENERATE_VARIANT' && targetShotIndexes && targetShotIndexes.length > 0) {
      this.logger.warn(
        `REGENERATE_VARIANT 策略与分镜级 target_shot_indexes 并存，全量再生将覆盖所有分镜`,
      );
    }
  }

  private validateTargetShotIndexes(
    shots: CreationRecord['script']['shots'],
    targetShotIndexes: number[],
  ): void {
    const deduped = [...new Set(targetShotIndexes)];

    for (const idx of deduped) {
      if (idx < 1 || idx > shots.length) {
        throw serviceException(
          {
            message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.SELF_HEAL_SHOT_INDEX_OUT_OF_RANGE}: 索引 ${idx}，有效范围 [1, ${shots.length}]`,
            error: { code: 'SHOT_INDEX_OUT_OF_RANGE', retryable: false },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  private async validateCreationForSelfHeal(
    creationId: string,
    productId: string,
  ): Promise<CreationRecord & { script: CreationRecord['script'] & { shots: NonNullable<CreationRecord['script']['shots']> } }> {
    let creation: (CreationRecord & { script?: CreationRecord['script'] & { shots?: any[] } }) | null = null;

    // Mock 模式：始终使用 Mock 数据，跳过所有 DB 查询
    if (isMockMode()) {
      let mockRecord = getMockCreationRecord(creationId, productId);
      if (!mockRecord) {
        // 前端传入的 ID 可能不在 mock 列表中，用 productId 作为种子生成一个默认 creation
        mockRecord = getMockCreationRecord(productId, productId);
      }
      if (!mockRecord) {
        // 终极降级：使用第一个 mock 产品
        const firstProductId = getMockProducts()[0]?.id || '00000000-0000-0000-0000-000000000001';
        mockRecord = getMockCreationRecord(firstProductId, firstProductId);
      }
      this.logger.log(`[SelfHeal] Mock mode: using creation (seed=creationId=${creationId.slice(0, 8)}, productId=${productId.slice(0, 8)})`);
      creation = mockRecord as unknown as typeof creation;
    } else {
      // 尝试从数据库查询
      creation = await this.repository.findCreationWithScriptAndShots(creationId);

      // 数据库查不到时，使用 Mock 数据降级
      if (!creation) {
        const mockRecord = getMockCreationRecord(creationId, productId);
        if (mockRecord) {
          this.logger.log(`[Mock fallback] SelfHeal using mock creation record for id=${creationId}`);
          creation = mockRecord as unknown as typeof creation;
        }
      }
    }

    if (!creation) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.SELF_HEAL_LABEL} ${ANALYTICS_CONSTANTS.ERROR_MESSAGES.CREATION_NOT_FOUND}: ${creationId}`,
          error: { code: 'CREATION_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Mock 模式下跳过 productId 校验（mock 数据可能用不同的 productId 作为种子）
    if (!isMockMode() && creation.productId !== productId) {
      throw serviceException(
        {
          message: ANALYTICS_CONSTANTS.ERROR_MESSAGES.PRODUCT_MISMATCH,
          error: { code: 'CREATION_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!creation.script) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.SELF_HEAL_LABEL} ${ANALYTICS_CONSTANTS.ERROR_MESSAGES.SCRIPT_NOT_FOUND}: 创作任务 ${creationId} 关联的剧本已被删除`,
          error: { code: 'SCRIPT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const shots = creation.script.shots ?? [];
    if (shots.length === 0) {
      throw serviceException(
        {
          message: `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.SELF_HEAL_LABEL} ${ANALYTICS_CONSTANTS.ERROR_MESSAGES.NO_SHOTS_IN_CREATION}: 创作任务 ${creationId}`,
          error: { code: 'ANALYTICS_NO_SHOTS_IN_CREATION', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return creation as CreationRecord & { script: CreationRecord['script'] & { shots: NonNullable<CreationRecord['script']['shots']> } };
  }

  private async fetchSelfHealDuckDBData(
    creationId: string,
    shotsCount: number = 5,
    creationShots?: CreationRecord['script']['shots'],
  ): Promise<SelfHealDuckDBBundle> {
    try {
      const data = await this.querySelfHealDuckDBNativeWithTimeout(creationId, shotsCount);

      if (
        data &&
        data.rows &&
        Array.isArray(data.rows) &&
        data.rows.length > 0
      ) {
        return {
          rows: data.rows,
          data_source: ANALYTICS_CONSTANTS.DATA_SOURCE,
          is_mock: data.is_mock,
          is_predicted: data.is_predicted,
        };
      }

      this.logger.warn(
        ANALYTICS_CONSTANTS.ERROR_MESSAGES.SELF_HEAL_DUCKDB_EMPTY,
      );
      return this.fallbackToMockSelfHealData(creationId, creationShots, shotsCount);
    } catch (error) {
      this.logger.warn(
        `${ANALYTICS_CONSTANTS.ERROR_MESSAGES.SELF_HEAL_DUCKDB_QUERY_FAILED}: creationId=${creationId}, error=${(error as Error)?.message ?? error}`,
      );
      return this.fallbackToMockSelfHealData(creationId, creationShots, shotsCount);
    }
  }

  private querySelfHealDuckDBNativeWithTimeout(
    creationId: string,
    shotsCount: number = 5,
  ): Promise<SelfHealDuckDBBundle> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `DuckDB 自愈诊断查询超时: creationId=${creationId}, timeout=${ANALYTICS_CONSTANTS.SELF_HEAL_DUCKDB_TIMEOUT_MS}ms`,
          ),
        );
      }, ANALYTICS_CONSTANTS.SELF_HEAL_DUCKDB_TIMEOUT_MS);

      this.querySelfHealDuckDBNative(creationId)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /** Bug 25: 统一返回空的自愈诊断数据包，避免多处重复相同 object literal */
  private emptySelfHealBundle(): SelfHealDuckDBBundle {
    return {
      rows: [],
      data_source: ANALYTICS_CONSTANTS.DATA_SOURCE,
      is_mock: true,
      is_predicted: true,
    };
  }

  private async querySelfHealDuckDBNative(
    creationId: string,
  ): Promise<SelfHealDuckDBBundle> {
    const duckDBEnv = process.env.DUCKDB_ENABLED;
    const duckDBPath = process.env.DUCKDB_PATH;

    if (duckDBEnv !== 'true' || !duckDBPath) {
      this.logger.debug(
        `DuckDB 未启用 (DUCKDB_ENABLED=${duckDBEnv}, DUCKDB_PATH=${duckDBPath}), 跳过自愈诊断真实查询`,
      );
      return this.emptySelfHealBundle();
    }

    let connection: DuckDBConnection | null = null;

    try {
      // @ts-expect-error @duckdb/node-api 可选依赖，无类型声明，运行时动态导入
      const duckdb = (await import('@duckdb/node-api')) as DuckDBModuleShape;

      if (!duckdb) {
        return this.emptySelfHealBundle();
      }

      const DuckDB = duckdb.DuckDBInstance;

      if (!DuckDB) {
        return this.emptySelfHealBundle();
      }

      const instance = new DuckDB();
      connection = await instance.connect();

      const runFn = connection.run as (
        sql: string,
        values: (string | number | null)[],
      ) => Promise<{ getRowObjectsJson: () => Array<Record<string, unknown>> }>;

      const sql = `
        SELECT
          shot_index,
          hook_strength,
          voiceover_ratio,
          style_alignment_score,
          cta_strength,
          retention_rate_at_shot
        FROM analytics.self_heal_diagnostics
        WHERE creation_id = ?
        ORDER BY shot_index ASC
      `;

      const result = await runFn(sql, [creationId]);

      const rawRows = result.getRowObjectsJson();

      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return this.emptySelfHealBundle();
      }

      const rows: SelfHealDuckDBRawRow[] = rawRows.map((r: Record<string, unknown>) => ({
        shot_index: Number(r.shot_index),
        hook_strength: Math.max(0, Math.min(1, Number(r.hook_strength) || 0)),
        voiceover_ratio: Math.max(0, Math.min(1, Number(r.voiceover_ratio) || 0)),
        style_alignment_score: Math.max(0, Math.min(1, Number(r.style_alignment_score) || 0)),
        cta_strength: Math.max(0, Math.min(1, Number(r.cta_strength) || 0)),
        retention_rate_at_shot: Math.max(0, Math.min(1, Number(r.retention_rate_at_shot) || 0)),
      }));

      return {
        rows,
        data_source: ANALYTICS_CONSTANTS.DATA_SOURCE,
        is_mock: false,
        is_predicted: true,
      };
    } catch (error) {
      this.logger.warn(
        `DuckDB 自愈诊断原生查询失败: creationId=${creationId}, error=${(error as Error)?.message ?? error}`,
      );
      return this.emptySelfHealBundle();
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch {
          void 0;
        }
      }
    }
  }

  /**
   * 生成自愈诊断 Mock 数据——从创作内容推导指标
   *
   * 不再使用硬编码数组，而是从分镜的实际内容（旁白文本、视觉描述、时长）
   * 推导出各类诊断指标的合理值。确保至少1~2个分镜触发阈值以便测试AI自愈路径。
   *
   * 指标推导逻辑：
   *   - hook_strength: 基于开场分镜文本的"钩子特征"（疑问词/数字/情绪词密度）
   *   - voiceover_ratio: 基于旁白文本长度与分镜时长的比例
   *   - style_alignment: 基于视觉描述与品类关键词的语义匹配度
   *   - cta_strength: 基于尾部文案中的行动号召词密度
   *   - retention_rate_at_shot: 基于内容质量的累积衰减模型
   */
  private fallbackToMockSelfHealData(
    creationId: string,
    shots: CreationRecord['script']['shots'] | undefined,
    shotsCount: number = 5,
  ): SelfHealDuckDBBundle {
    const seed = this.hashProductId(creationId.slice(0, 8));
    let s = seed;

    const rows: SelfHealDuckDBRawRow[] = [];
    const shotCount = shots?.length || shotsCount;

    // 钩子特征分析：从开场分镜文本提取钩子强度信号
    const hookAnalysis = this.analyzeHookContent(shots, shotCount);
    const voiceoverAnalysis = this.analyzeVoiceoverContent(shots, shotCount);
    const ctaAnalysis = this.analyzeCtaContent(shots, shotCount);

    for (let i = 0; i < shotCount; i++) {
      const shotIdx = i + 1;
      const shot = shots?.[i];

      // 1. hook_strength — 基于内容特征
      //    开场1~2镜：≥0.42 表示钩子有效，强制保证 shot 1 必定触发阈值以便测试
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const baseHook = hookAnalysis.baseByShot[i] ?? 0.4;
      const hookNoise = (this.u32ToFloat(s) - 0.5) * 0.10;
      let hookStrength = Math.round(Math.max(0.05, Math.min(0.95, baseHook + hookNoise)) * 10000) / 10000;
      // 强制保证 shot 1 的 hook_strength 低于阈值，确保诊断必定触发（见 buildSuggestionSummary 注释）
      if (i === 0 && hookStrength >= ANALYTICS_CONSTANTS.HOOK_STRENGTH_WEAK_THRESHOLD) {
        hookStrength = Math.round((ANALYTICS_CONSTANTS.HOOK_STRENGTH_WEAK_THRESHOLD - 0.08) * 10000) / 10000;
      }

      // 2. voiceover_ratio — 基于旁白文本长度/时长比
      //    旁白字数/时长(秒) > 15字/秒 → 偏高
      const baseVoiceover = voiceoverAnalysis.baseByShot[i] ?? 0.4;
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const voiceNoise = (this.u32ToFloat(s) - 0.5) * 0.10;
      const voiceoverRatio = Math.round(Math.max(0.05, Math.min(0.95, baseVoiceover + voiceNoise)) * 10000) / 10000;

      // 3. style_alignment — 基于视觉描述与品类语义匹配
      //    真实匹配取决于设计质量，分布偏正态(均值0.65，σ≈0.15)
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const styleBase = 0.55 + shotIdx * 0.03; // 后期分镜趋于稳定
      const styleNoise = (this.u32ToFloat(s) - 0.5) * 0.20;
      const styleAlignmentScore = Math.round(Math.max(0.1, Math.min(0.95, styleBase + styleNoise)) * 10000) / 10000;

      // 4. cta_strength — 基于尾部文案行动号召词密度
      //    末2镜有CTA: ≥0.38，最后1镜最高
      const baseCta = ctaAnalysis.baseByShot[i] ?? 0.25;
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const ctaNoise = (this.u32ToFloat(s) - 0.5) * 0.12;
      const ctaStrength = Math.round(Math.max(0.03, Math.min(0.95, baseCta + ctaNoise)) * 10000) / 10000;

      // 5. retention_rate_at_shot — 累积留存（幂律衰减：后续分镜的留存=上一镜留存×(1-衰减率)）
      //    内容质量越高，单镜衰减越低
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const shotDecay = 0.06 + this.u32ToFloat(s) * 0.12; // 每镜衰减6%~18%
      const prevRetention = i === 0 ? 1.0 : rows[i - 1].retention_rate_at_shot;
      const retentionBase = i === 0 ? 1.0 : prevRetention * (1 - shotDecay);
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const retentionNoise = (this.u32ToFloat(s) - 0.5) * 0.06;
      const retentionRateAtShot = Math.round(
        Math.max(0.10, Math.min(1.0, retentionBase + retentionNoise)) * 10000
      ) / 10000;

      rows.push({
        shot_index: shotIdx,
        hook_strength: hookStrength,
        voiceover_ratio: voiceoverRatio,
        style_alignment_score: styleAlignmentScore,
        cta_strength: ctaStrength,
        retention_rate_at_shot: retentionRateAtShot,
      });
    }

    this.logger.debug(
      `生成模拟自愈诊断数据(内容驱动): creationId=${creationId}, ` +
      `shots=${shotCount}, hookAvg=${hookAnalysis.avg}, voiceAvg=${voiceoverAnalysis.avg}`,
    );

    return {
      rows,
      data_source: ANALYTICS_CONSTANTS.DATA_SOURCE,
      is_mock: true,
      is_predicted: true,
    };
  }

  /**
   * 分析开场分镜文本的钩子特征
   * 提取疑问词、数字、情绪词的密度作为 hook_strength 信号
   */
  private analyzeHookContent(
    shots: CreationRecord['script']['shots'] | undefined,
    shotCount: number,
  ): { baseByShot: number[]; avg: number } {
    const baseByShot: number[] = [];
    let total = 0;

    for (let i = 0; i < shotCount; i++) {
      const shot = shots?.[i];
      const text = (shot?.voiceoverText || '') + (shot?.subtitleText || '');
      let score = 0.35; // 默认基线

      if (text) {
        // 疑问词：谁/什么/为什么/怎么/如何 → +0.06
        const questionPattern = /[谁何怎么为什哪几多][\u4e00-\u9fa5]*[？?]/g;
        if (questionPattern.test(text)) score += 0.06;

        // 数字出现：折扣/排名/数量 → +0.04
        const numberPattern = /\d+[%％折元块个件]/g;
        if (numberPattern.test(text)) score += 0.04;

        // 情绪词：必须/一定/绝对/不要/错过/限时 → +0.05
        const emotionPattern = /必须|一定|绝对|不要错过|限时|仅限|最后/g;
        if (emotionPattern.test(text)) score += 0.05;

        // 反转/对比结构 → +0.03
        const contrastPattern = /但是|然而|居然|竟然|只要.*就/g;
        if (contrastPattern.test(text)) score += 0.03;

        // 分镜1加权最高（开场钩子），逐镜递减
        const positionWeight = i <= 1 ? 0.08 : -i * 0.02;
        score += positionWeight;
      }

      score = Math.round(Math.max(0.15, Math.min(0.80, score)) * 100) / 100;
      baseByShot.push(score);
      total += score;
    }

    return { baseByShot, avg: Math.round((total / shotCount) * 100) / 100 };
  }

  /**
   * 分析旁白文本长度与分镜时长的比例
   */
  private analyzeVoiceoverContent(
    shots: CreationRecord['script']['shots'] | undefined,
    shotCount: number,
  ): { baseByShot: number[]; avg: number } {
    const baseByShot: number[] = [];
    let total = 0;

    for (let i = 0; i < shotCount; i++) {
      const shot = shots?.[i];
      const textLen = (shot?.voiceoverText || '').length;
      const duration = Number(shot?.duration) || 5;

      // 旁白密度：字数/秒，正常范围 8~20字/秒
      const density = textLen / Math.max(duration, 1);
      // 映射到 0.2~0.85 区间
      const ratio = Math.round(Math.max(0.15, Math.min(0.85, density / 20)) * 100) / 100;

      // 中间分镜(2~3)通常信息密度最大
      const posFactor = i === 1 || i === 2 ? 0.08 : 0;
      const score = Math.round(Math.min(0.90, ratio + posFactor) * 100) / 100;

      baseByShot.push(score);
      total += score;
    }

    return { baseByShot, avg: Math.round((total / shotCount) * 100) / 100 };
  }

  /**
   * 分析尾部文案中的CTA行动号召力度
   */
  private analyzeCtaContent(
    shots: CreationRecord['script']['shots'] | undefined,
    shotCount: number,
  ): { baseByShot: number[]; avg: number } {
    const baseByShot: number[] = [];
    let total = 0;

    for (let i = 0; i < shotCount; i++) {
      const shot = shots?.[i];
      const text = (shot?.voiceoverText || '') + ' ' + (shot?.subtitleText || '');
      const isTailShot = i >= shotCount - 2; // 末2镜为CTA镜
      let score = isTailShot ? 0.30 : 0.18;

      if (text) {
        // CTA关键词检测
        const ctaPatterns = [
          { pattern: /购买|下单|抢购|秒杀/g, weight: 0.08 },
          { pattern: /点击|链接|橱窗|小黄车/g, weight: 0.06 },
          { pattern: /优惠|折扣|便宜|划算/g, weight: 0.05 },
          { pattern: /限时|仅剩|最后|即将/g, weight: 0.07 },
          { pattern: /关注|点赞|收藏|分享/g, weight: 0.03 },
        ];

        for (const { pattern, weight } of ctaPatterns) {
          if (pattern.test(text)) score += weight;
        }
      }

      // 末2镜额外加权
      if (isTailShot) score += 0.05;

      score = Math.round(Math.max(0.08, Math.min(0.85, score)) * 100) / 100;
      baseByShot.push(score);
      total += score;
    }

    return { baseByShot, avg: Math.round((total / shotCount) * 100) / 100 };
  }

  private diagnoseShots(
    creation: CreationRecord,
    duckDBData: SelfHealDuckDBBundle,
    issueType: SelfHealIssueType,
    targetShotIndexes?: number[],
    triggerSource?: string,
  ): ShotDiagnosis[] {
    const allShots = creation.script.shots ?? [];

    let candidateShots: CreationRecord['script']['shots'];
    if (targetShotIndexes && targetShotIndexes.length > 0) {
      candidateShots = allShots.filter((s) => targetShotIndexes.includes(s.shotIndex));
    } else {
      candidateShots = allShots;
    }

    switch (issueType) {
      case 'HOOK_WEAK':
        return this.diagnoseHookWeak(candidateShots, duckDBData);
      case 'VOICEOVER_TOO_LONG':
        return this.diagnoseVoiceoverTooLong(candidateShots, duckDBData);
      case 'STYLE_MISMATCH':
        return this.diagnoseStyleMismatch(candidateShots, duckDBData);
      case 'CTA_WEAK': {
        // CTA only checks the last 2 shots — must use total shot count, not candidate count
        const totalCount = allShots.length;
        const ctaCandidates = candidateShots.filter(
          (s) => s.shotIndex === totalCount || s.shotIndex === totalCount - 1,
        );
        return this.diagnoseCtaWeak(ctaCandidates, duckDBData);
      }
      default:
        return [];
    }
  }

  private diagnoseHookWeak(
    shots: CreationRecord['script']['shots'],
    duckDBData: SelfHealDuckDBBundle,
  ): ShotDiagnosis[] {
    const diagnoses: ShotDiagnosis[] = [];
    const indexMap = this.buildSelfHealDuckDBIndexMap(duckDBData);

    const targetShots = shots.filter(
      (s) => s.shotIndex === 1 || s.shotIndex === 2,
    );

    for (const shot of targetShots) {
      const row = indexMap.get(shot.shotIndex);
      const hs = row?.hook_strength ?? 0;
      if (hs < ANALYTICS_CONSTANTS.HOOK_STRENGTH_WEAK_THRESHOLD) {
        const rawSeverity = ANALYTICS_CONSTANTS.HOOK_STRENGTH_WEAK_THRESHOLD - hs;
        // 归一化到 [0, 1]：0=刚好在阈值, 1=完全缺失钩子
        const severity = Math.round((rawSeverity / ANALYTICS_CONSTANTS.HOOK_STRENGTH_WEAK_THRESHOLD) * 10000) / 10000;
        diagnoses.push({
          shot_index: shot.shotIndex,
          issue_type: 'HOOK_WEAK',
          severity,
          value: Math.round(hs * 10000) / 10000,
          threshold: ANALYTICS_CONSTANTS.HOOK_STRENGTH_WEAK_THRESHOLD,
          reason: `开场 hook_strength 仅 ${hs.toFixed(2)}，低于阈值 ${ANALYTICS_CONSTANTS.HOOK_STRENGTH_WEAK_THRESHOLD}，建议用更强钩子类型替换`,
        });
      }
    }
    return diagnoses;
  }

  private diagnoseVoiceoverTooLong(
    shots: CreationRecord['script']['shots'],
    duckDBData: SelfHealDuckDBBundle,
  ): ShotDiagnosis[] {
    const diagnoses: ShotDiagnosis[] = [];
    const indexMap = this.buildSelfHealDuckDBIndexMap(duckDBData);

    for (const shot of shots) {
      const row = indexMap.get(shot.shotIndex);
      const vr = row?.voiceover_ratio ?? 0;
      if (vr > ANALYTICS_CONSTANTS.VOICEOVER_RATIO_HIGH_THRESHOLD) {
        const rawSeverity = vr - ANALYTICS_CONSTANTS.VOICEOVER_RATIO_HIGH_THRESHOLD;
        // 归一化到 [0, 1]：0=刚好在阈值, 1=旁白占满全部分镜
        const severity = Math.round((rawSeverity / (1 - ANALYTICS_CONSTANTS.VOICEOVER_RATIO_HIGH_THRESHOLD)) * 10000) / 10000;
        diagnoses.push({
          shot_index: shot.shotIndex,
          issue_type: 'VOICEOVER_TOO_LONG',
          severity,
          value: Math.round(vr * 10000) / 10000,
          threshold: ANALYTICS_CONSTANTS.VOICEOVER_RATIO_HIGH_THRESHOLD,
          reason: `分镜 ${shot.shotIndex} 旁白占比 ${(vr * 100).toFixed(1)}%，超出阈值 ${ANALYTICS_CONSTANTS.VOICEOVER_RATIO_HIGH_THRESHOLD * 100}%，建议压缩台词或拆分分镜`,
        });
      }
    }
    return diagnoses;
  }

  private diagnoseStyleMismatch(
    shots: CreationRecord['script']['shots'],
    duckDBData: SelfHealDuckDBBundle,
  ): ShotDiagnosis[] {
    const diagnoses: ShotDiagnosis[] = [];
    const indexMap = this.buildSelfHealDuckDBIndexMap(duckDBData);

    for (const shot of shots) {
      const row = indexMap.get(shot.shotIndex);
      const sas = row?.style_alignment_score ?? 1;
      if (sas < ANALYTICS_CONSTANTS.STYLE_MISMATCH_THRESHOLD) {
        const rawSeverity = ANALYTICS_CONSTANTS.STYLE_MISMATCH_THRESHOLD - sas;
        // 归一化到 [0, 1]：0=刚好在阈值, 1=完全偏离风格
        const severity = Math.round((rawSeverity / ANALYTICS_CONSTANTS.STYLE_MISMATCH_THRESHOLD) * 10000) / 10000;
        diagnoses.push({
          shot_index: shot.shotIndex,
          issue_type: 'STYLE_MISMATCH',
          severity,
          value: Math.round(sas * 10000) / 10000,
          threshold: ANALYTICS_CONSTANTS.STYLE_MISMATCH_THRESHOLD,
          reason: `分镜 ${shot.shotIndex} 视觉风格与商品调性偏离(匹配度 ${sas.toFixed(2)})，建议调整 visual_description`,
        });
      }
    }
    return diagnoses;
  }

  private diagnoseCtaWeak(
    shots: CreationRecord['script']['shots'],
    duckDBData: SelfHealDuckDBBundle,
  ): ShotDiagnosis[] {
    const diagnoses: ShotDiagnosis[] = [];
    const indexMap = this.buildSelfHealDuckDBIndexMap(duckDBData);

    // Shots are already pre-filtered to the last 2 shots by diagnoseShots
    for (const shot of shots) {
      const row = indexMap.get(shot.shotIndex);
      const cs = row?.cta_strength ?? 0;
      if (cs < ANALYTICS_CONSTANTS.CTA_WEAK_THRESHOLD) {
        const rawSeverity = ANALYTICS_CONSTANTS.CTA_WEAK_THRESHOLD - cs;
        // 归一化到 [0, 1]：0=刚好在阈值, 1=完全缺失CTA
        const severity = Math.round((rawSeverity / ANALYTICS_CONSTANTS.CTA_WEAK_THRESHOLD) * 10000) / 10000;
        diagnoses.push({
          shot_index: shot.shotIndex,
          issue_type: 'CTA_WEAK',
          severity,
          value: Math.round(cs * 10000) / 10000,
          threshold: ANALYTICS_CONSTANTS.CTA_WEAK_THRESHOLD,
          reason: `分镜 ${shot.shotIndex} CTA 强度仅 ${cs.toFixed(2)}，低于阈值 ${ANALYTICS_CONSTANTS.CTA_WEAK_THRESHOLD}，建议增强促销引导语`,
        });
      }
    }
    return diagnoses;
  }

  private buildSelfHealDuckDBIndexMap(
    duckDBData: SelfHealDuckDBBundle,
  ): Map<number, SelfHealDuckDBRawRow> {
    const map = new Map<number, SelfHealDuckDBRawRow>();
    for (const row of duckDBData.rows) {
      map.set(row.shot_index, row);
    }
    return map;
  }

  private resolveAffectedShots(
    creation: CreationRecord,
    shotDiagnoses: ShotDiagnosis[],
    strategy: SelfHealStrategy,
  ): AffectedShot[] {
    if (strategy === 'REGENERATE_VARIANT') {
      const allShots = creation.script.shots ?? [];
      const affected: AffectedShot[] = allShots.map((s) => ({
        shot_index: s.shotIndex,
        action: 'REGENERATE_FULL_VARIANT',
        reason: `全量再生：${ANALYTICS_CONSTANTS.SELF_HEAL_STRATEGY_LABELS.REGENERATE_VARIANT}`,
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
  }

  private buildSuggestionSummary(
    issueType: SelfHealIssueType,
    strategy: SelfHealStrategy,
    shotDiagnoses: ShotDiagnosis[],
    affectedShots: AffectedShot[],
    dryRun: boolean,
  ): string {
    const issueLabel = ANALYTICS_CONSTANTS.SELF_HEAL_ISSUE_LABELS[issueType] ?? issueType;
    const strategyLabel = ANALYTICS_CONSTANTS.SELF_HEAL_STRATEGY_LABELS[strategy] ?? strategy;
    const count = affectedShots.length;
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

    // 区分于 REGENERATE_VARIANT 全量覆盖但无实际诊断的场景
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
  }

  // =============================================================================
  // AI 自愈建议 — 使用 Doubao API 生成精准可执行的分镜优化建议
  // =============================================================================

  /**
   * 构建 AI 系统提示词
   *
   * 角色定义：短视频广告创意优化专家
   * 约束：简洁、可执行、引用原文、禁止模糊措辞
   */
  private buildAISystemPrompt(): string {
    return `你是短视频广告创意优化专家，专精于诊断和修复分镜级问题。

你的任务：根据诊断数据，生成精准、可立即落地的分镜修改方案。

输出规范（必须严格遵守）：
- 第一行输出一句话核心诊断（例如："开场钩子吸引力不足，共2个分镜需优化"）。
- 后续每个受影响分镜独立一段，段首标注"分镜N（当前值X，阈值Y）："。
- 每条建议使用明确指令句式：将[原文]改为[新方案]，或删除[内容]增加[内容]。
- 建议必须引用原分镜的具体内容（旁白文本、视觉描述等）。
- 禁止使用"建议""可以考虑""或许""推荐"等模糊措辞。
- 每个分镜给出1-2条建议，总计不超过4条。
- 全中文输出，不使用Markdown或JSON格式。`;
  }

  /**
   * 构建分镜详情文本 — 提取与问题类型最相关的字段
   */
  private buildShotDetailForAI(
    shot: { shotIndex: number; voiceoverText?: string; visualDescription?: string; subtitleText?: string; duration?: number },
    diagnosis: ShotDiagnosis | undefined,
  ): string {
    const parts: string[] = [];
    if (diagnosis) {
      parts.push(`当前值=${diagnosis.value.toFixed(2)}，阈值=${diagnosis.threshold}`);
    }
    if (shot.duration) parts.push(`时长${shot.duration}s`);
    if (shot.voiceoverText) parts.push(`旁白："${shot.voiceoverText}"`);
    if (shot.visualDescription) parts.push(`视觉："${shot.visualDescription}"`);
    if (shot.subtitleText && shot.subtitleText !== shot.visualDescription) {
      parts.push(`字幕："${shot.subtitleText}"`);
    }
    return parts.join('，');
  }

  /**
   * 构建 AI 用户提示词 — 根据问题类型组装上下文
   */
  private buildAIUserPrompt(
    dto: SelfHealRequestDto,
    creation: CreationRecord,
    product: ProductInfo,
    shotDiagnoses: ShotDiagnosis[],
  ): string {
    const productName = product.title;
    const category = product.category;
    const sellingPoints = product.sellingPoints.length > 0 ? product.sellingPoints.join('、') : '未知';
    const targetAudience = product.targetAudience ?? '未知';

    const script = creation.script;
    const scriptTitle = script.title ?? '未命名';
    const styleVibe = script.styleVibe ?? '未指定';
    const generationMode = script.generationMode ?? '未指定';
    const shotCount = script.shots?.length ?? 0;
    const totalDuration = script.videoDuration ?? 0;

    const issueLabel = ANALYTICS_CONSTANTS.SELF_HEAL_ISSUE_LABELS[dto.issue_type] ?? dto.issue_type;
    const strategyLabel = ANALYTICS_CONSTANTS.SELF_HEAL_STRATEGY_LABELS[dto.strategy] ?? dto.strategy;

    const diagMap = new Map<number, ShotDiagnosis>();
    for (const d of shotDiagnoses) {
      diagMap.set(d.shot_index, d);
    }

    // 构建受影响分镜明细
    const affectedShotLines: string[] = [];
    const allShots = creation.script.shots ?? [];
    for (const shot of allShots) {
      const diag = diagMap.get(shot.shotIndex);
      if (diag) {
        const detail = this.buildShotDetailForAI(shot, diag);
        affectedShotLines.push(`分镜${shot.shotIndex}：${detail}`);
      }
    }

    // 根据问题类型添加专项指导
    let issueGuidance = '';
    switch (dto.issue_type) {
      case 'HOOK_WEAK':
        issueGuidance = '优化方向：使用更强烈的痛点提问、数字对比或反常识陈述作为开场，在首3秒内建立认知冲突。';
        break;
      case 'VOICEOVER_TOO_LONG':
        issueGuidance = '优化方向：压缩旁白字数至原长度的60%以下，将信息密度集中在每镜前2秒，多余信息转为字幕展示。';
        break;
      case 'STYLE_MISMATCH':
        issueGuidance = `优化方向：将视觉描述调整为与"${styleVibe}"风格一致的画面，替换不协调的机位运动和转场方式。`;
        break;
      case 'CTA_WEAK':
        issueGuidance = '优化方向：增加限时/限量/价格锚点等促销元素，使用"立即""限时""仅剩"等强行动号召词。';
        break;
    }

    return `商品信息：
- 名称：${productName}
- 类目：${category}
- 卖点：${sellingPoints}
- 目标人群：${targetAudience}

创作信息：
- 标题：${scriptTitle}
- 风格调性：${styleVibe}
- 生成模式：${generationMode}
- 总时长：${totalDuration}s，共${shotCount}个分镜

诊断问题：${issueLabel}
自愈策略：${strategyLabel}
${issueGuidance}

受影响分镜及诊断数据：
${affectedShotLines.join('\n')}

请严格按照系统提示词要求的输出格式，生成分镜级自愈修改方案。`;
  }

  /**
   * 调用 Doubao AI API 生成自愈建议
   *
   * 针对自愈场景使用快速通道（基于实测数据调优）：
   *   - API 超时 25s（实测：中等自愈 prompt 12-15s，完整 20-30s）
   *   - 不重试（自愈不容忍长时间等待，失败直接降级模板）
   *   - 外层 race 20s 兜底（覆盖典型 12-15s 响应 + buffer）
   *
   * 注意：端点 ep-20260514115629-vhldw 忽略 max_tokens，总是生成 350-1000+ tokens，
   * 但响应质量很高。实际耗时取决于 prompt 复杂度，典型值 12-20s。
   *
   * @returns AI 生成的建议文本，若失败返回 null 以触发 fallback
   */
  private async callAISelfHealSuggestion(
    dto: SelfHealRequestDto,
    creation: CreationRecord,
    product: ProductInfo,
    shotDiagnoses: ShotDiagnosis[],
  ): Promise<string | null> {
    const systemPrompt = this.buildAISystemPrompt();
    const userPrompt = this.buildAIUserPrompt(dto, creation, product, shotDiagnoses);

    this.logger.log(`[SelfHeal AI] 快速通道: issue_type=${dto.issue_type}, shots=${shotDiagnoses.length}, timeout=45s, maxRetries=0`);

    try {
      // 实测：中等 prompt 12-15s，完整 prompt 20-25s。提升到 45s race 覆盖更多长尾场景
      const SELF_HEAL_RACE_MS = 45_000; // 外层兜底 race

      const aiPromise = this.doubaoTextProvider.generateText(
        systemPrompt,
        userPrompt,
        384,
        { timeoutMs: 45_000, maxRetries: 0 }, // 实测：20-25s → 45s 覆盖
      );

      const result = await Promise.race([
        aiPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`AI 自愈建议超时 (${SELF_HEAL_RACE_MS / 1000}s)`)), SELF_HEAL_RACE_MS),
        ),
      ]);

      if (result && result.trim().length > 0) {
        this.logger.log(`[SelfHeal AI] 生成成功: length=${result.length}`);
        return result.trim();
      }

      this.logger.warn('[SelfHeal AI] AI 返回空内容，降级为模板建议');
      return null;
    } catch (error) {
      this.logger.warn(
        `[SelfHeal AI] 调用失败，降级为模板建议: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  /**
   * 生成自愈建议（AI + 模板降级）
   *
   * 流程：
   * 1. 轻症快判：无异常分镜或平均严重度低 → 直接模板, 跳过 AI（省 20s+)
   * 2. 尝试调用 Doubao AI 获取精准建议
   * 3. AI 失败/超时/返回空 → 降级为原模板 buildSuggestionSummary
   */
  private async generateSelfHealSuggestion(
    dto: SelfHealRequestDto,
    creation: CreationRecord,
    product: ProductInfo,
    shotDiagnoses: ShotDiagnosis[],
    affectedShots: AffectedShot[],
    dryRun: boolean,
  ): Promise<string> {
    // ---- 轻症快判：跳过 AI，直接模板 ----
    // severity 已归一化到 [0, 1]，0.10 表示仅轻微偏离阈值的10%以内才跳过 AI
    // 实际生产中任何有效诊断偏离阈值至少 0.18 以上 → 都会触发 AI
    const FAST_TEMPLATE_SEVERITY_THRESHOLD = 0.10;

    if (shotDiagnoses.length === 0) {
      this.logger.log('[SelfHeal] 无异常分镜，跳过 AI，直接模板建议');
      return this.buildSuggestionSummary(
        dto.issue_type, dto.strategy, shotDiagnoses, affectedShots, dryRun,
      );
    }

    const avgSeverity = shotDiagnoses.reduce((s, d) => s + d.severity, 0) / shotDiagnoses.length;
    if (avgSeverity < FAST_TEMPLATE_SEVERITY_THRESHOLD) {
      this.logger.log(
        `[SelfHeal] 平均严重度 ${avgSeverity.toFixed(2)} < ${FAST_TEMPLATE_SEVERITY_THRESHOLD}，轻症跳过 AI`,
      );
      return this.buildSuggestionSummary(
        dto.issue_type, dto.strategy, shotDiagnoses, affectedShots, dryRun,
      );
    }

    const aiSuggestion = await this.callAISelfHealSuggestion(dto, creation, product, shotDiagnoses);

    if (aiSuggestion) {
      // AI 成功，附上策略信息
      const strategyLabel = ANALYTICS_CONSTANTS.SELF_HEAL_STRATEGY_LABELS[dto.strategy] ?? dto.strategy;
      const dryRunNote = dryRun ? '\n[注意：dry_run 模式，未执行实际操作]' : '';
      return `${aiSuggestion}\n\n自愈策略：${strategyLabel}${dryRunNote}`;
    }

    // AI 失败，降级为模板建议
    this.logger.log('[SelfHeal AI] 使用模板降级建议');
    return this.buildSuggestionSummary(
      dto.issue_type,
      dto.strategy,
      shotDiagnoses,
      affectedShots,
      dryRun,
    );
  }

  private resolveSelfHealStatus(dryRun = false): SelfHealStatusValue {
    return dryRun ? 'SUGGESTED' : 'QUEUED';
  }

  private async createSelfHealTaskExecution(
    creation: CreationRecord,
    dryRun: boolean,
  ): Promise<SelfHealTaskExecutionResult> {
    if (dryRun) {
      return {};
    }

    if (!creation.scriptId) {
      throw serviceException(
        {
          message: `自愈操作失败：创作任务 ${creation.id} 缺少关联剧本`,
          error: { code: 'SCRIPT_NOT_FOUND', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const createdTask = await this.repository.createHealedCreationTask({
      productId: creation.productId,
      scriptId: creation.scriptId,
      taskId: this.generateSelfHealTaskId(),
      engineMode: creation.engineMode,
      targetResolution: creation.targetResolution,
      exportFormat: creation.exportFormat,
      traceId: creation.traceId,
    });

    return {
      task_id: createdTask.taskId,
      healed_creation_id: createdTask.id,
    };
  }

  private generateSelfHealTaskId(): string {
    const datePrefix = this.getCurrentDatePrefix();
    const suffix = String(Date.now() % 1_000_000).padStart(6, '0');
    return `tsk_${datePrefix}_${suffix}`;
  }

  private getCurrentDatePrefix(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  private buildSelfHealResponse(
    dto: SelfHealRequestDto,
    affectedShots: AffectedShot[],
    suggestionSummary: string,
    status: SelfHealStatusValue,
    duckDBData: SelfHealDuckDBBundle,
    taskExecution: SelfHealTaskExecutionResult,
  ): SelfHealResultResponse {
    return {
      product_id: dto.product_id,
      creation_id: dto.creation_id,
      task_id: taskExecution.task_id,
      healed_creation_id: taskExecution.healed_creation_id,
      affected_shots: affectedShots,
      suggestion_summary: suggestionSummary,
      status,
      dry_run: dto.dry_run ?? false,
      data_source: duckDBData.data_source,
      is_mock: duckDBData.is_mock,
      is_predicted: duckDBData.is_predicted,
    };
  }

  /** 自愈诊断超时降级：返回部分结果而非完全卡死 */
  private buildSelfHealFallbackResponse(
    dto: SelfHealRequestDto,
    reason: 'timeout' | 'error',
  ): SelfHealResultResponse {
    return {
      product_id: dto.product_id,
      creation_id: dto.creation_id,
      affected_shots: [],
      suggestion_summary: `自愈诊断未能及时完成（${reason === 'timeout' ? '超时' : '系统错误'}），请稍后重试。建议手动检查以下分镜：Hook 强度、旁白时长、CTA 密度。`,
      status: 'SUGGESTED',
      dry_run: dto.dry_run ?? false,
      data_source: 'TIMEOUT_FALLBACK',
      is_mock: true,
      is_predicted: true,
    };
  }

  // =============================================================================
  // A/B 自动对比：多版本两两对比 + 加权排名
  // =============================================================================

  /**
   * 对多个创作版本进行两两对比，生成加权排名和优胜者
   *
   * @param productId 商品 ID
   * @param creationIds 创作 ID 列表
   * @param labels 对应的标签列表
   */
  async compareMultiple(
    productId: string,
    creationIds: string[],
    labels: string[],
  ): Promise<{
    product_id: string;
    winner: { creation_id: string; label: string; score: number };
    rankings: Array<{ creation_id: string; label: string; score: number }>;
    pairwise_results: Array<Record<string, unknown>>;
  }> {
    this.logger.log(`compareMultiple: ${creationIds.length} versions, product=${productId}`);

    if (creationIds.length < 2) {
      throw serviceException(
        {
          message: `compareMultiple 至少需要 2 个创作版本，当前仅 ${creationIds.length} 个`,
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Build all pairwise comparison tasks
    interface ComparisonTask {
      i: number;
      j: number;
      idA: string;
      idB: string;
      labelA: string;
      labelB: string;
    }

    const tasks: ComparisonTask[] = [];
    for (let i = 0; i < creationIds.length; i++) {
      for (let j = i + 1; j < creationIds.length; j++) {
        tasks.push({
          i,
          j,
          idA: creationIds[i],
          idB: creationIds[j],
          labelA: labels[i] || `版本${i + 1}`,
          labelB: labels[j] || `版本${j + 1}`,
        });
      }
    }

    // Execute pairwise comparisons in batches to control DB concurrency
    const CONCURRENCY_LIMIT = 5;
    const pairwiseResults: Array<Record<string, unknown>> = [];
    const scores = new Map<string, number>();
    creationIds.forEach((cid) => scores.set(cid, 0));

    for (let batchStart = 0; batchStart < tasks.length; batchStart += CONCURRENCY_LIMIT) {
      const batch = tasks.slice(batchStart, batchStart + CONCURRENCY_LIMIT);

      const batchResults = await Promise.all(
        batch.map(async (task) => {
          try {
            const compareResult = await this.getAbCompare({
              product_id: productId,
              creation_id_a: task.idA,
              creation_id_b: task.idB,
            });
            return { task, result: compareResult, error: null };
          } catch (err) {
            this.logger.warn(`Pairwise compare ${task.idA.slice(0, 8)} vs ${task.idB.slice(0, 8)} failed: ${err}`);
            return {
              task,
              result: null,
              error: String(err).slice(0, 80),
            };
          }
        }),
      );

      // Aggregate results from this batch
      for (const br of batchResults) {
        if (br.result) {
          pairwiseResults.push({
            creation_id_a: br.task.idA,
            label_a: br.task.labelA,
            creation_id_b: br.task.idB,
            label_b: br.task.labelB,
            winner: br.result.winner,
            metrics: br.result.metrics,
            diagnosis: br.result.diagnosis,
          });

          const margin =
            br.result.metrics.reduce(
              (sum: number, m: { delta: number }) => sum + Math.abs(m.delta),
              0,
            ) / br.result.metrics.length;

          if (br.result.winner === 'A') {
            scores.set(br.task.idA, (scores.get(br.task.idA) || 0) + 1 + margin);
          } else if (br.result.winner === 'B') {
            scores.set(br.task.idB, (scores.get(br.task.idB) || 0) + 1 + margin);
          } else {
            scores.set(br.task.idA, (scores.get(br.task.idA) || 0) + 0.5);
            scores.set(br.task.idB, (scores.get(br.task.idB) || 0) + 0.5);
          }
        } else {
          pairwiseResults.push({
            creation_id_a: br.task.idA,
            label_a: br.task.labelA,
            creation_id_b: br.task.idB,
            label_b: br.task.labelB,
            winner: 'TIE',
            metrics: [],
            diagnosis: [`对比失败: ${br.error}`],
            _error: true,
          });
        }
      }
    }

    // 排名
    const rankings = Array.from(scores.entries())
      .map(([creation_id, score], index) => {
        const idx = creationIds.indexOf(creation_id);
        return {
          creation_id,
          label: labels[idx] || `版本${idx + 1}`,
          score: Math.round(score * 100) / 100,
        };
      })
      .sort((a, b) => b.score - a.score);

    const winner = rankings[0] || { creation_id: '', label: '', score: 0 };

    this.logger.log(
      `compareMultiple done — winner=${winner.label} (${winner.score}), rankings=${rankings.length}`,
    );

    return {
      product_id: productId,
      winner,
      rankings,
      pairwise_results: pairwiseResults,
    };
  }
}
