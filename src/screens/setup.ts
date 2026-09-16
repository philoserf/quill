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
        title: 'I. The Character',
        prompt: 'Who holds the quill?',
        items: CHARACTERS,
        selectedId: state.characterId,
        name: (c) => c.name,
        blurb: (c) => c.flavor[0] ?? '',
        extra: renderAttributePips,
        onSelect: (c) => {
          state.characterId = c.id;
          render();
        },
      }),
    );

    if (state.characterId) {
      root.appendChild(
        renderChoiceStep({
          title: 'II. The Skill',
          prompt: 'One gift, spent once per letter.',
          items: SKILLS,
          selectedId: state.skillId,
          name: (s) => s.name,
          blurb: (s) => s.description,
          onSelect: (s) => {
            state.skillId = s.id;
            render();
          },
        }),
      );
    }

    if (state.skillId) {
      const step = renderChoiceStep({
        title: 'III. The Scenario',
        prompt: 'To whom do you write, and why?',
        items: ctx.scenarios,
        selectedId: state.scenarioId,
        name: (s) => s.title,
        blurb: (s) => s.profile[0] ?? '',
        onSelect: (s) => {
          state.scenarioId = s.id;
          render();
        },
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
function renderChoiceStep<T extends { id: string }>(opts: {
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
  h.textContent = opts.title;
  const prompt = document.createElement('p');
  prompt.className = 'step__prompt';
  prompt.textContent = opts.prompt;
  wrap.append(h, prompt);

  const grid = document.createElement('div');
  grid.className = 'card-grid';
  for (const item of opts.items) {
    const selected = opts.selectedId === item.id;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `card${selected ? ' card--selected' : ''}`;
    card.setAttribute('aria-label', opts.name(item));
    card.setAttribute('aria-pressed', String(selected));

    const title = document.createElement('span');
    title.className = 'card__title';
    title.textContent = opts.name(item);
    const blurb = document.createElement('span');
    blurb.className = 'card__blurb';
    blurb.textContent = opts.blurb(item);
    card.append(title, blurb);
    if (opts.extra) card.appendChild(opts.extra(item));

    card.addEventListener('click', () => opts.onSelect(item));
    grid.appendChild(card);
  }
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
