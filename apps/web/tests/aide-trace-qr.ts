/**
 * ⭐⭐ IDENTIFIER CE QU'UN QR ENCODE, DEPUIS SON TRACÉ DESSINÉ.
 *
 * ## ⚠ POURQUOI ON NE LIT PAS LE PROP
 *
 * Un test qui relit la valeur passée au composant mesure l'APPEL. Un repli
 * ajouté trois fonctions plus loin, une mise en majuscules déplacée, une
 * transformation glissée dans le composant : rien de tout ça ne se voit depuis
 * l'appelant. Ce module relit le `path` du SVG **réellement rendu** et cherche
 * laquelle des candidates produit exactement cette matrice.
 *
 * ⭐ C'est un garde d'EFFET : il voit ce qui est encodé, quelle que soit la
 * façon dont le code y est arrivé.
 *
 * ## ⚠ ET IL N'Y A PAS DE DÉCODEUR DANS CE DÉPÔT
 *
 * `uqr` encode ; rien ne décode, et ni `zbarimg`, ni `cv2`, ni
 * `BarcodeDetector` n'existent sur la machine (mesuré le 2 novembre 2026). Une
 * vraie épreuve encode-puis-décode a été faite avec `jsqr` installé HORS du
 * dépôt — voir `DEMARRER-FRONT.md` § 6 septies. Ici, l'identification par
 * comparaison de matrices suffit, et elle suffit PARCE QUE les candidates sont
 * exactement les formes qu'on veut discriminer.
 *
 * ⚠ Sa limite, écrite : il ne peut pas lire une chaîne IMPRÉVUE. S'il rend
 * `null`, c'est qu'aucune candidate ne correspond — et c'est une INFORMATION,
 * jamais un cas à ignorer. Toute épreuve qui l'emploie doit faire tomber ce cas.
 */
import { matriceQr, traceDesModules } from '@/lib/qr';

/**
 * Le `path` du QR rendu dans le document.
 *
 * ⚠ Sélectionné par un `viewBox` CARRÉ, et non par une liste de tailles : ma
 * première version énumérait « 45 45 », « 49 49 », « 53 53 » — une recopie de
 * mesures qui a cessé de voir le QR dès que la version a changé. Un QR est
 * carré par construction ; un code-barres ne l'est jamais.
 */
export function tracéDuQr(racine: ParentNode = document): string | null {
  for (const svg of Array.from(racine.querySelectorAll('svg'))) {
    const v = (svg.getAttribute('viewBox') ?? '').trim().split(/\s+/);
    if (v.length !== 4 || v[2] !== v[3]) continue;
    const d = svg.querySelector('path')?.getAttribute('d');
    if (d) return d;
  }
  return null;
}

/**
 * Laquelle des candidates produit le tracé dessiné — ou `null`.
 *
 * ⚠ `null` veut dire « le QR encode quelque chose qu'on n'a pas prévu ». C'est
 * le cas qui doit faire TOMBER l'épreuve, jamais celui qu'on passe.
 */
export function contenuDuQr(candidates: readonly string[], racine?: ParentNode): string | null {
  const d = tracéDuQr(racine);
  if (!d) return null;
  for (const c of candidates) if (traceDesModules(matriceQr(c)) === d) return c;
  return null;
}
