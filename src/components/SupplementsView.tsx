import { useState } from 'react';
import type { Mutate } from '../App';
import type { AppState, Supplement } from '../lib/types';
import { newId } from '../lib/storage';
import { NutrientEditor } from './NutrientEditor';

export function SupplementsView({ state, mutate }: { state: AppState; mutate: Mutate }) {
  const { showPrices, currency } = state.profile;
  const list = Object.values(state.supplements).sort((a, b) => a.name.localeCompare(b.name));
  const [selectedId, setSelectedId] = useState<string | null>(list[0]?.id ?? null);
  const supp = selectedId ? state.supplements[selectedId] : undefined;

  function create() {
    const id = newId();
    mutate((s) => {
      s.supplements[id] = { id, name: 'New supplement', doseLabel: 'capsule', perDose: {} };
    });
    setSelectedId(id);
  }

  return (
    <div className="split">
      <aside className="list-pane">
        <button className="primary block" onClick={create}>
          + New supplement
        </button>
        <ul className="nav-list">
          {list.map((s) => (
            <li key={s.id}>
              <button className={s.id === selectedId ? 'on' : ''} onClick={() => setSelectedId(s.id)}>
                <span>{s.name}</span>
                <span className="small muted">{s.doseLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="detail-pane">
        {supp ? (
          <SupplementEditor
            key={supp.id}
            supp={supp}
            mutate={mutate}
            onDeleted={() => setSelectedId(null)}
            showPrices={showPrices}
            currency={currency}
          />
        ) : (
          <div className="empty">
            <h2>Supplements</h2>
            <p>
              Add the supplements you take (iron, vitamin D, magnesium, electrolytes, gels…) with the amounts from the label. Drag
              them into the Supplements row of the week plan; they count towards your micronutrient chart.
            </p>
            <button className="primary" onClick={create}>
              + New supplement
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

interface EditorProps {
  supp: Supplement;
  mutate: Mutate;
  onDeleted: () => void;
  showPrices: boolean;
  currency: string;
}

function SupplementEditor({ supp, mutate, onDeleted, showPrices, currency }: EditorProps) {
  const edit = (fn: (s: Supplement) => void) =>
    mutate((s) => {
      fn(s.supplements[supp.id]);
    });

  function remove() {
    if (!confirm(`Delete "${supp.name}"? It will also be removed from all planned days.`)) return;
    mutate((s) => {
      delete s.supplements[supp.id];
      for (const day of Object.values(s.days))
        for (const k of Object.keys(day.slots) as (keyof typeof day.slots)[])
          day.slots[k] = day.slots[k]?.filter((e) => !(e.kind === 'supplement' && e.refId === supp.id));
    });
    onDeleted();
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <input className="title-input" value={supp.name} onChange={(e) => edit((s) => (s.name = e.target.value))} aria-label="Supplement name" />
        <label className="inline">
          Dose
          <input value={supp.doseLabel} onChange={(e) => edit((s) => (s.doseLabel = e.target.value))} placeholder="capsule" />
        </label>
        <button className="danger" onClick={remove}>
          Delete
        </button>
      </div>
      {showPrices && (
        <label className="inline price-row">
          Price per {supp.doseLabel || 'dose'}
          <input
            type="number"
            min={0}
            step="0.01"
            value={supp.pricePerDose ?? ''}
            placeholder="unknown"
            onChange={(e) =>
              edit((s) => (s.pricePerDose = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value))))
            }
          />
          {currency}
        </label>
      )}
      <h3>Nutrients per dose</h3>
      <p className="small muted">Enter what one dose contains, as printed on the label. Leave everything else empty.</p>
      <NutrientEditor values={supp.perDose} onChange={(v) => edit((s) => (s.perDose = v))} />
    </div>
  );
}
