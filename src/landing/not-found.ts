import { pickLandingLocale, storedLandingLocale } from './locale';

// One 404 page serves both languages: show the block that matches the visitor, Spanish when none does.
const locale = pickLandingLocale(storedLandingLocale(), navigator.languages);

for (const block of document.querySelectorAll<HTMLElement>('[data-locale]')) {
  block.hidden = block.dataset.locale !== locale;
}
document.documentElement.lang = locale;
