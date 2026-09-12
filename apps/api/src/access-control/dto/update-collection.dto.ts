import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateCollectionDto {
  @ApiPropertyOptional({ example: 'Ressources Droit L1 (2026)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'Chaîne vide = effacer la description.' })
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Collection parente (P6-1). `null` remonte la collection en racine.
   *
   * ⚠ `null` EST UNE VALEUR, pas une absence : `@IsOptional()` de
   * class-validator laisse passer `null` aussi bien que l'omission, et le
   * service distingue les deux (`!== undefined`). Sans cette distinction, il
   * n'y aurait aucun moyen de détacher une collection de sa parente.
   */
  @ApiPropertyOptional({
    nullable: true,
    description: 'Identifiant de la collection parente ; null pour une racine.',
  })
  @IsOptional()
  @ValidateIf((_, valeur) => valeur !== null)
  @IsString()
  @IsNotEmpty()
  parentId?: string | null;
}
