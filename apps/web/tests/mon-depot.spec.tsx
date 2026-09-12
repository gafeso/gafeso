/**
 * « Mon dépôt » — l'espace de l'étudiant. P6-2, moitié front, dette n° 24 levée.
 *
 * ⚠ CET ÉCRAN EXISTE POUR QU'ON N'AIT PAS À REDÉPOSER. L'API le dit dans la
 * description de sa propre route : « un étudiant qui dépose et n'entend plus
 * rien redéposera ». Le suivi n'est donc pas un confort — c'est ce qui empêche
 * les doublons, et un doublon de thèse, personne ne sait lequel est le bon.
 *
 * Les quatre propriétés que cet écran doit tenir, et qui sont ici :
 *   1. les quatre états se lisent, et un REFUS garde son motif ;
 *   2. le document n'est remplaçable qu'en brouillon — et l'écran dit POURQUOI
 *      il ne l'est plus, sinon un bouton grisé se lit comme une panne ;
 *   3. une soumission dont la notification a échoué le DIT : sinon l'étudiant
 *      attend la réponse d'un directeur qui n'a jamais été prévenu ;
 *   4. rien n'est affirmé avant la réponse — un « aucun dépôt » prématuré est
 *      exactement ce qui fait redéposer.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PageMonDepot from '@/app/mon-depot/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/mon-depot',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const ETUDIANT = ['document.lire', 'depot.deposer'];

const depot = (etat: string, extra: Record<string, unknown> = {}) => ({
  id: `d-${etat}`,
  status: etat,
  directorId: 'u-directeur',
  title: 'Le droit foncier rural au Burkina Faso',
  authorName: 'Ouédraogo, Salif',
  documentType: 'memoire',
  year: 2026,
  fileName: 'memoire.pdf',
  fileSize: 120000,
  refusalReason: null,
  recordId: null,
  submittedAt: null,
  decidedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...extra,
});

const DIRECTEURS = [
  { id: 'u-zongo', nom: 'Pauline Zongo' },
  { id: 'u-sanogo', nom: 'Alain Sanogo' },
];

let appels: string[] = [];
/** Ce que la requête EMPORTE — c'est là que se voit un en-tête de trop. */
let entetes: { url: string; headers: Record<string, string>; body: unknown }[] = [];
/**
 * ⚠ `directeurs` est un PARAMÈTRE, et il a trois valeurs, parce que l'écran a
 * trois états : la liste peut être en vol (`'jamais'`), vide (l'école n'a
 * personne qui porte `depot.valider`), ou pleine.
 *
 * Le fourre-tout `/depots` répondait `{}` pour `/depots/directeurs` : l'écran
 * appelait `.map` sur un objet et le rendu cassait. Neuf tests ont échoué en
 * accusant l'écran, et la doublure était seule fautive. C'est pourquoi la
 * clé précise passe AVANT le fourre-tout.
 */
