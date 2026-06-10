import { IsString, IsUUID, IsOptional, IsEnum, IsUrl, Min, Max, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CommentFetchMode {
  MOCK = 'mock',
  CSV_IMPORT = 'csv_import',
  TIKTOK_API = 'tiktok_api',
}

export class FetchCommentsDto {
  @ApiProperty({ description: '商品 ID', format: 'uuid' })
  @IsUUID('4')
  product_id!: string;

  @ApiProperty({ description: '视频 URL（TikTok/YouTube）' })
  @IsString()
  video_url!: string;

  @ApiPropertyOptional({ enum: CommentFetchMode, default: CommentFetchMode.MOCK })
  @IsOptional()
  @IsEnum(CommentFetchMode)
  mode?: CommentFetchMode = CommentFetchMode.MOCK;

  @ApiPropertyOptional({ description: '最大采集条数', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  max_count?: number = 50;
}

export class FetchCommentsResponse {
  comment_count!: number;
  new_count!: number;
  skipped_count!: number;
  /** 数据库中该商品的评论总数 */
  db_total_count?: number;
}
