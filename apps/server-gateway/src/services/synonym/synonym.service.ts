// =============================================================================
// TikStream AI — Synonym Service
// 电商视频域同义词扩展服务
// 用途: 标签语义扩展 (需求2) + 关键词匹配扩展 (需求5)
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';

/**
 * 电商视频域同义词映射表
 * key: 用户可能搜索的词 (小写)
 * value: 与其语义等价但在系统中可能以不同标签存在的词列表
 */
const SYNONYM_MAP: Record<string, string[]> = {
  // === 镜头景别 ===
  'close-up': ['macro_shot', 'detail_shot', 'zooming_in', 'extreme_closeup', 'closing_in'],
  'macro_shot': ['close-up', 'detail_shot', 'zooming_in', 'extreme_closeup'],
  'wide_shot': ['full_shot', 'establishing_shot', 'long_shot', 'wide_angle'],
  'medium_shot': ['mid_shot', 'waist_shot', 'half_body'],
  'close_up': ['close-up', 'macro_shot', 'detail_shot', 'zooming_in', 'extreme_closeup', 'closing_in'],

  // === 运镜 ===
  'hand_held': ['shaky_cam', 'dynamic_shot', 'handheld'],
  'smooth': ['stable', 'steady', 'gimbal', 'tripod_shot'],
  'pan': ['panning', 'horizontal_pan', 'sweep'],
  'tilt': ['tilting', 'vertical_tilt', 'up_down'],
  // 反向 key — 确保 expandQuery 可命中以下高频搜索词
  'handheld': ['hand_held', 'shaky_cam', 'dynamic_shot'],
  'shaky_cam': ['hand_held', 'handheld', 'dynamic_shot'],
  'dynamic_shot': ['hand_held', 'handheld', 'shaky_cam'],
  'stable': ['smooth', 'steady', 'gimbal', 'tripod_shot'],
  'steady': ['smooth', 'stable', 'gimbal', 'tripod_shot'],
  'gimbal': ['smooth', 'stable', 'steady', 'tripod_shot'],
  'tripod_shot': ['smooth', 'stable', 'steady', 'gimbal'],
  'panning': ['pan', 'horizontal_pan', 'sweep'],
  'horizontal_pan': ['pan', 'panning', 'sweep'],
  'sweep': ['pan', 'panning', 'horizontal_pan'],
  'tilting': ['tilt', 'vertical_tilt', 'up_down'],
  'vertical_tilt': ['tilt', 'tilting', 'up_down'],
  'up_down': ['tilt', 'tilting', 'vertical_tilt'],

  // === 内容场景 ===
  'product_demo': ['how_to', 'tutorial', 'demonstration', 'usage', 'showcase'],
  'unboxing': ['first_look', 'reveal', 'opening', 'package_open', 'unpack'],
  'review': ['testimonial', 'feedback', 'user_review', 'experience'],
  'comparison': ['side_by_side', 'vs', 'before_after', 'compare'],
  // 反向 key
  'how_to': ['product_demo', 'tutorial', 'demonstration', 'usage', 'showcase'],
  'tutorial': ['product_demo', 'how_to', 'demonstration', 'usage', 'showcase'],
  'demonstration': ['product_demo', 'how_to', 'tutorial', 'usage', 'showcase'],
  'usage': ['product_demo', 'how_to', 'tutorial', 'demonstration', 'showcase'],
  'showcase': ['product_demo', 'how_to', 'tutorial', 'demonstration', 'usage'],
  'first_look': ['unboxing', 'reveal', 'opening', 'package_open', 'unpack'],
  'reveal': ['unboxing', 'first_look', 'opening', 'package_open', 'unpack'],
  'opening': ['unboxing', 'first_look', 'reveal', 'package_open', 'unpack'],
  'package_open': ['unboxing', 'first_look', 'reveal', 'opening', 'unpack'],
  'unpack': ['unboxing', 'first_look', 'reveal', 'opening', 'package_open'],
  'testimonial': ['review', 'feedback', 'user_review', 'experience'],
  'feedback': ['review', 'testimonial', 'user_review', 'experience'],
  'user_review': ['review', 'testimonial', 'feedback', 'experience'],
  'experience': ['review', 'testimonial', 'feedback', 'user_review'],
  'side_by_side': ['comparison', 'vs', 'before_after', 'compare'],
  'vs': ['comparison', 'side_by_side', 'before_after', 'compare'],
  'compare': ['comparison', 'side_by_side', 'vs', 'before_after'],

  // === 特效/速度 ===
  'slow_motion': ['slo_mo', 'slowmo', 'speed_ramp', 'slow'],
  'time_lapse': ['timelapse', 'fast_forward', 'speed_up'],
  'bokeh': ['blur_background', 'depth_of_field', 'shallow_focus', 'blurred_bg'],
  // 反向 key
  'slo_mo': ['slow_motion', 'slowmo', 'speed_ramp', 'slow'],
  'slowmo': ['slow_motion', 'slo_mo', 'speed_ramp', 'slow'],
  'speed_ramp': ['slow_motion', 'slo_mo', 'slowmo', 'slow'],
  'slow': ['slow_motion', 'slo_mo', 'slowmo', 'speed_ramp'],
  'timelapse': ['time_lapse', 'fast_forward', 'speed_up'],
  'fast_forward': ['time_lapse', 'timelapse', 'speed_up'],
  'speed_up': ['time_lapse', 'timelapse', 'fast_forward'],
  'blur_background': ['bokeh', 'depth_of_field', 'shallow_focus', 'blurred_bg'],
  'depth_of_field': ['bokeh', 'blur_background', 'shallow_focus', 'blurred_bg'],
  'shallow_focus': ['bokeh', 'blur_background', 'depth_of_field', 'blurred_bg'],
  'blurred_bg': ['bokeh', 'blur_background', 'depth_of_field', 'shallow_focus'],

  // === 电商特有 ===
  'feature_highlight': ['key_feature', 'highlight', 'spotlight', 'focus_point'],
  'call_to_action': ['cta', 'buy_now', 'shop_now', 'action_button'],
  'before_after': ['transformation', 'result', 'comparison', 'side_by_side', 'vs', 'compare'],
  // 反向 key
  'key_feature': ['feature_highlight', 'highlight', 'spotlight', 'focus_point'],
  'highlight': ['feature_highlight', 'key_feature', 'spotlight', 'focus_point'],
  'spotlight': ['feature_highlight', 'key_feature', 'highlight', 'focus_point'],
  'focus_point': ['feature_highlight', 'key_feature', 'highlight', 'spotlight'],
  'cta': ['call_to_action', 'buy_now', 'shop_now', 'action_button'],
  'buy_now': ['call_to_action', 'cta', 'shop_now', 'action_button'],
  'shop_now': ['call_to_action', 'cta', 'buy_now', 'action_button'],
  'action_button': ['call_to_action', 'cta', 'buy_now', 'shop_now'],
  'transformation': ['before_after', 'result', 'comparison'],
  'result': ['before_after', 'transformation', 'comparison'],
};

