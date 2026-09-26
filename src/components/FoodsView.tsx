import { useState } from 'react';
import type { Mutate } from '../App';
import type { AppState, Food } from '../lib/types';
import { newId } from '../lib/storage';
import { FoodSearch } from './FoodSearch';
import { Modal } from './Modal';
import { NutrientEditor } from './NutrientEditor';

export function FoodsView({ state, mutate }: { state: AppState; mutate: Mutate }) {
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const foods = Object.values(state.foods)
    .filter((f) => f.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const food = selectedId ? state.foods[selectedId] : undefined;

  function createCustom() {
    const id = newId();
    mutate((s) => {
      s.foods[id] = { id, name: 'New food', source: 'custom', detail: 'Custom (per 100 g)', per100g: {}, portions: [] };
    });
    setSelectedId(id);
  }

  return (
    <div className="split">
      <aside className="list-pane">
        <button className="primary block" onClick={() => setImporting(true)}>
          + Import from database
        </button>
        <button className="block" onClick={createCustom}>
          + Custom food (from label)
        </button>
        <input className="search" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="nav-list">
          {foods.map((f) => (
            <li key={f.id}>
              <button className={f.id === selectedId ? 'on' : ''} onClick={() => setSelectedId(f.id)}>
                <span>{f.name}</span>
                <span className="small muted">{f.source.toUpperCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="detail-pane">
        {food ? (
          <FoodEditor key={food.id} food={food} state={state} mutate={mutate} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className="empty">
            <h2>Food library</h2>
            <p>
              Foods you import are stored locally, so recipes keep working offline. USDA FoodData Central has the most complete
              vitamin and mineral data; Open Food Facts covers packaged products (often without micronutrients). For anything
              else, create a custom food from its nutrition label.
            </p>
          </div>
        )}
      </section>
      {importing && (
        <Modal title="Import food" onClose={() => setImporting(false)} wide>
          <FoodSearch
            state={state}
            mutate={mutate}
            pickLabel="Import"
            onPick={(id) => {
              setSelectedId(id);
              setImporting(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function FoodEditor({ food, state, mutate, onDeleted }: { food: Food; state: AppState; mutate: Mutate; onDeleted: () => void }) {
  const edit = (fn: (f: Food) => void) =>
    mutate((s) => {
      fn(s.foods[food.id]);
    });
  const usedIn = Object.values(state.recipes).filter((r) => r.ingredients.some((i) => i.foodId === food.id));

  function remove() {
    if (usedIn.length > 0) {
      alert(`This food is used in: ${usedIn.map((r) => r.name).join(', ')}. Remove it from those recipes first.`);
      return;
    }
    if (!confirm(`Delete "${food.name}"?`)) return;
    mutate((s) => {
      delete s.foods[food.id];
    });
    onDeleted();
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <input className="title-input" value={food.name} onChange={(e) => edit((f) => (f.name = e.target.value))} aria-label="Food name" />
        <button className="danger" onClick={remove}>
          Delete
        </button>
      </div>
      <p className="small muted">
        {food.detail}
        {food.source === 'usda' && food.sourceId && (
          <>
            {' · '}
            <a href={`https://fdc.nal.usda.gov/food-details/${food.sourceId}/nutrients`} target="_blank" rel="noreferrer">
              FDC #{food.sourceId}
            </a>
          </>
        )}
        {food.source === 'off' && food.sourceId && (
          <>
            {' · '}
            <a href={`https://world.openfoodfacts.org/product/${food.sourceId}`} target="_blank" rel="noreferrer">
              barcode {food.sourceId}
            </a>
          </>
        )}
        {usedIn.length > 0 && ` · used in ${usedIn.length} recipe(s)`}
      </p>

      <h3>Portions</h3>
      <table className="table compact">
        <tbody>
          {food.portions.map((p, i) => (
            <tr key={i}>
              <td>
                <input
                  value={p.label}
                  onChange={(e) =>
                    mutate((s) => {
                      // Rename the portion and keep recipes that use it pointing at it.
                      const old = s.foods[food.id].portions[i].label;
                      s.foods[food.id].portions[i].label = e.target.value;
                      for (const r of Object.values(s.recipes))
                        for (const ing of r.ingredients) if (ing.foodId === food.id && ing.portion === old) ing.portion = e.target.value;
                    })
                  }
                />
              </td>
              <td>
                <input type="number" min={0} step="any" value={p.grams} onChange={(e) => edit((f) => (f.portions[i].grams = Math.max(0, Number(e.target.value))))} /> g
              </td>
              <td>
                <button className="icon" aria-label="Remove portion" onClick={() => edit((f) => f.portions.splice(i, 1))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => edit((f) => f.portions.push({ label: 'piece', grams: 50 }))}>+ Portion</button>

      <h3>Nutrients per 100 g</h3>
      <p className="small muted">Leave a field empty if unknown — it then counts as 0 and the planner flags it.</p>
      <NutrientEditor values={food.per100g} onChange={(v) => edit((f) => (f.per100g = v))} />
    </div>
  );
}
