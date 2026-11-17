import { clamp } from './story-math';

const WORDMARK_VIEWBOX_HEIGHT = 250;
const WORDMARK_OVERFILL_PX = 12;
const WORDMARK_INTRO_DURATION_MS = 1800;
const WORDMARK_INTRO_SHARE = 0.52;
const WORDMARK_SCROLL_SHARE = 0.48;
const WORDMARK_HERO_SCROLL_SPAN_RATIO = 0.8;

export function setupWordmark(reduceMotion: boolean): () => void {
  const hero = document.querySelector<HTMLElement>('.hero');
  const wordmarkSea = document.querySelector<SVGGElement>('[data-wordmark-sea]');
  if (!hero || !wordmarkSea) return () => undefined;

  let introProgress = reduceMotion ? 1 : 0;

  function update(): void {
    if (!hero || !wordmarkSea) return;
    const bounds = hero.getBoundingClientRect();
    const scrollRange = bounds.height * WORDMARK_HERO_SCROLL_SPAN_RATIO;
    const scrolled = scrollRange > 0 ? clamp(-bounds.top / scrollRange) : 0;
    const level = clamp(introProgress * WORDMARK_INTRO_SHARE + scrolled * WORDMARK_SCROLL_SHARE);
    const offsetY =
      WORDMARK_VIEWBOX_HEIGHT - level * (WORDMARK_VIEWBOX_HEIGHT + WORDMARK_OVERFILL_PX);
    wordmarkSea.style.setProperty('--sea-y', `${offsetY.toFixed(1)}px`);
  }

  function playIntro(now: number, startedAt = now): void {
    const t = clamp((now - startedAt) / WORDMARK_INTRO_DURATION_MS);
    introProgress = 1 - (1 - t) ** 3;
    update();
    if (t < 1) {
      requestAnimationFrame((next) => {
        playIntro(next, startedAt);
      });
    }
  }

  if (!reduceMotion) {
    requestAnimationFrame((now) => {
      playIntro(now);
    });
  } else {
    update();
  }

  return update;
}
