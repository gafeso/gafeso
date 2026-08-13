import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantPlan } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class ProvisionTenantDto {
  @ApiProperty({ example: 'Lycée Philippe Zinda Kaboré' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'zinda-kabore',
    description: 'Identifiant d’école : minuscules, chiffres et tirets (2 à 49 caractères).',
  })
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,48}$/, {
    message: 'slug invalide (minuscules, chiffres, tirets ; commence par une lettre).',
  })
  slug: string;

  @ApiPropertyOptional({
    example: 'zinda.gafeso.bf',
    description: 'Domaine principal de l’école (résolution du tenant).',
  })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ enum: TenantPlan, example: TenantPlan.STARTER })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;
}