function brancher(
  depots: unknown[] | 'jamais',
  soumission?: unknown,
  directeurs: unknown[] | 'jamais' = DIRECTEURS,
  /** ⚠ Le sort du courriel prévenant le directeur du retrait — rendu par l'API. */
  retrait: { sent: boolean; reason?: string } = { sent: true },
) {
  appels = [];
  entetes = [];
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      appels.push(`${init?.method ?? 'GET'} ${url}`);
      entetes.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body });
      const ok = (corps: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(corps) } as Response);
      if (url.includes('/auth/me/functions')) return ok({ functions: ETUDIANT });
      if (url.includes('/depots/directeurs')) {
        return directeurs === 'jamais' ? new Promise<Response>(() => {}) : ok(directeurs);
      }
      if (url.includes('/depots/mes-depots')) {
        return depots === 'jamais' ? new Promise<Response>(() => {}) : ok(depots);
      }
      if (url.includes('/soumettre')) return ok(soumission ?? { depot: depot('soumis') });
      if (url.includes('/retirer')) {
        return ok({ depot: depot('brouillon'), notification: retrait });
      }
      if (url.includes('/depots')) return ok({});
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Mon dépôt · les quatre états', () => {
  it('chaque état se lit dans les mots de l’étudiant', async () => {
    brancher([depot('brouillon'), depot('soumis'), depot('valide'), depot('refuse', { refusalReason: 'Chapitre 3 incomplet.' })]);
    render(<PageMonDepot />);
    for (const etat of ['brouillon', 'soumis', 'valide', 'refuse']) {
      expect(await screen.findByText(LIBELLES.monDepot.etats[etat])).toBeTruthy();
    }
  });

  /** ⚠ UN REFUS SANS SA RAISON LAISSE REDÉPOSER LA MÊME CHOSE. */
  it('un refus garde son motif, et dit quoi faire ensuite', async () => {
    brancher([depot('refuse', { refusalReason: 'Le chapitre 3 n’est pas celui de la version soutenue.' })]);
    render(<PageMonDepot />);
    expect(await screen.findByText(/Le chapitre 3 n’est pas celui/)).toBeTruthy();
    expect(screen.getByText(LIBELLES.monDepot.refusSuite)).toBeTruthy();
  });

  it('le motif du refus DIT de créer un nouveau dépôt, pas d’attendre', () => {
    // ⚠ Sa propriété, pas sa valeur : « Ce dépôt est refusé. » serait exact et
    // sans issue — l'étudiant ne saurait pas qu'il peut recommencer.
    expect(LIBELLES.monDepot.refusSuite).toMatch(/nouveau dépôt/i);
    expect(LIBELLES.monDepot.refusSuite).toMatch(/pas annulable|reste refusé/i);
  });
});

describe('Mon dépôt · le document', () => {
  it('brouillon : le document est remplaçable', async () => {
    brancher([depot('brouillon')]);
    render(<PageMonDepot />);
    expect(await screen.findByText(LIBELLES.monDepot.remplacerFichier)).toBeTruthy();
    expect(screen.queryByText(LIBELLES.monDepot.fichierFige)).toBeNull();
  });

  /** ⚠ DIT POURQUOI, pas seulement que c'est impossible. */
  it.each(['soumis', 'valide', 'refuse'])('%s : figé, et l’écran dit pourquoi', async (etat) => {
    brancher([depot(etat)]);
    render(<PageMonDepot />);
    expect(await screen.findByText(LIBELLES.monDepot.fichierFige)).toBeTruthy();
    expect(screen.queryByText(LIBELLES.monDepot.remplacerFichier)).toBeNull();
  });

  it('brouillon sans document : on ne peut pas soumettre', async () => {
    brancher([depot('brouillon', { fileName: null })]);
    render(<PageMonDepot />);
    const bouton = await screen.findByRole('button', { name: LIBELLES.monDepot.soumettre });
    expect(bouton).toHaveProperty('disabled', true);
  });
});

describe('Mon dépôt · le téléversement du document', () => {
  /**
   * ⚠ TROUVÉ EN RECETTE LE 12 SEPTEMBRE 2026, ET AUCUN TEST NE POUVAIT LE VOIR.
   *
   * L'envoi passait par le client `api`, qui impose
   * `Content-Type: application/json`. Le navigateur ne pose alors PAS la
   * frontière multipart, l'API reçoit un corps multipart annoncé comme du JSON,
   * et répond « "------WebK"... is not valid JSON » — message affiché tel quel
   * à l'étudiant, sur le seul geste qui compte.
   *
   * Les quatre autres téléversements du dépôt utilisent `fetch` brut, avec le
   * commentaire qui explique pourquoi. J'ai écrit le cinquième sans lire les
   * quatre autres — et la suite est restée verte, parce qu'une doublure répond
   * ce qu'on lui dit de répondre : elle se moque de l'en-tête.
   *
   * Ce test regarde donc ce que la requête EMPORTE, pas ce qu'elle reçoit.
   */
  it('⚠ le document part SANS Content-Type imposé — sinon la frontière multipart manque', async () => {
    brancher([depot('brouillon', { fileName: null })]);
    render(<PageMonDepot />);
    await screen.findByText(LIBELLES.monDepot.etats.brouillon);

    const champ = document.querySelector('input[type=file]') as HTMLInputElement;
    const fichier = new File([new Uint8Array([37, 80, 68, 70])], 'm.pdf', { type: 'application/pdf' });
    Object.defineProperty(champ, 'files', { value: [fichier], configurable: true });
    fireEvent.change(champ);

    await waitFor(() => expect(entetes.some((e) => e.url.includes('/document'))).toBe(true));
    const envoi = entetes.find((e) => e.url.includes('/document'))!;
    const ct = Object.entries(envoi.headers).find(([k]) => k.toLowerCase() === 'content-type');
    expect(ct, 'un Content-Type imposé empêche le navigateur de poser la frontière multipart').toBeUndefined();
    expect(envoi.body).toBeInstanceOf(FormData);
  });
});

