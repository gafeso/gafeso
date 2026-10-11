/**
 * LA COUVERTURE COMPOSÉE — le garde de la reprise.
 *
 * `docs/specification-couverture-composee.md` (rc8) nomme QUATRE obligations
 * pour la reprise, et ce fichier les porte une par une :
 *
 * 1. mêmes teintes, même table, même hachage — « un document a une couleur, pas
 *    une couleur par écran » ;
 * 2. **contraste CALCULÉ, pas estimé**, avec un **CONTRÔLE NÉGATIF** ;
 * 3. aucun champ inventé ;
 * 4. zéro requête.
 *
 * ⚠ CE QUI REND LE ② INDISPENSABLE, et la spécification le dit elle-même :
 * *« une formule fausse ne fait pas échouer les tests : elle les fait tous
 * passer. »* Un garde qui vérifie seulement « les douze teintes dépassent
 * 4,5:1 » serait VERT avec une formule qui rend 21 partout. D'où le témoin
 * d'ABSENCE : blanc sur l'orange de marque vaut 3,01:1, et il doit être
 * REFUSÉ.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CouvertureComposee } from '@/components/couverture-composee';
import {
  DOS,
  ENCRE,
  PALETTE,
  TEINTE_PAR_DOMAINE,
  contraste,
  enLignes,
  fnv1a32,
  indiceDeTeinte,
  largeurEstimee,
  planDeCouverture,
  proportions,
  SEUIL_INITIALE,
  teinte,
} from '@/lib/couverture-composee';

/** Le vert de marque et l'orange de marque, tels que la spécification les cite. */
const ORANGE_DE_MARQUE = '#E07A2B';

describe('① les teintes, la table, le hachage', () => {
  it('la palette porte EXACTEMENT douze teintes, dans l’ordre de la spécification', () => {
    // ⚠ Témoin de COMPTE : une treizième teinte changerait tous les replis
    // (`h mod 12`), donc la couleur de documents déjà en service.
    expect(PALETTE).toHaveLength(12);
    expect([...PALETTE]).toEqual([
      '#1B5E3F',
      '#14492F',
      '#2F6B55',
      '#8A4A14',
      '#7A3A0C',
      '#6B4A10',
      '#28433A',
      '#4A2D3A',
      '#1E3A5F',
      '#3E5222',
      '#6E2F1B',
      '#33305E',
    ]);
    expect(ENCRE).toBe('#FFFFFF');
    expect(DOS).toBe(ORANGE_DE_MARQUE);
  });

  it('la table nomme EXACTEMENT dix domaines, chacun sur la teinte de la spécification', () => {
    expect(Object.keys(TEINTE_PAR_DOMAINE)).toHaveLength(10);
    expect(TEINTE_PAR_DOMAINE).toEqual({
      arts: 7,
      droit: 8,
      economie: 3,
      histoire: 6,
      informatique: 2,
      langues: 11,
      litterature: 10,
      medecine: 0,
      philosophie: 4,
      sciences: 9,
    });
  });

  it('les dix domaines nommés rendent DIX teintes distinctes — c’est la raison de la table', () => {
    const distinctes = new Set(Object.values(TEINTE_PAR_DOMAINE));
    expect(distinctes.size).toBe(10);
  });

  /**
   * ⚠ LE TÉMOIN QUI PROUVE QUE MON HACHAGE EST CELUI DE LA SPÉCIFICATION.
   *
   * Elle mesure, sur ces dix domaines : FNV-1a sur 12 teintes n'en rend que
   * **SIX** distinctes (effet anniversaire). Ce n'est pas une propriété qu'on
   * souhaite — c'est une EMPREINTE : un FNV-1a mal écrit (mauvais nombre
   * premier, `>>> 0` oublié, `*` au lieu de `Math.imul`) ne rendrait pas six.
   *
   * ⚠ Et c'est aussi l'argument de la table, vérifié plutôt que cru : six
   * teintes pour dix domaines, ce sont quatre domaines qui se confondent.
   */
  it('FNV-1a seul ne rendrait que SIX teintes sur les dix domaines — l’empreinte du hachage', () => {
    const parHachage = new Set(
      Object.keys(TEINTE_PAR_DOMAINE).map((d) => fnv1a32(d) % 12),
    );
    expect(parHachage.size).toBe(6);
  });

  it('le hachage est DÉTERMINISTE et ne dépend ni de la casse ni des espaces', () => {
    expect(fnv1a32('agronomie')).toBe(fnv1a32('agronomie'));
    expect(indiceDeTeinte('  Agronomie  ')).toBe(indiceDeTeinte('agronomie'));
    expect(indiceDeTeinte('  DROIT ')).toBe(8);
    // ⚠ Témoin d'ABSENCE sur la confusion plausible : deux domaines DIFFÉRENTS
    // ne doivent pas être rapprochés par le détourage.
    expect(fnv1a32('agronomie')).not.toBe(fnv1a32('agronomi'));
  });

  it('un domaine vide, nul ou blanc rend la teinte 0', () => {
    expect(indiceDeTeinte(null)).toBe(0);
    expect(indiceDeTeinte(undefined)).toBe(0);
    expect(indiceDeTeinte('')).toBe(0);
    expect(indiceDeTeinte('   ')).toBe(0);
    expect(teinte(null)).toBe(PALETTE[0]);
  });

  it('un domaine hors table reste dans la palette', () => {
    for (const d of ['agronomie', 'théologie', 'génie civil', 'ZOOLOGIE', 'x']) {
      expect(PALETTE).toContain(teinte(d));
    }
  });
});

