/**
 * Modèles d'e-mails de rappel de circulation + rendu des variables.
 *
 * Deux types : DUE_SOON (échéance proche) et OVERDUE (retard). Chaque modèle a
 * un sujet et un corps en texte simple, où l'établissement peut insérer des
 * variables {…}. Les défauts ci-dessous sont en français soigné et servent tant
 * qu'aucun modèle n'a été personnalisé (colonne tenant_settings.reminder_templates
 * nulle ou partielle).
 */

export type ReminderType = 'DUE_SOON' | 'OVERDUE';

export interface ReminderTemplate {
  subject: string;
  body: string;
}

export interface ReminderTemplates {
  dueSoon: ReminderTemplate;
  overdue: ReminderTemplate;
}

/** Variables offertes à l'édition (documentées dans l'admin). */
export const REMINDER_VARIABLES = [
  { token: '{prenom}', description: 'Prénom de l’adhérent' },
  { token: '{nom}', description: 'Nom de l’adhérent' },
  { token: '{titre}', description: 'Titre du document emprunté' },
  { token: '{code_barres}', description: 'Code-barres de l’exemplaire' },
  { token: '{date_echeance}', description: 'Date d’échéance (JJ/MM/AAAA)' },
  { token: '{jours_retard}', description: 'Nombre de jours de retard (0 avant échéance)' },
] as const;

export const DEFAULT_REMINDER_TEMPLATES: ReminderTemplates = {
  dueSoon: {
    subject: 'Rappel : « {titre} » est à rendre bientôt',
    body:
      'Bonjour {prenom} {nom},\n\n' +
      'Nous vous rappelons que le document « {titre} » (code-barres {code_barres}) ' +
      'que vous avez emprunté est à rendre pour le {date_echeance}.\n\n' +
      'Merci de le rapporter à temps afin d’en faire profiter les autres lecteurs.\n\n' +
      'Cordialement,\nLa bibliothèque',
  },
  overdue: {
    subject: 'Retard : merci de rapporter « {titre} »',
    body:
      'Bonjour {prenom} {nom},\n\n' +
      'Le document « {titre} » (code-barres {code_barres}) était à rendre le ' +
      '{date_echeance}. Il est en retard de {jours_retard} jour(s).\n\n' +
      'Merci de le rapporter au plus vite au comptoir de la bibliothèque.\n\n' +
      'Cordialement,\nLa bibliothèque',
  },
};

/** Variables de rendu résolues pour un prêt donné. */
export interface ReminderVars {
  prenom: string;
  nom: string;
  titre: string;
  code_barres: string;
  date_echeance: string;
  jours_retard: number;
}

/** Formate une date en JJ/MM/AAAA (locale fr, sans dépendance externe). */
export function formatDueDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

/** Remplace les {variables} connues dans un gabarit. Les inconnues sont laissées telles quelles. */
export function renderTemplate(template: string, vars: ReminderVars): string {
  return template.replace(/\{(prenom|nom|titre|code_barres|date_echeance|jours_retard)\}/g, (_, key) => {
    const value = vars[key as keyof ReminderVars];
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Fusionne les modèles personnalisés (potentiellement partiels ou nuls, tels
 * que stockés en base) avec les défauts, en ne gardant que des chaînes.
 */
export function resolveTemplates(stored: unknown): ReminderTemplates {
  const s = (stored ?? {}) as Record<string, { subject?: unknown; body?: unknown } | undefined>;
  const pick = (t: { subject?: unknown; body?: unknown } | undefined, def: ReminderTemplate): ReminderTemplate => ({
    subject: typeof t?.subject === 'string' && t.subject.trim() ? t.subject : def.subject,
    body: typeof t?.body === 'string' && t.body.trim() ? t.body : def.body,
  });
  return {
    dueSoon: pick(s.dueSoon, DEFAULT_REMINDER_TEMPLATES.dueSoon),
    overdue: pick(s.overdue, DEFAULT_REMINDER_TEMPLATES.overdue),
  };
}
