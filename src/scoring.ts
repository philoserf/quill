import { countSuccesses } from './dice';
import { TIER_NAMES } from './types';
import type { ConsequenceTier, GameSession, Paragraph, Scenario, TierName } from './types';

export interface ScoreResult {
  paragraphs: number[];
  total: number;
  tier: ConsequenceTier;
  tierName: TierName;
}

export function paragraphPoints(p: Paragraph): number {
  const isSuperior = countSuccesses(p.languageRoll) > 0;
  const flourishApplied =
    p.attemptedFlourish && p.heartRoll !== null && countSuccesses(p.heartRoll) > 0;

  let pts: number;
  if (flourishApplied && isSuperior) pts = 2;
  else if (flourishApplied && !isSuperior) pts = -1;
  else if (!flourishApplied && isSuperior) pts = 1;
  else pts = 0;

  if (countSuccesses(p.penmanshipRoll) > 0) pts += 1;
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
