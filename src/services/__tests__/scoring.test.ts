import { describe, expect, it } from 'vitest';
import {
  canonical10ToAnilistRaw,
  canonical10ToDisplayValue,
  canonical10ToMalInt,
  computeTasteAffinity,
  formatUserScore,
  fromFuzzyDate,
  inputToCanonical10,
  toFuzzyDate,
} from '../scoring';

describe('scoring conversions & taste affinity', () => {
  it('converts across 10-decimal, 100-pt, 5-star, and 10-int scales accurately', () => {
    expect(inputToCanonical10(8.5, 'POINT_10_DECIMAL')).toBe(8.5);
    expect(inputToCanonical10(87, 'POINT_100')).toBe(8.7);
    expect(inputToCanonical10(4.5, 'POINT_5')).toBe(9);
    expect(inputToCanonical10(8.6, 'POINT_10')).toBe(9);

    expect(canonical10ToDisplayValue(8.5, 'POINT_100')).toBe(85);
    expect(canonical10ToDisplayValue(9, 'POINT_5')).toBe(4.5);
    expect(formatUserScore(8.5, 'POINT_10_DECIMAL')).toBe('8.5/10');
    expect(formatUserScore(8.5, 'POINT_100')).toBe('85/100');

    expect(canonical10ToAnilistRaw(8.5)).toBe(85);
    expect(canonical10ToMalInt(8.6)).toBe(9);
  });

  it('parses and serializes fuzzy dates cleanly', () => {
    expect(toFuzzyDate('2026-11-17')).toEqual({ year: 2026, month: 11, day: 17 });
    expect(toFuzzyDate('bad-date')).toBeUndefined();
    expect(fromFuzzyDate({ year: 2026, month: 4, day: 2 })).toBe('2026-04-02');
    expect(fromFuzzyDate({ year: 2026, month: null, day: 2 })).toBeUndefined();
  });

  it('computes Pearson taste affinity across shared rated titles', () => {
    const mine = {
      a: { animeId: 'a', score: 10 },
      b: { animeId: 'b', score: 8 },
      c: { animeId: 'c', score: 5 },
      d: { animeId: 'd', score: 3 },
    };
    const identical = [
      { animeId: 'a', score: 10 },
      { animeId: 'b', score: 8 },
      { animeId: 'c', score: 5 },
      { animeId: 'd', score: 3 },
    ];
    const opposite = [
      { animeId: 'a', score: 3 },
      { animeId: 'b', score: 5 },
      { animeId: 'c', score: 8 },
      { animeId: 'd', score: 10 },
    ];

    expect(computeTasteAffinity(mine, identical).affinity).toBe(100);
    expect(computeTasteAffinity(mine, opposite).affinity).toBeLessThan(-95);
    expect(computeTasteAffinity(mine, [{ animeId: 'a', score: 9 }]).affinity).toBeNull();
  });
});
