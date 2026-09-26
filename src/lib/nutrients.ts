import type { Sex } from './types';

export type NutrientGroup = 'energy' | 'macro' | 'mineral' | 'vitamin' | 'other';

export interface NutrientDef {
  key: string;
  label: string;
  unit: 'kcal' | 'g' | 'mg' | 'µg';
  group: NutrientGroup;
  /** USDA FoodData Central nutrient numbers, in order of preference. */
  usda: string[];
  /** Open Food Facts nutriment key (without the _100g suffix). Values there are in grams, energy in kcal. */
  off?: string;
}

export const NUTRIENTS = [
  { key: 'kcal', label: 'Energy', unit: 'kcal', group: 'energy', usda: ['208', '958', '957'], off: 'energy-kcal' },
  { key: 'protein', label: 'Protein', unit: 'g', group: 'macro', usda: ['203'], off: 'proteins' },
  { key: 'carbs', label: 'Carbohydrates', unit: 'g', group: 'macro', usda: ['205', '205.2'], off: 'carbohydrates' },
  { key: 'fat', label: 'Fat', unit: 'g', group: 'macro', usda: ['204'], off: 'fat' },
  { key: 'fiber', label: 'Fiber', unit: 'g', group: 'macro', usda: ['291'], off: 'fiber' },
  { key: 'sugar', label: 'Sugars', unit: 'g', group: 'other', usda: ['269', '269.3'], off: 'sugars' },
  { key: 'satFat', label: 'Saturated fat', unit: 'g', group: 'other', usda: ['606'], off: 'saturated-fat' },
  { key: 'omega3', label: 'Omega-3 (ALA)', unit: 'g', group: 'other', usda: ['851', '619'], off: 'alpha-linolenic-acid' },

  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'mineral', usda: ['301'], off: 'calcium' },
  { key: 'iron', label: 'Iron', unit: 'mg', group: 'mineral', usda: ['303'], off: 'iron' },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'mineral', usda: ['304'], off: 'magnesium' },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', group: 'mineral', usda: ['305'], off: 'phosphorus' },
  { key: 'potassium', label: 'Potassium', unit: 'mg', group: 'mineral', usda: ['306'], off: 'potassium' },
  { key: 'sodium', label: 'Sodium', unit: 'mg', group: 'mineral', usda: ['307'], off: 'sodium' },
  { key: 'zinc', label: 'Zinc', unit: 'mg', group: 'mineral', usda: ['309'], off: 'zinc' },
  { key: 'copper', label: 'Copper', unit: 'mg', group: 'mineral', usda: ['312'], off: 'copper' },
  { key: 'manganese', label: 'Manganese', unit: 'mg', group: 'mineral', usda: ['315'], off: 'manganese' },
  { key: 'selenium', label: 'Selenium', unit: 'µg', group: 'mineral', usda: ['317'], off: 'selenium' },

  { key: 'vitA', label: 'Vitamin A (RAE)', unit: 'µg', group: 'vitamin', usda: ['320'], off: 'vitamin-a' },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg', group: 'vitamin', usda: ['401'], off: 'vitamin-c' },
  { key: 'vitD', label: 'Vitamin D', unit: 'µg', group: 'vitamin', usda: ['328'], off: 'vitamin-d' },
  { key: 'vitE', label: 'Vitamin E', unit: 'mg', group: 'vitamin', usda: ['323'], off: 'vitamin-e' },
  { key: 'vitK', label: 'Vitamin K', unit: 'µg', group: 'vitamin', usda: ['430'], off: 'vitamin-k' },
  { key: 'thiamin', label: 'Thiamin (B1)', unit: 'mg', group: 'vitamin', usda: ['404'], off: 'vitamin-b1' },
  { key: 'riboflavin', label: 'Riboflavin (B2)', unit: 'mg', group: 'vitamin', usda: ['405'], off: 'vitamin-b2' },
  { key: 'niacin', label: 'Niacin (B3)', unit: 'mg', group: 'vitamin', usda: ['406'], off: 'vitamin-pp' },
  { key: 'pantothenic', label: 'Pantothenic acid (B5)', unit: 'mg', group: 'vitamin', usda: ['410'], off: 'pantothenic-acid' },
  { key: 'b6', label: 'Vitamin B6', unit: 'mg', group: 'vitamin', usda: ['415'], off: 'vitamin-b6' },
  { key: 'folate', label: 'Folate (DFE)', unit: 'µg', group: 'vitamin', usda: ['435', '417'], off: 'vitamin-b9' },
  { key: 'b12', label: 'Vitamin B12', unit: 'µg', group: 'vitamin', usda: ['418'], off: 'vitamin-b12' },
  { key: 'choline', label: 'Choline', unit: 'mg', group: 'vitamin', usda: ['421'], off: 'choline' },
] as const satisfies readonly NutrientDef[];

