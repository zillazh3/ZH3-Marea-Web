import {
  buildClipLineSpec,
  CURRENT_CARD_PHASE_OFFSET_SECONDS,
  CURRENT_DEMO_LINE_INPUT,
  evaluateWrappedLineSyllables,
  SECONDS_PER_LINE,
} from './clip-math';
import { applySyllableEvaluation, mountLineSyllables } from './syllable-dom';

const CAROUSEL_GAP_PX = 18;
const STATIC_COMPLETED_OFFSET_SECONDS = 0.01;

export function setupCurrentsCarousel(reduceMotion: boolean): void {
  const list = document.querySelector<HTMLUListElement>('[data-currents]');
  if (!list) return;

  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-scroll-currents]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const firstItem = list.firstElementChild;
      if (!(firstItem instanceof HTMLElement)) return;
      const step = firstItem.getBoundingClientRect().width + CAROUSEL_GAP_PX;
      const direction = Number(button.dataset.scrollCurrents ?? '0');
      list.scrollBy({
        left: step * direction,
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    });
  });

  const activeParagraphs = [
    ...list.querySelectorAll<HTMLParagraphElement>('figure p:nth-child(2)'),
  ];
  if (activeParagraphs.length === 0) return;

  const lineSpec = buildClipLineSpec(CURRENT_DEMO_LINE_INPUT, 0);
  const mountedCards = activeParagraphs.map((paragraph) =>
    mountLineSyllables(paragraph, lineSpec, 'current-syllable'),
  );

  const renderAt = (seconds: number): void => {
    mountedCards.forEach((cardSyllables, cardIndex) => {
      const evaluations = evaluateWrappedLineSyllables(
        lineSpec,
        seconds + cardIndex * CURRENT_CARD_PHASE_OFFSET_SECONDS,
      );
      evaluations.forEach((evaluation, syllableIndex) => {
        const dom = cardSyllables[syllableIndex];
        if (dom) applySyllableEvaluation(dom, evaluation, '--syl-glow');
      });
    });
  };

  if (reduceMotion) {
    renderAt(SECONDS_PER_LINE - STATIC_COMPLETED_OFFSET_SECONDS);
    return;
  }

  let visible = false;
  let frameId = 0;
  const startedAt = performance.now();

  const tick = (now: number): void => {
    if (!visible) {
      frameId = 0;
      return;
    }
    renderAt((now - startedAt) / 1000);
    frameId = requestAnimationFrame(tick);
  };

  // Defer Corrientes animation frames until the carousel enters the viewport so load TBT stays zero.
  const observer = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? false;
    if (visible && frameId === 0) frameId = requestAnimationFrame(tick);
  });
  observer.observe(list);
}
