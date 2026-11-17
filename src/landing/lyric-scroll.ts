import {
  buildStoryTimeline,
  clamp,
  evaluateStoryFrame,
  STORY_TRACK_CENTER_RATIO,
} from './story-math';

const DEFAULT_VERSE_TEMPLATE = 'Verso {current} de {total}';

function formatVerseCounter(template: string, current: number, total: number): string {
  return template.replace('{current}', String(current)).replace('{total}', String(total));
}

export function setupLyricStory(reduceMotion: boolean): () => void {
  const section = document.querySelector<HTMLElement>('[data-story]');
  if (!section) return () => undefined;

  const lineElements = [...section.querySelectorAll<HTMLElement>('[data-syllables]')];
  const track = section.querySelector<HTMLElement>('.lyrics > div');
  const hint = section.querySelector<HTMLElement>('[data-story-hint]');
  const counter = section.querySelector<HTMLElement>('[data-story-count]');
  const closing = section.querySelector<HTMLElement>('.story-closing');
  const sea = section.querySelector<HTMLElement>('.sea');
  if (!track || !hint || !counter || !closing || !sea || lineElements.length === 0) {
    return () => undefined;
  }

  const verseTemplate = counter.dataset.verseTemplate ?? DEFAULT_VERSE_TEMPLATE;
  const timeline = buildStoryTimeline(
    lineElements.map((line) => ({
      syllables: line.dataset.syllables ?? '',
      fx: line.dataset.fx,
    })),
  );

  const syllableSpans: HTMLSpanElement[] = [];
  const lastKeys: string[] = [];

  lineElements.forEach((lineElement, lineIndex) => {
    lineElement.textContent = '';
    const lineWords = timeline.wordsByLine[lineIndex] ?? [];
    lineWords.forEach((wordSpec, wordPos) => {
      const wordElement = document.createElement('b');
      for (const syllableIndex of wordSpec.syllableIndices) {
        const spec = timeline.syllables[syllableIndex];
        if (!spec) continue;
        const span = document.createElement('span');
        span.className = 'syllable';
        span.textContent = spec.text;
        if (spec.effect) span.dataset.fx = spec.effect;
        wordElement.append(span);
        syllableSpans.push(span);
        lastKeys.push('');
      }
      lineElement.append(wordElement, wordPos < lineWords.length - 1 ? ' ' : '');
    });
  });

  if (reduceMotion) return () => undefined;

  let activeLine = -1;
  let trackOffsets: number[] | null = null;
  const invalidateLayout = (): void => {
    trackOffsets = null;
  };
  addEventListener('resize', invalidateLayout, { passive: true });
  void document.fonts.ready.then(invalidateLayout);

  return function update(): void {
    const bounds = section.getBoundingClientRect();
    if (trackOffsets === null) {
      const viewportHeight = track.parentElement?.clientHeight ?? 0;
      trackOffsets = lineElements.map(
        (element) => viewportHeight * STORY_TRACK_CENTER_RATIO - element.offsetTop,
      );
    }
    const scrollableHeight = bounds.height - innerHeight;
    const scrolled = scrollableHeight > 0 ? clamp(-bounds.top / scrollableHeight) : 0;
    const evaluation = evaluateStoryFrame(timeline, scrolled);

    evaluation.syllables.forEach((syllableEval, index) => {
      const p = syllableEval.progress.toFixed(3);
      const lift = `${syllableEval.liftEm.toFixed(3)}em`;
      const scale = syllableEval.scale.toFixed(3);
      const glow = syllableEval.glow.toFixed(2);
      const key = `${p}|${lift}|${scale}|${glow}|${syllableEval.state}`;
      if (lastKeys[index] === key) return;
      lastKeys[index] = key;

      const span = syllableSpans[index];
      if (!span) return;
      span.style.setProperty('--progress', p);
      span.style.setProperty('--lift', lift);
      span.style.setProperty('--syl-scale', scale);
      span.style.setProperty('--glow', glow);
      span.dataset.state = syllableEval.state;
      span.toggleAttribute('data-glowing', syllableEval.glow > 0.01);
    });

    if (evaluation.activeLineIndex !== activeLine) {
      activeLine = evaluation.activeLineIndex;
      lineElements.forEach((element, index) => {
        const state = evaluation.lineStates[index];
        if (state) element.dataset.state = state;
        const blur = evaluation.lineBlurs[index] ?? 0;
        element.style.setProperty('--line-blur', `${String(blur)}px`);
      });
      const trackY = trackOffsets[activeLine];
      if (trackY !== undefined) {
        track.style.setProperty('--track-y', `${trackY.toFixed(1)}px`);
      }
      counter.textContent = formatVerseCounter(verseTemplate, activeLine + 1, lineElements.length);
    }

    sea.style.setProperty('--level', evaluation.seaLevel.toFixed(4));
    hint.style.setProperty('--hint-opacity', evaluation.hintVisible ? '1' : '0');
    closing.toggleAttribute('data-visible', evaluation.closingVisible);
  };
}
