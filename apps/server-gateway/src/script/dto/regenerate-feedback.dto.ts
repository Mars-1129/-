// =============================================================================
// TikStream AI — Regenerate with Feedback DTO（反馈驱动重生成）
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsNumber, IsOptional, IsIn, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

class ShotFeedbackItem {
  @ApiProperty({ description: '分镜索引', example: 1 })
  @IsNumber()
  shot_index!: number;

  @ApiProperty({ description: '修改意见（自然语言描述）', example: '开场画面太暗，需要更明亮的产品展示' })
  @IsString()
  feedback!: string;
}

export class RegenerateFeedbackDto {
  @ApiProperty({
    description: '逐镜反馈列表',
    type: [ShotFeedbackItem],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShotFeedbackItem)
  shot_feedbacks!: ShotFeedbackItem[];

  @ApiPropertyOptional({
    description: '重生成模式：targeted=只改标记分镜, cascade=标记分镜+级联修复后续',
    default: 'targeted',
    enum: ['targeted', 'cascade'],
  })
  @IsOptional()
  @IsIn(['targeted', 'cascade'])
  regenerate_mode?: 'targeted' | 'cascade';

  @ApiPropertyOptional({ description: '额外全局 Prompt 指令' })
  @IsOptional()
  @IsString()
  extra_instruction?: string;
}
