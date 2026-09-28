import { describe, expect, it } from 'vitest';
import { formatCost, recipeCostPerServing, resolveDay } from '../src/lib/calc';
import { normalizeState } from '../src/lib/storage';

/** A data file as written by the previous version (no prices, no theme/currency). */
const oldFile = {
  version: 1,
  profile: { name: 'Runner', sex: 'female', age: 28, weightKg: 58, bmrKcal: 1400, proteinPerKg: 1.6, fatPct: 25, activityFromPreviousDay: true, microOverrides: { iron: 25 }, usdaApiKey: 'KEY' },
  foods: {
    oats: { id: 'oats', name: 'Oats', source: 'usda', sourceId: '1', per100g: { kcal: 380, protein: 13 }, portions: [{ label: '1 cup', grams: 80 }] },
    milk: { id: 'milk', name: 'Milk', source: 'custom', per100g: { kcal: 60 }, portions: [] },
  },
  recipes: {
    porridge: { id: 'porridge', name: 'Porridge', servings: 2, ingredients: [{ foodId: 'oats', quantity: 1, portion: '1 cup' }, { foodId: 'milk', quantity: 400, portion: null }] },
  },
  supplements: { d3: { id: 'd3', name: 'D3', doseLabel: 'capsule', perDose: { vitD: 25 } } },
  days: {
    '2026-09-28': { activeKcal: 500, slots: { breakfast: [{ id: 'e1', kind: 'recipe', refId: 'porridge', amount: 1 }], supplements: [{ id: 'e2', kind: 'supplement', refId: 'd3', amount: 1 }] } },
  },
};

describe('loading older data files', () => {
  it('keeps all existing entries and adds defaults for new settings', () => {
    const s = normalizeState(JSON.parse(JSON.stringify(oldFile)));
    expect(Object.keys(s.foods)).toEqual(['oats', 'milk']);
    expect(s.recipes.porridge.ingredients).toHaveLength(2);
    expect(s.days['2026-09-28'].slots.breakfast).toHaveLength(1);
    expect(s.profile.name).toBe('Runner');
    expect(s.profile.microOverrides.iron).toBe(25);
    expect(s.profile.showPrices).toBe(true);
    expect(s.profile.currency).toBe('€');
    expect(s.profile.theme).toBe('system');
    expect(s.foods.oats.pricePer100g).toBeUndefined();
    // Everything still computes.
    expect(resolveDay('2026-09-28', s).totals.kcal).toBeCloseTo((304 + 240) / 2);
    expect(resolveDay('2026-09-28', s).cost).toEqual({ value: 0, missing: 3 });
  });

  it('survives damaged or partial entries', () => {
    const s = normalizeState({
      profile: null,
      foods: { a: { name: 'No nutrients' }, b: 'garbage', c: { name: 'Bad portions', per100g: { kcal: 'x', protein: 5 }, portions: [{ label: 'x' }, null] } },
      recipes: { r: { name: 'No ingredients' }, q: { name: 'Bad ingredient', servings: 0, ingredients: [null, { foodId: 'a' }] } },
      supplements: { s: {} },
      days: { d: { slots: { breakfast: [null, { kind: 'recipe', refId: 'r' }], lunch: 'nope' } } },
    });
    expect(s.foods.a).toMatchObject({ per100g: {}, portions: [], source: 'custom' });
    expect(s.foods.b).toBeUndefined();
    expect(s.foods.c.per100g).toEqual({ protein: 5 });
    expect(s.foods.c.portions).toEqual([]);
    expect(s.recipes.r.ingredients).toEqual([]);
    expect(s.recipes.q.servings).toBe(1);
    expect(s.recipes.q.ingredients).toEqual([{ foodId: 'a', quantity: 0, portion: null }]);
    expect(s.supplements.s).toMatchObject({ name: 'Unnamed supplement', perDose: {} });
    expect(s.days.d.slots.breakfast).toHaveLength(1);
    expect(s.days.d.slots.breakfast![0].amount).toBe(1);
    expect(() => resolveDay('d', s)).not.toThrow();
  });
});

describe('prices', () => {
  it('computes recipe, day and week costs', () => {
    const s = normalizeState(JSON.parse(JSON.stringify(oldFile)));
    s.foods.oats.pricePer100g = 0.25; // 80 g → 0.20
    s.foods.milk.pricePer100g = 0.1; // 400 g → 0.40
    s.supplements.d3.pricePerDose = 0.05;
    const per = recipeCostPerServing(s.recipes.porridge, s.foods);
    expect(per.value).toBeCloseTo(0.3);
    expect(per.missing).toBe(0);
    const day = resolveDay('2026-09-28', s);
    expect(day.cost.value).toBeCloseTo(0.35);
    expect(day.cost.missing).toBe(0);
  });

  it('scales cost with auto-adjusted amounts and flags missing prices', () => {
    const s = normalizeState(JSON.parse(JSON.stringify(oldFile)));
    s.foods.oats.pricePer100g = 0.25;
    s.days['2026-09-28'].slots.breakfast![0].amount = 2;
    const day = resolveDay('2026-09-28', s);
    expect(day.cost.value).toBeCloseTo(0.2); // 2 servings × 0.10 (oats only)
    expect(day.cost.missing).toBe(2); // milk + D3
    expect(formatCost(day.cost, '€')).toMatch(/^≥ 0[.,]20 €$/);
    expect(formatCost({ value: 0, missing: 1 }, '€')).toBe('–');
  });
});
