import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID } from 'class-validator';

export class AssignTemplateStrategiesDto {
  @ApiProperty({ description: '策略 ID 列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  strategy_ids!: string[];
}
