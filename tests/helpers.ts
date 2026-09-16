import type { Scenario } from '../src/types';

export function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

// Supplies don't-cares only. Anything a test asserts on should be passed as an
// override, so the assertion and the value it reads stay in the same file.
export function scenarioFixture(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'test',
    title: 'Test',
    profile: ['a profile'],
    rulesOfCorrespondence: [],
    inkPot: [],
    consequences: {
      unsuccessful: 'unsuccessful prose',
      tepid: 'tepid prose',
      favourable: 'favourable prose',
      excellent: 'excellent prose',
    },
    ...overrides,
  };
}
