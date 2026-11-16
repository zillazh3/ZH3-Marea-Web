import { parseLrc } from '@/features/lyrics/lrc';
import { parseLyricsfile } from '@/features/lyrics/lyricsfile';
import type { Lyrics } from '@/features/lyrics/model';
import { LyricsError } from '@/features/lyrics/errors';
import { asArray, asBoolean, asNumber, asString, isRecord } from '@/shared/json';
import { pyRound } from '@/shared/pycompat';
import { DAY_MS, readCached, writeCached, type JsonCache, type Ttl } from './cache';
import { ProviderError } from './errors';
import { ThrottledFetcher } from './http';
import type { LyricsProvider, TrackQuery } from './types';

const BASE = 'https://lrclib.net/api';
const SERVICE = 'LRCLIB';
/** Browsers cannot set User-Agent; LRCLIB asks apps to identify themselves with this header instead. */
const CLIENT_HEADER = { 'Lrclib-Client': 'ZH3 Marea Web/0.1' };
const TTL: Ttl = { foundMs: 30 * DAY_MS, missMs: DAY_MS };
const MIN_INTERVAL_MS = 250;
const DURATION_TOLERANCE_MS = 3000;

/** One LRCLIB track, with only what we read and every field validated. */
export interface LrclibTrack {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  /** Seconds. */
  duration: number;
  instrumental: boolean;
  syncedLyrics: string;
  hasWordSync: boolean;
  lyricsfile: string;
}

export function parseTrack(value: unknown): LrclibTrack | null {
  if (!isRecord(value)) return null;
  return {
    id: asNumber(value.id),
    trackName: asString(value.trackName),
    artistName: asString(value.artistName),
    albumName: asString(value.albumName),
    duration: asNumber(value.duration),
    instrumental: asBoolean(value.instrumental),
    syncedLyrics: asString(value.syncedLyrics),
    hasWordSync: asBoolean(value.hasWordSync),
    lyricsfile: asString(value.lyricsfile),
  };
}

/** What a search result offers: syllable timing, line timing, or nothing usable. */
export function trackKind(track: LrclibTrack): 'syllable' | 'line' | 'none' {
  if (track.instrumental) return 'none';
  if (track.hasWordSync && track.lyricsfile) return 'syllable';
  return track.syncedLyrics ? 'line' : 'none';
}

/** The result closest in duration (within 3 s) that has synced lyrics; the first one when no duration is known. */
export function bestTrack(
  results: readonly LrclibTrack[],
  durationMs: number | undefined,
): LrclibTrack | null {
  let ok = results.filter((t) => t.syncedLyrics !== '' || t.hasWordSync);
  if (durationMs) {
    const distance = (t: LrclibTrack): number => Math.abs(t.duration * 1000 - durationMs);
    ok = ok
      .filter((t) => distance(t) <= DURATION_TOLERANCE_MS)
      .sort((a, b) => distance(a) - distance(b));
  }
  return ok[0] ?? null;
}

/** Word-synced lyricsfile when there is one and it reads, otherwise the LRC. */
export async function trackToLyrics(track: LrclibTrack): Promise<Lyrics | null> {
  if (track.instrumental) return null;
  if (track.hasWordSync && track.lyricsfile) {
    try {
      const lyrics = await parseLyricsfile(track.lyricsfile);
      if (lyrics.lines.length > 0) return lyrics;
    } catch (error) {
      if (!(error instanceof LyricsError)) throw error;
      // a broken or newer-version lyricsfile: the LRC is still good
    }
  }
  const lrc = parseLrc(track.syncedLyrics);
  return lrc.lines.length > 0 ? lrc : null;
}

export interface LrclibOptions {
  cache: JsonCache;
  fetcher?: ThrottledFetcher;
  now?: () => number;
}

export class LrclibProvider implements LyricsProvider {
  private readonly cache: JsonCache;
  private readonly fetcher: ThrottledFetcher;
  private readonly now: () => number;

  constructor(options: LrclibOptions) {
    this.cache = options.cache;
    this.now = options.now ?? (() => Date.now());
    this.fetcher = options.fetcher ?? new ThrottledFetcher({ minIntervalMs: MIN_INTERVAL_MS });
  }

  async fetch(query: TrackQuery): Promise<Lyrics | null> {
    if (!query.title || !query.artist) return null; // LRCLIB identifies by title and artist
    const track = await this.lookup(query);
    const lyrics = track ? await trackToLyrics(track) : null;
    return lyrics ? { ...lyrics, source: 'lrclib', credit: 'LRCLIB' } : null;
  }

  /** Free-text search for the Buscar screen: every track LRCLIB returns that has lyrics worth offering. */
  async search(text: string): Promise<LrclibTrack[]> {
    const response = await this.get('/search', { q: text });
    const results = response.ok ? await this.json(response) : [];
    return asArray(results)
      .map(parseTrack)
      .filter((t): t is LrclibTrack => t !== null);
  }

  private async get(path: string, params: Record<string, string>): Promise<Response> {
    const url = `${BASE}${path}?${new URLSearchParams(params).toString()}`;
    const response = await this.fetcher.get(url, { headers: CLIENT_HEADER, service: SERVICE });
    if (response.status >= 500 || response.status === 429) throw new ProviderError('busy', SERVICE);
    return response;
  }

  private async json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null; // a body that is not JSON is the same as no result
    }
  }

  private cacheKey(q: TrackQuery): string {
    const seconds = pyRound((q.durationMs ?? 0) / 1000);
    return `lrclib|${q.artist.toLowerCase()}|${q.title.toLowerCase()}|${(q.album ?? '').toLowerCase()}|${String(seconds)}`;
  }

  private async lookup(q: TrackQuery): Promise<LrclibTrack | null> {
    const key = this.cacheKey(q);
    const cached = await readCached(this.cache, key, TTL, this.now);
    if (cached.hit) return parseTrack(cached.data);

    const params: Record<string, string> = { track_name: q.title, artist_name: q.artist };
    if (q.album) params.album_name = q.album;
    if (q.durationMs) params.duration = String(pyRound(q.durationMs / 1000));
    const exact = await this.get('/get', params);
    let track = exact.status === 200 ? parseTrack(await this.json(exact)) : null;
    if (!track) {
      // /get needs a near-exact match; /search is more tolerant.
      const found = await this.get('/search', { track_name: q.title, artist_name: q.artist });
      const results = found.status === 200 ? asArray(await this.json(found)) : [];
      track = bestTrack(
        results.map(parseTrack).filter((t): t is LrclibTrack => t !== null),
        q.durationMs,
      );
    }
    await writeCached(this.cache, key, track, this.now);
    return track;
  }
}
