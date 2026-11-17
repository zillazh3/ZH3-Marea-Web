import {
  buildClipLines,
  CLIP_TRACK_CENTER_RATIO,
  evaluateClipFrame,
  PHONE_PHASE_OFFSET_SECONDS,
  REDUCED_MOTION_PREVIEW_LINE_FACTOR,
  SECONDS_PER_LINE,
} from './clip-math';
import {
  applySyllableEvaluation,
  mountLineSyllables,
  type MountedSyllableDom,
} from './syllable-dom';

interface MountedClip {
  render: (seconds: number, force?: boolean) => void;
  invalidateLayout: () => void;
}

function mountClipPhone(phone: HTMLElement, template: HTMLTemplateElement): MountedClip | null {
  const clipRoot = template.content.firstElementChild?.cloneNode(true);
  if (!(clipRoot instanceof HTMLElement)) return null;
  const list = clipRoot.querySelector<HTMLOListElement>('ol');
  if (!list) return null;

  const lineSpecs = buildClipLines();
  const mountedLines: { item: HTMLLIElement; syllables: MountedSyllableDom[] }[] = lineSpecs.map(
    (spec) => {
      const item = document.createElement('li');
      const syllables = mountLineSyllables(item, spec, 'clip-syllable');
      list.append(item);
      return { item, syllables };
    },
  );

  phone.append(clipRoot);

  let visible = false;
  let currentLine = -1;
  let trackOffsets: number[] | null = null;

  const invalidateLayout = (): void => {
    trackOffsets = null;
  };
  addEventListener('resize', invalidateLayout, { passive: true });
  void document.fonts.ready.then(invalidateLayout);

  const observer = new IntersectionObserver((entries) => {
    const first = entries[0];
    if (first) visible = first.isIntersecting;
  });
  observer.observe(phone);

  function render(seconds: number, force = false): void {
    if (!force && !visible) return;
    if (trackOffsets === null) {
      const viewport = list?.parentElement?.clientHeight ?? 0;
      trackOffsets = mountedLines.map(
        ({ item }) => viewport * CLIP_TRACK_CENTER_RATIO - item.offsetTop,
      );
      if (currentLine >= 0) {
        const trackY = trackOffsets[currentLine];
        if (list && trackY !== undefined) {
          list.style.setProperty('--track-y', `${trackY.toFixed(1)}px`);
        }
      }
    }
    const evaluation = evaluateClipFrame(lineSpecs, seconds);
    const { lineIndex, lineStates, lineBlurs, syllables } = evaluation;

    if (lineIndex !== currentLine) {
      currentLine = lineIndex;
      mountedLines.forEach(({ item, syllables: lineSyllables }, index) => {
        const state = lineStates[index];
        if (state) item.dataset.state = state;
        const blur = lineBlurs[index] ?? 0;
        item.style.setProperty('--line-blur', `${String(blur)}px`);
        if (index !== lineIndex) {
          for (const entry of lineSyllables) {
            if (entry.lastKey === 'idle') continue;
            entry.lastKey = 'idle';
            entry.span.dataset.state = index < lineIndex ? 'sung' : '';
            entry.span.removeAttribute('data-glowing');
            entry.span.style.setProperty('--progress', index < lineIndex ? '1' : '0');
            entry.span.style.setProperty('--lift', '0em');
            entry.span.style.setProperty('--syl-scale', '1');
            entry.span.style.setProperty('--glow', '0');
          }
        }
      });
      const trackY = trackOffsets[lineIndex];
      if (list && trackY !== undefined) {
        list.style.setProperty('--track-y', `${trackY.toFixed(1)}px`);
      }
    }

    const activeDom = mountedLines[lineIndex]?.syllables ?? [];
    syllables.forEach((sylEval, index) => {
      const dom = activeDom[index];
      if (dom) applySyllableEvaluation(dom, sylEval);
    });
  }

  return { render, invalidateLayout };
}

export function setupClipDemos(reduceMotion: boolean): void {
  const template = document.getElementById('clip-template');
  if (!(template instanceof HTMLTemplateElement)) return;

  const phones = [...document.querySelectorAll<HTMLElement>('[data-clip]')];
  const mounted = phones
    .map((phone) => mountClipPhone(phone, template))
    .filter((entry): entry is MountedClip => entry !== null);

  if (mounted.length === 0) return;

  if (reduceMotion) {
    const staticSeconds = SECONDS_PER_LINE * REDUCED_MOTION_PREVIEW_LINE_FACTOR;
    const renderStatic = (): void => {
      mounted.forEach((clip) => {
        clip.invalidateLayout();
        clip.render(staticSeconds, true);
      });
    };
    renderStatic();
    void document.fonts.ready.then(renderStatic);
    addEventListener('resize', renderStatic, { passive: true });
    return;
  }

  const startedAt = performance.now();
  const tick = (now: number): void => {
    const seconds = (now - startedAt) / 1000;
    // Offset each phone so neighboring mockups do not highlight the same line in lockstep.
    mounted.forEach((clip, index) => {
      clip.render(seconds + index * PHONE_PHASE_OFFSET_SECONDS);
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
