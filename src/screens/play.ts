import { CHARACTERS, SKILLS } from '../data';
import { countSuccesses, roll } from '../dice';
import { planRoll } from '../rules';
import { paragraphPoints } from '../scoring';
import type { GameSession, Scenario } from '../types';

export interface PlayCtx {
  session: GameSession;
  scenario: Scenario;
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

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const STEP_LABELS = ['Word', 'Flourish', 'Language', 'Write', 'Hand'] as const;

let currentDraft: Draft = emptyDraft();
let scenarioRecallOpen = false;
let lastSessionId = '';

function ensureDraftFor(session: GameSession) {
  if (session.id !== lastSessionId) {
    currentDraft = emptyDraft();
    scenarioRecallOpen = false;
    lastSessionId = session.id;
  }
}

function rerender(ctx: PlayCtx) {
  // Trigger main app render by no-op session update.
  ctx.onUpdate((s) => ({ ...s }));
}

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function formatOrdinalDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `Written this ${day}${ordinalSuffix(day)} day of ${month}`;
}

function formatSignedPoints(pts: number): string {
  if (pts > 0) return `+${pts}`;
  if (pts < 0) return `-${Math.abs(pts)}`;
  return '0';
}

function renderDiceRow(values: number[]): HTMLElement {
  const row = document.createElement('span');
  row.className = 'dice-row';
  for (const v of values) {
    const die = document.createElement('span');
    die.className = v >= 5 ? 'die die--success' : 'die';
    die.textContent = String(v);
    row.appendChild(die);
  }
  return row;
}

function attachRollButton(btn: HTMLButtonElement, onRoll: () => void): void {
  btn.addEventListener('click', () => {
    btn.classList.add('shake');
    btn.disabled = true;
    setTimeout(onRoll, 250);
  });
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
  btn.className = 'btn btn--skill';
  btn.textContent = `Spend ${skill?.name ?? 'skill'} — +1 die (once per letter)`;
  btn.addEventListener('click', () => {
    currentDraft.skillUsedHere = attr;
    onChange();
  });
  return btn;
}

export function renderPlay(ctx: PlayCtx): HTMLElement {
  ensureDraftFor(ctx.session);
  const root = document.createElement('section');
  root.className = 'screen screen--play';

  root.appendChild(renderHeader(ctx));

  const row = document.createElement('div');
  row.className = 'play-row';
  row.appendChild(renderInkPotCard(ctx));
  row.appendChild(renderLetter(ctx));
  row.appendChild(renderMarginalia(ctx));
  root.appendChild(row);

  return root;
}

function renderHeader(ctx: PlayCtx): HTMLElement {
  const header = document.createElement('div');
  header.className = 'desk-header';

  const title = document.createElement('div');
  title.className = 'desk-header__title';
  const strong = document.createElement('strong');
  strong.textContent = 'Quill';
  const scenarioTitle = document.createElement('span');
  scenarioTitle.className = 'desk-header__scenario';
  scenarioTitle.textContent = ctx.scenario.title;
  title.append(strong, scenarioTitle);
  header.appendChild(title);

  header.appendChild(renderMedallions(ctx));
  return header;
}

function renderMedallions(ctx: PlayCtx): HTMLElement {
  const row = document.createElement('div');
  row.className = 'medallions';
  const done = ctx.session.paragraphs.length;
  ROMAN.forEach((numeral, i) => {
    const med = document.createElement('span');
    const state = i < done ? 'done' : i === done ? 'current' : 'future';
    med.className = `medallion medallion--${state}`;
    med.textContent = numeral;
    row.appendChild(med);
  });
  return row;
}

