// Petits composants UI maison (esprit shadcn/ui, sans dépendance).
import { ButtonHTMLAttributes, ComponentPropsWithoutRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

/**
 * ⭐ `type="button"` PAR DÉFAUT, et ce n'est pas une préférence.
 *
 * En HTML, un `<button>` sans `type` vaut `submit`. Tout `<Button onClick=…>`
 * posé un jour à l'intérieur d'un `<form>` soumet donc le formulaire EN PLUS
 * de faire ce qu'on lui demande — et rien ne le signale : la page se
 * réenregistre, ou se recharge, et le clic a l'air d'avoir « mal marché ».
 *
 * ⚠ Mesuré avant de changer ce défaut, parce qu'il pouvait casser les boutons
 * qui comptent sur la soumission implicite :
 *
 * | | |
 * |---|---|
 * | `type=` posé explicitement | 76 — inchangés |
 * | `onClick` sans `type` | 134 — c'est eux que ce défaut protège |
 * | ⚠ soumission IMPLICITE | **0** |
 *
 * Les trois candidats du relevé n'en étaient pas : un `<Button>` dans un
 * `<Link>`, un bouton désactivé, et un COMMENTAIRE que mon scanner lisait comme
 * du code. Celui qui doit soumettre l'écrit — et les deux écrans migrés vers
 * `FormulaireCharge` comptent précisément les `type === 'submit'`, donc ils le
 * verraient disparaître.
 */
export function Button({
  className = '',
  variant = 'primary',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const base =
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocre';
  const variants = {
    primary: 'bg-ink text-white hover:bg-ink/90',
    ghost: 'bg-transparent text-ink hover:bg-line/60',
  };
  return <button type={type} className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-line bg-white px-3 py-2 text-sm placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocre ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocre disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-md border border-line bg-white px-3 py-2 text-sm placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocre ${className}`}
      {...props}
    />
  );
}

/** Petit indicateur de chargement (SVG inline, hérite de la couleur courante). */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

/** Bandeau de retour (erreur ou succès), markup unifié pour tous les écrans. */
export function Alert({
  tone,
  children,
  className = '',
}: {
  tone: 'error' | 'success' | 'warning';
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    error: 'bg-red-50 text-red-800',
    success: 'bg-green-50 text-green-900',
    warning: 'bg-ocre/10 text-ink',
  };
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={`rounded-md px-3 py-2 text-sm ${tones[tone]} ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * Carte. Transmet les attributs d'un `div` et accepte une `ref`.
 *
 * ⚠ Ajouté pour l'accessibilité, pas pour la souplesse : une confirmation de
 * suppression doit pouvoir recevoir le FOCUS et un `aria-labelledby`. La forme
 * d'avant ne prenait que `className` et `children`, ce qui obligeait à emballer
 * la carte dans un `div` porteur — un nœud de plus dans l'arbre, et le focus au
 * mauvais endroit.
 */
export const Card = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function Card({ className = '', children, ...reste }, ref) {
    return (
      <div
        ref={ref}
        className={`rounded-lg border border-line bg-white p-6 shadow-sm ${className}`}
        {...reste}
      >
        {children}
      </div>
    );
  },
);

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ocre' | 'green';
}) {
  const tones = {
    neutral: 'bg-line/60 text-muted',
    // ⚠ `text-ink`, PAS `text-ocre`. Mesuré sur les jetons : de l'ocre sur un
    // fond d'ocre à 15 % posé sur le papier donne **2,56:1** — pour du 12 px
    // gras, là où WCAG AA en demande 4,5. Et ce badge porte ce qu'une
    // bibliothécaire lit toute la journée : « En retard », « Amendes dues :
    // 2 800 FCFA », « En retard · 1 150 FCFA ». Avec l'encre : 12,60:1.
    //
    // Le teint reste ocre, donc le badge reste distinct du neutre et du vert ;
    // c'est exactement le choix que `Alert` fait déjà pour son ton
    // « warning » (`bg-ocre/10 text-ink`) — on s'aligne dessus plutôt que
    // d'inventer une troisième convention.
    ocre: 'bg-ocre/15 text-ink',
    green: 'bg-green-100 text-green-800',
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
