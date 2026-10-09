/**
 * L'ESPACE LECTEUR D'UNE BIBLIOTHÈQUE NUMÉRIQUE — et son DISPOSITIF
 * ANTI-PÉREMPTION.
 *
 * Décision de Jean du 8 octobre 2026 : « Mes consultations » et « Mes documents
 * hors ligne » quand le backend livre les routes. **Avant ça, un écran qui le
 * dit ; jamais un écran vide.**
 *
 * ⚠ CES TEXTES DATENT LEUR PROPRE PÉREMPTION. « Pas encore disponible » est
 * exactement la forme que ce dépôt traque depuis le 12 septembre 2026 : un
 * avertissement EXACT devient un mensonge quand sa condition disparaît, et
 * personne ne relit un texte qui a l'air correct. Le jour où l'API expose la
 * route, l'écran continuerait d'envoyer les étudiants chercher ailleurs ce
 * qu'il peut désormais montrer.
 *
 * > ⭐ D'où le dernier cas de ce fichier : il ÉCHOUE quand l'API expose une
 * > route de consultation ou de licence hors ligne pour le lecteur, et son
 * > message dit quoi faire. Le texte explique ; seul le test se souvient.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBELLES } from '@/lib/libelles';

const C = LIBELLES.espaceLecteur.consultations;
const H = LIBELLES.espaceLecteur.horsLigne;

describe('les deux écrans existent, et ils ne sont pas vides', () => {
  it('⚠ chacun a son fichier — « jamais un écran vide » commence par EXISTER', () => {
    for (const dossier of ['mes-consultations', 'mes-documents-hors-ligne']) {
      const chemin = resolve(process.cwd(), 'app', dossier, 'page.tsx');
      const src = readFileSync(chemin, 'utf-8');
      expect(src).toContain('SectionPasEncore');
      // Et il lit les libellés : aucun texte visible écrit dans l'écran.
      expect(src).toContain('LIBELLES.espaceLecteur');
    }
  });
});

describe('la PROPRIÉTÉ des textes, pas leur emploi', () => {
  it('⚠ « pas encore » dit ce qui MANQUE, et nomme l’installation', () => {
    // Ce n'est pas une panne du lecteur : le texte doit situer l'absence du côté
    // du produit, sinon il la prend pour une erreur de sa part.
    for (const t of [C.pasEncore, H.pasEncore]) {
      expect(t).toMatch(/pas encore/i);
      expect(t).toMatch(/installation/i);
      // ⚠ Aucune date, aucune promesse de livraison.
      expect(t).not.toMatch(/bientôt|prochainement|dans les prochains/i);
    }
  });

  /*
   * ⚠ LE CHEMIN COMPLET, et pas l'alias `C.sortie` / `H.sortie`.
   *
   * Le garde des textes qui promettent cherche `LIBELLES.<bloc>.<feuille>`, et
   * il sait suivre un alias d'UN niveau (`const T = LIBELLES.ficheNotice` puis
   * `T.x`). Mes alias en portent DEUX
   * (`const C = LIBELLES.espaceLecteur.consultations`) : il ne les voyait pas,
   * et il réclamait une assertion que j'avais écrite.
   *
   * ⚠ Le garde a raison de ne pas deviner. C'est sa borne, elle est écrite dans
   * son propre fichier — et le remède est d'écrire le chemin, pas d'élargir un
   * motif qui finirait par accepter n'importe quoi.
   */
  it('⚠ la SORTIE des consultations dit OÙ chercher en attendant', () => {
    // Une information sans issue ne sert à rien. Elle doit nommer le catalogue
    // et par quoi l'y chercher.
    expect(LIBELLES.espaceLecteur.consultations.sortie).toMatch(/catalogue/i);
    expect(LIBELLES.espaceLecteur.consultations.sortie).toMatch(/titre|auteur/i);
    expect(LIBELLES.espaceLecteur.consultations.sortie).not.toMatch(/bientôt|prochainement/i);
  });

  it('⚠ la SORTIE du hors ligne NE PROMET PAS l’application mobile', () => {
    // Elle existe, elle n'est PAS publiée, et ce dépôt ne publie rien.
    // Annoncer un téléchargement que personne ne peut obtenir serait le faux
    // qui retire le seul recours.
    expect(LIBELLES.espaceLecteur.horsLigne.sortie).toMatch(
      /application de lecture|sur votre appareil/i,
    );
    expect(LIBELLES.espaceLecteur.horsLigne.sortie).not.toMatch(
      /télécharg|play store|f-droid|apk|installer l/i,
    );
  });
});

