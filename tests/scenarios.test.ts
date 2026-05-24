import { describe, expect, test } from 'bun:test';
import { loadScenarios, validateScenario } from '../src/scenarios';

describe('validateScenario', () => {
  const valid = {
    id: 'x',
    title: 'X',
    set: 'Test',
    profile: ['hello'],
    rulesOfCorrespondence: [],
    inkPot: [{ inferior: 'a', superior: 'b' }],
    consequences: [
      { threshold: 0, text: 'a' },
      { threshold: 5, text: 'b' },
      { threshold: 8, text: 'c' },
      { threshold: 11, text: 'd' },
    ],
  };

  test('accepts a well-formed scenario', () => {
    expect(() => validateScenario(valid)).not.toThrow();
  });

  test('rejects missing thresholds', () => {
    const bad = {
      ...valid,
      consequences: [
        { threshold: 0, text: '' },
        { threshold: 5, text: '' },
        { threshold: 8, text: '' },
      ],
    };
    expect(() => validateScenario(bad)).toThrow(/thresholds/i);
  });

  test('rejects unknown modifier types', () => {
    const bad = {
      ...valid,
      rulesOfCorrespondence: [{ type: 'magic', attribute: 'heart', description: 'no' }],
    };
    expect(() => validateScenario(bad)).toThrow(/unknown modifier type/i);
  });

  test('accepts a narrative modifier', () => {
    const ok = {
      ...valid,
      rulesOfCorrespondence: [{ type: 'narrative', description: 'Player-enforced rule.' }],
    };
    expect(() => validateScenario(ok)).not.toThrow();
  });

  test('rejects narrative modifier with stray attribute field', () => {
    const bad = {
      ...valid,
      rulesOfCorrespondence: [
        { type: 'narrative', attribute: 'heart', description: 'oops, meant dice_bonus' },
      ],
    };
    expect(() => validateScenario(bad)).toThrow(/stray field/i);
  });

  test('rejects narrative modifier missing description', () => {
    const bad = {
      ...valid,
      rulesOfCorrespondence: [{ type: 'narrative' }],
    };
    expect(() => validateScenario(bad)).toThrow(/description/i);
  });

  test('rejects dice_bonus with non-integer amount', () => {
    const bad = {
      ...valid,
      rulesOfCorrespondence: [
        { type: 'dice_bonus', attribute: 'heart', amount: 1.5, description: 'x' },
      ],
    };
    expect(() => validateScenario(bad)).toThrow(/positive integer/i);
  });

  test('rejects dice_bonus with NaN amount', () => {
    const bad = {
      ...valid,
      rulesOfCorrespondence: [
        { type: 'dice_bonus', attribute: 'heart', amount: Number.NaN, description: 'x' },
      ],
    };
    expect(() => validateScenario(bad)).toThrow(/positive integer/i);
  });

  test('rejects dice_bonus with zero or negative amount', () => {
    const bad = {
      ...valid,
      rulesOfCorrespondence: [
        { type: 'dice_bonus', attribute: 'heart', amount: 0, description: 'x' },
      ],
    };
    expect(() => validateScenario(bad)).toThrow(/positive integer/i);
  });

  test('rejects dice_bonus appliesTo: null', () => {
    const bad = {
      ...valid,
      rulesOfCorrespondence: [
        {
          type: 'dice_bonus',
          attribute: 'heart',
          amount: 1,
          appliesTo: null,
          description: 'x',
        },
      ],
    };
    expect(() => validateScenario(bad)).toThrow(/appliesTo must be an object/i);
  });

  test('rejects dice_bonus appliesTo with empty characters array', () => {
    const bad = {
      ...valid,
      rulesOfCorrespondence: [
        {
          type: 'dice_bonus',
          attribute: 'heart',
          amount: 1,
          appliesTo: { characters: [] },
          description: 'x',
        },
      ],
    };
    expect(() => validateScenario(bad)).toThrow(/at least one id/i);
  });

  test('rejects dice_bonus appliesTo with unknown character id', () => {
    const bad = {
      ...valid,
      rulesOfCorrespondence: [
        {
          type: 'dice_bonus',
          attribute: 'heart',
          amount: 1,
          appliesTo: { characters: ['wizard'] },
          description: 'x',
        },
      ],
    };
    expect(() => validateScenario(bad)).toThrow(/unknown id\(s\): wizard/i);
  });

  test('rejects whitespace-only set field', () => {
    const bad = { ...valid, set: '   ' };
    expect(() => validateScenario(bad)).toThrow(/non-empty string/i);
  });

  test('trims surrounding whitespace from set field', () => {
    const ok = { ...valid, set: '  Trimmed Set  ' };
    const result = validateScenario(ok);
    expect(result.set).toBe('Trimmed Set');
  });

  test('rejects empty inkPot', () => {
    const bad = { ...valid, inkPot: [] };
    expect(() => validateScenario(bad)).toThrow(/inkPot/i);
  });
});

describe('loadScenarios', () => {
  test('loads and validates all bundled scenarios', () => {
    const ids = loadScenarios()
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual([
      'archduke',
      'art-dealer',
      'cruel-distance',
      'father',
      'forbidden-love',
      'king',
      'making-amends',
      'something-more',
      'winning-heart',
    ]);
  });

  test('every bundled scenario belongs to a known set', () => {
    const KNOWN_SETS = new Set(['Quill Rulebook', 'Love Letters']);
    const scenarios = loadScenarios();
    for (const sc of scenarios) {
      expect(KNOWN_SETS.has(sc.set)).toBe(true);
    }
  });
});
