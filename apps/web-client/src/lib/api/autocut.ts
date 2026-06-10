import { request } from './http';

const BASE = '/api/v1/autocut';

export interface AutocutJob {
  id: string;
  materialId: string;
  materialName: string;
  status: string;
  progress: number;
  outputUrl: string;
  createdAt: string;
}

export interface TranscriptSegment {
  index: number;
  start_sec: number;
  end_sec: number;
  text: string;
  selected: boolean;
}

export interface TranscriptResponse {
  job_id: string;
  status: string;
  segments: TranscriptSegment[];
  srt_content: string;
  language: string;
  video_duration: number;
}

export const autocutApi = {
  submit: (materialId: string) =>
    request<{ job_id: string; status: string }>(`${BASE}/submit`, {
      method: 'POST',
      body: { material_id: materialId },
    }),

  listJobs: (params?: { status?: string; limit?: number }) =>
    request<{ jobs: AutocutJob[] }>(`${BASE}/jobs`, { query: params }),

  getTranscript: (jobId: string) =>
    request<TranscriptResponse>(`${BASE}/transcript/${jobId}`),

  updateSegments: (jobId: string, segments: Array<{ index: number; selected: boolean }>) =>
    request<{ updated: boolean; selected_count: number; total_count: number }>(
      `${BASE}/transcript/${jobId}`,
      { method: 'PATCH', body: { segments } },
    ),

  executeCut: (jobId: string) =>
    request<{ job_id: string; status: string }>(`${BASE}/cut/${jobId}`, { method: 'POST' }),

  getStatus: (jobId: string) =>
    request<{ id: string; status: string; stage?: string; progress: number; outputUrl?: string; error?: string }>(
      `${BASE}/status/${jobId}`,
    ),
};
