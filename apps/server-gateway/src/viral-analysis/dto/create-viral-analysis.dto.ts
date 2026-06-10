// =============================================================================
// TikStream AI — Create Viral Analysis DTO
// =============================================================================

import { IsString, IsOptional, IsBoolean, IsEnum, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VIRAL_ANALYSIS_CONSTANTS } from '../viral-analysis.constants';

export class CreateViralAnalysisDto {
  @ApiProperty({
    description: '爆款视频来源 URL',
    example: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(VIRAL_ANALYSIS_CONSTANTS.MAX_URL_LENGTH)
  source_url!: string;

  @ApiProperty({
    description: '来源平台标识',
    example: 'tiktok',
    enum: VIRAL_ANALYSIS_CONSTANTS.ALLOWED_PLATFORMS,
    required: true,
  })
  @IsNotEmpty()
  @IsEnum(VIRAL_ANALYSIS_CONSTANTS.ALLOWED_PLATFORMS)
  source_platform!: string;

  @ApiPropertyOptional({
    description: '关联商品ID',
    example: '00000000-0000-0000-0000-000000000100',
  })
  @IsOptional()
  @IsString()
  product_id?: string;

  @ApiPropertyOptional({
    description: '视频标题（可选，用于辅助 AI 分析）',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: '是否声明为公开来源 (默认 true)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  declared_public_source?: boolean;
}
