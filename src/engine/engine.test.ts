import { describe, expect, it } from 'vitest';
import { Engine } from './engine';
import type { Line, Lyrics } from './lyrics';

const measure = (): number => 60;

function line(start: number, text: string): Line {
  const syllables = text.split(' ').map((word, i, words) => ({
    text: word,
    begin: start + i * 400,
    end: start + (i + 1) * 400,
    wordEnd: i < words.length - 1,
  }));
  return {
    start,
    end: start + words(text) * 400,
    agent: 'v1',
    syllables,
    bg: [],
    approx: false,
  };
}

function words(text: string): number {
  return text.split(' ').length;
}

const LYRICS: Lyrics = { lines: [line(3000, 'one two three'), line(7000, 'four five six')] };

function run(): number[] {
  const engine = new Engine(LYRICS, measure, { stageH: 900 });
  engine.warmup(7500);
  for (let i = 0; i < 90; i += 1) engine.advance(1 / 60);
  return engine.items.flatMap((item) => [
    item.y.p,
    item.s.p,
    ...item.words.flatMap((w) => w.parts.flatMap((u) => [u.y, u.scale, u.glowA])),
  ]);
}

describe('Engine', () => {
  it('builds lines, the intro interlude and an optional credit in time order', () => {
    const engine = new Engine(LYRICS, measure, { stageH: 900, creditH: 30 });
    expect(engine.items.map((i) => i.kind)).toEqual(['gap', 'line', 'gap', 'line', 'credit']);
  });

  it('is deterministic: the same lyrics and steps give identical state', () => {
    expect(run()).toEqual(run());
  });

  it('keeps the credit from ever becoming the active item', () => {
    const engine = new Engine(LYRICS, measure, { stageH: 900, creditH: 30 });
    engine.warmup(60000);
    expect(engine.items[engine.active]?.kind).toBe('line');
  });

  it('settles after a seek once the springs have converged', () => {
    const engine = new Engine(LYRICS, measure, { stageH: 900 });
    engine.warmup(7500);
    expect(engine.isSettled()).toBe(false);
    for (let i = 0; i < 60 * 12; i += 1) engine.advance(1 / 60, false);
    expect(engine.isSettled()).toBe(true);
  });

  it('survives empty lyrics', () => {
    const engine = new Engine({ lines: [] }, measure, { stageH: 900 });
    engine.warmup(1000);
    expect(engine.items).toEqual([]);
  });
});
