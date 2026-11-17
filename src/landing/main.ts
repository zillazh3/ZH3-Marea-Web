import { setupClipDemos } from './clip-demo';
import { setupCurrentsCarousel } from './currents';
import { setupLyricStory } from './lyric-scroll';
import { LANDING_LOCALE_KEY, pageLocale, pickLandingLocale, storedLandingLocale } from './locale';
import { setupPageProgress } from './page-progress';
import { setupReveals } from './reveal';
import { createScrollScheduler } from './scroll-scheduler';
import { setupWordmark } from './wordmark';

// A footer language link is a manual choice: remember it so the redirect below never undoes it.
document.querySelector('[data-locale-choice]')?.addEventListener('click', (event) => {
  const choice = (event.currentTarget as HTMLElement).dataset.localeChoice;
  try {
    if (choice) localStorage.setItem(LANDING_LOCALE_KEY, choice);
  } catch {
    // Blocked storage: the choice just won't outlive this visit.
  }
});

// Crawlers must keep seeing both pages as served, so only people get redirected to their language.
const isCrawler = /bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent);
const wanted = pickLandingLocale(storedLandingLocale(), navigator.languages);
if (!isCrawler && wanted !== pageLocale()) {
  location.replace((wanted === 'en' ? '/en/' : '/') + location.search + location.hash);
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

setupClipDemos(reduceMotion);
setupCurrentsCarousel(reduceMotion);
setupReveals(reduceMotion);

const updateWordmark = setupWordmark(reduceMotion);
const updateStory = setupLyricStory(reduceMotion);
const updatePageProgress = setupPageProgress();

const requestScrollUpdate = createScrollScheduler([
  updateWordmark,
  updateStory,
  updatePageProgress,
]);

void document.fonts.ready.then(requestScrollUpdate);
requestScrollUpdate();
