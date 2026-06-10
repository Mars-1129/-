import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_CONSTANTS } from '../material.constants';

export class ListMaterialsDto {
  @ApiPropertyOptional({
    description: '商品ID（必填，上下文隔离边界）',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @IsString()
  @IsNotEmpty({ message: 'product_id 不能为空' })
  product_id!: string;

  @ApiPropertyOptional({
    description: '素材类型筛选',
    enum: MATERIAL_CONSTANTS.MATERIAL_TYPES,
    example: 'VIDEO',
  })
  @IsOptional()
  @IsEnum(MATERIAL_CONSTANTS.MATERIAL_TYPES)
  type?: string;

  @ApiPropertyOptional({
    description: '素材状态筛选',
    enum: MATERIAL_CONSTANTS.MATERIAL_STATUSES,
    example: 'COMPLETED',
  })
  @IsOptional()
  @IsEnum(MATERIAL_CONSTANTS.MATERIAL_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    description: '素材来源类型筛选',
    enum: MATERIAL_CONSTANTS.MATERIAL_SOURCE_TYPES,
    example: 'UPLOAD',
  })
  @IsOptional()
  @IsEnum(MATERIAL_CONSTANTS.MATERIAL_SOURCE_TYPES)
  source_type?: string;

  @ApiPropertyOptional({
    description: '关键词搜索 (三路OR: 文件名 ILIKE / denseCaption ILIKE / tags 精确匹配，含同义词扩展)',
    example: '卷发棒',
  })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: '创建时间起始 (ISO8601)',
    example: '2026-05-20T00:00:00Z',
  })
  @IsOptional()
  @IsString()
  created_at_start?: string;

  @ApiPropertyOptional({
    description: '创建时间截止 (ISO8601)',
    example: '2026-05-27T00:00:00Z',
  })
  @IsOptional()
  @IsString()
  created_at_end?: string;

  @ApiPropertyOptional({
    description: '排序字段',
    enum: MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.SORTABLE_FIELDS,
    example: 'created_at',
    default: 'created_at',
  })
  @IsOptional()
  @IsIn(MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.SORTABLE_FIELDS)
  sort_by?: string;

  @ApiPropertyOptional({
    description: '排序方向',
    enum: ['ASC', 'DESC'],
    example: 'DESC',
    default: 'DESC',
  })
  @IsOptional()
  @IsString()
  sort_order?: string;

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
    example: 'eyJ2IjoiMjAyNi0wNS0yNVQxMjowMDowMC4wMDBaIiwiaSI6IjEwMDAwMDAwLTAwMDAtNDAwMC1hMDAwLTAwMDAwMDAwMDAwNSJ9',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
