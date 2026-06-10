import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsInt, IsObject, MaxLength } from 'class-validator';
import { FactorCategory } from '@tikstream/shared-types';

export class UpdateFactorDto {
  @ApiPropertyOptional({ description: '因子中文名称' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: '因子类别', enum: ['NARRATIVE', 'PARAMETER', 'INSTRUCTION'] })
  @IsOptional()
  @IsString()
  @IsIn(['NARRATIVE', 'PARAMETER', 'INSTRUCTION'])
  category?: FactorCategory;

  @ApiPropertyOptional({ description: '因子描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '默认值（JSON 对象）' })
  @IsOptional()
  @IsObject()
  default_value?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '值结构定义（JSON Schema）' })
  @IsOptional()
  @IsObject()
  value_schema?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '排序号' })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}
