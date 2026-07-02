import { CHARACTERS, SKILLS } from '../data';
import type { Rating, Scenario } from '../types';

const RATING_LEVEL: Record<Rating, number> = { poor: 1, average: 2, good: 3 };

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

    root.appendChild(renderCharacterStep(state, () => render()));
    if (state.characterId) {
      root.appendChild(renderSkillStep(state, () => render()));
    }
    if (state.skillId) {
      root.appendChild(renderScenarioStep(ctx.scenarios, state, () => render()));
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

function renderCharacterStep(state: SetupState, onChange: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'step paper';
  const h = document.createElement('h2');
  h.textContent = 'I. The Character';
  wrap.appendChild(h);
  const prompt = document.createElement('p');
  prompt.className = 'step__prompt';
  prompt.textContent = 'Who holds the quill?';
  wrap.appendChild(prompt);
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  for (const c of CHARACTERS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `card${state.characterId === c.id ? ' card--selected' : ''}`;

    const heading = document.createElement('h3');
    heading.textContent = c.name;
    const blurb = document.createElement('p');
    blurb.textContent = c.flavor[0] ?? '';
    const attrs = document.createElement('ul');
    attrs.className = 'attrs-pips';
    for (const [label, rating] of [
      ['Penmanship', c.attributes.penmanship],
      ['Language', c.attributes.language],
      ['Heart', c.attributes.heart],
    ] as const) {
      const li = document.createElement('li');
      const labelEl = document.createElement('span');
      labelEl.className = 'small-caps';
      labelEl.textContent = label;
      const pips = document.createElement('span');
      pips.className = 'pips';
      const level = RATING_LEVEL[rating];
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = i < level ? 'pip pip--filled' : 'pip';
        dot.textContent = i < level ? '●' : '○';
        pips.appendChild(dot);
      }
      li.append(labelEl, pips);
      attrs.appendChild(li);
    }
    card.append(heading, blurb, attrs);

    card.addEventListener('click', () => {
      state.characterId = c.id;
      onChange();
    });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderSkillStep(state: SetupState, onChange: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'step paper';
  const h = document.createElement('h2');
  h.textContent = 'II. The Skill';
  wrap.appendChild(h);
  const prompt = document.createElement('p');
  prompt.className = 'step__prompt';
  prompt.textContent = 'One gift, spent once per letter.';
  wrap.appendChild(prompt);
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  for (const s of SKILLS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `card${state.skillId === s.id ? ' card--selected' : ''}`;
    const heading = document.createElement('h3');
    heading.textContent = s.name;
    const desc = document.createElement('p');
    desc.textContent = s.description;
    card.append(heading, desc);
    card.addEventListener('click', () => {
      state.skillId = s.id;
      onChange();
    });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderScenarioStep(
  scenarios: Scenario[],
  state: SetupState,
  onChange: () => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'step paper';
  const h = document.createElement('h2');
  h.textContent = 'III. The Scenario';
  wrap.appendChild(h);
  const prompt = document.createElement('p');
  prompt.className = 'step__prompt';
  prompt.textContent = 'To whom do you write, and why?';
  wrap.appendChild(prompt);

  const grouped = new Map<string, Scenario[]>();
  for (const sc of scenarios) {
    const list = grouped.get(sc.set) ?? [];
    list.push(sc);
    grouped.set(sc.set, list);
  }
  // Deterministic group order: rulebook first, then supplements alphabetically.
  const SET_ORDER = ['Quill Rulebook'];
  const orderedSets = [
    ...SET_ORDER.filter((s) => grouped.has(s)),
    ...[...grouped.keys()].filter((s) => !SET_ORDER.includes(s)).sort(),
  ];
  for (const setName of orderedSets) {
    const list = grouped.get(setName);
    if (!list) continue;
    const group = document.createElement('div');
    group.className = 'scenario-group';
    const groupHeading = document.createElement('h3');
    groupHeading.className = 'scenario-group__heading';
    groupHeading.textContent = setName;
    group.appendChild(groupHeading);
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    for (const sc of list) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `card${state.scenarioId === sc.id ? ' card--selected' : ''}`;
      const heading = document.createElement('h4');
      heading.textContent = sc.title;
      const blurb = document.createElement('p');
      blurb.textContent = sc.profile[0] ?? '';
      card.append(heading, blurb);
      card.addEventListener('click', () => {
        state.scenarioId = sc.id;
        onChange();
      });
      grid.appendChild(card);
    }
    group.appendChild(grid);
    wrap.appendChild(group);
  }

  if (state.scenarioId) {
    const sc = scenarios.find((x) => x.id === state.scenarioId);
    if (sc) {
      const detail = document.createElement('div');
      detail.className = 'scenario-detail';

      const profileHeading = document.createElement('h4');
      profileHeading.textContent = 'Profile';
      detail.appendChild(profileHeading);
      for (const p of sc.profile) {
        const para = document.createElement('p');
        para.textContent = p;
        detail.appendChild(para);
      }

      const rulesHeading = document.createElement('h4');
      rulesHeading.textContent = 'Rules of Correspondence';
      detail.appendChild(rulesHeading);
      if (sc.rulesOfCorrespondence.length === 0) {
        const none = document.createElement('p');
        none.textContent = 'None.';
        detail.appendChild(none);
      } else {
        for (const r of sc.rulesOfCorrespondence) {
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
          detail.appendChild(para);
        }
      }

      wrap.appendChild(detail);
    }
  }
  return wrap;
}
