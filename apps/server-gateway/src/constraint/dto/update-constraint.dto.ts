import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsInt, IsObject, MaxLength } from 'class-validator';
import { ConstraintRuleType } from '@prisma/client';

export class UpdateConstraintDto {
  @ApiPropertyOptional({ description: '约束中文名称' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: '约束类别', enum: ['compliance', 'creative', 'branding', 'platform'] })
  @IsOptional()
  @IsString()
  @IsIn(['compliance', 'creative', 'branding', 'platform'])
  category?: string;

  @ApiPropertyOptional({ description: '规则类型', enum: ['HARD', 'SOFT'] })
  @IsOptional()
  @IsString()
  @IsIn(['HARD', 'SOFT'])
  rule_type?: ConstraintRuleType;

  @ApiPropertyOptional({ description: '规则配置（JSON 对象）' })
  @IsOptional()
  @IsObject()
  rule_config?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '约束描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '排序号' })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}
