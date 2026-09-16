import { diceForRating, roll } from './dice';
import type { Attribute, Character, Scenario } from './types';

export interface RollPlan {
  diceCount: number;
  rerollPolicy: 'highest' | null;
}

export function planRoll(args: {
  attribute: Attribute;
  character: Character;
  scenario: Scenario;
  skillBonusActive: boolean;
}): RollPlan {
  const { attribute, character, scenario, skillBonusActive } = args;
  let diceCount = diceForRating(character.attributes[attribute]);
  let rerollPolicy: 'highest' | null = null;

  for (const mod of scenario.rulesOfCorrespondence) {
    switch (mod.type) {
      case 'dice_bonus': {
        if (mod.attribute !== attribute) break;
        const restrict = mod.appliesTo?.characters;
        if (!restrict || restrict.includes(character.id)) {
          diceCount += mod.amount;
        }
        break;
      }
      case 'reroll_highest': {
        if (mod.attribute !== attribute) break;
        rerollPolicy = 'highest';
        break;
      }
      default: {
        // Compile-time exhaustiveness: TS errors if a new Modifier variant is added.
        const _exhaustive: never = mod;
        // Runtime safety: a payload that escaped validation (e.g., tampered session) still fails loudly.
        throw new Error(`Unhandled modifier: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  if (skillBonusActive) diceCount += 1;
  return { diceCount, rerollPolicy };
}

/** Carries out the policy `planRoll` requests. The highest die is replaced
 *  unconditionally — including when it was already a success — which is what
 *  makes `reroll_highest` a hazard rather than a bonus.
 *
 *  Lives here rather than in the roll button's callback so the mechanic sits
 *  beside the rule that asks for it, and so it can be tested without a DOM. */
export function applyReroll(
  dice: number[],
  policy: RollPlan['rerollPolicy'],
  rng?: () => number,
): number[] {
  if (policy !== 'highest' || dice.length === 0) return dice;
  const i = dice.indexOf(Math.max(...dice));
  // roll(1) always yields one die; the fallback is for the type, not for a
  // reachable case — see the test that pins it.
  const replacement = roll(1, rng)[0] ?? 1;
  return [...dice.slice(0, i), replacement, ...dice.slice(i + 1)];
}
