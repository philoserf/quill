import { describe, expect, test } from 'bun:test';
import { countSuccesses, diceForRating, roll } from '../src/dice';

describe('diceForRating', () => {
  test('poor → 1, average → 2, good → 3', () => {
    expect(diceForRating('poor')).toBe(1);
    expect(diceForRating('average')).toBe(2);
    expect(diceForRating('good')).toBe(3);
  });
});

describe('roll', () => {
  test('returns N dice values in [1,6]', () => {
    const out = roll(5);
    expect(out).toHaveLength(5);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  test('uses injected RNG deterministically', () => {
    let i = 0;
    const seq = [0.0, 0.99, 0.5, 0.16, 0.83]; // → 1, 6, 4, 1, 5
    const rng = () => seq[i++] ?? 0;
    expect(roll(5, rng)).toEqual([1, 6, 4, 1, 5]);
  });

  test('returns empty array for n=0', () => {
    expect(roll(0)).toEqual([]);
  });
});

describe('countSuccesses', () => {
  test('counts 5s and 6s', () => {
    expect(countSuccesses([1, 2, 3, 4])).toBe(0);
    expect(countSuccesses([5])).toBe(1);
    expect(countSuccesses([6])).toBe(1);
    expect(countSuccesses([5, 6, 5, 1])).toBe(3);
  });
});
