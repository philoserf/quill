import type { GameSession, Scenario } from '../types';

export interface PlayCtx {
  session: GameSession;
  scenario: Scenario;
  onFinish: () => void;
  onUpdate: (updater: (s: GameSession) => GameSession) => void;
}

export function renderPlay(_ctx: PlayCtx): HTMLElement {
  const el = document.createElement('section');
  el.className = 'screen screen--play';
  el.textContent = 'Play screen (placeholder)';
  return el;
}
