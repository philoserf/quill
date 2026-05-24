import { diceForRating } from './dice';
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
      case 'narrative':
        break;
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
