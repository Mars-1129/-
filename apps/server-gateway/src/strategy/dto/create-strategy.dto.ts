import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, IsInt, IsObject, MaxLength } from 'class-validator';

export class CreateStrategyDto {
  @ApiProperty({ description: '策略唯一键（snake_case）', example: 'first_person_immersion' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  key!: string;

  @ApiProperty({ description: '策略中文名称', example: '第一人称沉浸' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: '策略类别', enum: ['creative', 'narrative', 'conversion', 'branding'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['creative', 'narrative', 'conversion', 'branding'])
  category!: string;

  @ApiPropertyOptional({ description: '策略描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '策略摘要' })
  @IsString()
  @IsNotEmpty()
  summary!: string;

  @ApiPropertyOptional({ description: '策略摘要（JSON 结构）' })
  @IsOptional()
  @IsObject()
  summary_json?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '排序号', default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}
