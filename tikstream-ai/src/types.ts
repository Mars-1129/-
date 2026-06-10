/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  sellingPoints: string[];
  demographics: string;
  price: string;
}

export interface Material {
  id: string;
  productId: string;
  name: string;
  type: 'video' | 'image';
  url: string; // Base64 representation or mockup url
  createdAt: string;
  duration?: number; // for video
  slices?: MaterialSlice[];
}

export interface MaterialSlice {
  id: string;
  materialId: string;
  productId: string;
  startTime: number;
  endTime: number;
  duration: number;
  denseCaption: string;
  tags: string[];
}

export interface VideoScene {
  sceneNumber: number;
  duration: number; // in seconds (e.g., 3.0)
  visualDescription: string;
  voiceoverText: string;
  subtitle: string;
  motion: string; // Zoom In, Pan Left, Close Up, etc.
  transition?: string; // Fade, Dissolve, Wipe, etc.
  materialSliceId?: string; // bound slice
  safeZoneBoundingBox?: [number, number, number, number]; // [x1, y1, x2, y2] representation
}

export interface VideoScript {
  id: string;
  productId: string;
  title: string;
  creatorStyle: 'quick' | 'remake' | 'template'; // Mode type
  totalDuration: number;
  bgmStyle: string; // e.g. energetic, atmospheric, lo-fi, cyber
  voiceGender: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  scenes: VideoScene[];
  createdAt: string;
}

export type TaskStatus =
  | 'QUEUE_ALLOCATION'
  | 'ASSET_MATCHING'
  | 'AI_VIDEO_GENERATING'
  | 'TTS_GENERATING'
  | 'FFMPEG_STITCHING'
  | 'LOUDNORM_COMPLIANCE'
  | 'FINISHED'
  | 'FAILED';

export interface CreationTask {
  id: string;
  scriptId: string;
  productId: string;
  status: TaskStatus;
  progress: number;
  videoUrl?: string;
  error?: string;
  logs: string[];
  createdAt: string;
  audioUrl?: string; // TTS result if loaded
}

export interface TemplateStyle {
  id: string;
  name: string;
  description: string;
  formula: string; // Hook - Problem - Solution - Offer etc
  examplePrompt: string;
  tags: string[];
}
