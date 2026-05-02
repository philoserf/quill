import { describe, expect, test } from 'bun:test';
import { validateScenario } from '../src/scenarios';

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

describe('loadScenarios (integration with public/scenarios)', () => {
  test('loads all 4 rulebook scenarios from disk via fs (no fetch needed in test)', async () => {
    const fs = await import('node:fs/promises');
    const manifest = JSON.parse(
      await fs.readFile('public/scenarios/manifest.json', 'utf-8'),
    ) as string[];
    const ids: string[] = [];
    for (const f of manifest) {
      const raw: unknown = JSON.parse(await fs.readFile(`public/scenarios/${f}`, 'utf-8'));
      const scenario = validateScenario(raw);
      ids.push(scenario.id);
    }
    expect(ids.sort()).toEqual(['archduke', 'art-dealer', 'father', 'king']);
  });
});
