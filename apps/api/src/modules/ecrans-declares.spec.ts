import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES, MODULES_ACTIVABLES, MODULES_PAR_ID } from './registre-modules';

/**
 * LES ÉCRANS DÉCLARÉS EXISTENT, ET CEUX QUI CHANGENT SONT DÉCLARÉS.
 *
 * ⚠ CE TEST EXISTE PARCE QU'UNE RELECTURE A ÉCHOUÉ DEUX FOIS. La déclaration a
 * promis la disparition d'un « écran Amendes » qui n'a jamais existé, puis d'un
 * « Administration · Tarifs d'amendes » qui n'existe pas non plus — pendant que
 * la fiche d'adhérent, qui perd réellement sa section, n'était pas déclarée.
 *
 * Et le moment où cette liste s'affiche est le PIRE pour se tromper : la boîte
 * de confirmation, juste avant que l'administrateur éteigne un module pour
 * toute l'école. Elle nommait un écran imaginaire et taisait celui qui change.
 *
 * ⚠ IL FRANCHIT LA FRONTIÈRE DES WORKSPACES EN LECTURE SEULE, délibérément,
 * comme `fonctions-connues-de-l-api.spec.ts` le fait dans l'autre sens. Le
 * couplage existe dans les faits : la déclaration PARLE des écrans du front.
 * Autant qu'il soit vérifié.
 */
const APP = join(__dirname, '../../../web/app');

/** Toutes les pages du front, par chemin relatif à `app/`. */
function pagesDuFront(dossier = ''): string[] {
  const base = join(APP, dossier);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return pagesDuFront(join(dossier, e.name));
    return e.name === 'page.tsx' ? [dossier] : [];
  });
}

/**
 * Le code d'une page, commentaires retirés — PAR BLOCS, pas ligne à ligne.
 *
 * ⚠ LA NUANCE A ÉTÉ SIGNALÉE PAR LA SESSION FRONT, et elle est fondée même si
 * son cas ne mordait pas. Un filtre ligne à ligne retire bien `//`, `*` et
 * `/*` en début de ligne — donc les blocs `/** … *\/` classiques. Mais un
 * commentaire JSX multiligne a des lignes de CONTINUATION sans aucun
 * marqueur :
 *
 *     {(slash-star) Le paramétrage des rappels
 *         n'est PAS ici (star-slash)}
 *
 * Les deux lignes passent le filtre, et le garde signale une page qui dit
 * précisément le CONTRAIRE d'une dépendance. Mesuré : 2 occurrences avec le
 * filtre ligne à ligne, 0 avec le filtre par blocs.
 *
 * C'est exactement le défaut qui avait fait crier le détecteur de textes en dur
 * du front — même cause, autre outil. Et l'enjeu n'est pas la gêne : un
 * détecteur qui signale du code correct se fait désactiver, et ne sert plus le
 * jour où il a raison. Celui-ci vient de prouver qu'il a raison.
 */
