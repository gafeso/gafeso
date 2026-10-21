import { describe, expect, it } from 'vitest';
import {
  actionsDisponibles,
  NIVEAUX_DE_SCAN,
  phraseDEcheance,
  phraseDeDisponibilite,
  phraseDEmplacement,
  reponseDeScan,
  type ExemplaireScanne,
  type NiveauDeScan,
} from './scan-par-niveau';

/**
 * ⭐⭐ AUCUN CHAMP RÉSERVÉ NE QUITTE L'API VERS UN COMPTE QUI N'Y A PAS DROIT.
 *
 * ⚠ ET L'ÉPREUVE PORTE SUR L'ABSENCE DE LA CLÉ, jamais sur sa valeur.
 * `expect(r.emprunteur).toBeUndefined()` passerait aussi si la clé existait
 * avec `undefined` dedans — et `JSON.stringify` la retirerait, ce qui donne
 * l'illusion que tout va bien jusqu'au jour où quelqu'un lit l'objet avant
 * sérialisation (un journal, un cache, un test). `in` ne se trompe pas.
 */

const maintenant = new Date('2026-10-14T10:00:00.000Z');

const exemplaire = (p: Partial<ExemplaireScanne> = {}): ExemplaireScanne => ({
  id: 'i1',
  codeBarre: 'ZIN-004812',
  statut: 'AVAILABLE',
  emplacement: 'Salle 2 · Rayon H',
  cote: '340 ILB',
  pret: null,
  ...p,
});

const prete = exemplaire({
  statut: 'CHECKED_OUT',
  pret: { echeance: new Date('2026-10-20T10:00:00.000Z'), emprunteur: 'Traoré, Awa' },
});

const composer = (niveau: NiveauDeScan, exemplaires = [prete]) =>
  reponseDeScan({
    niveau,
    record: { id: 'r1', title: 'Droit constitutionnel' },
    exemplaires,
    exemplaire: exemplaires[0] ?? null,
    lectureEnLigne: true,
    maintenant,
  });

