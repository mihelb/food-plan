import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import type { Mutate } from '../App';
import type { AppState, DayPlan, NutrientMap, PlanEntry, SlotKey } from '../lib/types';
import { SLOTS } from '../lib/types';
import { addDays, formatDay, fromIso, today, weekDates, weekStart } from '../lib/dates';
import {
  addInto,
  activeKcalFor,
  addCost,
  costTitle,
  formatCost,
  recipeCostPerServing,
  type Cost,
  entryName,
  ingredientGrams,
  recipePerServing,
  resolveDay,
  weekMicroStatus,
  type DayResult,
  type MacroTargets,
  type ResolvedEntry,
} from '../lib/calc';
import { MICRO_KEYS, UPPER_LIMITS } from '../lib/nutrients';
import { newId } from '../lib/storage';
import { MacroChart, MicroChart } from './Charts';
import { Modal } from './Modal';
import { NutrientTable } from './NutrientTable';

type DragPayload =
  | { type: 'new'; kind: PlanEntry['kind']; refId: string }
  | { type: 'move'; date: string; slot: SlotKey; entryId: string };

const MIME = 'application/x-foodplan';

function ensureDay(s: AppState, date: string): DayPlan {
  return (s.days[date] ??= { slots: {} });
}

interface Props {
  state: AppState;
  mutate: Mutate;
  goTo: (tab: 'recipes' | 'supplements' | 'profile') => void;
}

