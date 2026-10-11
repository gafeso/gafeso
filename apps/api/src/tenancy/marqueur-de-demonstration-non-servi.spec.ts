import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { PrismaService } from '../prisma/prisma.service';
import { TenancyService } from './tenancy.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

/**
 * ⚠ CE GARDE MESURE UN EFFET, PAS UNE FORME.
 *
 * `estInstanceDeDemonstration` est l'une des TROIS conditions cumulatives qui
 * autorisent `remplacer-documents-demo.mjs` à réécrire le fonds d'une instance
 * de démonstration. Ce n'est pas un réglage : c'est une clé.
 *
 * ## ⭐ LE SCÉNARIO QUI LE VIOLERA, écrit ici parce qu'il est RAISONNABLE
 *
 * `PATCH /tenancy/settings` rend la ligne `tenant_settings` entière. Le jour où
 * ce marqueur y reparaît — un `select` élargi, un `omit` retiré, une
 * réécriture de `updateSettings` —, le front le verra dans sa réponse. Et le
 * geste suivant est naturel, utile, et personne ne le relira : **une case à
 * cocher « instance de démonstration » dans l'écran d'apparence**, à côté des
 * couleurs.
 *
 * Cette case effondrerait trois conditions cumulatives en UN clic. Le marquage
 * se pose par une commande SQL documentée (`DEPLOY.md`), par l'exploitant, sur
 * la machine de la démonstration — jamais par un écran.
 *
 * ## Ce qui est mesuré
 *
 * Les DEUX chemins de retour de `updateSettings` — celui sans pages légales
 * (`upsert`) et celui avec (`ecrirePagesLegales`) —, avec une doublure qui
 * RETOURNE le marqueur. S'il ressort, le garde tombe.
 *
 * ⚠ La doublure le met exprès à `true` : un témoin sur `false` serait
 * indiscernable d'une clé absente, et c'est précisément la confusion plausible.
 */

const MARQUEUR = 'estInstanceDeDemonstration';

const SERVICE = readFileSync(join(__dirname, 'tenancy.service.ts'), 'utf-8');

/**
 * ⚠ LE RELEVÉ NE DOIT PAS LIRE L'INTÉRIEUR DES COMMENTAIRES.
 *
 * `tenancy.service.ts` donne en JSDoc la forme FAUTIVE d'un lire-vérifier-
 * écrire — `const actuel = await tx.tenantSettings.findUnique(…)`. Un relevé
 * posé sur la source brute l'accuse, c'est-à-dire qu'il signale du code qui
 * n'existe pas. Troisième fois que cette famille se reproduit ici, et le
 * témoin ci-dessous est la seule chose qui le dit.
 *
 * Les lignes de continuation d'un JSDoc portent ` * ` : le filtre est donc
 * exact pour cette forme, et il est LIGNE À LIGNE parce qu'on garde les
 * numéros pour les nommer dans le message d'échec.
 */
function sansCommentaires(source: string): string[] {
  return source.split('\n').map((l) => (/^\s*(\*|\/\*|\/\/)/.test(l) ? '' : l));
}

/** La ligne telle que la BASE la rend : marqueur COMPRIS, et à `true`. */
const LIGNE_DE_BASE = {
  id: 'set-1',
  tenantId: 't-1',
  primaryColor: '#0F2B46',
  secondaryColor: '#D97B2B',
  latticeEnabled: false,
  pagesLegales: { version: 3, mentionsLegales: null, confidentialite: null },
  [MARQUEUR]: true,
};

function doublurePrisma(): { service: TenancyService; appels: string[] } {
  const appels: string[] = [];
  const settings = {
    upsert: async () => {
      appels.push('upsert');
      return { ...LIGNE_DE_BASE };
    },
    findUnique: async () => ({ pagesLegales: LIGNE_DE_BASE.pagesLegales }),
    findUniqueOrThrow: async () => {
      appels.push('findUniqueOrThrow');
      return { ...LIGNE_DE_BASE };
    },
  };
  const prisma = {
    tenantSettings: settings,
    // La transaction s'exécute pour de vrai sur la doublure : c'est le chemin
    // « pages légales » qu'on veut traverser, pas une version simplifiée.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        tenantSettings: settings,
        // 1 ligne touchée → pas de conflit, on va jusqu'au retour.
        $executeRaw: async () => 1,
      }),
  } as unknown as PrismaService;
  return { service: new TenancyService(prisma), appels };
}

