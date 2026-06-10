import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchTrendDto {
  @ApiProperty({
    description: '商品ID（必填，上下文隔离边界）',
    example: '00000000-0000-0000-0000-000000000001',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'product_id 不能为空' })
  product_id!: string;
}
