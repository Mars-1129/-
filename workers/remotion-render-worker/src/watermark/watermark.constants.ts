// =============================================================================
// TikStream AI — Watermark Constants (Worker side)
// =============================================================================

export type WmPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface WmVisibleConfig {
  content: string;
  logo_url?: string;
  position: WmPosition;
  opacity: number;
  font_size: number;
  include_timestamp: boolean;
  include_user_id: boolean;
}

export interface WmInvisibleConfig {
  technique: 'metadata' | 'steganography';
  robustness: 'basic';
  payload: string;
}

export interface WmCopyrightConfig {
  holder: string;
  license_type: string;
  attribution_required: boolean;
  copyright_year: number;
}

export interface WatermarkConfig {
  enabled: boolean;
  type: 'visible' | 'invisible' | 'both';
  visible?: WmVisibleConfig;
  invisible?: WmInvisibleConfig;
  copyright?: WmCopyrightConfig;
}

/**
 * Font paths for drawtext filter.
 * Priority: 1) System Arial  2) DejaVu Sans  3) No fontfile (FFmpeg default)
 */
export const WmFontPath = {
  get defaultPath(): string | undefined {
    const { existsSync } = require('node:fs');
    if (existsSync('C:/Windows/Fonts/arial.ttf')) return 'C:/Windows/Fonts/arial.ttf';
    if (existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
      return '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    return undefined;
  },
};

export const WM_CONSTANTS = {
  DEFAULT_POSITION: 'bottom-right' as WmPosition,
  DEFAULT_OPACITY: 0.6,
  DEFAULT_FONT_SIZE: 24,
  MARGIN_PX: 20,
  /** Max watermark text length before truncation */
  MAX_TEXT_LENGTH: 128,
} as const;
