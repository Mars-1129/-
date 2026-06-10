// =============================================================================
// TikStream AI — Search Viral Analysis DTO
// =============================================================================

import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { VIRAL_ANALYSIS_CONSTANTS } from '../viral-analysis.constants';

export class SearchViralAnalysisDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  @IsEnum(VIRAL_ANALYSIS_CONSTANTS.ALLOWED_PLATFORMS as unknown as string[])
  source_platform?: string;

  @IsOptional()
  @IsString()
  product_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size?: number = 20;
}
