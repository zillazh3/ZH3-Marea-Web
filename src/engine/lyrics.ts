// The lyrics the engine animates. Parsers (M5) produce these; times are milliseconds and may be fractional.

export interface Syllable {
  text: string;
  begin: number;
  end: number;
  /** A space follows the syllable, so it closes a word. */
  wordEnd: boolean;
}

export interface BgVocal {
  start: number;
  end: number;
  syllables: readonly Syllable[];
}

export interface Line {
  start: number;
  /** Includes the background vocals. */
  end: number;
  /** `v2` is the second singer of a duet. */
  agent: string;
  syllables: readonly Syllable[];
  bg: readonly BgVocal[];
  /** Syllable times were spread from a single line time, so words are not really timed. */
  approx: boolean;
}

export interface Interlude {
  start: number;
  end: number;
}

export interface Lyrics {
  lines: readonly Line[];
}

/** Gaps of at least this long between lines get the three-dot interlude. */
const INTERLUDE_MS = 2000;
/** The intro shows its dots from here, like Apple Music. */
const INTRO_MS = 1200;

export function lineText(line: Pick<Line, 'syllables'>): string {
  return line.syllables
    .map((s) => s.text + (s.wordEnd ? ' ' : ''))
    .join('')
    .trim();
}

export function interludesOf(lyrics: Lyrics): Interlude[] {
  const out: Interlude[] = [];
  let prevEnd = 0;
  lyrics.lines.forEach((line, i) => {
    if (line.start - prevEnd >= (i === 0 ? INTRO_MS : INTERLUDE_MS)) {
      out.push({ start: prevEnd, end: line.start });
    }
    prevEnd = Math.max(prevEnd, line.end);
  });
  return out;
}
