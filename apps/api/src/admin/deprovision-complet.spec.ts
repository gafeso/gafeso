import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIGNES_PARTAGEES, MODELES_A_SUPPRIMER, proprietePrisma } from './lignes-partagees-d-une-ecole';

/**
 * ⚠ UNE ÉCOLE SUPPRIMÉE NE LAISSE RIEN DANS `public`.
 *
 * *Posé le 14 septembre 2026, après avoir trouvé en base deux écoles disparues
 * dont le socle et les règles d'accès étaient restés.*
 *
 * ⚠ LE GESTE QUI VIOLERA CETTE PROPRIÉTÉ, écrit d'avance parce qu'il est
 * raisonnable : quelqu'un ajoutera un modèle partagé — un quota, un connecteur,
 * une licence d'établissement — avec un `tenantId`, et **ne pensera pas à la
 * déprovision**. C'est exactement ce qui s'est passé cinq fois : rien n'a
 * échoué, parce que rien ne défendait ces tables. Une clé étrangère RESTRICT
 * l'aurait signalé ; ces cinq-là n'en avaient pas.
 *
 * Ce test ne demande pas d'y penser : il REFUSE le modèle non déclaré, et son
 * message dit les deux issues.
 */
describe('Déprovision : aucune ligne d’école ne survit dans `public`', () => {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf-8');

  /** Tout modèle du schéma portant une colonne `tenantId`. Lu dans la SOURCE. */
  const modelesDuSchema = [...schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)]
    .filter(([, , corps]) => /^\s*tenantId\s+String/m.test(corps))
    .map(([, nom]) => nom)
    .sort();

  it('⚠ l’extracteur voit bien le schéma — témoins de présence ET d’absence', () => {
    // PRÉSENCE : deux modèles dont je SAIS qu'ils portent un tenantId.
    expect(modelesDuSchema).toContain('Collection');
    expect(modelesDuSchema).toContain('ReminderLog');
    // ABSENCE, et sur la confusion PLAUSIBLE : `Tenant` est le modèle de
    // l'école elle-même — il porte un `id`, jamais un `tenantId`. Un extracteur
    // trop lâche (qui chercherait « tenant ») le prendrait.
    expect(modelesDuSchema).not.toContain('Tenant');
    // COMPTE EXACT : un neuvième modèle oblige à revenir ici et à le classer.
    expect(
      modelesDuSchema.length,
      'un modèle partagé est apparu ou a disparu — classez-le dans LIGNES_PARTAGEES',
    ).toBe(8);
  });

  it('⚠ chaque modèle partagé est DÉCLARÉ — supprimé, ou conservé avec son motif', () => {
    const absents = modelesDuSchema.filter((m) => !(m in LIGNES_PARTAGEES));
    expect(
      absents,
      `Modèle(s) partagé(s) non déclaré(s) : ${absents.join(', ')}.\n` +
        'Deux issues, et une seule est un oubli :\n' +
        '  · la ligne appartient à l’école → { sort: "supprimee", motif: … } ;\n' +
        '  · elle doit lui survivre (pièce comptable, trace légale) → ' +
        '{ sort: "conservee", motif: … } en disant ce qu’il en coûte.\n' +
        '⚠ Ne pas déclarer, c’est laisser en base des lignes que plus aucune ' +
        'route ne peut lire — et parfois des données personnelles.',
    ).toEqual([]);
  });

  it('⚠ une déclaration PÉRIMÉE est refusée', () => {
    // Le jour où un modèle disparaît du schéma, sa ligne ici devient fausse.
    const fantomes = Object.keys(LIGNES_PARTAGEES).filter((m) => !modelesDuSchema.includes(m));
    expect(fantomes, `déclaré(s) mais absent(s) du schéma : ${fantomes.join(', ')}`).toEqual([]);
  });

  it('⚠ un modèle CONSERVÉ dit ce qu’il en coûte, sinon c’est un oubli qui s’habille', () => {
    for (const [modele, regle] of Object.entries(LIGNES_PARTAGEES)) {
      if (regle.sort !== 'conservee') continue;
      // Sans cette exigence, `conservee` devient l'endroit où l'on enterre les
      // modèles qu'on n'a pas voulu traiter — une ligne, et le test se tait.
      expect(regle.motif.length, `${modele} : un motif de conservation doit s’expliquer`).toBeGreaterThan(80);
    }
  });

  it('⚠ la déprovision ne RÉÉCRIT PAS la liste en dur — elle parcourt la déclaration', () => {
    const service = readFileSync(join(__dirname, 'admin.service.ts'), 'utf-8');
    const bloc = service.slice(service.indexOf('async deprovisionTenant'));
    const corps = bloc.slice(0, bloc.indexOf('\n  }\n'));

    // C'est la régression exacte à barrer : réintroduire `tx.collection.deleteMany(…)`
    // à la main, et oublier le modèle suivant comme les cinq précédents.
    const enDur = modelesDuSchema.filter((m) =>
      new RegExp(`tx\\.${proprietePrisma(m)}\\.deleteMany`).test(corps),
    );
    expect(
      enDur,
      `déprovision : ${enDur.join(', ')} supprimé(s) en dur. La liste vit dans ` +
        'LIGNES_PARTAGEES — une seconde liste diverge au prochain modèle.',
    ).toEqual([]);
    expect(corps, 'la déprovision doit parcourir MODELES_A_SUPPRIMER').toContain('MODELES_A_SUPPRIMER');
  });

  it('⚠ elle RAPPORTE ce qu’elle a retiré, table par table', () => {
    const service = readFileSync(join(__dirname, 'admin.service.ts'), 'utf-8');
    // « fait » sans dire quoi ne se vérifie pas — c'est la forme qui a laissé
    // passer cinq tables pendant des mois.
    expect(service).toMatch(/return \{ deprovisioned: true, slug, retire \}/);
  });

  it('⚠ les modèles à supprimer sont ordonnés fille → mère', () => {
    // `access_rules` référence `collections` : l'inverse échouerait sur la
    // contrainte, et la déprovision entière serait annulée.
    expect(MODELES_A_SUPPRIMER.indexOf('AccessRule')).toBeLessThan(
      MODELES_A_SUPPRIMER.indexOf('Collection'),
    );
  });
});
