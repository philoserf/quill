import { describe, expect, test } from 'bun:test';
import {
  advance,
  commitParagraph,
  type Draft,
  draftToParagraph,
  emptyDraft,
  STEP_INDEX,
} from '../src/paragraph';
import type { GameSession, Paragraph } from '../src/types';
import { PARAGRAPHS_PER_LETTER } from '../src/types';

function session(paragraphs: Paragraph[] = [], overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 'g1',
    startedAt: '2026-01-01T00:00:00.000Z',
    characterId: 'monk',
    skillId: 'illumination',
    scenarioId: 'archduke',
    skillSpent: false,
    paragraphs,
    status: 'in_progress',
    ...overrides,
  };
}

function para(overrides: Partial<Paragraph> = {}): Paragraph {
  return {
    inkPotIndex: 0,
    flourishAdjective: null,
    heartRoll: null,
    languageRoll: [5],
    penmanshipRoll: [5],
    skillUsedHere: null,
    text: 'a paragraph',
    ...overrides,
  };
}

describe('advance', () => {
  // The order is the game's rule, not arbitrary sequencing: Heart and Language
  // must resolve before writing, Penmanship after. Before this module it lived
  // in seven pairs of adjacent lines inside DOM-construction functions, where
  // reordering them changed the game and nothing failed.
  test('the flourish path runs PICK_WORD → … → PARAGRAPH_DONE in order', () => {
    let d = emptyDraft();
    const phases = [d.phase];

    d = advance(d, { type: 'pickWord', inkPotIndex: 2 });
    phases.push(d.phase);
    d = advance(d, { type: 'attemptFlourish' });
    phases.push(d.phase);
    d = advance(d, { type: 'rolled', attribute: 'heart', dice: [6] });
    phases.push(d.phase);
    d = advance(d, { type: 'rolled', attribute: 'language', dice: [5] });
    phases.push(d.phase);
    d = advance(d, { type: 'finishParagraph' });
    phases.push(d.phase);
    d = advance(d, { type: 'rolled', attribute: 'penmanship', dice: [4] });
    phases.push(d.phase);

    expect(phases).toEqual([
      'PICK_WORD',
      'DECIDE_FLOURISH',
      'ROLL_HEART',
      'ROLL_LANGUAGE',
      'WRITE',
      'ROLL_PENMANSHIP',
      'PARAGRAPH_DONE',
    ]);
  });

  test('the plain path skips ROLL_HEART', () => {
    let d = advance(emptyDraft(), { type: 'pickWord', inkPotIndex: 0 });
    d = advance(d, { type: 'writePlainly' });
    expect(d.phase).toBe('ROLL_LANGUAGE');
    expect(d.heartRoll).toBeNull();
  });

  test('writePlainly discards a flourish word already typed', () => {
    let d = advance(emptyDraft(), { type: 'pickWord', inkPotIndex: 0 });
    d = { ...d, flourishAdjective: 'sombre' };
    d = advance(d, { type: 'writePlainly' });
    expect(d.flourishAdjective).toBe('');
  });

  // Each transition records its data as well as its successor. This is what
  // makes "you cannot roll Language before Heart" a property of the table
  // rather than of two lines happening to sit next to each other.
  test('each roll lands its dice on the matching field', () => {
    let d = advance(emptyDraft(), { type: 'pickWord', inkPotIndex: 0 });
    d = advance(d, { type: 'attemptFlourish' });
    d = advance(d, { type: 'rolled', attribute: 'heart', dice: [6, 1] });
    expect(d.heartRoll).toEqual([6, 1]);
    d = advance(d, { type: 'rolled', attribute: 'language', dice: [2] });
    expect(d.languageRoll).toEqual([2]);
    d = advance(d, { type: 'finishParagraph' });
    d = advance(d, { type: 'rolled', attribute: 'penmanship', dice: [3, 3] });
    expect(d.penmanshipRoll).toEqual([3, 3]);
  });

  test('pickWord records the chosen index', () => {
    expect(advance(emptyDraft(), { type: 'pickWord', inkPotIndex: 7 }).inkPotIndex).toBe(7);
  });

  test('an event from the wrong phase leaves the draft untouched', () => {
    const d = emptyDraft();
    // Rolling Language while still at PICK_WORD would otherwise skip the word
    // and the flourish decision entirely.
    expect(advance(d, { type: 'rolled', attribute: 'language', dice: [6] })).toEqual(d);
    expect(advance(d, { type: 'finishParagraph' })).toEqual(d);
    expect(advance(d, { type: 'attemptFlourish' })).toEqual(d);
  });

  test('does not mutate the draft it is given', () => {
    const d = emptyDraft();
    advance(d, { type: 'pickWord', inkPotIndex: 3 });
    expect(d.inkPotIndex).toBeNull();
    expect(d.phase).toBe('PICK_WORD');
  });
});

