import { IsBoolean, IsString, IsOptional, IsEnum, IsNumber, Min, Max, MaxLength, ValidateNested, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class WatermarkVisibleDto {
  @ApiProperty({ description: '水印文字内容', maxLength: 128, example: 'TikStream AI' })
  @IsString()
  @MaxLength(128)
  content!: string;

  @ApiPropertyOptional({ description: 'Logo 图片 URL（MinIO）' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  logo_url?: string;

  @ApiProperty({ description: '水印位置', enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right'] })
  @IsEnum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
  position!: string;

  @ApiProperty({ description: '透明度 (0.0-1.0)', minimum: 0, maximum: 1, example: 0.6 })
  @IsNumber()
  @Min(0)
  @Max(1)
  opacity!: number;

  @ApiProperty({ description: '字号（px）', example: 24 })
  @IsNumber()
  @Min(8)
  @Max(120)
  font_size!: number;

  @ApiProperty({ description: '是否包含时间戳' })
  @IsBoolean()
  include_timestamp!: boolean;

  @ApiProperty({ description: '是否包含用户ID' })
  @IsBoolean()
  include_user_id!: boolean;
}

class WatermarkInvisibleDto {
  @ApiProperty({ description: '隐水印技术', enum: ['metadata', 'steganography'] })
  @IsEnum(['metadata', 'steganography'])
  technique!: string;

  @ApiProperty({ description: '鲁棒性等级', enum: ['basic'] })
  @IsString()
  robustness!: string;

  @ApiProperty({ description: '嵌入的自定义 payload', maxLength: 256 })
  @IsString()
  @MaxLength(256)
  payload!: string;
}

class WatermarkCopyrightDto {
  @ApiProperty({ description: '版权持有人', maxLength: 128 })
  @IsString()
  @MaxLength(128)
  holder!: string;

  @ApiProperty({ description: '版权类型', maxLength: 64 })
  @IsString()
  @MaxLength(64)
  license_type!: string;

  @ApiProperty({ description: '是否需要署名' })
  @IsBoolean()
  attribution_required!: boolean;

  @ApiProperty({ description: '版权年份', example: 2026 })
  @IsNumber()
  @Min(2000)
  @Max(2099)
  copyright_year!: number;
}

export class ApplyWatermarkDto {
  @ApiProperty({ description: '是否启用水印' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ description: '水印类型', enum: ['visible', 'invisible', 'both'] })
  @IsEnum(['visible', 'invisible', 'both'])
  type!: string;

  @ApiPropertyOptional({ description: '可见水印配置（type=visible/both 时必填）' })
  @ValidateIf((o: ApplyWatermarkDto) => o.type === 'visible' || o.type === 'both')
  @ValidateNested()
  @Type(() => WatermarkVisibleDto)
  visible?: WatermarkVisibleDto;

  @ApiPropertyOptional({ description: '隐水印配置（type=invisible/both 时必填）' })
  @ValidateIf((o: ApplyWatermarkDto) => o.type === 'invisible' || o.type === 'both')
  @ValidateNested()
  @Type(() => WatermarkInvisibleDto)
  invisible?: WatermarkInvisibleDto;

  @ApiPropertyOptional({ description: '版权信息' })
  @IsOptional()
  @ValidateNested()
  @Type(() => WatermarkCopyrightDto)
  copyright?: WatermarkCopyrightDto;

  @ApiPropertyOptional({ description: '是否强制重新渲染' })
  @IsOptional()
  @IsBoolean()
  force_render?: boolean;
}
