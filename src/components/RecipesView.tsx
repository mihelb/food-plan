import { useState } from 'react';
import type { Mutate } from '../App';
import type { AppState, Recipe } from '../lib/types';
import { costTitle, formatCost, ingredientGrams, recipeCostPerServing, recipeCostTotal, recipePerServing } from '../lib/calc';
import { newId } from '../lib/storage';
import { FoodSearch } from './FoodSearch';
import { Modal } from './Modal';
import { NutrientTable } from './NutrientTable';
import { DecimalInput } from './DecimalInput';

export function RecipesView({ state, mutate }: { state: AppState; mutate: Mutate }) {
  const list = Object.values(state.recipes).sort((a, b) => a.name.localeCompare(b.name));
  const [selectedId, setSelectedId] = useState<string | null>(list[0]?.id ?? null);
  const recipe = selectedId ? state.recipes[selectedId] : undefined;

  function create() {
    const id = newId();
    mutate((s) => {
      s.recipes[id] = { id, name: 'New recipe', servings: 1, ingredients: [] };
    });
    setSelectedId(id);
  }

  return (
    <div className="split">
      <aside className="list-pane">
        <button className="primary block" onClick={create}>
          + New recipe
        </button>
        <ul className="nav-list">
          {list.map((r) => (
            <li key={r.id}>
              <button className={r.id === selectedId ? 'on' : ''} onClick={() => setSelectedId(r.id)}>
                <span>{r.name}</span>
                <span className="small muted">
                  {Math.round(recipePerServing(r, state.foods).kcal ?? 0)} kcal
                  {state.profile.showPrices && ` · ${formatCost(recipeCostPerServing(r, state.foods), state.profile.currency)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="detail-pane">
        {recipe ? (
          <RecipeEditor key={recipe.id} recipe={recipe} state={state} mutate={mutate} onDeleted={() => setSelectedId(null)} onDuplicated={setSelectedId} />
        ) : (
          <div className="empty">
            <h2>Recipes</h2>
            <p>Build recipes from foods in the USDA / Open Food Facts databases. Nutrients are calculated automatically per serving.</p>
            <button className="primary" onClick={create}>
              + New recipe
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

interface EditorProps {
  recipe: Recipe;
  state: AppState;
  mutate: Mutate;
  onDeleted: () => void;
  onDuplicated: (id: string) => void;
}

function RecipeEditor({ recipe, state, mutate, onDeleted, onDuplicated }: EditorProps) {
  const [adding, setAdding] = useState(false);
  const per = recipePerServing(recipe, state.foods);
  const { showPrices, currency } = state.profile;
  const costPer = recipeCostPerServing(recipe, state.foods);
  const costTotal = recipeCostTotal(recipe, state.foods);
  const edit = (fn: (r: Recipe) => void) =>
    mutate((s) => {
      fn(s.recipes[recipe.id]);
    });

  function remove() {
    if (!confirm(`Delete "${recipe.name}"? It will also be removed from all planned days.`)) return;
    mutate((s) => {
      delete s.recipes[recipe.id];
      for (const day of Object.values(s.days))
        for (const k of Object.keys(day.slots) as (keyof typeof day.slots)[])
          day.slots[k] = day.slots[k]?.filter((e) => !(e.kind === 'recipe' && e.refId === recipe.id));
    });
    onDeleted();
  }

  function duplicate() {
    const id = newId();
    mutate((s) => {
      s.recipes[id] = { ...structuredClone(recipe), id, name: `${recipe.name} (copy)` };
    });
    onDuplicated(id);
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <input className="title-input" value={recipe.name} onChange={(e) => edit((r) => (r.name = e.target.value))} aria-label="Recipe name" />
        <label className="inline">
          Servings
          <DecimalInput required min={1} value={recipe.servings} onChange={(v) => edit((r) => (r.servings = v ?? 1))} />
        </label>
        <button onClick={duplicate}>Duplicate</button>
        <button className="danger" onClick={remove}>
          Delete
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Ingredient</th>
            <th>Quantity</th>
            <th>Unit</th>
            <th className="num">Grams</th>
            <th className="num">kcal</th>
            {showPrices && <th className="num">Price</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {recipe.ingredients.map((ing, i) => {
            const food = state.foods[ing.foodId];
            const grams = ingredientGrams(ing, food);
            return (
              <tr key={i}>
                <td>
                  {food?.name ?? <span className="alert">missing food</span>}
                  {food && <div className="small muted">{food.detail}</div>}
                </td>
                <td>
                  <DecimalInput required className="qty" value={ing.quantity} onChange={(v) => edit((r) => (r.ingredients[i].quantity = v ?? 0))} />
                </td>
                <td>
                  <select
                    value={ing.portion ?? ''}
                    onChange={(e) =>
                      edit((r) => {
                        const next = e.target.value || null;
                        const ingr = r.ingredients[i];
                        // Keep the same weight when switching units.
                        const g = ingredientGrams(ingr, food);
                        const p = food?.portions.find((x) => x.label === next);
                        ingr.portion = next;
                        ingr.quantity = p ? +(g / p.grams).toFixed(2) : Math.round(g);
                      })
                    }
                  >
                    <option value="">g</option>
                    {food?.portions.map((p) => (
                      <option key={p.label} value={p.label}>
                        {p.label} ({Math.round(p.grams)} g)
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">{Math.round(grams)}</td>
                <td className="num">{Math.round(((food?.per100g.kcal ?? 0) * grams) / 100)}</td>
                {showPrices && (
                  <td className="num" title={food?.pricePer100g === undefined ? 'No price — set it under Foods' : undefined}>
                    {food?.pricePer100g === undefined ? (
                      <span className="muted">–</span>
                    ) : (
                      formatCost({ value: (food.pricePer100g * grams) / 100, missing: 0 }, currency)
                    )}
                  </td>
                )}
                <td>
                  <button className="icon" aria-label="Remove ingredient" onClick={() => edit((r) => r.ingredients.splice(i, 1))}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="primary" onClick={() => setAdding(true)}>
        + Add ingredient
      </button>

      <label className="block-label">
        Notes / preparation
        <textarea rows={3} value={recipe.notes ?? ''} onChange={(e) => edit((r) => (r.notes = e.target.value))} />
      </label>

      <h3>Per serving</h3>
      <div className="macro-summary">
        <Stat label="Energy" value={`${Math.round(per.kcal ?? 0)} kcal`} />
        <Stat label="Protein" value={`${(per.protein ?? 0).toFixed(1)} g`} />
        <Stat label="Carbs" value={`${(per.carbs ?? 0).toFixed(1)} g`} />
        <Stat label="Fat" value={`${(per.fat ?? 0).toFixed(1)} g`} />
        <Stat label="Fiber" value={`${(per.fiber ?? 0).toFixed(1)} g`} />
        {showPrices && (
          <Stat
            label="Price"
            value={formatCost(costPer, currency)}
            hint={`${formatCost(costTotal, currency)} whole recipe${costPer.missing > 0 ? ` · ${costPer.missing} without price` : ''}`}
            title={costTitle(costPer)}
          />
        )}
      </div>
      <NutrientTable values={per} />

      {adding && (
        <Modal title="Add ingredient" onClose={() => setAdding(false)} wide>
          <FoodSearch
            state={state}
            mutate={mutate}
            onPick={(foodId) => {
              edit((r) => r.ingredients.push({ foodId, quantity: 100, portion: null }));
              setAdding(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, hint, title }: { label: string; value: string; hint?: string; title?: string }) {
  return (
    <div className="stat" title={title}>
      <div className="small muted">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="small muted">{hint}</div>}
    </div>
  );
}
