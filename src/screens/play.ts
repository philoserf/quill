import { CHARACTERS, SKILLS } from '../data';
import type { GameSession, Scenario } from '../types';

export interface PlayCtx {
  session: GameSession;
  scenario: Scenario;
  onFinish: () => void;
  onUpdate: (updater: (s: GameSession) => GameSession) => void;
}

export function renderPlay(ctx: PlayCtx): HTMLElement {
  const root = document.createElement('section');
  root.className = 'screen screen--play';

  const grid = document.createElement('div');
  grid.className = 'play-grid';

  grid.appendChild(renderInkPotPanel(ctx));
  grid.appendChild(renderCenterPanel(ctx));
  grid.appendChild(renderRightPanel(ctx));

  root.appendChild(grid);
  return root;
}

function renderInkPotPanel(ctx: PlayCtx): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'panel panel--inkpot';
  const h = document.createElement('h3');
  h.textContent = 'Ink Pot';
  panel.appendChild(h);
  const list = document.createElement('ul');
  list.className = 'inkpot-list';
  ctx.scenario.inkPot.forEach((entry, idx) => {
    const used = ctx.session.paragraphs.find((p) => p.inkPotIndex === idx);
    const li = document.createElement('li');
    li.className = `inkpot-item${used ? ' inkpot-item--used' : ''}`;
    if (used) {
      const isSuperior = used.languageRoll.some((d) => d >= 5);
      li.textContent = `${entry.inferior} — used (${isSuperior ? 'Superior' : 'Inferior'})`;
    } else {
      li.textContent = entry.inferior;
    }
    list.appendChild(li);
  });
  panel.appendChild(list);
  return panel;
}

function renderCenterPanel(ctx: PlayCtx): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'panel panel--center';
  const placeholder = document.createElement('p');
  placeholder.textContent = `Paragraph ${ctx.session.paragraphs.length + 1} of 5 — workspace coming soon.`;
  panel.appendChild(placeholder);
  return panel;
}

function renderRightPanel(ctx: PlayCtx): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'panel panel--right';
  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId);
  const skill = SKILLS.find((s) => s.id === ctx.session.skillId);
  const charLine = document.createElement('p');
  charLine.textContent = `${character?.name ?? ''} — ${skill?.name ?? ''}`;
  panel.appendChild(charLine);

  const scenarioBox = document.createElement('div');
  scenarioBox.className = 'scenario-box';
  scenarioBox.innerHTML = `
    <h4>${ctx.scenario.title}</h4>
    ${ctx.scenario.profile.map((p) => `<p>${p}</p>`).join('')}
    <h5>Rules of Correspondence</h5>
    ${ctx.scenario.rulesOfCorrespondence.map((r) => `<p>${r.description}</p>`).join('') || '<p>None.</p>'}`;
  panel.appendChild(scenarioBox);

  return panel;
}
