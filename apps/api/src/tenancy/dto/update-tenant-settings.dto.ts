import { IsBoolean, IsObject, IsOptional, Matches } from 'class-validator';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class UpdateTenantSettingsDto {
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'primaryColor doit être une couleur hexadécimale (#RRGGBB).' })
  primaryColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'secondaryColor doit être une couleur hexadécimale (#RRGGBB).' })
  secondaryColor?: string;

  // Tokens de couleur de la vitrine (voir home-theme.ts). Le contenu est
  // re-nettoyé côté service (sanitizeHomeTokens) : seules les clés connues et
  // hexadécimales valides sont conservées — @IsObject ne fait que la garde de
  // type de base.
  @IsOptional()
  @IsObject({ message: 'themeTokens doit être un objet de couleurs.' })
  themeTokens?: Record<string, unknown>;

  // Motif décoratif (croisillons) de la vitrine.
  @IsOptional()
  @IsBoolean()
  latticeEnabled?: boolean;

  // 2FA obligatoire pour les rôles disposant de comptes.gerer / etablissement.gerer.
  @IsOptional()
  @IsBoolean()
  require2fa?: boolean;

  // Contenu de la page d'accueil. Re-normalisé côté service
  // (sanitizeHomeContentInput) : liste blanche des champs, cardinalités et
  // longueurs bornées — @IsObject n'est que la garde de type de base.
  @IsOptional()
  @IsObject({ message: 'homepageContent doit être un objet.' })
  homepageContent?: Record<string, unknown>;
}
