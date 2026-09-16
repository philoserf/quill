import { succeeded } from './dice';
import type { GameSession, Paragraph, TierName } from './types';
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