export function Planner({ state, mutate, goTo }: Props) {
  const [start, setStart] = useState(() => weekStart(today()));
  const dates = useMemo(() => weekDates(start), [start]);
  const [selected, setSelected] = useState(() => today());
  const selectedDate = dates.includes(selected) ? selected : dates[0];
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState<{ date: string; resolved: ResolvedEntry } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const results = useMemo(() => Object.fromEntries(dates.map((d) => [d, resolveDay(d, state)])) as Record<string, DayResult>, [dates, state]);
  const micro = useMemo(() => weekMicroStatus(dates, state, UPPER_LIMITS), [dates, state]);
  const incomplete = useMemo(() => incompleteFoods(dates, state), [dates, state]);

  const recipes = Object.values(state.recipes)
    .filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const supplements = Object.values(state.supplements).sort((a, b) => a.name.localeCompare(b.name));

  function onDrop(e: DragEvent, date: string, slot: SlotKey) {
    e.preventDefault();
    setDropTarget(null);
    const txt = e.dataTransfer.getData(MIME);
    if (!txt) return;
    const p = JSON.parse(txt) as DragPayload;
    const copy = e.ctrlKey;
    mutate((s) => {
      const target = (ensureDay(s, date).slots[slot] ??= []);
      if (p.type === 'new') {
        target.push({ id: newId(), kind: p.kind, refId: p.refId, amount: 1 });
        return;
      }
      const srcList = s.days[p.date]?.slots[p.slot];
      const idx = srcList?.findIndex((x) => x.id === p.entryId) ?? -1;
      if (!srcList || idx < 0) return;
      if (copy) target.push({ ...srcList[idx], id: newId() });
      else if (!(p.date === date && p.slot === slot)) target.push(srcList.splice(idx, 1)[0]);
    });
  }

  function updateEntry(date: string, slot: SlotKey, id: string, fn: (e: PlanEntry, list: PlanEntry[], s: AppState) => void) {
    mutate((s) => {
      const list = s.days[date]?.slots[slot];
      const e = list?.find((x) => x.id === id);
      if (list && e) fn(e, list, s);
    });
  }

  function copyToWeek(date: string, slot: SlotKey, entry: PlanEntry) {
    mutate((s) => {
      for (const d of dates) {
        if (d === date) continue;
        const list = (ensureDay(s, d).slots[slot] ??= []);
        if (!list.some((x) => x.kind === entry.kind && x.refId === entry.refId)) list.push({ ...entry, id: newId() });
      }
    });
  }

  function copyPreviousWeek() {
    if (!confirm('Replace the meals of this week with the meals of the previous week? Watch kcal stay untouched.')) return;
    mutate((s) => {
      for (const d of dates) {
        const prev = s.days[addDays(d, -7)];
        const day = ensureDay(s, d);
        day.slots = prev ? structuredClone(prev.slots) : {};
        for (const list of Object.values(day.slots)) for (const e of list ?? []) e.id = newId();
      }
    });
  }

  function clearWeek() {
    if (!confirm('Remove all meals and supplements from this week?')) return;
    mutate((s) => {
      for (const d of dates) if (s.days[d]) s.days[d].slots = {};
    });
  }

  const weekDays = dates.map((d) => results[d]);
  const week = {
    totals: weekDays.reduce<NutrientMap>((acc, d) => addInto(acc, d.totals), {}),
    targets: weekDays.reduce<MacroTargets>(
      (acc, d) => ({
        kcal: acc.kcal + d.targets.kcal,
        protein: acc.protein + d.targets.protein,
        carbs: acc.carbs + d.targets.carbs,
        fat: acc.fat + d.targets.fat,
        fiber: acc.fiber + d.targets.fiber,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    ),
  };

  const { showPrices, currency } = state.profile;
  const weekCost = weekDays.reduce<Cost>((acc, d) => addCost(acc, d.cost), { value: 0, missing: 0 });

  const sel = results[selectedDate];
  const selLabel = formatDay(selectedDate);

  return (
    <div className="planner">
      <aside className="sidebar">
        <h3>Recipes</h3>
        <input className="search" placeholder="Filter recipes…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <p className="hint">Drag onto a meal slot. Drag a planned meal to move it, hold Ctrl to copy.</p>
        <div className="drag-list">
          {recipes.map((r) => {
            const kcal = recipePerServing(r, state.foods).kcal ?? 0;
            const cost = recipeCostPerServing(r, state.foods);
            return (
              <div
                key={r.id}
                className="drag-item recipe"
                draggable
                onDragStart={(e) => e.dataTransfer.setData(MIME, JSON.stringify({ type: 'new', kind: 'recipe', refId: r.id } satisfies DragPayload))}
              >
                <span className="name">{r.name}</span>
                <span className="muted small" title={showPrices ? costTitle(cost) : undefined}>
                  {Math.round(kcal)} kcal/serving{showPrices && ` · ${formatCost(cost, currency)}`}
                </span>
              </div>
            );
          })}
          {recipes.length === 0 && (
            <button className="link" onClick={() => goTo('recipes')}>
              + Create your first recipe
            </button>
          )}
        </div>
        <h3>Supplements</h3>
        <div className="drag-list">
          {supplements.map((s) => (
            <div
              key={s.id}
              className="drag-item supplement"
              draggable
              onDragStart={(e) => e.dataTransfer.setData(MIME, JSON.stringify({ type: 'new', kind: 'supplement', refId: s.id } satisfies DragPayload))}
            >
              <span className="name">{s.name}</span>
              <span className="muted small">
                {s.doseLabel}
                {showPrices && ` · ${formatCost(s.pricePerDose === undefined ? { value: 0, missing: 1 } : { value: s.pricePerDose, missing: 0 }, currency)}`}
              </span>
            </div>
          ))}
          {supplements.length === 0 && (
            <button className="link" onClick={() => goTo('supplements')}>
              + Add a supplement
            </button>
          )}
        </div>
      </aside>

      <section className="week">
        <div className="week-toolbar">
          <button onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">
            ‹
          </button>
          <h2>
            Week of {fromIso(start).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          </h2>
          <button onClick={() => setStart(addDays(start, 7))} aria-label="Next week">
            ›
          </button>
          <button onClick={() => { setStart(weekStart(today())); setSelected(today()); }}>This week</button>
          <span className="spacer" />
          {showPrices && (
            <span className="week-cost" title={costTitle(weekCost)}>
              Week cost <strong>{formatCost(weekCost, currency)}</strong>
            </span>
          )}
          <button onClick={copyPreviousWeek}>Copy previous week</button>
          <button onClick={clearWeek}>Clear week</button>
        </div>

        <div className="grid" style={{ gridTemplateColumns: `110px repeat(7, minmax(150px, 1fr))` }}>
          <div className="corner">
            <div className="small muted">Watch kcal: active calories burned that day.</div>
            <div className="small muted">
              Target = BMR {state.profile.bmrKcal} + {state.profile.activityFromPreviousDay ? "previous day's" : "same day's"} active kcal
            </div>
          </div>
          {dates.map((d) => {
            const r = results[d];
            const f = formatDay(d);
            const kcal = r.totals.kcal ?? 0;
            const pct = r.targets.kcal > 0 ? kcal / r.targets.kcal : 0;
            return (
              <div
                key={d}
                className={`day-head ${d === selectedDate ? 'selected' : ''} ${d === today() ? 'today' : ''}`}
                onClick={() => setSelected(d)}
              >
                <div className="day-title">
                  <strong>{f.weekday}</strong> <span className="muted">{f.date}</span>
                </div>
                <label className="watch" onClick={(e) => e.stopPropagation()}>
                  <span className="small muted">Watch kcal</span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={state.days[d]?.activeKcal ?? ''}
                    placeholder="0"
                    onChange={(e) => {
                      const v = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value));
                      mutate((s) => {
                        ensureDay(s, d).activeKcal = v;
                      });
                    }}
                  />
                </label>
                <div className="kcal-line small">
                  <span>{Math.round(kcal)}</span>
                  <span className="muted"> / {Math.round(r.targets.kcal)} kcal</span>
                  {state.profile.activityFromPreviousDay && activeKcalFor(d, state.days, state.profile) > 0 && (
                    <span className="muted" title="Includes active kcal from the previous day"> ↺</span>
                  )}
                </div>
                {showPrices && r.entries.length > 0 && (
                  <div className="small muted" title={costTitle(r.cost)}>
                    Cost {formatCost(r.cost, currency)}
                  </div>
                )}
                <div className="mini-track" aria-hidden>
                  <div
                    className={`mini-fill ${pct > 1.1 ? 'status-over' : pct >= 0.95 ? 'status-good' : pct >= 0.8 ? 'status-warning' : 'status-critical'}`}
                    style={{ width: `${Math.min(pct, 1) * 100}%` }}
                  />
                </div>
                {r.warning && (
                  <div className="alert small" title={r.warning}>
                    ⚠ {r.warning}
                  </div>
                )}
              </div>
            );
          })}

          {SLOTS.map((slot) => (
            <SlotRow key={slot.key} label={slot.label}>
              {dates.map((d) => {
                const key = `${d}|${slot.key}`;
                const entries = results[d].entries.filter((x) => x.slot === slot.key);
                return (
                  <div
                    key={key}
                    className={`cell ${dropTarget === key ? 'drop' : ''} ${d === selectedDate ? 'selected' : ''}`}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(MIME)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
                      setDropTarget(key);
                    }}
                    onDragLeave={() => setDropTarget((t) => (t === key ? null : t))}
                    onDrop={(e) => onDrop(e, d, slot.key)}
                  >
                    {entries.map((re) => (
                      <EntryChip
                        key={re.entry.id}
                        state={state}
                        resolved={re}
                        onOpen={() => setDetail({ date: d, resolved: re })}
                        onDragStart={(e) =>
                          e.dataTransfer.setData(MIME, JSON.stringify({ type: 'move', date: d, slot: slot.key, entryId: re.entry.id } satisfies DragPayload))
                        }
                        onAmount={(v) => updateEntry(d, slot.key, re.entry.id, (e) => (e.amount = v))}
                        onToggleAuto={() => updateEntry(d, slot.key, re.entry.id, (e) => (e.auto = !e.auto))}
                        onRemove={() => updateEntry(d, slot.key, re.entry.id, (e, list) => list.splice(list.indexOf(e), 1))}
                        onCopyWeek={() => copyToWeek(d, slot.key, re.entry)}
                      />
                    ))}
                  </div>
                );
              })}
            </SlotRow>
          ))}
        </div>

        <div className="charts">
          <div className="chart-column">
            <div className="panel">
              <h3>
                Daily macros — {selLabel.weekday} {selLabel.date}
              </h3>
              <p className="small muted">Click a day header to switch. Bars run to 150 %; the line marks the target.</p>
              <MacroChart totals={sel.totals} targets={sel.targets} weightKg={state.profile.weightKg} />
            </div>
            <div className="panel">
              <h3>Weekly macros</h3>
              <p className="small muted">
                Whole week vs. the sum of each day's target, so a light day can be balanced by a heavier one. g/kg values are daily averages.
              </p>
              <MacroChart totals={week.totals} targets={week.targets} weightKg={state.profile.weightKg} days={dates.length} />
            </div>
          </div>
          <div className="panel">
            <h3>Weekly micronutrients</h3>
            <p className="small muted">Sum of all 7 days vs. 7 × daily reference intake (edit targets in Profile).</p>
            <MicroChart statuses={micro} days={dates.length} />
            {incomplete.length > 0 && (
              <p className="small muted footnote">
                ⓘ Missing micronutrient data for: {incomplete.slice(0, 6).join(', ')}
                {incomplete.length > 6 ? ` and ${incomplete.length - 6} more` : ''}. Their contribution is counted as 0, so real
                intake may be higher.
              </p>
            )}
          </div>
        </div>
      </section>

      {detail && <EntryDetail state={state} resolved={detail.resolved} onClose={() => setDetail(null)} />}
    </div>
  );
}

function SlotRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="slot-label">{label}</div>
      {children}
    </>
  );
}

interface ChipProps {
  state: AppState;
  resolved: ResolvedEntry;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onAmount: (v: number) => void;
  onToggleAuto: () => void;
  onRemove: () => void;
  onCopyWeek: () => void;
}

function EntryChip({ state, resolved, onOpen, onDragStart, onAmount, onToggleAuto, onRemove, onCopyWeek }: ChipProps) {
  const { entry, amount, nutrients } = resolved;
  const isRecipe = entry.kind === 'recipe';
  const unit = isRecipe ? 'srv' : state.supplements[entry.refId]?.doseLabel ?? 'dose';
  return (
    <div className={`chip ${entry.kind} ${entry.auto ? 'auto' : ''}`} draggable onDragStart={onDragStart}>
      <div className="chip-top">
        <button className="chip-name" onClick={onOpen} title="Show ingredients and nutrients">
          {entryName(entry, state)}
        </button>
        <button className="icon" onClick={onRemove} title="Remove" aria-label="Remove">
          ×
        </button>
      </div>
      <div className="chip-bottom">
        <input
          type="number"
          min={0}
          step={isRecipe ? 0.25 : 1}
          value={entry.amount}
          title={entry.auto ? 'Base amount — scaled automatically to hit the kcal target' : 'Amount'}
          onChange={(e) => onAmount(Math.max(0, Number(e.target.value)))}
        />
        {entry.auto ? (
          <span className="small scaled nowrap" title={`Auto-scaled to ${amount.toFixed(2)} ${unit}`}>
            → {amount.toFixed(2)}
          </span>
        ) : (
          <span className="small muted unit">{unit}</span>
        )}
        <span className="spacer" />
        {(isRecipe || (nutrients.kcal ?? 0) > 0) && <span className="small muted nowrap">{Math.round(nutrients.kcal ?? 0)} kcal</span>}
      </div>
      <div className="chip-actions">
        {isRecipe && (
          <button
            className={`toggle ${entry.auto ? 'on' : ''}`}
            onClick={onToggleAuto}
            title="Auto-adjust: scale this meal's quantity so the day hits its kcal target"
            aria-pressed={!!entry.auto}
          >
            ⚖ auto
          </button>
        )}
        <button className="toggle" onClick={onCopyWeek} title="Add this to the same slot on every day of the week">
          ⇉ all week
        </button>
      </div>
    </div>
  );
}

