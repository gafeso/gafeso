import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, Matches, Validate } from 'class-validator';
import { BandeauAccueilValide } from './hero-slides.validator';
import { ReglageDeplace } from './reglage-deplace.validator';

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

  /**
   * ⚠ DÉMÉNAGÉ le 11 septembre 2026 — voir `ReglageDeplace`.
   *
   * Le champ reste DÉCLARÉ, et refusé, au lieu d'être simplement retiré : c'est
   * la seule façon de rendre un message qui nomme la nouvelle route. Retiré, il
   * produirait un 400 générique du `ValidationPipe`, et le front chercherait
   * une faute de sa part là où il n'y a qu'un déplacement.
   *
   * ⚠ Il est aussi ce qui empêche la régression : tant que ce champ est là,
   * personne ne peut le « rajouter » sans voir qu'il a été retiré exprès.
   */
  @ApiPropertyOptional({
    type: Boolean,
    deprecated: true,
    description:
      '⚠ DÉMÉNAGÉ — ce champ est REFUSÉ ici. Le type est déclaré explicitement ' +
      'parce que Swagger ne sait pas décrire un champ typé `never` : il y voit ' +
      'une dépendance circulaire et REFUSE DE DÉMARRER l’application. Le `never` ' +
      'reste côté TypeScript (une réutilisation ne compile pas), le type ' +
      'annoncé ici est celui que le champ AVAIT.',
  })
  @IsOptional()
  @Validate(ReglageDeplace)
  require2fa?: never;

  // Contenu de la page d'accueil. Re-normalisé côté service
  // (sanitizeHomeContentInput) : liste blanche des champs, cardinalités et
  // longueurs bornées — @IsObject n'est que la garde de type de base.
  //
  // EXCEPTION à la phrase ci-dessus pour le seul bandeau : les cardinalités du
  // normaliseur TRONQUENT en silence, ce qui est le bon comportement en
  // lecture mais un faux silencieux en écriture — l'établissement croirait
  // avoir enregistré six diapositives. Le bandeau est donc refusé ici, en
  // nommant la limite, AVANT que la normalisation ne le rabote.
  @IsOptional()
  @IsObject({ message: 'homepageContent doit être un objet.' })
  @Validate(BandeauAccueilValide)
  homepageContent?: Record<string, unknown>;
}
