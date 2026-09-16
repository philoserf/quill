import type { Rating } from './types';

export function diceForRating(r: Rating): number {
  return r === 'poor' ? 1 : r === 'average' ? 2 : 3;
}

export function roll(n: number, rng: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.floor(rng() * 6) + 1);
  }
  return out;
}

export function isSuccess(die: number): boolean {
  return die >= 5;
}

export function countSuccesses(dice: number[]): number {
  return dice.filter(isSuccess).length;
}

/** The rulebook's one success rule: a roll succeeds if any die shows 5 or 6.
 *  Accepts null because a roll that never happened did not succeed — which is
 *  what the Heart roll is when the player writes plainly. */
export function succeeded(dice: number[] | null): boolean {
  return dice !== null && countSuccesses(dice) > 0;
}
