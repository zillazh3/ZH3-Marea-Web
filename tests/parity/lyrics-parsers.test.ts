// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LyricsError } from '@/features/lyrics/errors';
import { parseLrc } from '@/features/lyrics/lrc';
import { parseLyricsfile } from '@/features/lyrics/lyricsfile';
import { interludesOf } from '@/engine/lyrics';
import { lyricsKind, type Lyrics } from '@/features/lyrics/model';
import { installAttributeNamespaces } from '../support/xml-namespaces';
import { appendWordSyllable, guessEnd, parseTime, spread } from '@/features/lyrics/timing';
import { parseTtml } from '@/features/lyrics/ttml';

installAttributeNamespaces();

interface Case {
  name: string;
  input: string;
  expected: ExpectedLyrics | { error: true };
}

interface ExpectedLyrics {
  source: string;
  credit: string;
  writers: string[];
  kind: string;
  lines: readonly unknown[];
  interludes: [number, number][];
}

const FIXTURE = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/lyrics/parsers.json'), 'utf8'),
) as {
  ttml: Case[];
  lrc: Case[];
  lyricsfile: Case[];
  time: { input: string; expected: number | null }[];
  spread: { text: string; start: number; end: number; expected: unknown[] }[];
  guessEnd: { start: number; text: string; next: number | null; expected: number }[];
};

/** The shape tools/export-fixtures.py records. */
function recorded(lyrics: Lyrics): ExpectedLyrics {
  return {
    source: lyrics.source,
    credit: lyrics.credit,
    writers: [...lyrics.writers],
    kind: lyricsKind(lyrics),
    lines: lyrics.lines,
    interludes: interludesOf(lyrics).map((i) => [i.start, i.end]),
  };
}

function check(c: Case, parse: (text: string) => Lyrics | Promise<Lyrics>): void {
  it(c.name, async () => {
    if ('error' in c.expected) {
      await expect(async () => parse(c.input)).rejects.toBeInstanceOf(LyricsError);
    } else {
      expect(recorded(await parse(c.input))).toEqual(c.expected);
    }
  });
}

describe('TTML parser against the desktop', () => {
  for (const c of FIXTURE.ttml) check(c, parseTtml);
});

describe('LRC parser against the desktop', () => {
  for (const c of FIXTURE.lrc) check(c, parseLrc);
});

describe('Lyricsfile parser against the desktop', () => {
  for (const c of FIXTURE.lyricsfile) check(c, parseLyricsfile);
});

describe('timing helpers against the desktop', () => {
  it('parses times, and refuses what the desktop refuses', () => {
    for (const { input, expected } of FIXTURE.time) {
      if (expected === null) expect(() => parseTime(input)).toThrow(LyricsError);
      else expect(parseTime(input)).toBe(expected);
    }
  });

  it('spreads time over words by letter count', () => {
    for (const { text, start, end, expected } of FIXTURE.spread) {
      expect(spread(text, start, end)).toEqual(expected);
    }
  });

  it('guesses the end of a line without one', () => {
    for (const c of FIXTURE.guessEnd) expect(guessEnd(c.start, c.text, c.next)).toBe(c.expected);
  });

  it('marks the previous syllable as closing its word when the next text starts with a space', () => {
    const out = [{ text: 'a', begin: 0, end: 1, wordEnd: false }];
    appendWordSyllable(out, ' b', 1, 2);
    expect(out.map((s) => [s.text, s.wordEnd])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });
});
