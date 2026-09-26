import { describe, expect, it } from 'vitest';
import { macroTargets, recipePerServing, resolveDay, weekMicroStatus, AUTO_MAX_FACTOR } from '../src/lib/calc';
import { emptyState } from '../src/lib/storage';
import { UPPER_LIMITS } from '../src/lib/nutrients';
import { weekDates } from '../src/lib/dates';
import type { AppState } from '../src/lib/types';

function fixture(): AppState {
  const s = emptyState();
  s.profile = { ...s.profile, bmrKcal: 1800, weightKg: 70, proteinPerKg: 1.6, fatPct: 25, activityFromPreviousDay: false };
  s.foods.oats = {
    id: 'oats', name: 'Oats', source: 'custom', portions: [{ label: 'cup', grams: 80 }],
    per100g: { kcal: 380, protein: 13, carbs: 67, fat: 7, iron: 4, magnesium: 140 },
  };
  s.foods.milk = { id: 'milk', name: 'Milk', source: 'custom', portions: [], per100g: { kcal: 60, protein: 3.4, calcium: 120 } };
  s.recipes.porridge = {
    id: 'porridge', name: 'Porridge', servings: 2,
    ingredients: [{ foodId: 'oats', quantity: 2, portion: 'cup' }, { foodId: 'milk', quantity: 500, portion: null }],
  };
  s.supplements.fe = { id: 'fe', name: 'Iron', doseLabel: 'tablet', perDose: { iron: 20 } };
  return s;
}

describe('recipes', () => {
  it('computes nutrients per serving including portions', () => {
    const per = recipePerServing(fixture().recipes.porridge, fixture().foods);
    // 160 g oats (608 kcal) + 500 g milk (300 kcal) = 908 / 2 servings
    expect(per.kcal).toBeCloseTo(454);
    expect(per.calcium).toBeCloseTo(300);
    expect(per.iron).toBeCloseTo(3.2);
  });
});

describe('targets', () => {
  it('adds watch kcal to BMR and fills carbs', () => {
    const t = macroTargets(fixture().profile, 700);
    expect(t.kcal).toBe(2500);
    expect(t.protein).toBeCloseTo(112);
    expect(t.fat).toBeCloseTo((2500 * 0.25) / 9);
    expect(t.carbs * 4 + t.protein * 4 + t.fat * 9).toBeCloseTo(2500);
    expect(t.fiber).toBe(35);
  });

  it('uses the previous day activity in refuel mode', () => {
    const s = fixture();
    s.profile.activityFromPreviousDay = true;
    s.days['2026-09-21'] = { slots: {}, activeKcal: 900 };
    expect(resolveDay('2026-09-22', s).targets.kcal).toBe(2700);
    expect(resolveDay('2026-09-21', s).targets.kcal).toBe(1800);
  });
});

describe('auto scaling', () => {
  it('scales auto entries so the day hits its target', () => {
    const s = fixture();
    s.days['2026-09-21'] = {
      activeKcal: 200,
      slots: {
        breakfast: [{ id: 'a', kind: 'recipe', refId: 'porridge', amount: 1 }],
        dinner: [{ id: 'b', kind: 'recipe', refId: 'porridge', amount: 1, auto: true }],
        supplements: [{ id: 'c', kind: 'supplement', refId: 'fe', amount: 1 }],
      },
    };
    const r = resolveDay('2026-09-21', s);
    expect(r.totals.kcal).toBeCloseTo(2000);
    expect(r.autoFactor).toBeCloseTo((2000 - 454) / 454);
    expect(r.warning).toBeUndefined();
    expect(r.totals.iron).toBeCloseTo(3.2 * (1 + r.autoFactor) + 20);
  });

  it('clamps and warns when the target is unreachable', () => {
    const s = fixture();
    s.profile.bmrKcal = 10000;
    s.days['2026-09-21'] = { slots: { lunch: [{ id: 'a', kind: 'recipe', refId: 'porridge', amount: 1, auto: true }] } };
    const r = resolveDay('2026-09-21', s);
    expect(r.autoFactor).toBe(AUTO_MAX_FACTOR);
    expect(r.warning).toBeDefined();
  });
});

describe('weekly micros', () => {
  it('sums the week and reports what is missing', () => {
    const s = fixture();
    const dates = weekDates('2026-09-21');
    for (const d of dates) s.days[d] = { slots: { supplements: [{ id: d, kind: 'supplement', refId: 'fe', amount: 3 }] } };
    const st = weekMicroStatus(dates, s, UPPER_LIMITS);
    const iron = st.find((x) => x.key === 'iron')!;
    expect(iron.total).toBe(420);
    expect(iron.target).toBe(56);
    expect(iron.missing).toBe(0);
    expect(iron.overUpper).toBe(true); // 60 mg/day > 45 mg UL
    const calcium = st.find((x) => x.key === 'calcium')!;
    expect(calcium.missing).toBe(7000);
  });
});
