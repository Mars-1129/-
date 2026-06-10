// =============================================================================
// TikStream AI — 全局 TypeScript 接口契约
// 同步来源: 全局API接口文档 + 素材/剧本/创作/分析看板分册接口文档
// 前后端、四大模块跨模块调用的唯一类型依据
// =============================================================================

// ============================================================
// 1. Global Protocol Types
// ============================================================

export type ApiVersion = 'v1';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * 支持的 UI 语言 / AI 内容生成语言
 * 与前端 SUPPORTED_LOCALES 严格对齐
 */
export type SupportedLocale = 'zh-CN' | 'en-US' | 'id-ID' | 'th-TH' | 'vi-VN' | 'ja-JP' | 'ko-KR';

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
  trace_id: string;
  timestamp: string;
}

export interface ApiErrorDetail {
  field: string;
  reason: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: {
    code: string;
    details?: ApiErrorDetail[];
    retryable: boolean;
  };
  trace_id: string;
  timestamp: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedData<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>;

export interface TaskCreatedData {
  creation_id: string;
  task_id: string;
  status: string;
  current_stage: string;
  progress: number;
}

// ============================================================
// 2. Common Headers
// ============================================================

export interface CommonRequestHeaders {
  Authorization?: string;
  'X-Trace-Id'?: string;
  'X-Request-Id'?: string;
  'Idempotency-Key'?: string;
  'Content-Type'?: string;
}

// ============================================================
// 3. Error Codes Enum
// ============================================================

export const ErrorCode = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  PRODUCT_ID_REQUIRED: 'PRODUCT_ID_REQUIRED',
  FILE_FORMAT_NOT_SUPPORTED: 'FILE_FORMAT_NOT_SUPPORTED',
  FILE_SIZE_EXCEEDED: 'FILE_SIZE_EXCEEDED',
  MATERIAL_NOT_FOUND: 'MATERIAL_NOT_FOUND',
  SCRIPT_NOT_FOUND: 'SCRIPT_NOT_FOUND',
  SCRIPT_PARSE_FAILED: 'SCRIPT_PARSE_FAILED',
  SCRIPT_NO_SHOTS_GENERATED: 'SCRIPT_NO_SHOTS_GENERATED',
  CREATION_NOT_FOUND: 'CREATION_NOT_FOUND',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  VIRAL_VIDEO_ANALYSIS_NOT_FOUND: 'VIRAL_VIDEO_ANALYSIS_NOT_FOUND',
  VIRAL_ANALYSIS_NOT_PUBLIC: 'VIRAL_ANALYSIS_NOT_PUBLIC',
  TEMPLATE_NOT_ACTIVE: 'TEMPLATE_NOT_ACTIVE',
  TEMPLATE_FACTOR_EMPTY: 'TEMPLATE_FACTOR_EMPTY',
  SCRIPT_SCHEMA_INVALID: 'SCRIPT_SCHEMA_INVALID',
  SCRIPT_DURATION_EXCEEDED: 'SCRIPT_DURATION_EXCEEDED',
  COMPLIANCE_CHECK_FAILED: 'COMPLIANCE_CHECK_FAILED',
  SHOT_INDEX_OUT_OF_RANGE: 'SHOT_INDEX_OUT_OF_RANGE',
  PATCH_PATH_NOT_ALLOWED: 'PATCH_PATH_NOT_ALLOWED',
  PATCH_OP_INVALID: 'PATCH_OP_INVALID',
  TIMING_INCONSISTENT: 'TIMING_INCONSISTENT',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  TIMING_ESTIMATION_FAILED: 'TIMING_ESTIMATION_FAILED',
  INVALID_VOICEOVER_TEXT: 'INVALID_VOICEOVER_TEXT',
  TASK_STATUS_CONFLICT: 'TASK_STATUS_CONFLICT',
  TASK_STILL_PROCESSING: 'TASK_STILL_PROCESSING',
  TASK_ALREADY_DELETED: 'TASK_ALREADY_DELETED',
  TASK_NOT_IN_TRASH: 'TASK_NOT_IN_TRASH',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  CREATION_SCRIPT_PRODUCT_MISMATCH: 'CREATION_SCRIPT_PRODUCT_MISMATCH',
  RATE_LIMITED: 'RATE_LIMITED',
  VECTOR_SEARCH_FAILED: 'VECTOR_SEARCH_FAILED',
  MODEL_PROVIDER_FAILED: 'MODEL_PROVIDER_FAILED',
  OBJECT_STORAGE_WRITE_FAILED: 'OBJECT_STORAGE_WRITE_FAILED',
  INTERNAL_WORKER_CALLBACK_FAILED: 'INTERNAL_WORKER_CALLBACK_FAILED',
  ANALYTICS_PRECOMPUTE_MISSING: 'ANALYTICS_PRECOMPUTE_MISSING',
  ANALYTICS_DUCKDB_FAILED: 'ANALYTICS_DUCKDB_FAILED',
  ANALYTICS_NO_SHOTS_IN_CREATION: 'ANALYTICS_NO_SHOTS_IN_CREATION',
  ANALYTICS_STYLE_FACTOR_DIMENSION_CONFLICT: 'ANALYTICS_STYLE_FACTOR_DIMENSION_CONFLICT',
  ANALYTICS_AB_COMPARE_SAME_CREATION: 'ANALYTICS_AB_COMPARE_SAME_CREATION',
  ANALYTICS_SELF_HEAL_MANUAL_NO_TARGETS: 'ANALYTICS_SELF_HEAL_MANUAL_NO_TARGETS',
  ANALYTICS_SELF_HEAL_STRATEGY_CONFLICT: 'ANALYTICS_SELF_HEAL_STRATEGY_CONFLICT',
  MATERIAL_FILE_MISSING: 'MATERIAL_FILE_MISSING',
  MATERIAL_UPLOAD_BATCH_EXCEEDED: 'MATERIAL_UPLOAD_BATCH_EXCEEDED',
  MATERIAL_SLICE_COMPUTE_FAILED: 'MATERIAL_SLICE_COMPUTE_FAILED',
  MATERIAL_IDEMPOTENCY_CONFLICT: 'MATERIAL_IDEMPOTENCY_CONFLICT',
  MATERIAL_DELETE_CONFLICT: 'MATERIAL_DELETE_CONFLICT',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  TEMPLATE_NAME_DUPLICATE: 'TEMPLATE_NAME_DUPLICATE',
  TEMPLATE_STATUS_IMMUTABLE: 'TEMPLATE_STATUS_IMMUTABLE',
  TEMPLATE_CATEGORY_INVALID: 'TEMPLATE_CATEGORY_INVALID',
  TEMPLATE_FACTOR_STRUCTURE_INVALID: 'TEMPLATE_FACTOR_STRUCTURE_INVALID',
  TEMPLATE_SCHEMA_INVALID: 'TEMPLATE_SCHEMA_INVALID',
  VIRAL_ANALYSIS_URL_INVALID: 'VIRAL_ANALYSIS_URL_INVALID',
  VIRAL_ANALYSIS_PLATFORM_INVALID: 'VIRAL_ANALYSIS_PLATFORM_INVALID',
  VIRAL_ANALYSIS_DUPLICATE: 'VIRAL_ANALYSIS_DUPLICATE',
  GPU_SLICING_DECORD_FAILED: 'GPU_SLICING_DECORD_FAILED',
  GPU_SLICING_TRANSNET_FAILED: 'GPU_SLICING_TRANSNET_FAILED',
  GPU_SLICING_FFMPEG_CUT_FAILED: 'GPU_SLICING_FFMPEG_CUT_FAILED',
  GPU_SLICING_FFMPEG_NOT_FOUND: 'GPU_SLICING_FFMPEG_NOT_FOUND',
  GPU_SLICING_NO_VALID_SLICES: 'GPU_SLICING_NO_VALID_SLICES',
  GPU_SLICING_PYTHON_DEPENDENCY_MISSING: 'GPU_SLICING_PYTHON_DEPENDENCY_MISSING',
  GPU_SLICING_DOWNLOAD_FAILED: 'GPU_SLICING_DOWNLOAD_FAILED',
  // TrendTracker
  TREND_SNAPSHOT_NOT_FOUND: 'TREND_SNAPSHOT_NOT_FOUND',
  TREND_GENERATION_FAILED: 'TREND_GENERATION_FAILED',
  TREND_PRODUCT_REQUIRED: 'TREND_PRODUCT_REQUIRED',
  // Watermark
  WATERMARK_CONFIG_INVALID: 'WATERMARK_CONFIG_INVALID',
  WATERMARK_APPLY_FAILED: 'WATERMARK_APPLY_FAILED',
  WATERMARK_VERIFY_FAILED: 'WATERMARK_VERIFY_FAILED',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ============================================================
// 4. JSON Patch (RFC 6902)
// ============================================================

export type JsonPatchOp = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';

export interface JsonPatchOperation {
  op: JsonPatchOp;
  path: string;
  from?: string;
  value?: unknown;
}

export type JsonPatchDocument = JsonPatchOperation[];

// ============================================================
// 5. Core Domain Enums
// ============================================================

export type MaterialType = 'IMAGE' | 'VIDEO' | 'PRODUCT_MAIN_IMAGE';

export type ReferenceCategory = 'COMPETITOR_IMAGE' | 'COMPETITOR_VIDEO' | 'INSPIRATION' | 'BENCHMARK';

export type MaterialSourceType = 'UPLOAD' | 'REFERENCE' | 'GENERATED';

export type MaterialStatus = 'AWAITING_PRODUCT_RECOGNITION' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type MaterialSliceStatus = 'PENDING' | 'CAPTIONING' | 'EMBEDDING' | 'COMPLETED' | 'FAILED';

export type ScriptGenerationMode = 'PROMPT_DRIVEN' | 'VIRAL_REWRITE' | 'TEMPLATE_DRIVEN' | 'HYBRID' | 'COMPOSED' | 'BATCH';

export type AspectRatio = '9:16' | '16:9' | '1:1';

export type CameraMovement = 'Static' | 'Dolly_In_Fast' | 'Dolly_Out' | 'Pan_Left' | 'Tilt_Up';

export type TransitionType = 'None' | 'Fade_In' | 'Dissolve' | 'Wipe';

export type ComplianceStatus = 'PENDING' | 'PASSED' | 'REJECTED';

export type CreationStatus = 'PENDING' | 'PROCESSING' | 'FINISHED' | 'FAILED' | 'CANCELED';

export type CreationStage =
  | 'QUEUE_ALLOCATION'
  | 'ASSET_MATCHING'
  | 'AI_VIDEO_GENERATING'
  | 'TTS_GENERATING'
  | 'FFMPEG_STITCHING'
  | 'LOUDNORM_COMPLIANCE'
  | 'ORIGINALITY_CHECK'
  | 'ORIGINALITY_OPTIMIZE'
  | 'FINISHED'
  | 'FAILED';

export type ShotRenderStatus = 'PENDING' | 'PROCESSING' | 'FINISHED' | 'FAILED';

export type EngineMode = 'SCRIPT_DRIVEN' | 'IMAGE_DRIVEN' | 'PROMPT_DRIVEN';

export type SliceMatchStrategy = 'AUTO' | 'MANUAL' | 'AUTO_WITH_PREFERRED';

export interface MaterialContext {
  material_id: string;
  filename: string;
  type: MaterialType;
  captions: string[];
  scene_descriptions: string[];
  dominant_colors: string[];
  objects: string[];
  product_angles: string[];
}

export type TemplateStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

// ============================================================
// 6. Domain Entities (matching Prisma Schema)
// ============================================================

export interface Product {
  id: string;
  title: string;
  sku_code: string;
  category: string;
  selling_points: string[];
  target_audience?: string;
  scenario_tags: string[];
  text_features: Record<string, unknown>;
  cover_image_url?: string;
  /** 商品主体颜色（如"银白色"、"深空灰"） */
  color?: string;
  /** 商品主体材质（如"铝合金"、"陶瓷涂层"） */
  material_type?: string;
  /** 尺寸描述 */
  size_desc?: string;
  /** 典型使用场景（如"居家美发"、"户外运动"） */
  usage_scenario?: string;
  /** 可辨识品牌名 */
  brand?: string;
  /** 富特性（JSON 对象，如 {"shape":"圆柱形","has_led":true}） */
  rich_features: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProductListQuery {
  page?: number;
  page_size?: number;
  category?: string;
  keyword?: string;
}

export interface CreateProductRequest {
  title: string;
  category?: string;
  selling_points?: string[];
  target_audience?: string;
  scenario_tags?: string[];
  cover_image_url?: string;
  color?: string;
  material_type?: string;
  size_desc?: string;
  usage_scenario?: string;
  brand?: string;
  rich_features?: Record<string, unknown>;
}

export interface UpdateProductRequest {
  /** 商品标题 */
  title?: string;
  /** 商品品类 */
  category?: string;
  /** 卖点列表 */
  selling_points?: string[];
  /** 目标人群描述 */
  target_audience?: string;
  /** 场景标签 */
  scenario_tags?: string[];
  /** 封面图 URL */
  cover_image_url?: string;
  /** 商品主体颜色 */
  color?: string;
  /** 商品主体材质 */
  material_type?: string;
  /** 尺寸描述 */
  size_desc?: string;
  /** 典型使用场景 */
  usage_scenario?: string;
  /** 品牌名 */
  brand?: string;
  /** 富特性 JSON */
  rich_features?: Record<string, unknown>;
}
  
export interface ProductRecognitionResult {
  title: string;
  category: string;
  selling_points: string[];
  color?: string;
  material_type?: string;
  size_desc?: string;
  usage_scenario?: string;
  brand?: string;
  rich_features?: Record<string, unknown>;
}

export interface ProductStats {
  product_id: string;
  product_title: string;
  sku_code: string;
  category: string;
  cover_image_url?: string;
  image_count: number;
  video_count: number;
  total_slices: number;
  total_materials: number;
}

export interface ProductStatsResponse {
  products: ProductStats[];
}

export interface Material {
  material_id: string;
  product_id: string;
  file_name: string;
  type: MaterialType;
  source_type: MaterialSourceType;
  origin_url: string;
  thumbnail_url?: string;
  file_size_bytes: number;
  duration_seconds?: number;
  width?: number;
  height?: number;
  mime_type?: string;
  status: MaterialStatus;
  slices_count: number;
  remark?: string;
  vision_analysis?: VisionAnalysisResult;
  referenced_material_id?: string;
  reference_category?: ReferenceCategory;
  created_at: string;
  updated_at: string;
}

export interface MaterialSlice {
  id: string;
  material_id: string;
  slice_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  dense_caption?: string;
  tags: string[];
  product_dimension_tags: string[];
  video_dimension_tags: string[];
  slice_dimension_tags: string[];
  stream_url?: string;
  key_frame_url?: string;
  embedding_version?: string;
  sfx_url?: string;
  status: MaterialSliceStatus;
  created_at: string;
  updated_at: string;
}

export interface Script {
  script_id: string;
  product_id: string;
  title?: string;
  language: SupportedLocale;
  target_audience?: string;
  video_duration: number;
  aspect_ratio: AspectRatio;
  style_vibe: string;
  generation_mode: ScriptGenerationMode;
  template_id?: string;
  viral_video_id?: string;
  constraint_list: string[];
  preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
  narrative_framework?: NarrativeFramework;
  visual_style?: VisualStyle;
  applied_constraints?: string[];
  raw_json: Record<string, unknown>;
  shots: ScriptShot[];
  created_at: string;
  updated_at: string;
}

export interface NarrativeFramework {
  narrative_arc: string;
  tension_curve: string;
  emotional_beat: string[];
}

export interface VisualStyle {
  color_palette: string;
  visual_tempo: string;
  lighting_style: string;
}

export interface BgmSegment {
  style: string;
  energy_level: 'low' | 'mid' | 'high';
  beat_pattern: string;
}

export interface ScriptShot {
  id: string;
  shot_id?: string;
  shot_index: number;
  duration: number;
  scene_description_query: string;
  visual_description: string;
  camera_movement: CameraMovement;
  transition_type: TransitionType;
  voiceover_text: string;
  subtitle_text: string;
  safe_zone_bounding_box: [number, number, number, number];
  selected_slice_id?: string;
  render_prompt?: string;
  bgm_segment?: BgmSegment;
  local_factor_patch: Record<string, unknown>;
  compliance_status: ComplianceStatus;
  created_at: string;
  updated_at: string;
}

export interface Creation {
  creation_id: string;
  product_id: string;
  script_id: string;
  task_id: string;
  engine_mode: EngineMode;
  target_resolution: string;
  export_format: string;
  status: CreationStatus;
  progress: number;
  current_stage: CreationStage;
  video_url?: string;
  file_size_bytes?: number;
  trace_id?: string;
  error_code?: string;
  error_message?: string;
  started_at?: string;
  finished_at?: string;
  shot_renders: ShotRenderSummary[];
  created_at: string;
  updated_at: string;
}

export interface ShotRenderSummary {
  shot_render_id: string;
  creation_id: string;
  script_shot_id: string;
  shot_id?: string;
  shot_index: number;
  cache_hash?: string;
  slice_id?: string;
  render_path?: string;
  render_duration_ms?: number;
  retry_count: number;
  status: ShotRenderStatus;
  error_message?: string;
  source?: 'RENDERED' | 'CACHE_HIT';
  seedance_prompt?: string;
  updated_at: string;
}

export interface Template {
  template_id: string;
  product_id?: string;
  name: string;
  category: string;
  strategy_summary: string;
  source: 'MANUAL' | 'CLUSTERED';
  status: TemplateStatus;
  created_at: string;
  updated_at: string;
}

export interface ViralVideoAnalysisSummary {
  analysis_id: string;
  source_platform: string;
  source_url: string;
  title?: string;
  hook_type?: string;
}

export interface TemplateDetail extends Template {
  viral_video_analyses?: ViralVideoAnalysisSummary[];
  factors?: TemplateFactorAssignment[];
  strategies?: Strategy[];
  constraints?: Constraint[];
}

export type FactorCategory = 'NARRATIVE' | 'PARAMETER' | 'INSTRUCTION';

export type GenerateMode = 'quick' | 'viral' | 'template' | 'composed' | 'hybrid' | 'batch';

export interface Factor {
  factor_id: string;
  key: string;
  name: string;
  category: FactorCategory;
  description?: string;
  default_value?: Record<string, unknown>;
  value_schema?: Record<string, unknown>;
  sort_order: number;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateFactorAssignment {
  factor_id: string;
  factor_key: string;
  factor_name: string;
  factor_category: FactorCategory;
  value: Record<string, unknown>;
}

export interface CreateFactorRequest {
  key: string;
  name: string;
  category: FactorCategory;
  description?: string;
  default_value?: Record<string, unknown>;
  value_schema?: Record<string, unknown>;
  sort_order?: number;
}

export interface UpdateFactorRequest {
  name?: string;
  category?: FactorCategory;
  description?: string;
  default_value?: Record<string, unknown>;
  value_schema?: Record<string, unknown>;
  sort_order?: number;
}

export interface AssignTemplateFactorsRequest {
  factors: Array<{
    factor_id: string;
    value: Record<string, unknown>;
  }>;
}

export interface Strategy {
  strategy_id: string;
  key: string;
  name: string;
  description?: string;
  category: string;
  summary: string;
  summary_json?: Record<string, unknown>;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateStrategyRequest {
  key: string;
  name: string;
  category: string;
  description?: string;
  summary: string;
  summary_json?: Record<string, unknown>;
  sort_order?: number;
}

export interface UpdateStrategyRequest {
  name?: string;
  category?: string;
  description?: string;
  summary?: string;
  summary_json?: Record<string, unknown>;
  sort_order?: number;
}

export interface AssignTemplateStrategiesRequest {
  strategy_ids: string[];
}

export type ConstraintRuleType = 'HARD' | 'SOFT';

export interface Constraint {
  constraint_id: string;
  key: string;
  name: string;
  description?: string;
  category: string;
  rule_type: ConstraintRuleType;
  rule_config: Record<string, unknown>;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateConstraintRequest {
  key: string;
  name: string;
  category: string;
  rule_type: ConstraintRuleType;
  rule_config: Record<string, unknown>;
  description?: string;
  sort_order?: number;
}

export interface UpdateConstraintRequest {
  name?: string;
  category?: string;
  rule_type?: ConstraintRuleType;
  rule_config?: Record<string, unknown>;
  description?: string;
  sort_order?: number;
}

export interface AssignTemplateConstraintsRequest {
  constraint_ids: string[];
}

export interface FactorRemixRequest {
  factor_overrides: Record<string, unknown>;
  preserve_voiceover?: boolean;
  extra_instruction?: string;
}

export interface CreateTemplateRequest {
  product_id?: string;
  name: string;
  category: string;
  strategy_summary: string;
  factor_json: Record<string, unknown>;
  schema_json?: Record<string, unknown>;
  status?: TemplateStatus;
}

export interface UpdateTemplateRequest {
  name?: string;
  category?: string;
  strategy_summary?: string;
  factor_json?: Record<string, unknown>;
  schema_json?: Record<string, unknown> | null;
  status?: TemplateStatus;
}

export interface ClusterTemplatesRequest {
  product_id: string;
  analysis_ids: string[];
  name: string;
  category: string;
}

export interface ClusterTemplatesResponse {
  template: Template;
  strategy_summary: string;
  factor_json: Record<string, unknown>;
  viral_video_analyses: ViralVideoAnalysisSummary[];
}

export interface StageFactor {
  opening?: Record<string, unknown>;
  hook_body?: Record<string, unknown>;
  product_showcase?: Record<string, unknown>;
  social_proof?: Record<string, unknown>;
  cta_closing?: Record<string, unknown>;
}

export interface ViralVideoAnalysis {
  analysis_id: string;
  product_id?: string;
  source_platform: string;
  source_url: string;
  external_video_id: string;
  title?: string;
  hook_type?: string;
  declared_public_source: boolean;
  analyzing?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ViralVideoAnalysisShot {
  shot_index: number;
  duration: number;
  scene_description: string;
  camera_movement: string;
  transition_type: string;
  visual_elements: string;
  audio_elements: string;
}

export interface ViralVideoAnalysisDetail extends ViralVideoAnalysis {
  strategy_json: Record<string, unknown>;
  factor_json: Record<string, unknown>;
  report_json: Record<string, unknown>;
  selling_points?: string[];
  shots?: ViralVideoAnalysisShot[];
}

export interface ViralVideoAnalysisSuggestKeywordsRequest {
  product_category?: string;
  product_title?: string;
}

export interface ViralVideoAnalysisSuggestKeywordsResponse {
  platform_suggestions: Array<{
    platform: string;
    hashtags: string[];
    search_terms: string[];
  }>;
}

export interface ViralVideoAnalysisCreateResponse {
  analysis: ViralVideoAnalysis & { analyzing?: boolean };
  potential_duplicate: boolean;
  duplicate_of?: string;
}

export interface ViralVideoAnalysisSearchResponse {
  items: ViralVideoAnalysisDetail[];
  total: number;
  page: number;
  page_size: number;
}

export interface ViralVideoAnalysisAnalyzeResponse {
  analysis: ViralVideoAnalysisDetail;
  status: 'completed' | 'in_progress' | 'failed';
}

export interface ViralVideoAnalysisSearchRequest {
  keyword?: string;
  category?: string;
  source_platform?: string;
  product_id?: string;
  page?: number;
  page_size?: number;
}

export interface ViralVideoAnalysisFromMaterialRequest {
  material_id: string;
  product_id?: string;
}

/** 批量查询 / 按商品查询 的列表响应（不带分页） */
export interface ViralVideoAnalysisListResponse {
  items: ViralVideoAnalysisDetail[];
}

// ============================================================
// 6.1 Viral DNA — 爆款 DNA 提取 & 聚类
// ============================================================

export interface HookDNA {
  type: 'problem_forward' | 'suspense_progressive' | 'contrast_compare' |
    'story_narrative' | 'list_enumeration' | 'emotional_trigger';
  structure: {
    duration_seconds: number;
    word_count: number;
    emotional_hooks: string[];
    action_verbs: string[];
  };
  effectiveness: {
    retention_rate_avg: number;
    ctr_avg: number;
    completion_rate_avg: number;
  };
}

export interface VisualStyleDNA {
  style: string;
  camera_patterns: string[];
  transition_sequence: string[];
  shot_count_range: [number, number];
  duration_range: [number, number];
  color_palette: string[];
  text_overlay_ratio: number;
}

export interface BgmPatternDNA {
  genre: string;
  bpm_range: [number, number];
  energy_curve: number[];
  intro_duration_seconds: number;
  peak_timestamp_seconds: number;
  fade_out_duration_seconds: number;
}

export interface PacingPatternDNA {
  avg_shot_duration_seconds: number;
  duration_variance: number;
  tempo_curve: number[];
  engagement_peaks: number[];
}

export interface CtaStyleDNA {
  placement_type: 'ending' | 'mid_video' | 'scattered';
  delay_from_end_seconds: number;
  visual_intensity: number;
  text_templates: string[];
  effectiveness_avg: number;
}

export interface ViralDNA {
  dna_id: string;
  category: string;
  market: string;
  product_names: string[];
  hooks: HookDNA[];
  visual_styles: VisualStyleDNA[];
  bgm_patterns: BgmPatternDNA[];
  pacing_patterns: PacingPatternDNA[];
  cta_styles: CtaStyleDNA[];
  composite_score: number;
  sample_count: number;
  confidence: number;
  /** 统计元数据：各维度统计摘要 */
  statistics?: DNAStatistics;
  /** LLM 生成的语义标签 */
  hook_label?: string;
  hook_explanation?: string;
  style_label?: string;
  style_explanation?: string;
  bgm_label?: string;
  bgm_explanation?: string;
  narrative_explanation?: string;
  success_reason?: string;
  created_at: string;
  updated_at: string;
}

/** DNA 统计元数据 — 基于原始爆款分析的统计计算结果 */
export interface DNAStatistics {
  /** 总样本量 */
  sample_size: number;
  /** 各 Hook 类型出现频次 */
  hook_type_distribution: Record<string, number>;
  /** 平均镜头数 */
  avg_shot_count: number;
  /** 平均视频时长（秒） */
  avg_duration_seconds: number;
  /** 最高/中位/平均互动率 */
  engagement: { max: number; median: number; mean: number };
  /** 最高/中位/平均 CTR */
  ctr: { max: number; median: number; mean: number };
  /** 最高/中位/平均完播率 */
  completion: { max: number; median: number; mean: number };
  /** 各钩子类型的效果均值 */
  hook_type_effectiveness: Record<string, { retention: number; ctr: number; completion: number }>;
  /** 样本方差（多样性指标） */
  diversity_variance: number;
  /** t-分布 95% 置信区间半宽 */
  confidence_interval_95: number;
}

export interface ViralDNAExtractRequest {
  category: string;
  market?: string;
  min_samples?: number;
}

export interface ViralDNAExtractResponse {
  patterns: ViralDNA[];
  total_samples: number;
  confidence: number;
}

export interface ViralDNAListQuery {
  category?: string;
  market?: string;
}

// ============================================================
// 7. Material Module Request/Response Types
// ============================================================

export interface MaterialUploadRequest {
  product_id?: string;
  type: MaterialType;
  source_type?: MaterialSourceType;
  remark?: string;
  auto_recognize_product?: boolean;
  reference_material_id?: string;
  reference_category?: ReferenceCategory;
}

export interface MaterialUploadResponse {
  material_id: string;
  product_id: string;
  file_name: string;
  type: MaterialType;
  source_type: MaterialSourceType;
  status: MaterialStatus;
  thumbnail_url?: string;
  file_size_bytes: number;
  async_task_id: string;
  created_at: string;
}

export interface MaterialListQuery {
  product_id: string;
  status?: MaterialStatus;
  type?: MaterialType;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface MaterialDetailResponse {
  material: Material;
  slices: MaterialSlice[];
}

/** AI 视觉理解分析结果 */
export interface VisionAnalysisResult {
  product_features: string[];
  visual_selling_points: string[];
  shot_suggestions: Array<{
    shot_type: string;
    description: string;
    priority: number;
  }>;
  style_tags: string[];
  quality_assessment: {
    clarity: 'high' | 'medium' | 'low';
    lighting: string;
    composition: string;
  };
}

export interface MaterialSearchRequest {
  product_id: string;
  query: string;
  min_duration?: number;
  max_duration?: number;
  page?: number;
  page_size?: number;
}

export interface MaterialReprocessResponse {
  material_id: string;
  task_id: string;
  status: string;
}

// ============================================================
// 8. Script Module Request/Response Types
// ============================================================

export interface ScriptQuickGenerateRequest {
  product_id: string;
  title?: string;
  language?: SupportedLocale;
  selling_points: string[];
  target_audience?: string;
  style_vibe: string;
  aspect_ratio: AspectRatio;
  constraint_list?: string[];
  enable_ai_compliance?: boolean;
  /** 指定素材 UUID 列表，LLM 将基于这些素材的视觉特征生成更精准的剧本 */
  material_ids?: string[];
  /** AI 视觉理解开关（需开通多模态 API 权限） */
  enable_vision_analysis?: boolean;
  /** 图片视觉分析文本（由视觉模型生成），用于增强剧本生成的准确性 */
  image_analysis?: string;
}

export interface ScriptViralRewriteRequest {
  product_id: string;
  viral_video_id?: string;
  auto_match?: boolean;
  title?: string;
  language?: SupportedLocale;
  style_vibe: string;
  aspect_ratio: AspectRatio;
  selling_points?: string[];
  target_audience?: string;
  constraint_list?: string[];
  enable_ai_compliance?: boolean;
  /** 指定素材 UUID 列表 */
  material_ids?: string[];
  enable_vision_analysis?: boolean;
}

export interface ScriptTemplateGenerateRequest {
  product_id: string;
  template_id: string;
  title?: string;
  language?: SupportedLocale;
  style_vibe?: string;
  aspect_ratio: AspectRatio;
  selling_points?: string[];
  target_audience?: string;
  constraint_list?: string[];
  enable_ai_compliance?: boolean;
  /** 指定素材 UUID 列表 */
  material_ids?: string[];
  enable_vision_analysis?: boolean;
}

export interface ScriptGenerateResponse {
  script_id: string;
  product_id: string;
  title?: string;
  language: SupportedLocale;
  target_audience?: string;
  video_duration: number;
  aspect_ratio: AspectRatio;
  style_vibe: string;
  generation_mode: ScriptGenerationMode;
  template_id?: string;
  viral_video_id?: string;
  constraint_list: string[];
  preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
  narrative_framework?: NarrativeFramework;
  visual_style?: VisualStyle;
  applied_constraints?: string[];
  raw_json: Record<string, unknown>;
  shots: ScriptShot[];
  created_at: string;
  updated_at: string;
}

export interface PatchSuggestRequest {
  operations: JsonPatchOperation[];
}

export interface PatchSuggestResponse {
  impact_analysis: string;
  suggested_patches: Array<{
    op: string;
    path: string;
    value: unknown;
    reason: string;
  }>;
  confidence: 'high' | 'medium' | 'low';
}

export interface RegenerateScriptRequest {
  style_vibe?: string;
  selling_points?: string[];
  target_audience?: string;
  constraint_list?: string[];
  title?: string;
  language?: string;
  aspect_ratio?: AspectRatio;
  extra_instruction?: string;
}

export interface RegenerateFeedbackRequest {
  shot_feedbacks: Array<{
    shot_index: number;
    feedback: string;
  }>;
  regenerate_mode?: 'targeted' | 'cascade';
  extra_instruction?: string;
}

export interface RegenerateRestyleRequest {
  visual_style: {
    color_palette: string;
    visual_tempo: string;
    lighting_style: string;
  };
  preserve_audio?: boolean;
  extra_instruction?: string;
}

export interface ScriptBatchGenerateRequest {
  product_id: string;
  batch_size: number;
  style_variations: string[];
  constraint_list?: string[];
  enable_ai_compliance?: boolean;
  max_concurrency?: number;
  material_ids?: string[];
  enable_vision_analysis?: boolean;
}

export interface ScriptBatchGenerateResponse {
  batch_id: string;
  total: number;
  succeeded: number;
  failed: number;
  scripts: ScriptGenerateResponse[];
  failures?: Array<{
    style_vibe: string;
    error: string;
  }>;
  style_variations?: string[];
}

export interface ScriptComplianceReviewResult {
  shot_index: number;
  violated_word: string;
  original_reason: string;
  ai_verdict: 'BLOCK' | 'WARN' | 'FALSE_POSITIVE' | 'INCONCLUSIVE';
  ai_reason: string;
  severity?: number;
  suggestion?: string;
}

export interface ScriptComplianceReviewResponse {
  script_id: string;
  compliance_passed: boolean;
  total_violations: number;
  blocked_count: number;
  warn_count: number;
  false_positive_count: number;
  review_results: ScriptComplianceReviewResult[];
  /** 审查摘要文本（前端展示用） */
  review_summary?: string;
}

// ===== Agent Types =====

export interface AgentGenerateRequest {
  product_id: string;
  style_vibe?: string;
  language?: string;
  aspect_ratio?: string;
  constraint_list?: string[];
  preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
}

export interface AgentStepLogEntry {
  node: string;
  timestamp: string;
  action: string;
  reasoning: string;
  data?: Record<string, unknown>;
}

export interface AgentGenerateResponse {
  run_id: string;
  status: 'ACCEPTED' | 'RUNNING' | 'PASSED' | 'FALLBACK';
  iterations: number;
  final_script_id: string;
  step_log: AgentStepLogEntry[];
}

// =============================================================================
// Auto A/B 自动出片对比
// =============================================================================

export interface AutoAbStyleVariant {
  label: string;
  style_vibe: string;
}

export interface AutoAbRunRequest {
  product_id: string;
  script_id: string;
  style_variants?: AutoAbStyleVariant[];
}

export interface AutoAbRankingEntry {
  rank: number;
  creation_id: string;
  label: string;
  score: number;
}

export interface AutoAbWinnerEntry {
  creation_id: string;
  label: string;
  score: number;
}

export interface AutoAbStepLogEntry {
  node: string;
  timestamp: string;
  action: string;
  reasoning: string;
  data?: Record<string, unknown>;
}

export interface AutoAbRunResponse {
  run_id: string;
  session_id: string;
  status: 'COMPLETED' | 'FAILED';
  product_id: string;
  base_script_id: string;
  variant_script_ids: string[];
  variant_labels: string[];
  creation_ids: string[];
  winner: AutoAbWinnerEntry;
  rankings: AutoAbRankingEntry[];
  insights: string[];
  step_log: AutoAbStepLogEntry[];
  generated_at: string;
}

export interface ScriptComposedGenerateRequest {
  product_id: string;
  template_id?: string;
  viral_video_id?: string;
  auto_match_viral?: boolean;
  strategy_overrides?: Record<string, unknown>;
  factor_overrides?: Record<string, unknown>;
  constraint_overrides?: string[];
  title?: string;
  language?: string;
  style_vibe?: string;
  aspect_ratio?: AspectRatio;
  selling_points?: string[];
  target_audience?: string;
  constraint_list?: string[];
  enable_ai_compliance?: boolean;
  material_ids?: string[];
  enable_vision_analysis?: boolean;
}

export interface ScriptHybridGenerateRequest {
  product_id: string;
  template_id?: string;
  viral_video_id?: string;
  auto_match_viral?: boolean;
  user_strategy_summary?: string;
  user_factors?: Record<string, unknown>;
  user_constraints?: string[];
  title?: string;
  language?: string;
  style_vibe?: string;
  style_variations?: string[];
  aspect_ratio?: AspectRatio;
  selling_points?: string[];
  target_audience?: string;
  constraint_list?: string[];
  enable_ai_compliance?: boolean;
  material_ids?: string[];
  enable_vision_analysis?: boolean;
}

export interface ScriptHybridGenerateResponse {
  script_id: string;
  product_id: string;
  video_duration: number;
  aspect_ratio: AspectRatio;
  style_vibe: string;
  generation_mode: ScriptGenerationMode;
  narrative_framework?: NarrativeFramework;
  visual_style?: VisualStyle;
  applied_constraints?: string[];
  shots: ScriptShot[];
  created_at: string;
}

export interface ScriptSaveRequest {
  save_message?: string;
  force_revalidate?: boolean;
}

export interface ScriptSaveResponse {
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

export interface ScriptValidateTimingRequest {
  shot_index: number;
  voiceover_text: string;
  duration: number;
  style_vibe?: string;
  language?: string;
}

export interface ScriptValidateTimingResponse {
  valid: boolean;
  estimated_duration: number;
  shot_duration: number;
  overflow_words: number;
  suggestion: string;
}

export interface ScriptPatchResponse {
  script_id: string;
  video_duration: number;
  timing_validation: ScriptValidateTimingResponse;
  updated_fields: string[];
  updated_at: string;
}

// ============================================================
// 8.1 Script Version Types (Phase 2)
// ============================================================

export interface ScriptVersionSummary {
  version_id: string;
  version_number: number;
  trigger_action: 'MANUAL_SAVE' | 'PATCH_EDIT' | 'AI_REGENERATE' | 'ROLLBACK';
  created_at: string;
}

export interface ScriptVersionDetail extends ScriptVersionSummary {
  snapshot: ScriptVersionSnapshot;
}

export interface ScriptVersionSnapshot {
  script: {
    title?: string;
    video_duration: number;
    style_vibe: string;
    aspect_ratio: string;
    language: string;
    target_audience?: string;
    constraint_list: string[];
  };
  shots: ScriptShot[];
}

export interface ScriptVersionListResponse {
  items: ScriptVersionSummary[];
  page: number;
  page_size: number;
  total: number;
}

// ============================================================
// 8.2 Creation Template Types (Phase 2)
// ============================================================

export interface CreationTemplateSummary {
  template_id: string;
  name: string;
  product_id?: string;
  script_id: string;
  created_at: string;
}

export interface CreationTemplateDetail extends CreationTemplateSummary {
  preset_json: Record<string, unknown>;
}

export interface SaveAsTemplateRequest {
  name: string;
}

// ============================================================
// 9. Creation Module Request/Response Types
// ============================================================

export interface CreateCreationRequest {
  product_id: string;
  /** SCRIPT_DRIVEN 必填；IMAGE_DRIVEN / PROMPT_DRIVEN 可选(自动生成) */
  script_id?: string;
  engine_mode?: EngineMode;
  target_resolution?: string;
  export_format?: string;
  voice_profile?: string;
  bgm_policy?: string;
  force_refresh?: boolean;
  prefer_ai_video?: boolean;
  /** 目标配音语种（默认 zh-CN；支持 ja-JP/ko-KR/th-TH/id-ID/es-ES/en-US） */
  target_language?: string;

