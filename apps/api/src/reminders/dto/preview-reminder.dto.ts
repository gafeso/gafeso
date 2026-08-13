import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

/** Aperçu d'un modèle non enregistré, rendu avec un jeu de données d'exemple. */
export class PreviewReminderDto {
  @ApiProperty({ enum: ['DUE_SOON', 'OVERDUE'] })
  @IsIn(['DUE_SOON', 'OVERDUE'])
  type!: 'DUE_SOON' | 'OVERDUE';

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  body!: string;
}
