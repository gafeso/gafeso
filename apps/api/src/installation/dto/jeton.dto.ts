import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class JetonAmorcageDto {
  /**
   * ⚠ EN CORPS DE REQUÊTE, jamais en paramètre d'URL — une URL voyage dans
   * l'historique du navigateur, dans l'en-tête `Referer` et dans le journal
   * d'accès de Caddy.
   */
  @ApiProperty({ description: 'Le jeton lu dans le fichier d’installation (son CONTENU, pas son chemin).' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  jeton: string;
}
