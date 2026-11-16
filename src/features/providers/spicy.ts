import {
  newLine,
  newLyrics,
  type BgVocal,
  type Line,
  type Lyrics,
  type Syllable,
} from '@/features/lyrics/model';
import { spread } from '@/features/lyrics/timing';
import { asArray, asString, isRecord, type JsonObject } from '@/shared/json';
import { pyRound } from '@/shared/pycompat';
import { DAY_MS, readCached, writeCached, type JsonCache, type Ttl } from './cache';
import { ProviderError } from './errors';
import { ThrottledFetcher } from './http';
import type { LyricsProvider, TrackQuery } from './types';

// Spicy Lyrics (developer API): lyrics with real syllables, from Apple Music or the community, by Spotify track id.
// GET /v1/lyrics/{id} with `Authorization: Bearer sl_pk_...`. `Body.Type` is Syllable | Line | Static, `Body.source` is
// apple_music | spicy_lyrics | spotify, and times come in seconds. Every response must show its credit.

const BASE = 'https://api.spicylyrics.org/v1';
const SERVICE = 'Spicy Lyrics';
/** A found lyric is reused for a week (the API allows up to 30 days). */
const TTL: Ttl = { foundMs: 7 * DAY_MS, missMs: DAY_MS };
const MIN_INTERVAL_MS = 250;
/** Any track with lyrics: used to check that a key is accepted. */
const PROBE_ID = '7KNmIjcmGJIBrhP2s5Vioe';
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SOURCES: Record<string, string> = {
  apple_music: 'Apple Music',
  spicy_lyrics: 'Spicy Lyrics',
  spotify: 'Spotify',
};
/** Names are written by third parties (real data has "makers" of 100+ characters): capped for display. */
const NAME_MAX = 32;
const WRITERS_MAX = 12;
const DEFAULT_WAIT_S = 10;

function ms(seconds: unknown): number {
  const usable =
    typeof seconds === 'number' || (typeof seconds === 'string' && seconds.trim() !== '');
  const value = usable ? Number(seconds) : Number.NaN;
  if (!Number.isFinite(value)) throw new TypeError('not a time');
  return pyRound(value * 1000);
}

/** Syllables arrive without spaces; `IsPartOfWord` glues one to the next ("h-heartbreak", "Mum-mum-mum-mah"). */
function syllables(raw: unknown[]): Syllable[] {
  const out: Syllable[] = [];
  for (const item of raw) {
    const s = isRecord(item) ? item : {};
    const text = asString(s.Text).trim();
    const previous = out[out.length - 1];
    if (!text) {
      if (previous) previous.wordEnd = true; // a blank text separates words
      continue;
    }
    const begin = ms(s.StartTime);
    out.push({ text, begin, end: Math.max(ms(s.EndTime), begin), wordEnd: !s.IsPartOfWord });
  }
  const last = out[out.length - 1];
  if (last) last.wordEnd = false;
  return out;
}

function syllableLine(item: JsonObject): Line | null {
  const lead = isRecord(item.Lead) ? item.Lead : {};
  const lines = syllables(asArray(lead.Syllables));
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (!first || !last) return null;
  const bg: BgVocal[] = [];
  for (const g of asArray(item.Background)) {
    if (!isRecord(g)) continue;
    const bs = syllables(asArray(g.Syllables));
    const b0 = bs[0];
    const b1 = bs[bs.length - 1];
    if (!b0 || !b1) continue;
    const start = g.StartTime != null ? ms(g.StartTime) : b0.begin;
    const end = g.EndTime != null ? ms(g.EndTime) : b1.end;
    bg.push({
      start: Math.min(start, b0.begin),
      end: Math.max(end, b1.end),
      syllables: bs,
      role: 'backing',
      agent: '',
    });
  }
  const start = lead.StartTime != null ? Math.min(ms(lead.StartTime), first.begin) : first.begin;
  const end = Math.max(
    last.end,
    lead.EndTime != null ? ms(lead.EndTime) : 0,
    ...bg.map((b) => b.end),
  );
  return newLine({
    start,
    end,
    agent: item.OppositeAligned ? 'v2' : 'v1',
    syllables: lines,
    bg,
  });
}

/** Lyrics timed only per line: `Text` plus `StartTime`/`EndTime`; word times are spread by letters. */
function textLine(item: JsonObject, following: readonly unknown[]): Line | null {
  const text = asString(item.Text).split(/\s+/).filter(Boolean).join(' ');
  if (!text || item.StartTime == null) return null;
  const start = ms(item.StartTime);
  let next: number | null = null;
  for (const f of following) {
    if (isRecord(f) && f.StartTime != null) {
      next = ms(f.StartTime);
      break;
    }
  }
  const end = Math.max(
    item.EndTime != null ? ms(item.EndTime) : next !== null && next > start ? next : start + 5000,
    start + 1,
  );
  return newLine({
    start,
    end,
    agent: item.OppositeAligned ? 'v2' : 'v1',
    syllables: spread(text, start, end),
    approx: true,
  });
}

/** Printable characters only (no control or bidi marks), capped. */
function name(raw: unknown): string {
  const printable = Array.from(typeof raw === 'string' ? raw : '')
    .filter((c) => c === ' ' || /[\p{L}\p{M}\p{N}\p{P}\p{S}]/u.test(c))
    .join('')
    .trim();
  const chars = Array.from(printable);
  return chars.length <= NAME_MAX ? printable : `${chars.slice(0, NAME_MAX - 1).join('')}…`;
}

