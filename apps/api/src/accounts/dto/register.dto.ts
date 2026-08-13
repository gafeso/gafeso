import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Inscription publique — deux profils :
 *  - ÉTUDIANT : matricule + classe fournis. Activation automatique si le
 *    matricule figure dans la liste pré-chargée, sinon compte en attente.
 *  - PERSONNEL / AUTRE : sans matricule. Compte toujours en attente ; le
 *    rôle est choisi par l'activateur AU MOMENT de l'activation — jamais
 *    par l'inscrit (aucun champ rôle ici, c'est voulu).
 */
export class RegisterDto {
  @ApiPropertyOptional({
    example: 'ETU-2026-0142',
    description:
      'Matricule étudiant. Absent = inscription personnel/autre : compte en ' +
      'attente, rôle défini à l’activation.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  matricule?: string;

  @ApiProperty({ example: 'awa.traore@ecole.bf' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Awa' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Traoré' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({
    example: 'L1_DROIT',
    description: 'Classe / niveau — requis avec un matricule (profil étudiant).',
  })
  @ValidateIf((dto: RegisterDto) => dto.matricule !== undefined)
  @IsString()
  @IsNotEmpty()
  className?: string;
}
