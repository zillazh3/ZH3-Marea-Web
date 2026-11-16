import { lyricsKind } from '@/features/lyrics/model';
import type { ClipProject } from '@/features/projects/project';
import { crc32Utf8 } from '@/shared/pycompat';

/** Number of placeholder cover palettes in the design tokens. */
export const COVER_TONES = 6;
/** Lyric lines shown on a library thumbnail (the one before, the one sung, the one after). */
const PREVIEW_LINES = 3;

/** What the library shows about a saved project; small, so listing it is cheap. */
export interface ProjectMeta {
  id: string;
  title: string;
  artist: string;
  /** ms since the epoch */
  updatedAt: number;
  kind: 'syllable' | 'line';
  lineCount: number;
  /** Index into the placeholder cover palettes, until real artwork is drawn. */
  tone: number;
  /** A few consecutive lines of the lyrics, for the thumbnail. */
  preview: string[];
}

function lineText(line: ClipProject['lyrics']['lines'][number]): string {
  return line.syllables
    .map((s) => s.text + (s.wordEnd ? ' ' : ''))
    .join('')
    .trim();
}

/** The same song always gets the same palette. */
export function toneFor(title: string, artist: string): number {
  return crc32Utf8(`${title}|${artist}`) % COVER_TONES;
}

export function projectMeta(project: ClipProject, id: string, updatedAt: number): ProjectMeta {
  const texts = project.lyrics.lines.map(lineText).filter((t) => t !== '');
  const start = Math.min(2, Math.max(0, texts.length - PREVIEW_LINES));
  return {
    id,
    title: project.title,
    artist: project.artist,
    updatedAt,
    kind: lyricsKind(project.lyrics),
    lineCount: project.lyrics.lines.length,
    tone: toneFor(project.title, project.artist),
    preview: texts.slice(start, start + PREVIEW_LINES),
  };
}
