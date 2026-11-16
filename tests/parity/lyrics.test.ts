import { describe, expect, it } from 'vitest';
import { interludesOf, lineText } from '@/engine/lyrics';
import { demoLyrics } from '@/features/lyrics/demo';
import { loadDemoLyrics } from './golden';

describe('lyrics helpers', () => {
  const demo = loadDemoLyrics();

  it('joins syllables into the same line text as the desktop', () => {
    expect(demo.lines.map(lineText)).toEqual(demo.reference.texts);
  });

  it('finds the same interludes, counting the intro from 1.2 s and gaps from 2 s', () => {
    expect(interludesOf(demo).map((i) => [i.start, i.end])).toEqual(demo.reference.interludes);
  });

  it('shows the intro dots only when the first line starts late enough', () => {
    const line = { start: 1199, end: 3000, agent: 'v1', syllables: [], bg: [], approx: false };
    expect(interludesOf({ lines: [line] })).toEqual([]);
    expect(interludesOf({ lines: [{ ...line, start: 1200 }] })).toEqual([{ start: 0, end: 1200 }]);
  });
});

describe('demo song', () => {
  it('generates the same lyrics as the desktop, to the last bit', () => {
    const engineShape = (lines: ReturnType<typeof demoLyrics>['lines']): unknown[] =>
      lines.map((l) => ({
        start: l.start,
        end: l.end,
        agent: l.agent,
        syllables: l.syllables,
        bg: l.bg.map((b) => ({ start: b.start, end: b.end, syllables: b.syllables })),
        approx: l.approx,
      }));
    expect(engineShape(demoLyrics().lines)).toEqual(engineShape(loadDemoLyrics().lines as never));
  });
});
