import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsInt, IsObject, MaxLength } from 'class-validator';

export class UpdateStrategyDto {
  @ApiPropertyOptional({ description: '策略中文名称' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: '策略类别', enum: ['creative', 'narrative', 'conversion', 'branding'] })
  @IsOptional()
  @IsString()
  @IsIn(['creative', 'narrative', 'conversion', 'branding'])
  category?: string;

  @ApiPropertyOptional({ description: '策略描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '策略摘要' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: '策略摘要（JSON 结构）' })
  @IsOptional()
  @IsObject()
  summary_json?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '排序号' })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}
