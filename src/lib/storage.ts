import type { AppState, DayPlan, Food, Ingredient, NutrientMap, PlanEntry, Portion, Profile, Recipe, SlotKey, Supplement } from './types';

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
  showPrices: true,
  currency: '€',
};

export function emptyState(): AppState {
  return { version: 1, profile: { ...DEFAULT_PROFILE }, foods: {}, recipes: {}, supplements: {}, days: {} };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

/** Keep only finite numeric nutrient values. */
function cleanNutrients(v: unknown): NutrientMap {
  const out: NutrientMap = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) if (num(x) !== undefined) out[k as keyof NutrientMap] = x as number;
  return out;
}

/** Keep only well-formed records of a collection, giving each its key as id. */
function cleanRecord<T>(v: unknown, fix: (x: Record<string, unknown>, id: string) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObj(v)) return out;
  for (const [id, x] of Object.entries(v)) {
    if (!isObj(x)) continue;
    const fixed = fix(x, id);
    if (fixed) out[id] = fixed;
  }
  return out;
}

/**
 * Fill in missing fields so files from older versions (or edited by hand) always load.
 * New optional fields (e.g. prices) simply stay undefined for existing entries.
 */
export function normalizeState(raw: unknown): AppState {
  const base = emptyState();
  if (!isObj(raw)) return base;
  const s = raw as Partial<AppState>;
  const profile: Profile = { ...base.profile, ...(isObj(s.profile) ? s.profile : {}) };
  profile.microOverrides = cleanNutrients(profile.microOverrides);
  if (typeof profile.showPrices !== 'boolean') profile.showPrices = base.profile.showPrices;
  profile.currency = str(profile.currency, base.profile.currency);

  const foods = cleanRecord<Food>(s.foods, (f, id) => ({
    ...(f as unknown as Food),
    id,
    name: str(f.name, 'Unnamed food'),
    source: f.source === 'usda' || f.source === 'off' ? f.source : 'custom',
    per100g: cleanNutrients(f.per100g),
    portions: Array.isArray(f.portions)
      ? (f.portions as Portion[]).filter((p) => isObj(p) && typeof p.label === 'string' && num(p.grams) !== undefined)
      : [],
    pricePer100g: num(f.pricePer100g),
  }));

  const recipes = cleanRecord<Recipe>(s.recipes, (r, id) => ({
    ...(r as unknown as Recipe),
    id,
    name: str(r.name, 'Unnamed recipe'),
    servings: num(r.servings) && (r.servings as number) > 0 ? (r.servings as number) : 1,
    ingredients: Array.isArray(r.ingredients)
      ? (r.ingredients as Ingredient[])
          .filter((i) => isObj(i) && typeof i.foodId === 'string')
          .map((i) => ({ foodId: i.foodId, quantity: num(i.quantity) ?? 0, portion: typeof i.portion === 'string' ? i.portion : null }))
      : [],
  }));

  const supplements = cleanRecord<Supplement>(s.supplements, (x, id) => ({
    ...(x as unknown as Supplement),
    id,
    name: str(x.name, 'Unnamed supplement'),
    doseLabel: str(x.doseLabel, 'dose'),
    perDose: cleanNutrients(x.perDose),
    pricePerDose: num(x.pricePerDose),
  }));

  const days = cleanRecord<DayPlan>(s.days, (d) => {
    const slots: DayPlan['slots'] = {};
    if (isObj(d.slots))
      for (const [slot, list] of Object.entries(d.slots)) {
        if (!Array.isArray(list)) continue;
        slots[slot as SlotKey] = (list as PlanEntry[])
          .filter((e) => isObj(e) && (e.kind === 'recipe' || e.kind === 'supplement') && typeof e.refId === 'string')
          .map((e) => ({ ...e, id: typeof e.id === 'string' ? e.id : newId(), amount: num(e.amount) ?? 1 }));
      }
    return { slots, activeKcal: num(d.activeKcal) };
  });

  return { version: 1, profile, foods, recipes, supplements, days };
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
