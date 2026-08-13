import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Autocomplétion : suggestions d'auteurs par nom. */
export class AuthorSuggestDto {
  @ApiProperty()
  @IsString()
  q!: string;
}

/** Renommage d'une fiche auteur (propagé partout). */
export class RenameAuthorDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  displayName!: string;
}

/** Fusion : bascule les contributions de la fiche courante vers `intoId`. */
export class MergeAuthorDto {
  @ApiProperty({ description: 'Fiche à conserver ; la fiche courante est absorbée puis supprimée.' })
  @IsUUID()
  intoId!: string;
}

/** Filtre optionnel de la liste admin des auteurs. */
export class AuthorsListDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}
