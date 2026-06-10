// =============================================================================
// TikStream AI — Export Creation DTO
// =============================================================================

import { IsOptional, IsString, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExportCreationDto {
  @ApiPropertyOptional({
    description: '导出格式: mp4 / mov / webm（默认使用创建时的原始格式）',
    example: 'mp4',
  })
  @IsOptional()
  @IsString()
  export_format?: string;

  @ApiPropertyOptional({
    description: '目标分辨率: 1080x1920 / 1920x1080 / 720x1280（默认使用创建时的原始分辨率）',
    example: '1080x1920',
  })
  @IsOptional()
  @IsString()
  target_resolution?: string;

  @ApiPropertyOptional({
    description: '目标响度 LUFS，默认 -14（范围 -24 ~ -10）',
    example: -14,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-24)
  @Max(-10)
  loudnorm_i?: number;

  @ApiPropertyOptional({
    description: '最大真峰值 dBTP，默认 -1（范围 -3 ~ 0）',
    example: -1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-3)
  @Max(0)
  loudnorm_tp?: number;

  @ApiPropertyOptional({
    description: '启用智能语音增强（对旁白人声进行降噪、动态压缩、清晰度增强、齿音消除）',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  voice_enhance?: boolean;
}
