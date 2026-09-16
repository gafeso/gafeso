/**
 * LES DOCUMENTS NUMÉRIQUES PASSENT PAR LE PRODUIT — une seule implémentation.
 *
 * ⚠ POURQUOI CE FICHIER EXISTE. `seed-demo.mjs` attachait les documents par
 * `digitalCopy.createMany` — directement en base. `DigitalCopyService.upload`
 * fait trois choses de plus : il stocke le fichier, il rattache la notice à la
 * collection socle, et il lance l'INGESTION HORS-LIGNE (xref garanti + blob
 * AEAD segmenté). Rien de tout cela ne se produisait.
 *
 * Mesuré sur `zinda` le 16 septembre 2026 : **155 documents numériques, dont
 * UN SEUL prêt pour le hors-ligne.** Les 154 autres portaient `enc_status` à
 * `null` — ingestion jamais tentée. L'étagère mobile (`myDocuments` filtre
 * `encStatus: 'ready'`) en aurait montré un ; la fiche en promettait 155.
 * Sixième état issu d'un seed qui contourne les règles d'écriture du produit.
 *
 * ⚠ IL PASSE PAR LA ROUTE, PAS PAR PRISMA NI PAR LE SERVICE IMPORTÉ.
 * `POST /cataloging/records/:id/digital-copy` exige `catalogue.gerer` et
 * traverse les DTO, les gardes et le service — c'est-à-dire tout ce qu'un
 * écrivain direct saute. La session vient du chemin normal (`/auth/login` avec
 * le mot de passe que le seed a posé), jamais d'un jeton fabriqué.
 *
 * ⚠ IL CONVERGE SUR UN ÉTAT, pas sur un compte. Une copie dont `encStatus`
 * n'est pas `ready` est (re)téléversée — donc relancer répare, et ne duplique
 * rien : la route remplace l'exemplaire numérique existant.
 *
 * ⚠ Coût MESURÉ avant d'être écrit, sur le PDF d'exemple de 638 octets :
 * 4,8 ms de réparation xref (pdf-lib) + 0,6 ms de chiffrement + 6,5 ms de
 * dépôt MinIO ≈ **12 ms par document**, soit ~2 s de travail pour 155, hors
 * surcoût HTTP.
 */

/**
 * Téléverse `pdf` sur chaque notice qui n'a pas de document prêt pour le
 * hors-ligne, par la route du produit.
 *
 * @returns {Promise<{examines:number, televerses:number, echecs:string[]}>}
 */
export async function assurerLesDocumentsNumeriques({ db, api, token, pdf, nomFichier, cibler }) {
  if (!token) throw new Error('assurerLesDocumentsNumeriques : session absente.');

  // RECENSEMENT AVANT, par IDENTIFIANTS : le contrôle final se confronte à ce
  // qui existait, jamais à sa propre empreinte.
  const avantPrets = new Set(
    (await db.digitalCopy.findMany({ where: { encStatus: 'ready' }, select: { recordId: true } }))
      .map((c) => c.recordId),
  );

  const aFaire = await cibler(avantPrets);
  const echecs = [];
  let televerses = 0;

  for (const recordId of aFaire) {
    const form = new FormData();
    // ⚠ PAS DE Content-Type MANUEL : c'est FormData qui pose la frontière
    // multipart. Un en-tête imposé la supprime, et l'API reçoit un corps
    // multipart annoncé comme du JSON — la faute déjà payée une fois.
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), nomFichier);
    const res = await fetch(`${api}/cataloging/records/${recordId}/digital-copy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Host: 'localhost' },
      body: form,
    });
    if (!res.ok) { echecs.push(`${recordId} → HTTP ${res.status} ${(await res.text()).slice(0, 120)}`); continue; }
    televerses += 1;
  }

  // CONTRÔLE PAR DIFFÉRENCE D'ENSEMBLES : ce qui est devenu prêt.
  const apresPrets = await db.digitalCopy.findMany({ where: { encStatus: 'ready' }, select: { recordId: true } });
  const nouveaux = apresPrets.filter((c) => !avantPrets.has(c.recordId)).length;
  return { examines: aFaire.length, televerses, nouveaux, echecs };
}
