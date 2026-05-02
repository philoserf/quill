import { loadScenarios } from './scenarios';
import { renderPlay } from './screens/play';
import { renderScore } from './screens/score';
import { renderSetup } from './screens/setup';
import { Store } from './store';
import type { GameSession, Scenario } from './types';

const SESSION_KEY = 'quill.session.v1';

interface AppState {
  session: GameSession | null;
}

const store = new Store<AppState>({ session: null }, SESSION_KEY);

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

function mount(scenarios: Scenario[]) {
  const rootEl = document.getElementById('app') as HTMLElement;
  if (!rootEl) throw new Error('Missing #app');

  function render() {
    const state = store.get();
    rootEl.replaceChildren();
    const session = state.session;

    if (!session) {
      rootEl.appendChild(
        renderSetup({
          scenarios,
          onBegin: (sel) => store.set(() => ({ session: newSession(sel) })),
        }),
      );
      return;
    }

    const scenario = scenarios.find((s) => s.id === session.scenarioId);
    if (!scenario) {
      // Stale session referencing missing scenario → reset.
      store.clear({ session: null });
      return;
    }

    if (session.status === 'in_progress') {
      rootEl.appendChild(
        renderPlay({
          session,
          scenario,
          onUpdate: (updater) =>
            store.set((s) => ({ session: s.session ? updater(s.session) : null })),
        }),
      );
    } else {
      rootEl.appendChild(
        renderScore({
          session,
          scenario,
          onRestart: () => store.clear({ session: null }),
        }),
      );
    }
  }

  store.subscribe(render);
  render();
}

try {
  mount(loadScenarios());
} catch (err) {
  const root = document.getElementById('app');
  if (root) root.textContent = `Failed to load Quill: ${(err as Error).message}`;
  throw err;
}
