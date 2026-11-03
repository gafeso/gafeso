import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  Equals,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SLUG_PATTERN } from '../../tenancy/tenant-schema';

class EtablissementDto {
  @ApiProperty({ example: 'Université d’Exemple' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  nom: string;

  @ApiProperty({ example: 'uex', description: 'minuscules, chiffres, tirets ; commence par une lettre' })
  @IsString()
  // ⚠ TROISIÈME COPIE DU MÊME MOTIF, trouvée le 3 novembre 2026 en balayant
  // APRÈS avoir corrigé les deux que je connaissais. Je ne l'aurais pas vue en
  // relisant les deux fichiers signalés : c'est le geste « chercher les autres
  // sites de la même règle » qui l'a sortie, pas la correction elle-même.
  @Matches(SLUG_PATTERN, {
    message: 'identifiant invalide (minuscules, chiffres, tirets ; commence par une lettre).',
  })
  slug: string;
}

class AdministrateurDto {
  @ApiProperty({ example: 'bibliothecaire@exemple.org' })
  @IsEmail({}, { message: 'adresse électronique invalide.' })
  email: string;

  @ApiProperty({ example: 'Awa' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  prenom: string;

  @ApiProperty({ example: 'Traoré' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  nom: string;
}

export class TerminerInstallationDto {
  @ApiProperty({ type: EtablissementDto })
  @ValidateNested() @Type(() => EtablissementDto)
  etablissement: EtablissementDto;

  @ApiProperty({ required: false, example: 'biblio.exemple.org' })
  @IsOptional() @IsString() @MaxLength(253)
  domaine?: string;

  @ApiProperty({ type: AdministrateurDto })
  @ValidateNested() @Type(() => AdministrateurDto)
  administrateur: AdministrateurDto;

  @ApiProperty({ example: ['rappels'], required: false })
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true })
  modulesDesactives?: string[];

  /**
   * ⚠ SECOND GESTE EXPLICITE. Ce qui suit n'est pas défaisable : l'école est
   * créée, le compte administrateur existe, et l'assistant se ferme
   * définitivement. Même forme que la reprise du super-admin.
   */
  @ApiProperty({ example: true, description: 'Obligatoirement `true` — ce geste n’est pas défaisable.' })
  @Equals(true, {
    message:
      'confirme doit valoir true : la création de l’école et du compte administrateur ' +
      'n’est pas défaisable, et l’assistant se ferme ensuite définitivement.',
  })
  confirme: boolean;
}