  // ---- IMAGE_DRIVEN 模式专用 ----
  /** PRODUCT_MAIN_IMAGE 素材 UUID（IMAGE_DRIVEN 必填） */
  material_id?: string;
  /** 自动生成剧本时的风格调性 */
  style_vibe?: string;
  /** 自动生成剧本时的画幅比例 */
  aspect_ratio?: string;

  // ---- PROMPT_DRIVEN 模式专用 ----
  /** 商品链接（AI 解析为结构化 Product 信息） */
  product_url?: string;
  /** 商品标题（手动输入，可选） */
  product_title?: string;
  /** 商品卖点列表 */
  product_selling_points?: string[];
  /** 商品类目 */
  product_category?: string;

  // ---- 素材关联（所有模式可选，SCRIPT_DRIVEN 下推荐） ----
  /** 分镜→素材切片绑定映射。key=shot_index, value=slice_id。指定后跳过自动匹配 */
  shot_slice_bindings?: Record<number, string>;
  /** 素材 UUID 列表（用于限定自动匹配候选池） */
  preferred_material_ids?: string[];
  /** 素材匹配策略 */
  slice_match_strategy?: SliceMatchStrategy;
}

export interface CreateCreationResponse {
  creation_id: string;
  task_id: string;
  product_id: string;
  script_id: string;
  status: CreationStatus;
  current_stage: CreationStage;
  progress: number;
}

export interface ExportCreationRequest {
  /** 导出格式: MP4 / MOV / WEBM（默认使用创建时的原始格式） */
  export_format?: string;
  /** 目标分辨率: 1080x1920 / 1920x1080 / 720x1280（默认使用创建时的原始分辨率） */
  target_resolution?: string;
  /** 目标响度 LUFS，默认 -14（范围 -24 ~ -10） */
  loudnorm_i?: number;
  /** 最大真峰值 dBTP，默认 -1（范围 -3 ~ 0） */
  loudnorm_tp?: number;
}

export interface ExportCreationResponse {
  creation_id: string;
  task_id: string;
  video_url: string | null;
  status: string;
  current_stage: string;
  progress: number;
  /** 是否已入队新的导出任务（格式/分辨率与原始不同时） */
  export_enqueued: boolean;
}

export interface RerenderShotRequest {
  shot_index: number;
  force_refresh?: boolean;
}

export interface ReplaceSliceRequest {
  shot_index: number;
  slice_id: string;
}

export interface ReplaceSliceResponse {
  shot_render: ShotRenderSummary;
  /** replace-slice 后是否已自动入队重渲染任务 */
  rerender_enqueued: boolean;
}

export interface PatchCreationShotRequest {
  /** 分镜时长（秒），范围 1.5~5.0 */
  duration?: number;
  /** 字幕文案 */
  subtitle_text?: string;
}

export interface PatchCreationShotResponse {
  creation_id: string;
  shot_index: number;
  updated_fields: string[];
  /** 建议后续操作 */
  suggested_next_action: 'restitch' | 'none';
}

/** 音频混音控制配置 */
export interface AudioMixConfig {
  keep_original_video_audio: boolean;
  enable_tts_voiceover: boolean;
  enable_bgm: boolean;
  bgm_volume: number;
  voiceover_volume: number;
}

export const DEFAULT_AUDIO_MIX_CONFIG: AudioMixConfig = {
  keep_original_video_audio: true,
  enable_tts_voiceover: true,
  enable_bgm: true,
  bgm_volume: 0.3,
  voiceover_volume: 1.0,
};

export interface PreviewCompositionResponse {
  creation_id: string;
  task_id: string;
  status: CreationStatus;
  current_stage: CreationStage;
  preview_version: string;
  total_duration_seconds: number;
  timeline: PreviewTimelineFragment[];
  video_tracks: VideoTrackSummary[];
  audio_tracks: AudioTracksSummary;
  subtitle_track: SubtitleTrackSummary;
  canvas: CanvasParams;
  audio_mix_config: AudioMixConfig;
  updated_at: string;
}

export interface PreviewTimelineFragment {
  shot_index: number;
  start_sec: number;
  end_sec: number;
  duration: number;
  slice_id?: string;
  render_path?: string;
  cache_hash?: string;
}

export interface VideoTrackSummary {
  shot_index: number;
  slice_id?: string;
  render_path?: string;
  source: 'CACHE_HIT' | 'AI_GENERATED' | 'PLACEHOLDER';
}

export interface AudioTracksSummary {
  voiceover_track: {
    url?: string;
    duration_seconds: number;
    word_timestamps: WordTimestamp[];
  };
  bgm_track: {
    url?: string;
    style: string;
    ducking_applied: boolean;
  };
  sfx_track: {
    urls: string[];
    slices: string[];
  };
}

export interface SubtitleTrackSummary {
  url?: string;
  entries: SubtitleEntry[];
}

export interface SubtitleEntry {
  start_sec: number;
  end_sec: number;
  text: string;
  /** 字幕语种（用于 ASS 字幕头信息，如 zh-CN / en-US 等） */
  language?: string;
}

// ============================================================
// 9b. Subtitle Translation Types
// ============================================================

export interface SubtitleTranslation {
  shot_index: number;
  source_text: string;
  source_lang: string;
  target_lang: string;
  translated_text: string;
  cultural_notes?: {
    region: string;
    original?: string;
    adapted_text: string;
    reason: string;
  }[];
  created_at: string;
}

export interface ScriptTranslationsResponse {
  script_id: string;
  shots: SubtitleTranslation[];
}

export interface TranslateScriptRequest {
  target_langs?: string[];
}

export interface TranslateScriptResponse {
  task_id: string;
  translated_count: number;
}

export interface WordTimestamp {
  word: string;
  start_sec: number;
  end_sec: number;
}

export interface CanvasParams {
  width: number;
  height: number;
  aspect_ratio: AspectRatio;
  safe_zone: [number, number, number, number];
}

// ============================================================
// 10. Task Module Types
// ============================================================

export interface TaskSummary {
  task_id: string;
  biz_type: 'CREATION';
  biz_id: string;
  status: CreationStatus;
  current_stage: CreationStage;
  progress: number;
  message?: string;
  trace_id?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskListQuery {
  product_id?: string;
  status?: CreationStatus;
  page?: number;
  page_size?: number;
}

// ============================================================
// 11. SSE Event Types
// ============================================================

export type SSEEventType =
  | 'task.created'
  | 'task.stage.changed'
  | 'task.progress.updated'
  | 'task.completed'
  | 'task.failed'
  | 'task.canceled'
  | 'task.warning'
  | 'shot.render.completed'
  | 'shot.render.failed'
  | 'tts.completed'
  | 'tts.failed'
  | 'export.started'
  | 'export.progress'
  | 'export.completed'
  | 'export.failed'
  | 'heartbeat';

export interface SSEEventPayload {
  task_id: string;
  status: CreationStatus;
  current_stage: CreationStage;
  progress: number;
  message: string;
  trace_id: string;
  timestamp: string;
}

export interface SSEShotRenderEventPayload extends SSEEventPayload {
  shot_index: number;
  shot_render_id: string;
  render_path?: string;
  error_message?: string;
}

export interface SSERawEvent {
  event: SSEEventType;
  id: string;
  data: string;
}

// ============================================================
// 12. Internal Callback Types (Worker → Gateway)
// ============================================================

export interface StageCallbackRequest {
  task_id: string;
  creation_id: string;
  current_stage: CreationStage;
  progress: number;
  message: string;
  trace_id: string;
}

export interface ExportCallbackRequest {
  task_id: string;
  creation_id: string;
  video_url: string;
  file_size_bytes: number;
  duration_seconds: number;
  trace_id: string;
}

export interface FailureCallbackRequest {
  task_id: string;
  creation_id: string;
  error_code: string;
  error_message: string;
  current_stage: CreationStage;
  shot_index?: number;
  trace_id: string;
}

export interface ShotCompletionCallbackRequest {
  task_id: string;
  creation_id: string;
  shot_index: number;
  shot_id: string;
  video_url: string;
  render_path: string;
  source?: string;
  duration_seconds: number;
  trace_id: string;
  seedance_prompt?: string;
}

export interface SliceCallbackRequest {
  material_id: string;
  slice_id: string;
  status: MaterialSliceStatus;
  stream_url?: string;
  key_frame_url?: string;
  dense_caption?: string;
  tags?: string[];
  trace_id: string;
}

export interface EmbeddingCallbackRequest {
  slice_id: string;
  embedding_version: string;
  status: 'COMPLETED' | 'FAILED';
  trace_id: string;
}

// ============================================================
// 13. Analytics Module Types
// ============================================================

export interface AnalyticsContext {
  product_id: string;
  creation_id?: string;
  comparison_creation_id?: string;
  script_id?: string;
  trace_id?: string;
  generated_at: string;
  data_source: 'DUCKDB_PRECOMPUTED' | 'MOCK_PRECOMPUTED';
  is_mock: boolean;
  is_predicted: boolean;
}

export interface RetentionCurvePoint {
  time_sec: number;
  retention_rate: number;
  completion_rate?: number;
}

export interface ShotMarker {
  shot_index: number;
  start_sec: number;
  end_sec: number;
  label?: string;
}

export interface DropPoint {
  time_sec: number;
  drop_rate: number;
  related_shot_index?: number;
  possible_reason?: string;
}

export interface RetentionCurveResponse {
  product_id: string;
  creation_id: string;
  metric_type: 'RETENTION_RATE' | 'COMPLETION_RATE';
  curve_points: RetentionCurvePoint[];
  shot_markers: ShotMarker[];
  drop_points: DropPoint[];
  summary: {
    avg_retention_rate: number;
    final_completion_rate: number;
    primary_drop_shot_index?: number;
  };
  data_source: 'DUCKDB_PRECOMPUTED' | 'MOCK_PRECOMPUTED';
  is_mock: boolean;
  is_predicted: boolean;
  generated_at: string;
}

export interface RetentionCurveQuery {
  product_id: string;
  creation_id: string;
  metric_type?: 'RETENTION_RATE' | 'COMPLETION_RATE';
  granularity?: 'SECOND' | 'SHOT' | 'DAY';
  include_shot_markers?: boolean;
  time_range?: '7d' | '30d' | '90d';
}

export type AnalyticsMetric = 'CTR' | 'CVR' | 'COMPLETION_RATE' | 'RETENTION_RATE';
export type HeatmapDimension = 'NARRATIVE_STRATEGY' | 'VISUAL_STYLE' | 'BGM_STYLE' | 'CTA_STYLE';
export type ConfidenceTag = 'HIGH' | 'MEDIUM' | 'LOW';

export interface HeatmapCell {
  x_key: string;
  y_key: string;
  score: number;
  contribution_rate?: number;
  sample_size?: number;
  confidence_tag?: ConfidenceTag;
  insufficient_data?: boolean;
}

export interface StyleFactorHeatmapResponse {
  product_id: string;
  metric: AnalyticsMetric;
  x_dimension: HeatmapDimension;
  y_dimension: HeatmapDimension;
  x_axis_labels: string[];
  y_axis_labels: string[];
  cells: HeatmapCell[];
  top_positive_factors?: Array<{ factor: string; contribution: number }>;
  top_negative_factors?: Array<{ factor: string; contribution: number }>;
  summary: Record<string, unknown>;
  data_source: 'DUCKDB_PRECOMPUTED';
  is_mock: boolean;
  is_predicted: boolean;
  generated_at: string;
}

export interface StyleFactorHeatmapQuery {
  product_id: string;
  metric?: AnalyticsMetric;
  x_dimension?: HeatmapDimension;
  y_dimension?: HeatmapDimension;
  top_n?: number;
  time_range?: '7d' | '30d' | '90d';
}

export interface SankeyNode {
  node_id: string;
  name: string;
  dimension: 'BGM_STYLE' | 'VISUAL_STYLE' | 'RETENTION_BUCKET';
  value?: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  contribution_rate?: number;
}

export interface AudioVisualSankeyResponse {
  product_id: string;
  creation_id?: string;
  metric: string;
  nodes: SankeyNode[];
  links: SankeyLink[];
  summary: Record<string, unknown>;
  data_source: 'DUCKDB_PRECOMPUTED';
  is_mock: boolean;
  is_predicted: boolean;
  generated_at: string;
}

export interface AudioVisualSankeyQuery {
  product_id: string;
  creation_id?: string;
  metric?: string;
  source_dimension?: HeatmapDimension;
  middle_dimension?: HeatmapDimension;
  target_dimension?: string;
  time_range?: '7d' | '30d' | '90d';
}

export interface CompareVersionSummary {
  creation_id: string;
  label: string;
  style_vibe?: string;
  hook_strategy?: string;
  predicted_completion_rate?: number;
  predicted_ctr?: number;
  predicted_cvr?: number;
  shots?: Array<{ shot_index: number; duration_sec: number }>;
}

export interface CompareMetricItem {
  metric_name: string;
  value_a: number;
  value_b: number;
  delta: number;
  direction: 'A_BETTER' | 'B_BETTER' | 'TIE';
}

export interface FactorDiffItem {
  factor: string;
  version_a: string;
  version_b: string;
  impact_summary: string;
}

export interface AbCompareReportResponse {
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
}

export interface AbCompareQuery {
  product_id: string;
  creation_id_a: string;
  creation_id_b: string;
  metric_set?: string;
}

export type TriggerSource = 'RETENTION_DROP' | 'AB_COMPARE' | 'MANUAL';
export type SelfHealIssueType = 'HOOK_WEAK' | 'VOICEOVER_TOO_LONG' | 'STYLE_MISMATCH' | 'CTA_WEAK';
export type SelfHealStrategy = 'REWRITE_ONLY' | 'RERENDER_SHOT' | 'REGENERATE_VARIANT';
export type SelfHealStatus = 'SUGGESTED' | 'QUEUED' | 'PROCESSING' | 'FINISHED';

export interface SelfHealRequest {
  product_id: string;
  creation_id: string;
  trigger_source: TriggerSource;
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
  affected_shots: Array<{
    shot_index: number;
    action: string;
    reason: string;
  }>;
  suggestion_summary: string;
  status: SelfHealStatus;
  dry_run: boolean;
  data_source?: string;
  is_mock?: boolean;
  is_predicted?: boolean;
}

// ============================================================
// 14. Health Check Types
// ============================================================

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  services: {
    postgres: 'ok' | 'error';
    redis: 'ok' | 'error';
    qdrant: 'ok' | 'error';
    minio: 'ok' | 'error';
  };
  analytics: {
    duckdb: 'enabled' | 'disabled' | 'error';
    mock_mode: boolean;
  };
  metrics: {
    gpu_memory_used_mb?: number;
    gpu_memory_total_mb?: number;
    active_tasks: number;
    queue_length: number;
  };
}

// ============================================================
// 14.1 Resource Stats Types
// ============================================================

export interface ResourceStatsResponse {
  gpu_memory_usage: {
    used_mb: number | null;
    total_mb: number | null;
    available: boolean;
  };
  cpu_usage: {
    user_us: number;
    system_us: number;
  };
  process_memory: {
    heap_used_mb: number;
    rss_mb: number;
  };
  queue_backlog: {
    gpu_slicing_waiting: number;
    gpu_slicing_active: number;
    creation_waiting: number;
    creation_active: number;
  };
  redis_stats: {
    connected_clients: number | null;
    blocked_clients: number | null;
    used_memory_mb: number | null;
  };
  task_success_rate: number | null;
  avg_generation_duration_seconds: number | null;
  cache_hit_rate: number | null;
}

// ============================================================
// 14.2 Performance Prediction — 投放效果预测（冷启动加速）
// ============================================================

export interface ImprovementSuggestion {
  shot_index: number;
  shot_order?: string;
  suggestion: string;
  expected_boost: number;
  category: 'HOOK' | 'VOICEOVER' | 'VISUAL_STYLE' | 'CTA' | 'JITTER' | 'PACING' | 'OPENING_WEAK' | 'MID_SAG' | 'TEXT_DENSITY' | 'EMOTIONAL_ARC' | 'BGM_MISMATCH' | 'TIMING_OPTIMIZATION';
}

export interface PerformancePrediction {
  script_id: string;
  predicted_ctr: number;
  predicted_cvr: number;
  predicted_retention: number;
  predicted_completion?: number;
  confidence: number;
  data_quality: 'HIGH' | 'MEDIUM' | 'LOW';
  data_source: 'LLM_DEEP_ANALYSIS' | 'DUCKDB_PRECOMPUTED' | 'VIRAL_DNA_ESTIMATE' | 'HEURISTIC_FALLBACK';
  risk_factors: string[];
  improvement_suggestions: ImprovementSuggestion[];
  llm_analysis_summary?: string;
  predicted_at: string;
}
// ============================================================
// 18. 评论情感分析与二次创作
// ============================================================

export interface CommentAnalysisResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  key_topics: string[];
  pain_points: string[];
  feature_requests: string[];
  purchasing_intent: number;
}

export interface ContentOptimization {
  trigger: 'negative_sentiment' | 'pain_point' | 'feature_request';
  current_shot_index: number;
  suggestion: string;
  auto_apply: boolean;
}

export interface FetchCommentsRequest {
  product_id: string;
  video_url: string;
  mode?: 'mock' | 'csv_import' | 'tiktok_api';
  max_count?: number;
}

export interface FetchCommentsResponse {
  comment_count: number;
  new_count: number;
  skipped_count: number;
}

export interface AnalyzeCommentsRequest {
  product_id: string;
  comment_ids?: string[];
  max_count?: number;
}

export interface BatchAnalyzeResponse {
  analyzed_count: number;
  failed_count: number;
  summary: CommentSentimentSummary;
}

export interface CommentSentimentSummary {
  total: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  positive_ratio: number;
  negative_ratio: number;
  top_pain_points: string[];
  top_feature_requests: string[];
  average_purchasing_intent: number;
}

export interface CommentResponse {
  id: string;
  product_id: string;
  platform: string;
  video_url?: string;
  author_name?: string;
  content: string;
  like_count: number;
  commented_at?: string;
  analysis?: CommentAnalysisResponse;
  created_at: string;
}

export interface CommentAnalysisResponse {
  sentiment: 'positive' | 'neutral' | 'negative';
  key_topics: string[];
  pain_points: string[];
  feature_requests: string[];
  purchasing_intent: number;
  confidence: number;
  analyzed_at: string;
}

export interface CommentListQuery {
  product_id: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  cursor?: string;
  limit?: number;
}

export interface OptimizeContentRequest {
  product_id: string;
  trigger: 'negative_sentiment' | 'pain_point' | 'feature_request';
  script_id?: string;
  auto_apply?: boolean;
  extra_instruction?: string;
}

export interface OptimizationResponse {
  optimization_id: string;
  status: string;
  suggestion: string;
  suggestion_structured?: StructuredOptimization;
  new_script_id?: string;
  effect_metrics?: OptimizationEffectMetrics;
}

export interface StructuredOptimization {
  summary: string;
  score: OptimizationScore;
  suggestions: OptimizationSuggestionItem[];
  improved_script_outline: string[];
}

export interface OptimizationScore {
  overall: number;
  clarity: number;
  engagement: number;
  conversion: number;
  trust: number;
}

export interface OptimizationSuggestionItem {
  priority: 'high' | 'medium' | 'low';
  shot_index: number;
  shot_label: string;
  issue: string;
  action: string;
  reason: string;
  expected_impact: string;
}

export interface OptimizationEffectMetrics {
  ctr_delta?: number;
  cvr_delta?: number;
  retention_delta?: number;
}

export interface OptimizationRecordResponse {
  id: string;
  product_id: string;
  trigger: string;
  suggestion: string;
  auto_apply: boolean;
  status: string;
  current_script_id?: string;
  optimized_script_id?: string;
  applied_at?: string;
  effect_metrics?: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// 14.3 Posting Time Optimization — 投放时段优化
// ============================================================

export interface PostingTimeSlot {
  day_of_week: string;
  time_range: { start: string; end: string };
  score: number;
  expected_ctr_boost: number;
  competition_level: 'low' | 'medium' | 'high';
  audience_activity: 'peak' | 'moderate' | 'low';
  reasoning: string;
}

export interface PostingAvoidSlot {
  reason: string;
  time_range: { start: string; end: string };
  severity: 'must_avoid' | 'suggest_avoid';
}

export interface PostingTimeOptimization {
  product_id: string;
  platform: string;
  content_type?: string;
  recommendations: PostingTimeSlot[];
  avoid_slots: PostingAvoidSlot[];
  baseline_ctr: number;
  expected_ctr_lift: number;
  data_source: 'INDUSTRY_HEURISTIC' | 'AI_ENRICHED' | 'HISTORICAL_DATA';
  generated_at: string;
  heatmap_data?: PostingTimeHeatmapCell[];
}

export interface PostingTimeHeatmapCell {
  day: string;
  hour: string;
  value: number;
  metric: string;
}

export interface PostingTimeOptimizationQuery {
  product_id: string;
  platform?: string;
  content_type?: string;
  force_refresh?: boolean;
}

// ============================================================
// 15. Trend Tracker — 实时趋势追踪
// ============================================================

export interface TrendItem {
  type: 'hashtag' | 'sound' | 'effect' | 'topic';
  name: string;
  url: string;
  popularity_score: number;
  growth_rate: number;
  expiration_days: number;
}

export interface TrendRecommendation {
  trend: TrendItem;
  product_match_score: number;
  adaptation_tips: string[];
  potential_reach: number;
}

export interface TrendTrackerResponse {
  snapshot_id: string;
  product_id: string;
  trends: TrendItem[];
  recommendations: TrendRecommendation[];
  data_source: 'LLM_INFERRED' | 'KOL_BACKED';
  generated_by: string;
  expires_at: string;
  created_at: string;
}

// ============================================================
// 16. Watermark Configuration — 视频水印管理系统
// ============================================================

export interface WatermarkVisibleConfig {
  content: string;
  logo_url?: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;
  font_size: number;
  include_timestamp: boolean;
  include_user_id: boolean;
}

export interface WatermarkInvisibleConfig {
  technique: 'metadata' | 'steganography';
  robustness: 'basic';
  payload: string;
}

export interface WatermarkCopyrightConfig {
  holder: string;
  license_type: string;
  attribution_required: boolean;
  copyright_year: number;
}

export interface WatermarkConfig {
  enabled: boolean;
  type: 'visible' | 'invisible' | 'both';
  visible?: WatermarkVisibleConfig;
  invisible?: WatermarkInvisibleConfig;
  copyright?: WatermarkCopyrightConfig;
}

export interface WatermarkApplyRequest {
  watermark_config: WatermarkConfig;
  force_render?: boolean;
}

export interface WatermarkApplyResponse {
  creation_id: string;
  watermark_applied: boolean;
  config: WatermarkConfig;
}

export interface WatermarkVerifyResult {
  has_visible_watermark: boolean;
  has_invisible_watermark: boolean;
  copyright_metadata?: {
    holder?: string;
    license_type?: string;
    copyright_year?: string;
  };
  video_container: string;
  checked_at: string;
}

// ============================================================
// 17. API Route Map (for type-safe client generation)
// ============================================================

export interface ApiRouteMap {
  // Product
  'GET /api/v1/products': {
    query: ProductListQuery;
    response: ApiResponse<PaginatedData<Product>>;
  };
  'GET /api/v1/products/:product_id': {
    params: { product_id: string };
    response: ApiResponse<Product>;
  };
  'POST /api/v1/products': {
    body: CreateProductRequest;
    response: ApiResponse<Product>;
  };

