import { describe, expect, it } from 'vitest';
import { newLine, newLyrics, type Lyrics } from '@/features/lyrics/model';
import { MemoryCache } from './cache';
import { ChainProvider } from './chain';
import { ProviderError } from './errors';
import { ThrottledFetcher } from './http';
import { LrclibProvider } from './lrclib';
import { SpicyLyricsProvider } from './spicy';
import type { LyricsProvider, TrackQuery } from './types';

interface Call {
  url: string;
  headers: Record<string, string>;
}

/** A fetch that answers from a script and records what it was asked. */
function scripted(answer: (url: string) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, headers: { ...(init?.headers as Record<string, string> | undefined) } });
      return Promise.resolve(answer(url));
    },
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function fetcher(script: ReturnType<typeof scripted>): {
  fetcher: ThrottledFetcher;
  sleeps: number[];
} {
  const sleeps: number[] = [];
  let clock = 0;
  return {
    sleeps,
    fetcher: new ThrottledFetcher({
      minIntervalMs: 250,
      fetch: script.fetch,
      now: () => clock,
      sleep: (ms) => {
        sleeps.push(ms);
        clock += ms;
        return Promise.resolve();
      },
    }),
  };
}

const QUERY: TrackQuery = { title: 'Marea alta', artist: 'Nadia Coral', durationMs: 200_000 };
const LRC_TRACK = { id: 1, duration: 200, syncedLyrics: '[00:01.00]hola mundo\n[00:04.00]fin\n' };

describe('ThrottledFetcher', () => {
  it('waits out the minimum interval between requests', async () => {
    const script = scripted(() => json({}));
    const { fetcher: f, sleeps } = fetcher(script);
    await f.get('https://x/1', { service: 'X' });
    await f.get('https://x/2', { service: 'X' });
    expect(sleeps[1]).toBe(250);
  });

  it('turns a network failure into a ProviderError and keeps serving later requests', async () => {
    let fail = true;
    const f = new ThrottledFetcher({
      minIntervalMs: 0,
      fetch: () => (fail ? Promise.reject(new TypeError('offline')) : Promise.resolve(json({}))),
      sleep: () => Promise.resolve(),
    });
    await expect(f.get('https://x', { service: 'X' })).rejects.toMatchObject({
      code: 'noResponse',
    });
    fail = false;
    await expect(f.get('https://x', { service: 'X' })).resolves.toBeInstanceOf(Response);
  });

  it('refuses requests while a block is active', async () => {
    const f = new ThrottledFetcher({
      minIntervalMs: 0,
      fetch: () => Promise.resolve(json({})),
      sleep: () => Promise.resolve(),
    });
    f.blockFor(30);
    await expect(f.get('https://x', { service: 'X' })).rejects.toMatchObject({
      code: 'wait',
      seconds: 30,
    });
  });
});

