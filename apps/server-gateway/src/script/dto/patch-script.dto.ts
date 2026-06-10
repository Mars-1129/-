// =============================================================================
// TikStream AI — Patch Script DTO
// =============================================================================

import {
  IsString,
  IsIn,
  IsOptional,
  ValidateIf,
} from 'class-validator';

export class PatchOperationDTO {
  @IsString({ message: 'op 必须是字符串' })
  @IsIn(['add', 'remove', 'replace', 'move'], {
    message: 'op 仅允许 add / remove / replace / move',
  })
  op!: 'add' | 'remove' | 'replace' | 'move';

  @IsString({ message: 'path 必须是字符串' })
  path!: string;

  @ValidateIf((operation: PatchOperationDTO) => operation.op === 'move')
  @IsString({ message: 'move 操作必须提供 from 路径' })
  from?: string;

  @IsOptional()
  value?: unknown;
}
