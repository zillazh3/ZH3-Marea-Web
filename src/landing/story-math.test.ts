import { describe, expect, it } from 'vitest';
import {
  buildStoryTimeline,
  computeSyllableWeight,
  evaluateStoryFrame,
  LINE_END_PAUSE,
  MIN_SYLLABLE_WEIGHT,
  parseEffectsMap,
} from './story-math';

const STORY_SAMPLE = [
  { syllables: 'Bus|ca la can|ción que no te suel|tas,' },
  { syllables: 'mar|ca los ver|sos que te due|len' },
  { syllables: 'y de|ja que la ma|re|a los le|van|te,', fx: 'marea:water' },
  { syllables: 'sí|la|ba por sí|la|ba,' },
  { syllables: 'has|ta que bri|llen.', fx: 'brillen:light' },
] as const;

describe('story-math', () => {
  it('parses syllable boundaries and maps word effects without punctuation', () => {
    const fx = parseEffectsMap('marea:water, brillen:light');
    expect(fx).toEqual({ marea: 'water', brillen: 'light' });

    const timeline = buildStoryTimeline(STORY_SAMPLE);
    expect(timeline.lineCount).toBe(5);

    const mareaSyllables = timeline.syllables.filter(
      (s) => s.lineIndex === 2 && s.effect === 'water',
    );
    expect(mareaSyllables.map((s) => s.text)).toEqual(['ma', 're', 'a']);

    const brillenSyllables = timeline.syllables.filter(
      (s) => s.lineIndex === 4 && s.effect === 'light',
    );
    expect(brillenSyllables.map((s) => s.text)).toEqual(['bri', 'llen.']);
  });

  it('weights longer syllables above the minimum floor and appends end-of-line pauses', () => {
    expect(computeSyllableWeight('y')).toBe(MIN_SYLLABLE_WEIGHT);
    expect(computeSyllableWeight('suel')).toBeCloseTo(4 / 3, 6);
    expect(computeSyllableWeight('ción')).toBeCloseTo(4 / 3, 6);

    const twoLines = buildStoryTimeline([{ syllables: 'a|b' }, { syllables: 'c' }]);
    const firstEnd = twoLines.syllables[1]?.end ?? 0;
    const secondStart = twoLines.syllables[2]?.start ?? 0;
    expect(secondStart - firstEnd).toBeCloseTo(LINE_END_PAUSE, 6);
    expect(twoLines.totalWeight).toBeCloseTo(secondStart + MIN_SYLLABLE_WEIGHT + LINE_END_PAUSE, 6);
  });

  it('evaluates syllable states, active line, sea level, hint, and closing visibility across scroll', () => {
    const timeline = buildStoryTimeline(STORY_SAMPLE);

    const atStart = evaluateStoryFrame(timeline, 0);
    expect(atStart.activeLineIndex).toBe(0);
    expect(atStart.lineStates).toEqual(['active', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(atStart.hintVisible).toBe(true);
    expect(atStart.closingVisible).toBe(false);
    expect(atStart.seaLevel).toBe(0);

    const afterHint = evaluateStoryFrame(timeline, 0.05);
    expect(afterHint.hintVisible).toBe(false);

    const mid = evaluateStoryFrame(timeline, 0.5);
    expect(mid.activeLineIndex).toBeGreaterThan(0);
    expect(mid.activeLineIndex).toBeLessThan(4);
    expect(mid.syllables.some((s) => s.state === 'sung')).toBe(true);
    expect(mid.syllables.some((s) => s.state === 'singing')).toBe(true);

    const atEnd = evaluateStoryFrame(timeline, 1);
    expect(atEnd.activeLineIndex).toBe(4);
    expect(atEnd.lineStates).toEqual(['past', 'past', 'past', 'past', 'active']);
    expect(atEnd.syllables.every((s) => s.state === 'sung' && s.progress === 1)).toBe(true);
    expect(atEnd.closingVisible).toBe(true);
    expect(atEnd.seaLevel).toBeCloseTo(0.3, 6);
  });
});
