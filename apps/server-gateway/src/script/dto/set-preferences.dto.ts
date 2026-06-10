// =============================================================================
// TikStream AI — Script Preference Alignment DTO (FR-9)
// =============================================================================

import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PreferencePair {
  @ApiProperty({
    enum: ['WINNER', 'LOSER'],
    description: '偏好类型：WINNER 好文案 / LOSER 差文案',
  })
  @IsString()
  @IsIn(['WINNER', 'LOSER'])
  type!: 'WINNER' | 'LOSER';

  @ApiProperty({
    maxLength: 300,
    description: '示例文案（Winner 展示高转化表达，Loser 展示说明书式文本）',
    example: '一键磨皮，3秒出门！',
  })
  @IsString()
  @MaxLength(300)
  text!: string;
}

export class SetPreferencesDto {
  @ApiPropertyOptional({
    type: [PreferencePair],
    maxItems: 5,
    description:
      'Winner/Loser 偏好示例对（最多 5 对）。Winner 展示高转化表达方式，Loser 展示需避免的说明书/平淡表达。AI 生成时将对齐 Winner 风格、避免 Loser 模式。',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferencePair)
  preferences?: PreferencePair[];

  @ApiPropertyOptional({
    maxLength: 200,
    description: '偏好说明（可选，用于描述整体文案风格方向）',
    example: '电商直播口吻，强调性价比和紧迫感',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  preference_remark?: string;
}
