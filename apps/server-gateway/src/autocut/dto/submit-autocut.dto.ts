import { IsString, IsNotEmpty } from 'class-validator';

export class SubmitAutocutDto {
  @IsNotEmpty()
  @IsString()
  material_id!: string;
}
