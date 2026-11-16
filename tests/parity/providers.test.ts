// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { interludesOf } from '@/engine/lyrics';
import { lyricsKind, type Lyrics } from '@/features/lyrics/model';
import { bestTrack, parseTrack, trackToLyrics } from '@/features/providers/lrclib';
import { spicyToLyrics } from '@/features/providers/spicy';

interface RecordedLyrics {
  source: string;
  credit: string;
  writers: string[];
  kind: string;
  lines: unknown[];
  interludes: [number, number][];
}

const FIXTURE = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/lyrics/providers.json'), 'utf8'),
) as {
  spicy: { name: string; input: unknown; expected: RecordedLyrics | null }[];
  lrclibBest: { durationMs: number | null; expected: number | null }[];
  lrclibResults: unknown[];
  lrclibToLyrics: { name: string; input: unknown; expected: RecordedLyrics | null }[];
};

function recorded(lyrics: Lyrics | null): RecordedLyrics | null {
  if (!lyrics) return null;
  return {
    source: lyrics.source,
    credit: lyrics.credit,
    writers: [...lyrics.writers],
    kind: lyricsKind(lyrics),
    lines: [...lyrics.lines],
    interludes: interludesOf(lyrics).map((i) => [i.start, i.end]),
  };
}

describe('Spicy Lyrics responses against the desktop', () => {
  for (const c of FIXTURE.spicy) {
    it(c.name, () => {
      expect(recorded(spicyToLyrics(c.input))).toEqual(c.expected);
    });
  }
});

describe('LRCLIB selection against the desktop', () => {
  const tracks = FIXTURE.lrclibResults.map(parseTrack).filter((t) => t !== null);

  it('picks the track closest in duration, within 3 s', () => {
    for (const c of FIXTURE.lrclibBest) {
      expect(bestTrack(tracks, c.durationMs ?? undefined)?.id ?? null).toBe(c.expected);
    }
  });

  for (const c of FIXTURE.lrclibToLyrics) {
    it(`reads ${c.name}`, async () => {
      const track = parseTrack(c.input);
      const lyrics = track ? await trackToLyrics(track) : null;
      expect(recorded(lyrics)).toEqual(c.expected);
    });
  }
});
