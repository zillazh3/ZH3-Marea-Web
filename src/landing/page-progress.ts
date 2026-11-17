import { clamp } from './story-math';

const ACTIVE_SECTION_VIEWPORT_RATIO = 0.45;

export function setupPageProgress(): () => void {
  const progressLinks = [...document.querySelectorAll<HTMLAnchorElement>('.page-progress a')];
  if (progressLinks.length === 0) return () => undefined;

  const targets = progressLinks.map((link) =>
    link.hash ? document.querySelector<HTMLElement>(link.hash) : null,
  );

  return function update(): void {
    const scrollable = document.documentElement.scrollHeight - innerHeight;
    const ratio = scrollable > 0 ? clamp(scrollY / scrollable) : 0;
    document.documentElement.style.setProperty('--page-progress', ratio.toFixed(4));

    const threshold = innerHeight * ACTIVE_SECTION_VIEWPORT_RATIO;
    let currentIndex = -1;
    for (let i = targets.length - 1; i >= 0; i -= 1) {
      const target = targets[i];
      if (target && target.getBoundingClientRect().top < threshold) {
        currentIndex = i;
        break;
      }
    }

    const active = Math.max(0, currentIndex);
    progressLinks.forEach((link, index) => {
      link.toggleAttribute('aria-current', index === active);
    });
  };
}
