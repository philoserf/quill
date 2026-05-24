import { describe, expect, test } from 'bun:test';
import { score } from '../src/scoring';
import type { ConsequenceTier, GameSession, Paragraph, Scenario } from '../src/types';

const consequences: ConsequenceTier[] = [
  { threshold: 0, text: 'bad' },
  { threshold: 5, text: 'tepid' },
  { threshold: 8, text: 'good' },
  { threshold: 11, text: 'great' },
];

const scenario: Scenario = {
  id: 's',
  title: 'S',
  set: 'Test',
  profile: [],
  rulesOfCorrespondence: [],
  inkPot: [],
  consequences,
};

function para(overrides: Partial<Paragraph>): Paragraph {
  return {
    inkPotIndex: 0,
    attemptedFlourish: false,
    flourishAdjective: null,
    heartRoll: null,
    languageRoll: [3],
    penmanshipRoll: [3],
    skillUsedHere: null,
    text: '',
    ...overrides,
  };
}

function session(paragraphs: Paragraph[]): GameSession {
  return {
    id: 'g',
    startedAt: '2026-05-01',
    characterId: 'monk',
    skillId: 'illumination',
    scenarioId: 's',
    skillSpent: false,
    paragraphs,
    status: 'finished',
  };
}

describe('score', () => {
  test('plain inferior word + failed penmanship → 0 points', () => {
    const r = score(session([para({ languageRoll: [2], penmanshipRoll: [1] })]), scenario);
    expect(r.paragraphs[0]).toBe(0);
  });

  test('plain superior + successful penmanship → 2 points', () => {
    const r = score(session([para({ languageRoll: [5], penmanshipRoll: [6] })]), scenario);
    expect(r.paragraphs[0]).toBe(2);
  });

  test('flourished superior + successful penmanship → 3 points', () => {
    const r = score(
      session([
        para({
          attemptedFlourish: true,
          flourishAdjective: 'solemn',
          heartRoll: [5],
          languageRoll: [6],
          penmanshipRoll: [5],
        }),
      ]),
      scenario,
    );
    expect(r.paragraphs[0]).toBe(3);
  });

  test('flourished inferior → -1, plus penmanship 0 → -1', () => {
    const r = score(
      session([
        para({
          attemptedFlourish: true,
          flourishAdjective: 'gallant',
          heartRoll: [6],
          languageRoll: [2],
          penmanshipRoll: [3],
        }),
      ]),
      scenario,
    );
    expect(r.paragraphs[0]).toBe(-1);
  });

  test('flourish attempted but Heart failed → no flourish, plain word scoring', () => {
    const r = score(
      session([
        para({
          attemptedFlourish: true,
          flourishAdjective: 'solemn',
          heartRoll: [3, 2],
          languageRoll: [5],
          penmanshipRoll: [3],
        }),
      ]),
      scenario,
    );
    // Heart failed → flourish doesn't apply. Superior word still scores +1.
    expect(r.paragraphs[0]).toBe(1);
  });

  test('penmanship caps at +1 even with multiple successes', () => {
    const r = score(session([para({ languageRoll: [2], penmanshipRoll: [5, 6, 5] })]), scenario);
    expect(r.paragraphs[0]).toBe(1);
  });

  test('totals across paragraphs and resolves to favourable tier', () => {
    const r = score(
      session([
        para({ languageRoll: [5], penmanshipRoll: [5] }), // 2
        para({ languageRoll: [5], penmanshipRoll: [5] }), // 2
        para({ languageRoll: [5], penmanshipRoll: [5] }), // 2
        para({ languageRoll: [5], penmanshipRoll: [5] }), // 2
        para({ languageRoll: [5], penmanshipRoll: [5] }), // 2
      ]),
      scenario,
    );
    expect(r.total).toBe(10);
    expect(r.tier.threshold).toBe(8);
    expect(r.tierName).toBe('favourable');
  });

  test('negative totals fall back to lowest tier', () => {
    const r = score(
      session([
        para({
          attemptedFlourish: true,
          flourishAdjective: 'awful',
          heartRoll: [6],
          languageRoll: [2],
          penmanshipRoll: [1],
        }),
      ]),
      scenario,
    );
    expect(r.total).toBe(-1);
    expect(r.tier.threshold).toBe(0);
    expect(r.tierName).toBe('unsuccessful');
  });
});
