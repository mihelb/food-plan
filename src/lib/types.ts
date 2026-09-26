import type { NutrientKey } from './nutrients';

/** Nutrient amounts in the canonical unit defined in nutrients.ts. Missing key = unknown. */
export type NutrientMap = Partial<Record<NutrientKey, number>>;

export interface Portion {
  label: string;
  grams: number;
}

export type FoodSource = 'usda' | 'off' | 'custom';

export interface Food {
  id: string;
  name: string;
  source: FoodSource;
  /** USDA fdcId or Open Food Facts barcode. */
  sourceId?: string;
  /** Extra info, e.g. USDA data type or brand. */
  detail?: string;
  /** Nutrients per 100 g. */
  per100g: NutrientMap;
  portions: Portion[];
}

export interface Ingredient {
  foodId: string;
  quantity: number;
  /** Portion label from food.portions, or null for grams. */
  portion: string | null;
}

export interface Recipe {
  id: string;
  name: string;
  /** Number of servings the ingredient list yields. */
  servings: number;
  ingredients: Ingredient[];
  notes?: string;
}

export interface Supplement {
  id: string;
  name: string;
  /** e.g. "1 capsule" */
  doseLabel: string;
  /** Nutrients per dose. */
  perDose: NutrientMap;
}

export const SLOTS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'snack1', label: 'Snack (AM)' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack2', label: 'Snack (PM)' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack3', label: 'Snack (evening)' },
  { key: 'supplements', label: 'Supplements' },
] as const;
export type SlotKey = (typeof SLOTS)[number]['key'];

export interface PlanEntry {
  id: string;
  kind: 'recipe' | 'supplement';
  refId: string;
  /** Servings (recipes) or doses (supplements). For auto entries this is the base amount. */
  amount: number;
  /** When true, the amount is scaled so the day's kcal hits the target. */
  auto?: boolean;
}

export interface DayPlan {
  slots: Partial<Record<SlotKey, PlanEntry[]>>;
  /** Active kcal reported by the watch for this date. */
  activeKcal?: number;
}

export type Sex = 'male' | 'female';

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  weightKg: number;
  /** Basal metabolic rate / baseline kcal per day. */
  bmrKcal: number;
  /** Protein target in g per kg body weight. */
  proteinPerKg: number;
  /** Fat target as % of total kcal. */
  fatPct: number;
  /** If true, a day's target uses the PREVIOUS day's watch kcal (refuel mode). */
  activityFromPreviousDay: boolean;
  /** Micro targets overriding the DRI defaults (canonical units). */
  microOverrides: NutrientMap;
  usdaApiKey: string;
}

export interface AppState {
  version: 1;
  profile: Profile;
  foods: Record<string, Food>;
  recipes: Record<string, Recipe>;
  supplements: Record<string, Supplement>;
  /** Keyed by ISO date (YYYY-MM-DD). */
  days: Record<string, DayPlan>;
}
