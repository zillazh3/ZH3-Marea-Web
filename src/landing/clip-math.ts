import { clamp } from './story-math';

export const DEMO_LYRICS: readonly string[] = [
  'Bajé a la orilla sin saber nadar',
  'y el agua me llamó por mi nombre',
  'cada ola trae algo que perdí',
  'y se lo lleva antes de entenderlo',
  'Si la marea sube, déjala subir',
  'que la luz se quede en el fondo del mar',
];

export const SECONDS_PER_LINE = 3.2;
export const LINE_WORD_TAIL_PAUSE_SECONDS = 0.3;
export const PHONE_PHASE_OFFSET_SECONDS = 4.1;
export const REDUCED_MOTION_PREVIEW_LINE_FACTOR = 4.5;
export const CLIP_TRACK_CENTER_RATIO = 0.3;
export const LOOP_SECONDS = DEMO_LYRICS.length * SECONDS_PER_LINE;

export interface WordTiming {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

export interface ClipLineSpec {
  readonly text: string;
  readonly timings: readonly WordTiming[];
}

export interface ClipWordEvaluation {
  readonly progress: number;
  readonly singing: boolean;
}

export interface ClipFrameEvaluation {
  readonly loopTime: number;
  readonly lineIndex: number;
  readonly words: readonly ClipWordEvaluation[];
}

export function buildWordTimings(line: string, lineIndex: number): readonly WordTiming[] {
  const words = line.split(' ').filter(Boolean);
  const totalLetters = words.reduce((sum, word) => sum + word.length + 1, 0);
  const activeSpan = SECONDS_PER_LINE - LINE_WORD_TAIL_PAUSE_SECONDS;
  let cursor = lineIndex * SECONDS_PER_LINE;

  return words.map((word) => {
    const duration = totalLetters > 0 ? (activeSpan * (word.length + 1)) / totalLetters : 0;
    const timing: WordTiming = { word, start: cursor, end: cursor + duration };
    cursor += duration;
    return timing;
  });
}

export function buildClipLines(lines: readonly string[] = DEMO_LYRICS): readonly ClipLineSpec[] {
  return lines.map((text, index) => ({
    text,
    timings: buildWordTimings(text, index),
  }));
}

export function evaluateClipFrame(
  lines: readonly ClipLineSpec[],
  seconds: number,
): ClipFrameEvaluation {
  const loopSeconds = lines.length * SECONDS_PER_LINE;
  const wrapped = loopSeconds > 0 ? ((seconds % loopSeconds) + loopSeconds) % loopSeconds : 0;
  const lineIndex = Math.min(lines.length - 1, Math.floor(wrapped / SECONDS_PER_LINE));
  const activeLine = lines[lineIndex];

  const words: ClipWordEvaluation[] = (activeLine?.timings ?? []).map(({ start, end }) => {
    const span = end - start;
    const progress = span > 0 ? clamp((wrapped - start) / span) : 1;
    return {
      progress,
      singing: progress > 0 && progress < 1,
    };
  });

  return {
    loopTime: wrapped,
    lineIndex,
    words,
  };
}
