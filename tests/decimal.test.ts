import { describe, expect, it } from 'vitest';
import { parseDecimal } from '../src/components/DecimalInput';

describe('parseDecimal', () => {
  it('accepts comma and dot as decimal separator', () => {
    expect(parseDecimal('2,49')).toBe(2.49);
    expect(parseDecimal('2.49')).toBe(2.49);
    expect(parseDecimal('0,')).toBe(0);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal(' 12 ')).toBe(12);
  });
  it('distinguishes empty from invalid', () => {
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal(',')).toBeNull();
  });
});
