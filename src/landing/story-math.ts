export const LINE_END_PAUSE = 1.4;
export const MIN_SYLLABLE_WEIGHT = 0.7;
export const LETTERS_PER_WEIGHT_UNIT = 3;
export const STORY_HINT_FADE_THRESHOLD = 0.04;
export const STORY_CLOSING_SHOW_THRESHOLD = 0.93;
export const STORY_SEA_MAX_LEVEL = 0.3;
export const STORY_TRACK_CENTER_RATIO = 0.34;

export type SyllableState = 'sung' | 'singing' | '';
export type LineState = 'active' | 'past' | 'upcoming';

export interface StoryLineInput {
  readonly syllables: string;
  readonly fx?: string | undefined;
}

export interface StorySyllableSpec {
  readonly lineIndex: number;
  readonly wordIndex: number;
  readonly text: string;
  readonly effect: string | null;
  readonly start: number;
  readonly end: number;
}

export interface StoryWordSpec {
  readonly lineIndex: number;
  readonly wordIndex: number;
  readonly syllableIndices: readonly number[];
}

export interface StoryTimeline {
  readonly lineCount: number;
  readonly wordsByLine: readonly (readonly StoryWordSpec[])[];
  readonly syllables: readonly StorySyllableSpec[];
  readonly totalWeight: number;
}

export interface EvaluatedSyllable {
  readonly progress: number;
  readonly state: SyllableState;
}

export interface StoryEvaluation {
  readonly position: number;
  readonly activeLineIndex: number;
  readonly lineStates: readonly LineState[];
  readonly syllables: readonly EvaluatedSyllable[];
  readonly seaLevel: number;
  readonly hintVisible: boolean;
  readonly closingVisible: boolean;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function parseEffectsMap(rawFx: string | undefined): Record<string, string> {
  if (!rawFx) return {};
  const map: Record<string, string> = {};
  for (const pair of rawFx.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex <= 0) continue;
    const word = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const effect = trimmed.slice(colonIndex + 1).trim();
    if (word && effect) map[word] = effect;
  }
  return map;
}

export function normalizeWordKey(wordWithPipes: string): string {
  return wordWithPipes
    .replaceAll('|', '')
    .replace(/[^\p{L}]/gu, '')
    .toLowerCase();
}

export function computeSyllableWeight(syllableText: string): number {
  const lettersCount = syllableText.replace(/[^\p{L}]/gu, '').length;
  return Math.max(MIN_SYLLABLE_WEIGHT, lettersCount / LETTERS_PER_WEIGHT_UNIT);
}

export function buildStoryTimeline(lines: readonly StoryLineInput[]): StoryTimeline {
  const syllables: StorySyllableSpec[] = [];
  const wordsByLine: StoryWordSpec[][] = [];
  let cursor = 0;

  lines.forEach((line, lineIndex) => {
    const effects = parseEffectsMap(line.fx);
    const lineWords: StoryWordSpec[] = [];
    const words = line.syllables.split(' ').filter(Boolean);

    words.forEach((word, wordIndex) => {
      const plainWord = normalizeWordKey(word);
      const effect = effects[plainWord] ?? null;
      const syllableIndices: number[] = [];

      for (const part of word.split('|')) {
        const weight = computeSyllableWeight(part);
        const start = cursor;
        const end = cursor + weight;
        cursor = end;
        syllableIndices.push(syllables.length);
        syllables.push({
          lineIndex,
          wordIndex,
          text: part,
          effect,
          start,
          end,
        });
      }

      lineWords.push({ lineIndex, wordIndex, syllableIndices });
    });

    wordsByLine.push(lineWords);
    cursor += LINE_END_PAUSE;
  });

  return {
    lineCount: lines.length,
    wordsByLine,
    syllables,
    totalWeight: cursor,
  };
}

export function evaluateStoryFrame(timeline: StoryTimeline, rawScrolled: number): StoryEvaluation {
  const scrolled = clamp(rawScrolled);
  const position = scrolled * timeline.totalWeight;

  const evaluatedSyllables: EvaluatedSyllable[] = timeline.syllables.map((syllable) => {
    const span = syllable.end - syllable.start;
    const progress = span > 0 ? clamp((position - syllable.start) / span) : 1;
    const state: SyllableState = progress === 1 ? 'sung' : progress > 0 ? 'singing' : '';
    return { progress, state };
  });

  let activeLineIndex = 0;
  for (let i = timeline.syllables.length - 1; i >= 0; i -= 1) {
    const syllable = timeline.syllables[i];
    if (syllable && syllable.start <= position) {
      activeLineIndex = syllable.lineIndex;
      break;
    }
  }

  const lineStates: LineState[] = Array.from({ length: timeline.lineCount }, (_, index) =>
    index === activeLineIndex ? 'active' : index < activeLineIndex ? 'past' : 'upcoming',
  );

  return {
    position,
    activeLineIndex,
    lineStates,
    syllables: evaluatedSyllables,
    seaLevel: scrolled * STORY_SEA_MAX_LEVEL,
    hintVisible: scrolled <= STORY_HINT_FADE_THRESHOLD,
    closingVisible: scrolled > STORY_CLOSING_SHOW_THRESHOLD,
  };
}
