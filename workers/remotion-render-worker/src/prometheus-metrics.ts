import { collectDefaultMetrics, Counter, Histogram, Gauge, Registry } from 'prom-client';

const register = new Registry();
collectDefaultMetrics({ register, prefix: 'tikstream_render_' });

// Seedance API metrics
export const seedanceApiCallsTotal = new Counter({
  name: 'seedance_api_calls_total',
  help: 'Total Seedance API calls',
  labelNames: ['type', 'status'],
  registers: [register],
});

export const seedanceApiErrorsTotal = new Counter({
  name: 'seedance_api_errors_total',
  help: 'Total Seedance API errors',
  labelNames: ['error_type'],
  registers: [register],
});

// TTS metrics
export const ttsGenerateDurationSeconds = new Histogram({
  name: 'tts_generate_duration_seconds',
  help: 'TTS generation duration in seconds',
  labelNames: ['provider'],
  buckets: [0.5, 1, 2, 5, 10, 15, 30, 60],
  registers: [register],
});

// FFmpeg stitch metrics
export const ffmpegStitchDurationSeconds = new Histogram({
  name: 'ffmpeg_stitch_duration_seconds',
  help: 'FFmpeg stitch duration in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

// Creation job metrics
export const creationJobsTotal = new Counter({
  name: 'creation_jobs_total',
  help: 'Total creation jobs processed',
  labelNames: ['status'],
  registers: [register],
});

export const creationStageCurrent = new Gauge({
  name: 'creation_stage_current',
  help: 'Current creation stage (1=ASSET_MATCHING to 7=FINISHED)',
  labelNames: ['stage'],
  registers: [register],
});

export async function getMetrics(): Promise<string> {
  return register.metrics();
}
