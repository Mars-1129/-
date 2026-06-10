import { IsString, IsOptional, IsEnum, IsInt, Min, Max, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_CONSTANTS } from '../material.constants';

export class SearchMaterialsDto {
  @ApiProperty({
    description: '商品ID（必填，上下文隔离边界）',
    example: '00000000-0000-0000-0000-000000000001',
    required: true,
  })
  @IsString()
  product_id!: string;

  @ApiPropertyOptional({
    description: '检索查询文本（对应商品标题/卖点/Dense Caption 语义匹配）',
    example: 'wireless hair curler close-up shot',
  })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({
    description: '素材类型筛选',
    enum: MATERIAL_CONSTANTS.MATERIAL_TYPES,
    example: 'VIDEO',
  })
  @IsOptional()
  @IsEnum(MATERIAL_CONSTANTS.MATERIAL_TYPES)
  type?: string;

  @ApiPropertyOptional({
    description: '切片状态筛选',
    enum: MATERIAL_CONSTANTS.MATERIAL_SLICE_STATUSES,
    example: 'COMPLETED',
  })
  @IsOptional()
  @IsEnum(MATERIAL_CONSTANTS.MATERIAL_SLICE_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    description: '最小时长 (秒)',
    example: 1.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  min_duration?: number;

  @ApiPropertyOptional({
    description: '最大时长 (秒)',
    example: 4.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_duration?: number;

  @ApiPropertyOptional({
    description: '检索模式：AUTO (自动选择最优路径) / VECTOR (强制 Qdrant 向量检索) / KEYWORD (强制 PostgreSQL 关键字检索) / FUSION (并行多路召回 + RRF 融合排序)',
    enum: ['AUTO', 'VECTOR', 'KEYWORD', 'FUSION'],
    example: 'AUTO',
    default: 'AUTO',
  })
  @IsOptional()
  @IsEnum(['AUTO', 'VECTOR', 'KEYWORD', 'FUSION'])
  search_mode?: string;

  @ApiPropertyOptional({
    description: '检索粒度：slice (默认，切片级) / material (独立 material 向量检索) / hybrid (两阶段：语义搜索 → 聚合到 material 级)',
    enum: ['slice', 'material', 'hybrid'],
    example: 'slice',
    default: 'slice',
  })
  @IsOptional()
  @IsEnum(['slice', 'material', 'hybrid'])
  granularity?: string;

  @ApiPropertyOptional({
    description: '每页条数 (1~50)',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    description: '检索严格度：strict（仅返回有密集描述的切片）/ relaxed（返回全部切片，无描述时用标签降级匹配）',
    enum: ['strict', 'relaxed'],
    example: 'relaxed',
    default: 'relaxed',
  })
  @IsOptional()
  @IsEnum(['strict', 'relaxed'])
  strictness?: string;

  @ApiPropertyOptional({
    description: '游标分页 token (slice_id)，首次查询不传',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
