import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  Matches,
  Min,
  Validate,
  ValidateIf,
} from 'class-validator';
import { BandeauAccueilValide } from './hero-slides.validator';
import { PagesLegalesValides } from './pages-legales.validator';
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

  /**
   * MENTIONS LÉGALES et CONFIDENTIALITÉ — remplacement complet, comme l'accueil.
   *
   * ⚠ Le validateur REFUSE plutôt que de laisser le normaliseur tronquer : sur
   * un document juridique, une troncature silencieuse n'est pas une gêne
   * d'affichage. Voir `pages-legales.validator.ts`.
   *
   * ⚠ Et ce que la route PUBLIQUE en rend est FILTRÉ : seules les pages dont
   * `publieeLe` est posé sortent. Un brouillon n'est pas lisible du dehors.
   */
  @ApiPropertyOptional({
    description:
      'Pages légales rédigées par l’établissement : ' +
      '{ mentions: { blocs, publieeLe }, confidentialite: { … } }. ' +
      'Seules les pages dont publieeLe est posé sont servies publiquement.',
  })
  @IsOptional()
  @IsObject({ message: 'pagesLegales doit être un objet.' })
  @Validate(PagesLegalesValides)
  pagesLegales?: Record<string, unknown>;

  /**
   * ⭐⭐ LE JETON DE VERSION — OBLIGATOIRE DÈS QUE `pagesLegales` EST PRÉSENT.
   *
   * ## 🔴 Ce que l'absence de contrôle coûtait, et ce n'est pas une gêne
   *
   * Cette route fait un REMPLACEMENT COMPLET. Deux personnes qui ouvrent
   * l'éditeur au même moment écrivaient donc l'une sur l'autre **en silence** :
   * la seconde emportait une page que la première venait de PUBLIER, et aucune
   * des deux ne pouvait le savoir. Sur un texte juridique signé par
   * l'établissement, c'est une page publiée qui disparaît sans trace.
   *
   * ## ⚠ POURQUOI IL N'EST PAS `@IsOptional()`
   *
   * Un jeton optionnel se contourne EN L'OMETTANT — et l'omission est le cas
   * par défaut de tout client qui n'a pas été mis au courant. Le contrôle
   * n'aurait alors protégé que ceux qui le demandent, c'est-à-dire personne le
   * jour où ça compte. **Un garde qu'on désarme en ne disant rien n'en est pas
   * un.**
   *
   * ## ⚠ ET POURQUOI IL N'EST EXIGÉ QUE SI `pagesLegales` EST LÀ
   *
   * La même route écrit aussi les couleurs, l'accueil, le treillis. Les exiger
   * versionnés casserait tous les appelants qui changent une couleur — et ils
   * ne remplacent rien qu'un autre pourrait être en train de rédiger. La borne
   * est donc l'UNITÉ REMPLACÉE, pas la route.
   *
   * ## ⚠ POURQUOI DANS LE CORPS, ET NON EN `If-Match`
   *
   * Les deux sont corrects ; en avoir deux ne l'est pas — « deux mécanismes pour
   * une même propriété finissent par diverger ». Le corps l'emporte pour une
   * raison mesurée dans ce dépôt : un en-tête peut être retiré ou réécrit par un
   * mandataire (`Host` est purement et simplement JETÉ par `fetch`), et une
   * protection qui s'évapore en silence au passage d'un proxy est pire qu'une
   * protection absente. Le corps, lui, arrive ou la requête échoue.
   */
  @ValidateIf((o: UpdateTenantSettingsDto) => o.pagesLegales !== undefined)
  @IsInt({
    message:
      'pagesLegalesVersion est obligatoire pour écrire les pages légales : ' +
      'renvoyez la valeur « version » rendue par GET /tenancy/settings. ' +
      'Sans elle, cette écriture pourrait effacer une page publiée entre-temps.',
  })
  @Min(0, { message: 'pagesLegalesVersion ne peut pas être négative.' })
  @ApiPropertyOptional({
    description:
      'Version lue par GET /tenancy/settings. OBLIGATOIRE si pagesLegales est ' +
      'fourni. Une version périmée → 409, jamais un écrasement.',
  })
  pagesLegalesVersion?: number;
}
