/**
 * LE MODÈLE DES PAGES LÉGALES — et la ligne qui décide de tout.
 *
 * Contrat : `apps/api/src/tenancy/pages-legales.ts` (rc5).
 * `{ mentions, confidentialite }`, chacune `{ blocs: Record<string,string>,
 * publieeLe: string | null }`. **« Le front décide de leur ordre »** — donc le
 * modèle vit ici.
 *
 * ## ⚠ CE QUI GOUVERNE CE FICHIER
 *
 * Décision de Jean, 8 octobre 2026 : sur l'instance de l'UO, l'éditeur et le
 * responsable du traitement, c'est **L'UO — pas ResurgiTech**. Ces pages sont
 * donc RÉDIGÉES PAR L'ÉTABLISSEMENT, avec un modèle par défaut qu'il complète.
 * Et : *« le modèle par défaut ne doit rien affirmer que l'établissement n'a pas
 * vérifié — pas de durée de conservation inventée, pas de délégué nommé. Des
 * champs à remplir, dits comme tels. »*
 *
 * ## ⭐ LA LIGNE FINE : deux natures de bloc
 *
 * | Nature | Ce que c'est | Pré-rempli ? |
 * |---|---|---|
 * | `mesure` | ce que le LOGICIEL détermine, et qu'on a MESURÉ dans le code | oui — une proposition, à relire |
 * | `a-remplir` | ce que l'ÉTABLISSEMENT seul connaît | **non, et la page ne se publie pas tant qu'il manque** |
 *
 * ⚠ **Un bloc `mesure` reste une PROPOSITION**, pas une vérité qu'on impose :
 * l'établissement le relit et l'amende. Ce qui le distingue d'un `a-remplir`
 * n'est pas qu'il échappe à la relecture — c'est qu'on peut nommer la mesure qui
 * l'a produit, au lieu d'inventer.
 *
 * ⚠ **ET AUCUN BLOC NE DIT « RESURGITECH ÉDITE CE SITE ».** La seule mention
 * légitime de l'éditeur est comme éditeur du LOGICIEL (AGPL-3.0) — jamais du
 * site, jamais du traitement. Un texte en dur signé ResurgiTech sur le site de
 * l'UO serait faux, et c'est le défaut que cette page existe pour éviter.
 */

export type NatureBloc = 'mesure' | 'a-remplir';

export interface BlocModele {
  readonly id: string;
  /** Le titre du bloc, affiché au public comme à l'éditeur. */
  readonly titre: string;
  readonly nature: NatureBloc;
  /** Ce qu'on propose. Vide pour un `a-remplir` — par construction. */
  readonly propose: string;
  /** Ce que l'éditeur doit savoir pour le remplir, ou la mesure qui l'a produit. */
  readonly aide: string;
}

/**
 * ⚠ Les faits pré-remplis viennent d'une MESURE du 8 octobre 2026, et chacune
 * est nommée dans l'`aide` du bloc. Ils ne sont pas une opinion juridique : ils
 * décrivent ce que le logiciel FAIT, ce qui est la seule chose que nous soyons
 * en mesure d'écrire.
 */
export const MODELE_MENTIONS: readonly BlocModele[] = [
  {
    id: 'editeur',
    titre: 'Éditeur du site',
    nature: 'a-remplir',
    propose: '',
    aide:
      'Le nom et la forme juridique de l’établissement qui publie ce site, son adresse ' +
      'postale et un moyen de le joindre. ⚠ C’est VOTRE établissement, jamais l’éditeur ' +
      'du logiciel.',
  },
  {
    id: 'responsable-publication',
    titre: 'Responsable de la publication',
    nature: 'a-remplir',
    propose: '',
    aide: 'Le nom et la fonction de la personne responsable du contenu publié.',
  },
  {
    id: 'hebergeur',
    titre: 'Hébergeur',
    nature: 'a-remplir',
    propose: '',
    aide:
      'Le nom et l’adresse de qui héberge ce service. ⚠ Nous ne pouvons pas le deviner : ' +
      'ce peut être votre propre salle serveur, votre université, ou un prestataire.',
  },
  {
    id: 'logiciel',
    titre: 'Le logiciel',
    nature: 'mesure',
    propose:
      'Ce site fonctionne avec Gafeso, un logiciel libre distribué sous licence ' +
      'AGPL-3.0 et édité par ResurgiTech SARL (Ouagadougou, Burkina Faso). ' +
      'L’éditeur du logiciel n’est pas l’éditeur de ce site, et n’a pas accès à ' +
      'ses données.',
    aide:
      'Mesure : la licence et l’éditeur du logiciel, lus dans le dépôt. ⚠ C’est la SEULE ' +
      'mention légitime de ResurgiTech sur ce site — comme éditeur du LOGICIEL.',
  },
];

