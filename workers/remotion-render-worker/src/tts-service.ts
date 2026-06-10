/**
 * TTS (Text-to-Speech) Service
 *
 * 旁白生成服务：将分镜文案转换为语音音频
 *
 * 支持多种 TTS 提供商：
 * - Volcengine MSMS (MiniMax Speech)
 * - 本地 FFmpeg fallback（生成可播放音轨）
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function env(name: string, legacy?: string, def?: string): string {
  if (process.env[name]) return process.env[name]!;
  if (legacy && process.env[legacy]) {
    console.warn(`[ENV] ${legacy} is deprecated, use ${name}`);
    return process.env[legacy]!;
  }
  return def ?? '';
}

export interface TtsOptions {
  /** 要转换的文本 */
  text: string;
  /** 语速 (0.5 - 2.0)，默认 1.0 */
  speed?: number;
  /** 音调 (0.5 - 2.0)，默认 1.0 */
  pitch?: number;
  /** 音量 (0.0 - 1.0)，默认 1.0 */
  volume?: number;
}

export interface TtsVoice {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female';
}

export interface TtsResult {
  success: boolean;
  /** 生成的音频 URL */
  audioUrl?: string;
  /** 音频本地缓存路径 */
  localPath?: string;
  /** 音频时长（秒） */
  duration?: number;
  /** 错误信息 */
  error?: string;
  /** 请求 ID */
  requestId?: string;
}

// 预设音色
export const TTS_VOICES: Record<string, TtsVoice> = {
  'zh-CN-female-optimized': {
    id: 'zh-CN-female-optimized',
    name: '中文女声（电商优化）',
    language: 'zh-CN',
    gender: 'female',
  },
  'zh-CN-male-warm': {
    id: 'zh-CN-male-warm',
    name: '中文男声（温暖型）',
    language: 'zh-CN',
    gender: 'male',
  },
  'en-US-female': {
    id: 'en-US-female',
    name: '英文女声',
    language: 'en-US',
    gender: 'female',
  },
  'en-US-male': {
    id: 'en-US-male',
    name: '英文男声',
    language: 'en-US',
    gender: 'male',
  },
  'ja-JP-female': {
    id: 'ja-JP-female',
    name: '日本語女性',
    language: 'ja-JP',
    gender: 'female',
  },
  'ja-JP-male': {
    id: 'ja-JP-male',
    name: '日本語男性',
    language: 'ja-JP',
    gender: 'male',
  },
  'ko-KR-female': {
    id: 'ko-KR-female',
    name: '한국어 여성',
    language: 'ko-KR',
    gender: 'female',
  },
  'ko-KR-male': {
    id: 'ko-KR-male',
    name: '한국어 남성',
    language: 'ko-KR',
    gender: 'male',
  },
  'th-TH-female': {
    id: 'th-TH-female',
    name: 'ภาษาไทย หญิง',
    language: 'th-TH',
    gender: 'female',
  },
  'id-ID-female': {
    id: 'id-ID-female',
    name: 'Bahasa Indonesia Perempuan',
    language: 'id-ID',
    gender: 'female',
  },
  'es-ES-female': {
    id: 'es-ES-female',
    name: 'Español Femenino',
    language: 'es-ES',
    gender: 'female',
  },
  'es-ES-male': {
    id: 'es-ES-male',
    name: 'Español Masculino',
    language: 'es-ES',
    gender: 'male',
  },
};

// 语种 → 默认音色映射（自动选择）
export const LANGUAGE_DEFAULT_VOICE: Record<string, string> = {
  'zh-CN': 'zh-CN-female-optimized',
  'en-US': 'en-US-female',
  'ja-JP': 'ja-JP-female',
  'ko-KR': 'ko-KR-female',
  'th-TH': 'th-TH-female',
  'id-ID': 'id-ID-female',
  'es-ES': 'es-ES-female',
};

// 默认音色
const DEFAULT_VOICE = 'zh-CN-female-optimized';

