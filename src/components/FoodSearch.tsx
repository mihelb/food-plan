import { useState } from 'react';
import type { Mutate } from '../App';
import type { AppState, Food } from '../lib/types';
import { getUsdaFood, microCoverage, searchOpenFoodFacts, searchUsda } from '../lib/foodApi';
import { MICRO_KEYS } from '../lib/nutrients';
import { fetchJson, newId } from '../lib/storage';

type Source = 'local' | 'usda' | 'off';

interface Props {
  state: AppState;
  mutate: Mutate;
  /** Called with the id of the chosen (possibly just imported) food. */
  onPick: (foodId: string) => void;
  pickLabel?: string;
}

export function FoodSearch({ state, mutate, onPick, pickLabel = 'Add' }: Props) {
  const hasLocal = Object.keys(state.foods).length > 0;
  const [source, setSource] = useState<Source>(hasLocal ? 'local' : 'usda');
  const [query, setQuery] = useState('');
  const [branded, setBranded] = useState(false);
  const [results, setResults] = useState<Omit<Food, 'id'>[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const local = Object.values(state.foods)
    .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 50);

  async function search() {
    if (!query.trim() || source === 'local') return;
    setBusy('search');
    setError(null);
    try {
      setResults(
        source === 'usda'
          ? await searchUsda(fetchJson, query, state.profile.usdaApiKey, branded)
          : await searchOpenFoodFacts(fetchJson, query),
      );
    } catch (e) {
      setResults([]);
      setError(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function importFood(f: Omit<Food, 'id'>) {
    const existing = Object.values(state.foods).find((x) => x.source === f.source && x.sourceId && x.sourceId === f.sourceId);
    if (existing) return onPick(existing.id);
    let full = f;
    if (f.source === 'usda' && f.sourceId) {
      setBusy(f.sourceId);
      try {
        // Details add household portions (cup, slice, …) that search results lack.
        const details = await getUsdaFood(fetchJson, f.sourceId, state.profile.usdaApiKey);
        full = { ...details, per100g: Object.keys(details.per100g).length >= Object.keys(f.per100g).length ? details.per100g : f.per100g };
      } catch {
        /* fall back to the search result data */
      } finally {
        setBusy(null);
      }
    }
    const id = newId();
    mutate((s) => {
      s.foods[id] = { ...full, id };
    });
    onPick(id);
  }

  return (
    <div className="food-search">
      <div className="seg" role="tablist">
        <button className={source === 'local' ? 'on' : ''} onClick={() => setSource('local')}>
          My foods ({Object.keys(state.foods).length})
        </button>
        <button className={source === 'usda' ? 'on' : ''} onClick={() => { setSource('usda'); setResults([]); }}>
          USDA FoodData Central
        </button>
        <button className={source === 'off' ? 'on' : ''} onClick={() => { setSource('off'); setResults([]); }}>
          Open Food Facts
        </button>
      </div>
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          className="search"
          autoFocus
          placeholder={source === 'off' ? 'Product name or barcode…' : source === 'usda' ? 'e.g. oats, raw spinach, salmon…' : 'Filter my foods…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {source !== 'local' && (
          <button type="submit" className="primary" disabled={busy === 'search'}>
            {busy === 'search' ? 'Searching…' : 'Search'}
          </button>
        )}
      </form>
      {source === 'usda' && (
        <label className="small check">
          <input type="checkbox" checked={branded} onChange={(e) => setBranded(e.target.checked)} /> include branded products (fewer micronutrients)
        </label>
      )}
      {error && <div className="alert">{error}</div>}
      <ul className="results">
        {(source === 'local' ? local : results).map((f, i) => {
          const cov = microCoverage(f.per100g, MICRO_KEYS);
          return (
            <li key={'id' in f ? (f.id as string) : `${f.sourceId}-${i}`}>
              <div className="grow">
                <div>{f.name}</div>
                <div className="small muted">
                  {f.detail || f.source} · {Math.round(f.per100g.kcal ?? 0)} kcal · P {fmt(f.per100g.protein)} · C {fmt(f.per100g.carbs)} · F{' '}
                  {fmt(f.per100g.fat)} per 100 g
                </div>
              </div>
              <span className={`badge ${cov >= 0.7 ? 'good' : cov >= 0.3 ? 'mid' : 'low'}`} title="Share of tracked micronutrients with data">
                micros {Math.round(cov * 100)}%
              </span>
              <button
                disabled={busy !== null}
                onClick={() => ('id' in f ? onPick((f as Food).id) : importFood(f))}
              >
                {busy === f.sourceId ? '…' : pickLabel}
              </button>
            </li>
          );
        })}
      </ul>
      {source === 'local' && local.length === 0 && <p className="muted small">No saved foods match. Search USDA or Open Food Facts.</p>}
      {source === 'usda' && state.profile.usdaApiKey === 'DEMO_KEY' && (
        <p className="small muted">
          Using the shared DEMO_KEY (a few searches per hour). Get a free personal key at{' '}
          <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noreferrer">
            fdc.nal.usda.gov/api-key-signup
          </a>{' '}
          and enter it under Profile.
        </p>
      )}
    </div>
  );
}

function fmt(v: number | undefined) {
  return v === undefined ? '–' : `${v.toFixed(1)} g`;
}
