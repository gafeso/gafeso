import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantPlan } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { LONGUEUR_SLUG_MAX_SCHEMA, SLUG_PATTERN } from '../../tenancy/tenant-schema';

export class ProvisionTenantDto {
  @ApiProperty({ example: 'Lycée Philippe Zinda Kaboré' })
  @IsString()
  @IsNotEmpty()
  name: string;

  /**
   * ⚠ LE MOTIF VIENT DE `tenant-schema.ts`, IL N'EST PLUS RECOPIÉ ICI.
   *
   * *Jusqu'au 3 novembre 2026, ce motif existait en TROIS exemplaires
   * identiques : ici, dans `tenant-schema.ts` et dans
   * `terminer-installation.dto.ts`.* Deux copies qui s'accordent s'accordent
   * jusqu'au jour où l'une bouge — et celle-ci est la seule que voit une
   * requête HTTP, celle du schéma la seule que voit `tenantSchemaName`.
   *
   * ⚠ ET CE N'EST PAS LA BORNE QUI MORD : celle-ci vient de l'identifiant
   * PostgreSQL. La borne pratique est celle du QR d'étiquette, qui dépend de
   * l'origine servie et se fait respecter au provisionnement — voir
   * `labels/capacite-qr-etiquette.ts`.
   */
  @ApiProperty({
    example: 'zinda-kabore',
    description: `Identifiant d’école : minuscules, chiffres et tirets (2 à ${LONGUEUR_SLUG_MAX_SCHEMA} caractères). La borne effective est plus basse — voir le QR d’étiquette.`,
  })
  @IsString()
  @Matches(SLUG_PATTERN, {
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
