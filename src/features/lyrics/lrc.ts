import { pyRound } from '@/shared/pycompat';
import { newLine, newLyrics, type Line, type Lyrics, type Syllable } from './model';
import { guessEnd, spread } from './timing';

const STAMP = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
const WORD_TAG = /<(\d+):(\d+(?:\.\d+)?)>/g;
// The line boundaries of Python's `str.splitlines()`, as code points.
const BREAKS = new Set([0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029]);

function splitLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (!BREAKS.has(code)) {
      current += text.charAt(i);
      continue;
    }
    if (code === 0x0d && text.charCodeAt(i + 1) === 0x0a) i += 1; // CRLF is one break
    lines.push(current);
    current = '';
  }
  lines.push(current);
  return lines;
}

function stampMs(minutes: string, seconds: string): number {
  return pyRound((Number(minutes) * 60 + Number(seconds)) * 1000);
}

/** `<00:12.00>Ho<00:12.30>la <00:12.80>mundo<00:13.40>` to syllables with real timing. A tag with no text ends the previous one. */
function enhancedSyllables(body: string, lineEnd: number): Syllable[] {
  const parts = body.split(/<(\d+):(\d+(?:\.\d+)?)>/); // [text before, min, sec, text, min, sec, text...]
  const tagged: [number, string][] = [];
  for (let i = 1; i + 2 < parts.length + 1; i += 3) {
    tagged.push([stampMs(parts[i] ?? '0', parts[i + 1] ?? '0'), parts[i + 2] ?? '']);
  }
  const out: Syllable[] = [];
  tagged.forEach(([t, text], i) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next = tagged[i + 1];
    const end = next ? next[0] : lineEnd;
    out.push({ text: trimmed, begin: t, end: Math.max(end, t + 1), wordEnd: /\s$/.test(text) });
  });
  const last = out[out.length - 1];
  if (last) last.wordEnd = false;
  return out;
}

interface Entry {
  t: number;
  body: string;
  rest: string;
}

/**
 * LRC to lyrics. Per line (`approx`) or, when it carries per-word times (`<mm:ss.xx>`), with real syllables. An empty line
 * marks the end of the previous one.
 */
export function parseLrc(text: string): Lyrics {
  const entries: Entry[] = [];
  for (const raw of splitLines(text)) {
    const rest = raw.replace(STAMP, '');
    const body = rest.replace(WORD_TAG, '').trim();
    for (const [, minutes, seconds] of raw.matchAll(STAMP)) {
      entries.push({ t: stampMs(minutes ?? '0', seconds ?? '0'), body, rest });
    }
  }
  entries.sort((a, b) => a.t - b.t);

  const lines: Line[] = [];
  entries.forEach(({ t, body, rest }, i) => {
    if (!body) return;
    const next = entries[i + 1];
    const end = Math.max(
      next && !next.body ? next.t : guessEnd(t, body, next ? next.t : null),
      t + 1,
    );
    const syllables = rest.search(WORD_TAG) >= 0 ? enhancedSyllables(rest, end) : [];
    const first = syllables[0];
    const last = syllables[syllables.length - 1];
    if (first && last) {
      // Real timing, so not a "per line" lyric. Ending on a tag with no text means the file states the end; otherwise it is a guess.
      const tail = rest.split(WORD_TAG).pop() ?? '';
      const closed = tail.trim() === '';
      lines.push(
        newLine({
          start: Math.min(t, first.begin),
          end: closed ? last.end : Math.max(end, last.end),
          syllables,
        }),
      );
    } else {
      lines.push(newLine({ start: t, end, syllables: spread(body, t, end), approx: true }));
    }
  });
  return newLyrics(lines);
}
