import { describe, expect, it } from 'vitest';
import type { Line, Lyrics } from '@/engine/lyrics';
import { demoLyrics } from '@/features/lyrics/demo';
import { loadBundledLibrary } from '@/features/wordfx/library';
import { matchLyrics } from '@/features/wordfx/matcher';
import { loadBundledRules } from '@/features/wordfx/rules';
import fixture from '../fixtures/wordfx/matcher.json';

function makeWordfxProbeLyrics(): Lyrics {
  const base = demoLyrics();
  const extraTexts: readonly (readonly [string, number])[] = [
    ['No me dejes caer en el silencio', 60000],
    ['Volvi a respirar fuego y hielo', 64000],
    ['In may I remember that burning starlight', 68000],
    ['Para siempre te pierdo entre sombras', 72000],
    ['Never want to fall into winter darkness', 76000],
  ];
  const lines: Line[] = [...base.lines];
  for (const [text, t0] of extraTexts) {
    const words = text.split(' ');
    const syllables = words.map((w, idx) => ({
      text: w + (idx < words.length - 1 ? ' ' : ''),
      begin: t0 + idx * 450,
      end: t0 + (idx + 1) * 420,
      wordEnd: true,
    }));
    lines.push({
      start: t0,
      end: t0 + words.length * 450,
      agent: 'v1',
      syllables,
      bg: [],
      approx: false,
    });
  }
  return { lines };
}

describe('wordfx library, rules & matcher parity (T8.2)', () => {
  const lib = loadBundledLibrary();
  const rules = loadBundledRules();
  const matches = matchLyrics(makeWordfxProbeLyrics(), lib, rules);

  it('loads the exact category count from bundled library.json', () => {
    expect(Object.keys(lib.categories).length).toBe(fixture.categoryCount);
  });

  it('matches desktop matcher output line by line (phrases, negation, reversals, senses, pairs)', () => {
    const got = [...matches.values()].sort((a, b) => a.line - b.line || a.word - b.word);
    expect(got.length).toBe(fixture.matches.length);
    for (let i = 0; i < fixture.matches.length; i += 1) {
      const a = got[i];
      const b = fixture.matches[i];
      expect(a).toBeDefined();
      if (!a || !b) continue;
      expect(a.line).toBe(b.line);
      expect(a.word).toBe(b.word);
      expect(a.text).toBe(b.text);
      expect(a.lemma).toBe(b.lemma);
      expect(a.lang).toBe(b.lang);
      expect(a.categories).toEqual(b.categories);
      expect(a.beginMs).toBe(b.beginMs);
      expect(a.endMs).toBe(b.endMs);
      expect(a.pair).toBe(b.pair);
      expect(a.note).toBe(b.note);
      expect(a.score).toBeCloseTo(b.score, 9);
      expect(a.ambiguity).toBeCloseTo(b.ambiguity, 9);
    }
  });
});
