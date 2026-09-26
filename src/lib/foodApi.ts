import { NUTRIENTS, convertMass, type NutrientKey } from './nutrients';
import type { Food, NutrientMap, Portion } from './types';

/**
 * Online food databases:
 *  - USDA FoodData Central (https://fdc.nal.usda.gov) — public domain, complete micronutrient
 *    profiles for Foundation / SR Legacy / Survey (FNDDS) foods. Needs a free api.data.gov key
 *    (DEMO_KEY works but is heavily rate limited).
 *  - Open Food Facts (https://world.openfoodfacts.org) — open database of packaged products,
 *    no key needed; micronutrients are often missing.
 */

export type JsonFetcher = (url: string) => Promise<unknown>;

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
const OFF_BASE = 'https://world.openfoodfacts.org';

/** A food nutrient row in either the search format or the details format of FDC. */
interface UsdaNutrientRow {
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
  amount?: number;
  nutrient?: { number?: string; name?: string; unitName?: string };
}

interface UsdaFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: UsdaNutrientRow[];
  foodPortions?: {
    gramWeight?: number;
    amount?: number;
    modifier?: string;
    portionDescription?: string;
    measureUnit?: { name?: string; abbreviation?: string };
  }[];
}

function rowNumber(r: UsdaNutrientRow): string | undefined {
  return r.nutrientNumber ?? r.nutrient?.number;
}
function rowUnit(r: UsdaNutrientRow): string {
  return (r.unitName ?? r.nutrient?.unitName ?? '').toLowerCase();
}
function rowValue(r: UsdaNutrientRow): number | undefined {
  const v = r.value ?? r.amount;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Convert FDC nutrient rows (per 100 g) into our canonical nutrient map. */
export function parseUsdaNutrients(rows: UsdaNutrientRow[]): NutrientMap {
  const byNumber = new Map<string, UsdaNutrientRow>();
  for (const r of rows) {
    const num = rowNumber(r);
    if (!num || rowValue(r) === undefined) continue;
    // Energy is reported both in kcal and kJ under different numbers; ignore kJ rows.
    if (rowUnit(r) === 'kj') continue;
    if (!byNumber.has(num)) byNumber.set(num, r);
  }

  const out: NutrientMap = {};
  for (const def of NUTRIENTS) {
    for (const num of def.usda) {
      const r = byNumber.get(num);
      if (!r) continue;
      const v = rowValue(r)!;
      const unit = rowUnit(r);
      let converted: number | null;
      if (def.unit === 'kcal') converted = v;
      else converted = convertMass(v, unit || def.unit, def.unit);
      if (converted !== null) {
        out[def.key as NutrientKey] = converted;
        break;
      }
    }
  }
  // Vitamin D sometimes only in IU (number 324): 1 µg = 40 IU.
  if (out.vitD === undefined) {
    const iu = byNumber.get('324');
    if (iu) out.vitD = rowValue(iu)! / 40;
  }
  // Some Foundation foods lack an energy row; estimate with Atwater factors.
  if (out.kcal === undefined && (out.protein !== undefined || out.fat !== undefined || out.carbs !== undefined)) {
    out.kcal = 4 * (out.protein ?? 0) + 4 * (out.carbs ?? 0) + 9 * (out.fat ?? 0);
  }
  return out;
}

function usdaPortions(f: UsdaFood): Portion[] {
  const portions: Portion[] = [];
  for (const p of f.foodPortions ?? []) {
    if (!p.gramWeight || p.gramWeight <= 0) continue;
    let label = p.portionDescription;
    if (!label || label === 'Quantity not specified') {
      const unitName = p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
      label = [p.amount ?? 1, unitName, p.modifier ?? ''].join(' ').replace(/\s+/g, ' ').trim();
    }
    if (!label) continue;
    // gramWeight is the weight of the whole described portion (e.g. "2 slices").
    portions.push({ label, grams: p.gramWeight });
  }
  if (f.servingSize && f.servingSizeUnit?.toLowerCase() === 'g') {
    portions.push({ label: `serving (${f.householdServingFullText ?? `${f.servingSize} g`})`, grams: f.servingSize });
  }
  return dedupePortions(portions);
}

function dedupePortions(portions: Portion[]): Portion[] {
  const seen = new Set<string>();
  return portions.filter((p) => (seen.has(p.label) ? false : (seen.add(p.label), true)));
}

export function usdaFoodToFood(f: UsdaFood): Omit<Food, 'id'> {
  const brand = f.brandOwner ?? f.brandName;
  return {
    name: f.description,
    source: 'usda',
    sourceId: String(f.fdcId),
    detail: [f.dataType, brand].filter(Boolean).join(' · '),
    per100g: parseUsdaNutrients(f.foodNutrients ?? []),
    portions: usdaPortions(f),
  };
}

export async function searchUsda(
  fetchJson: JsonFetcher,
  query: string,
  apiKey: string,
  includeBranded = false,
): Promise<Omit<Food, 'id'>[]> {
  const types = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
  if (includeBranded) types.push('Branded');
  const params = new URLSearchParams({
    api_key: apiKey || 'DEMO_KEY',
    query,
    pageSize: '25',
    dataType: types.join(','),
  });
  const res = (await fetchJson(`${USDA_BASE}/foods/search?${params}`)) as { foods?: UsdaFood[] };
  return (res.foods ?? []).map(usdaFoodToFood);
}

/** Fetch full details (including household portions) for one FDC food. */
export async function getUsdaFood(fetchJson: JsonFetcher, fdcId: string, apiKey: string): Promise<Omit<Food, 'id'>> {
  const params = new URLSearchParams({ api_key: apiKey || 'DEMO_KEY' });
  const res = (await fetchJson(`${USDA_BASE}/food/${encodeURIComponent(fdcId)}?${params}`)) as UsdaFood;
  return usdaFoodToFood(res);
}

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string>;
}

