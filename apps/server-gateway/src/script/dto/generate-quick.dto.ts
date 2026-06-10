// =============================================================================
// TikStream AI — Script Quick Generate DTO
// =============================================================================

import { IsString, IsArray, IsOptional, IsEnum, IsNotEmpty, IsNumber, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SCRIPT_CONSTANTS } from '../script.constants';

export class ScriptQuickGenerateDto {
  @ApiProperty({
    description: '商品ID',
    example: '00000000-0000-0000-0000-000000000001',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  product_id!: string;

  @ApiPropertyOptional({
    description: '剧本标题',
    example: '智能无线卷发棒快速成片脚本',
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
    description: '商品卖点列表',
    example: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
    required: true,
  })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  selling_points!: string[];

  @ApiPropertyOptional({
    description: '目标受众',
    example: '北美年轻女性,25-35岁',
  })
  @IsOptional()
  @IsString()
  target_audience?: string;

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
    description: '约束条件列表',
    example: ['total_duration<=15s', 'avoid_absolute_claims'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  constraint_list?: string[];

  @ApiPropertyOptional({
    description: 'Winner/Loser 文案偏好示例对（FR-9，最多5对）',
  })
  @IsOptional()
  preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;

  @ApiPropertyOptional({
    description: '文案偏好说明',
    example: '电商直播口吻，强调性价比和紧迫感',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  preference_remark?: string;

  @ApiPropertyOptional({
    description: '是否启用 AI 语义合规二审（默认 false，仅正则检查）',
    default: false,
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

  @ApiPropertyOptional({
    description: '图片视觉分析文本（由视觉模型生成），用于增强剧本生成的准确性。包含商品视觉特征、风格标签、画质评估、推荐分镜类型等',
    example: '商品视觉特征: 白色无线耳机、磨砂充电仓\n视觉风格: 极简科技风\n画质: high, 光线: 影棚柔光, 构图: 居中特写',
  })
  @IsOptional()
  @IsString()
  image_analysis?: string;
}