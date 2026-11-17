const CAROUSEL_GAP_PX = 18;

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
}