it('⚠ notification ABSENTE : on ne dit RIEN de l’envoi', async () => {
    // ⚠ POSÉ AVANT QUE L'API NE CHANGE. Le backend cessera de prévenir le
    // directeur à la RESOUMISSION, et OMETTRA `notification` plutôt que de
    // rendre `{ sent: false }` — « déjà prévenu » n'est pas « pas pu être
    // prévenu », et un écran qui lit `sent: false` dirait à l'étudiant que son
    // directeur n'a pas été joint, ce qui serait faux.
    //
    // Sans ce troisième état, l'écran tombait sur « votre directeur a été
    // prévenu » : une affirmation tirée d'une ABSENCE.
    brancher([depot('brouillon')], { depot: depot('soumis') });
    render(<PageMonDepot />);
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.monDepot.soumettre }));
    expect(await screen.findByText(LIBELLES.monDepot.soumisSansNouvelEnvoi)).toBeTruthy();
    expect(screen.queryByText(LIBELLES.monDepot.soumisEtPrevenu)).toBeNull();
    expect(screen.queryByText(LIBELLES.monDepot.soumisNonPrevenu)).toBeNull();
  });

  describe('Mon dépôt · la fin du circuit', () => {
  /**
   * ⚠ TROUVÉ EN RECETTE LE 12 SEPTEMBRE 2026, et c'est la troisième « colonne
   * servie que personne ne montre » de la journée.
   *
   * `mes-depots` rend la ligne entière, donc `recordId` partait vers l'étudiant
   * depuis toujours — et le front ne le déclarait même pas dans son type.
   * `valide` couvre pourtant DEUX situations très différentes pour le
   * déposant : sa thèse attend le catalogage, ou elle est AU CATALOGUE.
   *
   * Sans cette distinction, « Validé par votre directeur » était le dernier mot
   * qu'il lisait. Il ne savait ni qu'une étape manquait, ni, une fois faite, que
   * son travail était consultable — la dernière chose qu'il attend.
   */
  it('⚠ validé SANS notice : on dit que la dernière étape reste', async () => {
    brancher([depot('valide', { recordId: null })]);
    render(<PageMonDepot />);
    expect(await screen.findByText(LIBELLES.monDepot.valideEnAttenteDeCatalogage)).toBeTruthy();
    expect(screen.queryByText(LIBELLES.monDepot.voirAuCatalogue)).toBeNull();
  });

  it('⚠ validé AVEC notice : on l’annonce, et on ouvre la porte', async () => {
    brancher([depot('valide', { recordId: 'r-42' })]);
    render(<PageMonDepot />);
    const lien = (await screen.findByText(LIBELLES.monDepot.voirAuCatalogue)) as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/opac/r-42');
    expect(screen.queryByText(LIBELLES.monDepot.valideEnAttenteDeCatalogage)).toBeNull();
  });

  it('l’état affiché distingue les deux', async () => {
    brancher([depot('valide', { recordId: 'r-42' })]);
    render(<PageMonDepot />);
    expect(await screen.findByText(LIBELLES.monDepot.etats.valideEtCatalogue)).toBeTruthy();
    expect(screen.queryByText(LIBELLES.monDepot.etats.valide)).toBeNull();
  });

  it('⚠ le texte d’attente dit que ça ne dépend PLUS de lui', () => {
    // Sa propriété, pas sa valeur. « En attente de catalogage » serait exact et
    // laisserait croire qu'il manque encore quelque chose de sa part.
    expect(LIBELLES.monDepot.valideEnAttenteDeCatalogage).toMatch(/bibliothèque/i);
    expect(LIBELLES.monDepot.valideEnAttenteDeCatalogage).toMatch(/ne dépend plus de vous/i);
  });
});

