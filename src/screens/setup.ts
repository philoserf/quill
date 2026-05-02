import { CHARACTERS, SKILLS } from '../data';
import type { Scenario } from '../types';

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
    const title = document.createElement('h1');
    title.textContent = 'Quill';
    title.className = 'display-heading';
    root.appendChild(title);
    root.appendChild(renderCharacterStep(state, () => render()));
    if (state.characterId) {
      root.appendChild(renderSkillStep(state, () => render()));
    }
    if (state.skillId) {
      root.appendChild(renderScenarioStep(ctx.scenarios, state, () => render()));
    }
    if (state.scenarioId) {
      const begin = document.createElement('button');
      begin.className = 'btn btn--primary';
      begin.textContent = 'Begin letter';
      begin.addEventListener('click', () => {
        if (state.characterId && state.skillId && state.scenarioId) {
          ctx.onBegin({
            characterId: state.characterId,
            skillId: state.skillId,
            scenarioId: state.scenarioId,
          });
        }
      });
      root.appendChild(begin);
    }
  }

  render();
  return root;
}

function renderCharacterStep(state: SetupState, onChange: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'step';
  const h = document.createElement('h2');
  h.textContent = '1. Choose your Character';
  wrap.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  for (const c of CHARACTERS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `card${state.characterId === c.id ? ' card--selected' : ''}`;
    card.innerHTML = `
      <h3>${c.name}</h3>
      <p>${c.flavor[0] ?? ''}</p>
      <ul class="attrs">
        <li>Penmanship: <strong>${c.attributes.penmanship}</strong></li>
        <li>Language: <strong>${c.attributes.language}</strong></li>
        <li>Heart: <strong>${c.attributes.heart}</strong></li>
      </ul>`;
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
  wrap.className = 'step';
  const h = document.createElement('h2');
  h.textContent = '2. Choose your Skill';
  wrap.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  for (const s of SKILLS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `card${state.skillId === s.id ? ' card--selected' : ''}`;
    card.innerHTML = `<h3>${s.name}</h3><p>${s.description}</p>`;
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
  wrap.className = 'step';
  const h = document.createElement('h2');
  h.textContent = '3. Choose your Scenario';
  wrap.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  for (const sc of scenarios) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `card${state.scenarioId === sc.id ? ' card--selected' : ''}`;
    card.innerHTML = `<h3>${sc.title}</h3><p>${sc.profile[0] ?? ''}</p>`;
    card.addEventListener('click', () => {
      state.scenarioId = sc.id;
      onChange();
    });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);

  if (state.scenarioId) {
    const sc = scenarios.find((x) => x.id === state.scenarioId);
    if (sc) {
      const detail = document.createElement('div');
      detail.className = 'scenario-detail';
      detail.innerHTML = `
        <h4>Profile</h4>
        ${sc.profile.map((p) => `<p>${p}</p>`).join('')}
        <h4>Rules of Correspondence</h4>
        ${sc.rulesOfCorrespondence.map((r) => `<p>${r.description}</p>`).join('') || '<p>None.</p>'}
      `;
      wrap.appendChild(detail);
    }
  }
  return wrap;
}
