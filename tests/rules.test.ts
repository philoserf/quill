import { describe, expect, test } from 'bun:test';
import { characterById } from '../src/data';
import { countSuccesses } from '../src/dice';
import { applyReroll, planRoll } from '../src/rules';
import type { Scenario } from '../src/types';
import { must, scenarioFixture } from './helpers';

const baseScenario = scenarioFixture();
const monk = must(characterById('monk'), 'monk fixture');
const courtier = must(characterById('courtier'), 'courtier fixture');

describe('planRoll', () => {
  test('uses character base attribute when no modifiers apply', () => {
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

describe('applyReroll', () => {
  // planRoll only sets the flag; until this function existed the splice lived
  // in the roll button's callback and nothing tested it at all.
  const always = (v: number) => () => (v - 1) / 6 + 0.001; // rng yielding die `v`

  test('leaves the dice alone when no policy is set', () => {
    const dice = [6, 3, 1];
    expect(applyReroll(dice, null)).toBe(dice);
  });

  test('replaces the highest die', () => {
    expect(applyReroll([2, 6, 3], 'highest', always(1))).toEqual([2, 1, 3]);
  });

  // The rule is a hazard, not a bonus: a 6 that already counted as a success
  // is replaced anyway, and the replacement can be worse.
  test('replaces a highest die that was already a success', () => {
    const after = applyReroll([6, 2], 'highest', always(1));
    expect(after).toEqual([1, 2]);
    expect(countSuccesses(after)).toBe(0);
  });

  test('replaces only the first of several tied highest dice', () => {
    expect(applyReroll([5, 5, 2], 'highest', always(3))).toEqual([3, 5, 2]);
  });

  test('handles an empty roll without reaching the fallback', () => {
    expect(applyReroll([], 'highest')).toEqual([]);
  });

  test('does not mutate the dice it is given', () => {
    const dice = [4, 6];
    applyReroll(dice, 'highest', always(2));
    expect(dice).toEqual([4, 6]);
  });
});
