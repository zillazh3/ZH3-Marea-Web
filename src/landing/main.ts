import { setupClipDemos } from './clip-demo';
import { setupCurrentsCarousel } from './currents';
import { setupLyricStory } from './lyric-scroll';
import { setupPageProgress } from './page-progress';
import { setupReveals } from './reveal';
import { createScrollScheduler } from './scroll-scheduler';
import { setupWordmark } from './wordmark';

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
