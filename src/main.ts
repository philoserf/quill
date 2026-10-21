import { characterById, skillById } from './data';
import { commitParagraph } from './paragraph';
import { SCENARIOS, scenarioById } from './scenarios';
import { renderPlay } from './screens/play';
import { renderScore } from './screens/score';
import { renderSetup } from './screens/setup';
import { discard, load, save } from './store';
import type { Character, GameSession, Scenario, Skill } from './types';

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

/** The one statement of which session ids must resolve. */
function resolve(
  session: GameSession,
): { scenario: Scenario; character: Character; skill: Skill } | null {
  const scenario = scenarioById(session.scenarioId);
  const character = characterById(session.characterId);
  const skill = skillById(session.skillId);
  return scenario && character && skill ? { scenario, character, skill } : null;
}

// A session can only be stale *as loaded*: characters, skills and scenarios are
// all compile-time constants, so the id sets are fixed for the life of the page.
// Checking once at mount keeps the recovery write out of any render.
function hydrate(): GameSession | null {
  const session = load();
  if (!session) return null;
  if (!resolve(session)) {
    // Set aside, not delete: a deploy that renamed an id must not erase the
    // letter (#100).
    discard();
    return null;
  }
  return session;
}

function mount() {
  const el = document.getElementById('app');
  if (!el) throw new Error('Missing #app');
  const rootEl: HTMLElement = el;

  let session = hydrate();
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
          scenarios: SCENARIOS,
          onBegin: (sel) => commit(newSession(sel)),
        }),
      );
      return;
    }

    // hydrate() proved all three resolve; the screens are handed the values so
    // they never look them up again or branch on a failure that cannot happen.
    const current = session;
    const refs = resolve(current);
    if (!refs) {
      throw new Error(`Session ${current.id} references data that no longer exists`);
    }
    const { scenario, character, skill } = refs;

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
  mount();
} catch (err) {
  // A failed boot gets a way out rather than a dead-end string. This covers
  // mount's first render only: later renders run from event handlers, outside
  // this try. That is safe because hydrate() has already proven the session's
  // ids, and compile-time constants cannot stop resolving mid-session.
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
      // Set the letter aside, not delete it: the crash may be a shape the
      // store's check did not anticipate, and this is the player's only copy.
      discard();
      location.reload();
    });
    root.append(msg, restart);
  }
  throw err;
}
