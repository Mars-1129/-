// =============================================================================
// TikStream AI — Assign Template Constraints DTO
// =============================================================================

import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID } from 'class-validator';

export class AssignTemplateConstraintsDto {
  @ApiProperty({ description: '约束 ID 列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  constraint_ids!: string[];
}
