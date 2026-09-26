import { MICRO_KEYS, NUTRIENTS, defaultMicroTargets, fiberTarget, type NutrientKey } from './nutrients';
import type { AppState, DayPlan, Food, Ingredient, NutrientMap, PlanEntry, Profile, Recipe, SlotKey } from './types';
import { addDays } from './dates';

export function addInto(target: NutrientMap, src: NutrientMap, factor = 1): NutrientMap {
  for (const k in src) {
    const key = k as NutrientKey;
    const v = src[key];
    if (v === undefined) continue;
    target[key] = (target[key] ?? 0) + v * factor;
  }
  return target;
}

export function ingredientGrams(ing: Ingredient, food: Food | undefined): number {
  if (!ing.portion) return ing.quantity;
  const p = food?.portions.find((x) => x.label === ing.portion);
  return ing.quantity * (p?.grams ?? 0);
}

/** Total nutrients for the whole recipe (all servings). */
export function recipeTotal(recipe: Recipe, foods: Record<string, Food>): NutrientMap {
  const total: NutrientMap = {};
  for (const ing of recipe.ingredients) {
    const food = foods[ing.foodId];
    if (!food) continue;
    addInto(total, food.per100g, ingredientGrams(ing, food) / 100);
  }
  return total;
}

export function recipePerServing(recipe: Recipe, foods: Record<string, Food>): NutrientMap {
  const total = recipeTotal(recipe, foods);
  return addInto({}, total, 1 / Math.max(recipe.servings, 1e-9));
}

/** Nutrients for one unit of a plan entry (one serving / one dose). */
export function entryUnitNutrients(entry: PlanEntry, state: Pick<AppState, 'recipes' | 'supplements' | 'foods'>): NutrientMap {
  if (entry.kind === 'recipe') {
    const r = state.recipes[entry.refId];
    return r ? recipePerServing(r, state.foods) : {};
  }
  return state.supplements[entry.refId]?.perDose ?? {};
}

export function entryName(entry: PlanEntry, state: Pick<AppState, 'recipes' | 'supplements'>): string {
  if (entry.kind === 'recipe') return state.recipes[entry.refId]?.name ?? '(deleted recipe)';
  return state.supplements[entry.refId]?.name ?? '(deleted supplement)';
}

export interface MacroTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/** Active kcal that counts towards the target of `date`. */
export function activeKcalFor(date: string, days: Record<string, DayPlan>, profile: Profile): number {
  const src = profile.activityFromPreviousDay ? addDays(date, -1) : date;
  return days[src]?.activeKcal ?? 0;
}

/**
 * Daily targets for a runner: kcal = BMR + watch active kcal; protein by g/kg; fat by % kcal;
 * carbohydrates fill the remaining energy (the fuel that scales with training load).
 */
export function macroTargets(profile: Profile, activeKcal: number): MacroTargets {
  const kcal = Math.max(0, profile.bmrKcal + activeKcal);
  const protein = profile.proteinPerKg * profile.weightKg;
  const fat = (kcal * profile.fatPct) / 100 / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return { kcal, protein, carbs, fat, fiber: fiberTarget(kcal) };
}

export function microTargets(profile: Profile): Partial<Record<NutrientKey, number>> {
  return { ...defaultMicroTargets(profile.sex, profile.age), ...profile.microOverrides };
}

export const AUTO_MIN_FACTOR = 0.25;
export const AUTO_MAX_FACTOR = 4;

export interface ResolvedEntry {
  entry: PlanEntry;
  slot: SlotKey;
  /** Effective amount after auto-scaling. */
  amount: number;
  nutrients: NutrientMap;
}

export interface DayResult {
  entries: ResolvedEntry[];
  totals: NutrientMap;
  targets: MacroTargets;
  /** Scale factor applied to auto entries (1 if none). */
  autoFactor: number;
  /** Set when auto-scaling could not hit the target. */
  warning?: string;
}

/**
 * Resolve a day: entries marked `auto` are scaled by one common factor so that the day's
 * total energy matches the kcal target, within [AUTO_MIN_FACTOR, AUTO_MAX_FACTOR].
 */
export function resolveDay(date: string, state: AppState): DayResult {
  const day = state.days[date];
  const targets = macroTargets(state.profile, activeKcalFor(date, state.days, state.profile));
  const raw: { entry: PlanEntry; slot: SlotKey; unit: NutrientMap }[] = [];
  for (const [slot, list] of Object.entries(day?.slots ?? {})) {
    for (const entry of list ?? []) raw.push({ entry, slot: slot as SlotKey, unit: entryUnitNutrients(entry, state) });
  }

  let fixedKcal = 0;
  let autoKcal = 0;
  for (const r of raw) {
    const kcal = (r.unit.kcal ?? 0) * r.entry.amount;
    if (r.entry.auto) autoKcal += kcal;
    else fixedKcal += kcal;
  }

  let autoFactor = 1;
  let warning: string | undefined;
  if (autoKcal > 0) {
    const wanted = (targets.kcal - fixedKcal) / autoKcal;
    autoFactor = Math.min(AUTO_MAX_FACTOR, Math.max(AUTO_MIN_FACTOR, wanted));
    if (wanted < AUTO_MIN_FACTOR) warning = 'Fixed meals already exceed the target — adjustable meals are at their minimum.';
    else if (wanted > AUTO_MAX_FACTOR) warning = 'Target too high for the adjustable meals — they are at 4× their base amount.';
  }

  const totals: NutrientMap = {};
  const entries: ResolvedEntry[] = raw.map((r) => {
    const amount = r.entry.auto ? r.entry.amount * autoFactor : r.entry.amount;
    const nutrients = addInto({}, r.unit, amount);
    addInto(totals, nutrients);
    return { entry: r.entry, slot: r.slot, amount, nutrients };
  });
  return { entries, totals, targets, autoFactor, warning };
}

export interface MicroStatus {
  key: NutrientKey;
  total: number;
  target: number;
  pct: number;
  missing: number;
  /** Daily average exceeds the tolerable upper limit. */
  overUpper: boolean;
}

export function weekMicroStatus(
  weekDates: string[],
  state: AppState,
  upperLimits: Partial<Record<NutrientKey, number>>,
): MicroStatus[] {
  const totals: NutrientMap = {};
  for (const d of weekDates) addInto(totals, resolveDay(d, state).totals);
  const targets = microTargets(state.profile);
  return MICRO_KEYS.filter((k) => targets[k] !== undefined).map((key) => {
    const target = targets[key]! * weekDates.length;
    const total = totals[key] ?? 0;
    const ul = upperLimits[key];
    return {
      key,
      total,
      target,
      pct: target > 0 ? total / target : 1,
      missing: Math.max(0, target - total),
      overUpper: ul !== undefined && total / weekDates.length > ul,
    };
  });
}

/** Nutrient keys with values, in display order. */
export function orderedKeys(map: NutrientMap): NutrientKey[] {
  return NUTRIENTS.map((n) => n.key).filter((k) => map[k] !== undefined);
}
