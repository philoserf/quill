import { isSuccess, roll } from '../dice';
import type { Draft } from '../paragraph';
import {
  advance,
  draftToParagraph,
  EMPTY_PARAGRAPH,
  emptyDraft,
  type PhaseName,
  STEP_INDEX,
} from '../paragraph';
import { planRoll } from '../rules';
import {
  fineHand,
  flourishHeld,
  formatSignedPoints,
  isSuperior,
  paragraphPoints,
} from '../scoring';
import type { Character, GameSession, Paragraph, Scenario, Skill } from '../types';
import { PARAGRAPHS_PER_LETTER } from '../types';
import { renderLetterhead } from './letterhead';

export interface PlayCtx {
  session: GameSession;
  scenario: Scenario;
  character: Character;
  skill: Skill;
  /** The only durable write this screen performs. Everything else is a repaint. */
  onCommit: (paragraph: Paragraph) => void;
}

/** What the render functions below actually need: the context plus the state
 *  this invocation owns. `state` is one shared object so a handler that fires
 *  after a repaint — the roll button's shake timer — reads the current draft
 *  rather than a copy captured when its button was built. */
interface PlayView extends PlayCtx {
  state: { draft: Draft; recallOpen: boolean };
  repaint: () => void;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const satisfies {
  length: typeof PARAGRAPHS_PER_LETTER;
};
// Unreachable while ROMAN satisfies the length above; tsc still wants a fallback.
const LAST_NUMERAL = ROMAN[PARAGRAPHS_PER_LETTER - 1] ?? 'V';
const STEP_LABELS = ['Word', 'Flourish', 'Language', 'Write', 'Hand'] as const;

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
      // A repaint during the shake — spending the skill is the live case —
      // replaces the play subtree and detaches this button; its dice plan is
      // stale, so abort and let the freshly rendered button roll with the
      // current plan. (The recall toggle mutates in place and does not repaint.)
      if (!btn.isConnected) return;
      onRoll();
    }, 250);
  });
}

function canSpendSkill(v: PlayView, attr: 'penmanship' | 'language' | 'heart'): boolean {
  if (v.session.skillSpent) return false;
  return v.skill.bonusAttribute === attr && v.state.draft.skillUsedHere === attr;
}

function canSpendSkillButton(v: PlayView, attr: 'penmanship' | 'language' | 'heart'): boolean {
  if (v.session.skillSpent) return false;
  return v.skill.bonusAttribute === attr && v.state.draft.skillUsedHere !== attr;
}

function makeSkillButton(
  v: PlayView,
  attr: 'penmanship' | 'language' | 'heart',
  onChange: () => void,
): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--skill';
  btn.textContent = `Spend ${v.skill.name} — +1 die (once per letter)`;
  btn.addEventListener('click', () => {
    v.state.draft.skillUsedHere = attr;
    onChange();
  });
  return btn;
}

export function renderPlay(ctx: PlayCtx): HTMLElement {
  const root = document.createElement('section');
  root.className = 'screen screen--play';

  // Owned by this invocation. A new letter means a new renderPlay call means a
  // fresh draft, so there is no session-change detection to get wrong.
  const v: PlayView = {
    ...ctx,
    state: { draft: emptyDraft(), recallOpen: false },
    repaint,
  };

  function repaint() {
    const row = document.createElement('div');
    row.className = 'play-row';
    row.append(renderInkPotCard(v), renderLetter(v), renderMarginalia(v));
    root.replaceChildren(renderHeader(v), row);
  }

  repaint();
  return root;
}

function renderHeader(v: PlayView): HTMLElement {
  const header = document.createElement('div');
  header.className = 'desk-header';

  const title = document.createElement('div');
  title.className = 'desk-header__title';
  const strong = document.createElement('strong');
  strong.textContent = 'Quill';
  const scenarioTitle = document.createElement('span');
  scenarioTitle.className = 'desk-header__scenario';
  scenarioTitle.textContent = v.scenario.title;
  title.append(strong, scenarioTitle);
  header.appendChild(title);

  header.appendChild(renderMedallions(v));
  return header;
}

function renderMedallions(v: PlayView): HTMLElement {
  const row = document.createElement('div');
  row.className = 'medallions';
  const done = v.session.paragraphs.length;
  ROMAN.forEach((numeral, i) => {
    const med = document.createElement('span');
    const state = i < done ? 'done' : i === done ? 'current' : 'future';
    med.className = `medallion medallion--${state}`;
    med.textContent = numeral;
    row.appendChild(med);
  });
  return row;
}

