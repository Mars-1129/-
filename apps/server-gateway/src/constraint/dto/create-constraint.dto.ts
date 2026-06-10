import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, IsInt, IsObject, MaxLength } from 'class-validator';
import { ConstraintRuleType } from '@prisma/client';

export class CreateConstraintDto {
  @ApiProperty({ description: '约束唯一键（snake_case）', example: 'no_competitor_logo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  key!: string;

  @ApiProperty({ description: '约束中文名称', example: '禁止竞品logo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: '约束类别', enum: ['compliance', 'creative', 'branding', 'platform'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['compliance', 'creative', 'branding', 'platform'])
  category!: string;

  @ApiProperty({ description: '规则类型', enum: ['HARD', 'SOFT'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['HARD', 'SOFT'])
  rule_type!: ConstraintRuleType;

  @ApiProperty({ description: '规则配置（JSON 对象）' })
  @IsObject()
  @IsNotEmpty()
  rule_config!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '约束描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '排序号', default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}