describe('LrclibProvider', () => {
  it('identifies the app, parses the lyrics and credits LRCLIB', async () => {
    const script = scripted(() => json(LRC_TRACK));
    const provider = new LrclibProvider({
      cache: new MemoryCache(),
      fetcher: fetcher(script).fetcher,
    });
    const lyrics = await provider.fetch(QUERY);
    expect(lyrics?.lines).toHaveLength(2);
    expect([lyrics?.source, lyrics?.credit]).toEqual(['lrclib', 'LRCLIB']);
    expect(script.calls[0]?.headers['Lrclib-Client']).toContain('ZH3 Marea');
    expect(script.calls[0]?.url).toContain('duration=200');
  });

  it('answers from the cache without touching the network, found or missed', async () => {
    const cache = new MemoryCache();
    const script = scripted((url) => (url.includes('/get') ? json(LRC_TRACK) : json([])));
    const provider = new LrclibProvider({ cache, fetcher: fetcher(script).fetcher });
    await provider.fetch(QUERY);
    await provider.fetch(QUERY);
    expect(script.calls).toHaveLength(1);

    const missing = scripted(() => json([], 404));
    const miss = new LrclibProvider({
      cache: new MemoryCache(),
      fetcher: fetcher(missing).fetcher,
    });
    expect(await miss.fetch(QUERY)).toBeNull();
    const callsAfterMiss = missing.calls.length;
    expect(await miss.fetch(QUERY)).toBeNull();
    expect(missing.calls).toHaveLength(callsAfterMiss);
  });

  it('expires a cached miss after a day but keeps a found lyric for a month', async () => {
    const cache = new MemoryCache();
    let now = 0;
    const script = scripted((url) => (url.includes('/get') ? json(LRC_TRACK) : json([])));
    const provider = new LrclibProvider({
      cache,
      fetcher: fetcher(script).fetcher,
      now: () => now,
    });
    await provider.fetch(QUERY);
    now = 29 * 86_400_000;
    await provider.fetch(QUERY);
    expect(script.calls).toHaveLength(1);
    now = 31 * 86_400_000;
    await provider.fetch(QUERY);
    expect(script.calls).toHaveLength(2);
  });

  it('falls back to /search when /get finds nothing, and picks the closest duration', async () => {
    const script = scripted((url) =>
      url.includes('/get')
        ? json({}, 404)
        : json([
            { ...LRC_TRACK, id: 2, duration: 230 },
            { ...LRC_TRACK, id: 3, duration: 201 },
          ]),
    );
    const provider = new LrclibProvider({
      cache: new MemoryCache(),
      fetcher: fetcher(script).fetcher,
    });
    expect(await provider.fetch(QUERY)).not.toBeNull();
    expect(script.calls.map((c) => c.url.split('?')[0])).toEqual([
      'https://lrclib.net/api/get',
      'https://lrclib.net/api/search',
    ]);
  });

  it('asks for nothing without a title and an artist', async () => {
    const script = scripted(() => json({}));
    const provider = new LrclibProvider({
      cache: new MemoryCache(),
      fetcher: fetcher(script).fetcher,
    });
    expect(await provider.fetch({ title: '', artist: 'x' })).toBeNull();
    expect(script.calls).toHaveLength(0);
  });

  it('reports a saturated service with the busy code', async () => {
    for (const status of [429, 503]) {
      const script = scripted(() => json({}, status));
      const provider = new LrclibProvider({
        cache: new MemoryCache(),
        fetcher: fetcher(script).fetcher,
      });
      await expect(provider.fetch(QUERY)).rejects.toMatchObject({
        code: 'busy',
        service: 'LRCLIB',
      });
    }
  });

  it('searches by free text and drops malformed entries', async () => {
    const script = scripted(() => json([LRC_TRACK, 'junk', null, { id: 9, instrumental: true }]));
    const provider = new LrclibProvider({
      cache: new MemoryCache(),
      fetcher: fetcher(script).fetcher,
    });
    const results = await provider.search('marea alta');
    expect(results.map((r) => r.id)).toEqual([1, 9]);
    expect(script.calls[0]?.url).toContain('q=marea+alta');
  });
});

const SPOTIFY_ID = '7KNmIjcmGJIBrhP2s5Vioe';
const SPICY_BODY = {
  Body: {
    Type: 'Syllable',
    source: 'apple_music',
    Content: [{ Lead: { Syllables: [{ Text: 'hi', StartTime: 1, EndTime: 2 }] } }],
  },
};

