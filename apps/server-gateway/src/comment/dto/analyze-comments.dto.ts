import { IsString, IsUUID, IsOptional, IsArray, ArrayMinSize, ArrayMaxSize, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyzeCommentsDto {
  @ApiProperty({ description: '商品 ID', format: 'uuid' })
  @IsUUID('4')
  product_id!: string;

  @ApiPropertyOptional({ description: '指定评论 ID 列表（不传则分析全部未分析评论）', isArray: true })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  comment_ids?: string[];

  @ApiPropertyOptional({ description: '最大分析条数', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  max_count?: number = 50;
}

export class BatchAnalyzeResponse {
  analyzed_count!: number;
  failed_count!: number;
  summary!: CommentSentimentSummary;
}

export class CommentSentimentSummary {
  total!: number;
  positive_count!: number;
  neutral_count!: number;
  negative_count!: number;
  positive_ratio!: number;
  negative_ratio!: number;
  top_pain_points!: string[];
  top_feature_requests!: string[];
  average_purchasing_intent!: number;
}
