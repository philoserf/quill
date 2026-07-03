type Updater<T> = (current: T) => T;
type Listener<T> = (value: T) => void;

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

export class Store<T> {
  private state: T;
  private listeners = new Set<Listener<T>>();
  private readonly key: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(initial: T, key: string, isValid?: (value: unknown) => value is T) {
    this.key = key;
    this.state = initial;
    const store = storage();
    const raw = store?.getItem(key) ?? null;
    if (!store || raw === null) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      const ok = isValid ? isValid(parsed) : parsed !== null && typeof parsed === 'object';
      if (!ok) throw new Error('persisted value has the wrong shape');
      this.state = parsed as T;
    } catch {
      // Move the payload to a backup key rather than destroying the user's
      // only copy; the next persist() overwrites the live key anyway. If the
      // backup write fails, leave the original in place.
      try {
        store.setItem(`${key}.corrupt`, raw);
        store.removeItem(key);
      } catch {
        // quota or security failure — keep the original rather than lose it
      }
    }
  }

  get(): T {
    return this.state;
  }

  set(updater: Updater<T>, opts: { debouncePersist?: boolean } = {}): void {
    this.state = updater(this.state);
    for (const fn of this.listeners) fn(this.state);
    if (opts.debouncePersist) {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.persist(), 200);
    } else {
      this.persist();
    }
  }

  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  clear(reset: T): void {
    this.state = reset;
    storage()?.removeItem(this.key);
    for (const fn of this.listeners) fn(this.state);
  }

  private persist(): void {
    storage()?.setItem(this.key, JSON.stringify(this.state));
  }
}