export type NutrientKey = (typeof NUTRIENTS)[number]['key'];

export const NUTRIENT_BY_KEY: Record<NutrientKey, NutrientDef> = Object.fromEntries(
  NUTRIENTS.map((n) => [n.key, n]),
) as unknown as Record<NutrientKey, NutrientDef>;

/** Nutrients shown in the weekly micronutrient chart. */
export const MICRO_KEYS: NutrientKey[] = NUTRIENTS.filter(
  (n) => n.group === 'mineral' || n.group === 'vitamin' || n.key === 'omega3',
).map((n) => n.key);

/**
 * Daily reference intakes (RDA or AI) for adults, from the US National Academies DRI tables.
 * Values depend on sex and age; for runners many of these are a floor, not a ceiling.
 */
export function defaultMicroTargets(sex: Sex, age: number): Partial<Record<NutrientKey, number>> {
  const m = sex === 'male';
  const over50 = age > 50;
  const over30 = age > 30;
  return {
    omega3: m ? 1.6 : 1.1,
    calcium: !m && over50 ? 1200 : age > 70 ? 1200 : 1000,
    iron: m || over50 ? 8 : 18,
    magnesium: m ? (over30 ? 420 : 400) : over30 ? 320 : 310,
    phosphorus: 700,
    potassium: m ? 3400 : 2600,
    sodium: 1500,
    zinc: m ? 11 : 8,
    copper: 0.9,
    manganese: m ? 2.3 : 1.8,
    selenium: 55,
    vitA: m ? 900 : 700,
    vitC: m ? 90 : 75,
    vitD: age > 70 ? 20 : 15,
    vitE: 15,
    vitK: m ? 120 : 90,
    thiamin: m ? 1.2 : 1.1,
    riboflavin: m ? 1.3 : 1.1,
    niacin: m ? 16 : 14,
    pantothenic: 5,
    b6: over50 ? (m ? 1.7 : 1.5) : 1.3,
    folate: 400,
    b12: 2.4,
    choline: m ? 550 : 425,
  };
}

/** Tolerable upper intake levels (total intake) for adults, where one applies. */
export const UPPER_LIMITS: Partial<Record<NutrientKey, number>> = {
  calcium: 2500,
  iron: 45,
  phosphorus: 4000,
  zinc: 40,
  copper: 10,
  manganese: 11,
  selenium: 400,
  vitA: 3000,
  vitC: 2000,
  vitD: 100,
  vitE: 1000,
  b6: 100,
  choline: 3500,
};

/** Fiber adequate intake: 14 g per 1000 kcal. */
export function fiberTarget(kcal: number): number {
  return Math.round((kcal / 1000) * 14);
}

const UNIT_FACTORS: Record<string, number> = { g: 1, mg: 1e-3, µg: 1e-6, ug: 1e-6, mcg: 1e-6 };

/** Convert a mass value between g/mg/µg. Returns null for unknown units. */
export function convertMass(value: number, from: string, to: string): number | null {
  const f = UNIT_FACTORS[from.toLowerCase().replace('μ', 'µ')];
  const t = UNIT_FACTORS[to.toLowerCase().replace('μ', 'µ')];
  if (f === undefined || t === undefined) return null;
  return (value * f) / t;
}

export function formatAmount(value: number, unit: string): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 1 : 2;
  return `${value.toFixed(digits)} ${unit}`;
}
