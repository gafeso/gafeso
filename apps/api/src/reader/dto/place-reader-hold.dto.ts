import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/** Réservation posée par le lecteur connecté (l'adhérent = le compte, jamais un param). */
export class PlaceReaderHoldDto {
  @ApiProperty({ description: 'Identifiant de la notice à réserver.' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  recordId!: string;
}