describe('SpicyLyricsProvider', () => {
  const query: TrackQuery = { ...QUERY, spotifyId: SPOTIFY_ID };

  it('does nothing without a key or without a Spotify track id', async () => {
    const script = scripted(() => json(SPICY_BODY));
    const noKey = new SpicyLyricsProvider({
      key: () => '  ',
      cache: new MemoryCache(),
      fetcher: fetcher(script).fetcher,
    });
    const noId = new SpicyLyricsProvider({
      key: () => 'sl_pk_x',
      cache: new MemoryCache(),
      fetcher: fetcher(script).fetcher,
    });
    expect(await noKey.fetch(query)).toBeNull();
    expect(await noId.fetch(QUERY)).toBeNull();
    expect(await noId.fetch({ ...QUERY, spotifyId: 'short' })).toBeNull();
    expect(script.calls).toHaveLength(0);
  });

  it('sends the key as a bearer token and applies a changed key without rebuilding', async () => {
    const script = scripted(() => json(SPICY_BODY));
    let key = 'sl_pk_one';
    const provider = new SpicyLyricsProvider({
      key: () => key,
      cache: new MemoryCache(),
      fetcher: fetcher(script).fetcher,
    });
    const lyrics = await provider.fetch(query);
    expect(lyrics?.credit).toBe('Apple Music');
    expect(script.calls[0]?.headers.Authorization).toBe('Bearer sl_pk_one');
    key = 'sl_pk_two';
    await provider.fetch({ ...query, spotifyId: 'AAAAAAAAAAAAAAAAAAAAAA' });
    expect(script.calls[1]?.headers.Authorization).toBe('Bearer sl_pk_two');
  });

  it('explains a rejected key and reports a wait, blocking further requests', async () => {
    const rejected = scripted(() => json({}, 401));
    const p1 = new SpicyLyricsProvider({
      key: () => 'k',
      cache: new MemoryCache(),
      fetcher: fetcher(rejected).fetcher,
    });
    await expect(p1.fetch(query)).rejects.toMatchObject({ code: 'spicyKeyRejected' });

    const limited = scripted(() => json({}, 429, { 'retry-after': '20' }));
    const p2 = new SpicyLyricsProvider({
      key: () => 'k',
      cache: new MemoryCache(),
      fetcher: fetcher(limited).fetcher,
    });
    await expect(p2.fetch(query)).rejects.toMatchObject({ code: 'wait', seconds: 20 });
    await expect(p2.fetch(query)).rejects.toMatchObject({ code: 'wait' });
    expect(limited.calls).toHaveLength(1);
  });

  it('checks a key against a probe track and treats 404 as accepted', async () => {
    const ok = scripted(() => json({}, 404));
    const provider = new SpicyLyricsProvider({
      key: () => 'k',
      cache: new MemoryCache(),
      fetcher: fetcher(ok).fetcher,
    });
    await expect(provider.checkKey()).resolves.toBeUndefined();
    const none = new SpicyLyricsProvider({
      key: () => '',
      cache: new MemoryCache(),
      fetcher: fetcher(ok).fetcher,
    });
    await expect(none.checkKey()).rejects.toMatchObject({ code: 'spicyKeyMissing' });
  });
});

describe('ChainProvider', () => {
  const syllable: Lyrics = newLyrics(
    [
      newLine({
        start: 0,
        end: 1000,
        syllables: [{ text: 'a', begin: 0, end: 1000, wordEnd: false }],
      }),
    ],
    { credit: 'syllable' },
  );
  const byLine: Lyrics = newLyrics(
    [newLine({ start: 0, end: 1000, syllables: [], approx: true })],
    { credit: 'line' },
  );
  const answers = (value: Lyrics | null | ProviderError): LyricsProvider => ({
    fetch: () => (value instanceof ProviderError ? Promise.reject(value) : Promise.resolve(value)),
  });

  it('prefers syllable timing over an earlier line-timed result', async () => {
    const chain = new ChainProvider([answers(byLine), answers(syllable)]);
    expect((await chain.fetch(QUERY))?.credit).toBe('syllable');
  });

  it('keeps the first line-timed result when nobody has syllables', async () => {
    const chain = new ChainProvider([answers(null), answers(byLine), answers(byLine)]);
    expect((await chain.fetch(QUERY))?.credit).toBe('line');
  });

  it('survives a failing provider, and rethrows the error only when nobody answered', async () => {
    const failure = new ProviderError('busy', 'Spicy Lyrics');
    expect(
      (await new ChainProvider([answers(failure), answers(byLine)]).fetch(QUERY))?.credit,
    ).toBe('line');
    await expect(new ChainProvider([answers(failure), answers(null)]).fetch(QUERY)).rejects.toBe(
      failure,
    );
    expect(await new ChainProvider([answers(null)]).fetch(QUERY)).toBeNull();
  });
});
