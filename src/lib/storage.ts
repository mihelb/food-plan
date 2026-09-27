import type { AppState, Profile } from './types';

export const DEFAULT_PROFILE: Profile = {
  name: '',
  sex: 'male',
  age: 30,
  weightKg: 70,
  bmrKcal: 1700,
  proteinPerKg: 1.6,
  fatPct: 25,
  activityFromPreviousDay: true,
  microOverrides: {},
  usdaApiKey: 'DEMO_KEY',
  theme: 'system',
};

export function emptyState(): AppState {
  return { version: 1, profile: { ...DEFAULT_PROFILE }, foods: {}, recipes: {}, supplements: {}, days: {} };
}

/** Fill in missing fields so older or hand-edited files keep working. */
export function normalizeState(raw: unknown): AppState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<AppState>;
  return {
    version: 1,
    profile: { ...base.profile, ...(s.profile ?? {}), microOverrides: { ...(s.profile?.microOverrides ?? {}) } },
    foods: s.foods ?? {},
    recipes: s.recipes ?? {},
    supplements: s.supplements ?? {},
    days: s.days ?? {},
  };
}

interface Bridge {
  loadState(): Promise<unknown>;
  saveState(state: AppState): Promise<void>;
  saveStateSync(state: AppState): void;
  fetchJson(url: string): Promise<unknown>;
}

declare global {
  interface Window {
    foodplan?: Bridge;
  }
}

const LS_KEY = 'foodplan-state';

/** Load from the Electron data file, or localStorage when running in a plain browser. */
export async function loadState(): Promise<AppState> {
  if (window.foodplan) return normalizeState(await window.foodplan.loadState());
  try {
    const txt = localStorage.getItem(LS_KEY);
    return normalizeState(txt ? JSON.parse(txt) : null);
  } catch {
    return emptyState();
  }
}

export async function saveState(state: AppState): Promise<void> {
  if (window.foodplan) return window.foodplan.saveState(state);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

/** Blocking save used when the window closes, so the last edit is never lost. */
export function saveStateNow(state: AppState): void {
  if (window.foodplan) window.foodplan.saveStateSync(state);
  else {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }
}

export async function fetchJson(url: string): Promise<unknown> {
  if (window.foodplan) {
    try {
      return await window.foodplan.fetchJson(url);
    } catch (e) {
      // Drop Electron's "Error invoking remote method …" prefix.
      throw new Error(String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
