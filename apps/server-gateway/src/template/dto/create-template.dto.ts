// =============================================================================
// TikStream AI — Create Template DTO
// =============================================================================

import { IsString, IsObject, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TEMPLATE_CONSTANTS } from '../template.constants';

export class CreateTemplateDto {
  @ApiPropertyOptional({
    description: '关联商品ID',
    example: '00000000-0000-0000-0000-000000000100',
  })
  @IsOptional()
  @IsString()
  product_id?: string;

  @ApiProperty({
    description: '模板名称',
    example: '快节奏产品测评模板',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({
    description: '模板分类',
    example: 'promo',
    enum: TEMPLATE_CONSTANTS.ALLOWED_CATEGORIES,
    required: true,
  })
  @IsNotEmpty()
  @IsEnum(TEMPLATE_CONSTANTS.ALLOWED_CATEGORIES)
  category!: string;

  @ApiProperty({
    description: '策略摘要 (高转化剧作模板的叙事策略文字描述)',
    example: '前3秒用强烈视觉对比吸引注意力，中间段落展示产品核心卖点与实际使用效果，结尾用社交证明+CTA收尾。',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  strategy_summary!: string;

  @ApiProperty({
    description: '策略因子配置 (至少含一个已知因子键)',
    example: {
      optimal_shot_count: 5,
      optimal_total_duration: 13.5,
      camera_patterns: ['Dolly_In_Fast', 'Pan_Left'],
      transition_preference: 'Dissolve',
      bgm_style: 'upbeat-electronic',
      caption_density: 'high',
    },
    required: true,
  })
  @IsNotEmpty()
  @IsObject()
  factor_json!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '模板结构定义 (可选 JSON Schema)',
    example: {
      required_fields: ['visual_description', 'voiceover_text'],
      optional_fields: ['render_prompt'],
    },
  })
  @IsOptional()
  @IsObject()
  schema_json?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '模板状态',
    enum: TEMPLATE_CONSTANTS.TEMPLATE_STATUSES,
    default: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(TEMPLATE_CONSTANTS.TEMPLATE_STATUSES)
  status?: string;
}