// SiliconFlow CosyVoice2 音色映射：现有 voiceId → SiliconFlow 预置音色
const SILICONFLOW_VOICE_MAP: Record<string, string> = {
  'zh-CN-female-optimized': 'FunAudioLLM/CosyVoice2-0.5B:bella',
  'zh-CN-male-warm': 'FunAudioLLM/CosyVoice2-0.5B:alex',
  'en-US-female': 'FunAudioLLM/CosyVoice2-0.5B:anna',
  'en-US-male': 'FunAudioLLM/CosyVoice2-0.5B:benjamin',
  'ja-JP-female': 'FunAudioLLM/CosyVoice2-0.5B:claire',
  'ja-JP-male': 'FunAudioLLM/CosyVoice2-0.5B:charles',
  'ko-KR-female': 'FunAudioLLM/CosyVoice2-0.5B:diana',
  'ko-KR-male': 'FunAudioLLM/CosyVoice2-0.5B:david',
  'th-TH-female': 'FunAudioLLM/CosyVoice2-0.5B:claire',   // fallback: 温柔女声
  'id-ID-female': 'FunAudioLLM/CosyVoice2-0.5B:anna',     // fallback: 沉稳女声
  'es-ES-female': 'FunAudioLLM/CosyVoice2-0.5B:bella',    // fallback: 激情女声
  'es-ES-male': 'FunAudioLLM/CosyVoice2-0.5B:alex',       // fallback: 沉稳男声
};

export interface TtsConfig {
  /** API 类型: 'volcengine' | 'minimax' | 'siliconflow' | 'mock' */
  provider: 'volcengine' | 'minimax' | 'siliconflow' | 'mock';
  apiUrl?: string;
  apiKey?: string;
  appId?: string;
  /** 音频格式: 'mp3' | 'wav' | 'ogg' */
  format?: 'mp3' | 'wav' | 'ogg';
  /** 采样率 */
  sampleRate?: number;
  maxRetries: number;
  timeoutMs: number;
  retryBaseDelayMs: number;
}

const DEFAULT_CONFIG: TtsConfig = {
  provider: (process.env.TTS_PROVIDER as TtsConfig['provider']) || 'mock',
  apiUrl: env('ARK_TTS_API_URL', 'VOLC_TTS_API_URL', 'https://openspeech.bytedance.com/api/v1/tts'),
  apiKey: (process.env.TTS_PROVIDER === 'siliconflow'
    ? env('SILICONFLOW_API_KEY')
    : env('ARK_TTS_API_KEY', 'VOLC_TTS_API_KEY') || env('ARK_TTS_API_KEY', 'TTS_API_KEY') || ''),
  appId: env('ARK_TTS_APP_ID', 'VOLC_TTS_APP_ID'),
  format: 'mp3',
  sampleRate: 24000,
  maxRetries: 3,
  timeoutMs: 30_000,
  retryBaseDelayMs: 1000,
};

export class TtsService {
  private config: TtsConfig;

