import { useRef, type ChangeEvent } from 'react';
import type { Mutate } from '../App';
import type { AppState, Profile } from '../lib/types';
import { macroTargets, microTargets } from '../lib/calc';
import { NUTRIENT_BY_KEY, MICRO_KEYS, UPPER_LIMITS, defaultMicroTargets, formatAmount } from '../lib/nutrients';
import { normalizeState } from '../lib/storage';

/** Mifflin–St Jeor resting energy estimate. */
function mifflin(p: Profile, heightCm: number): number {
  return Math.round(10 * p.weightKg + 6.25 * heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161));
}

export function ProfileView({ state, mutate }: { state: AppState; mutate: Mutate }) {
  const p = state.profile;
  const heightRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) =>
    mutate((s) => {
      s.profile[k] = v;
    });
  const num = (k: 'age' | 'weightKg' | 'bmrKcal' | 'proteinPerKg' | 'fatPct') => ({
    type: 'number' as const,
    value: p[k],
    onChange: (e: ChangeEvent<HTMLInputElement>) => set(k, Math.max(0, Number(e.target.value))),
  });
  const example = macroTargets(p, 600);
  const defaults = defaultMicroTargets(p.sex, p.age);
  const targets = microTargets(p);

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `foodplan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importData(file: File) {
    file.text().then((txt) => {
      try {
        const next = normalizeState(JSON.parse(txt));
        if (!confirm('Replace ALL current data with the backup?')) return;
        mutate((s) => Object.assign(s, next));
      } catch (e) {
        alert(`Not a valid backup file: ${e}`);
      }
    });
  }

  return (
    <div className="profile">
      <section className="panel">
        <h2>Appearance</h2>
        <div className="theme-switch" role="radiogroup" aria-label="Theme">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button key={t} role="radio" aria-checked={p.theme === t} className={p.theme === t ? 'on' : ''} onClick={() => set('theme', t)}>
              {t === 'light' ? '☀ Light' : t === 'dark' ? '☾ Dark' : 'Auto (follow desktop)'}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Prices</h2>
        <label className="check">
          <input type="checkbox" checked={p.showPrices} onChange={(e) => set('showPrices', e.target.checked)} />
          Show prices (per serving in recipes, per day and per week in the plan)
        </label>
        <label className="inline">
          Currency
          <input className="short" value={p.currency} onChange={(e) => set('currency', e.target.value)} maxLength={4} />
        </label>
        <p className="small muted">
          Enter prices per 100 g under Foods and per capsule/tablet under Supplements. Items without a price show "–" and
          totals are marked "≥" because they are then a lower bound.
        </p>
      </section>

      <section className="panel">
        <h2>About you</h2>
        <div className="form-grid">
          <label>
            Name
            <input value={p.name} onChange={(e) => set('name', e.target.value)} placeholder="optional" />
          </label>
          <label>
            Sex (for reference intakes)
            <select value={p.sex} onChange={(e) => set('sex', e.target.value as Profile['sex'])}>
              <option value="male">male</option>
              <option value="female">female</option>
            </select>
          </label>
          <label>
            Age
            <input {...num('age')} min={14} max={100} />
          </label>
          <label>
            Weight (kg)
            <input {...num('weightKg')} step={0.1} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Energy</h2>
        <div className="form-grid">
          <label>
            Baseline / BMR (kcal per day)
            <input {...num('bmrKcal')} step={10} />
          </label>
          <label>
            Estimate from height (cm)
            <span className="row">
              <input ref={heightRef} type="number" placeholder="180" />
              <button
                onClick={() => {
                  const h = Number(heightRef.current?.value);
                  if (h > 0) set('bmrKcal', mifflin(p, h));
                }}
              >
                Use Mifflin–St Jeor
              </button>
            </span>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={p.activityFromPreviousDay} onChange={(e) => set('activityFromPreviousDay', e.target.checked)} />
          Refuel mode: a day's target uses the <strong>previous</strong> day's watch kcal (enter yesterday's burn, eat for it today).
          Unchecked: same-day watch kcal.
        </label>
        <p className="small muted">
          Daily target = BMR + active kcal from your watch. Tip: many watches already include BMR in "total calories" — enter only
          the <em>active</em> calories.
        </p>
      </section>

      <section className="panel">
        <h2>Macro targets</h2>
        <div className="form-grid">
          <label>
            Protein (g per kg body weight)
            <input {...num('proteinPerKg')} step={0.1} />
            <span className="small muted">Endurance athletes: 1.2–2.0 g/kg</span>
          </label>
          <label>
            Fat (% of kcal)
            <input {...num('fatPct')} step={1} min={10} max={60} />
            <span className="small muted">Typical 20–35 %</span>
          </label>
        </div>
        <p className="small muted">
          Carbohydrates fill the remaining energy, so they rise with training load. Example with 600 active kcal: {Math.round(example.kcal)} kcal →
          protein {Math.round(example.protein)} g, fat {Math.round(example.fat)} g, carbs {Math.round(example.carbs)} g (
          {(example.carbs / p.weightKg).toFixed(1)} g/kg), fiber {example.fiber} g.
        </p>
      </section>

      <section className="panel">
        <h2>Micronutrient targets (per day)</h2>
        <p className="small muted">
          Defaults are the US National Academies RDA/AI for your sex and age. Override where your doctor or dietitian advises (e.g.
          iron for runners with low ferritin). Clear a field to return to the default.
        </p>
        <table className="table compact">
          <thead>
            <tr>
              <th>Nutrient</th>
              <th className="num">Default</th>
              <th>Your target</th>
              <th className="num">Upper limit</th>
            </tr>
          </thead>
          <tbody>
            {MICRO_KEYS.map((k) => {
              const def = NUTRIENT_BY_KEY[k];
              const override = p.microOverrides[k];
              return (
                <tr key={k}>
                  <td>{def.label}</td>
                  <td className="num muted">{defaults[k] !== undefined ? formatAmount(defaults[k]!, def.unit) : '–'}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className={override !== undefined ? 'overridden' : ''}
                      value={override ?? ''}
                      placeholder={targets[k] !== undefined ? String(targets[k]) : ''}
                      onChange={(e) =>
                        mutate((s) => {
                          if (e.target.value === '') delete s.profile.microOverrides[k];
                          else s.profile.microOverrides[k] = Math.max(0, Number(e.target.value));
                        })
                      }
                    />{' '}
                    <span className="small muted">{def.unit}</span>
                  </td>
                  <td className="num muted">{UPPER_LIMITS[k] !== undefined ? formatAmount(UPPER_LIMITS[k]!, def.unit) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Food database</h2>
        <label>
          USDA FoodData Central API key
          <input value={p.usdaApiKey} onChange={(e) => set('usdaApiKey', e.target.value.trim())} placeholder="DEMO_KEY" />
        </label>
        <p className="small muted">
          Free, takes a minute:{' '}
          <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noreferrer">
            fdc.nal.usda.gov/api-key-signup
          </a>
          . Without it the shared DEMO_KEY allows only a few searches per hour. Open Food Facts needs no key.
        </p>
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <div className="row">
          <button onClick={exportData}>Export all data (JSON)</button>
          <label className="button">
            Import backup…
            <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          </label>
        </div>
      </section>
    </div>
  );
}
