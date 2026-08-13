import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Droit',
    description:
      'Domaine de la constellation. Normalisé (espaces réduits, minuscules) ' +
      'avant stockage — la casse ne crée jamais deux catégories distinctes.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;
}
