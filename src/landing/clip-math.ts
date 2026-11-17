import { clamp, lineBlurPx, sampleSyllableMotion } from './curves';
import {
  computeSyllableWeight,
  normalizeWordKey,
  parseEffectsMap,
  type LineState,
  type StoryLineInput,
  type SyllableState,
} from './story-math';

export const DEMO_CLIP_INPUTS: readonly StoryLineInput[] = [
  { syllables: 'Ba|jé a la o|ri|lla sin sa|ber na|dar' },
  { syllables: 'y el a|gua me lla|mó por mi nom|bre', fx: 'agua:water' },
  { syllables: 'ca|da o|la tra|e al|go que per|dí', fx: 'ola:water' },
  { syllables: 'y se lo lle|va an|tes de en|ten|der|lo' },
  { syllables: 'Si la ma|re|a su|be, dé|ja|la su|bir', fx: 'marea:water' },
  { syllables: 'que la luz se que|de en el fon|do del mar', fx: 'luz:light, mar:water' },
];

export const CURRENT_DEMO_LINE_INPUT: StoryLineInput = {
  syllables: 'Si la ma|re|a su|be, dé|ja|la su|bir',
  fx: 'marea:water',
};

export const DEMO_LYRICS: readonly string[] = DEMO_CLIP_INPUTS.map((line) =>
  line.syllables.replaceAll('|', ''),
);

export const SECONDS_PER_LINE = 3.2;
export const LINE_WORD_TAIL_PAUSE_SECONDS = 0.3;
export const CLIP_SYLLABLE_GLOW_TAIL_SECONDS = 0.36;
export const PHONE_PHASE_OFFSET_SECONDS = 4.1;
export const CURRENT_CARD_PHASE_OFFSET_SECONDS = 0.8;
export const REDUCED_MOTION_PREVIEW_LINE_FACTOR = 4.5;
export const CLIP_TRACK_CENTER_RATIO = 0.3;
export const LOOP_SECONDS = DEMO_CLIP_INPUTS.length * SECONDS_PER_LINE;

export interface ClipSyllableTiming {
  readonly text: string;
  readonly effect: string | null;
  readonly start: number;
  readonly end: number;
  readonly sustain: number;
}

export interface ClipWordSpec {
  readonly syllableIndices: readonly number[];
}

export interface ClipLineSpec {
  readonly text: string;
  readonly words: readonly ClipWordSpec[];
  readonly syllables: readonly ClipSyllableTiming[];
}

export interface ClipSyllableEvaluation {
  readonly progress: number;
  readonly liftEm: number;
  readonly scale: number;
  readonly glow: number;
  readonly state: SyllableState;
}

export interface ClipFrameEvaluation {
  readonly loopTime: number;
  readonly lineIndex: number;
  readonly lineStates: readonly LineState[];
  readonly lineBlurs: readonly number[];
  readonly syllables: readonly ClipSyllableEvaluation[];
}

export function buildClipLineSpec(input: StoryLineInput, lineIndex: number): ClipLineSpec {
  const effects = parseEffectsMap(input.fx);
  const rawWords = input.syllables.split(' ').filter(Boolean);
  const parsedSyllables: { text: string; effect: string | null; weight: number }[] = [];
  const words: ClipWordSpec[] = [];

  for (const rawWord of rawWords) {
    const plain = normalizeWordKey(rawWord);
    const effect = effects[plain] ?? null;
    const syllableIndices: number[] = [];
    for (const part of rawWord.split('|')) {
      const weight = computeSyllableWeight(part);
      syllableIndices.push(parsedSyllables.length);
      parsedSyllables.push({ text: part, effect, weight });
    }
    words.push({ syllableIndices });
  }

  const totalWeight = parsedSyllables.reduce((sum, s) => sum + s.weight, 0);
  const activeSpan = SECONDS_PER_LINE - LINE_WORD_TAIL_PAUSE_SECONDS;
  let cursor = lineIndex * SECONDS_PER_LINE;

  const syllables: ClipSyllableTiming[] = parsedSyllables.map((s) => {
    const duration = totalWeight > 0 ? (activeSpan * s.weight) / totalWeight : 0;
    const start = cursor;
    const end = cursor + duration;
    cursor = end;
    return {
      text: s.text,
      effect: s.effect,
      start,
      end,
      sustain: clamp((s.weight - 1.0) / 1.4),
    };
  });

  return {
    text: input.syllables.replaceAll('|', ''),
    words,
    syllables,
  };
}

export function buildClipLines(
  inputs: readonly StoryLineInput[] = DEMO_CLIP_INPUTS,
): readonly ClipLineSpec[] {
  return inputs.map((input, index) => buildClipLineSpec(input, index));
}

export function evaluateLineSyllables(
  line: ClipLineSpec,
  timeSeconds: number,
): readonly ClipSyllableEvaluation[] {
  return line.syllables.map(({ start, end, sustain }) => {
    const span = end - start;
    const rawProgress = span > 0 ? clamp((timeSeconds - start) / span) : 1;
    const tailProgress =
      timeSeconds > end ? clamp((timeSeconds - end) / CLIP_SYLLABLE_GLOW_TAIL_SECONDS) : 0;
    const motion = sampleSyllableMotion(rawProgress, tailProgress, sustain);
    const state: SyllableState = rawProgress === 1 ? 'sung' : rawProgress > 0 ? 'singing' : '';
    return {
      progress: motion.wipe,
      liftEm: motion.liftEm,
      scale: motion.scale,
      glow: motion.glow,
      state,
    };
  });
}

export function evaluateWrappedLineSyllables(
  line: ClipLineSpec,
  seconds: number,
): readonly ClipSyllableEvaluation[] {
  const wrapped = ((seconds % SECONDS_PER_LINE) + SECONDS_PER_LINE) % SECONDS_PER_LINE;
  return evaluateLineSyllables(line, wrapped);
}

export function evaluateClipFrame(
  lines: readonly ClipLineSpec[],
  seconds: number,
): ClipFrameEvaluation {
  const loopSeconds = lines.length * SECONDS_PER_LINE;
  const wrapped = loopSeconds > 0 ? ((seconds % loopSeconds) + loopSeconds) % loopSeconds : 0;
  const lineIndex = Math.min(lines.length - 1, Math.floor(wrapped / SECONDS_PER_LINE));
  const activeLine = lines[lineIndex];

  const syllables: readonly ClipSyllableEvaluation[] = activeLine
    ? evaluateLineSyllables(activeLine, wrapped)
    : [];

  const lineStates: LineState[] = Array.from({ length: lines.length }, (_, index) =>
    index === lineIndex ? 'active' : index < lineIndex ? 'past' : 'upcoming',
  );
  const lineBlurs = Array.from({ length: lines.length }, (_, index) =>
    lineBlurPx(index, lineIndex, 0.85, 2.6),
  );

  return {
    loopTime: wrapped,
    lineIndex,
    lineStates,
    lineBlurs,
    syllables,
  };
}