describe('② le contraste — CALCULÉ, avec son contrôle négatif', () => {
  /**
   * ⭐ LE CONTRÔLE NÉGATIF, et c'est lui qui donne sa valeur au reste.
   *
   * La spécification cite 3,01:1 pour le blanc sur l'orange de marque. Si ma
   * formule rendait 21 partout — ou si elle oubliait la correction gamma —
   * cette assertion tomberait, et toutes les autres resteraient vertes.
   */
  it('blanc sur l’orange de marque vaut 3,01:1 et est REFUSÉ', () => {
    const mesure = contraste(ENCRE, ORANGE_DE_MARQUE);
    expect(mesure).toBeCloseTo(3.01, 2);
    expect(mesure).toBeLessThan(4.5);
  });

  /**
   * ⚠ Et les valeurs de la spécification, une par une : un couple exact par
   * teinte, pas un seuil. Un seuil ne distingue pas une formule juste d'une
   * formule généreuse.
   */
  it('les douze couples valent EXACTEMENT ce que la spécification mesure', () => {
    const attendus = [
      7.72, 10.38, 6.26, 6.84, 8.61, 8.04, 10.75, 12.16, 11.5, 8.62, 10.07, 12.17,
    ];
    expect(attendus).toHaveLength(PALETTE.length);
    PALETTE.forEach((fond, i) => {
      expect(contraste(ENCRE, fond), `teinte ${i} (${fond})`).toBeCloseTo(
        attendus[i],
        1,
      );
    });
  });

  it('le PIRE couple vaut 6,26:1 et dépasse le seuil AA', () => {
    const pire = Math.min(...PALETTE.map((f) => contraste(ENCRE, f)));
    expect(pire).toBeCloseTo(6.26, 2);
    expect(pire).toBeGreaterThan(4.5);
  });

  it('le contraste est SYMÉTRIQUE et vaut 1 pour une couleur sur elle-même', () => {
    expect(contraste('#1B5E3F', ENCRE)).toBeCloseTo(contraste(ENCRE, '#1B5E3F'), 6);
    expect(contraste(ENCRE, ENCRE)).toBeCloseTo(1, 6);
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });
});