function EntryDetail({ state, resolved, onClose }: { state: AppState; resolved: ResolvedEntry; onClose: () => void }) {
  const { entry, amount, nutrients } = resolved;
  const recipe = entry.kind === 'recipe' ? state.recipes[entry.refId] : undefined;
  const supp = entry.kind === 'supplement' ? state.supplements[entry.refId] : undefined;
  return (
    <Modal title={entryName(entry, state)} onClose={onClose}>
      {recipe && (
        <>
          <p>
            {amount.toFixed(2)} of {recipe.servings} servings{entry.auto ? ' (auto-scaled)' : ''}. Quantities to prepare:
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recipe.ingredients.map((ing, i) => {
                const food = state.foods[ing.foodId];
                const factor = amount / recipe.servings;
                const grams = ingredientGrams(ing, food) * factor;
                return (
                  <tr key={i}>
                    <td>{food?.name ?? '(missing food)'}</td>
                    <td className="num">
                      {Math.round(grams)} g
                      {ing.portion && (
                        <span className="muted small">
                          {' '}
                          ({+(ing.quantity * factor).toFixed(2)} × {ing.portion})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {recipe.notes && <p className="notes">{recipe.notes}</p>}
        </>
      )}
      {supp && (
        <p>
          {amount} × {supp.doseLabel}
        </p>
      )}
      {state.profile.showPrices && (
        <p title={costTitle(resolved.cost)}>
          Cost: <strong>{formatCost(resolved.cost, state.profile.currency)}</strong>
        </p>
      )}
      <NutrientTable values={nutrients} />
    </Modal>
  );
}

/** Names of foods used this week that lack most micronutrient data. */
function incompleteFoods(dates: string[], state: AppState): string[] {
  const names = new Set<string>();
  for (const d of dates) {
    for (const list of Object.values(state.days[d]?.slots ?? {})) {
      for (const e of list ?? []) {
        if (e.kind !== 'recipe') continue;
        for (const ing of state.recipes[e.refId]?.ingredients ?? []) {
          const f = state.foods[ing.foodId];
          if (!f) continue;
          const known = MICRO_KEYS.filter((k) => f.per100g[k] !== undefined).length;
          if (known < MICRO_KEYS.length / 2) names.add(f.name);
        }
      }
    }
  }
  return [...names];
}
