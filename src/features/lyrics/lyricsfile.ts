import { LyricsError } from './errors';
import { newLine, newLyrics, type Line, type Lyrics, type Syllable } from './model';
import { appendWordSyllable, guessEnd, spread } from './timing';

/** Lyricsfiles come from the network (LRCLIB): a size cap is enough, anchors and aliases are not rejected. */
const MAX_CHARS = 1_000_000;

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Python's `int(value)` for what a YAML scalar can be: whole numbers, floats (truncated) and numeric strings. */
function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value)) return Number(value.trim());
  throw new LyricsError('lyricsfileInvalid', `not an integer: ${String(value)}`);
}

function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function isTimedText(value: unknown): value is Record_ {
  return isRecord(value) && toText(value.text).trim() !== '' && present(value.start_ms);
}

/** Lyricsfile 1.0 (LRCLIB's format, YAML): lines with optional per-word timing. */
export async function parseLyricsfile(text: string): Promise<Lyrics> {
  if (text.length > MAX_CHARS) throw new LyricsError('lyricsfileTooLarge');
  const { parse } = await import('yaml'); // lazy: only LRCLIB word-sync results need it
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (error) {
    throw new LyricsError('lyricsfileInvalid', error instanceof Error ? error.message : '');
  }
  // YAML 1.2 reads `1.0` as the number 1, where the desktop's `str(1.0)` is "1.0": accept both spellings of version 1.0.
  if (!isRecord(doc) || !(doc.version === 1 || String(doc.version) === '1.0')) {
    throw new LyricsError('lyricsfileVersion');
  }
  const rawLines = (Array.isArray(doc.lines) ? doc.lines : []).filter(isTimedText);
  rawLines.sort((a, b) => toInt(a.start_ms) - toInt(b.start_ms));

  const lines: Line[] = rawLines.map((l, i) => {
    const start = toInt(l.start_ms);
    const following = rawLines[i + 1];
    const next = following ? toInt(following.start_ms) : null;
    const end = Math.max(
      present(l.end_ms) ? toInt(l.end_ms) : guessEnd(start, toText(l.text), next),
      start + 1,
    );
    const wordList = (Array.isArray(l.words) ? l.words : []).filter(isTimedText);
    if (wordList.length === 0) {
      return newLine({
        start,
        end,
        syllables: spread(toText(l.text), start, end),
        approx: true,
      });
    }
    const syllables: Syllable[] = [];
    wordList.forEach((w, j) => {
      const nextWord = wordList[j + 1];
      const begin = toInt(w.start_ms);
      const wordEnd = present(w.end_ms)
        ? toInt(w.end_ms)
        : nextWord
          ? toInt(nextWord.start_ms)
          : end;
      appendWordSyllable(syllables, toText(w.text), begin, wordEnd);
    });
    const last = syllables[syllables.length - 1];
    if (last) last.wordEnd = false;
    return newLine({ start, end: Math.max(end, last ? last.end : 0), syllables });
  });
  return newLyrics(lines);
}
