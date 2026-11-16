import type {
  BgVocal as EngineBgVocal,
  Line as EngineLine,
  Lyrics as EngineLyrics,
} from '@/engine/lyrics';

export type { Syllable } from '@/engine/lyrics';

// The full lyrics model: what the engine reads, plus the fields that only travel with the project file.

export interface BgVocal extends EngineBgVocal {
  /** `backing` unless the TTML says otherwise. */
  role: string;
  agent: string;
}

export interface Line extends EngineLine {
  bg: readonly BgVocal[];
  role: string;
  /** The agent id as written in the source, before it was folded into `v1` / `v2`. */
  rawAgent: string;
}

export interface Lyrics extends EngineLyrics {
  lines: readonly Line[];
  /** Where it came from: `apple_music`, `spicy_lyrics`, `lrclib`... Empty for a file of the user's own. */
  source: string;
  /** Who provides it, shown as "Provided by ...". */
  credit: string;
  /** Authors, shown as "Written by ...". */
  writers: readonly string[];
}

/** `syllable` when timing comes per syllable or word; `line` as soon as one line was spread from a single time. */
export function lyricsKind(lyrics: Pick<Lyrics, 'lines'>): 'syllable' | 'line' {
  return lyrics.lines.some((l) => l.approx) ? 'line' : 'syllable';
}

export function newLine(fields: Pick<Line, 'start' | 'end' | 'syllables'> & Partial<Line>): Line {
  return { agent: 'v1', bg: [], approx: false, role: '', rawAgent: '', ...fields };
}

export function newLyrics(
  lines: readonly Line[],
  fields: Partial<Omit<Lyrics, 'lines'>> = {},
): Lyrics {
  return { source: '', credit: '', writers: [], ...fields, lines };
}
