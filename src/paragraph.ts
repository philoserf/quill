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

interface DraftBase {
  /** The attribute the letter's skill can still boost, or null once it is
   *  spent. Fixed for the paragraph: the session's latch only moves on commit. */
  spendable: Attribute | null;
  skillUsedHere: Attribute | null;
}

/** An attempted flourish. The Heart roll is the record of the attempt (#66),
 *  so the word and the roll exist together or not at all. */
export interface Flourish {
  adjective: string;
  heartRoll: number[];
}

interface Worded extends DraftBase {
  inkPotIndex: number;
}

/** Past the flourish decision: `null` is a paragraph written plainly. */
interface Resolved extends Worded {
  flourish: Flourish | null;
}

interface Written extends Resolved {
  languageRoll: number[];
  text: string;
}

/** The paragraph in progress. Each phase carries exactly the fields it has
 *  earned, so a render function handed one phase cannot find a roll missing
 *  that `advance` guarantees is there. */
export type Draft =
  | (DraftBase & { phase: 'PICK_WORD' })
  // The word being typed; trimmed and checked only when it is attempted.
  | (Worded & { phase: 'DECIDE_FLOURISH'; flourishAdjective: string })
  | (Worded & { phase: 'ROLL_HEART'; flourishAdjective: string })
  | (Resolved & { phase: 'ROLL_LANGUAGE' })
  | (Written & { phase: 'WRITE' })
  | (Written & { phase: 'ROLL_PENMANSHIP' })
  | DoneDraft;

export type DoneDraft = Written & { phase: 'PARAGRAPH_DONE'; penmanshipRoll: number[] };

export type PhaseName = Draft['phase'];

/** The draft in one phase, for render functions that only handle that phase. */
export type DraftAt<P extends PhaseName> = Extract<Draft, { phase: P }>;

export function emptyDraft(spendable: Attribute | null): Draft {
  return { phase: 'PICK_WORD', spendable, skillUsedHere: null };
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
      return {
        ...draft,
        phase: 'DECIDE_FLOURISH',
        inkPotIndex: event.inkPotIndex,
        flourishAdjective: '',
      };

    case 'setFlourish':
      if (draft.phase !== 'DECIDE_FLOURISH') return draft;
      return { ...draft, flourishAdjective: event.adjective };

    // A flourish needs a word (#108). The word is trimmed here, once, so the
    // phrase the write step asks for is the phrase the player typed (#107).
    case 'attemptFlourish': {
      if (draft.phase !== 'DECIDE_FLOURISH') return draft;
      const adjective = draft.flourishAdjective.trim();
      if (!adjective) return draft;
      return { ...draft, flourishAdjective: adjective, phase: 'ROLL_HEART' };
    }

    // Built field by field rather than spread: the typed word is dropped, not
    // carried along unattempted.
    case 'writePlainly': {
      if (draft.phase !== 'DECIDE_FLOURISH') return draft;
      const { spendable, skillUsedHere, inkPotIndex } = draft;
      return { phase: 'ROLL_LANGUAGE', spendable, skillUsedHere, inkPotIndex, flourish: null };
    }

    // Once per letter, only on the skill's own attribute, and only on the roll
    // the current phase is waiting for (#124).
    case 'spendSkill':
      if (
        event.attribute !== draft.spendable ||
        draft.phase !== ROLL_PHASE[event.attribute] ||
        draft.skillUsedHere !== null
      ) {
        return draft;
      }
      return { ...draft, skillUsedHere: event.attribute };

    case 'setText':
      if (draft.phase !== 'WRITE') return draft;
      return { ...draft, text: event.text };

    case 'finishParagraph':
      if (draft.phase !== 'WRITE') return draft;
      return { ...draft, phase: 'ROLL_PENMANSHIP' };

    case 'rolled':
      switch (event.attribute) {
        case 'heart': {
          if (draft.phase !== 'ROLL_HEART') return draft;
          const { spendable, skillUsedHere, inkPotIndex, flourishAdjective } = draft;
          return {
            phase: 'ROLL_LANGUAGE',
            spendable,
            skillUsedHere,
            inkPotIndex,
            flourish: { adjective: flourishAdjective, heartRoll: event.dice },
          };
        }
        case 'language':
          if (draft.phase !== 'ROLL_LANGUAGE') return draft;
          return { ...draft, phase: 'WRITE', languageRoll: event.dice, text: '' };
        case 'penmanship':
          if (draft.phase !== 'ROLL_PENMANSHIP') return draft;
          return { ...draft, phase: 'PARAGRAPH_DONE', penmanshipRoll: event.dice };
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
// `text` is deliberately not required to be non-empty: an empty paragraph is
// committable and renders as a placeholder downstream.
export function draftToParagraph(d: DoneDraft): Paragraph {
  return {
    inkPotIndex: d.inkPotIndex,
    flourishAdjective: d.flourish?.adjective ?? null,
    heartRoll: d.flourish?.heartRoll ?? null,
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
