import { describe, expect, test } from 'bun:test';
import { loadScenarios, validateScenario } from '../src/scenarios';

describe('validateScenario', () => {
  const valid = {
    id: 'x',
    title: 'X',
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
    expect(ids).toEqual(['archduke', 'art-dealer', 'father', 'king']);
  });
});
