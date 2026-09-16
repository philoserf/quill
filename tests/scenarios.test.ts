import { describe, expect, test } from 'bun:test';
import { CHARACTERS } from '../src/data';
import { SCENARIOS } from '../src/scenarios';
import { PARAGRAPHS_PER_LETTER } from '../src/types';

// `SCENARIOS` is `Scenario`-typed, so tsc already enforces its shape: the modifier
// discriminant, attribute names, field types, and that no extra keys sneak in.
// These tests cover only what the type system cannot express.

describe('SCENARIOS', () => {
  test('contains exactly the four rulebook scenarios', () => {
    const ids = SCENARIOS.map((s) => s.id).sort();
    expect(ids).toEqual(['archduke', 'art-dealer', 'father', 'king']);
  });

  test('ids are unique', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  test('every ink pot holds at least one word per paragraph', () => {
    // A word is retired once used, and the ink pot is the only interactive
    // control during PICK_WORD. Fewer entries than paragraphs deadlocks the
    // play screen with no way out but clearing localStorage.
    const short = SCENARIOS.filter((s) => s.inkPot.length < PARAGRAPHS_PER_LETTER).map(
      (s) => `${s.id} has ${s.inkPot.length}`,
    );
    expect(short).toEqual([]);
  });

  test('every dice_bonus amount is a positive integer', () => {
    const bad = SCENARIOS.flatMap((s) =>
      s.rulesOfCorrespondence
        .filter((m) => m.type === 'dice_bonus')
        .filter((m) => !Number.isInteger(m.amount) || m.amount <= 0)
        .map((m) => `${s.id}: ${m.attribute} amount ${m.amount}`),
    );
    expect(bad).toEqual([]);
  });

  test('every appliesTo names a real character id', () => {
    // The only place scenario modifiers are joined to CHARACTERS. `Character.id`
    // is a plain string, so tsc cannot check this: renaming a character id would
    // otherwise silently stop a modifier ever applying.
    const known = new Set(CHARACTERS.map((c) => c.id));
    const unknown = SCENARIOS.flatMap((s) =>
      s.rulesOfCorrespondence.flatMap((m) =>
        (m.type === 'dice_bonus' ? (m.appliesTo?.characters ?? []) : [])
          .filter((id) => !known.has(id))
          .map((id) => `${s.id}: ${id}`),
      ),
    );
    expect(unknown).toEqual([]);
  });

  test('every scenario carries prose in all four tiers and a profile', () => {
    const empty = SCENARIOS.flatMap((s) => [
      ...(s.profile.length > 0 ? [] : [`${s.id}: empty profile`]),
      ...Object.entries(s.consequences)
        .filter(([, text]) => text.trim() === '')
        .map(([tier]) => `${s.id}: empty ${tier}`),
    ]);
    expect(empty).toEqual([]);
  });
});
