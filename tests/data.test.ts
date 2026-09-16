import { describe, expect, test } from 'bun:test';
import { CHARACTERS, SKILLS } from '../src/data';
import { ATTRIBUTES } from '../src/types';

// `src/data.ts` is a literal array, so most assertions about it restate the
// file above them — `tsc` already rejects an invalid rating, and a non-empty
// literal is non-empty. What survives here are the two claims about the domain
// that the types do not make.

describe('CHARACTERS', () => {
  test('contains exactly 6 archetypes from the rulebook', () => {
    // The exact ids are the authors saying this list is closed.
    const ids = CHARACTERS.map((c) => c.id).sort();
    expect(ids).toEqual(['aristocrat', 'courtier', 'knight', 'monk', 'poet', 'scholar']);
  });
});

describe('SKILLS', () => {
  test('every attribute has exactly one skill that boosts it', () => {
    // Not a restatement of the literal: two skills boosting Penmanship and none
    // boosting Heart would leave an attribute the player can never help, and
    // nothing else in the codebase would notice.
    const boosted = SKILLS.map((s) => s.bonusAttribute).sort();
    expect(boosted).toEqual([...ATTRIBUTES].sort());
  });
});
