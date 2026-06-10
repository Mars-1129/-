// =============================================================================
// TikStream AI — Viral DNA DTO
// =============================================================================

import { IsString, IsOptional, IsInt, Min, Max, IsNumber, IsArray, IsBoolean } from 'class-validator';

export class ViralDNAExtractDto {
  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  market?: string;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(200)
  min_samples?: number;
}

export class ViralDNAListQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  market?: string;
}

export class GenerateFromDNADto {
  @IsString()
  product_id!: string;

  @IsString()
  dna_id!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  min_confidence?: number;

  @IsOptional()
  @IsString()
  style_vibe?: string;

  @IsOptional()
  @IsString()
  aspect_ratio?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  material_ids?: string[];

  @IsOptional()
  @IsBoolean()
  enable_vision_analysis?: boolean;
}
