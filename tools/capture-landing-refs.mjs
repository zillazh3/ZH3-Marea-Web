import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const OUT_DIR = resolve('docs/reference/mockup/screenshots/landing');
mkdirSync(OUT_DIR, { recursive: true });

const mockupUrl = pathToFileURL(resolve('docs/reference/mockup/zh3marea-landing.html')).href;
const browser = await chromium.launch();

async function captureViewport(name, width, height, points) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto(mockupUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2000);

  for (const point of points) {
    await page.evaluate(({ selector, ratio }) => {
      if (!selector) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        return;
      }
      const el = document.querySelector(selector);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const maxOffset = Math.max(0, el.scrollHeight - window.innerHeight);
      window.scrollTo({ top: top + maxOffset * ratio, behavior: 'instant' });
    }, point);
    await page.waitForTimeout(350);
    await page.screenshot({ path: resolve(OUT_DIR, `${name}-${point.label}.png`) });
  }
  await context.close();
}

await captureViewport('desktop', 1440, 900, [
  { label: '01-hero', selector: null, ratio: 0 },
  { label: '02-story-start', selector: '#como-se-ve', ratio: 0.15 },
  { label: '03-story-mid', selector: '#como-se-ve', ratio: 0.55 },
  { label: '04-story-end', selector: '#como-se-ve', ratio: 0.96 },
  { label: '05-platforms', selector: '#donde', ratio: 0 },
  { label: '06-currents', selector: '#corrientes', ratio: 0 },
  { label: '07-closing', selector: '#empezar', ratio: 0 },
]);

await captureViewport('mobile', 390, 844, [
  { label: '01-hero', selector: null, ratio: 0 },
  { label: '02-story-mid', selector: '#como-se-ve', ratio: 0.55 },
  { label: '03-platforms', selector: '#donde', ratio: 0 },
  { label: '04-currents', selector: '#corrientes', ratio: 0 },
  { label: '05-closing', selector: '#empezar', ratio: 0 },
]);

await browser.close();
console.log(`Saved landing reference screenshots to ${OUT_DIR}`);
