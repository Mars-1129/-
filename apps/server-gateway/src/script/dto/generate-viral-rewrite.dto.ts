// =============================================================================
// TikStream AI — Script Viral Rewrite Generate DTO
// =============================================================================

import { IsString, IsArray, IsOptional, IsEnum, IsNotEmpty, IsBoolean, IsUUID } from 'class-validator';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SCRIPT_CONSTANTS } from '../script.constants';

export class ScriptViralRewriteGenerateDto {
  @ApiProperty({
    description: '商品ID',
    example: '00000000-0000-0000-0000-000000000001',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  product_id!: string;

  @ApiProperty({
    description: '爆款视频分析ID（已结构化拆解的爆款视频记录）',
    example: '00000000-0000-0000-0000-000000000999',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  viral_video_id!: string;

  @ApiPropertyOptional({
    description: '剧本标题',
    example: '仿爆款 — 5分钟打造明星同款卷发',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: '语言',
    example: 'zh-CN',
    enum: ['zh-CN', 'en-US'],
    default: 'zh-CN',
  })
  @IsOptional()
  @IsEnum(['zh-CN', 'en-US'])
  language?: string;

  @ApiProperty({
    description: '风格氛围',
    example: 'clean-tech',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  style_vibe!: string;

  @ApiProperty({
    description: '画面比例',
    example: '9:16',
    enum: SCRIPT_CONSTANTS.ASPECT_RATIOS,
    required: true,
  })
  @IsNotEmpty()
  @IsEnum(SCRIPT_CONSTANTS.ASPECT_RATIOS)
  aspect_ratio!: string;

  @ApiPropertyOptional({
    description: '商品卖点列表（可选，不传则使用商品自带的卖点）',
    example: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selling_points?: string[];

  @ApiPropertyOptional({
    description: '目标受众',
    example: '北美年轻女性,25-35岁',
  })
  @IsOptional()
  @IsString()
  target_audience?: string;

  @ApiPropertyOptional({
    description: '约束条件列表',
    example: ['total_duration<=15s', 'avoid_absolute_claims'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  constraint_list?: string[];

  @ApiPropertyOptional({ description: '文案偏好示例（Winner/Loser）' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;

  @ApiPropertyOptional({
    description: '文案偏好说明',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  preference_remark?: string;

  @ApiPropertyOptional({
    description: '是否启用 AI 语义合规二审（默认 false）',
  })
  @IsOptional()
  @IsBoolean()
  enable_ai_compliance?: boolean;

  @ApiPropertyOptional({
    description: '指定素材 UUID 列表（最多5个）。LLM 将基于这些素材的视觉特征生成更精准的剧本',
    example: ['00000000-0000-0000-0000-000000000100'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  material_ids?: string[];
}