  // Material
  'POST /api/v1/materials/upload': {
    body: FormData;
    response: ApiResponse<MaterialUploadResponse>;
  };
  'GET /api/v1/materials': {
    query: MaterialListQuery;
    response: PaginatedResponse<Material>;
  };
  'GET /api/v1/materials/:material_id': {
    params: { material_id: string };
    response: ApiResponse<MaterialDetailResponse>;
  };
  'DELETE /api/v1/materials/:material_id': {
    params: { material_id: string };
    response: ApiResponse<null>;
  };
  'POST /api/v1/materials/search': {
    body: MaterialSearchRequest;
    response: PaginatedResponse<MaterialSlice>;
  };
  'POST /api/v1/materials/:material_id/reprocess': {
    params: { material_id: string };
    response: ApiResponse<MaterialReprocessResponse>;
  };

  // Script
  'GET /api/v1/scripts': {
    query: {
      product_id: string;
      page?: number;
      page_size?: number;
    };
    response: ApiResponse<PaginatedData<Script>>;
  };
  'POST /api/v1/scripts/generate/quick': {
    body: ScriptQuickGenerateRequest;
    response: ApiResponse<ScriptGenerateResponse>;
  };
  'POST /api/v1/scripts/generate/viral-rewrite': {
    body: ScriptViralRewriteRequest;
    response: ApiResponse<ScriptGenerateResponse>;
  };
  'POST /api/v1/scripts/generate/template': {
    body: ScriptTemplateGenerateRequest;
    response: ApiResponse<ScriptGenerateResponse>;
  };
  'POST /api/v1/scripts/generate/batch': {
    body: ScriptBatchGenerateRequest;
    response: ApiResponse<ScriptBatchGenerateResponse>;
  };
  'POST /api/v1/scripts/generate/composed': {
    body: ScriptComposedGenerateRequest;
    response: ApiResponse<ScriptGenerateResponse>;
  };
  'POST /api/v1/scripts/generate/hybrid': {
    body: ScriptHybridGenerateRequest;
    response: ApiResponse<ScriptHybridGenerateResponse>;
  };
  'GET /api/v1/scripts/:script_id': {
    params: { script_id: string };
    response: ApiResponse<Script>;
  };
  'POST /api/v1/scripts/:script_id/regenerate': {
    params: { script_id: string };
    body: RegenerateScriptRequest;
    response: ApiResponse<Script>;
  };
  'POST /api/v1/scripts/:script_id/regenerate/feedback': {
    params: { script_id: string };
    body: RegenerateFeedbackRequest;
    response: ApiResponse<Script>;
  };
  'POST /api/v1/scripts/:script_id/regenerate/restyle': {
    params: { script_id: string };
    body: RegenerateRestyleRequest;
    response: ApiResponse<Script>;
  };
  'POST /api/v1/scripts/:script_id/regenerate/factor-remix': {
    params: { script_id: string };
    body: FactorRemixRequest;
    response: ApiResponse<Script>;
  };
  'POST /api/v1/scripts/:script_id/patch/suggest': {
    params: { script_id: string };
    body: PatchSuggestRequest;
    response: ApiResponse<PatchSuggestResponse>;
  };
  'PATCH /api/v1/scripts/:script_id': {
    params: { script_id: string };
    body: JsonPatchDocument;
    response: ApiResponse<ScriptPatchResponse>;
  };
  'POST /api/v1/scripts/:script_id/validate-timing': {
    params: { script_id: string };
    body: ScriptValidateTimingRequest;
    response: ApiResponse<ScriptValidateTimingResponse>;
  };
  'POST /api/v1/scripts/:script_id/save': {
    params: { script_id: string };
    body: ScriptSaveRequest;
    response: ApiResponse<ScriptSaveResponse>;
  };
  'POST /api/v1/scripts/:script_id/compliance/review': {
    params: { script_id: string };
    body: { enable_ai_review?: boolean; product_category?: string };
    response: ApiResponse<ScriptComplianceReviewResponse>;
  };

