import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class ListAccountsDto {
  @ApiPropertyOptional({ enum: AccountStatus, description: 'Filtrer par statut' })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ description: 'Recherche (email, nom, matricule)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * Options de l'import des étudiants attendus.
 *
 * ⚠ `remplacer` N'EST JAMAIS LE DÉFAUT, et `confirmeRetraits` est OBLIGATOIRE
 * quand il est demandé. Sans ce nombre — celui qu'a rendu l'aperçu — rien
 * n'empêcherait d'appliquer un fichier différent de celui qu'on a
 * prévisualisé, et c'est précisément le cas qui détruirait une classe entière :
 * quelqu'un exportera la moitié d'un tableur.
 */
export class ImporterEtudiantsAttendusDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Retire de chaque classe PRÉSENTE DANS LE FICHIER les étudiants attendus ' +
      'non réclamés qui n’y figurent pas. Exige `confirmeRetraits`.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  remplacer?: boolean;

  @ApiPropertyOptional({
    description: 'Le nombre de retraits annoncé par l’aperçu. Obligatoire si `remplacer`.',
  })
  @ValidateIf((o: ImporterEtudiantsAttendusDto) => o.remplacer === true)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  confirmeRetraits?: number;
}
