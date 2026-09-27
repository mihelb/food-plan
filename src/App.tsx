import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from './lib/types';
import { loadState, saveState, saveStateNow } from './lib/storage';
import { Planner } from './components/Planner';
import { RecipesView } from './components/RecipesView';
import { FoodsView } from './components/FoodsView';
import { SupplementsView } from './components/SupplementsView';
import { ProfileView } from './components/ProfileView';

export type Mutate = (fn: (draft: AppState) => void) => void;

const TABS = [
  { key: 'planner', label: 'Week plan' },
  { key: 'recipes', label: 'Recipes' },
  { key: 'foods', label: 'Foods' },
  { key: 'supplements', label: 'Supplements' },
  { key: 'profile', label: 'Profile & targets' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>('planner');
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadState().then((s) => {
      setState(s);
      // First start: guide the user to their profile.
      if (Object.keys(s.recipes).length === 0 && Object.keys(s.foods).length === 0 && !s.profile.name) setTab('profile');
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      saveState(state).then(
        () => setSaveError(null),
        (e) => setSaveError(String(e)),
      );
    }, 400);
  }, [state]);

  // Flush a pending save when the window closes.
  const latest = useRef<AppState | null>(null);
  latest.current = state;
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current !== undefined && latest.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = undefined;
        saveStateNow(latest.current);
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  const theme = state?.profile.theme ?? 'system';
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const mutate: Mutate = useCallback((fn) => {
    setState((prev) => {
      if (!prev) return prev;
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  if (!state) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◐
          </span>
          FoodPlan
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="theme-switch" role="radiogroup" aria-label="Theme">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              className={theme === t ? 'on' : ''}
              onClick={() => mutate((s) => void (s.profile.theme = t))}
            >
              {t === 'light' ? '☀ Light' : t === 'dark' ? '☾ Dark' : 'Auto'}
            </button>
          ))}
        </div>
        {saveError && <div className="save-error">Could not save: {saveError}</div>}
      </header>
      <main className="content">
        {tab === 'planner' && <Planner state={state} mutate={mutate} goTo={setTab} />}
        {tab === 'recipes' && <RecipesView state={state} mutate={mutate} />}
        {tab === 'foods' && <FoodsView state={state} mutate={mutate} />}
        {tab === 'supplements' && <SupplementsView state={state} mutate={mutate} />}
        {tab === 'profile' && <ProfileView state={state} mutate={mutate} />}
      </main>
    </div>
  );
}
