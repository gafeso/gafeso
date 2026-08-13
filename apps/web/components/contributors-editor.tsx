'use client';

// Éditeur de contributeurs avec rôles (cahier fiche de saisie §2.2) : lignes
// dynamiques nom + rôle, « + Ajouter un auteur », suppression par ligne.
// Utilisé par les formulaires de création ET d'édition de notice — la
// validation de vérité (≥1 auteur principal) reste côté serveur ; ici on ne
// fait que l'UX (message avant envoi via hasPrincipalAuthor).

import { Button, Select } from '@/components/ui';
import { AuthorNameInput } from '@/components/author-name-input';

export interface ContributorRow {
  name: string;
  role: string;
  /** Lien vers la fiche d'autorité (présent sur la fiche notice + le doc de
   *  recherche réindexé). Absent → repli sur une recherche par nom. */
  authorId?: string | null;
}

/** Auteur affichable : nom + éventuel lien vers sa fiche d'autorité. */
export interface AuthorRef {
  name: string;
  authorId?: string | null;
}

export const CONTRIBUTOR_ROLE_LABELS: Record<string, string> = {
  AUTEUR_PRINCIPAL: 'Auteur principal',
  AUTEUR_SECONDAIRE: 'Auteur secondaire',
  DIRECTEUR_MEMOIRE: 'Directeur de mémoire / de thèse',
};

/** Ligne initiale d'un formulaire vierge. */
export function emptyContributors(): ContributorRow[] {
  return [{ name: '', role: 'AUTEUR_PRINCIPAL' }];
}

/** Validation UX avant envoi (le serveur re-vérifie de toute façon). */
export function hasPrincipalAuthor(rows: ContributorRow[]): boolean {
  return rows.some((r) => r.role === 'AUTEUR_PRINCIPAL' && r.name.trim().length > 0);
}

/** Lignes prêtes pour l'API : noms nettoyés, lignes vides écartées. */
export function toApiContributors(rows: ContributorRow[]): ContributorRow[] {
  return rows
    .map((r) => ({ name: r.name.trim(), role: r.role }))
    .filter((r) => r.name.length > 0);
}

export function ContributorsEditor({
  value,
  onChange,
  showDirectorRole = true,
}: {
  value: ContributorRow[];
  onChange: (rows: ContributorRow[]) => void;
  /** Le rôle directeur n'a de sens que pour Thèse/Mémoire (affichage conditionnel §3). */
  showDirectorRole?: boolean;
}) {
  function update(index: number, patch: Partial<ContributorRow>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="col-span-2 flex flex-col gap-2">
      <span className="text-sm font-medium">Contributeurs</span>
      {value.map((row, index) => (
        // flex-wrap : sur mobile, le nom (min-w) passe sous le rôle au lieu
        // d'être écrasé.
        <div key={index} className="flex flex-wrap items-center gap-2">
          {/* Largeurs posées sur des CONTENEURS : Select/Input portent w-full
              en interne — les dimensionner via className crée un conflit de
              classes Tailwind non déterministe (cause des proportions
              inversées signalées par la responsable). Rôle compact à largeur
              fixe, calée sur le libellé le plus long ; le nom prend le reste. */}
          <div className="w-60 shrink-0">
            <Select
              value={row.role}
              onChange={(e) => update(index, { role: e.target.value })}
              aria-label={`Rôle du contributeur ${index + 1}`}
            >
              <option value="AUTEUR_PRINCIPAL">{CONTRIBUTOR_ROLE_LABELS.AUTEUR_PRINCIPAL}</option>
              <option value="AUTEUR_SECONDAIRE">
                {CONTRIBUTOR_ROLE_LABELS.AUTEUR_SECONDAIRE}
              </option>
              {(showDirectorRole || row.role === 'DIRECTEUR_MEMOIRE') && (
                <option value="DIRECTEUR_MEMOIRE">
                  {CONTRIBUTOR_ROLE_LABELS.DIRECTEUR_MEMOIRE}
                </option>
              )}
            </Select>
          </div>
          {/* Nom + ✕ groupés : au repli (mobile), ils passent ENSEMBLE sous le
              rôle au lieu de laisser le ✕ orphelin sur une troisième ligne. */}
          <div className="flex min-w-[14rem] flex-1 items-center gap-2">
            <div className="flex-1">
              <AuthorNameInput
                value={row.name}
                onChange={(name) => update(index, { name })}
                placeholder="Nom complet de l'auteur"
                ariaLabel={`Nom du contributeur ${index + 1}`}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              disabled={value.length === 1}
              aria-label={`Retirer le contributeur ${index + 1}`}
              className="shrink-0 px-2.5"
            >
              ✕
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => onChange([...value, { name: '', role: 'AUTEUR_SECONDAIRE' }])}
      >
        + Ajouter un auteur
      </Button>
    </div>
  );
}

/** Affichage lecture : « auteurs » et « directeur » séparés, dans l'ordre. */
export function splitContributors(contributors: ContributorRow[] | undefined | null) {
  const list = contributors ?? [];
  const toRef = (c: ContributorRow): AuthorRef => ({ name: c.name, authorId: c.authorId });
  return {
    authors: list.filter((c) => c.role !== 'DIRECTEUR_MEMOIRE').map(toRef),
    directors: list.filter((c) => c.role === 'DIRECTEUR_MEMOIRE').map(toRef),
  };
}
