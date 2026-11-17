import { describe, expect, it } from 'vitest';
import {
  buildClipLines,
  DEMO_LYRICS,
  evaluateClipFrame,
  LINE_WORD_TAIL_PAUSE_SECONDS,
  LOOP_SECONDS,
  SECONDS_PER_LINE,
} from './clip-math';

describe('clip-math', () => {
  it('computes loop duration and per-word timings with a tail pause on each line', () => {
    expect(LOOP_SECONDS).toBeCloseTo(DEMO_LYRICS.length * SECONDS_PER_LINE, 6);

    const lines = buildClipLines();
    expect(lines).toHaveLength(6);

    const first = lines[0];
    expect(first?.timings[0]?.start).toBe(0);
    const lastTiming = first?.timings[first.timings.length - 1];
    expect(lastTiming?.end).toBeCloseTo(SECONDS_PER_LINE - LINE_WORD_TAIL_PAUSE_SECONDS, 6);
  });

  it('selects active line and word progress across the loop and wraps seamlessly', () => {
    const lines = buildClipLines();

    const frameStart = evaluateClipFrame(lines, 0.1);
    expect(frameStart.lineIndex).toBe(0);
    expect(frameStart.words.some((w) => w.singing)).toBe(true);

    const frameTail = evaluateClipFrame(lines, SECONDS_PER_LINE - 0.1);
    expect(frameTail.lineIndex).toBe(0);
    expect(frameTail.words.every((w) => w.progress === 1 && !w.singing)).toBe(true);

    const frameLineFour = evaluateClipFrame(lines, SECONDS_PER_LINE * 4.5);
    expect(frameLineFour.lineIndex).toBe(4);

    const wrapped = evaluateClipFrame(lines, LOOP_SECONDS + 0.1);
    expect(wrapped.lineIndex).toBe(0);
    expect(wrapped.loopTime).toBeCloseTo(0.1, 6);
  });
});
