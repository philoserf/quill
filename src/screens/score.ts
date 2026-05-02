import type { GameSession, Scenario } from '../types';

export interface ScoreCtx {
  session: GameSession;
  scenario: Scenario;
  onRestart: () => void;
}

export function renderScore(_ctx: ScoreCtx): HTMLElement {
  const el = document.createElement('section');
  el.className = 'screen screen--score';
  el.textContent = 'Score screen (placeholder)';
  return el;
}
