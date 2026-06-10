import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, IsInt, IsObject, MaxLength } from 'class-validator';
import { FactorCategory } from '@tikstream/shared-types';

export class CreateFactorDto {
  @ApiProperty({ description: '因子唯一键（snake_case）', example: 'opening_soft_music' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  key!: string;

  @ApiProperty({ description: '因子中文名称', example: '轻柔音乐开场' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: '因子类别', enum: ['NARRATIVE', 'PARAMETER', 'INSTRUCTION'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['NARRATIVE', 'PARAMETER', 'INSTRUCTION'])
  category!: FactorCategory;

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

  @ApiPropertyOptional({ description: '排序号', default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}
