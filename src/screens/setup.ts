import type { Scenario } from '../types';

export interface SetupCtx {
  scenarios: Scenario[];
  onBegin: (sel: { characterId: string; skillId: string; scenarioId: string }) => void;
}

export function renderSetup(_ctx: SetupCtx): HTMLElement {
  const el = document.createElement('section');
  el.className = 'screen screen--setup';
  el.textContent = 'Setup screen — character / skill / scenario (placeholder)';
  return el;
}
