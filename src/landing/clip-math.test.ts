import { describe, expect, it } from 'vitest';
import {
  buildClipLines,
  buildClipLineSpec,
  CURRENT_DEMO_LINE_INPUT,
  DEMO_CLIP_INPUTS,
  DEMO_LYRICS,
  evaluateClipFrame,
  evaluateWrappedLineSyllables,
  LINE_WORD_TAIL_PAUSE_SECONDS,
  LOOP_SECONDS,
  SECONDS_PER_LINE,
} from './clip-math';

describe('clip-math', () => {
  it('computes loop duration and syllable timings with a tail pause and wordfx markers', () => {
    expect(DEMO_LYRICS).toHaveLength(6);
    expect(LOOP_SECONDS).toBeCloseTo(DEMO_CLIP_INPUTS.length * SECONDS_PER_LINE, 6);

    const lines = buildClipLines();
    expect(lines).toHaveLength(6);

    const first = lines[0];
    expect(first?.syllables[0]?.start).toBe(0);
    const lastSyllable = first?.syllables[first.syllables.length - 1];
    expect(lastSyllable?.end).toBeCloseTo(SECONDS_PER_LINE - LINE_WORD_TAIL_PAUSE_SECONDS, 6);

    const waterLine = lines[4];
    expect(waterLine?.syllables.filter((s) => s.effect === 'water').map((s) => s.text)).toEqual([
      'ma',
      're',
      'a',
    ]);
  });

  it('evaluates syllable wipe, lift/scale motion, smooth glow, and distance blur across the loop', () => {
    const lines = buildClipLines();

    const frameStart = evaluateClipFrame(lines, 0.15);
    expect(frameStart.lineIndex).toBe(0);
    expect(frameStart.lineStates).toEqual([
      'active',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(frameStart.lineBlurs[0]).toBe(0);
    expect(frameStart.lineBlurs[1]).toBeGreaterThan(0);
    expect(frameStart.lineBlurs[5]).toBeGreaterThan(frameStart.lineBlurs[1] ?? 0);
    expect(frameStart.syllables.some((s) => s.state === 'singing')).toBe(true);
    expect(
      frameStart.syllables.some(
        (s) => s.state === 'singing' && s.liftEm < 0 && s.scale > 1 && s.glow > 0,
      ),
    ).toBe(true);

    const frameTail = evaluateClipFrame(lines, SECONDS_PER_LINE - 0.01);
    expect(frameTail.lineIndex).toBe(0);
    expect(frameTail.syllables.every((s) => s.state === 'sung' && s.progress === 1)).toBe(true);

    const frameLineFour = evaluateClipFrame(lines, SECONDS_PER_LINE * 4.5);
    expect(frameLineFour.lineIndex).toBe(4);
    expect(frameLineFour.lineStates[0]).toBe('past');
    expect(frameLineFour.lineStates[4]).toBe('active');
    expect(frameLineFour.lineStates[5]).toBe('upcoming');

    const wrapped = evaluateClipFrame(lines, LOOP_SECONDS + 0.15);
    expect(wrapped.lineIndex).toBe(0);
    expect(wrapped.loopTime).toBeCloseTo(0.15, 6);
  });

  it('fills wrapped Corrientes line strictly syllable-by-syllable without filling later lines early', () => {
    const spec = buildClipLineSpec(CURRENT_DEMO_LINE_INPUT, 0);
    // Midway through "ma|re|a" (~0.8s into the line), final word "su|bir" must still be at 0.
    const midLine = evaluateWrappedLineSyllables(spec, 0.85);
    const reIndex = spec.syllables.findIndex((s) => s.text === 're');
    const subirIndices = spec.syllables
      .map((s, idx) => (s.text === 'su' || s.text === 'bir' ? idx : -1))
      .filter((idx) => idx >= 0);
    const lastSubirIndex = subirIndices[subirIndices.length - 1] ?? spec.syllables.length - 1;

    expect(midLine[reIndex]?.progress ?? 0).toBeGreaterThan(0);
    expect(midLine[lastSubirIndex]?.progress).toBe(0);
    expect(midLine[lastSubirIndex]?.state).toBe('');

    const wrapped = evaluateWrappedLineSyllables(spec, SECONDS_PER_LINE + 0.85);
    expect(wrapped).toEqual(midLine);
  });
});
