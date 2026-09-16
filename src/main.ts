import { characterById, skillById } from './data';
import { commitParagraph } from './paragraph';
import { SCENARIOS } from './scenarios';
import { renderPlay } from './screens/play';
import { renderScore } from './screens/score';
import { renderSetup } from './screens/setup';
import { clear, load, save } from './store';
import type { GameSession, Scenario } from './types';

function newSession(sel: {
  characterId: string;
  skillId: string;
  scenarioId: string;
}): GameSession {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    characterId: sel.characterId,
    skillId: sel.skillId,
    scenarioId: sel.scenarioId,
    skillSpent: false,
    paragraphs: [],
    status: 'in_progress',
  };
}

// A session can only be stale *as loaded*: characters, skills and scenarios are
// all compile-time constants, so the id sets are fixed for the life of the page.
// Checking once at mount keeps the recovery write out of any render.
function hydrate(scenarios: Scenario[]): GameSession | null {
  const session = load();
  if (!session) return null;
  const known =
    scenarios.some((s) => s.id === session.scenarioId) &&
    characterById(session.characterId) !== undefined &&
    skillById(session.skillId) !== undefined;
  if (!known) {
    clear();
    return null;
  }
  return session;
}

function mount(scenarios: Scenario[]) {
  const el = document.getElementById('app');
  if (!el) throw new Error('Missing #app');
  const rootEl: HTMLElement = el;

  let session = hydrate(scenarios);
  let warnedAboutSaving = false;

  // Persisting and repainting are separate channels. A phase transition inside
  // the play screen repaints without writing; only a committed paragraph, a new
  // letter, or a restart is durable.
  function commit(next: GameSession | null) {
    session = next;
    if (!save(next) && !warnedAboutSaving) {
      warnedAboutSaving = true;
      console.warn('Quill: this letter is not being saved — localStorage refused the write.');
    }
    render();
  }

  function render() {
    rootEl.replaceChildren();

    if (!session) {
      rootEl.appendChild(
        renderSetup({
          scenarios,
          onBegin: (sel) => commit(newSession(sel)),
        }),
      );
      return;
    }

    // hydrate() proved all three resolve; the screens are handed the values so
    // they never look them up again or branch on a failure that cannot happen.
    const current = session;
    const scenario = scenarios.find((s) => s.id === current.scenarioId);
    const character = characterById(current.characterId);
    const skill = skillById(current.skillId);
    if (!scenario || !character || !skill) {
      throw new Error(`Session ${current.id} references data that no longer exists`);
    }

    if (current.status === 'in_progress') {
      rootEl.appendChild(
        renderPlay({
          session: current,
          scenario,
          character,
          skill,
          onCommit: (paragraph) => commit(commitParagraph(current, paragraph)),
        }),
      );
    } else {
      rootEl.appendChild(
        renderScore({
          session: current,
          scenario,
          character,
          skill,
          onRestart: () => commit(null),
        }),
      );
    }
  }

  render();
}

try {
  mount(SCENARIOS);
} catch (err) {
  // Any unrecoverable state gets a way out rather than a dead-end string.
  const root = document.getElementById('app');
  if (root) {
    root.replaceChildren();
    const msg = document.createElement('p');
    msg.textContent = `Quill could not open this letter: ${(err as Error).message}`;
    const restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'btn btn--primary';
    restart.textContent = 'Start a new letter';
    restart.addEventListener('click', () => {
      clear();
      location.reload();
    });
    root.append(msg, restart);
  }
  throw err;
}