function renderInkPotCard(ctx: PlayCtx): HTMLElement {
  const card = document.createElement('aside');
  card.className = 'ink-pot-card paper paper--side';
  const h = document.createElement('h3');
  h.textContent = 'The Ink Pot';
  card.appendChild(h);

  const hint = document.createElement('p');
  hint.className = 'inkpot-hint';
  hint.textContent =
    currentDraft.phase === 'PICK_WORD'
      ? 'Choose a word for this paragraph.'
      : 'Each word serves one paragraph.';
  card.appendChild(hint);

  const list = document.createElement('ul');
  list.className = 'inkpot-list';
  ctx.scenario.inkPot.forEach((entry, idx) => {
    const used = ctx.session.paragraphs.find((p) => p.inkPotIndex === idx);
    const chosen = !used && currentDraft.inkPotIndex === idx;
    const pickable = currentDraft.phase === 'PICK_WORD' && !used;

    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inkpot-item';
    btn.disabled = !pickable;

    if (used) {
      const isSuperior = used.languageRoll.some((d) => d >= 5);
      btn.classList.add('inkpot-item--used');
      btn.append(entry.inferior, ' ');
      const suffix = document.createElement('span');
      suffix.className = 'small-caps';
      suffix.textContent = isSuperior ? '→ superior' : '→ inferior';
      btn.appendChild(suffix);
    } else if (chosen) {
      btn.classList.add('inkpot-item--chosen');
      btn.append(entry.inferior, ' ');
      const suffix = document.createElement('span');
      suffix.className = 'small-caps';
      suffix.textContent = '← chosen';
      btn.appendChild(suffix);
    } else {
      btn.textContent = entry.inferior;
    }

    if (pickable) {
      btn.addEventListener('click', () => {
        currentDraft.inkPotIndex = idx;
        currentDraft.phase = 'DECIDE_FLOURISH';
        rerender(ctx);
      });
    }

    li.appendChild(btn);
    list.appendChild(li);
  });
  card.appendChild(list);
  return card;
}

function renderLetter(ctx: PlayCtx): HTMLElement {
  const letter = document.createElement('section');
  letter.className = 'letter paper';
  letter.appendChild(renderLetterHeadline(ctx));

  for (const p of ctx.session.paragraphs) {
    const para = document.createElement('p');
    para.className = 'letter-paragraph';
    para.textContent = p.text || '(empty paragraph)';
    letter.appendChild(para);
  }

  letter.appendChild(renderLetterDraftSlot(ctx));
  return letter;
}

function renderLetterHeadline(ctx: PlayCtx): HTMLElement {
  const head = document.createElement('div');
  head.className = 'letterhead';
  const title = document.createElement('p');
  title.className = 'letterhead__title';
  title.textContent = ctx.scenario.title;
  const date = document.createElement('p');
  date.className = 'letterhead__date';
  date.textContent = formatOrdinalDate(ctx.session.startedAt);
  head.append(title, date);
  return head;
}

function renderLetterDraftSlot(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'letter-draft';

  switch (currentDraft.phase) {
    case 'PICK_WORD': {
      const p = document.createElement('p');
      p.className = 'letter-placeholder';
      p.textContent = '… the next paragraph awaits a word from the ink pot.';
      wrap.appendChild(p);
      break;
    }
    case 'DECIDE_FLOURISH':
    case 'ROLL_HEART':
    case 'ROLL_LANGUAGE': {
      const p = document.createElement('p');
      p.className = 'letter-placeholder';
      p.textContent = '… the quill hovers while the word is prepared.';
      wrap.appendChild(p);
      break;
    }
    case 'WRITE':
      wrap.appendChild(renderWriteSlot(ctx));
      break;
    case 'ROLL_PENMANSHIP':
    case 'PARAGRAPH_DONE': {
      const p = document.createElement('p');
      p.className = 'letter-paragraph';
      p.textContent = currentDraft.text || '(empty paragraph)';
      wrap.appendChild(p);
      break;
    }
  }
  return wrap;
}

function renderWriteSlot(ctx: PlayCtx): HTMLElement {
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

  const chip = document.createElement('p');
  chip.className = 'word-chip';
  chip.textContent = `Incorporate: "${required}"`;
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
    ? '✓ the word is set upon the page.'
    : '… the word has not yet been set down.';
  wrap.appendChild(indicator);

  ta.addEventListener('input', () => {
    currentDraft.text = ta.value;
    indicator.textContent = ta.value.toLowerCase().includes(required.toLowerCase())
      ? '✓ the word is set upon the page.'
      : '… the word has not yet been set down.';
  });

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn--primary';
  next.textContent = 'Finish paragraph';
  next.addEventListener('click', () => {
    currentDraft.phase = 'ROLL_PENMANSHIP';
    rerender(ctx);
  });
  wrap.appendChild(next);
  return wrap;
}

