/**
 * UNE BIBLIOTHÈQUE SANS RAYON — module `circulation` ÉTEINT.
 *
 * L'Université Virtuelle a des étudiants à distance et aucun rayon physique.
 * Module éteint, la fiche publique ne doit plus porter AUCUNE trace de
 * circulation : ni section « Exemplaires & disponibilité », ni badge de
 * disponibilité, ni « Réserver », ni les deux phrases d'absence.
 *
 * ⚠ ET SURTOUT : AUCUNE PHRASE NÉGATIVE. « Aucun exemplaire physique » et « pas
 * de version numérique » décrivent ce que l'établissement n'a pas, à quelqu'un
 * qui ne pouvait de toute façon rien emprunter. Mesuré sur zinda le 8 octobre
 * 2026 : 139 notices sur 480 n'ont aucun exemplaire, dont **119 sans rien du
 * tout** — un quart du fonds, et autant d'impasses.
 *
 * ⚠ POURQUOI `circulationActive` VIENT DE LA CHARGE PUBLIQUE et pas du hook des
 * modules : `GET /modules` rend **401 sans jeton** (mesuré). La fiche publique
 * ne peut donc pas connaître l'état du module autrement.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FicheNotice } from '@/app/opac/[id]/fiche-notice';
import { LIBELLES } from '@/lib/libelles';

vi.mock('@/lib/session', () => ({
  getUser: () => null,
  getToken: () => null,
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'r1' }),
  usePathname: () => '/opac/r1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const BASE = {
  id: 'r1',
  title: 'Traduction et interprétation — approche comparée',
  titleComplement: null,
  author: 'Zoungrana, Mariam',
  contributors: [],
  isbn: null,
  publishYear: 2014,
  language: 'fr',
  category: 'langues',
  publisher: null,
  publicationCity: null,
  defenseUniversity: null,
  defensePlace: null,
  summary: null,
  keywords: [],
  items: [],
  availability: null,
  digitalCopy: null,
  membersOnly: true,
};

/** ⚠ Le réseau ne répond jamais : on mesure le rendu, pas un chargement. */
function monter(extra: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  return render(<FicheNotice initial={{ ...BASE, ...extra } as never} />);
}
afterEach(() => vi.unstubAllGlobals());

const T = LIBELLES.ficheNotice;

/**
 * ⚠ DEUX AIDES, et les deux viennent d'un échec de MES tests, pas du produit.
 *
 * · `titreExemplaires` — « Exemplaires » apparaît DEUX fois sur la fiche d'un
 *   membre : le titre de section, et la ligne « Exemplaires (2/3 disponibles) ».
 *   Un `getByText(/Exemplaires/)` trouvait donc deux éléments et échouait en
 *   accusant le produit. On cible le TITRE.
 *
 * · `cadenas` — le `hint` de `MemberLock` n'est pas du texte visible : il vit
 *   dans l'`aria-label` d'un bouton (`« … » — options de connexion`). C'est
 *   d'ailleurs la bonne forme, et c'est pourquoi on le cible par son RÔLE et
 *   son NOM ACCESSIBLE, comme le ferait quelqu'un qui n'a pas l'écran.
 */
const titreExemplaires = () =>
  [...document.querySelectorAll('h2')].find((h) => /Exemplaires/i.test(h.textContent ?? '')) ?? null;
const cadenas = (hint: string) =>
  screen.queryByRole('button', { name: new RegExp(hint.slice(0, 28), 'i') });

