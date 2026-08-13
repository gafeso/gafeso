import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty({ description: 'Token reçu dans le lien de définition (usage unique, 24h)' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ minLength: 8, description: 'Nouveau mot de passe (8 caractères minimum)' })
  @IsString()
  @MinLength(8)
  password: string;
}