  constructor(config: Partial<TtsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.provider !== 'mock' && !this.config.apiKey) {
      console.warn('[TtsService] TTS API key is not set — using mock TTS');
      this.config.provider = 'mock';
    }
  }

  /**
   * 生成语音
   *
   * @param text 要转换的文本
   * @param voiceId 音色 ID
   * @param options 额外选项
   * @returns 生成结果
   */
  async synthesize(text: string, voiceId: string = DEFAULT_VOICE, options: Partial<TtsOptions> = {}): Promise<TtsResult> {
    if (this.config.provider === 'mock') {
      return this.mockSynthesize(text, voiceId, options);
    }

    try {
      if (this.config.provider === 'volcengine') {
        return await this.volcengineTts(text, voiceId, options);
      }

      if (this.config.provider === 'minimax') {
        return await this.minimaxTts(text, voiceId, options);
      }

      if (this.config.provider === 'siliconflow') {
        return await this.siliconflowTts(text, voiceId, options);
      }

      return this.mockSynthesize(text, voiceId, options);
    } catch (error) {
      console.error('[TtsService] TTS synthesis failed:', error);
      return {
        success: false,
        error: `TTS synthesis failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 火山引擎 TTS (Volcengine MSMS)
   */
  private async volcengineTts(text: string, voiceId: string, options: Partial<TtsOptions>): Promise<TtsResult> {
    const { speed = 1.0, pitch = 1.0, volume = 1.0 } = options;

    const response = await fetch(this.config.apiUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-App-Id': this.config.appId || '',
      },
      body: JSON.stringify({
        text,
        voice: voiceId,
        speed,
        pitch,
        volume,
        format: this.config.format,
        sample_rate: this.config.sampleRate,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();

    if (data.audio_url || data.data) {
      return {
        success: true,
        audioUrl: data.audio_url || data.data,
        duration: data.duration || this.estimateDuration(text),
        requestId: data.request_id,
      };
    }

    return {
      success: false,
      error: 'Invalid TTS response',
    };
  }

  /**
   * SiliconFlow (硅基流动) CosyVoice2 TTS
   *
   * 模型: FunAudioLLM/CosyVoice2-0.5B
   * 预置音色: alex/benjamin/charles/david (男), anna/bella/claire/diana (女)
   * 支持: 中英日韩 + 方言, 150ms 首包延迟
   * 注意: CosyVoice2 不支持 pitch/volume 参数；语种之外的语言会使用近似音色 fallback
   */
  private async siliconflowTts(text: string, voiceId: string, options: Partial<TtsOptions>): Promise<TtsResult> {
    const sfVoice = SILICONFLOW_VOICE_MAP[voiceId] || 'FunAudioLLM/CosyVoice2-0.5B:alex';
    const { speed = 1.0 } = options;

    const response = await fetch('https://api.siliconflow.cn/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'FunAudioLLM/CosyVoice2-0.5B',
        input: text,
        voice: sfVoice,
        response_format: this.config.format || 'mp3',
        speed: Math.min(4.0, Math.max(0.25, speed)),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: `SiliconFlow TTS HTTP ${response.status}: ${errorText}`,
      };
    }

    // TTS returns raw audio binary
    const arrayBuffer = await response.arrayBuffer();
    const outputDir = process.env.TTS_TEMP_DIR || '/tmp/tikstream-tts';
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const ext = this.config.format || 'mp3';
    const outputPath = join(outputDir, `tts_sf_${randomUUID()}.${ext}`);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outputPath, new Uint8Array(arrayBuffer));

    return {
      success: true,
      audioUrl: outputPath,
      localPath: outputPath,
      duration: this.estimateDuration(text),
    };
  }

  /**
   * MiniMax TTS
   */
  private async minimaxTts(text: string, voiceId: string, options: Partial<TtsOptions>): Promise<TtsResult> {
    const { speed = 1.0 } = options;

    const response = await fetch('https://api.minimax.io/v1/t2a_voice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'speech-01',
        text,
        voice_setting: {
          voice_id: voiceId,
          speed,
        },
        audio_setting: {
          format: 'mp3',
          sample_rate: 24000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();

    if (data.data) {
      return {
        success: true,
        audioUrl: data.data,
        duration: this.estimateDuration(text),
        requestId: data.request_id,
      };
    }

    return {
      success: false,
      error: 'Invalid TTS response',
    };
  }

  /**
   * Mock TTS - 生成本地可播放音轨
   * 用于演示环境，当没有 TTS API key 时使用
   */
  private async mockSynthesize(text: string, _voiceId: string, _options: Partial<TtsOptions>): Promise<TtsResult> {
    console.warn('[TtsService] Using local fallback TTS track (no API key configured)');

    const estimatedDuration = this.estimateDuration(text);
    const outputDir = process.env.TTS_TEMP_DIR || '/tmp/tikstream-tts';
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = join(outputDir, `tts_${randomUUID()}.mp3`);

    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=880:sample_rate=44100',
        '-t',
        String(Math.max(1, estimatedDuration)),
        '-q:a',
        '7',
        outputPath,
      ], { timeout: 20000 });

      return {
        success: true,
        audioUrl: outputPath,
        localPath: outputPath,
        duration: estimatedDuration,
      };
    } catch (error) {
      return {
        success: false,
        error: `Local fallback TTS failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 估算文本朗读时长（秒）
   */
  private estimateDuration(text: string): number {
    // 中文约 4-5 字/秒
    // 英文约 3-4 词/秒
    const chineseChars = (text.match(/[一-龥]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;

    const estimatedSeconds = chineseChars / 4.5 + englishWords / 3.5;
    return Math.max(1, Math.min(estimatedSeconds, 30)); // 限制在 1-30 秒
  }

  /**
   * 获取可用音色列表
   */
  getAvailableVoices(): TtsVoice[] {
    return Object.values(TTS_VOICES);
  }

  /**
   * 获取当前配置
   */
  getConfig(): TtsConfig {
    return { ...this.config };
  }
}

// Singleton instance
let ttsServiceInstance: TtsService | null = null;

export function getTtsService(): TtsService {
  if (!ttsServiceInstance) {
    ttsServiceInstance = new TtsService();
  }
  return ttsServiceInstance;
}