// =============================================================================
// TikStream AI — Patch Creation Shot DTO
// =============================================================================

import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PatchCreationShotDto {
  @ApiPropertyOptional({
    description: '分镜时长（秒），范围 1.5 ~ 5.0',
    example: 3.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1.5)
  @Max(5.0)
  duration?: number;

  @ApiPropertyOptional({
    description: '字幕文案',
    example: 'This product will change your life!',
  })
  @IsOptional()
  @IsString()
  subtitle_text?: string;
}
