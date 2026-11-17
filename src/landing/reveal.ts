const REVEAL_ROOT_MARGIN = '0px 0px -12% 0px';

export function setupReveals(reduceMotion: boolean): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (elements.length === 0) return;

  if (reduceMotion) {
    elements.forEach((element) => {
      element.toggleAttribute('data-revealed', true);
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.toggleAttribute('data-revealed', true);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: REVEAL_ROOT_MARGIN },
  );

  elements.forEach((element) => {
    observer.observe(element);
  });
}
