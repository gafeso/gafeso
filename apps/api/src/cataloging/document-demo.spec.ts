/**
 * 🔴 LES DOCUMENTS DE DÉMONSTRATION — ce qu'ils promettent, et le droit.
 *
 * Ce fonds est ce qu'on MONTRE : captures du magasin, démonstration devant un
 * client. Trois propriétés doivent tenir, et deux sont juridiques.
 *
 * ⚠ `scripts/` n'est pas compilé par `apps/api` : ce fichier importe donc le
 * générateur par son chemin, et `tsconfig.scripts.json` le couvre.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import * as QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

const CORPUS = join(__dirname, 'corpus-demonstration');
const RACINE = join(__dirname, '../../../..');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generateur = async (): Promise<any> =>
  import(join(RACINE, 'scripts/dev/engendrer-document-demo.mjs'));

const MESSAGE_QR =
  'le QR du document ne correspond pas à l’adresse de la notice — un QR qui ' +
  'mène ailleurs ne se remarque JAMAIS';

/**
 * Le flux d'image tel que `pdf-lib` l'écrit pour ce PNG.
 *
 * ⚠ C'est la seule comparaison qui dise quelque chose : le même encodeur, la
 * même entrée, donc les mêmes octets — et si le générateur avait encodé une
 * AUTRE adresse, ces octets-là ne seraient pas dans son document.
 */
async function fluxDuQr(png: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  const img = await doc.embedPng(png);
  const page = doc.addPage([200, 200]);
  page.drawImage(img, { x: 0, y: 0, width: 100, height: 100 });
  const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
  // Le plus long flux du document témoin est l'image.
  let meilleur = Buffer.alloc(0);
  let i = 0;
  for (;;) {
    const d0 = bytes.indexOf('\nstream', i);
    if (d0 < 0) break;
    let d = d0 + '\nstream'.length;
    if (bytes[d] === 0x0d) d += 1;
    if (bytes[d] === 0x0a) d += 1;
    const f = bytes.indexOf('endstream', d);
    if (f < 0) break;
    const tranche = bytes.subarray(d, f);
    if (tranche.length > meilleur.length) meilleur = tranche;
    i = f + 1;
  }
  expect(meilleur.length, 'aucun flux d’image dans le document témoin').toBeGreaterThan(200);
  return meilleur;
}

const NOTICE = {
  id: '9de9b299-cde5-4acc-9e76-0e800ad94281',
  title: 'Droit foncier rural et développement local',
  author: 'Congo, Pauline',
  recordType: 'ouvrage',
  category: 'droit',
  publishYear: 2012,
  establishment: 'Université d’Exemple',
  publicUrl: 'http://localhost:3000/opac/9de9b299-cde5-4acc-9e76-0e800ad94281',
};