@Injectable()
export class SynonymService {
  private readonly logger = new Logger(SynonymService.name);

  /**
   * 对查询文本进行同义词扩展
   * 输入: "close-up shot of wireless hair curler"
   * 输出: [原query, "macro_shot shot of wireless hair curler", "zooming_in shot of wireless hair curler", ...]
   */
  expandQuery(query: string): string[] {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const lowerQuery = query.toLowerCase().trim();
    const expandedTerms = new Set<string>();

    // 按长词优先排序，避免短词先匹配 (如 "close_up" 优先于 "close")
    const synonymKeys = Object.keys(SYNONYM_MAP).sort((a, b) => b.length - a.length);

    let matched = false;
    for (const key of synonymKeys) {
      if (lowerQuery.includes(key)) {
        const synonyms = SYNONYM_MAP[key];
        for (const syn of synonyms) {
          const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const expanded = lowerQuery.replace(new RegExp(escapedKey, 'gi'), syn);
          expandedTerms.add(expanded);
        }
        matched = true;
      }
    }

    // 始终包含原始查询
    expandedTerms.add(lowerQuery);

    if (!matched) {
      return [query.trim()];
    }

    return [...expandedTerms];
  }

  /**
   * 对关键词数组进行同义词扩展
   * 输入: ["close-up", "hair_curler"]
   * 输出: ["close-up", "macro_shot", "detail_shot", "zooming_in", "hair_curler"]
   */
  expandKeywords(keywords: string[]): string[] {
    if (!keywords || keywords.length === 0) {
      return [];
    }

    const expanded = new Set(keywords.map((k) => k.toLowerCase()));

    for (const kw of keywords) {
      const lowerKw = kw.toLowerCase();
      if (SYNONYM_MAP[lowerKw]) {
        for (const syn of SYNONYM_MAP[lowerKw]) {
          expanded.add(syn.toLowerCase());
        }
      }
      for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
        if (synonyms.includes(lowerKw)) {
          expanded.add(key.toLowerCase());
          for (const syn of synonyms) {
            expanded.add(syn.toLowerCase());
          }
        }
      }
    }

    return [...expanded];
  }

  /**
   * 对标签数组进行同义词扩展 (用于反向匹配)
   */
  expandTags(tags: string[]): string[] {
    return this.expandKeywords(tags);
  }

  /**
   * 检查两个词是否同义
   */
  areSynonyms(a: string, b: string): boolean {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la === lb) return true;

    const synonymsA = SYNONYM_MAP[la];
    if (synonymsA?.includes(lb)) return true;

    const synonymsB = SYNONYM_MAP[lb];
    if (synonymsB?.includes(la)) return true;

    return false;
  }
}