function renderInkPotCard(v: PlayView): HTMLElement {
  const card = document.createElement('aside');
  card.className = 'ink-pot-card paper paper--side';
  const h = document.createElement('h3');
  h.textContent = 'The Ink Pot';
  card.appendChild(h);

  const hint = document.createElement('p');
  hint.className = 'inkpot-hint';
  hint.textContent =
    v.state.draft.phase === 'PICK_WORD'
      ? 'Choose a word for this paragraph.'
      : 'Each word serves one paragraph.';
  card.appendChild(hint);

  const list = document.createElement('ul');
  list.className = 'inkpot-list';
  v.scenario.inkPot.forEach((entry, idx) => {
    const used = v.session.paragraphs.find((p) => p.inkPotIndex === idx);
    const chosen = !used && v.state.draft.inkPotIndex === idx;
    const pickable = v.state.draft.phase === 'PICK_WORD' && !used;

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
        v.state.draft = advance(v.state.draft, { type: 'pickWord', inkPotIndex: idx });
        v.repaint();
      });
    }

    li.appendChild(btn);
    list.appendChild(li);
  });
  card.appendChild(list);
  return card;
}

function renderLetter(v: PlayView): HTMLElement {
  const letter = document.createElement('section');
  letter.className = 'letter paper';
  letter.appendChild(renderLetterhead(v.scenario.title, v.session.startedAt));

  for (const p of v.session.paragraphs) {
    const para = document.createElement('p');
    para.className = 'letter-paragraph';
    para.textContent = p.text || EMPTY_PARAGRAPH;
    letter.appendChild(para);
  }

  letter.appendChild(renderLetterDraftSlot(v));
  return letter;
}

function renderLetterDraftSlot(v: PlayView): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'letter-draft';

  switch (v.state.draft.phase) {
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
      wrap.appendChild(renderWriteSlot(v));
      break;
    case 'ROLL_PENMANSHIP':
    case 'PARAGRAPH_DONE': {
      const p = document.createElement('p');
      p.className = 'letter-paragraph';
      p.textContent = v.state.draft.text || EMPTY_PARAGRAPH;
      wrap.appendChild(p);
      break;
    }
  }
  return wrap;
}

function renderWriteSlot(v: PlayView): HTMLElement {
  if (v.state.draft.inkPotIndex === null || v.state.draft.languageRoll === null) {
    return internalError('Internal error: missing inkPot index or language roll.');
  }
  const pair = v.scenario.inkPot[v.state.draft.inkPotIndex];
  if (!pair) {
    return internalError('Internal error: ink pot entry missing.');
  }
  const wrap = document.createElement('div');
  const word = isSuperior(v.state.draft.languageRoll) ? pair.superior : pair.inferior;
  const flourishApplied = flourishHeld(v.state.draft.heartRoll);
  const required =
    flourishApplied && v.state.draft.flourishAdjective
      ? `${v.state.draft.flourishAdjective} ${word}`
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
  ta.value = v.state.draft.text;
  wrap.appendChild(ta);

  const indicator = document.createElement('p');
  indicator.className = 'word-indicator';
  const updateIndicator = () => {
    indicator.textContent = v.state.draft.text.toLowerCase().includes(requiredLower)
      ? '✓ the word is set upon the page.'
      : '… the word has not yet been set down.';
  };
  updateIndicator();
  wrap.appendChild(indicator);

  ta.addEventListener('input', () => {
    v.state.draft.text = ta.value;
    updateIndicator();
  });

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn--primary';
  next.textContent = 'Finish paragraph';
  next.addEventListener('click', () => {
    v.state.draft = advance(v.state.draft, { type: 'finishParagraph' });
    v.repaint();
  });
  wrap.appendChild(next);
  return wrap;
}

function renderMarginalia(v: PlayView): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'marginalia';
  wrap.appendChild(renderMarginaliaStepCard(v));
  wrap.appendChild(renderMarginaliaReferenceCard(v));
  return wrap;
}