describe('③ aucun champ inventé', () => {
  const nue = { titre: 'Précis de droit foncier', domaine: 'droit' };

  it('un auteur, un type et une année absents DISPARAISSENT', () => {
    const plan = planDeCouverture(nue, 160, 220);
    expect(plan.lignesAuteur).toEqual([]);
    expect(plan.type).toBeNull();
    expect(plan.annee).toBeNull();
  });

  it('le rendu ne porte ni tiret cadratin, ni « s.d. », ni « inconnu »', () => {
    const html = renderToStaticMarkup(
      <CouvertureComposee notice={nue} largeur={160} hauteur={220} />,
    );
    expect(html).not.toMatch(/—|s\.\s?d\.|inconnu|Inconnu|N\/A/);
    // ⚠ Témoin de PRÉSENCE : sans lui, un rendu VIDE passerait les trois
    // négations ci-dessus.
    expect(html).toContain('Précis');
  });

  it('un auteur, un type et une année présents apparaissent, le type en CAPITALES', () => {
    const plan = planDeCouverture(
      { ...nue, auteur: 'Ouédraogo, Aïcha', type: 'Thèse', annee: 2021 },
      160,
      220,
    );
    expect(plan.lignesAuteur.map((l) => l.texte).join(' ')).toContain('Ouédraogo');
    expect(plan.type).toBe('THÈSE');
    expect(plan.annee).toBe('2021');
  });

  it('une année à ZÉRO n’est pas confondue avec une année absente', () => {
    // ⚠ `0` est falsy : un `annee && …` l'aurait fait disparaître. Le produit
    // n'en porte pas, et c'est exactement pourquoi le cas doit être tenu — un
    // zéro qui s'efface est un faux silencieux.
    expect(planDeCouverture({ ...nue, annee: 0 }, 160, 220).annee).toBe('0');
    expect(planDeCouverture({ ...nue, annee: null }, 160, 220).annee).toBeNull();
  });

  it('un auteur jouxtant déjà un bloc titre-auteur s’OMET par `null`', () => {
    expect(planDeCouverture({ ...nue, auteur: null }, 160, 220).lignesAuteur).toEqual(
      [],
    );
    expect(planDeCouverture({ ...nue, auteur: '   ' }, 160, 220).lignesAuteur).toEqual(
      [],
    );
  });
});

