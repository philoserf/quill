import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Store } from '../src/store';

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

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    new FakeStorage() as unknown as Storage;
});

afterEach(() => {
  (globalThis as { localStorage?: Storage | undefined }).localStorage = undefined;
});

describe('Store', () => {
  test('get returns the initial state', () => {
    const s = new Store({ count: 0 }, 'key');
    expect(s.get()).toEqual({ count: 0 });
  });

  test('set updates state and notifies subscribers', () => {
    const s = new Store({ count: 0 }, 'key');
    let observed = -1;
    s.subscribe((v) => {
      observed = v.count;
    });
    s.set((cur) => ({ ...cur, count: 7 }));
    expect(observed).toBe(7);
  });

  test('persists to localStorage', () => {
    const s = new Store({ count: 0 }, 'persist-key');
    s.set((cur) => ({ ...cur, count: 9 }));
    const raw = localStorage.getItem('persist-key');
    expect(raw).toBe(JSON.stringify({ count: 9 }));
  });

  test('hydrates from localStorage on construction', () => {
    localStorage.setItem('h-key', JSON.stringify({ count: 42 }));
    const s = new Store({ count: 0 }, 'h-key');
    expect(s.get()).toEqual({ count: 42 });
  });

  test('falls back to initial state and moves corrupt payload to a backup key', () => {
    localStorage.setItem('bad-key', '{not json');
    const s = new Store({ count: 0 }, 'bad-key');
    expect(s.get()).toEqual({ count: 0 });
    expect(localStorage.getItem('bad-key')).toBeNull();
    expect(localStorage.getItem('bad-key.corrupt')).toBe('{not json');
  });

  test('treats valid-JSON wrong-shape values (e.g. "null") as corrupt', () => {
    localStorage.setItem('null-key', 'null');
    const s = new Store({ count: 0 }, 'null-key');
    expect(s.get()).toEqual({ count: 0 });
    expect(localStorage.getItem('null-key')).toBeNull();
    expect(localStorage.getItem('null-key.corrupt')).toBe('null');
  });

  test('rejects values failing a caller-provided validator', () => {
    localStorage.setItem('v-key', JSON.stringify({ wrong: true }));
    const s = new Store({ count: 0 }, 'v-key', (v): v is { count: number } => {
      return typeof v === 'object' && v !== null && 'count' in v;
    });
    expect(s.get()).toEqual({ count: 0 });
    expect(localStorage.getItem('v-key.corrupt')).toBe(JSON.stringify({ wrong: true }));
  });

  test('accepts values passing a caller-provided validator', () => {
    localStorage.setItem('v-ok-key', JSON.stringify({ count: 5 }));
    const s = new Store({ count: 0 }, 'v-ok-key', (v): v is { count: number } => {
      return typeof v === 'object' && v !== null && 'count' in v;
    });
    expect(s.get()).toEqual({ count: 5 });
  });

  test('survives a localStorage that throws on access (SecurityError)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('SecurityError: access denied');
      },
      configurable: true,
    });
    try {
      const s = new Store({ count: 0 }, 'sec-key');
      expect(s.get()).toEqual({ count: 0 });
      s.set((c) => ({ ...c, count: 1 }));
      expect(s.get()).toEqual({ count: 1 });
      s.clear({ count: 0 });
      expect(s.get()).toEqual({ count: 0 });
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: new FakeStorage() as unknown as Storage,
        configurable: true,
        writable: true,
      });
    }
  });

  test('clear removes from localStorage and resets in-memory to provided value', () => {
    const s = new Store({ count: 1 }, 'c-key');
    s.set((cur) => ({ ...cur, count: 99 }));
    s.clear({ count: 0 });
    expect(s.get()).toEqual({ count: 0 });
    expect(localStorage.getItem('c-key')).toBeNull();
  });

  test('subscribe returns an unsubscribe function', () => {
    const s = new Store({ count: 0 }, 'u-key');
    let calls = 0;
    const unsub = s.subscribe(() => {
      calls++;
    });
    s.set((c) => ({ ...c, count: 1 }));
    unsub();
    s.set((c) => ({ ...c, count: 2 }));
    expect(calls).toBe(1);
  });
});