describe('circulation ÉTEINTE : plus aucune trace de rayon', () => {
  it('⚠ la section « Exemplaires & disponibilité » disparaît — TITRE COMPRIS', () => {
    monter({ circulationActive: false, hasDigital: true });
    expect(titreExemplaires()).toBeNull();
    // Un titre sans contenu se lit comme une page cassée : on vérifie que
    // l'en-tête lui-même est parti, pas seulement son corps.
    const titres = [...document.querySelectorAll('h2')].map((h) => h.textContent ?? '');
    expect(titres.filter((t) => /Exemplaire|disponibilité/i.test(t))).toEqual([]);
  });

  it('⚠ aucun badge de disponibilité, et pas même le cadenas', () => {
    monter({ circulationActive: false, hasDigital: false });
    for (const texte of [T.badgeDisponible, T.badgeIndisponible, T.badgeSansExemplaire]) {
      expect(screen.queryByText(texte)).toBeNull();
    }
    expect(cadenas(T.membresDisponibilite)).toBeNull();
  });

  it('⚠ aucune phrase NÉGATIVE : la notice reste une RÉFÉRENCE', () => {
    // ⚠ `membersOnly: false` — un ANONYME lit le refus de lecture, jamais la
    // phrase de référence. Le cas visé est celui d'un MEMBRE sur une notice que
    // la bibliothèque référence sans en avoir ni exemplaire ni fichier : les
    // 119 notices mesurées sur zinda.
    monter({ circulationActive: false, hasDigital: false, membersOnly: false });
    expect(screen.getByText(T.referenceSeule)).toBeTruthy();
    expect(screen.queryByText(T.sansVersionNumerique)).toBeNull();
    expect(screen.queryByText(/Aucun exemplaire/i)).toBeNull();
  });

  it('⚠ « Réserver » n’existe nulle part, même pas grisé', () => {
    monter({ circulationActive: false, hasDigital: true });
    expect([...document.querySelectorAll('button')].filter((b) => /Réserver/i.test(b.textContent ?? ''))).toEqual([]);
  });
});

describe('l’EXISTENCE d’une version en ligne est publique', () => {
  it('⚠ badge « Lecture en ligne disponible » pour un ANONYME quand hasDigital', () => {
    // La décision du 8 octobre 2026 : un étudiant à distance doit pouvoir savoir
    // AVANT de créer un compte s'il y a quelque chose à lire.
    monter({ hasDigital: true, circulationActive: true });
    expect(screen.getByText(T.badgeLectureEnLigne)).toBeTruthy();
    // ⚠ et le cadenas de disponibilité ne le double pas : un seul badge.
    expect(cadenas(T.membresDisponibilite)).toBeNull();
  });

  it('⚠ le champ ABSENT ne fait rien apparaître — l’écran ne spécule pas', () => {
    // Tant que l'API ne sert pas `hasDigital`, le comportement d'aujourd'hui est
    // conservé. C'est ce qui permet de livrer l'écran avant le champ.
    monter({ circulationActive: true });
    expect(screen.queryByText(T.badgeLectureEnLigne)).toBeNull();
    expect(cadenas(T.membresDisponibilite)).toBeTruthy();
  });

  it('⚠ le refus de lecture est ASSUMÉ — plus de « SI une version existe »', () => {
    monter({ circulationActive: true });
    expect(screen.getByText(new RegExp(T.lectureReserveeAuxMembres.slice(0, 30)))).toBeTruthy();
    expect(screen.queryByText(/Si une version numérique existe/i)).toBeNull();
  });

  it('⚠ et la PROPRIÉTÉ du texte, pas son emploi : il n’emploie plus le conditionnel', () => {
    expect(T.lectureReserveeAuxMembres).not.toMatch(/\bsi\b/i);
    expect(T.lectureReserveeAuxMembres).toMatch(/réservée aux membres/i);
    // Le badge dit un MODE DE LECTURE, pas un droit acquis.
    expect(T.badgeLectureEnLigne).toMatch(/en ligne/i);
    expect(T.badgeLectureEnLigne).not.toMatch(/télécharg/i);
    // La référence ne nie rien.
    expect(T.referenceSeule).not.toMatch(/aucun|pas de/i);
  });
});

describe('circulation ACTIVE : rien ne change', () => {
  it('la section et le cadenas reviennent', () => {
    monter({ circulationActive: true });
    expect(titreExemplaires()).toBeTruthy();
    expect(cadenas(T.membresDisponibilite)).toBeTruthy();
  });

  it('⚠ et le champ ABSENT se comporte comme ACTIVE — jamais comme éteint', () => {
    // Le défaut qu'il ne faut pas : un champ non encore servi qui éteindrait la
    // circulation partout. `circulationActive !== false`, pas `=== true`.
    monter({ membersOnly: false });
    expect(titreExemplaires()).toBeTruthy();
    expect(screen.getByText(T.sansVersionNumerique)).toBeTruthy();
  });
});
