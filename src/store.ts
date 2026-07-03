type Updater<T> = (current: T) => T;
type Listener<T> = (value: T) => void;

export class Store<T> {
  private state: T;
  private listeners = new Set<Listener<T>>();
  private readonly key: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(initial: T, key: string) {
    this.key = key;
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (raw === null) {
      this.state = initial;
      return;
    }

    try {
      this.state = JSON.parse(raw) as T;
    } catch {
      localStorage.removeItem(key);
      this.state = initial;
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
    if (typeof localStorage !== 'undefined') localStorage.removeItem(this.key);
    for (const fn of this.listeners) fn(this.state);
  }

  private persist(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.key, JSON.stringify(this.state));
    }
  }
}
