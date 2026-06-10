// =============================================================================
// TikStream AI — Factor Remix Regeneration DTO（因子局部替换重生成）
// =============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsBoolean, IsOptional, IsString } from 'class-validator';

export class FactorRemixDto {
  @ApiProperty({ description: '因子覆盖映射（key为因子键，value为新值）' })
  @IsObject()
  factor_overrides!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '是否保留配音/字幕不变', default: true })
  @IsOptional()
  @IsBoolean()
  preserve_voiceover?: boolean;

  @ApiPropertyOptional({ description: '额外 Prompt 指令' })
  @IsOptional()
  @IsString()
  extra_instruction?: string;
}
