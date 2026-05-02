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
    if (mod.attribute !== attribute) continue;
    if (mod.type === 'dice_bonus') {
      const restrict = mod.appliesTo?.characters;
      if (!restrict || restrict.includes(character.id)) {
        diceCount += mod.amount;
      }
    } else if (mod.type === 'reroll_highest') {
      rerollPolicy = 'highest';
    }
  }

  if (skillBonusActive) diceCount += 1;
  return { diceCount, rerollPolicy };
}