export function retirerCommentaires(source: string): string {
  return source
    // Blocs `/* … *\/` et `{/* … *\/}`, y compris sur plusieurs lignes.
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    // Puis les lignes `//`.
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

function codeDeLaPage(chemin: string): string {
  const f = join(APP, chemin, 'page.tsx');
  if (!existsSync(f)) return '';
  return retirerCommentaires(readFileSync(f, 'utf-8'));
}

describe('écrans déclarés — le front est là où on le croit', () => {
  const pages = pagesDuFront();

  it('le relevé voit bien les pages du front (témoin positif)', () => {
    // Sans ce témoin, un chemin d'accès faux rendrait une liste vide et TOUS
    // les tests ci-dessous passeraient au vert en ne vérifiant rien — le
    // défaut exact que ce fichier existe pour empêcher.
    expect(pages.length).toBeGreaterThanOrEqual(15);
    expect(pages).toContain('guichet');
    expect(pages).toContain(join('admin', 'adherents', '[id]'));
    // Et un témoin NÉGATIF nommé : l'écran que la déclaration promettait à tort.
    expect(pages).not.toContain(join('admin', 'tarifs'));
  });

  it('⚠ CHAQUE écran déclaré par un module EXISTE dans apps/web', () => {
    const fantomes: string[] = [];
    for (const m of MODULES) {
      for (const e of m.ecrans) {
        const attendu = e.chemin.split('/').join('/');
        if (!pages.includes(attendu.split('/').join('/'))) {
          // `join` normalise les séparateurs selon la plateforme.
          if (!pages.includes(e.chemin.split('/').reduce((a, b) => join(a, b)))) {
            fantomes.push(`${m.id} → ${e.chemin}`);
          }
        }
      }
    }
    expect(fantomes, 'écrans déclarés introuvables dans apps/web').toEqual([]);
  });

  it('⚠ CHAQUE page qui parle d’un module est DÉCLARÉE par lui', () => {
    // Le sens inverse, et c'est celui qui manquait : la fiche d'adhérent perdait
    // sa section sans être déclarée, donc la confirmation la taisait.
    const oublis: string[] = [];
    for (const id of MODULES_ACTIVABLES) {
      const m = MODULES_PAR_ID.get(id)!;
      if (!m.motifEcrans) continue;
      const declarees = new Set(
        m.ecrans.map((e) => e.chemin.split('/').reduce((a, b) => join(a, b))),
      );
      const motif = new RegExp(m.motifEcrans, 'i');
      for (const page of pages) {
        if (!motif.test(codeDeLaPage(page))) continue;
        if (!declarees.has(page)) oublis.push(`${id} → ${page} parle de « ${m.motifEcrans} »`);
      }
    }
    expect(oublis, 'pages concernées mais non déclarées').toEqual([]);
  });

  it('chaque module activable déclare au moins un endroit, et chacun dit QUOI', () => {
    for (const id of MODULES_ACTIVABLES) {
      const m = MODULES_PAR_ID.get(id)!;
      expect(m.ecrans.length, id).toBeGreaterThan(0);
      for (const e of m.ecrans) {
        expect(e.quoi.length, `${id} → ${e.chemin}`).toBeGreaterThan(5);
        expect(e.chemin, `${id}`).not.toMatch(/^\//); // relatif à app/, jamais absolu
      }
    }
  });

  it('le NOYAU ne déclare aucun écran — il ne s’éteint pas', () => {
    for (const m of MODULES.filter((x) => x.noyau)) {
      expect(m.ecrans, m.id).toEqual([]);
    }
  });
});

describe('écrans déclarés — le retrait des commentaires tient sur le JSX', () => {
  it('⚠ un commentaire JSX MULTILIGNE est retiré EN ENTIER', () => {
    // Le cas signalé par la session front. Les lignes de continuation d'un
    // commentaire JSX ne portent AUCUN marqueur : un filtre ligne à ligne les
    // garde, et le garde signale alors une page qui dit le contraire d'une
    // dépendance.
    const source = [
      'export default function Page() {',
      '  return (',
      '    <div>',
      '      {/* Le paramétrage des rappels',
      "          n'est PAS ici — voir /admin/rappels */}",
      '      <p>Règles de prêt</p>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    expect(retirerCommentaires(source)).not.toMatch(/rappels?/i);
    // Et le code UTILE survit — un filtre trop large serait l'autre faute.
    expect(retirerCommentaires(source)).toContain('Règles de prêt');
  });

  it('retire aussi les blocs `/* */` et les lignes `//`', () => {
    const source = ['/* amendes */', '// amendes', 'const x = 1;'].join('\n');
    expect(retirerCommentaires(source)).not.toMatch(/amendes/);
    expect(retirerCommentaires(source)).toContain('const x = 1;');
  });

  it('⚠ la page mise en cause par le front n’est PAS signalée', () => {
    // Témoin NOMMÉ : `admin/regles-de-pret` parle des rappels dans un
    // commentaire d'en-tête, pour dire qu'ils ne sont PAS là. La déclarer
    // serait faux — éteindre le module n'y retire rien.
    const code = codeDeLaPage(join('admin', 'regles-de-pret'));
    expect(code, 'la page doit être lisible').not.toBe('');
    expect(code).not.toMatch(/\brappels?\b/i);
  });
});
