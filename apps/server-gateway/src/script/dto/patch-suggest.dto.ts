// =============================================================================
// TikStream AI — Patch Suggest DTO（AI 辅助 PATCH 建议）
// =============================================================================

import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PatchOperationDTO } from './patch-script.dto';

export class PatchSuggestDto {
  @ApiProperty({
    description: '用户打算执行的 PATCH 操作列表',
    type: [PatchOperationDTO],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatchOperationDTO)
  operations!: PatchOperationDTO[];
}
