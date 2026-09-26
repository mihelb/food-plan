import { NUTRIENTS, type NutrientKey } from '../lib/nutrients';
import type { NutrientMap } from '../lib/types';

/** Grid of number inputs for every tracked nutrient. Empty input = unknown. */
export function NutrientEditor({ values, onChange }: { values: NutrientMap; onChange: (v: NutrientMap) => void }) {
  return (
    <div className="nutrient-editor">
      {NUTRIENTS.map((n) => (
        <label key={n.key}>
          <span>
            {n.label} <span className="muted small">({n.unit})</span>
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={values[n.key] ?? ''}
            onChange={(e) => {
              const next = { ...values };
              if (e.target.value === '') delete next[n.key as NutrientKey];
              else next[n.key as NutrientKey] = Math.max(0, Number(e.target.value));
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}