describe('🔴 Les documents de démonstration', () => {
  it('🔴 CHAQUE texte du corpus DÉCLARE son domaine public et sa source', () => {
    // ⚠ C'est la propriété juridique, et elle n'est pas négociable : une
    // capture publiée sur une boutique est une PUBLICATION. Un texte sans
    // provenance écrite est un texte qu'on ne peut ni renouveler ni défendre.
    const fichiers = readdirSync(CORPUS).filter((f) => f.endsWith('.txt'));
    expect(fichiers.length, 'corpus vide : rien ne serait mesuré').toBeGreaterThanOrEqual(3);
    for (const f of fichiers) {
      const entete = readFileSync(join(CORPUS, f), 'utf-8').split('\n---\n')[0] ?? '';
      expect(entete, `${f} : statut`).toMatch(/DOMAINE PUBLIC/);
      expect(entete, `${f} : auteur et date de mort`).toMatch(/Auteur\s*:.*mort en \d{4}/);
      expect(entete, `${f} : source`).toMatch(/Source\s*:\s*https:\/\//);
      // ⚠ Le seuil de 70 ans se VÉRIFIE, il ne se déclare pas : une date de
      // mort écrite dans l'en-tête et jamais comparée ne prouve rien.
      const an = Number(/mort en (\d{4})/.exec(entete)?.[1] ?? '9999');
      expect(2026 - an, `${f} : l’auteur doit être mort depuis plus de 70 ans`).toBeGreaterThan(70);
    }
  });

  it('⭐ 8 à 20 pages, et le même document DEUX FOIS rend les MÊMES octets', async () => {
    const { engendrerDocumentDemo } = await generateur();
    const a = await engendrerDocumentDemo(NOTICE);
    const b = await engendrerDocumentDemo(NOTICE);
    expect(a.pages, 'au moins 8 pages').toBeGreaterThanOrEqual(8);
    expect(a.pages, 'au plus 20 pages').toBeLessThanOrEqual(20);
    // ⚠ L'idempotence du script de remplacement en DÉPEND : sans octets
    // stables, « ce document est-il déjà le bon ? » n'a pas de réponse, et les
    // 156 fichiers seraient réécrits à chaque passage.
    expect(Buffer.from(a.octets).equals(Buffer.from(b.octets)), 'déterministe').toBe(true);
  }, 60_000);

  it('🔴 LE QR ENCODE L’ADRESSE DE LA NOTICE — vérifié en RÉ-ENCODANT', async () => {
    // ⚠ Aucun décodeur de QR n'est disponible ici, et en ajouter un comme
    // dépendance de test serait cher pour une vérification. On fait l'inverse,
    // et c'est décisif : le PNG embarqué doit être OCTET POUR OCTET celui
    // qu'on obtient en encodant l'adresse attendue.
    const { engendrerDocumentDemo } = await generateur();
    const { octets } = await engendrerDocumentDemo(NOTICE);
    const attendu = await QRCode.toBuffer(NOTICE.publicUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 512,
    });
    // ⚠ ET ON NE COMPARE PAS LES OCTETS DU PNG : `pdf-lib` le DÉCODE et
    // réencode ses pixels. Ma première écriture cherchait le PNG tel quel dans
    // le PDF et ne le trouvait jamais — elle accusait le générateur d'un
    // défaut qui était dans ma mesure.
    //
    // ⭐ On passe donc l'attendu par LE MÊME ENCODEUR : un document témoin qui
    // n'embarque que ce QR. Son flux d'image est alors exactement celui que le
    // document de démonstration doit contenir.
    expect(Buffer.from(octets).includes(await fluxDuQr(attendu)), MESSAGE_QR).toBe(true);
  }, 60_000);

  it('🔴 TÉMOIN D’ABSENCE : un QR d’une AUTRE adresse ne correspond pas', async () => {
    // Sans ce cas, la comparaison ci-dessus serait indiscernable d'une
    // comparaison qui répond toujours oui.
    const { engendrerDocumentDemo } = await generateur();
    const { octets } = await engendrerDocumentDemo(NOTICE);
    const autre = await QRCode.toBuffer('http://localhost:3000/opac/une-autre-notice', {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 512,
    });
    expect(Buffer.from(octets).includes(await fluxDuQr(autre))).toBe(false);
  }, 60_000);

  it('⚠ sans publicUrl, AUCUN QR — on n’encode pas une adresse devinée', async () => {
    const { engendrerDocumentDemo } = await generateur();
    const a = await engendrerDocumentDemo({ ...NOTICE, publicUrl: null });
    const b = await engendrerDocumentDemo(NOTICE);
    expect(a.octets.length, 'le document sans QR est plus léger').toBeLessThan(b.octets.length);
  }, 60_000);

  it('⭐ le TEXTE suit le DOMAINE de la notice quand il y en a un qui convient', async () => {
    const { engendrerDocumentDemo } = await generateur();
    for (const [domaine, attendu] of [
      ['droit', /esprit des lois/i],
      ['medecine', /médecine expérimentale/i],
      ['philosophie', /Discours de la méthode/i],
      // ⚠ Accentué ou non : le fonds porte « medecine », le vocabulaire
      // « médecine ». Les deux doivent mener au même texte.
      ['médecine', /médecine expérimentale/i],
    ] as const) {
      const { oeuvre } = await engendrerDocumentDemo({ ...NOTICE, category: domaine });
      expect(oeuvre.oeuvre, `domaine ${domaine}`).toMatch(attendu);
    }
  }, 120_000);
});
