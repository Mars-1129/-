/**
 * BGM Music Service
 *
 * 背景音乐服务：为电商视频选择合适的背景音乐
 *
 * 功能：
 * - 内置电商风格音乐库
 * - 根据 bgm_policy 和 styleVibe 自动选择音乐
 * - 支持音量避让（ducking）
 */

import { existsSync } from 'node:fs';

export interface BgmTrack {
  id: string;
  name: string;
  /** 本地文件路径或 URL */
  url: string;
  /** 音乐风格标签 */
  tags: string[];
  /** BPM（每分钟节拍数） */
  bpm: number;
  /** 适合的视频时长范围（秒） */
  durationRange: [number, number];
  /** 情绪：energetic | calm | dramatic | playful | inspirational */
  mood: 'energetic' | 'calm' | 'dramatic' | 'playful' | 'inspirational';
  /** 商业授权可用 */
  commercialLicense: boolean;
}

export interface BgmSelectOptions {
  /** BGM 策略 */
  policy: 'auto' | 'upbeat' | 'calm' | 'dramatic' | 'none';
  /** 风格氛围（来自脚本） */
  styleVibe?: string;
  /** 视频时长（秒） */
  videoDuration?: number;
}

// 内置电商风格音乐库
// BGM_ASSET_BASE_URL: 本地文件目录或远程 URL
// 优先级：1. BGM_ASSET_BASE_URL 环境变量（绝对路径优先）
//        2. assets/bgm/（相对于项目根目录）
//        3. 内置生成器（FFmpeg 生成正弦波）

import { resolve as resolvePath, join as joinPath } from 'node:path';

