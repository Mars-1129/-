// =============================================================================
// TikStream AI — Subtitle Translation DTOs
// =============================================================================

import { IsOptional, IsArray, IsString, ArrayMaxSize } from 'class-validator';

export class TranslateScriptDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  target_langs?: string[];
}

export class TranslateShotDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  target_langs?: string[];
}
