import { NUTRIENT_BY_KEY, UPPER_LIMITS, formatAmount, type NutrientKey } from '../lib/nutrients';
import type { MacroTargets, MicroStatus } from '../lib/calc';
import type { NutrientMap } from '../lib/types';

/** Bars span 0–150 % of target; the target sits at the 2/3 mark. */
const DOMAIN = 1.5;

type Status = 'good' | 'warning' | 'critical' | 'over';

const STATUS_META: Record<Status, { icon: string; label: string }> = {
  good: { icon: '✓', label: 'on target' },
  warning: { icon: '▼', label: 'a bit low' },
  critical: { icon: '▼', label: 'low' },
  over: { icon: '▲', label: 'above target' },
};

interface BarRowProps {
  label: string;
  value: number;
  target: number;
  unit: string;
  status: Status;
  note: string;
  alert?: string;
}

function BarRow({ label, value, target, unit, status, note, alert }: BarRowProps) {
  const pct = target > 0 ? value / target : 0;
  const width = Math.min(pct, DOMAIN) / DOMAIN;
  const meta = STATUS_META[status];
  const tip = `${label}: ${formatAmount(value, unit)} of ${formatAmount(target, unit)} (${Math.round(pct * 100)} %) — ${meta.label}${alert ? ` — ${alert}` : ''}`;
  return (
    <div className="bar-row" title={tip}>
      <div className="bar-label">{label}</div>
      <div className="bar-track" role="img" aria-label={tip}>
        <div className={`bar-fill status-${status}`} style={{ width: `${width * 100}%` }} />
        <div className="bar-target" style={{ left: `${(1 / DOMAIN) * 100}%` }} />
      </div>
      <div className="bar-value">
        <span className={`status-icon status-text-${status}`} aria-label={meta.label}>
          {meta.icon}
        </span>{' '}
        {Math.round(pct * 100)}%<span className="muted"> · {note}</span>
        {alert && (
          <span className="alert" title={alert}>
            {' '}
            ⚠ {alert}
          </span>
        )}
      </div>
    </div>
  );
}

function macroStatus(pct: number, overIsFine: boolean): Status {
  if (pct < 0.8) return 'critical';
  if (pct < 0.95) return 'warning';
  if (pct > 1.1 && !overIsFine) return 'over';
  return 'good';
}

export function MacroChart({ totals, targets, weightKg }: { totals: NutrientMap; targets: MacroTargets; weightKg: number }) {
  const rows: { key: keyof MacroTargets; label: string; unit: string; overIsFine: boolean }[] = [
    { key: 'kcal', label: 'Energy', unit: 'kcal', overIsFine: false },
    { key: 'carbs', label: 'Carbs', unit: 'g', overIsFine: false },
    { key: 'protein', label: 'Protein', unit: 'g', overIsFine: true },
    { key: 'fat', label: 'Fat', unit: 'g', overIsFine: false },
    { key: 'fiber', label: 'Fiber', unit: 'g', overIsFine: true },
  ];
  return (
    <div className="chart">
      {rows.map((r) => {
        const value = totals[r.key] ?? 0;
        const target = targets[r.key];
        const pct = target > 0 ? value / target : 0;
        const perKg = r.key === 'carbs' || r.key === 'protein' ? ` · ${(value / weightKg).toFixed(1)} g/kg` : '';
        return (
          <BarRow
            key={r.key}
            label={r.label}
            value={value}
            target={target}
            unit={r.unit}
            status={macroStatus(pct, r.overIsFine)}
            note={`${Math.round(value)} / ${Math.round(target)} ${r.unit}${perKg}`}
          />
        );
      })}
      <ChartLegend />
    </div>
  );
}

export function MicroChart({ statuses, days }: { statuses: MicroStatus[]; days: number }) {
  return (
    <div className="chart">
      {statuses.map((s) => {
        const def = NUTRIENT_BY_KEY[s.key as NutrientKey];
        const status: Status = s.pct >= 1 ? 'good' : s.pct >= 0.67 ? 'warning' : 'critical';
        const note = s.missing > 0 ? `missing ${formatAmount(s.missing, def.unit)}` : `${formatAmount(s.total, def.unit)} total`;
        const ul = UPPER_LIMITS[s.key];
        return (
          <BarRow
            key={s.key}
            label={def.label}
            value={s.total}
            target={s.target}
            unit={def.unit}
            status={status}
            note={note}
            alert={s.overUpper && ul ? `avg ${formatAmount(s.total / days, def.unit)}/day > upper limit ${formatAmount(ul, def.unit)}` : undefined}
          />
        );
      })}
      <ChartLegend />
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="legend">
      <span>
        <i className="swatch status-good" /> ✓ met
      </span>
      <span>
        <i className="swatch status-warning" /> ▼ a bit low
      </span>
      <span>
        <i className="swatch status-critical" /> ▼ low
      </span>
      <span>
        <i className="swatch status-over" /> ▲ above
      </span>
      <span>
        <i className="target-mark" /> target
      </span>
    </div>
  );
}
