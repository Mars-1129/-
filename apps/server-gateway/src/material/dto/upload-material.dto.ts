import { IsString, IsOptional, IsEnum, IsBoolean, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_CONSTANTS } from '../material.constants';

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

export class UploadMaterialDto {
  @ApiProperty({
    description: '商品ID（可选，未提供时将触发自动商品识别）',
    example: '00000000-0000-0000-0000-000000000001',
    required: false,
  })
  @IsOptional()
  @IsString()
  product_id?: string;

  @ApiPropertyOptional({
    description: '启用自动商品识别（当 product_id 未提供时生效）',
    example: true,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  auto_recognize_product?: boolean;

  @ApiProperty({
    description: '素材类型',
    enum: MATERIAL_CONSTANTS.MATERIAL_TYPES,
    example: 'IMAGE',
    required: true,
  })
  @IsNotEmpty()
  @IsEnum(MATERIAL_CONSTANTS.MATERIAL_TYPES)
  type!: string;

  @ApiPropertyOptional({
    description: '素材来源类型',
    enum: MATERIAL_CONSTANTS.MATERIAL_SOURCE_TYPES,
    example: 'UPLOAD',
    default: 'UPLOAD',
  })
  @IsOptional()
  @IsEnum(MATERIAL_CONSTANTS.MATERIAL_SOURCE_TYPES)
  source_type?: string;

  @ApiPropertyOptional({
    description: '备注信息',
    example: '竞品参考素材',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'remark 长度不能超过 500 字符' })
  remark?: string;

  @ApiPropertyOptional({
    description: '跳过 Qdrant 向量检索入库',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  qdrant_skip?: boolean;

  @ApiPropertyOptional({
    description: '参考素材关联的主素材ID（source_type=REFERENCE 时必填）',
    example: '00000000-0000-0000-0000-000000000010',
  })
  @IsOptional()
  @IsString()
  reference_material_id?: string;

  @ApiPropertyOptional({
    description: '参考素材分类（source_type=REFERENCE 时必填）',
    enum: MATERIAL_CONSTANTS.REFERENCE_CATEGORIES,
    example: 'COMPETITOR_IMAGE',
  })
  @IsOptional()
  @IsEnum(MATERIAL_CONSTANTS.REFERENCE_CATEGORIES)
  reference_category?: string;

  @ApiPropertyOptional({
    description: '参考素材来源 URL（source_type=REFERENCE 时必填）',
    example: 'https://example.com/reference-image.jpg',
  })
  @IsOptional()
  @IsString()
  origin_url?: string;
}
