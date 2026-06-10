import { IsString, IsUUID, IsOptional, IsEnum, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum OptimizationTrigger {
  NEGATIVE_SENTIMENT = 'negative_sentiment',
  PAIN_POINT = 'pain_point',
  FEATURE_REQUEST = 'feature_request',
}

export class OptimizeContentDto {
  @ApiProperty({ description: '商品 ID', format: 'uuid' })
  @IsUUID('4')
  product_id!: string;

  @ApiProperty({ enum: OptimizationTrigger, description: '优化触发类型' })
  @IsEnum(OptimizationTrigger)
  trigger!: OptimizationTrigger;

  @ApiPropertyOptional({ description: '目标剧本 ID（不传则选最新）' })
  @IsOptional()
  @IsUUID('4')
  script_id?: string;

  @ApiPropertyOptional({ description: '是否自动应用优化', default: false })
  @IsOptional()
  @IsBoolean()
  auto_apply?: boolean = false;

  @ApiPropertyOptional({ description: '额外优化指令' })
  @IsOptional()
  @IsString()
  extra_instruction?: string;
}

export class OptimizationResponse {
  optimization_id!: string;
  status!: string;
  suggestion!: string;
  suggestion_structured?: StructuredOptimization;
  new_script_id?: string;
  effect_metrics?: OptimizationEffectMetrics;
}

export class StructuredOptimization {
  summary!: string;
  score!: OptimizationScore;
  suggestions!: OptimizationSuggestionItem[];
  improved_script_outline!: string[];
}

export class OptimizationScore {
  overall!: number;
  clarity!: number;
  engagement!: number;
  conversion!: number;
  trust!: number;
}

export class OptimizationSuggestionItem {
  priority!: 'high' | 'medium' | 'low';
  shot_index!: number;
  shot_label!: string;
  issue!: string;
  action!: string;
  reason!: string;
  expected_impact!: string;
}

export class OptimizationEffectMetrics {
  ctr_delta?: number;
  cvr_delta?: number;
  retention_delta?: number;
}
