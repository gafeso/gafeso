import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Étape 2 du login : jeton de défi + code (TOTP, code de secours ou OTP email). */
export class TwoFactorLoginDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  twoFactorToken!: string;

  @ApiProperty({ description: 'Code TOTP (6 chiffres), code de secours ou OTP email' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code!: string;
}

/** Demande d'envoi d'un OTP par email (repli). */
export class TwoFactorTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  twoFactorToken!: string;
}

/** Démarrage de l'activation 2FA (profil = session ; enrôlement forcé = enrollToken). */
export class TwoFactorSetupDto {
  @ApiPropertyOptional({ description: 'Jeton d’enrôlement (login avec 2FA obligatoire non encore configurée)' })
  @IsOptional()
  @IsString()
  enrollToken?: string;
}

/** Confirmation de l'activation avec un premier code TOTP. */
export class TwoFactorEnableDto {
  @ApiProperty({ description: 'Premier code TOTP pour confirmer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  enrollToken?: string;
}

/** Désactivation 2FA — protégée par mot de passe. */
export class TwoFactorDisableDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;
}

/** Régénération des codes de secours — protégée par mot de passe. */
export class TwoFactorBackupCodesDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;
}
