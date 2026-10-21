import { succeeded } from './dice';
import type { GameSession, InkPotEntry, Paragraph, Scenario, TierName } from './types';
import { LOWEST_TIER, TIERS } from './types';

export interface ScoreResult {
  paragraphs: number[];
  total: number;
  tierName: TierName;
}

export function formatSignedPoints(pts: number): string {
  return pts > 0 ? `+${pts}` : String(pts);
}

export function paragraphPoints(p: Paragraph): number {
  const superior = succeeded(p.languageRoll);
  const flourishApplied = succeeded(p.heartRoll);

  let pts: number;
  if (flourishApplied && superior) pts = 2;
  else if (flourishApplied && !superior) pts = -1;
  else if (!flourishApplied && superior) pts = 1;
  else pts = 0;

  if (succeeded(p.penmanshipRoll)) pts += 1;
  return pts;
}

/** The word the Language roll lets the player write. */
export function writtenWord(pair: InkPotEntry, languageRoll: number[]): string {
  return succeeded(languageRoll) ? pair.superior : pair.inferior;
}

/** What a committed paragraph's dice mean — the one reading every view of a
 *  paragraph shares. Each consumer still chooses what to print: the Score
 *  screen reports a lost flourish, the export does not. */
export interface ParagraphOutcome {
  /** null when `inkPotIndex` no longer resolves against the scenario. */
  word: string | null;
  superior: boolean;
  /** null when the player wrote plainly. */
  flourish: { word: string; held: boolean } | null;
  fineHand: boolean;
  points: number;
}

export function paragraphOutcome(p: Paragraph, scenario: Scenario): ParagraphOutcome {
  const pair = scenario.inkPot[p.inkPotIndex];
  return {
    word: pair ? writtenWord(pair, p.languageRoll) : null,
    superior: succeeded(p.languageRoll),
    flourish:
      p.flourishAdjective === null
        ? null
        : { word: p.flourishAdjective, held: succeeded(p.heartRoll) },
    fineHand: succeeded(p.penmanshipRoll),
    points: paragraphPoints(p),
  };
}

export function tierFor(total: number): TierName {
  for (const tier of TIERS) {
    if (total >= tier.threshold) return tier.name;
  }
  // Only reachable for a negative total: floor it to the lowest tier.
  return LOWEST_TIER;
}

export function score(session: GameSession): ScoreResult {
  const paragraphs = session.paragraphs.map(paragraphPoints);
  const total = paragraphs.reduce((a, b) => a + b, 0);
  return { paragraphs, total, tierName: tierFor(total) };
}