  // Agent
  'POST /api/v1/agent/generate': {
    body: AgentGenerateRequest;
    response: ApiResponse<AgentGenerateResponse>;
  };
  'GET /api/v1/agent/status/:runId': {
    params: { runId: string };
    response: ApiResponse<AgentGenerateResponse>;
  };

  // Auto A/B
  'POST /api/v1/auto-ab/run': {
    body: AutoAbRunRequest;
    response: ApiResponse<AutoAbRunResponse>;
  };
  'GET /api/v1/auto-ab/status/:runId': {
    params: { runId: string };
    response: ApiResponse<AutoAbRunResponse>;
  };

  // Template
  'POST /api/v1/templates': {
    body: CreateTemplateRequest;
    response: ApiResponse<Template>;
  };
  'GET /api/v1/templates': {
    query: { page?: number; page_size?: number; category?: string; status?: TemplateStatus; keyword?: string; sort_by?: string; sort_order?: string };
    response: PaginatedResponse<Template>;
  };
  'GET /api/v1/templates/:template_id': {
    params: { template_id: string };
    response: ApiResponse<TemplateDetail>;
  };
  'PATCH /api/v1/templates/:template_id': {
    params: { template_id: string };
    body: UpdateTemplateRequest;
    response: ApiResponse<Template>;
  };
  'DELETE /api/v1/templates/:template_id': {
    params: { template_id: string };
    response: ApiResponse<{ template_id: string; deleted: boolean }>;
  };
  'POST /api/v1/templates/:template_id/apply': {
    params: { template_id: string };
    body: ScriptTemplateGenerateRequest;
    response: ApiResponse<ScriptGenerateResponse>;
  };
  'POST /api/v1/templates/cluster': {
    body: ClusterTemplatesRequest;
    response: ApiResponse<ClusterTemplatesResponse>;
  };

