import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class FactorAssignmentItem {
  @ApiProperty({ description: '因子 ID' })
  @IsString()
  @IsNotEmpty()
  factor_id!: string;

  @ApiProperty({ description: '因子值（JSON 对象）' })
  @IsObject()
  value!: Record<string, unknown>;
}

export class AssignTemplateFactorsDto {
  @ApiProperty({ description: '因子分配列表', type: [FactorAssignmentItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FactorAssignmentItem)
  factors!: FactorAssignmentItem[];
}