describe('le marqueur d’instance de démonstration ne sort d’aucune route', () => {
  it('⭐ chemin SANS pages légales : la réponse ne porte pas le marqueur', async () => {
    const { service, appels } = doublurePrisma();
    const dto = { primaryColor: '#123456' } as UpdateTenantSettingsDto;

    const reponse = (await service.updateSettings('t-1', dto)) as Record<string, unknown>;

    // ⚠ TÉMOIN : le chemin mesuré est bien celui-là.
    expect(appels, 'ce cas doit passer par upsert, sinon il ne mesure pas ce chemin').toEqual([
      'upsert',
    ]);
    expect(
      Object.keys(reponse),
      'le marqueur autorise une destruction : il ne sort d’aucune route',
    ).not.toContain(MARQUEUR);
    // Et la réponse n'est pas vide pour autant — sinon le garde passerait sur rien.
    expect(reponse.primaryColor, 'les réglages, eux, sortent bien').toBe('#0F2B46');
  });

  it('⭐ chemin AVEC pages légales : la réponse ne porte pas le marqueur', async () => {
    const { service, appels } = doublurePrisma();
    const dto = {
      pagesLegales: { mentionsLegales: { titre: 'T', corps: 'C', publiee: false } },
      pagesLegalesVersion: 3,
    } as unknown as UpdateTenantSettingsDto;

    const reponse = (await service.updateSettings('t-1', dto)) as Record<string, unknown>;

    expect(
      appels,
      'ce cas doit traverser l’écriture conditionnelle puis la relecture',
    ).toContain('findUniqueOrThrow');
    expect(
      Object.keys(reponse),
      'le marqueur autorise une destruction : il ne sort d’aucune route',
    ).not.toContain(MARQUEUR);
    expect(reponse.pagesLegales, 'les pages légales, elles, sortent bien').toBeTruthy();
  });

  it('⚠ TÉMOIN D’ABSENCE : la doublure porte bien le marqueur, donc il y avait quelque chose à retirer', () => {
    // Sans ce cas, un garde vert serait indiscernable d'un garde dont la
    // doublure n'aurait jamais contenu le champ.
    expect(Object.keys(LIGNE_DE_BASE)).toContain(MARQUEUR);
    expect(LIGNE_DE_BASE[MARQUEUR], 'à true : un false serait confondu avec une clé absente').toBe(
      true,
    );
  });

  it('⚠ TÉMOIN : le filtre de commentaires MORD — la forme fautive en JSDoc n’est plus lue', () => {
    // ⚠ Le motif doit être UNIQUE au commentaire : la même ouverture existe en
    // code réel ligne 262, sur plusieurs lignes. On prend donc la forme d'UNE
    // SEULE LIGNE, qui n'existe que dans l'exemple — et on affirme son unicité.
    const MOTIF =
      'const actuel = await tx.tenantSettings.findUnique({ where: { tenantId } });';
    expect(SERVICE.split(MOTIF).length - 1, 'le motif témoin doit être unique').toBe(1);
    // Elle est dans le fichier — c'est l'exemple qui explique le faux dispositif.
    expect(SERVICE, 'la forme fautive illustrée a disparu : ce témoin ne mesure plus rien').toContain(
      MOTIF,
    );
    // Et elle n'est PAS dans ce que le relevé lit.
    expect(sansCommentaires(SERVICE).join('\n')).not.toContain(MOTIF);
  });

  it('⚠ et AUCUNE route ne rend `tenant_settings` en entier par ailleurs', () => {
    // Le seul autre chemin qui lisait la ligne sans `select` était la relecture
    // de `ecrirePagesLegales`, couverte ci-dessus. Les autres lectures du
    // service sont toutes projetées — ce cas le vérifie sur la SOURCE, parce
    // qu'un appel futur sans `select` reparaîtrait là.
    const lignes = sansCommentaires(SERVICE);
    expect(lignes.length, 'témoin : le fichier a bien été LU').toBeGreaterThan(80);

    const appels = lignes
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(({ l }) => /tenantSettings\.(findUnique|findUniqueOrThrow|findFirst|upsert)\(/.test(l));

    // ⚠ TÉMOIN DE COMPTE : le relevé voit bien les appels. Un motif qui n'en
    // trouve aucun rendrait ce cas VERT sur l'ensemble vide.
    expect(appels.length, 'le relevé doit voir les lectures de tenant_settings').toBeGreaterThan(3);

    const nonProteges = appels
      // ⚠ Un appel dont le RÉSULTAT est jeté ne sert rien : `await tx.x.upsert(`
      // en tête d'instruction. Seuls comptent ceux qui s'échappent — `return`
      // ou une affectation.
      .filter(({ l }) => /(return|=)\s*(await\s+)?[a-z]+\.tenantSettings\./.test(l))
      .filter(({ n }) => {
        // Une projection `select:` ou le retrait du marqueur, dans les six
        // lignes qui suivent — c'est-à-dire AU SITE, pas chez un appelant.
        const fenetre = lignes.slice(n - 2, n + 6).join('\n');
        return !/select:|sansLeMarqueurDeDemonstration/.test(fenetre);
      });
    const sansSelect = nonProteges;

    expect(
      sansSelect.map(({ n }) => n),
      'une lecture de tenant_settings sans projection ni retrait du marqueur : ' +
        'ajoutez un `select`, ou enveloppez-la dans sansLeMarqueurDeDemonstration',
    ).toEqual([]);
  });
});
