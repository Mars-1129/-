import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty({
    description: '平台标识',
    example: 'douyin',
  })
  @IsString()
  platform!: string;

  @ApiProperty({
    description: '账号主页链接',
    example: 'https://www.tiktok.com/@testuser',
  })
  @IsString()
  account_url!: string;

  @ApiPropertyOptional({
    description: '账号名称',
    example: '美妆达人小A',
  })
  @IsOptional()
  @IsString()
  account_name?: string;
}
