// =============================================================================
// TikStream AI — Analytics Self-Heal Request DTO
// =============================================================================

import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ANALYTICS_CONSTANTS } from '../analytics.constants';

export class AnalyticsSelfHealRequestDto {
  @ApiProperty({
    description: '商品ID (UUID)',
    example: '00000000-0000-0000-0000-000000000001',
    required: true,
  })
  @IsString({ message: 'product_id 必须是字符串' })
  product_id!: string;

  @ApiProperty({
    description: '创作任务ID (UUID)',
    example: 'dc52d4ff-0000-4000-a000-000000000001',
    required: true,
  })
  @IsString({ message: 'creation_id 必须是字符串' })
  creation_id!: string;

  @ApiProperty({
    description: '触发来源',
    enum: ANALYTICS_CONSTANTS.SELF_HEAL_TRIGGER_SOURCES,
    example: 'RETENTION_DROP',
    required: true,
  })
  @IsString({ message: 'trigger_source 必须是字符串' })
  @IsIn(ANALYTICS_CONSTANTS.SELF_HEAL_TRIGGER_SOURCES as readonly string[] as string[], {
    message: `trigger_source 取值必须为 ${ANALYTICS_CONSTANTS.SELF_HEAL_TRIGGER_SOURCES.join(' / ')}`,
  })
  trigger_source!: 'RETENTION_DROP' | 'AB_COMPARE' | 'MANUAL';

  @ApiPropertyOptional({
    description: '目标分镜序号列表（MANUAL 触发时必须指定）',
    example: [1, 3],
    type: [Number],
  })
  @IsOptional()
  @IsArray({ message: 'target_shot_indexes 必须是数组' })
  @ArrayMinSize(1, { message: 'target_shot_indexes 至少指定一个分镜' })
  @ArrayUnique({ message: 'target_shot_indexes 不可包含重复值' })
  @IsInt({ each: true, message: 'target_shot_indexes 必须为整数数组' })
  @Min(1, { each: true, message: 'target_shot_indexes 必须大于等于 1' })
  target_shot_indexes?: number[];

  @ApiProperty({
    description: '问题类型',
    enum: ANALYTICS_CONSTANTS.SELF_HEAL_ISSUE_TYPES,
    example: 'HOOK_WEAK',
    required: true,
  })
  @IsString({ message: 'issue_type 必须是字符串' })
  @IsIn(ANALYTICS_CONSTANTS.SELF_HEAL_ISSUE_TYPES as unknown as string[], {
    message: `issue_type 取值必须为 ${(ANALYTICS_CONSTANTS.SELF_HEAL_ISSUE_TYPES as readonly string[]).join(' / ')}`,
  })
  issue_type!: 'HOOK_WEAK' | 'VOICEOVER_TOO_LONG' | 'STYLE_MISMATCH' | 'CTA_WEAK';

  @ApiProperty({
    description: '自愈策略',
    enum: ANALYTICS_CONSTANTS.SELF_HEAL_STRATEGIES,
    example: 'REWRITE_ONLY',
    required: true,
  })
  @IsString({ message: 'strategy 必须是字符串' })
  @IsIn(ANALYTICS_CONSTANTS.SELF_HEAL_STRATEGIES as unknown as string[], {
    message: `strategy 取值必须为 ${(ANALYTICS_CONSTANTS.SELF_HEAL_STRATEGIES as readonly string[]).join(' / ')}`,
  })
  strategy!: 'REWRITE_ONLY' | 'RERENDER_SHOT' | 'REGENERATE_VARIANT';

  @ApiPropertyOptional({
    description: '是否仅返回建议而不执行（默认 false，即正式执行）',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'dry_run 必须是布尔值' })
  dry_run?: boolean;

  @ApiPropertyOptional({
    description: '人工补充说明',
    example: '用户手动触发，关注开场钩子',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'remark 必须是字符串' })
  @MaxLength(500, { message: 'remark 长度不能超过 500 字符' })
  remark?: string;
}