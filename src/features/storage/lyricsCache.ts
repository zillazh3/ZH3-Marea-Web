import type { CacheEntry, JsonCache } from '@/features/providers/cache';
import { appDb } from './db';

/** Provider responses kept in IndexedDB, so a song looked up yesterday costs no request today. */
export const idbLyricsCache: JsonCache = {
  async get(key: string): Promise<CacheEntry | undefined> {
    return (await appDb()).get('lyricsCache', key);
  },
  async put(key: string, entry: CacheEntry): Promise<void> {
    await (await appDb()).put('lyricsCache', entry, key);
  },
};
