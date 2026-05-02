import { describe, expect, test } from 'bun:test';
import { characterById } from '../src/data';
import { planRoll } from '../src/rules';
import type { Scenario } from '../src/types';
import { must } from './helpers';

const baseScenario: Scenario = {
  id: 'test',
  title: 'Test',
  profile: [],
  rulesOfCorrespondence: [],
  inkPot: [],
  consequences: [
    { threshold: 0, text: '' },
    { threshold: 5, text: '' },
    { threshold: 8, text: '' },
    { threshold: 11, text: '' },
  ],
};

describe('planRoll', () => {
  test('uses character base attribute when no modifiers apply', () => {
    const monk = must(characterById('monk'), 'monk fixture');
    const plan = planRoll({
      attribute: 'penmanship',
      character: monk,
      scenario: baseScenario,
      skillBonusActive: false,
    });
    // Monk: penmanship=good → 3 dice
    expect(plan.diceCount).toBe(3);
    expect(plan.rerollPolicy).toBeNull();
  });

  test('skill bonus adds 1 die', () => {
    const monk = must(characterById('monk'), 'monk fixture');
    const plan = planRoll({
      attribute: 'language',
      character: monk,
      scenario: baseScenario,
      skillBonusActive: true,
    });
    // Monk: language=average → 2, +1 skill = 3
    expect(plan.diceCount).toBe(3);
  });

  test('unconditional dice_bonus adds dice', () => {
    const monk = must(characterById('monk'), 'monk fixture');
    const scenario: Scenario = {
      ...baseScenario,
      rulesOfCorrespondence: [
        {
          type: 'dice_bonus',
          attribute: 'penmanship',
          amount: 1,
          description: 'superior parchment',
        },
      ],
    };
    const plan = planRoll({
      attribute: 'penmanship',
      character: monk,
      scenario,
      skillBonusActive: false,
    });
    expect(plan.diceCount).toBe(4); // 3 + 1
  });

  test('character-restricted dice_bonus only applies to listed characters', () => {
    const monk = must(characterById('monk'), 'monk fixture');
    const courtier = must(characterById('courtier'), 'courtier fixture');
    const scenario: Scenario = {
      ...baseScenario,
      rulesOfCorrespondence: [
        {
          type: 'dice_bonus',
          attribute: 'heart',
          amount: 1,
          appliesTo: { characters: ['courtier', 'aristocrat'] },
          description: 'court favor',
        },
      ],
    };
    const monkPlan = planRoll({
      attribute: 'heart',
      character: monk,
      scenario,
      skillBonusActive: false,
    });
    // Monk: heart=poor → 1 die, no bonus
    expect(monkPlan.diceCount).toBe(1);
    const courtierPlan = planRoll({
      attribute: 'heart',
      character: courtier,
      scenario,
      skillBonusActive: false,
    });
    // Courtier: heart=good → 3 dice, +1 bonus = 4
    expect(courtierPlan.diceCount).toBe(4);
  });

  test('reroll_highest policy is reflected in the plan', () => {
    const monk = must(characterById('monk'), 'monk fixture');
    const scenario: Scenario = {
      ...baseScenario,
      rulesOfCorrespondence: [
        {
          type: 'reroll_highest',
          attribute: 'penmanship',
          description: 're-roll highest',
        },
      ],
    };
    const plan = planRoll({
      attribute: 'penmanship',
      character: monk,
      scenario,
      skillBonusActive: false,
    });
    expect(plan.rerollPolicy).toBe('highest');
  });

  test('reroll_highest only applies to its specific attribute', () => {
    const monk = must(characterById('monk'), 'monk fixture');
    const scenario: Scenario = {
      ...baseScenario,
      rulesOfCorrespondence: [{ type: 'reroll_highest', attribute: 'penmanship', description: '' }],
    };
    const plan = planRoll({
      attribute: 'language',
      character: monk,
      scenario,
      skillBonusActive: false,
    });
    expect(plan.rerollPolicy).toBeNull();
  });
});
