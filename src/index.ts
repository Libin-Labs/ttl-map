export interface TtlOptions {
  maxEntries: number;
  clock: () => number;
  refreshOnGet?: boolean;
}
interface Entry<K, V> {
  key: K;
  value: V;
  deadline: number;
  ttl: number;
  index: number;
}
/** Indexed expiry heap: no stale tombstones or background timers. */
export class TtlMap<K, V> {
  private readonly data = new Map<K, Entry<K, V>>();
  private readonly heap: Entry<K, V>[] = [];
  private last = -Infinity;
  private readingClock = false;
  private readonly maximum: number;
  private readonly clock: () => number;
  private readonly refresh: boolean;
  constructor(options: TtlOptions) {
    if (typeof options.clock !== 'function') throw new TypeError('Expected clock callback');
    if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries < 1)
      throw new RangeError('maxEntries must be positive');
    this.maximum = options.maxEntries;
    this.clock = options.clock;
    this.refresh = options.refreshOnGet ?? false;
  }
  private now(): number {
    if (this.readingClock) throw new Error('Reentrant clock access');
    let now: number;
    this.readingClock = true;
    try {
      const sample: unknown = this.clock();
      if (
        sample !== null &&
        (typeof sample === 'object' || typeof sample === 'function') &&
        typeof (sample as { then?: unknown }).then === 'function'
      ) {
        void Promise.resolve(sample).catch(() => {});
        throw new TypeError('Clock must be synchronous');
      }
      if (typeof sample !== 'number') throw new TypeError('Clock must return a number');
      now = sample;
    } finally {
      this.readingClock = false;
    }
    if (!Number.isFinite(now) || now < this.last)
      throw new RangeError('Clock must be finite and monotonic');
    this.last = now;
    return now;
  }
  private swap(a: number, b: number): void {
    const x = this.heap[a]!,
      y = this.heap[b]!;
    this.heap[a] = y;
    this.heap[b] = x;
    y.index = a;
    x.index = b;
  }
  private fix(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent]!.deadline <= this.heap[index]!.deadline) break;
      this.swap(parent, index);
      index = parent;
    }
    while (index * 2 + 1 < this.heap.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.heap.length &&
        this.heap[child + 1]!.deadline < this.heap[child]!.deadline
      )
        child++;
      if (this.heap[index]!.deadline <= this.heap[child]!.deadline) break;
      this.swap(index, child);
      index = child;
    }
  }
  private remove(entry: Entry<K, V>): void {
    const index = entry.index,
      tail = this.heap.pop()!;
    this.data.delete(entry.key);
    if (index < this.heap.length) {
      this.heap[index] = tail;
      tail.index = index;
      this.fix(index);
    }
  }
  private expire(now: number): number {
    let removed = 0;
    while (this.heap.length && this.heap[0]!.deadline <= now) {
      this.remove(this.heap[0]!);
      removed++;
    }
    return removed;
  }
  private deadline(now: number, ttl: number): number {
    const end = now + ttl;
    if (!Number.isFinite(ttl) || ttl <= 0 || !Number.isFinite(end) || end <= now)
      throw new RangeError('TTL must produce a finite future deadline');
    return end;
  }
  get size(): number {
    this.expire(this.now());
    return this.data.size;
  }
  purge(): number {
    return this.expire(this.now());
  }
  set(key: K, value: V, ttl: number): void {
    if (!Number.isFinite(ttl) || ttl <= 0) throw new RangeError('TTL must be positive and finite');
    const now = this.now(),
      deadline = this.deadline(now, ttl);
    this.expire(now);
    const previous = this.data.get(key);
    if (previous) {
      previous.value = value;
      previous.ttl = ttl;
      previous.deadline = deadline;
      this.fix(previous.index);
      return;
    }
    if (this.data.size === this.maximum) throw new RangeError('maxEntries exceeded');
    const entry = { key, value, ttl, deadline, index: this.heap.length };
    this.data.set(key, entry);
    this.heap.push(entry);
    this.fix(entry.index);
  }
  get(key: K): V | undefined {
    const now = this.now();
    this.expire(now);
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (this.refresh) {
      const deadline = this.deadline(now, entry.ttl);
      entry.deadline = deadline;
      this.fix(entry.index);
    }
    return entry.value;
  }
  has(key: K): boolean {
    this.expire(this.now());
    return this.data.has(key);
  }
  delete(key: K): boolean {
    this.expire(this.now());
    const entry = this.data.get(key);
    if (!entry) return false;
    this.remove(entry);
    return true;
  }
  clear(): void {
    this.now();
    this.data.clear();
    this.heap.length = 0;
  }
  entries(): [K, V][] {
    this.expire(this.now());
    return [...this.data.values()].map((e) => [e.key, e.value]);
  }
}
