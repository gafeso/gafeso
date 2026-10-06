import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class TestCourrielDto {
  @ApiProperty({ example: 'moi@exemple.org' })
  @IsEmail({}, { message: 'adresse électronique invalide.' })
  destinataire: string;
}
