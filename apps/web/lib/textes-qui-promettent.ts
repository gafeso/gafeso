// Libellés dont le CONTENU engage le produit — et ceux qui en ont l'air sans l'être.
//
// ⚠ CE FICHIER N'A AUCUN EFFET À L'EXÉCUTION. Il documente, et il est lu par
// tests/textes-qui-promettent.spec.ts, qui exige une assertion de PROPRIÉTÉ pour
// chaque texte qui promet.
//
// ── POURQUOI IL EXISTE ──────────────────────────────────────────────────────
// Un test de libellé prend spontanément cette forme :
//
//     expect(boite.textContent).toContain(LIBELLES.motDePasse.recours);
//
// Elle vérifie que l'écran affiche la bonne VARIABLE. Elle ne voit RIEN du
// contenu : remplacer le recours par « réessayez plus tard » laisse la suite
// verte. Deux fois en une heure le 12 septembre 2026 — sur le recours du mot de
// passe, puis sur le refus d'un module éteint — un contrôle négatif a dû
// l'attraper. Ce n'est donc pas une inattention mais la forme PAR DÉFAUT d'un
// test de libellé, et une forme par défaut ne se corrige pas par la vigilance.
//
// ⚠ DEUX NATURES, ET NE JAMAIS LES CONFONDRE — même raison que
// `fonctions-sans-ecran.ts` : si « ce texte promet » et « ce texte y ressemble
// sans promettre » s'écrivaient pareil, cette liste deviendrait l'endroit où
// l'on fait taire le test d'une ligne.

export type NatureDuTexte =
  /** Le contenu engage : il porte un recours, une réassurance, une consigne. */
  | 'promet'
  /** Il en a la FORME sans l'engagement — prose d'accueil, verbe d'invitation. */
  | 'ressemblance';

export interface TexteQuiPromet {
  /** Chemin dans LIBELLES, tel qu'il s'écrit dans le code. */
  cle: string;
  nature: NatureDuTexte;
  /** Une phrase : ce que le texte DOIT continuer de dire, ou pourquoi il ne promet rien. */
  raison: string;
}

export const TEXTES_QUI_PROMETTENT: TexteQuiPromet[] = [
  {
    cle: 'motDePasse.recours',
    nature: 'promet',
    raison:
      'Seul chemin vers le compte quand le lien a expiré : doit NOMMER à qui ' +
      's’adresser. « Réessayez plus tard » est une attente, pas une sortie.',
  },
  {
    cle: 'modules.ecranModuleInactif',
    nature: 'promet',
    raison:
      'Doit dire que rien n’est perdu ET par où revenir : sans cela, qui ' +
      'retrouve un vieux signet croit la fonction supprimée.',
  },
  {
    cle: 'inscription.emailNonParti',
    nature: 'promet',
    raison:
      'L’étudiant n’a AUCUN recours propre : la phrase doit porter la sortie ' +
      '(contacter la bibliothèque), pas seulement constater l’échec.',
  },
  {
    cle: 'amendes.conservees',
    nature: 'promet',
    raison:
      'Doit dire que les amendes dues sont CONSERVÉES : sans cela, un montant ' +
      'figé à côté de prêts en retard se lit comme un calcul en panne.',
  },
  {
    cle: 'modules.aucuneDonneeSupprimee',
    nature: 'promet',
    raison:
      'Dite AVANT le geste de désactivation : c’est elle qui lève l’inquiétude, ' +
      'donc elle doit continuer de nier la suppression.',
  },
  {
    cle: 'adherents.supprimerRefusHistorique',
    nature: 'promet',
    raison:
      'Un refus doit NOMMER ce qui l’empêche — ici l’historique de prêts — ' +
      'sinon la personne cherche une panne au lieu d’une raison.',
  },
  {
    cle: 'importNotices.valeursNonReconnuesTexte',
    nature: 'promet',
    raison:
      'Doit rassurer sur l’import (les notices SONT importées) tout en disant ' +
      'ce qui manque : sans la première moitié, on croit l’import perdu.',
  },
  {
    // ⚠ DÉCLARÉ PARCE QUE LE GARDE L'A EXIGÉ, une heure après sa création et
    // sur son premier cas réel : ce libellé est né avec l'écran « Mon dépôt »,
    // et le témoin de forme l'a refusé avant que j'y pense. C'est exactement ce
    // qu'on attend de lui — attraper le texte auquel personne n'a pensé.
    cle: 'monDepot.sansDirecteur',
    nature: 'promet',
    raison:
      'Un étudiant qui ne peut pas soumettre doit savoir que son dépôt et son ' +
      'document sont CONSERVÉS, et à qui le signaler. « Soumission ' +
      'impossible. » serait exact et le ferait recommencer — ce que tout cet ' +
      'écran existe pour éviter.',
  },
  {
    // ⚠ Chemin corrigé : le garde a refusé « accueil.presentation », qui
    // n'existe pas. Ce texte vit dans la section `defauts` (le repli sobre
    // servi quand l'école n'a pas encore rempli sa page d'accueil).
    cle: 'defauts.presentation',
    nature: 'ressemblance',
    raison:
      'Prose d’accueil : « Cherchez, empruntez et lisez… » emploie l’impératif ' +
      'd’invitation, pas de consigne de secours. Rien n’y est promis.',
  },
  {
    // ⚠ TROISIÈME TEXTE RÉCLAMÉ PAR LE GARDE LE JOUR DE SA NAISSANCE.
    cle: 'depotsAValider.refuseSuite',
    nature: 'promet',
    raison:
      'Un directeur qui refuse doit savoir que rien n’est supprimé — le dépôt ' +
      'et son document restent — et que son motif sera LU par l’étudiant. ' +
      '« Refus envoyé. » serait exact et lui laisserait croire qu’il vient de ' +
      'faire disparaître un travail, ou que son motif reste entre lui et la ' +
      'bibliothèque.',
  },
  {
    // ⚠ ATTRAPÉ PAR LE GARDE À L'ÉCRITURE, et c'était prévisible : « sont
    // conservées » est exactement la forme qu'il cherche. Deuxième fois qu'il
    // réclame un texte le jour de sa naissance.
    cle: 'perte.fileNonServable',
    nature: 'promet',
    raison:
      'Une file que plus aucun exemplaire ne peut servir est un ÉTAT, pas une ' +
      'faute — un rachat le résout, et la bibliothécaire seule en décide. Le ' +
      'texte doit donc dire que les réservations sont CONSERVÉES et que ' +
      'personne n’a perdu sa place : l’API a tranché « signalées, jamais ' +
      'annulées », et une réservation appartient au lecteur.',
  },
  {
    // ⚠ INVISIBLE AU GARDE JUSQU'AU 12 SEPTEMBRE 2026. Son relevé de forme
    // exigeait la valeur sur la MÊME ligne que la clé ; ce texte est écrit en
    // concaténation sur trois lignes, et passait donc sans être vu. Le relevé
    // a été élargi le jour même, et il a immédiatement réclamé ce libellé-ci —
    // le seul de cette forme dans tout le fichier.
    cle: 'mesEncadrements.ficheNonLiee',
    nature: 'promet',
    raison:
      'Un enseignant dont le compte n’est pas rattaché à sa fiche d’auteur ne ' +
      'peut RIEN faire seul : le rattachement se pose au catalogage. Le texte ' +
      'doit donc nommer la bibliothèque, et dire que ses encadrements existent ' +
      'peut-être déjà — sans quoi il se lit « vous n’avez rien dirigé », sur ' +
      'l’écran qui sert à monter un dossier de promotion.',
  },
];