  // Factor Library
  'GET /api/v1/factors': {
    query?: { category?: FactorCategory; keyword?: string };
    response: ApiResponse<Factor[]>;
  };
  'POST /api/v1/factors': {
    body: CreateFactorRequest;
    response: ApiResponse<Factor>;
  };
  'GET /api/v1/factors/:factor_id': {
    params: { factor_id: string };
    response: ApiResponse<Factor>;
  };
  'PATCH /api/v1/factors/:factor_id': {
    params: { factor_id: string };
    body: UpdateFactorRequest;
    response: ApiResponse<Factor>;
  };
  'DELETE /api/v1/factors/:factor_id': {
    params: { factor_id: string };
    response: ApiResponse<{ factor_id: string; deleted: boolean }>;
  };
  'PUT /api/v1/templates/:template_id/factors': {
    params: { template_id: string };
    body: AssignTemplateFactorsRequest;
    response: ApiResponse<{ template_id: string; assigned: number }>;
  };
  'GET /api/v1/templates/:template_id/factors': {
    params: { template_id: string };
    response: ApiResponse<TemplateFactorAssignment[]>;
  };

  // Strategy Library
  'GET /api/v1/strategies': {
    query?: { category?: string; keyword?: string };
    response: ApiResponse<Strategy[]>;
  };
  'POST /api/v1/strategies': {
    body: CreateStrategyRequest;
    response: ApiResponse<Strategy>;
  };
  'GET /api/v1/strategies/:strategy_id': {
    params: { strategy_id: string };
    response: ApiResponse<Strategy>;
  };
  'PATCH /api/v1/strategies/:strategy_id': {
    params: { strategy_id: string };
    body: UpdateStrategyRequest;
    response: ApiResponse<Strategy>;
  };
  'DELETE /api/v1/strategies/:strategy_id': {
    params: { strategy_id: string };
    response: ApiResponse<{ strategy_id: string; deleted: boolean }>;
  };
  'PUT /api/v1/templates/:template_id/strategies': {
    params: { template_id: string };
    body: AssignTemplateStrategiesRequest;
    response: ApiResponse<{ template_id: string; assigned: number }>;
  };
  'GET /api/v1/templates/:template_id/strategies': {
    params: { template_id: string };
    response: ApiResponse<Strategy[]>;
  };