describe('Mon dépôt · retirer un dépôt soumis', () => {
  /**
   * ⚠ « SOUMIS » ÉTAIT LE SEUL ÉTAT DONT LA SORTIE DÉPENDAIT DE QUELQU'UN
   * D'AUTRE. `valider` et `refuser` sont réservés au directeur DÉSIGNÉ, et le
   * directeur ne se change que sur un brouillon. Un directeur qui perdait la
   * fonction — rôle changé, compte désactivé, départ — bloquait le dépôt pour
   * toujours, et l'écran disait « en attente de votre directeur »
   * indéfiniment : c'était exact, et sans issue.
   *
   * Trouvé en vérifiant une remarque de Jean, arbitré par lui, livré par le
   * backend le jour même.
   */
  it('un dépôt SOUMIS porte la sortie', async () => {
    brancher([depot('soumis')]);
    render(<PageMonDepot />);
    expect(await screen.findByRole('button', { name: LIBELLES.monDepot.retirer })).toBeTruthy();
  });

  it('⚠ un BROUILLON n’a rien à retirer — il n’est pas parti', async () => {
    brancher([depot('brouillon')]);
    render(<PageMonDepot />);
    await screen.findByText(LIBELLES.monDepot.etats.brouillon);
    expect(screen.queryByRole('button', { name: LIBELLES.monDepot.retirer })).toBeNull();
  });

  it('⚠ rien n’est envoyé tant que la confirmation n’est pas donnée', async () => {
    brancher([depot('soumis')]);
    render(<PageMonDepot />);
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.monDepot.retirer }));
    await screen.findByText(LIBELLES.monDepot.retirerConfirmation);
    expect(appels.some((a) => a.includes('/retirer'))).toBe(false);
  });

  it('confirmer appelle la route, puis RELIT', async () => {
    brancher([depot('soumis')]);
    render(<PageMonDepot />);
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.monDepot.retirer }));
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.monDepot.retirerConfirmer }));
    await waitFor(() => expect(appels).toContain('POST /api/depots/d-soumis/retirer'));
    await waitFor(() =>
      expect(appels.filter((a) => a === 'GET /api/depots/mes-depots').length).toBeGreaterThan(1),
    );
  });

  it('⚠ le directeur NON prévenu : on le dit, sans effacer le retrait', async () => {
    // Le retrait a ABOUTI. Dire seulement « non prévenu » ferait douter du
    // geste entier, et recommencer une action déjà faite.
    brancher([depot('soumis')], undefined, DIRECTEURS, { sent: false, reason: 'smtp_absent' });
    render(<PageMonDepot />);
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.monDepot.retirer }));
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.monDepot.retirerConfirmer }));
    const avis = await screen.findByText(LIBELLES.monDepot.retireNonPrevenu);
    expect(avis).toBeTruthy();
  });

  it('⚠ la confirmation dit que RIEN n’est supprimé, et que le directeur est prévenu', () => {
    // Sa propriété, pas sa valeur. « Retirer ce dépôt ? » se lirait comme une
    // suppression — c'est un retour en arrière, et il a un effet SORTANT.
    expect(LIBELLES.monDepot.retirerConfirmation).toMatch(/brouillon/i);
    expect(LIBELLES.monDepot.retirerConfirmation).toMatch(/rien n’est supprimé/i);
    expect(LIBELLES.monDepot.retirerConfirmation).toMatch(/directeur sera prévenu|prévenu du retrait/i);
  });
});