function credit(body: JsonObject): string {
  const source = asString(body.source);
  if (source === 'spicy_lyrics') {
    const attribution = isRecord(body.UploadAttribution) ? body.UploadAttribution : {};
    const who = (key: string): string => {
      const entry = attribution[key];
      return name(isRecord(entry) ? entry.username : undefined);
    };
    const uploader = who('Uploader');
    const maker = who('Maker');
    const parts = [
      uploader ? `uploaded by ${uploader}` : '',
      maker ? `made by ${maker}` : '',
    ].filter(Boolean);
    return `Spicy Lyrics${parts.length > 0 ? ` · ${parts.join(', ')}` : ''}`;
  }
  return SOURCES[source] ?? 'Spicy Lyrics';
}

function writers(body: JsonObject): string[] {
  const raw = body.SongWriters;
  return Array.isArray(raw) ? raw.slice(0, WRITERS_MAX).map(name).filter(Boolean) : [];
}

/** Response of the API as lyrics; null for no usable timing (a `Static` lyric has none, so LRCLIB may do better). */
export function spicyToLyrics(raw: unknown): Lyrics | null {
  const body = isRecord(raw) ? raw.Body : null;
  if (!isRecord(body) || (body.Type !== 'Syllable' && body.Type !== 'Line')) return null;
  const items = asArray(body.Content).filter(isRecord);
  const lines: Line[] = [];
  items.forEach((item, n) => {
    try {
      const line =
        body.Type === 'Syllable' || 'Lead' in item
          ? syllableLine(item)
          : textLine(item, items.slice(n + 1));
      if (line) lines.push(line);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      // a malformed line does not sink the whole lyric
    }
  });
  if (lines.length === 0) return null;
  lines.sort((a, b) => a.start - b.start);
  return newLyrics(lines, {
    source: asString(body.source),
    credit: credit(body),
    writers: writers(body),
  });
}

export interface SpicyOptions {
  /** Read on every request, so a key changed in Ajustes applies without reloading. */
  key: () => string;
  cache: JsonCache;
  fetcher?: ThrottledFetcher;
  now?: () => number;
}

export class SpicyLyricsProvider implements LyricsProvider {
  private readonly key: () => string;
  private readonly cache: JsonCache;
  private readonly fetcher: ThrottledFetcher;
  private readonly now: () => number;

  constructor(options: SpicyOptions) {
    this.key = options.key;
    this.cache = options.cache;
    this.now = options.now ?? (() => Date.now());
    this.fetcher = options.fetcher ?? new ThrottledFetcher({ minIntervalMs: MIN_INTERVAL_MS });
  }

  async fetch(query: TrackQuery): Promise<Lyrics | null> {
    const key = this.key().trim();
    if (!key || !SPOTIFY_ID.test(query.spotifyId ?? '')) return null; // nothing to ask without a key or a track id
    const raw = await this.lookup(query.spotifyId ?? '', key);
    return raw ? spicyToLyrics(raw) : null;
  }

  /** Asks for a known track to see whether the key is accepted. Throws `spicyKeyRejected` if it is not. */
  async checkKey(): Promise<void> {
    const key = this.key().trim();
    if (!key) throw new ProviderError('spicyKeyMissing', SERVICE);
    await this.get(PROBE_ID, key); // 200 and 404 both mean the key passed
  }

  private async get(trackId: string, key: string): Promise<Response> {
    const response = await this.fetcher.get(`${BASE}/lyrics/${trackId}`, {
      headers: { Authorization: `Bearer ${key}` },
      service: SERVICE,
      onResponse: (r) => {
        this.noteLimits(r);
      },
    });
    if (response.status === 429)
      throw new ProviderError('wait', SERVICE, this.waitSeconds(response));
    if (response.status === 401 || response.status === 403)
      throw new ProviderError('spicyKeyRejected', SERVICE);
    if (response.status >= 500) throw new ProviderError('busy', SERVICE);
    return response;
  }

  private waitSeconds(response: Response): number {
    for (const header of ['retry-after', 'ratelimit-reset']) {
      const value = Number(response.headers.get(header));
      if (response.headers.has(header) && Number.isFinite(value)) return Math.max(1, value);
    }
    return DEFAULT_WAIT_S;
  }

  /** The server says how many requests are left in the window; when none are, stop asking until it renews. */
  private noteLimits(response: Response): void {
    if (response.status === 429 || response.headers.get('ratelimit-remaining') === '0') {
      this.fetcher.blockFor(this.waitSeconds(response));
    }
  }

  private async lookup(trackId: string, key: string): Promise<unknown> {
    const cacheKey = `spicy|${trackId}`;
    const cached = await readCached(this.cache, cacheKey, TTL, this.now);
    if (cached.hit) return cached.data;
    const response = await this.get(trackId, key);
    let raw: unknown = null;
    if (response.status === 200) {
      try {
        raw = await response.json();
      } catch {
        raw = null; // not JSON: the same as no lyrics
      }
    }
    await writeCached(this.cache, cacheKey, raw, this.now);
    return raw;
  }
}
