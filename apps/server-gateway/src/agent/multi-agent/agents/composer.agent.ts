// =============================================================================
// TikStream AI — Composer Agent
// 配乐 Agent：BGM 策略 → 音效配置
// tools: CreationService (bgm_policy) + 风格→BGM 映射
// =============================================================================

import { CREATION_CONSTANTS } from '../../../creation/creation.constants';

export interface ComposerAgentDeps {
  /** 可选：用于获取预设的 BGM 配置 */
  creationModule?: { CONSTANTS: typeof CREATION_CONSTANTS };
}

/**
 * BGM 风格映射表
 * 根据 style_vibe 推荐匹配的 BGM 风格
 */
const STYLE_TO_BGM_MAP: Record<string, string> = {
  '高转化 UGC': 'high_energy_modern',
  '快节奏 Vlog': 'upbeat_vlog',
  '慢节奏教程': 'calm_tutorial',
  '情感共鸣': 'emotional_piano',
  '酷炫科技': 'tech_synth',
  '开箱评测': 'review_light',
  '幽默搞笑': 'funny_bounce',
};

/**
 * 创建 Composer Agent 节点
 *
 * 职责：
 * 1. 根据 style_vibe 智能匹配 BGM 风格
 * 2. 为每个分镜配置 BGM 分段（高潮段加速、过渡段柔化）
 * 3. 输出 bgm_policy 和 audio_config
 */
export function createComposerAgent(_deps?: ComposerAgentDeps) {
  return async (state: Record<string, unknown>): Promise<Partial<Record<string, unknown>>> => {
    const startedAt = Date.now();
    const styleVibe = String(state.style_vibe || '高转化 UGC');
    const shots = (state.script_shots as Array<Record<string, unknown>>) || [];
    const shotCount = shots.length;

    // 1. BGM 风格匹配
    let bgmPolicy = '';
    for (const [key, value] of Object.entries(STYLE_TO_BGM_MAP)) {
      if (styleVibe.includes(key) || key.includes(styleVibe)) {
        bgmPolicy = value;
        break;
      }
    }
    if (!bgmPolicy) {
      bgmPolicy = 'high_energy_modern';
    }

    // 2. 分镜 BGM 分段配置
    const bgmSegments: Array<Record<string, unknown>> = [];
    for (let i = 0; i < shotCount; i++) {
      const position = shotCount === 1 ? 0.5 : i / (shotCount - 1); // 0.0 ~ 1.0; 单镜居中
      let mood: string;
      if (position < 0.2) {
        mood = 'hook_intro';       // 开场：吸引注意力
      } else if (position < 0.7) {
        mood = 'content_body';      // 主体：信息展开
      } else if (position < 0.9) {
        mood = 'climax';            // 高潮：转化引导
      } else {
        mood = 'cta_outro';         // 结尾：行动号召
      }

      bgmSegments.push({
        shot_index: i + 1,
        mood,
        tempo: mood === 'climax' ? 'fast' : mood === 'hook_intro' ? 'medium_fast' : 'medium',
        volume: mood === 'climax' ? 0.9 : 0.75,
      });
    }

    const audioConfig = {
      bgm_policy: bgmPolicy,
      segments: bgmSegments,
      fade_in_ms: 300,
      fade_out_ms: 500,
      ducking_enabled: true, // 旁白时降音
    };

    const elapsed = Date.now() - startedAt;
    const agentTrace = {
      agent: 'composer',
      action: 'BGM 配乐编排',
      reasoning: `风格 ${styleVibe} → BGM ${bgmPolicy}，${shotCount} 个分镜已分段配置`,
      duration_ms: elapsed,
      timestamp: new Date().toISOString(),
    };

    return {
      bgm_policy: bgmPolicy,
      audio_config: audioConfig,
      current_agent: 'compliance',
      agent_traces: [
        ...(state.agent_traces as Array<Record<string, unknown>> || []),
        agentTrace,
      ],
    };
  };
}
