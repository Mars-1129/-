// =============================================================================
// TikStream AI — Script Schema Validator
// =============================================================================

import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SCRIPT_CONSTANTS } from './script.constants';
import { ErrorCode } from '@tikstream/shared-types';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ParsedShot {
  shot_index: number;
  duration: number;
  scene_description_query: string;
  visual_description: string;
  camera_movement: string;
  transition_type: string;
  voiceover_text: string;
  subtitle_text: string;
  safe_zone_bounding_box: [number, number, number, number];
}

export interface ParsedScript {
  title?: string;
  video_duration: number;
  style_vibe: string;
  shots: ParsedShot[];
}

@Injectable()
export class ScriptSchemaValidator {
  validate(parsed: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const shots = parsed.shots as Array<Record<string, unknown>>;

    if (!shots || !Array.isArray(shots)) {
      errors.push({ field: 'shots', message: '脚本必须包含分镜列表' });
      return { valid: false, errors, warnings };
    }

    if (shots.length === 0) {
      errors.push({ field: 'shots', message: '分镜列表不能为空' });
      return { valid: false, errors, warnings };
    }

    const totalDuration = shots.reduce(
      (sum, shot) => sum + Number(shot.duration || 0),
      0,
    );

    if (totalDuration > SCRIPT_CONSTANTS.MAX_VIDEO_DURATION_SECONDS) {
      errors.push({
        field: 'video_duration',
        message: `总时长 ${totalDuration.toFixed(2)}s 超过上限 ${SCRIPT_CONSTANTS.MAX_VIDEO_DURATION_SECONDS}s`,
      });
    }

    for (let idx = 0; idx < shots.length; idx++) {
      // 委托给 validateSingleShot，消除重复代码
      const singleResult = this.validateSingleShot(shots[idx], idx);
      errors.push(...singleResult.errors);
      warnings.push(...singleResult.warnings);

      // 额外的非关键校验：分镜索引偏移
      const shotIndex = Number(shots[idx].shot_index);
      if (typeof shots[idx].shot_index !== 'number' || shotIndex !== idx + 1) {
        warnings.push({
          field: `shots[${idx}].shot_index`,
          message: `分镜索引应为 ${idx + 1}，实际为 ${shotIndex}`,
        });
      }
    }

    const declaredDuration = Number(parsed.video_duration || totalDuration);
    if (Math.abs(totalDuration - declaredDuration) > 0.15) {
      warnings.push({
        field: 'video_duration',
        message: `声明时长 ${declaredDuration.toFixed(2)}s 与实际分镜总时长 ${totalDuration.toFixed(2)}s 偏差过大`,
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateSingleShot(shot: Record<string, unknown>, shotIndex: number): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const field of SCRIPT_CONSTANTS.REQUIRED_SHOT_FIELDS) {
      if (shot[field] === undefined || shot[field] === null) {
        errors.push({
          field: `shots[${shotIndex}].${field}`,
          message: `分镜 ${shotIndex + 1} 缺少必填字段: ${field}`,
        });
      }
    }

    const duration = Number(shot.duration);
    if (duration < SCRIPT_CONSTANTS.MIN_SHOT_DURATION_SECONDS) {
      errors.push({
        field: `shots[${shotIndex}].duration`,
        message: `分镜 ${shotIndex + 1} 时长 ${duration.toFixed(2)}s 低于下限 ${SCRIPT_CONSTANTS.MIN_SHOT_DURATION_SECONDS}s`,
      });
    }
    if (duration > SCRIPT_CONSTANTS.MAX_SHOT_DURATION_SECONDS) {
      errors.push({
        field: `shots[${shotIndex}].duration`,
        message: `分镜 ${shotIndex + 1} 时长 ${duration.toFixed(2)}s 超过上限 ${SCRIPT_CONSTANTS.MAX_SHOT_DURATION_SECONDS}s`,
      });
    }

    if (
      typeof shot.camera_movement === 'string' &&
      !SCRIPT_CONSTANTS.CAMERA_MOVEMENTS.includes(shot.camera_movement as any)
    ) {
      errors.push({
        field: `shots[${shotIndex}].camera_movement`,
        message: `分镜 ${shotIndex + 1} 无效的运镜方式: ${shot.camera_movement}`,
      });
    }

    if (
      typeof shot.transition_type === 'string' &&
      !SCRIPT_CONSTANTS.TRANSITION_TYPES.includes(shot.transition_type as any)
    ) {
      // 自动归一化 LLM 输出的常见转场变体
      const normalizedKey = String(shot.transition_type).replace(/[\s_]+/g, '_');
      const aliasMatch =
        SCRIPT_CONSTANTS.TRANSITION_ALIASES[shot.transition_type] ??
        SCRIPT_CONSTANTS.TRANSITION_ALIASES[normalizedKey];
      if (aliasMatch && SCRIPT_CONSTANTS.TRANSITION_TYPES.includes(aliasMatch as any)) {
        shot.transition_type = aliasMatch;
      } else {
        errors.push({
          field: `shots[${shotIndex}].transition_type`,
          message: `分镜 ${shotIndex + 1} 无效的转场方式: ${shot.transition_type}`,
        });
      }
    }

    const bbox = shot.safe_zone_bounding_box as number[] | undefined;
    if (bbox && (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((v) => typeof v !== 'number'))) {
      errors.push({
        field: `shots[${shotIndex}].safe_zone_bounding_box`,
        message: `分镜 ${shotIndex + 1} safe_zone_bounding_box 必须是 [number,number,number,number]`,
      });
    }

    if (bbox && Array.isArray(bbox)) {
      for (let i = 0; i < bbox.length; i++) {
        if (bbox[i] <= SCRIPT_CONSTANTS.SAFE_ZONE_RANGE.min || bbox[i] >= SCRIPT_CONSTANTS.SAFE_ZONE_RANGE.max) {
          errors.push({
            field: `shots[${shotIndex}].safe_zone_bounding_box[${i}]`,
            message: `分镜 ${shotIndex + 1} safe_zone_bounding_box 元素必须在 (0,1) 开区间内`,
          });
        }
      }

      const hasValidGeometry =
        bbox.length === 4
        && bbox.every((value) => typeof value === 'number')
        && bbox[0] < bbox[2]
        && bbox[1] < bbox[3];

      if (!hasValidGeometry) {
        errors.push({
          field: `shots[${shotIndex}].safe_zone_bounding_box`,
          message: `分镜 ${shotIndex + 1} safe_zone_bounding_box 必须满足 x1 < x2 且 y1 < y2`,
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
