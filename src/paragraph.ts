import type { Attribute, GameSession, Paragraph } from './types';
import { PARAGRAPHS_PER_LETTER } from './types';

/** Shown wherever a committed paragraph has no prose. Committing an empty
 *  paragraph is permitted; rendering nothing at all is what was not intended. */
export const EMPTY_PARAGRAPH = '(empty paragraph)';

/** The prose to show for a paragraph — the one rule for every place that
 *  renders it, so the screens and the export agree. Whitespace-only text
 *  counts as empty (#101), and prose is shown trimmed. */
export function paragraphProse(text: string): string {
  return text.trim() || EMPTY_PARAGRAPH;
}

export type PhaseName =
  | 'PICK_WORD'
  | 'DECIDE_FLOURISH'
  | 'ROLL_HEART'
  | 'ROLL_LANGUAGE'
  | 'WRITE'
  | 'ROLL_PENMANSHIP'
  | 'PARAGRAPH_DONE';

export interface Draft {
  phase: PhaseName;
  inkPotIndex: number | null;
  flourishAdjective: string;
  heartRoll: number[] | null;
  languageRoll: number[] | null;
  penmanshipRoll: number[] | null;
  text: string;
  skillUsedHere: Attribute | null;
}

export function emptyDraft(): Draft {
  return {
    phase: 'PICK_WORD',
    inkPotIndex: null,
    flourishAdjective: '',
    heartRoll: null,
    languageRoll: null,
    penmanshipRoll: null,
    text: '',
    skillUsedHere: null,
  };
}

/** Everything that changes a paragraph. Each event carries the data the
 *  transition records, so the order and the data flow have one home instead of
 *  being seven pairs of adjacent lines in DOM-construction functions. The three
 *  edits — the flourish word, the prose, the skill — are events too, so no
 *  field reaches the draft except through `advance` (#109). */
export type DraftEvent =
  | { type: 'pickWord'; inkPotIndex: number }
  | { type: 'setFlourish'; adjective: string }
  | { type: 'attemptFlourish' }
  | { type: 'writePlainly' }
  | { type: 'spendSkill'; attribute: Attribute }
  | { type: 'rolled'; attribute: Attribute; dice: number[] }
  | { type: 'setText'; text: string }
  | { type: 'finishParagraph' };

/** The roll each attribute's phase is waiting for. */
const ROLL_PHASE: Record<Attribute, PhaseName> = {
  heart: 'ROLL_HEART',
  language: 'ROLL_LANGUAGE',
  penmanship: 'ROLL_PENMANSHIP',
};

/** The paragraph's order: Heart and Language resolve before writing, Penmanship
 *  after. DECIDE_FLOURISH is the only branching phase, which is why this is
 *  event-keyed rather than a flat phase-to-phase table.
 *
 *  An event that does not belong to the current phase returns the draft
 *  unchanged — the UI never offers one, and silently ignoring it is safer than
 *  throwing inside a click handler. */
export function advance(draft: Draft, event: DraftEvent): Draft {
  switch (event.type) {
    case 'pickWord':
      if (draft.phase !== 'PICK_WORD') return draft;
      return { ...draft, inkPotIndex: event.inkPotIndex, phase: 'DECIDE_FLOURISH' };

    case 'setFlourish':
      if (draft.phase !== 'DECIDE_FLOURISH') return draft;
      return { ...draft, flourishAdjective: event.adjective };

    // A flourish needs a word: scoring keys it off heartRoll and the Score
    // screen off flourishAdjective, so both must exist together (#108). The
    // word is trimmed here, once, so the phrase the write step asks for is the
    // phrase the player typed (#107).
    case 'attemptFlourish': {
      if (draft.phase !== 'DECIDE_FLOURISH') return draft;
      const adjective = draft.flourishAdjective.trim();
      if (!adjective) return draft;
      return { ...draft, flourishAdjective: adjective, phase: 'ROLL_HEART' };
    }

    case 'writePlainly':
      if (draft.phase !== 'DECIDE_FLOURISH') return draft;
      return { ...draft, flourishAdjective: '', phase: 'ROLL_LANGUAGE' };

    // Once per paragraph, and only on the roll it boosts. Whether the letter's
    // one skill is still unspent is the session's fact, checked by the screen.
    case 'spendSkill':
      if (draft.phase !== ROLL_PHASE[event.attribute] || draft.skillUsedHere !== null) return draft;
      return { ...draft, skillUsedHere: event.attribute };

    case 'setText':
      if (draft.phase !== 'WRITE') return draft;
      return { ...draft, text: event.text };

    case 'finishParagraph':
      if (draft.phase !== 'WRITE') return draft;
      return { ...draft, phase: 'ROLL_PENMANSHIP' };

    case 'rolled':
      switch (event.attribute) {
        case 'heart':
          if (draft.phase !== 'ROLL_HEART') return draft;
          return { ...draft, heartRoll: event.dice, phase: 'ROLL_LANGUAGE' };
        case 'language':
          if (draft.phase !== 'ROLL_LANGUAGE') return draft;
          return { ...draft, languageRoll: event.dice, phase: 'WRITE' };
        case 'penmanship':
          if (draft.phase !== 'ROLL_PENMANSHIP') return draft;
          return { ...draft, penmanshipRoll: event.dice, phase: 'PARAGRAPH_DONE' };
      }
  }
}

/** Which stepper column a phase belongs to. A presentation mapping, not a
 *  transition — DECIDE_FLOURISH and ROLL_HEART share a column. */
export const STEP_INDEX: Record<PhaseName, number> = {
  PICK_WORD: 0,
  DECIDE_FLOURISH: 1,
  ROLL_HEART: 1,
  ROLL_LANGUAGE: 2,
  WRITE: 3,
  ROLL_PENMANSHIP: 4,
  PARAGRAPH_DONE: 5,
};

// The single Draft -> Paragraph mapping. The done step needs a Paragraph twice —
// once to preview the points, once to commit the record — and a second copy of
// this mapping would let the previewed score drift from the recorded one.
// Returns null when the draft is not yet complete enough to score. `text` is
// deliberately not required: an empty paragraph is committable and renders as
// a placeholder downstream (see the Score screen and the export).
export function draftToParagraph(d: Draft): Paragraph | null {
  if (d.inkPotIndex === null || d.languageRoll === null || d.penmanshipRoll === null) return null;
  return {
    inkPotIndex: d.inkPotIndex,
    // The Heart roll is the record of an attempt (#66); the word follows it,
    // so the two cannot disagree. advance() already trimmed it (#116).
    flourishAdjective: d.heartRoll !== null ? d.flourishAdjective : null,
    heartRoll: d.heartRoll,
    languageRoll: d.languageRoll,
    penmanshipRoll: d.penmanshipRoll,
    skillUsedHere: d.skillUsedHere,
    text: d.text,
  };
}

/** Appending the fifth paragraph is the only route to the Score screen. */
export function commitParagraph(session: GameSession, para: Paragraph): GameSession {
  const paragraphs = [...session.paragraphs, para];
  return {
    ...session,
    paragraphs,
    skillSpent: session.skillSpent || para.skillUsedHere !== null,
    status: paragraphs.length >= PARAGRAPHS_PER_LETTER ? 'finished' : 'in_progress',
  };
}
