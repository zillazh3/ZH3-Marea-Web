export interface CacheEntry {
  /** When it was stored, ms since the epoch. */
  t: number;
  /** The response, or null for "this service has nothing for that query". */
  data: unknown;
}

/** Where provider responses are kept; IndexedDB in the app, memory in tests. */
export interface JsonCache {
  get(key: string): Promise<CacheEntry | undefined>;
  put(key: string, entry: CacheEntry): Promise<void>;
}

export interface Ttl {
  foundMs: number;
  missMs: number;
}

export const DAY_MS = 86_400_000;

export class MemoryCache implements JsonCache {
  readonly entries = new Map<string, CacheEntry>();

  get(key: string): Promise<CacheEntry | undefined> {
    return Promise.resolve(this.entries.get(key));
  }

  put(key: string, entry: CacheEntry): Promise<void> {
    this.entries.set(key, entry);
    return Promise.resolve();
  }
}

export type CacheRead = { hit: true; data: unknown } | { hit: false };

/** A cache failure (storage blocked, quota) only costs a network request, so it reads as a miss. */
export async function readCached(
  cache: JsonCache,
  key: string,
  ttl: Ttl,
  now: () => number,
): Promise<CacheRead> {
  try {
    const entry = await cache.get(key);
    if (entry && now() - entry.t < (entry.data === null ? ttl.missMs : ttl.foundMs)) {
      return { hit: true, data: entry.data };
    }
  } catch {
    // storage unavailable: fall through to a miss
  }
  return { hit: false };
}

export async function writeCached(
  cache: JsonCache,
  key: string,
  data: unknown,
  now: () => number,
): Promise<void> {
  try {
    await cache.put(key, { t: now(), data });
  } catch {
    // storage unavailable or full: the lookup still succeeded, it just will not be remembered
  }
}
