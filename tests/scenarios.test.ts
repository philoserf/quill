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
      rulesOfCorrespondence: [{ type: 'magic', description: 'no' }],
    };
    expect(() => validateScenario(bad)).toThrow(/modifier/i);
  });

  test('rejects empty inkPot', () => {
    const bad = { ...valid, inkPot: [] };
    expect(() => validateScenario(bad)).toThrow(/inkPot/i);
  });
});

describe('loadScenarios', () => {
  test('loads and validates all 4 bundled rulebook scenarios', () => {
    const ids = loadScenarios()
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(['archduke', 'art-dealer', 'father', 'king']);
  });
});