function renderMarginalia(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'marginalia';
  wrap.appendChild(renderMarginaliaStepCard(ctx));
  wrap.appendChild(renderMarginaliaReferenceCard(ctx));
  return wrap;
}

function stepIndexForPhase(phase: PhaseName): number {
  switch (phase) {
    case 'PICK_WORD':
      return 0;
    case 'DECIDE_FLOURISH':
    case 'ROLL_HEART':
      return 1;
    case 'ROLL_LANGUAGE':
      return 2;
    case 'WRITE':
      return 3;
    case 'ROLL_PENMANSHIP':
      return 4;
    case 'PARAGRAPH_DONE':
      return 5;
  }
}

function renderStepper(phase: PhaseName): HTMLElement {
  const row = document.createElement('div');
  row.className = 'stepper';
  const active = stepIndexForPhase(phase);
  STEP_LABELS.forEach((label, i) => {
    const cell = document.createElement('span');
    const state =
      i < active ? ' stepper__step--done' : i === active ? ' stepper__step--active' : '';
    cell.className = `stepper__step${state}`;
    cell.textContent = label;
    row.appendChild(cell);
  });
  return row;
}

function renderMarginaliaStepCard(ctx: PlayCtx): HTMLElement {
  const card = document.createElement('section');
  card.className = 'marginalia-card marginalia-card--step paper paper--side';

  const roman = ROMAN[ctx.session.paragraphs.length] ?? 'V';
  const heading = document.createElement('h4');
  heading.textContent = `Paragraph ${roman} of V`;
  card.appendChild(heading);

  card.appendChild(renderStepper(currentDraft.phase));

  switch (currentDraft.phase) {
    case 'PICK_WORD': {
      const p = document.createElement('p');
      p.className = 'step-instruction';
      p.textContent = 'Dip your quill: choose one word from the Ink Pot to begin this paragraph.';
      card.appendChild(p);
      break;
    }
    case 'DECIDE_FLOURISH':
      card.appendChild(renderStepFlourish(ctx));
      break;
    case 'ROLL_HEART':
      card.appendChild(renderRollHeartStep(ctx));
      break;
    case 'ROLL_LANGUAGE':
      card.appendChild(renderRollLanguageStep(ctx));
      break;
    case 'WRITE':
      break;
    case 'ROLL_PENMANSHIP':
      card.appendChild(renderRollPenmanshipStep(ctx));
      break;
    case 'PARAGRAPH_DONE':
      card.appendChild(renderStepDone(ctx));
      break;
  }

  return card;
}

