// =============================================================================
// TikStream AI — Viral Video Report Schema
// =============================================================================
// 标准化 reportJson 结构，确保 AI 产出的报告符合可查询/可统计的约束
// =============================================================================

/** 分镜拆解单项 */
export interface ViralVideoShot {
  shot_index: number;
  duration: number;
  scene_description: string;
  camera_movement: string;
  transition_type: string;
  visual_elements: string;
  audio_elements: string;
}

/** 标准化 reportJson 结构 */
export interface ViralVideoReport {
  estimated_engagement?: string;
  selling_points?: string[];
  virality_factors?: string[];
  improvement_suggestions?: string[];
  content_maturity?: string;
  content_fingerprint?: string;
  source_material_id?: string;
  analysis_source?: string;
  thumbnail_url?: string;
}

/** 标准化 factorJson 结构 */
export interface ViralVideoFactor {
  optimal_shot_count?: number;
  optimal_total_duration?: number;
  camera_patterns?: string[];
  transition_preference?: string;
  bgm_style?: string;
  caption_density?: string;
  cta_placement?: string;
  hook_style?: string;
  narrative_tone?: string;
}

/**
 * 校验 reportJson 是否符合标准化结构
 * 返回标准化后的对象，缺失字段用降级值填充
 */
export function normalizeViralVideoReport(
  raw: Record<string, unknown> | null | undefined,
): ViralVideoReport {
  if (!raw || typeof raw !== 'object') {
    return {
      estimated_engagement: '未知',
      selling_points: [],
      virality_factors: [],
      improvement_suggestions: [],
      content_maturity: '初级',
    };
  }

  // selling_points 必须是 string[]
  let sellingPoints: string[] | undefined;
  if (Array.isArray(raw.selling_points)) {
    sellingPoints = raw.selling_points
      .filter((s): s is string => typeof s === 'string')
      .slice(0, 10);
  }

  // virality_factors 必须是 string[]
  let viralityFactors: string[] | undefined;
  if (Array.isArray(raw.virality_factors)) {
    viralityFactors = raw.virality_factors
      .filter((v): v is string => typeof v === 'string')
      .slice(0, 10);
  }

  // improvement_suggestions 必须是 string[]
  let improvementSuggestions: string[] | undefined;
  if (Array.isArray(raw.improvement_suggestions)) {
    improvementSuggestions = raw.improvement_suggestions
      .filter((s): s is string => typeof s === 'string')
      .slice(0, 10);
  }

  return {
    estimated_engagement: typeof raw.estimated_engagement === 'string'
      ? raw.estimated_engagement : undefined,
    selling_points: sellingPoints,
    virality_factors: viralityFactors,
    improvement_suggestions: improvementSuggestions,
    content_maturity: typeof raw.content_maturity === 'string'
      ? raw.content_maturity : undefined,
    content_fingerprint: typeof raw.content_fingerprint === 'string'
      ? raw.content_fingerprint : undefined,
    source_material_id: typeof raw.source_material_id === 'string'
      ? raw.source_material_id : undefined,
    analysis_source: typeof raw.analysis_source === 'string'
      ? raw.analysis_source : undefined,
    thumbnail_url: typeof raw.thumbnail_url === 'string'
      ? raw.thumbnail_url : undefined,
  };
}

/**
 * 校验 shots 数组是否符合标准化结构
 */
export function normalizeViralVideoShots(
  raw: unknown,
): ViralVideoShot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is Record<string, unknown> =>
      s && typeof s === 'object' && typeof (s as Record<string, unknown>).shot_index === 'number',
  ).map((s) => ({
    shot_index: (s.shot_index as number) ?? 0,
    duration: typeof s.duration === 'number' ? s.duration : 2.5,
    scene_description: typeof s.scene_description === 'string' ? s.scene_description : '',
    camera_movement: typeof s.camera_movement === 'string' ? s.camera_movement : 'Static',
    transition_type: typeof s.transition_type === 'string' ? s.transition_type : 'None',
    visual_elements: typeof s.visual_elements === 'string' ? s.visual_elements : '',
    audio_elements: typeof s.audio_elements === 'string' ? s.audio_elements : '',
  }));
}
