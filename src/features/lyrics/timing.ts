import { codePointLength, isAlnum, pyRound } from '@/shared/pycompat';
import { LyricsError } from './errors';
import type { Syllable } from './model';

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Python's `float(text)` for the plain decimal forms times can take; anything else is an error, never a silent 0. */
export function parseNumber(text: string): number {
  const trimmed = text.trim();
  if (!NUMBER.test(trimmed)) throw new LyricsError('badTime', text);
  return Number(trimmed);
}

/** `'00:06.000'`, `'1:02.5'`, `'6.5s'`, `'500ms'` to milliseconds. */
export function parseTime(raw: string): number {
  const s = raw.trim();
  if (s.endsWith('ms')) return pyRound(parseNumber(s.slice(0, -2)));
  if (s.endsWith('s')) return pyRound(parseNumber(s.slice(0, -1)) * 1000);
  let seconds = 0;
  for (const part of s.split(':')) seconds = seconds * 60 + parseNumber(part);
  return pyRound(seconds * 1000);
}

/** Splits on whitespace the way Python's `str.split()` does, dropping empty pieces. */
export function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => w !== '');
}

/** Spreads [start, end] over the words of `text` by their letter count: one syllable per word. */
export function spread(text: string, start: number, end: number): Syllable[] {
  const parts = words(text);
  const weights = parts.map((w) => Math.max(1, Array.from(w).filter(isAlnum).length));
  const total = weights.reduce((sum, k) => sum + k, 0);
  const out: Syllable[] = [];
  let acc = 0;
  let t0 = start;
  parts.forEach((word, i) => {
    acc += weights[i] ?? 1;
    const t1 = start + pyRound(((end - start) * acc) / total);
    out.push({ text: word, begin: t0, end: t1, wordEnd: i < parts.length - 1 });
    t0 = t1;
  });
  return out;
}

// Without an explicit end a line lasts until the next one; only a huge gap assumes it was sung shorter and leaves an interlude.
// A low cap (100 ms per letter) made false interludes between slow consecutive lines.
const LINE_MIN_MS = 5000;
const LINE_MS_PER_CHAR = 150;

export function guessEnd(start: number, text: string, nextStart: number | null): number {
  const cap = start + Math.max(LINE_MIN_MS, LINE_MS_PER_CHAR * codePointLength(text));
  return nextStart === null ? cap : Math.min(nextStart, cap);
}

/** Closes a word group: marks the previous syllable as ending its word when the new text starts with a space. */
export function appendWordSyllable(
  out: Syllable[],
  raw: string,
  begin: number,
  end: number,
  tailSpace = false,
): void {
  const previous = out[out.length - 1];
  if (/^\s/.test(raw) && previous) previous.wordEnd = true;
  const text = raw.trim();
  if (text)
    out.push({ text, begin, end: Math.max(end, begin), wordEnd: /\s$/.test(raw) || tailSpace });
}
