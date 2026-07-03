import { CHARACTERS, SKILLS } from '../data';
import { isSuccess, roll } from '../dice';
import { planRoll } from '../rules';
import { fineHand, flourishHeld, isSuperior, paragraphPoints } from '../scoring';
import type { GameSession, Scenario } from '../types';
import { renderLetterhead } from './letterhead';

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

function formatSignedPoints(pts: number): string {
  return pts > 0 ? `+${pts}` : String(pts);
}

function smallCaps(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'small-caps';
  span.textContent = text;
  return span;
}

function internalError(msg: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.appendChild(document.createTextNode(msg));
  return wrap;
}

function renderDiceRow(values: number[]): HTMLElement {
  const row = document.createElement('span');
  row.className = 'dice-row';
  for (const v of values) {
    const die = document.createElement('span');
    die.className = isSuccess(v) ? 'die die--success' : 'die';
    die.textContent = String(v);
    row.appendChild(die);
  }
  return row;
}

function attachRollButton(btn: HTMLButtonElement, onRoll: () => void): void {
  btn.addEventListener('click', () => {
    btn.classList.add('shake');
    btn.disabled = true;
    setTimeout(() => {
      // A re-render during the shake (skill button, recall toggle) replaces the
      // whole tree and detaches this button; its dice plan is stale, so abort
      // and let the freshly rendered button roll with the current plan.
      if (!btn.isConnected) return;
      onRoll();
    }, 250);
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
      btn.classList.add('inkpot-item--used');
      btn.append(
        entry.inferior,
        ' ',
        smallCaps(isSuperior(used.languageRoll) ? '→ superior' : '→ inferior'),
      );
    } else if (chosen) {
      btn.classList.add('inkpot-item--chosen');
      btn.append(entry.inferior, ' ', smallCaps('← chosen'));
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
  letter.appendChild(renderLetterhead(ctx.scenario.title, ctx.session.startedAt));

  for (const p of ctx.session.paragraphs) {
    const para = document.createElement('p');
    para.className = 'letter-paragraph';
    para.textContent = p.text || '(empty paragraph)';
    letter.appendChild(para);
  }

  letter.appendChild(renderLetterDraftSlot(ctx));
  return letter;
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
  if (currentDraft.inkPotIndex === null || currentDraft.languageRoll === null) {
    return internalError('Internal error: missing inkPot index or language roll.');
  }
  const pair = ctx.scenario.inkPot[currentDraft.inkPotIndex];
  if (!pair) {
    return internalError('Internal error: ink pot entry missing.');
  }
  const wrap = document.createElement('div');
  const word = isSuperior(currentDraft.languageRoll) ? pair.superior : pair.inferior;
  const flourishApplied = flourishHeld(currentDraft.attemptedFlourish, currentDraft.heartRoll);
  const required =
    flourishApplied && currentDraft.flourishAdjective
      ? `${currentDraft.flourishAdjective} ${word}`
      : word;
  const requiredLower = required.toLowerCase();

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
  const updateIndicator = () => {
    indicator.textContent = currentDraft.text.toLowerCase().includes(requiredLower)
      ? '✓ the word is set upon the page.'
      : '… the word has not yet been set down.';
  };
  updateIndicator();
  wrap.appendChild(indicator);

  ta.addEventListener('input', () => {
    currentDraft.text = ta.value;
    updateIndicator();
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

function makeRollVerdict(dice: number[], ok: boolean, text: string): HTMLElement {
  const verdict = document.createElement('p');
  verdict.className = 'roll-verdict';
  verdict.append(renderDiceRow(dice), ' ');
  const label = document.createElement('span');
  label.className = ok ? 'success' : 'failure';
  label.textContent = text;
  verdict.appendChild(label);
  return verdict;
}

function renderRollStep(
  ctx: PlayCtx,
  attr: 'penmanship' | 'language' | 'heart',
  purpose: string,
  onRolled: (dice: number[]) => void,
  verdict?: HTMLElement,
): HTMLElement {
  const character = CHARACTERS.find((c) => c.id === ctx.session.characterId);
  if (!character) {
    return internalError('Character not found.');
  }
  const wrap = document.createElement('div');
  const skillBonusActive = canSpendSkill(ctx, attr);
  const plan = planRoll({
    attribute: attr,
    character,
    scenario: ctx.scenario,
    skillBonusActive,
  });

  if (verdict) wrap.appendChild(verdict);

  const attrName = attr.charAt(0).toUpperCase() + attr.slice(1);
  const notes = `${plan.rerollPolicy === 'highest' ? ', re-roll the highest' : ''}${skillBonusActive ? ', skill applied' : ''}`;
  const info = document.createElement('p');
  info.className = 'roll-info';
  info.textContent = `Roll ${attrName} (${plan.diceCount} dice${notes}) ${purpose}`;
  wrap.appendChild(info);

  if (canSpendSkillButton(ctx, attr)) {
    wrap.appendChild(makeSkillButton(ctx, attr, () => rerender(ctx)));
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
    if (skillBonusActive) currentDraft.skillUsedHere = attr;
    onRolled(dice);
    rerender(ctx);
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function renderRollHeartStep(ctx: PlayCtx): HTMLElement {
  return renderRollStep(
    ctx,
    'heart',
    `to see if the flourish "${currentDraft.flourishAdjective}" holds.`,
    (dice) => {
      currentDraft.heartRoll = dice;
      currentDraft.phase = 'ROLL_LANGUAGE';
    },
  );
}

function renderRollLanguageStep(ctx: PlayCtx): HTMLElement {
  let verdict: HTMLElement | undefined;
  if (currentDraft.attemptedFlourish && currentDraft.heartRoll) {
    const held = flourishHeld(currentDraft.attemptedFlourish, currentDraft.heartRoll);
    verdict = makeRollVerdict(
      currentDraft.heartRoll,
      held,
      held
        ? `The flourish "${currentDraft.flourishAdjective}" holds.`
        : 'The flourish is lost — the word must stand alone.',
    );
  }
  return renderRollStep(
    ctx,
    'language',
    'to determine whether you draw the superior word.',
    (dice) => {
      currentDraft.languageRoll = dice;
      currentDraft.phase = 'WRITE';
    },
    verdict,
  );
}

function renderRollPenmanshipStep(ctx: PlayCtx): HTMLElement {
  const pair =
    currentDraft.inkPotIndex === null ? undefined : ctx.scenario.inkPot[currentDraft.inkPotIndex];
  if (!pair || currentDraft.languageRoll === null) {
    return internalError('Internal error: missing ink pot entry or language roll.');
  }
  const superior = isSuperior(currentDraft.languageRoll);
  const verdict = makeRollVerdict(
    currentDraft.languageRoll,
    superior,
    superior ? `Superior — write "${pair.superior}".` : `Inferior — "${pair.inferior}" must serve.`,
  );
  return renderRollStep(
    ctx,
    'penmanship',
    'for a fine hand.',
    (dice) => {
      currentDraft.penmanshipRoll = dice;
      currentDraft.phase = 'PARAGRAPH_DONE';
    },
    verdict,
  );
}

function renderStepDone(ctx: PlayCtx): HTMLElement {
  const pair =
    currentDraft.inkPotIndex === null ? undefined : ctx.scenario.inkPot[currentDraft.inkPotIndex];
  if (
    !pair ||
    currentDraft.inkPotIndex === null ||
    currentDraft.languageRoll === null ||
    currentDraft.penmanshipRoll === null
  ) {
    return internalError('Internal error: missing roll data.');
  }
  const wrap = document.createElement('div');
  wrap.className = 'done-summary';
  const superior = isSuperior(currentDraft.languageRoll);
  const flourishApplied = flourishHeld(currentDraft.attemptedFlourish, currentDraft.heartRoll);
  const penOk = fineHand(currentDraft.penmanshipRoll);
  const pts = paragraphPoints({
    inkPotIndex: currentDraft.inkPotIndex,
    attemptedFlourish: currentDraft.attemptedFlourish,
    flourishAdjective: currentDraft.attemptedFlourish ? currentDraft.flourishAdjective : null,
    heartRoll: currentDraft.heartRoll,
    languageRoll: currentDraft.languageRoll,
    penmanshipRoll: currentDraft.penmanshipRoll,
    skillUsedHere: currentDraft.skillUsedHere,
    text: currentDraft.text,
  });

  const penLine = document.createElement('p');
  penLine.append(renderDiceRow(currentDraft.penmanshipRoll), ' ');
  const penLabel = document.createElement('span');
  penLabel.className = penOk ? 'success' : 'failure';
  penLabel.textContent = penOk ? 'A fine hand — +1 point.' : 'A plain hand — no bonus.';
  penLine.appendChild(penLabel);
  wrap.appendChild(penLine);

  const wordLine = document.createElement('p');
  const wordSpan = document.createElement('span');
  wordSpan.className = superior ? 'success' : 'failure';
  wordSpan.textContent = superior
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
  // skillSpent only flips when the paragraph is committed; the draft's
  // skillUsedHere covers the window between spending and committing.
  const skillSpent = ctx.session.skillSpent || currentDraft.skillUsedHere !== null;
  skillNote.textContent = skillSpent ? 'spent' : 'unspent';
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
  card.appendChild(toggle);

  // Toggling is purely local UI — flip the panel in place rather than
  // rerender(ctx), which would rewrite localStorage and rebuild the whole
  // screen (destroying e.g. a mid-shake roll button).
  const panel = renderRecallPanel(ctx.scenario);
  panel.hidden = !scenarioRecallOpen;
  card.appendChild(panel);
  toggle.addEventListener('click', () => {
    scenarioRecallOpen = !scenarioRecallOpen;
    panel.hidden = !scenarioRecallOpen;
    toggle.textContent = scenarioRecallOpen ? 'Hide the scenario…' : 'Recall the scenario…';
  });

  return card;
}

function renderRecallPanel(scenario: Scenario): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'recall-panel';
  for (const p of scenario.profile) {
    const para = document.createElement('p');
    para.textContent = p;
    panel.appendChild(para);
  }
  const rulesHeading = document.createElement('p');
  rulesHeading.className = 'small-caps';
  rulesHeading.textContent = 'Rules of Correspondence';
  panel.appendChild(rulesHeading);
  if (scenario.rulesOfCorrespondence.length === 0) {
    const none = document.createElement('p');
    none.textContent = 'None.';
    panel.appendChild(none);
  } else {
    for (const r of scenario.rulesOfCorrespondence) {
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
  return panel;
}
