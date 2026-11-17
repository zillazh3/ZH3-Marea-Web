// One 404 page serves both languages: show the block that matches the browser, Spanish when none does.
const languages = navigator.languages.map((tag) => tag.toLowerCase().split('-')[0]);
const locale = languages.find((lang) => lang === 'es' || lang === 'en') === 'en' ? 'en' : 'es-MX';

for (const block of document.querySelectorAll<HTMLElement>('[data-locale]')) {
  block.hidden = block.dataset.locale !== locale;
}
document.documentElement.lang = locale;
