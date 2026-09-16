import { CHARACTERS, SKILLS } from '../data';
import { diceForRating } from '../dice';
import type { Character, Scenario } from '../types';
import { renderScenarioDetail } from './fragments';

export interface SetupCtx {
  scenarios: Scenario[];
  onBegin: (sel: { characterId: string; skillId: string; scenarioId: string }) => void;
}

interface SetupState {
  characterId: string | null;
  skillId: string | null;
  scenarioId: string | null;
}

export function renderSetup(ctx: SetupCtx): HTMLElement {
  const root = document.createElement('section');
  root.className = 'screen screen--setup';
  const state: SetupState = { characterId: null, skillId: null, scenarioId: null };
  // Selecting rebuilds the whole screen, destroying the focused card. Arrow-key
  // navigation would otherwise drop focus to the body on every move.
  let focusAfterRender: string | null = null;

  function choose(kind: string, apply: (id: string) => void) {
    return (item: { id: string }) => {
      apply(item.id);
      focusAfterRender = cardId(kind, item.id);
      render();
    };
  }

  function render() {
    root.replaceChildren();

    const titleBlock = document.createElement('div');
    titleBlock.className = 'desk-title';
    const title = document.createElement('h1');
    title.textContent = 'Quill';
    const subtitle = document.createElement('p');
    subtitle.className = 'desk-title__subtitle';
    subtitle.textContent = 'A letter-writing roleplaying game · by Scott Malthouse';
    const helper = document.createElement('p');
    helper.className = 'desk-title__helper';
    helper.textContent = 'Choose a character, a skill, and a scenario — then take up your quill.';
    titleBlock.append(title, subtitle, helper);
    root.appendChild(titleBlock);

    root.appendChild(
      renderChoiceStep({
        kind: 'character',
        title: 'I. The Character',
        prompt: 'Who holds the quill?',
        items: CHARACTERS,
        selectedId: state.characterId,
        name: (c) => c.name,
        blurb: (c) => c.flavor[0] ?? '',
        extra: renderAttributePips,
        onSelect: choose('character', (id) => {
          state.characterId = id;
        }),
      }),
    );

    if (state.characterId) {
      root.appendChild(
        renderChoiceStep({
          kind: 'skill',
          title: 'II. The Skill',
          prompt: 'One gift, spent once per letter.',
          items: SKILLS,
          selectedId: state.skillId,
          name: (s) => s.name,
          blurb: (s) => s.description,
          onSelect: choose('skill', (id) => {
            state.skillId = id;
          }),
        }),
      );
    }

    if (state.skillId) {
      const step = renderChoiceStep({
        kind: 'scenario',
        title: 'III. The Scenario',
        prompt: 'To whom do you write, and why?',
        items: ctx.scenarios,
        selectedId: state.scenarioId,
        name: (s) => s.title,
        blurb: (s) => s.profile[0] ?? '',
        onSelect: choose('scenario', (id) => {
          state.scenarioId = id;
        }),
      });
      const chosen = ctx.scenarios.find((s) => s.id === state.scenarioId);
      if (chosen) {
        step.appendChild(
          renderScenarioDetail(chosen, { className: 'scenario-detail', profileHeading: 'Profile' }),
        );
      }
      root.appendChild(step);
    }

    if (state.scenarioId) {
      const beginRow = document.createElement('div');
      beginRow.className = 'begin-row';
      const begin = document.createElement('button');
      begin.type = 'button';
      begin.className = 'btn btn--primary';
      begin.textContent = 'Begin the letter';
      begin.addEventListener('click', () => {
        if (state.characterId && state.skillId && state.scenarioId) {
          ctx.onBegin({
            characterId: state.characterId,
            skillId: state.skillId,
            scenarioId: state.scenarioId,
          });
        }
      });
      beginRow.appendChild(begin);
      root.appendChild(beginRow);
    }

    if (focusAfterRender) {
      document.getElementById(focusAfterRender)?.focus();
      focusAfterRender = null;
    }
  }

  render();
  return root;
}

/** The three selection steps are one rendering rule with a different noun.
 *
 *  Card children are phrasing content on purpose: `<button>`'s content model
 *  forbids headings, paragraphs and lists, and assistive technology builds the
 *  accessible name from the subtree — so a card with an `<h3>` plus a flavour
 *  paragraph plus pip labels announced as all of it at once. The `aria-label`
 *  below is the name; everything else is presentation. */
