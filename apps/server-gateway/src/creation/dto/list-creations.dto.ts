// =============================================================================
// TikStream AI — Creation List DTO
// =============================================================================

import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListCreationsDto {
  @ApiProperty({
    description: '商品ID（必填，上下文隔离边界）',
    example: '00000000-0000-4000-a000-000000000001',
    required: true,
  })
  @IsString()
  product_id!: string;

  @ApiPropertyOptional({
    description: '创作任务状态筛选',
    enum: ['PENDING', 'PROCESSING', 'FINISHED', 'FAILED', 'CANCELED'],
    example: 'PROCESSING',
  })
  @IsOptional()
  @IsEnum(['PENDING', 'PROCESSING', 'FINISHED', 'FAILED', 'CANCELED'])
  status?: string;

  @ApiPropertyOptional({
    description: '当前阶段筛选',
    enum: [
      'QUEUE_ALLOCATION',
      'ASSET_MATCHING',
      'AI_VIDEO_GENERATING',
      'TTS_GENERATING',
      'FFMPEG_STITCHING',
      'LOUDNORM_COMPLIANCE',
      'FINISHED',
      'FAILED',
    ],
    example: 'AI_VIDEO_GENERATING',
  })
  @IsOptional()
  @IsEnum([
    'QUEUE_ALLOCATION',
    'ASSET_MATCHING',
    'AI_VIDEO_GENERATING',
    'TTS_GENERATING',
    'FFMPEG_STITCHING',
    'LOUDNORM_COMPLIANCE',
    'FINISHED',
    'FAILED',
  ])
  current_stage?: string;

  @ApiPropertyOptional({
    description: '引擎模式筛选',
    enum: ['SCRIPT_DRIVEN'],
    example: 'SCRIPT_DRIVEN',
  })
  @IsOptional()
  @IsEnum(['SCRIPT_DRIVEN'])
  engine_mode?: string;

  @ApiPropertyOptional({
    description: '导出格式筛选',
    enum: ['MP4', 'MOV', 'WEBM'],
    example: 'MP4',
  })
  @IsOptional()
  @IsEnum(['MP4', 'MOV', 'WEBM'])
  export_format?: string;

  @ApiPropertyOptional({
    description: '每页条数 (1~100)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: '游标分页 token (base64url)，首次查询不传',
    example: 'eyJ2IjoiMjAyNi0wNS0yN1QxMjowMDowMC4wMDBaIiwiaSI6IjEwMDAwMDAwLTAwMDAtNDAwMC1hMDAwLTAwMDAwMDAwMDAwMCJ9',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