describe('⭐ le scan par niveau : le serveur décide de ce qui part', () => {
  it('⚠ TÉMOIN : les trois niveaux sont éprouvés, pas deux', () => {
    // Sans ce compte, ajouter un quatrième niveau sans l'éprouver passerait.
    expect(NIVEAUX_DE_SCAN).toEqual(['visiteur', 'etudiant', 'bibliothecaire']);
  });

  describe('visiteur', () => {
    const r = composer('visiteur');
    it('reçoit la notice et la disponibilité', () => {
      expect(r.disponibilite).toBe('Le seul exemplaire est indisponible');
      expect(r.record).toBeTruthy();
    });
    it('🔴 n’a PAS d’emplacement — la clé est ABSENTE, pas nulle', () => {
      expect('emplacement' in r, 'un visiteur n’apprend rien de l’intérieur du bâtiment').toBe(
        false,
      );
    });
    it('🔴 n’a PAS d’exemplaire ni d’emprunteur — clés ABSENTES', () => {
      expect('exemplaire' in r).toBe(false);
      expect('emprunteur' in r).toBe(false);
    });
    it('n’a AUCUNE action : la lecture en ligne se décide par le droit', () => {
      expect(r.actions).toEqual([]);
    });
  });

  describe('étudiant', () => {
    const brut = composer('etudiant');
    // ⚠ On RESTREINT par le discriminant, comme le ferait un vrai client : lire
    // `r.emplacement` sur l'union ne compile pas, et c'est le but de l'union.
    if (brut.niveau !== 'etudiant') throw new Error('niveau inattendu');
    const r = brut;
    it('reçoit l’emplacement — c’est ce qui l’envoie au bon rayon', () => {
      expect(r.emplacement).toBe('Salle 2 · Rayon H · Cote 340 ILB');
    });
    it('🔴 n’a PAS le code-barres de l’exemplaire — clé ABSENTE', () => {
      expect('exemplaire' in r, 'le code-barres sert les gestes de guichet').toBe(false);
    });
    it('🔴 n’a PAS l’emprunteur — clé ABSENTE, c’est une donnée personnelle', () => {
      expect('emprunteur' in r).toBe(false);
    });
    it('peut lire si le droit le permet', () => {
      expect(r.actions).toEqual(['lire']);
    });
  });

  describe('bibliothécaire', () => {
    const brut = composer('bibliothecaire');
    if (brut.niveau !== 'bibliothecaire') throw new Error('niveau inattendu');
    const r = brut;
    it('reçoit l’exemplaire et son statut en clair', () => {
      expect(r).toMatchObject({ exemplaire: { codeBarre: 'ZIN-004812', statut: 'En prêt' } });
    });
    it('reçoit l’emprunteur et une ÉCHÉANCE EN PHRASE', () => {
      expect(r).toMatchObject({
        emprunteur: { nom: 'Traoré, Awa', echeance: 'À rendre le 2026-10-20' },
      });
    });
    it('🔴 et JAMAIS l’identifiant, le courriel ni le téléphone', () => {
      // ⚠ Le relevé porte sur la charge ENTIÈRE, pas sur une liste de noms de
      // champs : un champ ajouté demain serait pris, là où une liste ne verrait
      // que ce à quoi on a pensé.
      const plat = JSON.stringify(r);
      for (const interdit of ['@', 'patronId', 'patron_id', 'email', 'telephone', 'phone']) {
        expect(plat.includes(interdit), `« ${interdit} » ne doit pas sortir`).toBe(false);
      }
    });
    it('⚠ sans prêt en cours, la clé emprunteur est ABSENTE — pas nulle', () => {
      const r2 = composer('bibliothecaire', [exemplaire()]);
      expect('emprunteur' in r2).toBe(false);
    });
    it('⚠ un prêt SANS nom exploitable ne fabrique pas un emprunteur vide', () => {
      // Mesuré sur ce produit : un adhérent sans compte lié n'a pas de nom
      // composable. Un « — » affiché comme un emprunteur serait un faux.
      const r3 = composer('bibliothecaire', [
        exemplaire({ statut: 'CHECKED_OUT', pret: { echeance: maintenant, emprunteur: null } }),
      ]);
      expect('emprunteur' in r3).toBe(false);
    });
  });

  /**
   * ⭐⭐ UNE NOTICE SANS EXEMPLAIRE — trouvé par le mobile contre le serveur
   * réel le 20 octobre 2026, et AUCUN cas de ce fichier ne l'éprouvait : les
   * 21 cas précédents composent tous avec au moins un exemplaire.
   *
   * ⚠ LE DÉFAUT N'ÉTAIT PAS UNE VALEUR FAUSSE, C'ÉTAIT UNE CLÉ QUI N'AURAIT
   * PAS DÛ EXISTER : `emplacement: "Emplacement non renseigné"`,
   * `exemplaire: { codeBarre: '', statut: 'Inconnu' }`. Le client affiche ce
   * qu'il reçoit — c'est sa règle, et elle est juste — donc ces trois
   * affirmations partaient vers un lecteur pour un livre qui n'a tout
   * simplement aucun exemplaire. « Inconnu » affirme un statut qui existe et
   * qu'on ignore ; l'absence n'affirme rien.
   */
  describe('⭐ une notice SANS AUCUN exemplaire', () => {
    it('étudiant : la clé emplacement est ABSENTE, pas un texte de remplissage', () => {
      const brut = composer('etudiant', []);
      expect('emplacement' in brut, JSON.stringify(brut)).toBe(false);
    });
    it('bibliothécaire : les clés emplacement ET exemplaire sont ABSENTES', () => {
      const brut = composer('bibliothecaire', []);
      expect('emplacement' in brut, JSON.stringify(brut)).toBe(false);
      expect('exemplaire' in brut, JSON.stringify(brut)).toBe(false);
      expect('emprunteur' in brut).toBe(false);
    });
    it('la disponibilité reste honnête : « Aucun exemplaire physique »', () => {
      for (const n of NIVEAUX_DE_SCAN) {
        expect(composer(n, []).disponibilite).toBe('Aucun exemplaire physique');
      }
    });
  });

  /**
   * ⭐⭐ LA LISTE EXACTE DES CLÉS, PAR NIVEAU — et c'est un contrôle négatif qui
   * m'a obligé à l'écrire ainsi.
   *
   * 🔴 Ma première épreuve comparait la DIFFÉRENCE entre deux niveaux voisins :
   * « ce que `bibliothecaire` a en plus ne doit pas être chez `etudiant` ».
   * J'ai ajouté `emprunteurNom` au niveau ÉTUDIANT pour l'éprouver — exactement
   * la fuite qu'elle existe pour attraper — et les VINGT cas sont restés VERTS.
   *
   * La cause est structurelle : un champ qui n'apparaît QU'EN BAS n'est dans
   * aucune différence, donc aucune comparaison de niveaux ne le voit. C'est la
   * même famille que « un témoin qui AGRÈGE masque ce qu'il devrait désigner ».
   *
   * ⭐ La forme qui tient n'est pas une différence : c'est une liste EXACTE.
   * Toute clé ajoutée à n'importe quel niveau fait tomber le cas, et le message
   * dit laquelle. C'est une obligation, pas un balayage.
   */
  const CLES_PAR_NIVEAU: Record<NiveauDeScan, string[]> = {
    visiteur: ['actions', 'disponibilite', 'niveau', 'record'],
    etudiant: ['actions', 'disponibilite', 'emplacement', 'niveau', 'record'],
    bibliothecaire: [
      'actions',
      'disponibilite',
      'emplacement',
      'emprunteur',
      'exemplaire',
      'niveau',
      'record',
    ],
  };

  it('⭐ chaque niveau sert EXACTEMENT ses clés — une clé de plus fait tomber', () => {
    for (const n of NIVEAUX_DE_SCAN) {
      expect(
        Object.keys(composer(n)).sort(),
        `« ${n} » ne sert pas exactement les clés déclarées. Une clé en plus est ` +
          'une DIVULGATION ; une clé en moins est un champ perdu. Les deux se ' +
          'disent ici.',
      ).toEqual(CLES_PAR_NIVEAU[n]);
    }
  });

  it('⭐ et aucune clé réservée à un niveau SUPÉRIEUR n’apparaît plus bas', () => {
    for (let i = 0; i < NIVEAUX_DE_SCAN.length - 1; i += 1) {
      const bas = NIVEAUX_DE_SCAN[i];
      const haut = NIVEAUX_DE_SCAN[i + 1];
      const reservees = CLES_PAR_NIVEAU[haut].filter((k) => !CLES_PAR_NIVEAU[bas].includes(k));
      expect(reservees.length, `« ${haut} » doit voir plus que « ${bas} »`).toBeGreaterThan(0);
      for (const k of reservees) {
        expect(
          k in composer(bas),
          `« ${k} » est réservé à ${haut} et figure dans la réponse de ${bas}`,
        ).toBe(false);
      }
    }
  });

  it('⚠ `niveau` est INDICATIF : il ne pilote aucun affichage', () => {
    // Le contrat mobile le dit : l'app n'en déduit aucun contenu d'écran. Ce
    // cas fixe la conséquence côté serveur — le niveau ne doit PAS être la
    // seule chose qui change entre deux réponses, sinon il pilote de fait.
    const v = composer('visiteur');
    const e = composer('etudiant');
    const difference = Object.keys(e).filter((k) => !Object.keys(v).includes(k));
    expect(difference, 'si seul `niveau` changeait, il piloterait l’affichage').not.toEqual([]);
  });
});

