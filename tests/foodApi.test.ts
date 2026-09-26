import { describe, expect, it } from 'vitest';
import { parseOffNutrients, parseUsdaNutrients, searchUsda, usdaFoodToFood } from '../src/lib/foodApi';

describe('USDA parsing', () => {
  it('parses search-format rows and converts units', () => {
    const n = parseUsdaNutrients([
      { nutrientNumber: '208', unitName: 'KCAL', value: 389 },
      { nutrientNumber: '268', unitName: 'kJ', value: 1630 },
      { nutrientNumber: '203', unitName: 'G', value: 16.9 },
      { nutrientNumber: '303', unitName: 'MG', value: 4.72 },
      { nutrientNumber: '317', unitName: 'UG', value: 28.9 },
      { nutrientNumber: '417', unitName: 'UG', value: 56 },
    ]);
    expect(n.kcal).toBe(389);
    expect(n.protein).toBe(16.9);
    expect(n.iron).toBe(4.72);
    expect(n.selenium).toBeCloseTo(28.9);
    // Folate falls back from DFE (435) to total folate (417).
    expect(n.folate).toBe(56);
  });

  it('parses details-format rows, IU vitamin D and missing energy', () => {
    const n = parseUsdaNutrients([
      { nutrient: { number: '203', unitName: 'g' }, amount: 10 },
      { nutrient: { number: '204', unitName: 'g' }, amount: 5 },
      { nutrient: { number: '205', unitName: 'g' }, amount: 20 },
      { nutrient: { number: '324', unitName: 'IU' }, amount: 400 },
      { nutrient: { number: '306', unitName: 'g' }, amount: 0.5 },
    ]);
    expect(n.vitD).toBe(10);
    expect(n.kcal).toBe(4 * 10 + 4 * 20 + 9 * 5);
    expect(n.potassium).toBe(500);
  });

  it('builds portions from details', () => {
    const f = usdaFoodToFood({
      fdcId: 123,
      description: 'Bananas, raw',
      dataType: 'SR Legacy',
      foodNutrients: [],
      foodPortions: [
        { gramWeight: 118, amount: 1, modifier: 'medium (7" to 7-7/8" long)' },
        { gramWeight: 150, amount: 1, measureUnit: { name: 'cup' }, modifier: 'sliced' },
        { gramWeight: 0, amount: 1, modifier: 'broken' },
      ],
    });
    expect(f.portions).toEqual([
      { label: '1 medium (7" to 7-7/8" long)', grams: 118 },
      { label: '1 cup sliced', grams: 150 },
    ]);
    expect(f.sourceId).toBe('123');
  });

  it('builds a search URL with key and data types', async () => {
    let called = '';
    await searchUsda(async (url) => ((called = url), { foods: [] }), 'rolled oats', 'KEY');
    const u = new URL(called);
    expect(u.pathname).toBe('/fdc/v1/foods/search');
    expect(u.searchParams.get('api_key')).toBe('KEY');
    expect(u.searchParams.get('dataType')).toContain('SR Legacy');
  });
});

describe('Open Food Facts parsing', () => {
  it('converts gram values to canonical units', () => {
    const n = parseOffNutrients({
      'energy-kcal_100g': 370,
      proteins_100g: '12.5',
      sodium_100g: 0.4,
      'vitamin-d_100g': 0.0000025,
      'vitamin-c_100g': 0.012,
    });
    expect(n.kcal).toBe(370);
    expect(n.protein).toBe(12.5);
    expect(n.sodium).toBeCloseTo(400);
    expect(n.vitD).toBeCloseTo(2.5);
    expect(n.vitC).toBeCloseTo(12);
  });

  it('falls back to kJ energy', () => {
    expect(parseOffNutrients({ energy_100g: 418.4 }).kcal).toBeCloseTo(100);
  });
});
