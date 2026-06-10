// =============================================================================
// TikStream AI — From Material DTO
// =============================================================================

import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class FromMaterialDto {
  @IsNotEmpty()
  @IsString()
  material_id!: string;

  @IsOptional()
  @IsString()
  product_id?: string;
}