function renderStepFlourish(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  const info = document.createElement('p');
  info.className = 'step-instruction';
  info.textContent =
    'You may attempt a flourish — an adjective or adverb to enrich your word. A Heart roll decides whether it holds. Flourishes are optional.';
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
  attempt.textContent = 'Attempt it';
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
  skip.textContent = 'Write plainly';
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

function renderRollHeartStep(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
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

  const info = document.createElement('p');
  info.className = 'roll-info';
  info.textContent = `Roll Heart (${plan.diceCount} dice${skillBonusActive ? ', skill applied' : ''}) to see if the flourish "${currentDraft.flourishAdjective}" holds.`;
  wrap.appendChild(info);

  if (canSpendSkillButton(ctx, 'heart')) {
    wrap.appendChild(makeSkillButton(ctx, 'heart', () => rerender(ctx)));
  }

  const rollBtn = document.createElement('button');
  rollBtn.type = 'button';
  rollBtn.className = 'btn btn--primary';
  rollBtn.textContent = 'Roll the dice';
  attachRollButton(rollBtn, () => {
    const dice = roll(plan.diceCount);
    currentDraft.heartRoll = dice;
    currentDraft.phase = 'ROLL_LANGUAGE';
    if (skillBonusActive) {
      currentDraft.skillUsedHere = 'heart';
    }
    rerender(ctx);
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function renderRollLanguageStep(ctx: PlayCtx): HTMLElement {
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

  if (currentDraft.attemptedFlourish && currentDraft.heartRoll) {
    const held = countSuccesses(currentDraft.heartRoll) > 0;
    const verdict = document.createElement('p');
    verdict.className = 'roll-verdict';
    verdict.append(renderDiceRow(currentDraft.heartRoll), ' ');
    const label = document.createElement('span');
    label.className = held ? 'success' : 'failure';
    label.textContent = held
      ? `The flourish "${currentDraft.flourishAdjective}" holds.`
      : 'The flourish is lost — and will cost you.';
    verdict.appendChild(label);
    wrap.appendChild(verdict);
  }

  const info = document.createElement('p');
  info.className = 'roll-info';
  info.textContent = `Roll Language (${plan.diceCount} dice${skillBonusActive ? ', skill applied' : ''}) to determine whether you draw the superior word.`;
  wrap.appendChild(info);

  if (canSpendSkillButton(ctx, 'language')) {
    wrap.appendChild(makeSkillButton(ctx, 'language', () => rerender(ctx)));
  }

  const rollBtn = document.createElement('button');
  rollBtn.type = 'button';
  rollBtn.className = 'btn btn--primary';
  rollBtn.textContent = 'Roll the dice';
  attachRollButton(rollBtn, () => {
    const dice = roll(plan.diceCount);
    currentDraft.languageRoll = dice;
    if (skillBonusActive) currentDraft.skillUsedHere = 'language';
    currentDraft.phase = 'WRITE';
    rerender(ctx);
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function renderRollPenmanshipStep(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId);
  if (!character) {
    wrap.appendChild(document.createTextNode('Character not found.'));
    return wrap;
  }
  if (currentDraft.inkPotIndex === null || currentDraft.languageRoll === null) {
    wrap.appendChild(
      document.createTextNode('Internal error: missing ink pot index or language roll.'),
    );
    return wrap;
  }
  const pair = ctx.scenario.inkPot[currentDraft.inkPotIndex];
  if (!pair) {
    wrap.appendChild(document.createTextNode('Internal error: ink pot entry missing.'));
    return wrap;
  }
  const isSuperior = countSuccesses(currentDraft.languageRoll) > 0;

  const verdict = document.createElement('p');
  verdict.className = 'roll-verdict';
  verdict.append(renderDiceRow(currentDraft.languageRoll), ' ');
  const label = document.createElement('span');
  label.className = isSuperior ? 'success' : 'failure';
  label.textContent = isSuperior
    ? `Superior — write "${pair.superior}".`
    : `Inferior — "${pair.inferior}" must serve.`;
  verdict.appendChild(label);
  wrap.appendChild(verdict);

  const skillBonusActive = canSpendSkill(ctx, 'penmanship');
  const plan = planRoll({
    attribute: 'penmanship',
    character,
    scenario: ctx.scenario,
    skillBonusActive,
  });

  const info = document.createElement('p');
  info.className = 'roll-info';
  info.textContent = `Roll Penmanship (${plan.diceCount} dice${plan.rerollPolicy === 'highest' ? ', re-roll the highest' : ''}${skillBonusActive ? ', skill applied' : ''}) for a fine hand.`;
  wrap.appendChild(info);

  if (canSpendSkillButton(ctx, 'penmanship')) {
    wrap.appendChild(makeSkillButton(ctx, 'penmanship', () => rerender(ctx)));
  }

  const rollBtn = document.createElement('button');
  rollBtn.type = 'button';
  rollBtn.className = 'btn btn--primary';
  rollBtn.textContent = 'Roll the dice';
  attachRollButton(rollBtn, () => {
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
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function renderStepDone(ctx: PlayCtx): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'done-summary';
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

  const penLine = document.createElement('p');
  penLine.append(renderDiceRow(currentDraft.penmanshipRoll), ' ');
  const penLabel = document.createElement('span');
  penLabel.className = penOk ? 'success' : 'failure';
  penLabel.textContent = penOk ? 'A fine hand — +1 point.' : 'A plain hand — no bonus.';
  penLine.appendChild(penLabel);
  wrap.appendChild(penLine);

  const wordLine = document.createElement('p');
  const wordSpan = document.createElement('span');
  wordSpan.className = isSuperior ? 'success' : 'failure';
  wordSpan.textContent = isSuperior
    ? `Superior — "${pair.superior}."`
    : `Inferior — "${pair.inferior}" served.`;
  wordLine.appendChild(wordSpan);
  wrap.appendChild(wordLine);

  if (flourishApplied) {
    const flourishLine = document.createElement('p');
    flourishLine.textContent = `With the flourish "${currentDraft.flourishAdjective}."`;
    wrap.appendChild(flourishLine);
  }

  const ptsLine = document.createElement('p');
  ptsLine.className = 'done-points';
  ptsLine.textContent = `${formatSignedPoints(pts)} points this paragraph`;
  wrap.appendChild(ptsLine);

  const isLast = ctx.session.paragraphs.length === 4;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn--primary';
  next.textContent = isLast ? 'Seal & finish the letter' : 'Next paragraph';
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
    // Reset the draft BEFORE onUpdate. The store notifies subscribers synchronously,
    // which triggers a re-render that reads currentDraft.phase. If we reset after,
    // the re-render shows PARAGRAPH_DONE again and the player has to reload.
    currentDraft = emptyDraft();
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
  });
  wrap.appendChild(next);
  return wrap;
}

function renderMarginaliaReferenceCard(ctx: PlayCtx): HTMLElement {
  const card = document.createElement('section');
  card.className = 'marginalia-card marginalia-card--reference paper paper--side';
  const h = document.createElement('h5');
  h.textContent = 'The Correspondent';
  card.appendChild(h);

  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId);
  const skill = SKILLS.find((s) => s.id === ctx.session.skillId);
  const charLine = document.createElement('p');
  charLine.className = 'char-line';
  charLine.append(`${character?.name ?? ''} — ${skill?.name ?? ''} `);
  const skillNote = document.createElement('span');
  skillNote.className = 'small-caps';
  skillNote.textContent = ctx.session.skillSpent ? 'spent' : 'unspent';
  charLine.appendChild(skillNote);
  card.appendChild(charLine);

  const total = ctx.session.paragraphs.reduce((acc, p) => acc + paragraphPoints(p), 0);
  const scoreLine = document.createElement('p');
  scoreLine.className = 'running-score';
  const strong = document.createElement('strong');
  strong.textContent = String(total);
  scoreLine.append('Running Score: ', strong, ` (after ${ctx.session.paragraphs.length} of 5)`);
  card.appendChild(scoreLine);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'recall-toggle';
  toggle.textContent = scenarioRecallOpen ? 'Hide the scenario…' : 'Recall the scenario…';
  toggle.addEventListener('click', () => {
    scenarioRecallOpen = !scenarioRecallOpen;
    rerender(ctx);
  });
  card.appendChild(toggle);

  if (scenarioRecallOpen) {
    const panel = document.createElement('div');
    panel.className = 'recall-panel';
    for (const p of ctx.scenario.profile) {
      const para = document.createElement('p');
      para.textContent = p;
      panel.appendChild(para);
    }
    const rulesHeading = document.createElement('p');
    rulesHeading.className = 'small-caps';
    rulesHeading.textContent = 'Rules of Correspondence';
    panel.appendChild(rulesHeading);
    if (ctx.scenario.rulesOfCorrespondence.length === 0) {
      const none = document.createElement('p');
      none.textContent = 'None.';
      panel.appendChild(none);
    } else {
      for (const r of ctx.scenario.rulesOfCorrespondence) {
        const para = document.createElement('p');
        if (r.type === 'narrative') {
          para.className = 'rule rule--narrative';
          const badge = document.createElement('span');
          badge.className = 'rule__badge';
          badge.textContent = 'Player-enforced';
          para.append(badge, ' ', r.description);
        } else {
          para.className = 'rule';
          para.textContent = r.description;
        }
        panel.appendChild(para);
      }
    }
    card.appendChild(panel);
  }

  return card;
}