// 获取项目根目录（对于 monorepo，找到顶层 pnpm-workspace.yaml 所在目录）
const getProjectRoot = (): string => {
  let dir = process.cwd();
  const maxDepth = 10; // 允许更多层级向上查找
  for (let i = 0; i < maxDepth; i++) {
    // 优先查找 monorepo 配置
    if (existsSync(resolvePath(dir, 'pnpm-workspace.yaml')) ||
        existsSync(resolvePath(dir, 'lerna.json')) ||
        existsSync(resolvePath(dir, 'rush.json'))) {
      return dir;
    }
    const parent = resolvePath(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
};

const resolveBgmBase = (): string => {
  if (process.env.ASSETS_BGM_DIR && existsSync(process.env.ASSETS_BGM_DIR)) {
    return process.env.ASSETS_BGM_DIR;
  }

  const envBase = process.env.BGM_ASSET_BASE_URL;
  if (envBase) {
    if (envBase.startsWith('builtin://') || envBase.startsWith('http://') || envBase.startsWith('https://')) {
      return envBase;
    }
    if (resolvePath(envBase) === envBase) {
      return envBase;
    }
    return resolvePath(getProjectRoot(), envBase);
  }

  const workspaceBgm = resolvePath(getProjectRoot(), 'assets', 'bgm');
  if (existsSync(workspaceBgm)) {
    return workspaceBgm;
  }

  return resolvePath(getProjectRoot(), 'assets', 'bgm');
};

const BGM_BASE_DIR = resolveBgmBase();

// 如果路径是相对路径且不以 protocol 开头，转换为绝对路径
const isBuiltinOrProtocol = (path: string) =>
  path.startsWith('builtin://') || path.startsWith('http://') || path.startsWith('https://');

const bgmUrl = (name: string): string => {
  if (BGM_BASE_DIR === 'builtin://' || isBuiltinOrProtocol(BGM_BASE_DIR)) {
    return `builtin://bgm/${name}`;
  }
  // 本地文件路径 - 组合 base + filename
  return joinPath(BGM_BASE_DIR, name);
};

const BGM_LIBRARY: BgmTrack[] = [
  {
    id: 'bgm-energetic-upbeat-01',
    name: '活力节奏',
    url: bgmUrl('energetic-upbeat-01.mp3'),
    tags: ['energetic', 'upbeat', 'positive', 'youth', 'trending'],
    bpm: 120,
    durationRange: [10, 30],
    mood: 'energetic',
    commercialLicense: true,
  },
  {
    id: 'bgm-energetic-upbeat-02',
    name: '动感节拍',
    url: bgmUrl('energetic-upbeat-02.mp3'),
    tags: ['energetic', 'beat', 'modern', 'tech', 'urban'],
    bpm: 128,
    durationRange: [10, 30],
    mood: 'energetic',
    commercialLicense: true,
  },
  {
    id: 'bgm-calm-relax-01',
    name: '舒缓放松',
    url: bgmUrl('calm-relax-01.mp3'),
    tags: ['calm', 'relax', 'soft', 'wellness', 'spa'],
    bpm: 72,
    durationRange: [10, 60],
    mood: 'calm',
    commercialLicense: true,
  },
  {
    id: 'bgm-calm-relax-02',
    name: '轻柔旋律',
    url: bgmUrl('calm-relax-02.mp3'),
    tags: ['calm', 'melody', 'gentle', 'nature', 'peaceful'],
    bpm: 80,
    durationRange: [10, 60],
    mood: 'calm',
    commercialLicense: true,
  },
  {
    id: 'bgm-dramatic-impact-01',
    name: '戏剧冲击',
    url: bgmUrl('dramatic-impact-01.mp3'),
    tags: ['dramatic', 'impact', 'tension', 'reveal', 'hook'],
    bpm: 100,
    durationRange: [10, 30],
    mood: 'dramatic',
    commercialLicense: true,
  },
  {
    id: 'bgm-playful-cute-01',
    name: '俏皮可爱',
    url: bgmUrl('playful-cute-01.mp3'),
    tags: ['playful', 'cute', 'fun', 'positive', 'youth'],
    bpm: 110,
    durationRange: [10, 30],
    mood: 'playful',
    commercialLicense: true,
  },
  {
    id: 'bgm-inspirational-uplift-01',
    name: '励志激励',
    url: bgmUrl('inspirational-uplift-01.mp3'),
    tags: ['inspirational', 'uplifting', 'positive', 'success', 'motivation'],
    bpm: 115,
    durationRange: [10, 30],
    mood: 'inspirational',
    commercialLicense: true,
  },
  {
    id: 'bgm-fashion-trend-01',
    name: '时尚潮流',
    url: bgmUrl('fashion-trend-01.mp3'),
    tags: ['fashion', 'trend', 'modern', 'stylish', 'urban'],
    bpm: 124,
    durationRange: [10, 30],
    mood: 'energetic',
    commercialLicense: true,
  },
  {
    id: 'bgm-beauty-elegant-01',
    name: '美妆优雅',
    url: bgmUrl('beauty-elegant-01.mp3'),
    tags: ['beauty', 'elegant', 'sophisticated', 'luxury', 'feminine'],
    bpm: 85,
    durationRange: [10, 30],
    mood: 'calm',
    commercialLicense: true,
  },
  {
    id: 'bgm-beauty-elegant-02',
    name: '美妆精致',
    url: bgmUrl('beauty-elegant-02.mp3'),
    tags: ['beauty', 'elegant', 'clean', 'minimal', 'premium'],
    bpm: 90,
    durationRange: [10, 30],
    mood: 'calm',
    commercialLicense: true,
  },
];

export interface BgmSelectResult {
  success: boolean;
  track?: BgmTrack;
  /** 音乐 URL */
  url?: string;
  /** 原始 BGM 策略 */
  policy: string;
  /** 匹配理由 */
  reason?: string;
  error?: string;
}

export class BgmService {
  private library: BgmTrack[];
  private fallbackUrl: string;

  constructor() {
    this.library = BGM_LIBRARY;
    this.fallbackUrl = process.env.BGM_FALLBACK_URL || 'builtin://bgm/energetic-upbeat-01.mp3';

    console.log(`[BgmService] Initialized with ${this.library.length} tracks`);
  }

  /**
   * 选择背景音乐
   *
   * @param options 选择选项
   * @returns 选择结果
   */
  select(options: BgmSelectOptions): BgmSelectResult {
    const { policy, styleVibe, videoDuration } = options;

    // 如果策略是 none，返回空
    if (policy === 'none') {
      return {
        success: true,
        policy,
        reason: 'BGM disabled by policy',
      };
    }

    // 根据 styleVibe 推断 mood
    const inferredMood = this.inferMoodFromStyleVibe(styleVibe || '');

    // 根据 policy 和 inferredMood 选择音乐
    let targetMood: BgmTrack['mood'];

    switch (policy) {
      case 'upbeat':
        targetMood = 'energetic';
        break;
      case 'calm':
        targetMood = 'calm';
        break;
      case 'dramatic':
        targetMood = 'dramatic';
        break;
      case 'auto':
      default:
        targetMood = inferredMood || this.getDefaultMood();
    }

    // 从库中选择匹配的音乐
    const candidates = this.library.filter((track) => {
      // 匹配 mood
      if (track.mood !== targetMood) return false;

      // 匹配时长（如果指定了）
      if (videoDuration !== undefined) {
        const [min, max] = track.durationRange;
        if (videoDuration < min - 5 || videoDuration > max + 5) return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      // 没有完全匹配的，返回默认
      const defaultTrack = this.getDefaultTrack();
      return {
        success: true,
        track: defaultTrack,
        url: defaultTrack.url,
        policy,
        reason: `No exact match for mood=${targetMood}, using default`,
      };
    }

    // 随机选择一首匹配的音乐
    const selectedTrack = candidates[Math.floor(Math.random() * candidates.length)];

    return {
      success: true,
      track: selectedTrack,
      url: selectedTrack.url,
      policy,
      reason: `Matched by mood=${targetMood}, track=${selectedTrack.name}`,
    };
  }

  /**
   * 检查 BGM 文件是否存在且可读
   */
  hasLocalBgmFile(url: string): boolean {
    if (!url || isBuiltinOrProtocol(url)) {
      return false;
    }
    return existsSync(url);
  }

  /**
   * 获取所有可用的本地 BGM 文件
   */
  getAvailableLocalBgmFiles(): string[] {
    return this.library
      .map((track) => track.url)
      .filter((url) => !isBuiltinOrProtocol(url) && existsSync(url));
  }

  /**
   * 根据 styleVibe 推断音乐情绪
   */
  private inferMoodFromStyleVibe(styleVibe: string): BgmTrack['mood'] | null {
    const vibe = styleVibe.toLowerCase();

    // 活力、动感、节奏
    if (vibe.includes('活力') || vibe.includes('动感') || vibe.includes('节奏') ||
        vibe.includes('energetic') || vibe.includes('upbeat')) {
      return 'energetic';
    }

    // 舒缓、平静、放松
    if (vibe.includes('舒缓') || vibe.includes('平静') || vibe.includes('放松') ||
        vibe.includes('calm') || vibe.includes('relax')) {
      return 'calm';
    }

    // 戏剧性、悬念、冲击
    if (vibe.includes('戏剧') || vibe.includes('悬念') || vibe.includes('冲击') ||
        vibe.includes('dramatic')) {
      return 'dramatic';
    }

    // 俏皮、可爱、趣味
    if (vibe.includes('俏皮') || vibe.includes('可爱') || vibe.includes('趣味') ||
        vibe.includes('playful')) {
      return 'playful';
    }

    // 励志、成功、积极
    if (vibe.includes('励志') || vibe.includes('成功') || vibe.includes('积极') ||
        vibe.includes('inspirational')) {
      return 'inspirational';
    }

    // 时尚、美妆、优雅
    if (vibe.includes('时尚') || vibe.includes('美妆') || vibe.includes('优雅') ||
        vibe.includes('elegant') || vibe.includes('beauty')) {
      return 'calm';
    }

    return null;
  }

  /**
   * 获取默认情绪
   */
  private getDefaultMood(): BgmTrack['mood'] {
    return 'energetic';
  }

  /**
   * 获取默认音乐
   */
  private getDefaultTrack(): BgmTrack {
    return this.library.find((t) => t.id === 'bgm-energetic-upbeat-01') || this.library[0];
  }

  /**
   * 获取所有可用音乐
   */
  getLibrary(): BgmTrack[] {
    return [...this.library];
  }

  /**
   * 根据标签搜索音乐
   */
  searchByTags(tags: string[]): BgmTrack[] {
    return this.library.filter((track) => {
      return tags.some((tag) => track.tags.includes(tag.toLowerCase()));
    });
  }

}

// Singleton instance
let bgmServiceInstance: BgmService | null = null;

export function getBgmService(): BgmService {
  if (!bgmServiceInstance) {
    bgmServiceInstance = new BgmService();
  }
  return bgmServiceInstance;
}