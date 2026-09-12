import { describe, expect, it } from 'vitest';
import {
  ETDMS_NAMESPACE,
  ETDMS_PREFIX,
  NIVEAUX_DIPLOME,
  PROFIL_ETDMS,
  exposableEnEtdms,
  versEtdms,
  type NoticeEtdms,
} from './etdms';
import { DEFENSE_RECORD_TYPES } from '../cataloging/description-profiles';

const BASE: NoticeEtdms = {
  id: 'rec-1',
  title: 'Droit foncier coutumier au Burkina Faso',
  titleComplement: null,
  publisher: null,
  summary: 'Étude des régimes fonciers coutumiers et de leur articulation au droit positif.',
  publishYear: 2023,
  language: 'fr',
  recordType: 'these',
  category: 'droit',
  profile: 'academique',
  profileData: { defenseUniversity: 'Université d’Exemple — Ouagadougou' },
  contributors: [
    { name: 'Ouédraogo, Awa', role: 'AUTEUR_PRINCIPAL', position: 0 },
    { name: 'Kaboré, Salif', role: 'DIRECTEUR_MEMOIRE', position: 1 },
  ],
  keywords: [{ keyword: { name: 'foncier' } }, { keyword: { name: 'coutume' } }],
};

const xml = (n: Partial<NoticeEtdms> = {}) =>
  versEtdms({ ...BASE, ...n }, 'oai:zinda:rec-1', '  ');

describe('ETD-MS — ce qu’il décrit et que Dublin Core ne peut pas', () => {
  it('⚠ DISTINGUE l’auteur du DIRECTEUR — c’est tout l’intérêt du format', () => {
    // En `oai_dc`, le directeur tombait dans `dc:contributor`, indistinct d'un
    // préfacier ou d'un traducteur. Un portail de thèses ne pouvait donc pas
    // savoir qui a dirigé le travail.
    const s = xml();
    expect(s).toContain('<creator>Ouédraogo, Awa</creator>');
    expect(s).toContain('<contributor role="advisor">Kaboré, Salif</contributor>');
    // Et l'auteur n'est PAS aussi émis comme directeur.
    expect(s).not.toContain('<contributor role="advisor">Ouédraogo, Awa</contributor>');
  });

  it('porte le bloc <degree>, qui n’a aucun équivalent en Dublin Core', () => {
    const s = xml();
    expect(s).toMatch(/<degree>[\s\S]*<\/degree>/);
    expect(s).toContain('<level>Doctoral</level>');
    expect(s).toContain('<discipline>droit</discipline>');
    expect(s).toContain('<grantor>Université d’Exemple — Ouagadougou</grantor>');
  });

  it('émet le résumé en <description>', () => {
    expect(xml()).toContain('<description>Étude des régimes fonciers');
  });

  it('déclare l’espace de noms et le schéma de la norme', () => {
    const s = xml();
    expect(s).toContain(`xmlns="${ETDMS_NAMESPACE}"`);
    expect(s).toContain('etdms.xsd');
  });

  it('l’ordre des contributeurs est celui de `position`', () => {
    const s = xml({
      contributors: [
        { name: 'Second', role: 'AUTEUR_SECONDAIRE', position: 2 },
        { name: 'Premier', role: 'AUTEUR_PRINCIPAL', position: 0 },
      ],
    });
    expect(s.indexOf('Premier')).toBeLessThan(s.indexOf('Second'));
  });
});

describe('ETD-MS — omettre n’est pas mentir, inventer le serait', () => {
  it('⚠ une notice académique SANS université sort quand même, sans <grantor>', () => {
    // 45 des 162 notices académiques du fonds n'ont pas d'université de
    // soutenance. Les retenir serait perdre 45 travaux ; inventer un grantor
    // serait faire dire à l'entrepôt une chose fausse qu'un portail
    // recopierait.
    const s = xml({ profileData: {} });
    expect(s).toContain('<title>');
    expect(s).not.toContain('<grantor>');
  });

  it('sans directeur, aucun <contributor role="advisor"> n’est émis', () => {
    // Le fonds de démonstration n'a QUE des AUTEUR_PRINCIPAL : ce cas est donc
    // le cas réel aujourd'hui, et il ne doit pas produire un élément vide.
    const s = xml({
      contributors: [{ name: 'Ouédraogo, Awa', role: 'AUTEUR_PRINCIPAL', position: 0 }],
    });
    expect(s).toContain('<creator>');
    expect(s).not.toContain('advisor');
  });

  it('⚠ un <degree> qui ne porterait RIEN n’est pas émis du tout', () => {
    // Un `<degree/>` vide annoncerait un diplôme dont on ne sait rien — pire
    // qu'une absence, parce qu'un portail le compterait comme renseigné.
    const s = xml({ recordType: 'memoire', category: null, profileData: {} });
    expect(s).not.toContain('<degree>');
    expect(s).toContain('<title>'); // la notice sort quand même
  });

  it('⚠ `memoire` n’a PAS de <level>, et c’est délibéré', () => {
    // Un mémoire peut être de licence comme de master selon l'établissement.
    // Deviner remplirait la case d'une valeur fausse dans la moitié des cas.
    const s = xml({ recordType: 'memoire' });
    expect(s).not.toContain('<level>');
    expect(s).toContain('<grantor>'); // le reste du degree sort
  });

  it('sans résumé, aucune <description> vide', () => {
    expect(xml({ summary: null })).not.toContain('<description>');
  });

  it('⚠ le lieu de soutenance n’est PAS glissé ailleurs', () => {
    // ETD-MS n'a pas d'élément pour le lieu. Le verser dans `description` ou
    // dans un `grantor` composite le rendrait inexploitable ET mensonger.
    const s = versEtdms(
      { ...BASE, profileData: { defenseUniversity: 'U', defensePlace: 'Amphi B' } },
      'oai:zinda:rec-1',
      '  ',
    );
    expect(s).not.toContain('Amphi B');
  });
});

describe('ETD-MS — le vocabulaire des niveaux suit celui des types', () => {
  it('témoin : chaque niveau déclaré porte sur un type de soutenance réel', () => {
    expect(Object.keys(NIVEAUX_DIPLOME).length).toBeGreaterThan(0);
    for (const type of Object.keys(NIVEAUX_DIPLOME)) {
      expect(
        (DEFENSE_RECORD_TYPES as readonly string[]).includes(type),
        `${type} n’est pas un type de soutenance`,
      ).toBe(true);
    }
  });

  it('⚠ les types de soutenance SANS niveau sont connus et assumés', () => {
    // Le compte exact, pas « au moins un » : si un type nouveau apparaissait
    // sans qu'on décide de son niveau, ce test le dirait.
    const sansNiveau = (DEFENSE_RECORD_TYPES as readonly string[]).filter(
      (t) => !(t in NIVEAUX_DIPLOME),
    );
    expect(sansNiveau).toEqual(['memoire']);
  });
});

describe('ETD-MS — l’exposabilité se juge sur le PROFIL', () => {
  it('seul le profil académique est exposable', () => {
    expect(exposableEnEtdms({ profile: PROFIL_ETDMS })).toBe(true);
    expect(exposableEnEtdms({ profile: 'bibliographique' })).toBe(false);
    // Fail-closed sur un profil inconnu : mieux refuser que promettre une thèse.
    expect(exposableEnEtdms({ profile: 'archives' })).toBe(false);
  });

  it('le préfixe est celui de la norme', () => {
    expect(ETDMS_PREFIX).toBe('etdms');
    expect(ETDMS_NAMESPACE).toBe('http://www.ndltd.org/standards/metadata/etdms/1.0/');
  });
});
