import { describe, expect, test } from 'bun:test';
import { CHARACTERS, SKILLS } from '../src/data';

describe('CHARACTERS', () => {
  test('contains exactly 6 archetypes from the rulebook', () => {
    const ids = CHARACTERS.map((c) => c.id).sort();
    expect(ids).toEqual(['aristocrat', 'courtier', 'knight', 'monk', 'poet', 'scholar']);
  });

  test('each character has all three attributes set to a valid rating', () => {
    for (const c of CHARACTERS) {
      for (const attr of ['penmanship', 'language', 'heart'] as const) {
        expect(['poor', 'average', 'good']).toContain(c.attributes[attr]);
      }
    }
  });

  test('each character has at least one paragraph of flavor text', () => {
    for (const c of CHARACTERS) {
      expect(c.flavor.length).toBeGreaterThan(0);
    }
  });
});

describe('SKILLS', () => {
  test('contains exactly 3 skills, one per attribute', () => {
    expect(SKILLS).toHaveLength(3);
    const bonusAttrs = SKILLS.map((s) => s.bonusAttribute).sort();
    expect(bonusAttrs).toEqual(['heart', 'language', 'penmanship']);
  });
});
