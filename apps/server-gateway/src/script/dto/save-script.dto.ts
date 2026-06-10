// =============================================================================
// TikStream AI — Save Script DTO
// =============================================================================

import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SaveScriptRequestDto {
  @ApiPropertyOptional({
    description: '本次保存说明',
    example: '调整了 CTA 话术与第三镜头节奏',
  })
  @IsOptional()
  @IsString({ message: 'save_message 必须是字符串' })
  @MaxLength(500, { message: 'save_message 长度不能超过 500 字符' })
  save_message?: string;

  @ApiPropertyOptional({
    description: '是否强制重新执行全部校验，默认 true',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'force_revalidate 必须是布尔值' })
  force_revalidate?: boolean;
}
