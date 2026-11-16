import { describe, expect, it } from 'vitest';
import { interludesOf, lineText } from '@/engine/lyrics';
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