  // Constraint Library
  'GET /api/v1/constraints': {
    query?: { category?: string; rule_type?: ConstraintRuleType; keyword?: string };
    response: ApiResponse<Constraint[]>;
  };
  'POST /api/v1/constraints': {
    body: CreateConstraintRequest;
    response: ApiResponse<Constraint>;
  };
  'GET /api/v1/constraints/:constraint_id': {
    params: { constraint_id: string };
    response: ApiResponse<Constraint>;
  };
  'PATCH /api/v1/constraints/:constraint_id': {
    params: { constraint_id: string };
    body: UpdateConstraintRequest;
    response: ApiResponse<Constraint>;
  };
  'DELETE /api/v1/constraints/:constraint_id': {
    params: { constraint_id: string };
    response: ApiResponse<{ constraint_id: string; deleted: boolean }>;
  };
  'PUT /api/v1/templates/:template_id/constraints': {
    params: { template_id: string };
    body: AssignTemplateConstraintsRequest;
    response: ApiResponse<{ template_id: string; assigned: number }>;
  };
  'GET /api/v1/templates/:template_id/constraints': {
    params: { template_id: string };
    response: ApiResponse<Constraint[]>;
  };

  // Viral Video Analysis
  'POST /api/v1/viral-video-analyses': {
    body: { source_url: string; source_platform: string; product_id?: string; declared_public_source?: boolean };
    response: ApiResponse<ViralVideoAnalysisCreateResponse>;
  };
  'POST /api/v1/viral-video-analyses/from-material': {
    body: ViralVideoAnalysisFromMaterialRequest;
    response: ApiResponse<ViralVideoAnalysisCreateResponse>;
  };
  'GET /api/v1/viral-video-analyses': {
    query: ViralVideoAnalysisSearchRequest;
    response: ApiResponse<ViralVideoAnalysisSearchResponse>;
  };
  'POST /api/v1/viral-video-analyses/:analysis_id/analyze': {
    params: { analysis_id: string };
    response: ApiResponse<ViralVideoAnalysisDetail>;
  };
  'GET /api/v1/viral-video-analyses/:analysis_id': {
    params: { analysis_id: string };
    response: ApiResponse<ViralVideoAnalysisDetail>;
  };
  'GET /api/v1/viral-video-analyses/match': {
    query: { product_id: string };
    response: ApiResponse<ViralVideoAnalysisDetail>;
  };
  'POST /api/v1/viral-video-analyses/suggest-keywords': {
    body: ViralVideoAnalysisSuggestKeywordsRequest;
    response: ApiResponse<ViralVideoAnalysisSuggestKeywordsResponse>;
  };
  'GET /api/v1/viral-video-analyses/batch': {
    query: { ids: string };
    response: ApiResponse<ViralVideoAnalysisListResponse>;
  };
  'GET /api/v1/viral-video-analyses/by-product/:productId': {
    params: { productId: string };
    response: ApiResponse<ViralVideoAnalysisListResponse>;
  };