export function parseOffNutrients(nutriments: Record<string, number | string>): NutrientMap {
  const out: NutrientMap = {};
  for (const def of NUTRIENTS) {
    if (!def.off) continue;
    const raw = nutriments[`${def.off}_100g`];
    const v = typeof raw === 'string' ? parseFloat(raw) : raw;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (def.unit === 'kcal') out[def.key as NutrientKey] = v;
    else out[def.key as NutrientKey] = convertMass(v, 'g', def.unit)!;
  }
  if (out.kcal === undefined) {
    const kj = Number(nutriments['energy_100g']);
    if (Number.isFinite(kj) && kj > 0) out.kcal = kj / 4.184;
  }
  return out;
}

export function offProductToFood(p: OffProduct): Omit<Food, 'id'> {
  const portions: Portion[] = [];
  const sq = typeof p.serving_quantity === 'string' ? parseFloat(p.serving_quantity) : p.serving_quantity;
  if (sq && sq > 0) portions.push({ label: `serving (${p.serving_size ?? `${sq} g`})`, grams: sq });
  return {
    name: p.product_name?.trim() || `Product ${p.code ?? ''}`.trim(),
    source: 'off',
    sourceId: p.code,
    detail: ['Open Food Facts', p.brands].filter(Boolean).join(' · '),
    per100g: parseOffNutrients(p.nutriments ?? {}),
    portions,
  };
}

export async function searchOpenFoodFacts(fetchJson: JsonFetcher, query: string): Promise<Omit<Food, 'id'>[]> {
  const q = query.trim();
  if (/^\d{8,14}$/.test(q)) {
    const res = (await fetchJson(`${OFF_BASE}/api/v2/product/${q}.json`)) as { product?: OffProduct; status?: number };
    return res.product ? [offProductToFood({ code: q, ...res.product })] : [];
  }
  const params = new URLSearchParams({
    search_terms: q,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '25',
    fields: 'code,product_name,brands,serving_quantity,serving_size,nutriments',
  });
  const res = (await fetchJson(`${OFF_BASE}/cgi/search.pl?${params}`)) as { products?: OffProduct[] };
  return (res.products ?? []).filter((p) => p.product_name).map(offProductToFood);
}

/** How many of the tracked micronutrients a food has data for (0..1). */
export function microCoverage(per100g: NutrientMap, microKeys: readonly NutrientKey[]): number {
  if (microKeys.length === 0) return 1;
  return microKeys.filter((k) => per100g[k] !== undefined).length / microKeys.length;
}
