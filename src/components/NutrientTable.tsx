import { NUTRIENTS, formatAmount } from '../lib/nutrients';
import type { NutrientMap } from '../lib/types';

const GROUPS = [
  { title: 'Energy & macros', groups: ['energy', 'macro', 'other'] },
  { title: 'Minerals', groups: ['mineral'] },
  { title: 'Vitamins', groups: ['vitamin'] },
] as const;

/** Compact three-column nutrient overview. Unknown values are shown as "–". */
export function NutrientTable({ values }: { values: NutrientMap }) {
  return (
    <div className="nutrient-table">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <h4>{g.title}</h4>
          <table className="table compact">
            <tbody>
              {NUTRIENTS.filter((n) => (g.groups as readonly string[]).includes(n.group)).map((n) => {
                const v = values[n.key];
                return (
                  <tr key={n.key}>
                    <td>{n.label}</td>
                    <td className="num">{v === undefined ? <span className="muted">–</span> : formatAmount(v, n.unit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
