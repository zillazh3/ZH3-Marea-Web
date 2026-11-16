import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/engine/pycompat.json';
import {
  codePointLength,
  crc32Utf8,
  isAlnum,
  median,
  pyMod,
  pyRound,
  vibratoPhase,
} from '@/shared/pycompat';

describe('pyRound', () => {
  it('matches Python for ties, negatives and warmup step counts', () => {
    for (const [input, expected] of fixture.round) {
      expect(pyRound(input ?? NaN)).toBe(expected);
    }
  });

  it('differs from Math.round on exact ties, which is why it exists', () => {
    expect(Math.round(2.5)).toBe(3);
    expect(pyRound(2.5)).toBe(2);
  });
});

describe('pyMod', () => {
  it('takes the sign of the divisor like Python', () => {
    for (const [a, b, expected] of fixture.mod) {
      expect(pyMod(a ?? NaN, b ?? NaN)).toBeCloseTo(expected ?? NaN, 12);
    }
  });
});

describe('crc32Utf8', () => {
  it('matches zlib.crc32 on ASCII, accents, CJK and emoji', () => {
    for (const [text, expected] of fixture.crc32 as [string, number][]) {
      expect(crc32Utf8(text)).toBe(expected);
    }
  });
});

describe('vibratoPhase', () => {
  it('matches Python, whose integers do not overflow', () => {
    for (const [line, word, letter, expected] of fixture.phase) {
      expect(vibratoPhase(line ?? 0, word ?? 0, letter ?? 0)).toBe(expected);
    }
  });

  it('would be wrong with plain 32-bit XOR', () => {
    const naive = (250 * 73856093) ^ (300 * 19349663) ^ (200 * 83492791);
    expect(((naive % 1000) / 1000) * 6.28).not.toBe(vibratoPhase(250, 300, 200));
  });
});

describe('median', () => {
  it('matches statistics.median', () => {
    for (const [values, expected] of fixture.median) {
      expect(median(values as number[])).toBe(expected);
    }
  });

  it('rejects an empty list instead of inventing a value', () => {
    expect(() => median([])).toThrow(RangeError);
  });
});

describe('codePointLength', () => {
  it('counts code points like len()', () => {
    for (const [text, expected] of fixture.codePoints as [string, number][]) {
      expect(codePointLength(text)).toBe(expected);
    }
  });
});

describe('isAlnum', () => {
  it('agrees with str.isalnum for every code point Python knows', () => {
    const inRanges = (ranges: number[][], cp: number): boolean =>
      ranges.some(([a = 0, b = 0]) => cp >= a && cp <= b);
    const mismatches: number[] = [];
    for (const [first = 0, last = 0] of fixture.assignedRanges) {
      for (let cp = first; cp <= last; cp += 1) {
        if (isAlnum(String.fromCodePoint(cp)) !== inRanges(fixture.alnumRanges, cp))
          mismatches.push(cp);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
