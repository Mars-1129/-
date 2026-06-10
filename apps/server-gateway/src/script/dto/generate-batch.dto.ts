// =============================================================================
// TikStream AI — Batch Script Generation DTO
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  Min,
  Max,
  ArrayMinSize,
  IsIn,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SCRIPT_CONSTANTS } from '../script.constants';

class PreferencePairDto {
  @ApiProperty({ enum: ['WINNER', 'LOSER'], description: '偏好类型' })
  @IsIn(['WINNER', 'LOSER'])
  type!: 'WINNER' | 'LOSER';

  @ApiProperty({ description: '示例文案', maxLength: 300 })
  @IsString()
  text!: string;
}

export class GenerateBatchDto {
  @ApiProperty({ description: '商品 ID', type: String })
  @IsString()
  product_id!: string;

  @ApiProperty({ description: '批量生成数量 (2-5)', minimum: 2, maximum: 5, example: 3 })
  @IsNumber()
  @Min(2)
  @Max(5)
  batch_size!: number;

  @ApiProperty({ description: '风格变化列表', example: ['灯光写实风格', '影视化大光圈风格', 'UGC真实感风格'] })
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  style_variations!: string[];

  @ApiPropertyOptional({ description: '目标语言', default: 'zh-CN' })
  @IsOptional()
  @IsString()
  language?: string;

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

  @ApiPropertyOptional({ description: '风格偏好配对' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferencePairDto)
  preferences?: PreferencePairDto[];

  @ApiPropertyOptional({ description: '偏好备注' })
  @IsOptional()
  @IsString()
  preference_remark?: string;

  @ApiPropertyOptional({ description: '是否启用 AI 语义合规二审（默认 false）' })
  @IsOptional()
  @IsBoolean()
  enable_ai_compliance?: boolean;

  @ApiPropertyOptional({ description: '最大并发数，用于控制同时调用 AI 的请求数量', default: 2, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  max_concurrency?: number;

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
