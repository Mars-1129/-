// =============================================================================
// TikStream AI — Posting Time DTO
// 投放时段优化请求 DTO
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn } from 'class-validator';

export class OptimizePostingTimeRequestDto {
  @ApiProperty({ description: '商品 ID', format: 'uuid' })
  @IsString({ message: 'product_id 必须是字符串' })
  @IsNotEmpty({ message: 'product_id 不能为空' })
  product_id!: string;

  @ApiPropertyOptional({
    description: '目标平台',
    example: 'douyin',
    enum: ['douyin', 'kuaishou', 'tiktok_us', 'xiaohongshu', 'wechat_channels'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['douyin', 'kuaishou', 'tiktok_us', 'xiaohongshu', 'wechat_channels'])
  platform?: string;

  @ApiPropertyOptional({ description: '内容类型', example: 'product_review', enum: ['product_review', 'tutorial', 'vlog', 'live_commerce', 'unboxing'] })
  @IsOptional()
  @IsString()
  content_type?: string;

  @ApiPropertyOptional({ description: '强制刷新缓存', default: false })
  @IsOptional()
  @IsBoolean()
  force_refresh?: boolean;
}
