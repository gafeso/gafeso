'use client';

// Graphiques SVG maison, LÉGERS (aucune lib de charting). Couleurs dérivées du
// thème du tenant via les classes Tailwind fill-*/stroke-* (ink = primaire,
// ocre = accent), déclinées en opacités — jamais de palette arc-en-ciel en dur.
// Sobres, fond clair, pas de 3D ni d'animation. Valeurs exactes accessibles au
// survol (élément <title>) en plus des tableaux CSV.

const fr = new Intl.NumberFormat('fr-FR');

/** État vide uniforme. */
export function EmptyState({ label = 'Aucune donnée sur la période.' }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-muted">{label}</p>;
}

/** Cadre de graphique : titre + contenu, style commun. */
export function ChartCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Mini-courbe (sparkline) — tendance dans une tuile KPI. */
export function Sparkline({ values, className = 'stroke-ink' }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" className={className} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** Tuile KPI : valeur, libellé, sparkline + variation optionnelles. */
export function KpiTile({
  label,
  value,
  spark,
  variationPct,
  emphasis,
}: {
  label: string;
  value: number;
  spark?: number[];
  variationPct?: number | null;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-3 shadow-sm">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className={`text-2xl font-bold ${emphasis && value > 0 ? 'text-ocre' : ''}`}>
          {fr.format(value)}
        </div>
        {spark && spark.some((v) => v > 0) && <Sparkline values={spark} />}
      </div>
      {variationPct !== undefined && variationPct !== null && (
        <div
          className={`mt-1 text-xs font-medium ${
            variationPct >= 0 ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {variationPct >= 0 ? '▲' : '▼'} {variationPct >= 0 ? '+' : ''}
          {variationPct}% vs période précédente
        </div>
      )}
    </div>
  );
}

/** Courbe temporelle prêts/retours : deux lignes, aire teintée, points survolables. */
export function AreaLineChart({
  data,
}: {
  data: { date: string; loans: number; returns: number }[];
}) {
  if (data.length === 0) return <EmptyState />;
  const w = 640;
  const h = 220;
  const padL = 34;
  const padB = 24;
  const padT = 10;
  const padR = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(1, ...data.map((d) => Math.max(d.loans, d.returns)));
  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const line = (key: 'loans' | 'returns') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const area = (key: 'loans' | 'returns') =>
    `${line(key)} L${x(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(
      padT + innerH
    ).toFixed(1)} Z`;

  // Étiquettes X clairsemées (max ~7) pour rester lisibles en projection.
  const step = Math.max(1, Math.ceil(n / 7));
  // ⚠ DÉDUPLIQUÉ, ET CE N'EST PAS COSMÉTIQUE. `max` est borné à 1 par le bas ;
  // quand le jour le plus chargé compte UN prêt, `[0, Math.round(0.5), 1]` vaut
  // `[0, 1, 1]` — deux clés React identiques. React avertit, puis omet ou
  // duplique un repère : la grille du graphique est alors fausse.
  //
  // ⚠ Le cas n'est pas théorique, c'est celui d'une PETITE bibliothèque ou
  // d'une période courte — donc celui d'un client qui démarre, et celui d'une
  // démonstration. Le défaut se voyait dans la sortie des tests depuis un
  // moment, sous forme d'avertissement React que personne ne lisait.
  const gridVals = [...new Set([0, Math.round(max / 2), max])];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full min-w-[520px]" role="img" aria-label="Prêts et retours dans le temps">
        {/* Repères horizontaux + valeurs Y */}
        {gridVals.map((gv) => (
          <g key={gv}>
            <line x1={padL} x2={w - padR} y1={y(gv)} y2={y(gv)} className="stroke-line" strokeWidth={1} />
            <text x={padL - 6} y={y(gv) + 3} textAnchor="end" className="fill-muted text-[10px]">
              {gv}
            </text>
          </g>
        ))}
        {/* Aires + lignes */}
        <path d={area('loans')} className="fill-ink/10" />
        <path d={area('returns')} className="fill-ocre/10" />
        <path d={line('loans')} fill="none" className="stroke-ink" strokeWidth={2} strokeLinejoin="round" />
        <path d={line('returns')} fill="none" className="stroke-ocre" strokeWidth={2} strokeLinejoin="round" />
        {/* Points survolables (valeur exacte via <title>) */}
        {data.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={y(d.loans)} r={2.5} className="fill-ink">
              <title>{`${d.date} — prêts : ${d.loans}`}</title>
            </circle>
            <circle cx={x(i)} cy={y(d.returns)} r={2.5} className="fill-ocre">
              <title>{`${d.date} — retours : ${d.returns}`}</title>
            </circle>
          </g>
        ))}
        {/* Étiquettes X */}
        {data.map((d, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={d.date} x={x(i)} y={h - 8} textAnchor="middle" className="fill-muted text-[9px]">
              {d.date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-ink" /> Prêts</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-ocre" /> Retours</span>
      </div>
    </div>
  );
}

/** Barres horizontales (palmarès) — libellés longs lisibles. */
export function HorizontalBars({
  rows,
  valueSuffix = '',
  accent = false,
}: {
  rows: { label: string; count: number }[];
  valueSuffix?: string;
  accent?: boolean;
}) {
  if (rows.length === 0) return <EmptyState />;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate" title={r.label}>{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {fr.format(r.count)}
              {valueSuffix}
            </span>
          </div>
          <div className="mt-0.5 h-2 w-full rounded bg-line/60">
            <div
              className={`h-2 rounded ${accent ? 'bg-ocre' : 'bg-ink'}`}
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Anneau (donut) de répartition + légende chiffrée. */
export function Donut({ rows }: { rows: { label: string; count: number }[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) return <EmptyState label="Aucun document." />;
  // Rampe monochrome primaire + accent (déclinaisons d'opacité), pas d'arc-en-ciel.
  const palette = ['fill-ink', 'fill-ink/75', 'fill-ink/50', 'fill-ocre', 'fill-ocre/70', 'fill-ink/30', 'fill-ocre/40'];
  const R = 60;
  const r = 36;
  const cx = 70;
  const cy = 70;
  let angle = -Math.PI / 2;
  const arcs = rows.map((row, i) => {
    const frac = row.count / total;
    const a0 = angle;
    const a1 = angle + frac * 2 * Math.PI;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, radius: number) => `${cx + radius * Math.cos(rad)},${cy + radius * Math.sin(rad)}`;
    // Anneau (secteur creux) via deux arcs.
    const d = `M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z`;
    return { d, cls: palette[i % palette.length], row, pct: Math.round(frac * 100) };
  });
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label="Répartition du fonds par domaine">
        {arcs.map((a, i) => (
          <path key={i} d={a.d} className={a.cls}>
            <title>{`${a.row.label} : ${a.row.count} (${a.pct}%)`}</title>
          </path>
        ))}
        <text x="70" y="66" textAnchor="middle" className="fill-heading text-lg font-bold">{fr.format(total)}</text>
        <text x="70" y="80" textAnchor="middle" className="fill-muted text-[9px]">notices</text>
      </svg>
      <ul className="flex-1 columns-2 gap-4 text-sm">
        {arcs.map((a, i) => (
          <li key={i} className="mb-1 flex items-center gap-2">
            <span className={`inline-block h-3 w-3 shrink-0 rounded-sm ${a.cls.replace('fill-', 'bg-')}`} />
            <span className="truncate" title={a.row.label}>{a.row.label}</span>
            <span className="ml-auto shrink-0 tabular-nums text-muted">{a.row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
