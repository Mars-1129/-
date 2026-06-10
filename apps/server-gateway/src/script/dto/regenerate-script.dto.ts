// =============================================================================
// TikStream AI — Regenerate Script DTO（Prompt 微调重生成）
// =============================================================================

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsIn, IsObject } from 'class-validator';

export class RegenerateScriptDto {
  @ApiPropertyOptional({ description: '覆盖风格' })
  @IsOptional()
  @IsString()
  style_vibe?: string;

  @ApiPropertyOptional({ description: '覆盖卖点' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selling_points?: string[];

  @ApiPropertyOptional({ description: '覆盖目标受众' })
  @IsOptional()
  @IsString()
  target_audience?: string;

  @ApiPropertyOptional({ description: '覆盖约束清单' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  constraint_list?: string[];

  @ApiPropertyOptional({ description: '覆盖标题' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '覆盖语言' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: '覆盖画面比例',
    enum: ['9:16', '16:9', '1:1'],
  })
  @IsOptional()
  @IsIn(['9:16', '16:9', '1:1'])
  aspect_ratio?: string;

  @ApiPropertyOptional({ description: '额外 Prompt 指令（追加到 user prompt）' })
  @IsOptional()
  @IsString()
  extra_instruction?: string;
}
