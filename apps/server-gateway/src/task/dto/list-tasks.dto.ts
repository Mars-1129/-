import { Type, Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListTasksDto {
  @ApiPropertyOptional({
    description: '商品ID，传入后按商品上下文过滤任务',
    example: '00000000-0000-4000-a000-000000000001',
  })
  @IsOptional()
  @IsString()
  product_id?: string;

  @ApiPropertyOptional({
    description: '任务状态筛选',
    enum: ['PENDING', 'PROCESSING', 'FINISHED', 'FAILED', 'CANCELED'],
    example: 'PROCESSING',
  })
  @IsOptional()
  @IsEnum(['PENDING', 'PROCESSING', 'FINISHED', 'FAILED', 'CANCELED'])
  status?: string;

  @ApiPropertyOptional({
    description: '页码，从 1 开始',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

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
  page_size: number = 20;
}