  // Viral DNA
  'POST /api/v1/viral-dna/extract': {
    body: ViralDNAExtractRequest;
    response: ApiResponse<ViralDNAExtractResponse>;
  };
  'GET /api/v1/viral-dna': {
    query: ViralDNAListQuery;
    response: ApiResponse<ViralDNA[]>;
  };
  'GET /api/v1/viral-dna/:dnaId': {
    params: { dnaId: string };
    response: ApiResponse<ViralDNA>;
  };
  'POST /api/v1/scripts/generate/from-dna': {
    body: { product_id: string; dna_id: string; style_vibe?: string; aspect_ratio?: string; language?: string; material_ids?: string[]; enable_vision_analysis?: boolean };
    response: ApiResponse<ScriptGenerateResponse>;
  };

  // Creation
  'POST /api/v1/creations': {
    body: CreateCreationRequest;
    response: ApiResponse<CreateCreationResponse>;
  };
  'GET /api/v1/creations': {
    query: {
      product_id: string;
      status?: CreationStatus;
      current_stage?: CreationStage;
      engine_mode?: EngineMode;
      export_format?: string;
      limit?: number;
      cursor?: string;
    };
    response: ApiResponse<{
      items: Creation[];
      page_info: {
        cursor: string | null;
        has_more: boolean;
        total_count: number;
      };
    }>;
  };
  'GET /api/v1/creations/:creation_id': {
    params: { creation_id: string };
    response: ApiResponse<Creation>;
  };
  'GET /api/v1/creations/:creation_id/preview': {
    params: { creation_id: string };
    response: ApiResponse<PreviewCompositionResponse>;
  };
  'POST /api/v1/creations/:creation_id/export': {
    params: { creation_id: string };
    body: ExportCreationRequest;
    response: ApiResponse<ExportCreationResponse>;
  };
  'POST /api/v1/creations/:creation_id/rerender-shot': {
    params: { creation_id: string };
    body: RerenderShotRequest;
    response: ApiResponse<ShotRenderSummary>;
  };
  'POST /api/v1/creations/:creation_id/replace-slice': {
    params: { creation_id: string };
    body: ReplaceSliceRequest;
    response: ApiResponse<ShotRenderSummary>;
  };
  'POST /api/v1/creations/:creation_id/retry': {
    params: { creation_id: string };
    response: ApiResponse<CreateCreationResponse>;
  };
  'POST /api/v1/creations/:creation_id/cancel': {
    params: { creation_id: string };
    response: ApiResponse<{ creation_id: string; status: 'CANCELED' }>;
  };