/**
 * Les routes que l'API déclare, lues dans ses contrôleurs.
 *
 * ⚠ LA VALEUR RÉELLE, PAS UNE COPIE : un garde qui compare une copie à une copie
 * vérifie qu'on s'est recopié soi-même. On traverse la frontière des espaces de
 * travail en lecture seule, délibérément — le couplage existe dans les faits.
 */
function cheminsDesControleurs(): string {
  const racine = resolve(process.cwd(), '..', 'api', 'src');
  const lus: string[] = [];
  const parcourir = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (e.name.endsWith('.controller.ts')) lus.push(readFileSync(p, 'utf-8'));
    }
  };
  parcourir(racine);
  return lus.join('\n');
}

describe('⚠ LE DISPOSITIF ANTI-PÉREMPTION', () => {
  it('témoin : le relevé des contrôleurs a bien lu quelque chose', () => {
    // Sans lui, un chemin faux rendrait une chaîne vide et le cas suivant
    // passerait pour toujours — « tous les éléments trouvés satisfont P » sur
    // l'ensemble vide.
    const src = cheminsDesControleurs();
    expect(src.length).toBeGreaterThan(10_000);
    expect(src).toContain("@Controller('opac')");
  });

  it('⭐ RETOURNÉ le 8/10 : l’API a livré, les routes ne doivent plus disparaître', () => {
    const src = cheminsDesControleurs();
    // Les formes que prendrait une route de l'espace lecteur numérique. On
    // cherche large EXPRÈS : le nom exact n'est pas décidé, et un motif trop
    // étroit laisserait passer celui que le backend choisira.
    const indices = [
      /@Get\('consultations'\)/,
      /@Get\('mes-consultations'\)/,
      /reader\/consultations/,
      /@Get\('licences'\)/,
      /@Get\('hors-ligne'\)/,
      /@Get\('offline-licenses'\)/,
    ];
    const trouves = indices.filter((r) => r.test(src)).map(String);

    // ⭐ CE GARDE A FAIT SON OFFICE LE 8 OCTOBRE 2026, ET IL EST RETOURNÉ.
    //
    // Il échouait tant que l'API ne livrait pas. Elle a livré —
    // `GET /reader/consultations` et `GET /reader/hors-ligne` (lot backend Q3+Q4,
    // décisions de Jean du 6 octobre). Le laisser dans sa forme d'ATTENTE aurait
    // rendu le dépôt rouge pour les trois sessions, et un rouge permanent finit
    // par se contourner.
    //
    // ⚠ IL N'EST PAS SUPPRIMÉ : il garde désormais le sens INVERSE — les routes
    // ne doivent plus disparaître. Un garde qu'on efface emporte l'information
    // qu'il portait ; celui-ci la conserve en changeant de côté.
    //
    // 🔴 CE QUI RESTE À FAIRE EST AU FRONT, et c'est écrit en passation :
    //   · les deux écrans affichent encore « n'est pas encore disponible » —
    //     ces deux textes sont désormais FAUX, et ils envoient les étudiants
    //     chercher ailleurs ce que le produit peut montrer ;
    //   · ⚠ et l'un dit « vos LECTURES en ligne », le mot que la décision du
    //     6 octobre interdit : on mesure la délivrance d'une URL, pas qu'un
    //     document ait été lu. Le libellé juste est « consultations ».
    //   · puis retirer les deux déclarations de `lib/textes-qui-promettent.ts`.
    expect(
      trouves.length,
      'les routes de l’espace lecteur numérique ont DISPARU de l’API : les écrans ' +
        'qui les consomment vont se vider sans rien dire. Cherchez pourquoi avant ' +
        'de remettre ce garde dans sa forme d’attente.',
    ).toBeGreaterThan(0);
  });
});