export const MODELE_CONFIDENTIALITE: readonly BlocModele[] = [
  {
    id: 'responsable-traitement',
    titre: 'Responsable du traitement',
    nature: 'a-remplir',
    propose: '',
    aide:
      'L’établissement qui décide des finalités du traitement, et son adresse. ' +
      '⚠ C’est VOTRE établissement : l’éditeur du logiciel n’est pas responsable du ' +
      'traitement de vos données.',
  },
  {
    id: 'donnees',
    titre: 'Les données traitées par le service',
    nature: 'mesure',
    propose:
      'Pour gérer la bibliothèque, ce service enregistre : votre identité (nom, ' +
      'prénom, courriel, matricule), votre classe ou votre catégorie d’adhérent, ' +
      'vos emprunts et retours, vos réservations, vos amendes, et les documents ' +
      'numériques que vous consultez ou emportez hors connexion. Un journal ' +
      'd’audit conserve les actions du personnel et les adresses IP associées.',
    aide:
      'Mesure : les données que le produit écrit réellement, relevées dans le schéma. ' +
      '⚠ À compléter si votre établissement en traite d’autres par ailleurs.',
  },
  {
    id: 'cookies',
    titre: 'Cookies et traceurs',
    nature: 'mesure',
    propose:
      'Ce site dépose un seul cookie, nécessaire à votre connexion. Il n’est pas ' +
      'lisible par les scripts de la page, n’est envoyé qu’à ce site, et disparaît ' +
      'à l’expiration de votre session. Aucun traceur publicitaire ni outil de ' +
      'mesure d’audience tiers n’est utilisé.',
    aide:
      'Mesure du 8 octobre 2026 : un cookie de session (httpOnly, sameSite=lax, secure ' +
      'en production), et ZÉRO traceur — relevé sur neuf régies et outils de mesure dans ' +
      'tout le code du site, aucun trouvé.',
  },
  {
    id: 'conservation',
    titre: 'Durée de conservation',
    nature: 'a-remplir',
    propose: '',
    aide:
      '⚠ NOUS NE L’INVENTONS PAS. Combien de temps votre établissement conserve les ' +
      'comptes, l’historique des prêts et le journal d’audit relève de sa politique et ' +
      'de ses obligations. Une durée écrite ici sans avoir été décidée serait un ' +
      'engagement que personne n’a pris.',
  },
  {
    id: 'destinataires',
    titre: 'Destinataires et sous-traitants',
    nature: 'a-remplir',
    propose: '',
    aide:
      'Qui accède à ces données en dehors de votre personnel : hébergeur, prestataire ' +
      'de messagerie, service de paiement. ⚠ Cela dépend de votre installation ; nous ' +
      'ne pouvons pas le savoir.',
  },
  {
    id: 'delegue',
    titre: 'Délégué à la protection des données',
    nature: 'a-remplir',
    propose: '',
    aide:
      '⚠ IL PEUT N’Y EN AVOIR AUCUN, et c’est une réponse acceptable — écrivez-le alors ' +
      'en toutes lettres. Ce qu’il ne faut pas, c’est nommer quelqu’un qui ne l’est pas.',
  },
  {
    id: 'droits',
    titre: 'Vos droits, et comment les exercer',
    nature: 'a-remplir',
    propose: '',
    aide:
      'À qui s’adresser pour accéder à ses données, les corriger ou demander leur ' +
      'suppression — une adresse que quelqu’un lit vraiment. ⚠ Un droit sans ' +
      'destinataire est une impasse.',
  },
];

export const MODELES = {
  mentions: MODELE_MENTIONS,
  confidentialite: MODELE_CONFIDENTIALITE,
} as const;

export type ClePageLegale = keyof typeof MODELES;

export interface PageLegale {
  blocs: Record<string, string>;
  publieeLe: string | null;
}

/**
 * Les blocs `a-remplir` encore vides.
 *
 * ⚠ C'EST CE QUI INTERDIT LA PUBLICATION. Une page publique portant
 * « Durée de conservation : [à compléter] » sur le site d'une université serait
 * pire que son absence : c'est un faux dispositif, en droit.
 */
export function champsManquants(cle: ClePageLegale, page: PageLegale): BlocModele[] {
  return MODELES[cle].filter(
    (b) => b.nature === 'a-remplir' && !(page.blocs[b.id] ?? '').trim(),
  );
}

/** Une page est publiable quand plus aucun champ obligatoire ne manque. */
export function estPubliable(cle: ClePageLegale, page: PageLegale): boolean {
  return champsManquants(cle, page).length === 0;
}

/** Le texte à afficher pour un bloc : ce que l'école a écrit, sinon la proposition. */
export function texteDuBloc(bloc: BlocModele, page: PageLegale): string {
  return (page.blocs[bloc.id] ?? '').trim() || bloc.propose;
}
