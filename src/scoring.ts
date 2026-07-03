import { countSuccesses } from './dice';
import type { ConsequenceTier, GameSession, Paragraph, Scenario, TierName } from './types';
import { TIER_NAMES } from './types';

export interface ScoreResult {
  paragraphs: number[];
  total: number;
  tier: ConsequenceTier;
  tierName: TierName;
}

export function formatSignedPoints(pts: number): string {
  return pts > 0 ? `+${pts}` : String(pts);
}

export function isSuperior(languageRoll: number[]): boolean {
  return countSuccesses(languageRoll) > 0;
}

export function flourishHeld(attemptedFlourish: boolean, heartRoll: number[] | null): boolean {
  return attemptedFlourish && heartRoll !== null && countSuccesses(heartRoll) > 0;
}

export function fineHand(penmanshipRoll: number[]): boolean {
  return countSuccesses(penmanshipRoll) > 0;
}

export function paragraphPoints(p: Paragraph): number {
  const superior = isSuperior(p.languageRoll);
  const flourishApplied = flourishHeld(p.attemptedFlourish, p.heartRoll);

  let pts: number;
  if (flourishApplied && superior) pts = 2;
  else if (flourishApplied && !superior) pts = -1;
  else if (!flourishApplied && superior) pts = 1;
  else pts = 0;

  if (fineHand(p.penmanshipRoll)) pts += 1;
  return pts;
}

export function score(session: GameSession, scenario: Scenario): ScoreResult {
  const paragraphs = session.paragraphs.map(paragraphPoints);
  const total = paragraphs.reduce((a, b) => a + b, 0);

  // Tier lookup: highest threshold ≤ total. Floor negatives to lowest tier.
  const sorted = [...scenario.consequences].sort((a, b) => a.threshold - b.threshold);
  const fallback = sorted[0];
  if (!fallback) throw new Error('Scenario has no consequence tiers');
  let tier: ConsequenceTier = fallback;
  for (const c of sorted) {
    if (total >= c.threshold) tier = c;
  }

  const tierName = TIER_NAMES[tier.threshold as keyof typeof TIER_NAMES];
  return { paragraphs, total, tier, tierName };
}
