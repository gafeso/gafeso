/**
 * 🔴 L'ADRESSE PUBLIQUE DE LA NOTICE — et le `null` silencieux qu'elle risque.
 *
 * `recordDetail` prend un `slug` OPTIONNEL : sans lui, `publicUrl` et
 * `identifiantPerenne` sortent à `null`. C'était le choix le moins invasif —
 * dix-huit sites d'appel, presque tous des tests — et il porte un risque exact
 * que ce dépôt a déjà payé : **une colonne SERVIE que personne ne remplit**.
 *
 * Les deux clés existeraient, bien typées, dans le contrat gelé, et vaudraient
 * `null` pour toujours. Rien ne le signalerait : l'écran afficherait une fiche
 * sans QR, et personne ne saurait dire si c'est voulu.
 *
 * ⭐ Ce garde exige donc que **les deux sites d'appel de PRODUCTION** passent le
 * slug. Le risque n'est pas laissé à la discipline.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adressePubliqueDeLaNotice, construireIdentifiant } from './identifiant-perenne';

const CONTROLEUR = readFileSync(join(__dirname, 'opac.controller.ts'), 'utf-8');

describe('🔴 L’adresse publique de la notice', () => {
  it('🔴 les DEUX appels de production passent le slug', () => {
    // On lit les appels entiers, parenthèse à parenthèse : un `resolved.slug`
    // ailleurs dans le fichier ne prouverait rien sur CET appel.
    const appels = CONTROLEUR.match(/this\.opac\.recordDetail\(([\s\S]*?)\n\s*\);/g) ?? [];
    expect(
      appels.length,
      'Le nombre d’appels à `recordDetail` a changé. Ce n’est pas un échec : ' +
        'c’est une convocation. Un appel NEUF doit passer le slug, sinon sa ' +
        'réponse portera `publicUrl: null` pour toujours.',
      // ⭐ 2 → 3 le 11 octobre 2026 : `/opac/scan`, qui résout une adresse
      // scannée. Le compte a fait son office — il a convoqué, et la question
      // qu'il posait était la bonne : cet appel neuf passe-t-il le slug ?
    ).toBe(3);
    for (const appel of appels) {
      // ⚠ Le slug est le QUATRIÈME argument — après `db`, `id`, `member`.
      //
      // 🔴 MA PREMIÈRE ÉCRITURE NE POUVAIT PAS ÉCHOUER. Elle coupait à
      // `indexOf('isMember(')` et cherchait `resolved.slug` après — or
      // `isMember(resolved.slug, …)` LE CONTIENT. La fenêtre le trouvait donc
      // toujours, y compris sur un appel où le quatrième argument manquait.
      // Le contrôle négatif l'a dit ; la relecture ne l'avait pas vu.
      //
      // On coupe donc après la PARENTHÈSE FERMANTE de `isMember(...)`.
      const debut = appel.indexOf('isMember(');
      const apresMembre = debut < 0 ? '' : appel.slice(appel.indexOf(')', debut) + 1);
      expect(
        apresMembre.includes('resolved.slug'),
        'Un appel à `recordDetail` ne passe pas le slug en quatrième ' +
          'argument. Sans lui, `publicUrl` et `identifiantPerenne` sortent à ' +
          '`null` — et c’est « une colonne SERVIE que personne ne remplit ».\n' +
          appel.slice(0, 220),
      ).toBe(true);
    }
  });

  it('⭐ l’adresse porte l’hôte de l’ÉCOLE, le schéma et le port de l’instance', () => {
    // Une instance multi-établissement sert plusieurs domaines : publier
    // l'hôte d'`APP_URL` pour toutes donnerait à chacune l'adresse d'une autre.
    expect(adressePubliqueDeLaNotice('http://localhost:3000', 'zinda.localhost', 'r1')).toBe(
      'http://localhost:3000/opac/r1'.replace('localhost:3000', 'zinda.localhost:3000'),
    );
    expect(adressePubliqueDeLaNotice('https://gafeso.org', 'bib.uo.bf', 'r1')).toBe(
      'https://bib.uo.bf/opac/r1',
    );
  });

  it('⭐⭐ AVEC le slug : l’adresse porte la forme PÉRENNE (bascule du 11/10/2026)', () => {
    // Le web sert `/opac/resoudre/<identifiant>` depuis le 11 octobre 2026 —
    // 308 vers `/opac/<id>`, mesuré sans cookie par la session front. Jusque-là
    // cette fonction rendait le repli pour TOUT LE MONDE, et les six cas
    // ci-dessus ne l'exerçaient que lui.
    expect(adressePubliqueDeLaNotice('https://gafeso.org', 'bib.uo.bf', 'r1', 'uo')).toBe(
      `https://bib.uo.bf/opac/resoudre/${encodeURIComponent('oai:uo:r1')}`,
    );
    // ⚠ Et l'identifiant est bien celui de la SOURCE UNIQUE, pas une chaîne
    // recomposée ici : une seconde écriture divergerait au premier changement
    // de forme.
    expect(adressePubliqueDeLaNotice('https://gafeso.org', 'bib.uo.bf', 'r1', 'uo')).toContain(
      encodeURIComponent(construireIdentifiant('uo', 'r1')),
    );
  });

  it('⭐ l’hôte de l’ÉCOLE s’applique AUSSI à la forme pérenne', () => {
    // Sinon la bascule aurait rouvert le défaut que le cas ci-dessus ferme :
    // publier à chaque école l'adresse d'une autre.
    expect(
      adressePubliqueDeLaNotice('http://localhost:3000', 'zinda.localhost', 'r1', 'zinda'),
    ).toBe(`http://zinda.localhost:3000/opac/resoudre/${encodeURIComponent('oai:zinda:r1')}`);
  });

  it('⚠ sans slug, le REPLI reste `/opac/<id>` — et il est servi pour toujours', () => {
    // Ce n'est pas une transition : les DEUX adresses restent valides, parce
    // qu'un QR imprimé ne se reprend pas. Le web le verrouille de son côté
    // (`routes-perennes.spec.ts`).
    expect(adressePubliqueDeLaNotice('https://gafeso.org', 'bib.uo.bf', 'r1')).toBe(
      'https://bib.uo.bf/opac/r1',
    );
  });

  it('⚠ sans domaine déclaré, l’instance mono-établissement est EXACTE', () => {
    expect(adressePubliqueDeLaNotice('https://gafeso.org', null, 'r1')).toBe(
      'https://gafeso.org/opac/r1',
    );
  });

  it('🔴 TÉMOIN D’ABSENCE : un domaine douteux est IGNORÉ, jamais interpolé', () => {
    // Sans ce cas, une valeur arbitraire en base fabriquerait une URL qui mène
    // ailleurs — et un QR qui mène ailleurs ne se remarque JAMAIS.
    for (const douteux of [
      'exemple.org/chemin',
      'a b',
      'user@exemple.org',
      '.exemple.org',
      'exemple.org.',
      'exemple.org:8080',
    ]) {
      expect(
        adressePubliqueDeLaNotice('https://gafeso.org', douteux, 'r1'),
        `« ${douteux} » ne doit pas entrer dans l’URL`,
      ).toBe('https://gafeso.org/opac/r1');
    }
  });

  it('⚠ une APP_URL illisible rend `null`, jamais une adresse fabriquée', () => {
    expect(adressePubliqueDeLaNotice('pas une url', 'bib.uo.bf', 'r1')).toBeNull();
    expect(adressePubliqueDeLaNotice('', null, 'r1')).toBeNull();
  });

  it('⚠ l’identifiant ne porte AUCUN domaine — c’est ce qui le rend pérenne', () => {
    const idp = construireIdentifiant('zinda', 'r1');
    expect(idp).toBe('oai:zinda:r1');
    expect(idp).not.toMatch(/https?:|localhost|\./);
  });

  it('⭐ LE SITE D’APPEL passe le slug — sinon la bascule est muette', () => {
    // ⚠ POURQUOI UN CAS DE FORME, alors que les cas ci-dessus mesurent la
    // fonction : le quatrième argument est OPTIONNEL. Quelqu'un qui le retire
    // de l'appel obtient le repli — pour tout le monde, en silence, et les
    // 141 cas de l'OPAC restent verts. C'est exactement « une mutation qui ne
    // casse rien parce qu'il n'y a PAS de test », et la propriété ne vit pas
    // dans la fonction : elle vit dans ce qu'on lui PASSE.
    const SERVICE = readFileSync(join(__dirname, 'opac.service.ts'), 'utf-8');
    expect(SERVICE.length, 'témoin : le fichier a bien été LU').toBeGreaterThan(2000);

    const appels = SERVICE.split('\n').filter((l) => /adressePubliqueDeLaNotice\(/.test(l));
    // ⚠ TÉMOIN DE COMPTE : un motif qui ne trouve rien rendrait ce cas vert sur
    // l'ensemble vide. Un appel de plus demain convoque quelqu'un ici.
    expect(appels.length, 'le relevé doit voir l’appel').toBe(1);

    for (const appel of appels) {
      expect(
        appel,
        'l’appel doit passer le slug en quatrième argument, sinon `publicUrl` ' +
          'retombe sur `/opac/<id>` pour toutes les écoles',
        // ⚠ `[^)]*` ne pouvait pas traverser le `)` de
        // `this.domainePrincipal(slug)` — un motif qui accuse du code correct.
      ).toMatch(/adressePubliqueDeLaNotice\(.*,\s*slug\s*\)\s*$/);
    }
  });
});
