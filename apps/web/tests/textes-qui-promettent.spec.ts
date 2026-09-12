/**
 * ⚠ Un texte qui PROMET quelque chose est éprouvé sur sa PROPRIÉTÉ, pas sur sa
 * valeur.
 *
 * Un test de libellé prend spontanément cette forme :
 *
 *     expect(boite.textContent).toContain(LIBELLES.motDePasse.recours);
 *
 * Elle vérifie que l'écran affiche la bonne VARIABLE, et ne voit rien du
 * contenu : remplacer le recours par « réessayez plus tard » laisse la suite
 * verte. Deux fois en une heure le 12 septembre 2026, un contrôle négatif a dû
 * l'attraper — donc ce n'est pas une inattention mais la forme PAR DÉFAUT, et
 * une forme par défaut ne se corrige pas par la vigilance.
 *
 * ⚠ CE GARDE EST BÂTI SUR LE MODÈLE DE `couverture-des-roles.spec.ts`, qui a
 * obligé la session backend à écrire une dette plutôt qu'à la contourner :
 *   1. le message d'échec dit QUOI FAIRE ;
 *   2. deux natures d'exception, jamais confondues, pour que la liste ne
 *      devienne pas l'endroit où l'on enterre les trouvailles ;
 *   3. il lit les VALEURS RÉELLES — les libellés et les fichiers de test, pas
 *      une copie ;
 *   4. une déclaration périmée est REFUSÉE : la dette se rappelle d'elle-même.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBELLES } from '@/lib/libelles';
import { TEXTES_QUI_PROMETTENT } from '@/lib/textes-qui-promettent';

const DOSSIER_TESTS = join(process.cwd(), 'tests');

const sourcesDeTest = readdirSync(DOSSIER_TESTS)
  .filter((f) => f.endsWith('.spec.ts') || f.endsWith('.spec.tsx'))
  .filter((f) => f !== 'textes-qui-promettent.spec.ts')
  .map((f) => readFileSync(join(DOSSIER_TESTS, f), 'utf8'));

/**
 * Les libellés déclarés dans `lib/libelles.ts`, valeur reconstituée.
 *
 * ⚠ POURQUOI CE N'EST PAS UNE REGEX D'UNE LIGNE. La première version exigeait
 * la valeur sur la MÊME ligne que la clé. Un libellé long s'écrit ici en
 * concaténation sur trois lignes — et il devenait alors invisible au relevé.
 * Constaté le 12 septembre 2026 sur `mesEncadrements.ficheNonLiee`, qui porte
 * « demandez » et que ce test aurait dû réclamer. Un relevé qui présume une
 * FORME ne voit pas ce qui s'en écarte, et son silence se lit comme « rien à
 * signaler ».
 */
