// =============================================================================
// TikStream AI — Restyle Regeneration DTO（视觉风格替换重生成）
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class VisualStyleRestyle {
  @ApiProperty({ description: '色调', example: '高对比冷暖色' })
  @IsString()
  color_palette!: string;

  @ApiProperty({ description: '视觉节奏', example: '快速切换' })
  @IsString()
  visual_tempo!: string;

  @ApiProperty({ description: '光影风格', example: '逆光高亮' })
  @IsString()
  lighting_style!: string;
}

export class RegenerateRestyleDto {
  @ApiProperty({ description: '新视觉风格', type: VisualStyleRestyle })
  @IsObject()
  @ValidateNested()
  @Type(() => VisualStyleRestyle)
  visual_style!: VisualStyleRestyle;

  @ApiPropertyOptional({
    description: '是否保留配音/字幕不变',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  preserve_audio?: boolean;

  @ApiPropertyOptional({ description: '额外 Prompt 指令' })
  @IsOptional()
  @IsString()
  extra_instruction?: string;
}
