// =============================================================================
// TikStream AI — Script Validate Timing DTO
// =============================================================================

import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidateTimingDto {
  @ApiProperty({
    description: '分镜索引 (1-based)',
    example: 1,
  })
  @IsNotEmpty()
  @IsNumber({}, { message: 'shot_index 必须是数字' })
  @Min(1, { message: 'shot_index 最小为 1' })
  shot_index!: number;

  @ApiProperty({
    description: '旁白台词文本',
    example: '三档智能控温，十分钟快速充满，随时随地卷出高级感。',
  })
  @IsNotEmpty()
  @IsString({ message: 'voiceover_text 必须是字符串' })
  voiceover_text!: string;

  @ApiProperty({
    description: '分镜时长（秒）',
    example: 3.5,
  })
  @IsNotEmpty()
  @IsNumber({}, { message: 'duration 必须是数字' })
  @Min(1.5, { message: 'duration 不能小于 1.5 秒' })
  @Max(5.0, { message: 'duration 不能超过 5.0 秒' })
  duration!: number;

  @ApiPropertyOptional({
    description: '剧本风格调性，可选',
    example: 'clean-tech',
  })
  @IsOptional()
  @IsString({ message: 'style_vibe 必须是字符串' })
  style_vibe?: string;

  @ApiPropertyOptional({
    description: '语言标记，可选',
    example: 'zh-CN',
  })
  @IsOptional()
  @IsString({ message: 'language 必须是字符串' })
  language?: string;
}