describe('④ zéro requête', () => {
  /**
   * ⚠ LES DEUX TAILLES, ET C'EST UN CONTRÔLE NÉGATIF QUI L'A EXIGÉ.
   *
   * Ma première écriture ne rendait qu'à 160×220 — donc jamais la branche de
   * l'INITIALE, qui est celle des petites vignettes. Une police nommée posée
   * dans cette branche a laissé la suite VERTE : la mutation avait eu lieu, le
   * code muté est bien vivant, et mon jeu d'essai ne l'atteignait pas.
   *
   * ⚠ Et le même essai a montré un SECOND défaut de mon motif : il ne cherchait
   * que la forme attribut `font-family="…"`. Une police posée en `style` sort
   * `style="font-family:Inter"` — invisible. Les deux formes sont cherchées
   * maintenant.
   */
  const TAILLES = [
    { nom: 'petite (initiale seule)', largeur: 58, hauteur: 62 },
    { nom: 'grande (texte complet)', largeur: 160, hauteur: 220 },
  ];
  const NOTICE = {
    titre: 'Précis de droit foncier burkinabè',
    auteur: 'Ouédraogo, Aïcha',
    type: 'Thèse',
    annee: 2021,
    domaine: 'droit',
  };

  it.each(TAILLES)(
    'le rendu $nom n’émet AUCUNE requête : pas d’URL, pas d’image, pas de source',
    ({ largeur, hauteur }) => {
      const html = renderToStaticMarkup(
        <CouvertureComposee notice={NOTICE} largeur={largeur} hauteur={hauteur} />,
      );
      // ⚠ `//` est dans la liste exprès : il attrape un `//cdn…` protocol-relative.
      // Et il a mordu à la première exécution, sur le `xmlns` de l'espace de noms
      // SVG — qui n'est PAS une requête (c'est un nom), mais qui n'a rien à faire
      // dans un SVG inline : en HTML, l'analyseur place déjà `<svg>` dans le bon
      // espace de noms. Retiré, et le rendu ne porte plus aucune `http`.
      expect(html).not.toMatch(/https?:|\/\/|<image|\ssrc=|@import|xlink:href/);
      // ⚠ Le SEUL `url(` toléré est le détourage interne, qui ne sort pas du
      // document. Un second serait une requête.
      expect(html.match(/url\(/g) ?? []).toHaveLength(1);
      expect(html).toContain('clip-path="url(#cc-');
      // Témoin de PRÉSENCE : un rendu VIDE passerait toutes les négations.
      expect(html.length).toBeGreaterThan(200);
    },
  );

  it.each(TAILLES)(
    'la police du rendu $nom est HÉRITÉE — aucune famille nommée, donc aucun téléchargement',
    ({ largeur, hauteur }) => {
      const html = renderToStaticMarkup(
        <CouvertureComposee notice={NOTICE} largeur={largeur} hauteur={hauteur} />,
      );
      expect(html).toContain('font-family="inherit"');
      // Les DEUX formes : l'attribut SVG, et la propriété CSS d'un `style`.
      expect(html).not.toMatch(/font-family="(?!inherit)/);
      expect(html).not.toMatch(/font-family\s*:/);
      expect(html).not.toMatch(/@font-face/);
    },
  );
});

describe('les proportions et le seuil des 80 px', () => {
  /**
   * ⚠ ET LA BANDE NON BORNÉE EST ÉTROITE — mesuré, pas supposé : `L × 0,055`
   * ne tient entre 2 et 6 que pour `L ∈ [36,4 ; 109,1]`. À 160 px de large —
   * la fiche — le dos vaut 8,8 et il est donc BORNÉ à 6.
   *
   * Mon premier témoin affirmait « dans la borne » à 160 : il était faux, et
   * c'est lui qui a produit la mesure.
   */
  it('le dos est borné à [2, 6] px, et la borne HAUTE agit dès 110 px de large', () => {
    expect(proportions(20, 28).dos).toBe(2); // 20 × 0,055 = 1,1 → borné bas
    expect(proportions(80, 110).dos).toBeCloseTo(4.4, 6); // 80 × 0,055, DANS la bande
    expect(proportions(110, 150).dos).toBe(6); // 110 × 0,055 = 6,05 → borné haut
    expect(proportions(160, 220).dos).toBe(6); // la fiche : bornée
  });

  it('toutes les tailles sont relatives à la HAUTEUR, aux coefficients de la spécification', () => {
    const p = proportions(160, 220);
    expect(p.titre).toBeCloseTo(220 * 0.082, 6);
    expect(p.auteur).toBeCloseTo(220 * 0.055, 6);
    expect(p.type).toBeCloseTo(220 * 0.04, 6);
    expect(p.annee).toBeCloseTo(220 * 0.046, 6);
    expect(p.initiale).toBeCloseTo(220 * 0.4, 6);
    expect(p.margeGauche).toBeCloseTo(160 * 0.14, 6);
    expect(p.margeDroite).toBeCloseTo(160 * 0.09, 6);
    expect(p.margeHaut).toBeCloseTo(220 * 0.08, 6);
    expect(p.margeBas).toBeCloseTo(220 * 0.07, 6);
  });

  it('le titre tient 4 lignes, et 5 seulement AU-DESSUS de 160 px', () => {
    expect(proportions(160, 160).lignesDeTitre).toBe(4);
    expect(proportions(160, 161).lignesDeTitre).toBe(5);
  });

  /** ⚠ Le seuil s'éprouve DES DEUX CÔTÉS, sinon on ne sait pas où il est. */
  it('sous 80 px de haut : SEULE l’initiale ; à 80 : le texte complet', () => {
    const n = { titre: 'précis de droit', auteur: 'Ouédraogo', annee: 2021 };
    const petite = planDeCouverture(n, 58, SEUIL_INITIALE - 1);
    expect(petite.initialeSeule).toBe(true);
    expect(petite.initiale).toBe('P');
    expect(petite.lignesTitre).toEqual([]);
    expect(petite.lignesAuteur).toEqual([]);
    expect(petite.annee).toBeNull();

    const grande = planDeCouverture(n, 58, SEUIL_INITIALE);
    expect(grande.initialeSeule).toBe(false);
    expect(grande.initiale).toBeNull();
    expect(grande.lignesTitre.length).toBeGreaterThan(0);
  });

  it('un titre vide ne devient pas une initiale inventée', () => {
    expect(planDeCouverture({ titre: '' }, 58, 62).initiale).toBeNull();
    expect(planDeCouverture({ titre: '   ' }, 58, 62).initiale).toBeNull();
  });
});

describe('le découpage en lignes, son ellipse, et la CONTRAINTE de largeur', () => {
  const textes = (l: ReturnType<typeof enLignes>) => l.map((x) => x.texte);

  it('un texte qui tient n’est PAS suivi d’une ellipse', () => {
    // ⚠ Témoin d'ABSENCE : une ellipse sur un texte complet annoncerait une
    // suite qui n'existe pas.
    expect(textes(enLignes('Précis', 18, 200, 4)).join('|')).toBe('Précis');
    expect(textes(enLignes('Précis', 18, 200, 4)).join('')).not.toContain('…');
  });

  it('un texte trop long est borné au nombre de lignes et porte l’ellipse', () => {
    const long = 'Précis de droit foncier burkinabè et de ses coutumes locales anciennes';
    const lignes = textes(enLignes(long, 18, 100, 2));
    expect(lignes).toHaveLength(2);
    expect(lignes[lignes.length - 1]).toMatch(/…$/);
  });

  it('un seul mot plus large que la ligne ne boucle pas à l’infini', () => {
    expect(enLignes('anticonstitutionnellement', 18, 20, 2).length).toBeGreaterThan(0);
  });

  /**
   * ⭐ LE DÉBORDEMENT, ET SON CONTRÔLE NÉGATIF VENU D'UNE RECETTE.
   *
   * Mesuré sur la fiche réelle : « Mathématiques » posé en 13,448 px faisait
   * 99,8 px de large pour une zone utile de 92,4 — **7,4 px dehors**. Aucun
   * coefficient ne l'évite : on ne coupe pas les mots, donc un mot plus large
   * que la zone déborde quel que soit le budget.
   *
   * La ligne est donc marquée `ajustee`, et le composant lui pose
   * `textLength` : c'est le NAVIGATEUR qui condense, avec les vraies métriques.
   */
  it('un mot plus large que la zone utile est marqué `ajustee`', () => {
    const [ligne] = enLignes('Mathématiques', 13.448, 92.4, 4, 700);
    expect(ligne.texte).toBe('Mathématiques');
    expect(
      ligne.ajustee,
      '⚠ sans contrainte, ce mot sort de la marge droite — mesuré 7,4 px dehors',
    ).toBe(true);
  });

  it('⚠ et un mot qui TIENT n’est PAS contraint — sinon tout le rendu dépendrait de mon estimation', () => {
    // Témoin d'ABSENCE : si `ajustee` était vrai partout, le cas ci-dessus ne
    // mesurerait rien, et chaque ligne serait déformée pour rien.
    const lignes = enLignes('Précis de droit', 13.448, 200, 4, 700);
    expect(lignes.every((l) => !l.ajustee)).toBe(true);
  });

  /**
   * ⭐ LE TIRET SEUL N'EST PAS UN MOT — et c'est une MESURE qui l'a décidé,
   * pas un goût.
   *
   * Sur les 481 notices de zinda : 58,2 % des titres portent un tiret isolé
   * (« Microfinance — perspectives contemporaines »), et **14 d'entre eux**
   * produisaient une ligne réduite au seul tiret sur la fiche. Après
   * rattachement : **0**, et la troncature a même baissé (9 → 8).
   */
  it('un tiret isolé est RATTACHÉ au mot suivant, jamais seul sur sa ligne', () => {
    const lignes = enLignes('Microfinance — perspectives contemporaines', 13.448, 92.4, 5, 700);
    expect(lignes.map((l) => l.texte)).not.toContain('—');
    expect(lignes.some((l) => l.texte.startsWith('— '))).toBe(true);
    // ⚠ Témoin d'ABSENCE : le rattachement ne doit pas PERDRE le tiret.
    expect(lignes.map((l) => l.texte).join(' ')).toContain('—');
  });

  it('⚠ un tiret qui TERMINE le titre se rattache au mot PRÉCÉDENT', () => {
    // Sinon il resterait seul, faute de suivant — le cas que le rattachement
    // au mot suivant ne peut pas traiter.
    const lignes = enLignes('Microfinance —', 13.448, 92.4, 5, 700);
    expect(lignes.map((l) => l.texte)).not.toContain('—');
    expect(lignes.map((l) => l.texte).join(' ')).toContain('—');
  });

  it('⚠ et l’ellipse reste JUSTE après rattachement — pas d’ellipse sur un texte complet', () => {
    // Le texte attendu se recompose sur la MÊME tokenisation : comparer au
    // découpage brut ferait croire qu'un mot manque, et poserait une ellipse
    // sur un titre complet.
    const lignes = enLignes('Microfinance — perspectives', 13.448, 400, 5, 700);
    expect(lignes.map((l) => l.texte).join('')).not.toContain('…');
  });

  it('la largeur estimée suit la GRAISSE, et c’est une mesure du navigateur', () => {
    // 700 est plus large que 400 : mesuré 0,530 contre 0,507 sur la même
    // phrase. Un coefficient unique sous-estimait le titre en gras.
    expect(largeurEstimee('abcdefgh', 10, 700)).toBeGreaterThan(
      largeurEstimee('abcdefgh', 10, 400),
    );
  });
});

describe('la contrainte de largeur ARRIVE DANS LE SVG', () => {
  /**
   * ⚠ CE CAS A ÉTÉ AJOUTÉ PAR UN CONTRÔLE NÉGATIF QUI N'A PAS MORDU.
   *
   * Retirer `textLength` du `<tspan>` du titre laissait la suite VERTE : le
   * drapeau `ajustee` était éprouvé dans le PLAN, et rien n'affirmait que le
   * composant l'ÉMETTE. C'est la deuxième lecture d'une mutation qui ne casse
   * rien — le chemin vit, le test est juste, et la propriété n'est couverte
   * par aucune assertion. Le remède est d'AJOUTER, pas de corriger.
   */
  const LONG = { titre: 'Mathématiques appliquées', auteur: null, domaine: 'sciences' };

  it('la ligne contrainte porte `textLength`, et les autres NON', () => {
    const html = renderToStaticMarkup(
      <CouvertureComposee notice={LONG} largeur={120} hauteur={164} />,
    );
    const tspans = html.match(/<tspan[^>]*>[^<]*<\/tspan>/g) ?? [];
    expect(tspans.length, 'aucune ligne rendue').toBeGreaterThan(1);

    const avec = tspans.filter((t) => t.includes('textLength'));
    const sans = tspans.filter((t) => !t.includes('textLength'));
    // ⚠ LES DEUX CÔTÉS : au moins une contrainte, et au moins une libre.
    // Sans le second, un composant qui en poserait PARTOUT passerait.
    expect(avec.length, 'aucune ligne contrainte : le filet n’arrive pas au SVG').toBeGreaterThan(0);
    expect(sans.length, 'toutes les lignes contraintes : chaque ligne serait déformée').toBeGreaterThan(0);
    // Et la contrainte vaut la zone UTILE, pas une valeur au hasard.
    expect(avec[0]).toContain('lengthAdjust="spacingAndGlyphs"');
    const utile = 120 - 120 * 0.14 - 120 * 0.09;
    expect(avec[0]).toContain(`textLength="${utile}"`);
  });

  it('l’auteur aussi : une ligne d’auteur trop large est contrainte', () => {
    const html = renderToStaticMarkup(
      <CouvertureComposee
        notice={{ titre: 'Précis', auteur: 'Tiendrebeogo-Ouedraogo', domaine: 'droit' }}
        largeur={120}
        hauteur={164}
      />,
    );
    // Le nom fait 22 caractères en graisse 400 : au-delà de la zone utile.
    expect(html).toMatch(/<tspan[^>]*textLength[^>]*>Tiendrebeogo-Ouedraogo</);
  });
});

describe('le même document a la MÊME couverture sur tous les écrans', () => {
  it('la teinte ne dépend que du domaine, jamais de la taille de la vignette', () => {
    const n = { titre: 'Précis', domaine: 'medecine' };
    // 58×80 (liste), 160×220 (fiche) : deux tailles, une seule couleur.
    expect(planDeCouverture(n, 58, 80).teinte).toBe(planDeCouverture(n, 160, 220).teinte);
    expect(planDeCouverture(n, 58, 80).teinte).toBe(PALETTE[0]);
  });
});
