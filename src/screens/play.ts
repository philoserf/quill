import { CHARACTERS, SKILLS } from '../data';
import { countSuccesses, roll } from '../dice';
import { planRoll } from '../rules';
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
    case 'ROLL_HEART':
      panel.appendChild(renderRollHeart(ctx));
      break;
    case 'ROLL_LANGUAGE':
      panel.appendChild(renderRollLanguage(ctx));
      break;
    case 'WRITE':
      panel.appendChild(renderWrite(ctx));
      break;
    case 'ROLL_PENMANSHIP':
      panel.appendChild(renderRollPenmanship(ctx));
      break;
    case 'PARAGRAPH_DONE':
      panel.appendChild(renderParagraphDone(ctx));
      break;
  }

  const completed = ctx.session.paragraphs;
  if (completed.length > 0) {
    const lsf = document.createElement('div');
    lsf.className = 'letter-so-far';
    const h = document.createElement('h4');
    h.textContent = 'Letter so far';
    lsf.appendChild(h);
    for (const completedPara of completed) {
      const para = document.createElement('p');
      para.textContent = completedPara.text || '(empty paragraph)';
      lsf.appendChild(para);
    }
    panel.appendChild(lsf);
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

function formatDice(values: number[]): string {
  return values.map((v) => (v >= 5 ? `<span class="success">${v}</span>` : String(v))).join(' ');
}

function canSpendSkill(ctx: PlayCtx, attr: 'penmanship' | 'language' | 'heart'): boolean {
  if (ctx.session.skillSpent) return false;
  const skill = SKILLS.find((s) => s.id === ctx.session.skillId);
  return !!skill && skill.bonusAttribute === attr && currentDraft.skillUsedHere === attr;
}

function canSpendSkillButton(ctx: PlayCtx, attr: 'penmanship' | 'language' | 'heart'): boolean {
  if (ctx.session.skillSpent) return false;
  const skill = SKILLS.find((s) => s.id === ctx.session.skillId);
  return !!skill && skill.bonusAttribute === attr && currentDraft.skillUsedHere !== attr;
}

function makeSkillButton(
  ctx: PlayCtx,
  attr: 'penmanship' | 'language' | 'heart',
  onChange: () => void,
): HTMLElement {
  const skill = SKILLS.find((s) => s.id === ctx.session.skillId);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = `Use ${skill?.name ?? 'skill'} (+1 ${attr} die)`;
  btn.addEventListener('click', () => {
    currentDraft.skillUsedHere = attr;
    onChange();
  });
  return btn;
}

function renderRollHeart(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = `Roll Heart to attempt a flourish ("${currentDraft.flourishAdjective}").`;
  wrap.appendChild(p);

  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId);
  if (!character) {
    wrap.appendChild(document.createTextNode('Character not found.'));
    return wrap;
  }
  const skillBonusActive = canSpendSkill(ctx, 'heart');
  const plan = planRoll({
    attribute: 'heart',
    character,
    scenario: ctx.scenario,
    skillBonusActive,
  });

  const dicePool = document.createElement('p');
  dicePool.textContent = `Rolling ${plan.diceCount} dice${skillBonusActive ? ' (skill applied)' : ''}.`;
  wrap.appendChild(dicePool);

  if (canSpendSkillButton(ctx, 'heart')) {
    wrap.appendChild(makeSkillButton(ctx, 'heart', () => rerender(ctx)));
  }

  const rollBtn = document.createElement('button');
  rollBtn.type = 'button';
  rollBtn.className = 'btn btn--primary';
  rollBtn.textContent = 'Roll dice';
  rollBtn.addEventListener('click', () => {
    rollBtn.classList.add('shake');
    rollBtn.disabled = true;
    setTimeout(() => {
      const dice = roll(plan.diceCount);
      currentDraft.heartRoll = dice;
      currentDraft.phase = 'ROLL_LANGUAGE';
      if (skillBonusActive) {
        currentDraft.skillUsedHere = 'heart';
      }
      rerender(ctx);
    }, 250);
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function renderRollLanguage(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId);
  if (!character) {
    wrap.appendChild(document.createTextNode('Character not found.'));
    return wrap;
  }
  const skillBonusActive = canSpendSkill(ctx, 'language');
  const plan = planRoll({
    attribute: 'language',
    character,
    scenario: ctx.scenario,
    skillBonusActive,
  });

  if (currentDraft.heartRoll) {
    const heartLine = document.createElement('p');
    const ok = countSuccesses(currentDraft.heartRoll) > 0;
    heartLine.innerHTML = `Heart roll: ${formatDice(currentDraft.heartRoll)} — ${ok ? '<span class="success">flourish stuck</span>' : '<span class="failure">flourish lost</span>'}`;
    wrap.appendChild(heartLine);
  }

  const info = document.createElement('p');
  info.textContent = `Roll Language (${plan.diceCount} dice${skillBonusActive ? ' — skill applied' : ''}) to determine if you draw the Superior word.`;
  wrap.appendChild(info);

  if (canSpendSkillButton(ctx, 'language')) {
    wrap.appendChild(makeSkillButton(ctx, 'language', () => rerender(ctx)));
  }

  const rollBtn = document.createElement('button');
  rollBtn.type = 'button';
  rollBtn.className = 'btn btn--primary';
  rollBtn.textContent = 'Roll dice';
  rollBtn.addEventListener('click', () => {
    rollBtn.classList.add('shake');
    rollBtn.disabled = true;
    setTimeout(() => {
      const dice = roll(plan.diceCount);
      currentDraft.languageRoll = dice;
      if (skillBonusActive) currentDraft.skillUsedHere = 'language';
      currentDraft.phase = 'WRITE';
      rerender(ctx);
    }, 250);
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function renderWrite(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  if (currentDraft.inkPotIndex === null || currentDraft.languageRoll === null) {
    wrap.appendChild(
      document.createTextNode('Internal error: missing inkPot index or language roll.'),
    );
    return wrap;
  }
  const pair = ctx.scenario.inkPot[currentDraft.inkPotIndex];
  if (!pair) {
    wrap.appendChild(document.createTextNode('Internal error: ink pot entry missing.'));
    return wrap;
  }
  const isSuperior = countSuccesses(currentDraft.languageRoll) > 0;
  const word = isSuperior ? pair.superior : pair.inferior;
  const flourishApplied =
    currentDraft.attemptedFlourish &&
    currentDraft.heartRoll !== null &&
    countSuccesses(currentDraft.heartRoll) > 0;
  const required =
    flourishApplied && currentDraft.flourishAdjective
      ? `${currentDraft.flourishAdjective} ${word}`
      : word;

  const rollLine = document.createElement('p');
  rollLine.innerHTML = `Language roll: ${formatDice(currentDraft.languageRoll)} — ${
    isSuperior ? '<span class="success">Superior</span>' : '<span class="failure">Inferior</span>'
  } word.`;
  wrap.appendChild(rollLine);

  const chip = document.createElement('p');
  chip.className = 'word-chip';
  chip.textContent = `Incorporate: ${required}`;
  wrap.appendChild(chip);

  const ta = document.createElement('textarea');
  ta.className = 'paragraph-area';
  ta.rows = 6;
  ta.placeholder = `Write your paragraph using "${required}".`;
  ta.value = currentDraft.text;
  wrap.appendChild(ta);

  const indicator = document.createElement('p');
  indicator.className = 'word-indicator';
  indicator.textContent = currentDraft.text.toLowerCase().includes(required.toLowerCase())
    ? '✓ word found in paragraph'
    : '… word not yet present';
  wrap.appendChild(indicator);

  ta.addEventListener('input', () => {
    currentDraft.text = ta.value;
    indicator.textContent = ta.value.toLowerCase().includes(required.toLowerCase())
      ? '✓ word found in paragraph'
      : '… word not yet present';
  });

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn--primary';
  next.textContent = 'Finish paragraph (Penmanship roll)';
  next.addEventListener('click', () => {
    currentDraft.phase = 'ROLL_PENMANSHIP';
    rerender(ctx);
  });
  wrap.appendChild(next);
  return wrap;
}

function renderRollPenmanship(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId);
  if (!character) {
    wrap.appendChild(document.createTextNode('Character not found.'));
    return wrap;
  }
  const skillBonusActive = canSpendSkill(ctx, 'penmanship');
  const plan = planRoll({
    attribute: 'penmanship',
    character,
    scenario: ctx.scenario,
    skillBonusActive,
  });

  const info = document.createElement('p');
  info.textContent = `Roll Penmanship (${plan.diceCount} dice${plan.rerollPolicy === 'highest' ? ', re-roll the highest' : ''}${skillBonusActive ? ', skill applied' : ''}).`;
  wrap.appendChild(info);

  if (canSpendSkillButton(ctx, 'penmanship')) {
    wrap.appendChild(makeSkillButton(ctx, 'penmanship', () => rerender(ctx)));
  }

  const rollBtn = document.createElement('button');
  rollBtn.type = 'button';
  rollBtn.className = 'btn btn--primary';
  rollBtn.textContent = 'Roll dice';
  rollBtn.addEventListener('click', () => {
    rollBtn.classList.add('shake');
    rollBtn.disabled = true;
    setTimeout(() => {
      let dice = roll(plan.diceCount);
      if (plan.rerollPolicy === 'highest' && dice.length > 0) {
        const max = Math.max(...dice);
        const i = dice.indexOf(max);
        const re = roll(1)[0] ?? 1;
        dice = [...dice.slice(0, i), re, ...dice.slice(i + 1)];
      }
      currentDraft.penmanshipRoll = dice;
      if (skillBonusActive) currentDraft.skillUsedHere = 'penmanship';
      currentDraft.phase = 'PARAGRAPH_DONE';
      rerender(ctx);
    }, 250);
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function renderParagraphDone(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  if (
    currentDraft.inkPotIndex === null ||
    currentDraft.languageRoll === null ||
    currentDraft.penmanshipRoll === null
  ) {
    wrap.appendChild(document.createTextNode('Internal error: missing roll data.'));
    return wrap;
  }
  const pair = ctx.scenario.inkPot[currentDraft.inkPotIndex];
  if (!pair) {
    wrap.appendChild(document.createTextNode('Internal error: ink pot entry missing.'));
    return wrap;
  }
  const isSuperior = countSuccesses(currentDraft.languageRoll) > 0;
  const flourishApplied =
    currentDraft.attemptedFlourish &&
    currentDraft.heartRoll !== null &&
    countSuccesses(currentDraft.heartRoll) > 0;
  const penOk = countSuccesses(currentDraft.penmanshipRoll) > 0;
  let pts = isSuperior ? (flourishApplied ? 2 : 1) : flourishApplied ? -1 : 0;
  if (penOk) pts += 1;

  const summary = document.createElement('p');
  summary.innerHTML = `Word: ${isSuperior ? pair.superior : pair.inferior} (${
    isSuperior ? '<span class="success">superior</span>' : '<span class="failure">inferior</span>'
  })${flourishApplied ? ` + flourish "${currentDraft.flourishAdjective}"` : ''}.<br>
    Penmanship: ${formatDice(currentDraft.penmanshipRoll)} — ${penOk ? '<span class="success">+1</span>' : '<span class="failure">no bonus</span>'}.<br>
    <strong>Points this paragraph: ${pts}</strong>`;
  wrap.appendChild(summary);

  const isLast = ctx.session.paragraphs.length === 4;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn--primary';
  next.textContent = isLast ? 'Finish letter' : 'Next paragraph';
  next.addEventListener('click', () => {
    const draft = currentDraft;
    if (
      draft.inkPotIndex === null ||
      draft.languageRoll === null ||
      draft.penmanshipRoll === null
    ) {
      return;
    }
    const inkPotIndex = draft.inkPotIndex;
    const languageRoll = draft.languageRoll;
    const penmanshipRoll = draft.penmanshipRoll;
    ctx.onUpdate((s) => {
      const newPara = {
        inkPotIndex,
        attemptedFlourish: draft.attemptedFlourish,
        flourishAdjective: draft.attemptedFlourish ? draft.flourishAdjective : null,
        heartRoll: draft.heartRoll,
        languageRoll,
        penmanshipRoll,
        skillUsedHere: draft.skillUsedHere,
        text: draft.text,
      };
      const skillSpent = s.skillSpent || draft.skillUsedHere !== null;
      const paragraphs = [...s.paragraphs, newPara];
      const status: 'in_progress' | 'finished' =
        paragraphs.length >= 5 ? 'finished' : 'in_progress';
      return { ...s, paragraphs, skillSpent, status };
    });
    currentDraft = emptyDraft();
  });
  wrap.appendChild(next);
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

  // running score
  const totals = ctx.session.paragraphs.reduce<{ pts: number }>(
    (acc, p) => {
      const isSuperior = countSuccesses(p.languageRoll) > 0;
      const flourishApplied =
        p.attemptedFlourish && p.heartRoll !== null && countSuccesses(p.heartRoll) > 0;
      let pts = isSuperior ? (flourishApplied ? 2 : 1) : flourishApplied ? -1 : 0;
      if (countSuccesses(p.penmanshipRoll) > 0) pts += 1;
      return { pts: acc.pts + pts };
    },
    { pts: 0 },
  );
  const scoreLine = document.createElement('p');
  scoreLine.className = 'running-score';
  scoreLine.innerHTML = `<strong>Running score: ${totals.pts}</strong> (after ${ctx.session.paragraphs.length}/5)`;
  panel.appendChild(scoreLine);

  return panel;
}