/** The card id, shared between the builder below and the focus restoration in
 *  `renderSetup` — selecting re-renders the whole screen, so the card that was
 *  focused has to be found again by name. */
function cardId(kind: string, itemId: string): string {
  return `${kind}-${itemId}`;
}

/** The three selection steps are one rendering rule with a different noun.
 *
 *  Card children are phrasing content on purpose: `<button>`'s content model
 *  forbids headings, paragraphs and lists. The name comes from the title span
 *  via `aria-labelledby`, with the blurb and pips as the description — an
 *  `aria-label` would replace the subtree name and hide the attribute ratings
 *  the choice is based on.
 *
 *  The group is a radiogroup rather than a row of toggle buttons, because
 *  picking a character is one choice of six, not six independent switches.
 *  That brings the keyboard contract with it: one tab stop for the group,
 *  arrows to move and select within it, Home/End for the ends. */
function renderChoiceStep<T extends { id: string }>(opts: {
  kind: string;
  title: string;
  prompt: string;
  items: readonly T[];
  selectedId: string | null;
  name: (item: T) => string;
  blurb: (item: T) => string;
  extra?: (item: T) => HTMLElement;
  onSelect: (item: T) => void;
}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'step paper';

  const h = document.createElement('h2');
  h.id = `${opts.kind}-heading`;
  h.textContent = opts.title;
  const prompt = document.createElement('p');
  prompt.className = 'step__prompt';
  prompt.textContent = opts.prompt;
  wrap.append(h, prompt);

  const grid = document.createElement('div');
  grid.className = 'card-grid';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-labelledby', h.id);

  // Roving tabindex: the group is one tab stop, landing on the current choice
  // or the first option when nothing is chosen yet.
  const selectedIndex = opts.items.findIndex((i) => i.id === opts.selectedId);
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const cards: HTMLButtonElement[] = [];
  opts.items.forEach((item, index) => {
    const selected = opts.selectedId === item.id;
    const card = document.createElement('button');
    card.type = 'button';
    card.id = cardId(opts.kind, item.id);
    card.className = `card${selected ? ' card--selected' : ''}`;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(selected));
    card.tabIndex = index === tabbableIndex ? 0 : -1;

    const base = card.id;
    const title = document.createElement('span');
    title.className = 'card__title';
    title.id = `${base}-title`;
    title.textContent = opts.name(item);
    const blurb = document.createElement('span');
    blurb.className = 'card__blurb';
    blurb.id = `${base}-blurb`;
    blurb.textContent = opts.blurb(item);
    card.append(title, blurb);

    const describedBy = [blurb.id];
    if (opts.extra) {
      const detail = opts.extra(item);
      detail.id = `${base}-detail`;
      describedBy.push(detail.id);
      card.appendChild(detail);
    }
    card.setAttribute('aria-labelledby', title.id);
    card.setAttribute('aria-describedby', describedBy.join(' '));

    card.addEventListener('click', () => opts.onSelect(item));
    cards.push(card);
    grid.appendChild(card);
  });

  grid.addEventListener('keydown', (event) => {
    const from = cards.indexOf(document.activeElement as HTMLButtonElement);
    if (from === -1) return;
    const last = cards.length - 1;
    let to: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        to = from === last ? 0 : from + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        to = from === 0 ? last : from - 1;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    // The radio pattern selects as it moves; `onSelect` re-renders, and
    // `renderSetup` restores focus to the card that was chosen.
    const target = opts.items[to];
    if (target) opts.onSelect(target);
  });

  wrap.appendChild(grid);
  return wrap;
}

function renderAttributePips(c: Character): HTMLElement {
  const attrs = document.createElement('span');
  attrs.className = 'attrs-pips';
  for (const [label, rating] of [
    ['Penmanship', c.attributes.penmanship],
    ['Language', c.attributes.language],
    ['Heart', c.attributes.heart],
  ] as const) {
    const row = document.createElement('span');
    const labelEl = document.createElement('span');
    labelEl.className = 'small-caps';
    labelEl.textContent = label;
    const pips = document.createElement('span');
    pips.className = 'pips';
    const level = diceForRating(rating);
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = i < level ? 'pip pip--filled' : 'pip';
      dot.textContent = i < level ? '●' : '○';
      pips.appendChild(dot);
    }
    row.append(labelEl, pips);
    attrs.appendChild(row);
  }
  return attrs;
}
