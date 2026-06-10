import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExtractDnaDto {
  @ApiProperty({
    description: '商品类目',
    example: '美妆工具',
  })
  @IsString()
  product_category!: string;

  @ApiPropertyOptional({
    description: '目标市场',
    example: 'US',
  })
  @IsOptional()
  @IsString()
  market?: string;

  @ApiPropertyOptional({
    description: '最小样本数',
    example: 5,
    minimum: 3,
    maximum: 200,
  })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(200)
  min_samples?: number;
}