  // Tasks
  'GET /api/v1/tasks': {
    query: TaskListQuery;
    response: PaginatedResponse<TaskSummary>;
  };
  'GET /api/v1/tasks/:task_id': {
    params: { task_id: string };
    response: ApiResponse<TaskSummary>;
  };
  'GET /api/v1/tasks/:task_id/events': {
    params: { task_id: string };
    response: ReadableStream<SSERawEvent>;
  };

  // Analytics
  'GET /api/v1/analytics/retention-curve': {
    query: RetentionCurveQuery;
    response: ApiResponse<RetentionCurveResponse>;
  };
  'GET /api/v1/analytics/style-factors': {
    query: StyleFactorHeatmapQuery;
    response: ApiResponse<StyleFactorHeatmapResponse>;
  };
  'GET /api/v1/analytics/audio-visual-sankey': {
    query: AudioVisualSankeyQuery;
    response: ApiResponse<AudioVisualSankeyResponse>;
  };
  'GET /api/v1/analytics/ab-compare': {
    query: AbCompareQuery;
    response: ApiResponse<AbCompareReportResponse>;
  };
  'POST /api/v1/analytics/self-heal': {
    body: SelfHealRequest;
    response: ApiResponse<SelfHealResultResponse>;
  };

  // Health
  'GET /health': {
    response: ApiResponse<HealthCheckResponse>;
  };

  // Internal Callbacks
  'POST /api/internal/v1/tasks/:task_id/stage-callback': {
    params: { task_id: string };
    body: StageCallbackRequest;
    response: ApiResponse<null>;
  };
  'POST /api/internal/v1/tasks/:task_id/export-callback': {
    params: { task_id: string };
    body: ExportCallbackRequest;
    response: ApiResponse<null>;
  };
  'POST /api/internal/v1/tasks/:task_id/failure-callback': {
    params: { task_id: string };
    body: FailureCallbackRequest;
    response: ApiResponse<null>;
  };
  'POST /api/internal/v1/creations/shot-completion-callback': {
    body: ShotCompletionCallbackRequest;
    response: ApiResponse<null>;
  };
  'POST /api/internal/v1/materials/slice-callback': {
    body: SliceCallbackRequest;
    response: ApiResponse<null>;
  };
  'POST /api/internal/v1/materials/embedding-callback': {
    body: EmbeddingCallbackRequest;
    response: ApiResponse<null>;
  };
  'GET /api/internal/v1/stats/resources': {
    response: ApiResponse<ResourceStatsResponse>;
  };

  // Comment Sentiment Analysis & Secondary Creation
  'POST /api/v1/comments/fetch': {
    body: FetchCommentsRequest;
    response: ApiResponse<FetchCommentsResponse>;
  };
  'GET /api/v1/comments': {
    query: CommentListQuery;
    response: ApiResponse<{ comments: CommentResponse[]; cursor?: string }>;
  };
  'POST /api/v1/comments/analyze': {
    body: AnalyzeCommentsRequest;
    response: ApiResponse<BatchAnalyzeResponse>;
  };
  'GET /api/v1/comments/analysis/:productId': {
    params: { productId: string };
    response: ApiResponse<CommentSentimentSummary>;
  };
  'POST /api/v1/comments/optimize': {
    body: OptimizeContentRequest;
    response: ApiResponse<OptimizationResponse>;
  };
  'GET /api/v1/comments/optimizations': {
    query: { product_id: string };
    response: ApiResponse<{ optimizations: OptimizationRecordResponse[] }>;
  };
  'POST /api/v1/comments/optimizations/:id/apply': {
    params: { id: string };
    response: ApiResponse<OptimizationRecordResponse>;
  };
  'POST /api/v1/comments/optimizations/:id/rollback': {
    params: { id: string };
    response: ApiResponse<OptimizationRecordResponse>;
  };

  // TrendTracker
  'GET /api/v1/trend-tracker': {
    query: { product_id: string };
    response: ApiResponse<TrendTrackerResponse>;
  };
  'POST /api/v1/trend-tracker/refresh': {
    body: { product_id: string };
    response: ApiResponse<TrendTrackerResponse>;
  };

  // Watermark
  'POST /api/v1/creations/:creation_id/watermark': {
    params: { creation_id: string };
    body: WatermarkApplyRequest;
    response: ApiResponse<WatermarkApplyResponse>;
  };
  'DELETE /api/v1/creations/:creation_id/watermark': {
    params: { creation_id: string };
    response: ApiResponse<{ success: boolean }>;
  };
  'POST /api/v1/watermark/verify': {
    body: { video_url: string };
    response: ApiResponse<WatermarkVerifyResult>;
  };

  // Subtitle Translation
  'POST /api/v1/scripts/:scriptId/translations': {
    params: { scriptId: string };
    body?: TranslateScriptRequest;
    response: ApiResponse<TranslateScriptResponse>;
  };
  'GET /api/v1/scripts/:scriptId/translations': {
    params: { scriptId: string };
    response: ApiResponse<ScriptTranslationsResponse>;
  };
  'DELETE /api/v1/scripts/:scriptId/translations': {
    params: { scriptId: string };
    response: ApiResponse<{ deleted_count: number }>;
  };
  'GET /api/v1/scripts/:scriptId/subtitles/:targetLang.srt': {
    params: { scriptId: string; targetLang: string };
    response: string;
  };
  'GET /api/v1/scripts/:scriptId/subtitles/:targetLang.vtt': {
    params: { scriptId: string; targetLang: string };
    response: string;
  };
  'GET /api/v1/scripts/:scriptId/subtitles/:targetLang.ass': {
    params: { scriptId: string; targetLang: string };
    response: string;
  };
}
