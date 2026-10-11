/**
 * LE VOLET USAGE — et la garantie de VIE PRIVÉE qui le gouverne.
 *
 * `GET /stats/usage` masque les comptes d'une classe à **-1** quand elle compte
 * moins de cinq lecteurs distincts (`publiable: false`). Trois règles tiennent
 * cette ligne, et ce fichier les éprouve une par une.
 *
 * > ⭐ « Classe L1 Droit : 3 emprunteurs, 47 prêts » est un agrégat. Dans une
 * > classe de trois, c'est le dossier de lecture de trois personnes qu'un
 * > collègue peut nommer.
 *
 * ⚠ ET L'API SERT `effectif` EN CLAIR, même sous le seuil. C'est le piège de ce
 * volet : afficher « 3 lecteurs » serait exactement la divulgation que le seuil
 * existe pour empêcher. Le masquage n'est pas dans la donnée reçue — il est dans
 * ce que l'écran choisit d'en montrer.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { VoletUsage, type ChargeUsage } from '@/components/volet-usage';

const T = LIBELLES.usage;

const CHARGE: ChargeUsage = {
  periode: { du: '2026-01-01', au: '2026-12-31' },
  parDocument: [
    { recordId: 'r1', titre: 'Droit constitutionnel burkinabè', consultations: 12, telechargements: 3 },
    { recordId: 'r2', titre: null, consultations: 4, telechargements: 0 },
  ],
  parJour: [{ jour: '2026-10-09', consultations: 5, telechargements: 2 }],
  parFiliere: [
    { cle: 'L1_DROIT', consultations: 40, telechargements: 7, effectif: 31, publiable: true },
    // ⚠ LA LIGNE SOUS LE SEUIL : comptes à -1, effectif en clair à 3.
    /*
     * ⚠ CETTE LIGNE DÉCRIT UNE FORME QUE rc9 NE SERT PLUS — et c'est VOULU.
     *
     * Mesuré le 9 octobre 2026 contre l'API : sous le seuil, `/stats/usage`
     * rend exactement `{ cle, publiable, motif }` — ni `consultations`, ni
     * `telechargements`, ni `effectif`. Le serveur ne confie donc plus le
     * nombre à l'écran.
     *
     * ⭐ La doublure continue de le lui confier, exprès : c'est la DÉFENSE EN
     * PROFONDEUR que Jean a demandée le 9 octobre — « le backend le retire de
     * la réponse sous le seuil ; garde ton masquage côté écran en défense ».
     * Un écran qui masque ce qu'il reçoit reste juste si la route régresse ;
     * un écran qui compte sur la route ne masque plus rien ce jour-là.
     *
     * ⚠ NE PAS « MODERNISER » cette doublure pour la faire ressembler à la
     * réponse actuelle : elle serait alors incapable de distinguer un écran
     * qui masque d'un écran qui n'a rien à masquer.
     */
    { cle: 'M2_MEDECINE', consultations: -1, telechargements: -1, effectif: 3, publiable: false },
  ],
  seuilDePublication: 5,
};

describe('⭐ sous le seuil : la phrase, jamais le nombre', () => {
  it('⚠ la LIGNE RESTE — son absence se lirait comme un zéro', () => {
    render(<VoletUsage usage={CHARGE} />);
    // Une absence muette dirait « cette classe ne lit rien » : un faux pire que
    // le silence qu'on cherchait.
    expect(screen.getByText('M2_MEDECINE')).toBeTruthy();
  });

  it('⚠ et elle porte LA PHRASE, avec son motif', () => {
    render(<VoletUsage usage={CHARGE} />);
    const phrase = T.nonPubliable(5);
    expect(screen.getByText(phrase)).toBeTruthy();
    // Elle dit POURQUOI : sans le motif, un gestionnaire croit à une panne.
    expect(phrase).toMatch(/vie privée|confidentialité/i);
    expect(phrase).toContain('5');
  });

  it('⚠⚠ JAMAIS `-1` à l’écran — ce n’est pas une mesure', () => {
    render(<VoletUsage usage={CHARGE} />);
    expect(document.body.textContent).not.toMatch(/-1/);
    expect(screen.queryByText('-1')).toBeNull();
  });

  it('⚠⚠ JAMAIS L’EFFECTIF — « 3 lecteurs » EST la divulgation', () => {
    render(<VoletUsage usage={CHARGE} />);
    const texte = document.body.textContent ?? '';
    // ⚠ Le piège de ce volet : l'API sert `effectif: 3` en clair. Le masquage
    // est dans ce que l'ÉCRAN montre, pas dans ce qu'il reçoit.
    expect(texte).not.toMatch(/\b3\b/);
  });

  it('⚠ et les comptes de la classe PUBLIABLE sont bien là', () => {
    // Témoin d'ABSENCE du masquage : sans lui, un écran qui masquerait TOUT
    // passerait les quatre cas ci-dessus.
    render(<VoletUsage usage={CHARGE} />);
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('L1_DROIT')).toBeTruthy();
  });
});

describe('le reste du volet', () => {
  it('un titre absent retombe sur l’identifiant, jamais sur du blanc', () => {
    render(<VoletUsage usage={CHARGE} />);
    expect(screen.getByText('r2')).toBeTruthy();
    expect(screen.getByText('Droit constitutionnel burkinabè')).toBeTruthy();
  });

  it('⚠ un usage VIDE le dit, et ne rend pas un volet muet', () => {
    render(
      <VoletUsage
        usage={{ ...CHARGE, parDocument: [], parJour: [], parFiliere: [] }}
      />,
    );
    expect(screen.getByText(T.aucunUsage)).toBeTruthy();
  });

  it('⚠ l’introduction dit que tout est AGRÉGÉ — aucun lecteur nommé', () => {
    // La propriété du texte, pas son emploi : c'est la seule phrase qui dise à
    // un gestionnaire qu'il ne trouvera pas de nom, et qu'il n'a pas à chercher.
    expect(T.intro).toMatch(/agrég/i);
    expect(T.intro).toMatch(/aucun lecteur n’est nommé|personne/i);
  });
});
