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

export function countSuccesses(dice: number[]): number {
  return dice.filter((d) => d >= 5).length;
}
