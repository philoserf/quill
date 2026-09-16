import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { clear, load, save } from '../src/store';
import type { GameSession } from '../src/types';

const KEY = 'quill.session.v1';
const CORRUPT = `${KEY}.corrupt`;

// jsdom-free fake localStorage
class FakeStorage {
  private map = new Map<string, string>();

  getItem(k: string) {
    return this.map.get(k) ?? null;
  }

  setItem(k: string, v: string) {
    this.map.set(k, v);
  }

  removeItem(k: string) {
    this.map.delete(k);
  }

  clear() {
    this.map.clear();
  }
}

function install(store: unknown) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  });
}

function session(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 'g1',
    startedAt: '2026-01-01T00:00:00.000Z',
    characterId: 'monk',
    skillId: 'illumination',
    scenarioId: 'archduke',
    skillSpent: false,
    paragraphs: [],
    status: 'in_progress',
    ...overrides,
  };
}

beforeEach(() => install(new FakeStorage()));
afterEach(() => install(undefined));

describe('load / save / clear', () => {
  test('round-trips a session', () => {
    expect(save(session({ id: 'abc' }))).toBe(true);
    expect(load()?.id).toBe('abc');
  });

  test('load returns null when nothing is stored', () => {
    expect(load()).toBeNull();
  });

  test('clear removes the key', () => {
    save(session());
    clear();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(load()).toBeNull();
  });
});

describe('hydration', () => {
  test('unwraps the legacy { session } payload', () => {
    // v1 wrapped the session one level deep. Existing saved letters must survive.
    localStorage.setItem(KEY, JSON.stringify({ session: session({ id: 'legacy' }) }));
    expect(load()?.id).toBe('legacy');
    expect(localStorage.getItem(CORRUPT)).toBeNull();
  });

  test('a legacy payload holding an explicit null is an absent session, not corruption', () => {
    localStorage.setItem(KEY, JSON.stringify({ session: null }));
    expect(load()).toBeNull();
    expect(localStorage.getItem(CORRUPT)).toBeNull();
  });

  test('quarantines a payload that parses but is not a session', () => {
    // The shape this predicate exists for: valid ids, no paragraphs array.
    // It parses, so the old `'session' in v` check passed it straight through
    // to a render that dereferenced paragraphs.length and threw.
    const raw = JSON.stringify({ session: { id: 'x' } });
    localStorage.setItem(KEY, raw);
    expect(load()).toBeNull();
    expect(localStorage.getItem(CORRUPT)).toBe(raw);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('quarantines unparseable JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(load()).toBeNull();
    expect(localStorage.getItem(CORRUPT)).toBe('{not json');
  });

  test('a second quarantine does not destroy the first backup', () => {
    localStorage.setItem(KEY, 'first');
    load();
    localStorage.setItem(KEY, 'second');
    load();
    expect(localStorage.getItem(CORRUPT)).toBe('first');
  });

  test('rejects a session whose status is not one of the two literals', () => {
    localStorage.setItem(KEY, JSON.stringify({ ...session(), status: 'halfway' }));
    expect(load()).toBeNull();
  });
});

describe('hostile storage', () => {
  test('survives localStorage that throws on access (SecurityError)', () => {
    // Throws on the property *read*, so nothing downstream is ever reached.
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('SecurityError: access denied');
      },
      configurable: true,
    });
    expect(load()).toBeNull();
    expect(save(session())).toBe(false);
    expect(clear()).toBe(false);
  });

  test('save reports failure rather than throwing when the write is refused', () => {
    // The case the old suite claimed to cover but never reached: reads work,
    // writes throw. This is what a full quota looks like.
    const quota = new FakeStorage() as unknown as Storage;
    quota.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    install(quota);
    expect(() => save(session())).not.toThrow();
    expect(save(session())).toBe(false);
  });

  test('clear reports failure rather than throwing when removal is refused', () => {
    const hostile = new FakeStorage() as unknown as Storage;
    hostile.removeItem = () => {
      throw new Error('SecurityError');
    };
    install(hostile);
    expect(() => clear()).not.toThrow();
    expect(clear()).toBe(false);
  });

  test('a quarantine that cannot be written leaves the original in place', () => {
    const readOnly = new FakeStorage() as unknown as Storage;
    readOnly.setItem('quill.session.v1', '{not json');
    readOnly.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    install(readOnly);
    expect(load()).toBeNull();
    expect(readOnly.getItem(KEY)).toBe('{not json');
  });
});
