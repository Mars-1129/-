import { IsArray, ValidateNested, IsBoolean, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

class SegmentSelection {
  @IsInt()
  index!: number;

  @IsBoolean()
  selected!: boolean;
}

export class UpdateSegmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentSelection)
  segments!: SegmentSelection[];
}
