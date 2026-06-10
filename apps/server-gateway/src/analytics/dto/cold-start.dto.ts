// =============================================================================
// TikStream AI — Cold Start DTO
// 投放效果预测（冷启动加速）请求/响应 DTO
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsIn, IsString } from 'class-validator';

export class PredictPerformanceRequestDto {
  @ApiProperty({ description: '剧本 ID', format: 'uuid' })
  @IsString({ message: 'script_id 必须是字符串' })
  @IsUUID('4', { message: 'script_id 必须是有效的 UUID v4' })
  script_id!: string;

  @ApiPropertyOptional({ description: '商品 ID，用于 ViralDNA 匹配（不传则从 Script 关联获取）', format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'product_id 必须是有效的 UUID v4' })
  product_id?: string;

  @ApiPropertyOptional({ description: '强制使用指定预测源', enum: ['LLM', 'DUCKDB', 'VIRAL_DNA', 'HEURISTIC'], default: 'AUTO' })
  @IsOptional()
  @IsIn(['LLM', 'DUCKDB', 'VIRAL_DNA', 'HEURISTIC'], { message: 'force_source 必须是 LLM, DUCKDB, VIRAL_DNA 或 HEURISTIC' })
  force_source?: 'LLM' | 'DUCKDB' | 'VIRAL_DNA' | 'HEURISTIC';
}
