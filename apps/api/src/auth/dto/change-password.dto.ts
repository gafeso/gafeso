import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Changement de mot de passe par l'utilisateur lui-même : exige le mot de passe
 * ACTUEL (re-authentification) + un nouveau soumis à des règles minimales de
 * robustesse. La 2FA éventuelle n'est PAS touchée par ce changement.
 */
export class ChangePasswordDto {
  @ApiProperty({ description: 'Mot de passe actuel (re-authentification)' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({
    minLength: 8,
    description:
      'Nouveau mot de passe : 8 caractères minimum, au moins une lettre et un chiffre.',
  })
  @IsString()
  @MinLength(8, { message: 'Le nouveau mot de passe doit faire au moins 8 caractères.' })
  @MaxLength(72, { message: 'Le mot de passe ne peut pas dépasser 72 caractères.' }) // limite bcrypt
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Le nouveau mot de passe doit contenir au moins une lettre et un chiffre.',
  })
  newPassword!: string;
}