describe('les phrases, parce que le serveur a l’heure de référence', () => {
  it('la disponibilité se dit, elle ne se compte pas', () => {
    expect(phraseDeDisponibilite([])).toBe('Aucun exemplaire physique');
    expect(phraseDeDisponibilite([exemplaire()])).toBe('1 exemplaire disponible');
    expect(phraseDeDisponibilite([exemplaire(), exemplaire()])).toBe('2 exemplaires disponibles');
    expect(phraseDeDisponibilite([exemplaire(), prete])).toBe('1 exemplaire sur 2 disponible');
    expect(phraseDeDisponibilite([prete, prete])).toBe('Aucun des 2 exemplaires n’est disponible');
  });

  it('⚠ l’échéance dit le RETARD, et le serveur le calcule', () => {
    const j = (n: number) => new Date(Date.UTC(2026, 9, 14 + n, 10));
    expect(phraseDEcheance(j(0), maintenant)).toBe('À rendre aujourd’hui (2026-10-14)');
    expect(phraseDEcheance(j(1), maintenant)).toBe('À rendre demain (2026-10-15)');
    expect(phraseDEcheance(j(6), maintenant)).toBe('À rendre le 2026-10-20');
    expect(phraseDEcheance(j(-1), maintenant)).toBe('En retard de 1 jour (échéance 2026-10-13)');
    expect(phraseDEcheance(j(-11), maintenant)).toBe('En retard de 11 jours (échéance 2026-10-03)');
  });

  it('⚠ un emplacement VIDE le dit, il ne rend pas une phrase tronquée', () => {
    expect(phraseDEmplacement(null)).toBe('Emplacement non renseigné');
    expect(phraseDEmplacement(exemplaire({ emplacement: null, cote: null }))).toBe(
      'Emplacement non renseigné',
    );
    expect(phraseDEmplacement(exemplaire({ emplacement: null }))).toBe('Cote 340 ILB');
  });

  it('⭐ aucune action n’est listée sans sa route : seule `lire` existe', () => {
    expect(actionsDisponibles('bibliothecaire', { lectureEnLigne: true })).toEqual(['lire']);
    expect(actionsDisponibles('bibliothecaire', { lectureEnLigne: false })).toEqual([]);
    expect(actionsDisponibles('visiteur', { lectureEnLigne: true })).toEqual([]);
    // ⚠ TÉMOIN D'ABSENCE : le jour où `preter` ou `reserver` apparaît ici sans
    // que sa route existe, ce cas tombe. L'app afficherait un bouton qui
    // explique qu'il ne marche pas — un bouton sans effet.
    for (const n of NIVEAUX_DE_SCAN) {
      for (const a of actionsDisponibles(n, { lectureEnLigne: true })) {
        expect(['lire'], `« ${a} » est listée sans route`).toContain(a);
      }
    }
  });
});
