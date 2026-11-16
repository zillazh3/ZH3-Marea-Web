import { newLine, newLyrics, type BgVocal, type Line, type Lyrics, type Syllable } from './model';

// The demo song of the prototype ("Marea de luz"): the single source of the demo project and of the engine tests.

interface DemoLine {
  /** Start in seconds, duration in seconds. */
  start: number;
  duration: number;
  /** `|` separates syllables, `~` marks a held syllable (weight 4). */
  text: string;
  duet?: boolean;
  background?: { start: number; duration: number; text: string };
}

const SONG: readonly DemoLine[] = [
  { start: 6.0, duration: 3.0, text: 'Ca|mi|no so|lo por la ciu|dad' },
  { start: 9.4, duration: 3.6, text: 'las lu|ces se de|rri|ten en el mar~' },
  {
    start: 13.4,
    duration: 3.1,
    text: 'y tu voz~ me lle|ga sin pa|la|bras',
    background: { start: 16.5, duration: 1.3, text: 'sin pa|la|bras' },
  },
  { start: 17.9, duration: 3.2, text: 'co|mo un e|co a|zul~' },
  { start: 21.4, duration: 3.0, text: 'Si te pier|do en|tre la gen|te', duet: true },
  { start: 24.8, duration: 3.2, text: 'te en|cuen|tro en ca|da can|ción', duet: true },
  {
    start: 33.5,
    duration: 2.6,
    text: 'Ma|re|a de luz~',
    background: { start: 36.2, duration: 1.4, text: 'ma|re|a~' },
  },
  { start: 37.8, duration: 3.0, text: 'que no se a|pa|ga~' },
  { start: 41.2, duration: 3.8, text: 'ba|ja la ma|re|a, su|be el co|ra|zón' },
  { start: 45.4, duration: 3.4, text: 'y yo me que|do a|quí~' },
  { start: 49.2, duration: 3.2, text: 'a la de|ri|va~' },
];

const HELD_WEIGHT = 4;

interface TimedSyllable {
  text: string;
  begin: number;
  end: number;
}

/** Words as lists of syllables, with times in seconds, unrounded. */
function timedWords(text: string, start: number, duration: number): TimedSyllable[][] {
  const words = text.split(' ').map((word) =>
    word.split('|').map((s) => ({
      text: s.replace(/~+$/, ''),
      weight: s.endsWith('~') ? HELD_WEIGHT : 1,
    })),
  );
  const unit =
    duration / words.reduce((sum, w) => sum + w.reduce((acc, s) => acc + s.weight, 0), 0);
  let cursor = start;
  return words.map((word) =>
    word.map((s) => {
      const begin = cursor;
      cursor += s.weight * unit;
      return { text: s.text, begin, end: cursor };
    }),
  );
}

function syllables(words: TimedSyllable[][]): Syllable[] {
  return words.flatMap((word, wi) =>
    word.map((s, si) => ({
      text: s.text,
      begin: s.begin * 1000,
      end: s.end * 1000,
      wordEnd: si === word.length - 1 && wi < words.length - 1,
    })),
  );
}

/** The demo lyrics with times in ms left unrounded (a TTML rounds to the ms; the prototype did not). */
export function demoLyrics(): Lyrics {
  const lines: Line[] = SONG.map((song) => {
    const lead = syllables(timedWords(song.text, song.start, song.duration));
    const bg: BgVocal[] = [];
    if (song.background) {
      const b = syllables(
        timedWords(song.background.text, song.background.start, song.background.duration),
      );
      const first = b[0];
      const last = b[b.length - 1];
      if (first && last)
        bg.push({ start: first.begin, end: last.end, syllables: b, role: 'backing', agent: '' });
    }
    const leadEnd = lead[lead.length - 1]?.end ?? 0;
    return newLine({
      start: song.start * 1000,
      end: Math.max(leadEnd, ...bg.map((b) => b.end)),
      agent: song.duet ? 'v2' : 'v1',
      syllables: lead,
      bg,
    });
  });
  return newLyrics(lines);
}
