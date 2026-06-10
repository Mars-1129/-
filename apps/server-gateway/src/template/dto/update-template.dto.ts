// =============================================================================
// TikStream AI — Update Template DTO
// =============================================================================

import { IsString, IsObject, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TEMPLATE_CONSTANTS } from '../template.constants';

export class UpdateTemplateDto {
  @ApiPropertyOptional({
    description: '模板名称',
    example: '更新后的模板名称',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: '模板分类',
    example: 'unboxing',
    enum: TEMPLATE_CONSTANTS.ALLOWED_CATEGORIES,
  })
  @IsOptional()
  @IsEnum(TEMPLATE_CONSTANTS.ALLOWED_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({
    description: '策略摘要',
    example: '更新后的叙事策略描述。',
  })
  @IsOptional()
  @IsString()
  strategy_summary?: string;

  @ApiPropertyOptional({
    description: '策略因子配置',
    example: {
      optimal_shot_count: 6,
      bgm_style: 'calm-acoustic',
    },
  })
  @IsOptional()
  @IsObject()
  factor_json?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '模板结构定义',
    example: {
      required_fields: ['visual_description'],
    },
  })
  @IsOptional()
  @IsObject()
  schema_json?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: '模板状态 (ACTIVE / INACTIVE / ARCHIVED)',
    example: 'INACTIVE',
    enum: TEMPLATE_CONSTANTS.TEMPLATE_STATUSES,
  })
  @IsOptional()
  @IsEnum(TEMPLATE_CONSTANTS.TEMPLATE_STATUSES)
  status?: string;
}
