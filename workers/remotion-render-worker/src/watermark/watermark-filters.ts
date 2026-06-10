// =============================================================================
// TikStream AI — Watermark Filter Builder
// =============================================================================
// Builds FFmpeg filter chains for visible + invisible watermark embedding
// =============================================================================

import { mkdirSync, existsSync } from 'node:fs';
import { WatermarkConfig as WmConfig, WmPosition, WmFontPath } from './watermark.constants';

export interface WatermarkFilterInput {
  config: WmConfig;
  resolution: string; // "1080x1920"
  labelIn?: string;   // default "[outv]"
  labelOut?: string;  // default "[outv_wm]"
}

export interface WatermarkFilterResult {
  filters: string[];         // filter_complex filter entries
  metadataArgs: string[];    // -metadata args for copyright info
  hasVisible: boolean;
  hasInvisible: boolean;
}

/**
 * Build watermark filters for insertion into ffmpeg filter_complex.
 * 
 * Position reference (FFmpeg overlay/drawtext coordinate system):
 *   x=0,y=0 = top-left corner
 *   x=w,y=h = bottom-right corner
 */
export function buildWatermarkFilters(input: WatermarkFilterInput): WatermarkFilterResult {
  const { config, resolution } = input;
  const labelIn = input.labelIn || '[outv]';
  const labelOut = input.labelOut || '[outv_wm]';
  const filters: string[] = [];
  const metadataArgs: string[] = [];
  let hasVisible = false;
  let hasInvisible = false;
  let currentLabel = labelIn;

  if (!config || !config.enabled) {
    // No watermark: passthrough null filter to preserve label
    filters.push(`${labelIn}null${labelOut}`);
    return { filters, metadataArgs, hasVisible: false, hasInvisible: false };
  }

  const [width, height] = resolution.split('x').map(Number);
  if (!width || !height) {
    filters.push(`${labelIn}null${labelOut}`);
    return { filters, metadataArgs, hasVisible: false, hasInvisible: false };
  }

  // === Visible Watermark ===
  if ((config.type === 'visible' || config.type === 'both') && config.visible) {
    const vm = config.visible;

    // Build watermark text
    let text = vm.content;
    if (vm.include_timestamp) {
      text += ` | ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
    }
    if (vm.include_user_id) {
      // user_id will be injected from caller context
    }

    const fontsize = vm.font_size || 24;
    const opacity = Math.max(0, Math.min(1, vm.opacity ?? 0.6));
    // FFmpeg alpha uses @0.0-1.0 syntax in drawtext
    const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
    const fontcolor = `white@${opacity.toFixed(1)}`;
    
    // Safe character escaping for FFmpeg drawtext
    const escapedText = text
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'")
      .replace(/%/g, '\\%');

    const [x, y] = computeWmPosition(vm.position, width, height, fontsize);

    const textLabel = config.type === 'both' ? '[outv_text_wm]' : labelOut;

    if (vm.logo_url) {
      // Image watermark with overlay
      filters.push(
        `${currentLabel}drawtext=text='${escapedText}':fontsize=${fontsize}:fontcolor=${fontcolor}:x=${x}:y=${y}:shadowx=2:shadowy=2:shadowcolor=black@0.5${textLabel}`,
      );
      // NOTE: Image overlay requires the logo to be downloaded first.
      // This filter chain assumes the logo PNG is available as input stream.
      // For MVP, log a warning if logo_url is set.
      hasVisible = true;
      currentLabel = textLabel;
    } else {
      filters.push(
        `${currentLabel}drawtext=text='${escapedText}':fontsize=${fontsize}:fontcolor=${fontcolor}:x=${x}:y=${y}:shadowx=2:shadowy=2:shadowcolor=black@0.5${textLabel}`,
      );
      hasVisible = true;
      currentLabel = textLabel;
    }
  }

  // === Invisible Watermark (metadata) ===
  if ((config.type === 'invisible' || config.type === 'both') && config.invisible) {
    const im = config.invisible;

    if (im.technique === 'metadata') {
      metadataArgs.push('-metadata', `watermark_payload=${im.payload}`);
      metadataArgs.push('-metadata', `watermark_technique=metadata`);
      hasInvisible = true;
    }
    // steganography is a Phase 2 feature requiring DCT/DWT via Python
  }

  // === Copyright Metadata ===
  if (config.copyright) {
    const cr = config.copyright;
    metadataArgs.push('-metadata', `copyright=${cr.holder}`);
    metadataArgs.push('-metadata', `license=${cr.license_type}`);
    metadataArgs.push('-metadata', `copyright_year=${cr.copyright_year}`);
    if (cr.attribution_required) {
      metadataArgs.push('-metadata', `attribution=required`);
    }
  }

  // If labelOut was set and we added visible filters, close the chain
  if (hasVisible && config.type !== 'both') {
    // currentLabel already equals labelOut from drawtext
  } else if (hasVisible && config.type === 'both') {
    // Add passthrough to labelOut if no invisible steganography
    filters.push(`${currentLabel}null${labelOut}`);
  } else if (!hasVisible) {
    // No visible, just pass through to labelOut
    filters.push(`${labelIn}null${labelOut}`);
  }

  return { filters, metadataArgs, hasVisible, hasInvisible };
}

/**
 * Compute FFmpeg drawtext x,y coordinates based on position enum.
 * FFmpeg distinguishes x,y for text as:
 *   x: horizontal with w (video width), tw (text width)
 *   y: vertical with h (video height), th (text height)
 */
function computeWmPosition(
  position: string,
  width: number,
  height: number,
  fontsize: number,
): [string, string] {
  const margin = Math.max(Math.round(width * 0.02), 20);

  switch (position) {
    case 'top-left':
      return [`${margin}`, `${margin}`];
    case 'top-right':
      return [`w-tw-${margin}`, `${margin}`];
    case 'bottom-left':
      return [`${margin}`, `h-th-${margin}`];
    case 'bottom-right':
      return [`w-tw-${margin}`, `h-th-${margin}`];
    default:
      return [`w-tw-${margin}`, `h-th-${margin}`];
  }
}