describe('Mon dépôt · la désignation du directeur', () => {
  /**
   * ⚠ CE BLOC S'APPELAIT « LE MUR DU DIRECTEUR », ET LE MUR EST TOMBÉ.
   *
   * La recette avait mesuré un circuit infranchissable : `/soumettre` exige un
   * directeur, `directorId` ne se posait qu'à la création, aucune route ne
   * listait les directeurs. L'écran disait donc « votre établissement n'a pas
   * encore ouvert la désignation ». Le backend a livré les deux routes le
   * 12 septembre 2026 — et cette phrase est devenue FAUSSE tout en restant
   * affichée, ce qui est la pire forme : elle envoyait l'étudiant réclamer
   * l'ouverture de ce qui était déjà ouvert.
   *
   * TROIS ÉTATS, et chacun a son test ci-dessous.
   */
  it('⚠ liste INCONNUE : on n’affirme rien, ni menu ni mur', async () => {
    // Un « aucun directeur déclaré » pendant le chargement est un vide qui
    // INVITE À AGIR — et le geste, écrire à sa bibliothèque, aurait lieu.
    brancher([depot('brouillon', { directorId: null })], undefined, 'jamais');
    render(<PageMonDepot />);
    expect(await screen.findByText(LIBELLES.monDepot.chargementDirecteurs)).toBeTruthy();
    expect(screen.queryByText(LIBELLES.monDepot.sansDirecteur)).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('⚠ liste VIDE : là seulement le mur est encore vrai', async () => {
    // Personne, dans cette école, ne porte `depot.valider`. L'étudiant ne peut
    // effectivement rien faire, et la phrase doit dire à qui s'adresser.
    brancher([depot('brouillon', { directorId: null })], undefined, []);
    render(<PageMonDepot />);
    expect(await screen.findByText(LIBELLES.monDepot.sansDirecteur)).toBeTruthy();
    expect(screen.getByRole('button', { name: LIBELLES.monDepot.soumettre })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('liste PLEINE : le menu est offert, et le mur ne s’affiche pas', async () => {
    brancher([depot('brouillon', { directorId: null })]);
    render(<PageMonDepot />);
    const menu = await screen.findByRole('combobox');
    expect([...menu.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      LIBELLES.monDepot.aucunChoixDirecteur,
      'Pauline Zongo',
      'Alain Sanogo',
    ]);
    expect(screen.queryByText(LIBELLES.monDepot.sansDirecteur)).toBeNull();
  });

  it('⚠ sans directeur DÉSIGNÉ, le bouton reste inerte — et la phrase dit pourquoi', async () => {
    // Un bouton gris sans raison se lit comme une panne. Ici le geste EST
    // possible, donc la phrase invite à le faire — elle ne dit pas « c'est
    // fermé », ce qui serait le faux d'hier.
    brancher([depot('brouillon', { directorId: null })]);
    render(<PageMonDepot />);
    expect(await screen.findByText(LIBELLES.monDepot.sansDirecteurDesigne)).toBeTruthy();
    expect(screen.getByRole('button', { name: LIBELLES.monDepot.soumettre })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('choisir un directeur appelle la route, et l’écran RELIT', async () => {
    // ⚠ On ne pose pas l'état soi-même : une désignation affichée avant que le
    // serveur l'ait acceptée est un succès écrit, pas mesuré.
    brancher([depot('brouillon', { directorId: null })]);
    render(<PageMonDepot />);
    const menu = await screen.findByRole('combobox');
    fireEvent.change(menu, { target: { value: 'u-sanogo' } });
    await waitFor(() =>
      expect(appels).toContain('PATCH /api/depots/d-brouillon/directeur'),
    );
    // La relecture suit la désignation : c'est elle qui fait foi.
    await waitFor(() =>
      expect(appels.filter((a) => a === 'GET /api/depots/mes-depots').length).toBeGreaterThan(1),
    );
  });

  it('avec directeur désigné : le bouton est actif, et rien ne réclame plus', async () => {
    brancher([depot('brouillon')]);
    render(<PageMonDepot />);
    await screen.findByRole('button', { name: LIBELLES.monDepot.soumettre });
    expect(screen.queryByText(LIBELLES.monDepot.sansDirecteur)).toBeNull();
    expect(screen.queryByText(LIBELLES.monDepot.sansDirecteurDesigne)).toBeNull();
    expect(screen.getByRole('button', { name: LIBELLES.monDepot.soumettre })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('⚠ le mur, quand il s’affiche, dit que le travail est CONSERVÉ', () => {
    // Sa propriété, pas sa valeur : « Soumission impossible. » serait exact et
    // ferait croire le dépôt perdu — donc recommencer, ce que l'écran évite.
    expect(LIBELLES.monDepot.sansDirecteur).toMatch(/conservé/i);
    expect(LIBELLES.monDepot.sansDirecteur).toMatch(/bibliothèque|établissement/i);
  });

  it('⚠ le mur ne dit PLUS que la désignation n’est pas ouverte', () => {
    // Le témoin de la correction elle-même : cette phrase a été vraie une
    // demi-journée. Sans cette assertion, rien n'empêche de la réécrire.
    expect(LIBELLES.monDepot.sansDirecteur).not.toMatch(/pas encore ouvert|n’a pas ouvert/i);
  });
});

describe('Mon dépôt · la soumission', () => {
  it('directeur prévenu : on le dit', async () => {
    brancher([depot('brouillon')], { depot: depot('soumis'), notification: { sent: true } });
    render(<PageMonDepot />);
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.monDepot.soumettre }));
    expect(await screen.findByText(LIBELLES.monDepot.soumisEtPrevenu)).toBeTruthy();
  });

  /**
   * ⚠ LE CAS QUI COMPTE. L'API rend l'issue de la notification EXPRÈS pour que
   * l'écran puisse le dire. Annoncer « soumis » tout court laisserait l'étudiant
   * attendre la réponse d'un directeur jamais prévenu — et il redéposerait.
   */
  it('directeur NON prévenu : on le dit aussi, et on dit quoi faire', async () => {
    brancher([depot('brouillon')], { depot: depot('soumis'), notification: { sent: false } });
    render(<PageMonDepot />);
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.monDepot.soumettre }));
    const avis = await screen.findByText(LIBELLES.monDepot.soumisNonPrevenu);
    expect(avis.textContent).toMatch(/Signalez|prévenez/i);
    expect(screen.queryByText(LIBELLES.monDepot.soumisEtPrevenu)).toBeNull();
  });
});

describe('Mon dépôt · ce qu’on n’affirme pas', () => {
  it('rien n’est dit avant la réponse', async () => {
    brancher('jamais');
    render(<PageMonDepot />);
    expect(await screen.findByText(LIBELLES.monDepot.chargement)).toBeTruthy();
    // ⚠ « Aucun dépôt » affiché trop tôt est exactement ce qui fait redéposer.
    expect(screen.queryByText(LIBELLES.monDepot.aucun)).toBeNull();
  });

  it('aucun dépôt : on le dit UNE FOIS la réponse arrivée', async () => {
    brancher([]);
    render(<PageMonDepot />);
    expect(await screen.findByText(LIBELLES.monDepot.aucun)).toBeTruthy();
  });

  /**
   * ⚠ LE DÉPÔT D'UN AUTRE ÉTUDIANT REND « INTROUVABLE », PAS « INTERDIT » —
   * décision du backend, et l'écran ne doit pas la trahir en supposant
   * l'existence. Il affiche le message de l'API tel quel.
   */
  it('l’écran ne suppose jamais l’existence de ce qu’on lui refuse', async () => {
    expect(LIBELLES.monDepot.fichierFige).not.toMatch(/interdit|pas autorisé|permission/i);
    expect(LIBELLES.refusDeDroit.depot).not.toMatch(/introuvable/i);
  });
});
