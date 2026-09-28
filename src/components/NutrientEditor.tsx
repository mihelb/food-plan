import { NUTRIENTS, type NutrientKey } from '../lib/nutrients';
import type { NutrientMap } from '../lib/types';
import { DecimalInput } from './DecimalInput';

/** Grid of number inputs for every tracked nutrient. Empty input = unknown. */
export function NutrientEditor({ values, onChange }: { values: NutrientMap; onChange: (v: NutrientMap) => void }) {
  return (
    <div className="nutrient-editor">
      {NUTRIENTS.map((n) => (
        <label key={n.key}>
          <span>
            {n.label} <span className="muted small">({n.unit})</span>
          </span>
          <DecimalInput
            value={values[n.key]}
            onChange={(v) => {
              const next = { ...values };
              if (v === undefined) delete next[n.key as NutrientKey];
              else next[n.key as NutrientKey] = v;
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}