function libellesDeLaSource(source: string): { nom: string; texte: string }[] {
  const lignes = source.split('\n');
  const trouves: { nom: string; texte: string }[] = [];
  for (let i = 0; i < lignes.length; i += 1) {
    const cle = /^\s*([a-zA-Zé][a-zA-Z0-9é]*):\s*(.*)$/.exec(lignes[i]);
    if (!cle) continue;
    // Un objet ou un tableau imbriqué n'est pas un libellé : ses entrées sont
    // relevées pour elles-mêmes au tour suivant.
    if (/^[{[]/.test(cle[2].trim())) continue;
    // La valeur court jusqu'à la première ligne qui la termine par une virgule.
    let brut = cle[2];
    let j = i;
    while (!/,\s*$/.test(brut) && j - i < 8 && j + 1 < lignes.length) {
      j += 1;
      brut += ' ' + lignes[j].trim();
    }
    // Toutes les portions citées, recollées : c'est le texte que lira l'usager.
    const texte = [...brut.matchAll(/(['`])((?:[^'`\\]|\\.)*)\1/g)].map((m) => m[2]).join('');
    if (texte !== '') trouves.push({ nom: cle[1], texte });
  }
  return trouves;
}

/** Valeur d'un chemin `a.b` dans LIBELLES — `null` si le chemin n'existe plus. */
function valeur(cle: string): unknown {
  return cle.split('.').reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    LIBELLES,
  ) ?? null;
}

/**
 * Une PROPRIÉTÉ de ce texte est-elle éprouvée quelque part ?
 *
 * ⚠ On cherche un `toMatch` dans le voisinage immédiat du chemin du libellé —
 * les deux formes en usage : l'assertion directe, et la variable intermédiaire
 * (`const texte = LIBELLES.x.y` suivi d'`expect(texte).toMatch`). Le voisinage
 * est volontairement court : au-delà, on ne mesure plus un lien mais une
 * coïncidence de fichier.
 */
function proprieteEprouvee(cle: string): boolean {
  return sourcesDeTest.some((src) => {
    const lignes = src.split('\n');
    for (let i = 0; i < lignes.length; i += 1) {
      if (!lignes[i].includes(`LIBELLES.${cle}`)) continue;
      const fenetre = lignes.slice(i, i + 4).join('\n');
      if (fenetre.includes('toMatch')) return true;
    }
    return false;
  });
}

describe('⚠ un texte qui promet est éprouvé sur sa propriété', () => {
  for (const t of TEXTES_QUI_PROMETTENT.filter((x) => x.nature === 'promet')) {
    it(`${t.cle} : une assertion de propriété existe`, () => {
      expect(
        proprieteEprouvee(t.cle),
        `Aucune assertion de PROPRIÉTÉ sur LIBELLES.${t.cle}.\n` +
          `Ce texte promet : ${t.raison}\n` +
          `Écrivez, dans le test de l'écran concerné :\n` +
          `    expect(LIBELLES.${t.cle}).toMatch(/…/);\n` +
          `Un \`toContain(LIBELLES.${t.cle})\` ne suffit PAS : il suit la ` +
          `dégradation du texte sans broncher.\n` +
          `Si ce texte ne promet finalement rien, passez-le en 'ressemblance' ` +
          `dans lib/textes-qui-promettent.ts avec sa raison.`,
      ).toBe(true);
    });
  }

  /**
   * ⚠ UNE DÉCLARATION PÉRIMÉE EST REFUSÉE. Sans cela, la liste survivrait aux
   * libellés qu'elle décrit, et on croirait garder ce qui n'existe plus — c'est
   * la mécanique qui a fait tomber `adherents.gerer` de `fonctions-sans-ecran`
   * le jour où son écran est né.
   */
  it('aucune déclaration ne survit à son libellé', () => {
    const disparus = TEXTES_QUI_PROMETTENT.filter((t) => valeur(t.cle) === null);
    expect(
      disparus.map((t) => t.cle),
      'Ces clés sont déclarées dans lib/textes-qui-promettent.ts et n’existent ' +
        'plus dans LIBELLES. Retirez-les : une déclaration périmée fait croire ' +
        'à une garantie qui ne porte plus sur rien.',
    ).toEqual([]);
  });

  /**
   * ⚠ TÉMOIN QUI COMPTE, sur un cas dont je connais la réponse : le relevé de
   * forme trouve huit textes à l'allure d'une promesse, et le registre en
   * déclare huit. Le jour où quelqu'un ajoute un neuvième texte de cette forme
   * sans le déclarer, ce compte tombe.
   */
  it('témoin — le registre couvre tous les textes de cette forme', () => {
    const source = readFileSync(join(process.cwd(), 'lib', 'libelles.ts'), 'utf8');
    // ⚠ ÉLARGI LE 12 SEPTEMBRE 2026, SUR UN CAS RÉEL. « présentez-vous à la
    // bibliothèque » est un geste adressé au lecteur, et le relevé ne le voyait
    // pas : son vocabulaire présumait une forme, et ce qui s'en écarte lui est
    // invisible. Le texte qui l'a révélé porte le recours d'un inscrit qui n'a
    // AUCUN autre canal.
    const GESTE = /\b(contactez|demandez|réactivez|cherchez|adressez|transmettez|présentez|rendez-vous|passez)\b/i;
    const RASSURE = /(aucune donnée|n[’']a été supprim|sont conservé|rien n[’']est supprim|est conservé)/i;
    const trouves = libellesDeLaSource(source)
      .filter((l) => GESTE.test(l.texte) || RASSURE.test(l.texte))
      .map((l) => l.nom);
    const declarees = new Set(TEXTES_QUI_PROMETTENT.map((t) => t.cle.split('.').pop()));
    const oublies = trouves.filter((n) => !declarees.has(n));
    expect(
      oublies,
      'Ces libellés ont la FORME d’une promesse — un geste adressé au lecteur, ' +
        'ou une réassurance — et ne sont pas déclarés dans ' +
        'lib/textes-qui-promettent.ts. Déclarez-les en "promet" (et écrivez ' +
        'l’assertion de propriété) ou en "ressemblance" avec la raison.',
    ).toEqual([]);
  });
});
