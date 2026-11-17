import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Lyrics, Line } from '@/engine/lyrics';
import { analyzeAudio } from '@/features/audio/analysis';
import { loadHookWeights, suggestHooks, type HookSuggestion } from '@/features/hooks/analyze';
import { demoLyrics } from '@/features/lyrics/demo';
import { SequenceMatcher } from '@/shared/difflib';

interface FixtureSuggestion {
  first: number;
  last: number;
  startMs: number;
  endMs: number;
  targetS: number;
  score: number;
  breakdown: Record<string, number>;
  explanation: string;
  confidence: string;
}

interface HooksFixture {
  demoTitle: string;
  demoFxCounts: number[];
  demoSuggestions: Record<string, FixtureSuggestion[]>;
  hookLines: { start: number; end: number; agent: string; text: string }[];
  hookFxCounts: number[];
  hookAudioSeconds: number;
  hookOffsetMs: number;
  hookAudioSuggestions: Record<string, FixtureSuggestion[]>;
}

function makeTestMono(rate: number, seconds: number): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const beatPhase = t % 0.5;
    const kick = Math.exp(-beatPhase * 28.0);
    const env = t >= 2.1 && t <= 3.0 ? 0.04 : t > 3.1 ? 0.78 : 0.42;
    const melody =
      0.35 * Math.sin(2 * Math.PI * 440.0 * t) +
      0.25 * Math.sin(2 * Math.PI * 554.37 * t) +
      0.2 * Math.sin(2 * Math.PI * 659.25 * t);
    const hf =
      (t > 3.1 ? 0.35 : 0.08) * Math.sin(2 * Math.PI * 3100.0 * t) +
      (t > 3.1 ? 0.2 : 0.04) * Math.sin(2 * Math.PI * 4700.0 * t);
    const s = Math.fround(
      env * (melody + hf + 0.5 * kick * Math.sin(2 * Math.PI * 1200.0 * beatPhase)),
    );
    out[i] = Math.fround((s + Math.fround(s * 0.92)) * 0.5);
  }
  return out;
}

function toHookLyrics(raw: HooksFixture['hookLines']): Lyrics {
  const lines: Line[] = raw.map((l) => {
    const words = l.text.split(' ');
    const step = Math.trunc((l.end - l.start) / Math.max(1, words.length));
    return {
      start: l.start,
      end: l.end,
      agent: l.agent,
      approx: false,
      bg: [],
      syllables: words.map((w, idx) => ({
        text: w,
        begin: l.start + idx * step,
        end: l.start + (idx + 1) * step - 40,
        wordEnd: idx < words.length - 1,
      })),
    };
  });
  return { lines };
}

function expectSameSuggestions(
  actual: readonly HookSuggestion[] | undefined,
  expected: readonly FixtureSuggestion[],
): void {
  expect(actual).toBeDefined();
  if (!actual) return;
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    const a = actual[i];
    const e = expected[i];
    expect(a).toBeDefined();
    expect(e).toBeDefined();
    if (!a || !e) continue;
    expect(a.first).toBe(e.first);
    expect(a.last).toBe(e.last);
    expect(a.startMs).toBeCloseTo(e.startMs, 6);
    expect(a.endMs).toBeCloseTo(e.endMs, 6);
    expect(a.targetS).toBeCloseTo(e.targetS, 6);
    expect(a.score).toBeCloseTo(e.score, 2);
    expect(a.confidence).toBe(e.confidence);
    expect(a.explanation).toBe(e.explanation);
    expect(Object.keys(a.breakdown).sort()).toEqual(Object.keys(e.breakdown).sort());
    for (const key of Object.keys(e.breakdown)) {
      expect(a.breakdown[key]).toBeCloseTo(e.breakdown[key] ?? 0, 2);
    }
  }
}

describe('Anzuelo hook analysis parity', () => {
  const fixture = JSON.parse(
    readFileSync(resolve(__dirname, '../fixtures/hooks/suggest.json'), 'utf-8'),
  ) as HooksFixture;

  it('loads and clamps weights from bundled JSON', () => {
    const w = loadHookWeights({ repetition: 99, similarity: 0.1, unknown_key: 42 });
    expect(w.repetition).toBe(10);
    expect(w.similarity).toBe(0.5);
    expect(w.top_n).toBe(5);
  });

  it('matches SequenceMatcher similarity without autojunk', () => {
    const sm = new SequenceMatcher(
      'marea de luz nos lleva otra vez',
      'marea de luz rompiendo la piel',
    );
    expect(sm.ratio()).toBeGreaterThan(0.5);
    expect(new SequenceMatcher('abrimos la noche', 'abrimos la noche').ratio()).toBe(1);
  });

  it('matches desktop suggestions on lyrics-only demo fixture', () => {
    const res = suggestHooks(demoLyrics(), {
      title: fixture.demoTitle,
      targetsS: [15, 30, 60],
      fxCounts: fixture.demoFxCounts,
    });
    for (const [k, expected] of Object.entries(fixture.demoSuggestions)) {
      expectSameSuggestions(res.get(Number(k)), expected);
    }
  });

  it('matches desktop suggestions with audio analysis + chorus repeats + offset', () => {
    const lyrics = toHookLyrics(fixture.hookLines);
    const mono = makeTestMono(48000, fixture.hookAudioSeconds);
    const analysis = analyzeAudio(mono, 48000);
    const res = suggestHooks(lyrics, {
      title: fixture.demoTitle,
      targetsS: [15, 22],
      analysis,
      audioOffsetMs: fixture.hookOffsetMs,
      fxCounts: fixture.hookFxCounts,
    });
    for (const [k, expected] of Object.entries(fixture.hookAudioSuggestions)) {
      expectSameSuggestions(res.get(Number(k)), expected);
    }
  });
});