function renderStepper(phase: PhaseName): HTMLElement {
  const row = document.createElement('div');
  row.className = 'stepper';
  const active = STEP_INDEX[phase];
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

function renderMarginaliaStepCard(v: PlayView): HTMLElement {
  const card = document.createElement('section');
  card.className = 'marginalia-card marginalia-card--step paper paper--side';

  const roman = ROMAN[v.session.paragraphs.length] ?? LAST_NUMERAL;
  const heading = document.createElement('h4');
  heading.textContent = `Paragraph ${roman} of ${LAST_NUMERAL}`;
  card.appendChild(heading);

  card.appendChild(renderStepper(v.state.draft.phase));

  switch (v.state.draft.phase) {
    case 'PICK_WORD': {
      const p = document.createElement('p');
      p.className = 'step-instruction';
      p.textContent = 'Dip your quill: choose one word from the Ink Pot to begin this paragraph.';
      card.appendChild(p);
      break;
    }
    case 'DECIDE_FLOURISH':
      card.appendChild(renderStepFlourish(v));
      break;
    case 'ROLL_HEART':
      card.appendChild(renderRollHeartStep(v));
      break;
    case 'ROLL_LANGUAGE':
      card.appendChild(renderRollLanguageStep(v));
      break;
    case 'WRITE':
      break;
    case 'ROLL_PENMANSHIP':
      card.appendChild(renderRollPenmanshipStep(v));
      break;
    case 'PARAGRAPH_DONE':
      card.appendChild(renderStepDone(v));
      break;
  }

  return card;
}

function renderStepFlourish(v: PlayView): HTMLElement {
  const wrap = document.createElement('div');
  const info = document.createElement('p');
  info.className = 'step-instruction';
  info.textContent =
    'You may attempt a flourish — an adjective or adverb to enrich your word. A Heart roll decides whether it holds. Flourishes are optional.';
  wrap.appendChild(info);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'flourish word (e.g. "solemn")';
  input.value = v.state.draft.flourishAdjective;
  input.className = 'flourish-input';
  input.addEventListener('input', () => {
    v.state.draft.flourishAdjective = input.value;
  });
  wrap.appendChild(input);

  const attempt = document.createElement('button');
  attempt.type = 'button';
  attempt.className = 'btn btn--primary';
  attempt.textContent = 'Attempt it';
  attempt.addEventListener('click', () => {
    if (!v.state.draft.flourishAdjective.trim()) {
      input.focus();
      return;
    }
    v.state.draft = advance(v.state.draft, { type: 'attemptFlourish' });
    v.repaint();
  });

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn';
  skip.textContent = 'Write plainly';
  skip.addEventListener('click', () => {
    v.state.draft = advance(v.state.draft, { type: 'writePlainly' });
    v.repaint();
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
  v: PlayView,
  attr: 'penmanship' | 'language' | 'heart',
  purpose: string,
  onRolled: (dice: number[]) => void,
  verdict?: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  const skillBonusActive = canSpendSkill(v, attr);
  const plan = planRoll({
    attribute: attr,
    character: v.character,
    scenario: v.scenario,
    skillBonusActive,
  });

  if (verdict) wrap.appendChild(verdict);

  const attrName = attr.charAt(0).toUpperCase() + attr.slice(1);
  const notes = `${plan.rerollPolicy === 'highest' ? ', re-roll the highest' : ''}${skillBonusActive ? ', skill applied' : ''}`;
  const info = document.createElement('p');
  info.className = 'roll-info';
  info.textContent = `Roll ${attrName} (${plan.diceCount} dice${notes}) ${purpose}`;
  wrap.appendChild(info);

  if (canSpendSkillButton(v, attr)) {
    wrap.appendChild(makeSkillButton(v, attr, () => v.repaint()));
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
    if (skillBonusActive) v.state.draft.skillUsedHere = attr;
    onRolled(dice);
    v.repaint();
  });
  wrap.appendChild(rollBtn);
  return wrap;
}

function renderRollHeartStep(v: PlayView): HTMLElement {
  return renderRollStep(
    v,
    'heart',
    `to see if the flourish "${v.state.draft.flourishAdjective}" holds.`,
    (dice) => {
      v.state.draft = advance(v.state.draft, { type: 'rolled', attribute: 'heart', dice });
    },
  );
}

function renderRollLanguageStep(v: PlayView): HTMLElement {
  let verdict: HTMLElement | undefined;
  if (v.state.draft.heartRoll) {
    const held = flourishHeld(v.state.draft.heartRoll);
    verdict = makeRollVerdict(
      v.state.draft.heartRoll,
      held,
      held
        ? `The flourish "${v.state.draft.flourishAdjective}" holds.`
        : 'The flourish is lost — the word must stand alone.',
    );
  }
  return renderRollStep(
    v,
    'language',
    'to determine whether you draw the superior word.',
    (dice) => {
      v.state.draft = advance(v.state.draft, { type: 'rolled', attribute: 'language', dice });
    },
    verdict,
  );
}

function renderRollPenmanshipStep(v: PlayView): HTMLElement {
  const pair =
    v.state.draft.inkPotIndex === null ? undefined : v.scenario.inkPot[v.state.draft.inkPotIndex];
  if (!pair || v.state.draft.languageRoll === null) {
    return internalError('Internal error: missing ink pot entry or language roll.');
  }
  const superior = isSuperior(v.state.draft.languageRoll);
  const verdict = makeRollVerdict(
    v.state.draft.languageRoll,
    superior,
    superior ? `Superior — write "${pair.superior}".` : `Inferior — "${pair.inferior}" must serve.`,
  );
  return renderRollStep(
    v,
    'penmanship',
    'for a fine hand.',
    (dice) => {
      v.state.draft = advance(v.state.draft, { type: 'rolled', attribute: 'penmanship', dice });
    },
    verdict,
  );
}

function renderStepDone(v: PlayView): HTMLElement {
  const para = draftToParagraph(v.state.draft);
  const pair = para === null ? undefined : v.scenario.inkPot[para.inkPotIndex];
  if (!para || !pair) {
    return internalError('Internal error: missing roll data.');
  }
  const wrap = document.createElement('div');
  wrap.className = 'done-summary';
  const superior = isSuperior(para.languageRoll);
  const flourishApplied = flourishHeld(para.heartRoll);
  const penOk = fineHand(para.penmanshipRoll);
  const pts = paragraphPoints(para);

  const penLine = document.createElement('p');
  penLine.append(renderDiceRow(para.penmanshipRoll), ' ');
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
    flourishLine.textContent = `With the flourish "${v.state.draft.flourishAdjective}."`;
    wrap.appendChild(flourishLine);
  }

  const ptsLine = document.createElement('p');
  ptsLine.className = 'done-points';
  ptsLine.textContent = `${formatSignedPoints(pts)} points this paragraph`;
  wrap.appendChild(ptsLine);

  const isLast = v.session.paragraphs.length === PARAGRAPHS_PER_LETTER - 1;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn--primary';
  next.textContent = isLast ? 'Seal & finish the letter' : 'Next paragraph';
  next.addEventListener('click', () => {
    const newPara = draftToParagraph(v.state.draft);
    if (!newPara) return;
    // Committing replaces the whole screen with a fresh renderPlay, discarding
    // this closure and its draft — there is no reset to sequence.
    v.onCommit(newPara);
  });
  wrap.appendChild(next);
  return wrap;
}

function renderMarginaliaReferenceCard(v: PlayView): HTMLElement {
  const card = document.createElement('section');
  card.className = 'marginalia-card marginalia-card--reference paper paper--side';
  const h = document.createElement('h5');
  h.textContent = 'The Correspondent';
  card.appendChild(h);

  const charLine = document.createElement('p');
  charLine.className = 'char-line';
  charLine.append(`${v.character.name} — ${v.skill.name} `);
  const skillNote = document.createElement('span');
  skillNote.className = 'small-caps';
  // skillSpent only flips when the paragraph is committed; the draft's
  // skillUsedHere covers the window between spending and committing.
  const skillSpent = v.session.skillSpent || v.state.draft.skillUsedHere !== null;
  skillNote.textContent = skillSpent ? 'spent' : 'unspent';
  charLine.appendChild(skillNote);
  card.appendChild(charLine);

  const total = v.session.paragraphs.reduce((acc, p) => acc + paragraphPoints(p), 0);
  const scoreLine = document.createElement('p');
  scoreLine.className = 'running-score';
  const strong = document.createElement('strong');
  strong.textContent = String(total);
  scoreLine.append(
    'Running Score: ',
    strong,
    ` (after ${v.session.paragraphs.length} of ${PARAGRAPHS_PER_LETTER})`,
  );
  card.appendChild(scoreLine);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'recall-toggle';
  toggle.textContent = v.state.recallOpen ? 'Hide the scenario…' : 'Recall the scenario…';
  card.appendChild(toggle);

  // Toggling is purely local UI — flip the panel in place rather than
  // v.repaint(), which would rebuild the play subtree and destroy e.g. a
  // mid-shake roll button.
  const panel = renderRecallPanel(v.scenario);
  panel.hidden = !v.state.recallOpen;
  card.appendChild(panel);
  toggle.addEventListener('click', () => {
    v.state.recallOpen = !v.state.recallOpen;
    panel.hidden = !v.state.recallOpen;
    toggle.textContent = v.state.recallOpen ? 'Hide the scenario…' : 'Recall the scenario…';
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
      para.className = 'rule';
      para.textContent = r.description;
      panel.appendChild(para);
    }
  }
  return panel;
}
