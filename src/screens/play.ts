import { CHARACTERS, SKILLS } from '../data';
import type { GameSession, Scenario } from '../types';

export interface PlayCtx {
  session: GameSession;
  scenario: Scenario;
  onFinish: () => void;
  onUpdate: (updater: (s: GameSession) => GameSession) => void;
}

type PhaseName =
  | 'PICK_WORD'
  | 'DECIDE_FLOURISH'
  | 'ROLL_HEART'
  | 'ROLL_LANGUAGE'
  | 'WRITE'
  | 'ROLL_PENMANSHIP'
  | 'PARAGRAPH_DONE';

interface Draft {
  phase: PhaseName;
  inkPotIndex: number | null;
  attemptedFlourish: boolean;
  flourishAdjective: string;
  heartRoll: number[] | null;
  languageRoll: number[] | null;
  penmanshipRoll: number[] | null;
  text: string;
  skillUsedHere: 'penmanship' | 'language' | 'heart' | null;
}

function emptyDraft(): Draft {
  return {
    phase: 'PICK_WORD',
    inkPotIndex: null,
    attemptedFlourish: false,
    flourishAdjective: '',
    heartRoll: null,
    languageRoll: null,
    penmanshipRoll: null,
    text: '',
    skillUsedHere: null,
  };
}

let currentDraft: Draft = emptyDraft();
let lastSessionId = '';

function ensureDraftFor(session: GameSession) {
  if (session.id !== lastSessionId) {
    currentDraft = emptyDraft();
    lastSessionId = session.id;
  }
}

function rerender(ctx: PlayCtx) {
  // Trigger main app render by no-op session update.
  ctx.onUpdate((s) => ({ ...s }));
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
  ensureDraftFor(ctx.session);
  const panel = document.createElement('section');
  panel.className = 'panel panel--center';

  const heading = document.createElement('h3');
  heading.textContent = `Paragraph ${ctx.session.paragraphs.length + 1} of 5`;
  panel.appendChild(heading);

  switch (currentDraft.phase) {
    case 'PICK_WORD':
      panel.appendChild(renderPickWord(ctx));
      break;
    case 'DECIDE_FLOURISH':
      panel.appendChild(renderDecideFlourish(ctx));
      break;
    default:
      // Subsequent tasks fill in ROLL_HEART, ROLL_LANGUAGE, WRITE, ROLL_PENMANSHIP, PARAGRAPH_DONE.
      panel.appendChild(document.createTextNode(`(phase: ${currentDraft.phase})`));
      break;
  }
  return panel;
}

function renderPickWord(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = 'Choose a word from the Ink Pot to incorporate in this paragraph.';
  wrap.appendChild(p);
  const grid = document.createElement('div');
  grid.className = 'pick-grid';
  ctx.scenario.inkPot.forEach((entry, idx) => {
    const used = ctx.session.paragraphs.find((pp) => pp.inkPotIndex === idx);
    if (used) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.textContent = entry.inferior;
    btn.addEventListener('click', () => {
      currentDraft.inkPotIndex = idx;
      currentDraft.phase = 'DECIDE_FLOURISH';
      rerender(ctx);
    });
    grid.appendChild(btn);
  });
  wrap.appendChild(grid);
  return wrap;
}

function renderDecideFlourish(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  const info = document.createElement('p');
  info.textContent =
    'You may attempt a Flourish (adjective or adverb) to enrich your word — Heart test required. Flourishes are optional.';
  wrap.appendChild(info);
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'flourish word (e.g. "solemn")';
  input.value = currentDraft.flourishAdjective;
  input.className = 'flourish-input';
  input.addEventListener('input', () => {
    currentDraft.flourishAdjective = input.value;
  });
  wrap.appendChild(input);

  const attempt = document.createElement('button');
  attempt.type = 'button';
  attempt.className = 'btn btn--primary';
  attempt.textContent = 'Attempt flourish';
  attempt.addEventListener('click', () => {
    if (!currentDraft.flourishAdjective.trim()) {
      input.focus();
      return;
    }
    currentDraft.attemptedFlourish = true;
    currentDraft.phase = 'ROLL_HEART';
    rerender(ctx);
  });

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn';
  skip.textContent = 'Skip flourish';
  skip.addEventListener('click', () => {
    currentDraft.attemptedFlourish = false;
    currentDraft.flourishAdjective = '';
    currentDraft.phase = 'ROLL_LANGUAGE';
    rerender(ctx);
  });

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(attempt, skip);
  wrap.appendChild(actions);
  return wrap;
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
