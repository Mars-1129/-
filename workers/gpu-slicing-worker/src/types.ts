export type SliceStatus = 'PENDING' | 'CAPTIONING' | 'EMBEDDING' | 'COMPLETED' | 'FAILED';

export type MaterialStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface SliceSegment {
  start_sec: number;
  end_sec: number;
  duration: number;
}

export interface SceneBoundary {
  timestamp_sec: number;
  confidence: number;
  mafd?: number; // FFmpeg scdet motion-adjusted frame difference metric
}

export interface DecordOutput {
  success: boolean;
  predictions: SceneBoundary[];
  error?: string;
  video_duration: number;
  frame_count: number;
  fps?: number;
  boundary_count?: number;
  elapsed_sec?: number;
  detector?: string;
}

export interface SliceJobPayload {
  materialId: string;
  skipQdrant: boolean;
  enqueuedAt: string;
}

export interface SliceJobProgress {
  stage: string;
  completed: number;
  total: number;
}

export interface GatewayMaterialResponse {
  material_id: string;
  product_id: string;
  file_name: string;
  duration_seconds: number;
  origin_url: string;
  type: string;
  slices: GatewaySliceRecord[];
  product: GatewayProductInfo;
}

export interface GatewaySliceRecord {
  id: string;
  slice_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  status: string;
}

export interface GatewayProductInfo {
  id: string;
  title: string;
  category: string;
  selling_points: string[];
}

export interface SliceCallbackPayload {
  material_id: string;
  slice_id: string;
  status: SliceStatus;
  stream_url?: string;
  key_frame_url?: string;
  dense_caption?: string;
  tags?: string[];
  start_time?: number;
  end_time?: number;
  duration?: number;
  sfx_url?: string;
  crop_region?: { x: number; y: number; width: number; height: number };
  trace_id: string;
}

export interface MaterialFailureCallbackPayload {
  material_id: string;
  status: MaterialStatus;
  error_message: string;
  trace_id: string;
}

export interface CaptionResult {
  dense_caption: string;
  tags: string[];
}

export interface CaptionPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export interface WorkerHealth {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  worker: 'gpu-slicing-worker';
  dependencies: HealthDependencies;
  queues: {
    gpu_slicing_waiting: number;
    gpu_slicing_active: number;
  };
  gpu: GpuStatus;
}

export interface HealthDependencies {
  redis: HealthStatus;
  bullmq: HealthStatus;
  python: HealthStatus;
  scene_detector: HealthStatus;
  ffmpeg: HealthStatus;
  ffprobe: HealthStatus;
}

export interface GpuStatus {
  available: boolean;
  vram_used_mb?: number;
  vram_total_mb?: number;
  torch_cuda_available?: boolean;
}

export type HealthStatus = 'ok' | 'error' | 'unknown';
