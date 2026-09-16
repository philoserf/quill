import type { GameSession } from './types';

const KEY = 'quill.session.v1';
const CORRUPT_KEY = `${KEY}.corrupt`;

// Even reading `localStorage` throws SecurityError when the browser blocks
// site data (e.g. Chrome with cookies disabled), so every access goes
// through this guard. Single property read: globalThis.localStorage is
// undefined (not a ReferenceError) where storage doesn't exist, and a
// potentially side-effectful getter is only invoked once.
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// What the render path actually dereferences. Weaker than this and a payload
// that parses can still crash every render; the quarantine below is the point
// of checking, since it preserves the payload instead of destroying it.
function isSession(v: unknown): v is GameSession {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.startedAt === 'string' &&
    typeof s.characterId === 'string' &&
    typeof s.skillId === 'string' &&
    typeof s.scenarioId === 'string' &&
    typeof s.skillSpent === 'boolean' &&
    Array.isArray(s.paragraphs) &&
    (s.status === 'in_progress' || s.status === 'finished')
  );
}

// v1 wrapped the session in `{ session }`. `clear()` has always used
// removeItem, so `{ session: null }` was never written — the only shapes that
// can be on disk are absent or `{ session: GameSession }`.
function unwrap(parsed: unknown): unknown {
  if (typeof parsed === 'object' && parsed !== null && 'session' in parsed) {
    return (parsed as { session: unknown }).session;
  }
  return parsed;
}

function quarantine(store: Storage, raw: string): void {
  try {
    // Never overwrite an existing backup: the first quarantined letter is the
    // one the player is most likely to still want.
    if (store.getItem(CORRUPT_KEY) === null) store.setItem(CORRUPT_KEY, raw);
    store.removeItem(KEY);
  } catch {
    // quota or security failure — keep the original rather than lose it
  }
}

export function load(): GameSession | null {
  const store = storage();
  const raw = store?.getItem(KEY) ?? null;
  if (!store || raw === null) return null;

  try {
    const value = unwrap(JSON.parse(raw) as unknown);
    if (value === null) return null;
    if (!isSession(value)) throw new Error('persisted session has the wrong shape');
    return value;
  } catch {
    quarantine(store, raw);
    return null;
  }
}

/** Returns false when the write was refused — a full quota, or a browser that
 *  allows reads but not writes. The caller decides whether that is worth
 *  telling the player; silently dropping it is what made this invisible. */
export function save(session: GameSession | null): boolean {
  const store = storage();
  if (!store) return false;
  try {
    if (session === null) store.removeItem(KEY);
    else store.setItem(KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clear(): boolean {
  return save(null);
}
