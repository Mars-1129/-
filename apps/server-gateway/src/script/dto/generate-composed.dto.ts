// =============================================================================
// TikStream AI — Composed Script Generation DTO
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsObject, IsBoolean, IsOptional, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateComposedDto {
  @ApiProperty({ description: '商品 ID', type: String })
  @IsString()
  product_id!: string;

  @ApiPropertyOptional({ description: '模板 ID（策略骨架）' })
  @IsOptional()
  @IsString()
  template_id?: string;

  @ApiPropertyOptional({ description: '爆款视频分析 ID（Hook 灵感）' })
  @IsOptional()
  @IsString()
  viral_video_id?: string;

  @ApiPropertyOptional({ description: '是否自动匹配最佳爆款分析' })
  @IsOptional()
  @IsBoolean()
  auto_match_viral?: boolean;

  @ApiPropertyOptional({ description: '策略覆盖' })
  @IsOptional()
  @IsObject()
  strategy_overrides?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '因子覆盖' })
  @IsOptional()
  @IsObject()
  factor_overrides?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '约束覆盖' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  constraint_overrides?: string[];

  @ApiPropertyOptional({ description: '脚本标题' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '语言' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: '风格氛围' })
  @IsOptional()
  @IsString()
  style_vibe?: string;

  @ApiPropertyOptional({
    description: '画面比例',
    default: '9:16',
    enum: ['9:16', '16:9', '1:1'],
  })
  @IsOptional()
  @IsIn(['9:16', '16:9', '1:1'])
  aspect_ratio?: string;

  @ApiPropertyOptional({ description: '卖点列表' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selling_points?: string[];

  @ApiPropertyOptional({ description: '目标受众' })
  @IsOptional()
  @IsString()
  target_audience?: string;

  @ApiPropertyOptional({ description: '约束清单' })
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

  @ApiPropertyOptional({ description: '关联素材 ID 列表，用于增强剧本与素材切片视觉特征的匹配度' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  material_ids?: string[];

  @ApiPropertyOptional({ description: '是否启用 AI 视觉理解（需开通多模态 API）' })
  @IsOptional()
  @IsBoolean()
  enable_vision_analysis?: boolean;
}