describe('STEP_INDEX', () => {
  test('DECIDE_FLOURISH and ROLL_HEART share a stepper column', () => {
    expect(STEP_INDEX.DECIDE_FLOURISH).toBe(STEP_INDEX.ROLL_HEART);
  });

  test('columns never move backwards along the flourish path', () => {
    const path = [
      'PICK_WORD',
      'DECIDE_FLOURISH',
      'ROLL_HEART',
      'ROLL_LANGUAGE',
      'WRITE',
      'ROLL_PENMANSHIP',
      'PARAGRAPH_DONE',
    ] as const;
    const indices = path.map((p) => STEP_INDEX[p]);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});

describe('draftToParagraph', () => {
  function complete(): Draft {
    return {
      ...emptyDraft(),
      phase: 'PARAGRAPH_DONE',
      inkPotIndex: 1,
      languageRoll: [5],
      penmanshipRoll: [4],
      text: 'written',
    };
  }

  test('returns a Paragraph once the two required rolls and the word exist', () => {
    expect(draftToParagraph(complete())).not.toBeNull();
  });

  test('returns null while any required field is missing', () => {
    for (const missing of ['inkPotIndex', 'languageRoll', 'penmanshipRoll'] as const) {
      expect(draftToParagraph({ ...complete(), [missing]: null })).toBeNull();
    }
  });

  test('empty text is committable — it renders as a placeholder, not nothing', () => {
    const p = draftToParagraph({ ...complete(), text: '' });
    expect(p).not.toBeNull();
    expect(p?.text).toBe('');
  });

  test('a flourish word that was never confirmed becomes null', () => {
    expect(
      draftToParagraph({ ...complete(), flourishAdjective: '   ' })?.flourishAdjective,
    ).toBeNull();
    expect(draftToParagraph({ ...complete(), flourishAdjective: 'grand' })?.flourishAdjective).toBe(
      'grand',
    );
  });
});

describe('commitParagraph', () => {
  // Appending the fifth paragraph is the only route to the Score screen, and
  // nothing pinned it before this module existed.
  test('the letter finishes on the last paragraph and not before', () => {
    let s = session();
    for (let i = 1; i < PARAGRAPHS_PER_LETTER; i++) {
      s = commitParagraph(s, para());
      expect(s.status).toBe('in_progress');
    }
    s = commitParagraph(s, para());
    expect(s.paragraphs).toHaveLength(PARAGRAPHS_PER_LETTER);
    expect(s.status).toBe('finished');
  });

  test('appends rather than replacing', () => {
    const s = commitParagraph(session([para({ text: 'first' })]), para({ text: 'second' }));
    expect(s.paragraphs.map((p) => p.text)).toEqual(['first', 'second']);
  });

  test('spending the skill latches for the rest of the letter', () => {
    let s = commitParagraph(session(), para({ skillUsedHere: 'penmanship' }));
    expect(s.skillSpent).toBe(true);
    s = commitParagraph(s, para({ skillUsedHere: null }));
    expect(s.skillSpent).toBe(true);
  });

  test('leaves the session it is given untouched', () => {
    const before = session();
    commitParagraph(before, para());
    expect(before.paragraphs).toHaveLength(0);
    expect(before.status).toBe('in_progress');
  });
});
