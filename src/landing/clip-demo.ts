import {
  buildClipLines,
  CLIP_TRACK_CENTER_RATIO,
  evaluateClipFrame,
  PHONE_PHASE_OFFSET_SECONDS,
  REDUCED_MOTION_PREVIEW_LINE_FACTOR,
  SECONDS_PER_LINE,
} from './clip-math';

interface MountedClip {
  render: (seconds: number, force?: boolean) => void;
}

function mountClipPhone(phone: HTMLElement, template: HTMLTemplateElement): MountedClip | null {
  const clipRoot = template.content.firstElementChild?.cloneNode(true);
  if (!(clipRoot instanceof HTMLElement)) return null;
  const list = clipRoot.querySelector<HTMLOListElement>('ol');
  if (!list) return null;

  const lineSpecs = buildClipLines();
  const mountedLines = lineSpecs.map((spec) => {
    const item = document.createElement('li');
    const words = spec.timings.map(({ word }) => {
      const span = document.createElement('span');
      span.textContent = word;
      return span;
    });
    words.forEach((span, index) => {
      item.append(span, index < words.length - 1 ? ' ' : '');
    });
    list.append(item);
    return { item, words };
  });

  phone.append(clipRoot);

  let visible = false;
  let currentLine = -1;

  const observer = new IntersectionObserver((entries) => {
    const first = entries[0];
    if (first) visible = first.isIntersecting;
  });
  observer.observe(phone);

  function render(seconds: number, force = false): void {
    if (!force && !visible) return;
    const evaluation = evaluateClipFrame(lineSpecs, seconds);
    const { lineIndex, words } = evaluation;

    if (lineIndex !== currentLine) {
      currentLine = lineIndex;
      mountedLines.forEach(({ item }, index) => {
        item.dataset.state =
          index === lineIndex ? 'active' : index < lineIndex ? 'past' : 'upcoming';
      });
      const viewport = list?.parentElement?.clientHeight ?? 0;
      const activeItem = mountedLines[lineIndex]?.item;
      if (list && activeItem) {
        const trackY = viewport * CLIP_TRACK_CENTER_RATIO - activeItem.offsetTop;
        list.style.setProperty('--track-y', `${trackY.toFixed(1)}px`);
      }
    }

    const lineWords = mountedLines[lineIndex]?.words ?? [];
    words.forEach((wordEval, index) => {
      const span = lineWords[index];
      if (!span) return;
      const formatted = wordEval.progress.toFixed(3);
      if (span.dataset.lastProgress !== formatted) {
        span.dataset.lastProgress = formatted;
        span.style.setProperty('--progress', formatted);
        span.toggleAttribute('data-singing', wordEval.singing);
      }
    });
  }

  return { render };
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
    mounted.forEach((clip) => {
      clip.render(staticSeconds, true);
    });
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
