/**
 * LE JETON D'AMORÇAGE NE SORT PAS — par sa FORME, ici ; par son EFFET, dans
 * `scripts/recette-assistant-installation.sh`.
 *
 * ⚠ CE QUE CE FICHIER NE PEUT PAS MESURER, et c'est dit plutôt que découvert :
 * qu'aucune ligne de journal ni aucun corps de réponse ne porte le clair. Ça
 * demande une API qui tourne — c'est la recette qui le fait, et elle le fait
 * par l'effet (`grep -F "$JETON" api.log`). Ce garde-ci tient l'autre moitié :
 * que la MÉCANIQUE ne puisse pas divulguer même si quelqu'un essaie.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  cheminDuJeton,
  effacerLeJeton,
  empreintesEgales,
  engendrerJeton,
  hacher,
} from './jeton-amorcage';

function dansUnBac<T>(action: () => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'jeton-'));
  const avant = process.env.GAFESO_JETON_INSTALLATION_FICHIER;
  process.env.GAFESO_JETON_INSTALLATION_FICHIER = join(dir, 'jeton.txt');
  try {
    return action();
  } finally {
    if (avant === undefined) delete process.env.GAFESO_JETON_INSTALLATION_FICHIER;
    else process.env.GAFESO_JETON_INSTALLATION_FICHIER = avant;
  }
}

describe('le jeton d’amorçage', () => {
  it('⭐ n’est PAS rendu à son appelant — qui ne peut donc pas le journaliser', () => {
    dansUnBac(() => {
      const rendu = engendrerJeton();
      // Le témoin porte sur les CLÉS : un champ ajouté demain qui porterait le
      // clair ferait tomber ce test, là où un `expect(rendu.clair).toBeUndefined()`
      // ne verrait pas un champ nommé autrement.
      expect(Object.keys(rendu).sort()).toEqual(['chemin', 'empreinte']);
      const clair = readFileSync(rendu.chemin, 'utf-8')
        .split('\n')
        .find((l) => l.length > 0 && !l.startsWith('#'))!;
      expect(clair.length).toBeGreaterThan(40);
      // et ce que l'appelant tient n'est PAS le clair
      expect(JSON.stringify(rendu)).not.toContain(clair);
      expect(rendu.empreinte).toBe(hacher(clair));
    });
  });

  it('le fichier porte les droits 0600 et l’avertissement de ne pas le coller', () => {
    dansUnBac(() => {
      const { chemin } = engendrerJeton();
      expect((statSync(chemin).mode & 0o777).toString(8)).toBe('600');
      const contenu = readFileSync(chemin, 'utf-8');
      expect(contenu).toContain('NE COLLEZ JAMAIS LE CONTENU');
      expect(contenu, 'il doit dire quoi donner à la place').toContain('CHEMIN');
    });
  });

  it('⚠ et il abaisse les droits d’un fichier qui existait DÉJÀ trop ouvert', () => {
    // writeFileSync(mode) n'applique le mode qu'à la CRÉATION : sans le chmod
    // explicite, un fichier laissé en 0644 par un passage précédent le resterait.
    dansUnBac(() => {
      const chemin = cheminDuJeton();
      writeFileSync(chemin, 'ancien', { mode: 0o644 });
      expect((statSync(chemin).mode & 0o777).toString(8)).toBe('644');
      engendrerJeton();
      expect((statSync(chemin).mode & 0o777).toString(8)).toBe('600');
    });
  });

  it('effacerLeJeton supprime le fichier, et ne lève pas s’il est déjà parti', () => {
    dansUnBac(() => {
      const { chemin } = engendrerJeton();
      effacerLeJeton();
      expect(() => readFileSync(chemin)).toThrow();
      expect(() => effacerLeJeton()).not.toThrow();
    });
  });

  it('⚠ le répertoire du chemin PAR DÉFAUT existe dans l’image de production', () => {
    // ⚠ CE TEST VIENT D'UN DÉFAUT RÉEL, trouvé en écrivant DEPLOY.md et PAS par
    // la recette : celle-ci surcharge le chemin vers un répertoire temporaire,
    // donc elle n'exerçait jamais le défaut `/app/etat`. Sans le `mkdir` du
    // Dockerfile, le PREMIER démarrage d'une instance neuve lève ENOENT.
    //
    // C'est « le clone frais vérifie la PRÉSENCE, pas l'EXÉCUTION » appliqué à
    // une recette : elle mesurait un chemin qui n'est pas celui de la production.
    const dockerfile = readFileSync(
      join(__dirname, '..', '..', 'Dockerfile'),
      'utf-8',
    );
    const avant = process.env.GAFESO_JETON_INSTALLATION_FICHIER;
    const avantDir = process.env.GAFESO_ETAT_DIR;
    delete process.env.GAFESO_JETON_INSTALLATION_FICHIER;
    delete process.env.GAFESO_ETAT_DIR;
    try {
      const defaut = cheminDuJeton();
      expect(defaut).toBe('/app/etat/jeton-installation.txt');
      const repertoire = defaut.replace(/\/[^/]+$/, '');
      expect(dockerfile, `l’image doit créer ${repertoire}`).toContain(
        `RUN mkdir -p ${repertoire}`,
      );
      // ⚠ Et AVANT le chown, sinon le répertoire appartient à root et l’API
      // tourne en `gafeso` : elle ne pourrait pas y écrire.
      expect(
        dockerfile.indexOf(`RUN mkdir -p ${repertoire}`),
        'le mkdir doit précéder le chown -R gafeso',
      ).toBeLessThan(dockerfile.indexOf('chown -R gafeso:gafeso /app'));
    } finally {
      if (avant !== undefined) process.env.GAFESO_JETON_INSTALLATION_FICHIER = avant;
      if (avantDir !== undefined) process.env.GAFESO_ETAT_DIR = avantDir;
    }
  });

  it('deux jetons successifs diffèrent — un redémarrage invalide le précédent', () => {
    dansUnBac(() => {
      const a = engendrerJeton().empreinte;
      const b = engendrerJeton().empreinte;
      expect(a).not.toBe(b);
    });
  });

  describe('la comparaison d’empreintes', () => {
    it('accepte l’égale et refuse les confusions PLAUSIBLES', () => {
      const bonne = hacher('abc');
      expect(empreintesEgales(bonne, hacher('abc'))).toBe(true);
      // ⚠ Témoins d'ABSENCE sur ce qu'une comparaison bâclée laisserait passer :
      expect(empreintesEgales(bonne, hacher('abd')), 'autre valeur').toBe(false);
      expect(empreintesEgales(bonne, bonne.slice(0, 32)), 'préfixe').toBe(false);
      expect(empreintesEgales(bonne, ''), 'chaîne vide').toBe(false);
      expect(empreintesEgales(bonne, bonne.toUpperCase()), 'casse').toBe(false);
      expect(empreintesEgales(bonne, bonne + ' '), 'espace ajouté').toBe(false);
    });
  });
});
