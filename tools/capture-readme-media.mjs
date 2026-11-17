// Generates the README media in docs/screenshots/ from the production build.
//
//   npm run build && npx wrangler dev --ip 127.0.0.1 --port 8787   (or: npm run preview:static)
//   node tools/capture-readme-media.mjs [baseUrl]
//
// Needs `ffmpeg` (with libwebp) on PATH, only to turn the recorded scroll into an animated WebP.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
const OUT = resolve('docs/screenshots');
const SIZE = { width: 1440, height: 900 };
const MAX_STILL = 400 * 1024;
const MAX_ANIMATION = 3 * 1024 * 1024;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const failures = [];

function report(name, bytes, limit) {
  const kb = (bytes / 1024).toFixed(0);
  console.log(`${name}: ${kb} KB (limit ${(limit / 1024).toFixed(0)} KB)`);
  if (bytes > limit) failures.push(`${name} is ${kb} KB`);
}

/** Saves a JPEG, lowering the quality until it fits the budget. */
async function saveStill(page, file) {
  let buffer;
  for (const quality of [88, 82, 76, 70, 62, 54]) {
    buffer = await page.screenshot({ type: 'jpeg', quality });
    if (buffer.byteLength <= MAX_STILL) break;
  }
  writeFileSync(join(OUT, file), buffer);
  report(file, buffer.byteLength, MAX_STILL);
}

async function openPage(context, path) {
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// Landing hero and Editor.
{
  const context = await browser.newContext({ viewport: SIZE, locale: 'en' });

  const landing = await openPage(context, '/en/');
  await landing.waitForTimeout(2000);
  await saveStill(landing, 'landing.jpg');
  await landing.close();

  const app = await openPage(context, '/app/');
  await app.getByRole('button', { name: 'Try the demo song' }).first().click();
  await app.waitForURL(/\/app\/#editor$/);
  const play = app.getByRole('main').getByRole('button', { name: 'Play' });
  await play.waitFor({ state: 'visible', timeout: 30_000 });
  await app.waitForFunction(
    () => !document.querySelector('[aria-label="Play"]')?.hasAttribute('disabled'),
  );
  await play.click();
  await app.waitForTimeout(3500);
  await saveStill(app, 'editor.jpg');
  await context.close();
}

// Scroll story as a looping animated WebP.
{
  const tmp = mkdtempSync(join(tmpdir(), 'zh3marea-story-'));
  const context = await browser.newContext({
    viewport: SIZE,
    locale: 'en',
    recordVideo: { dir: tmp, size: { width: 960, height: 600 } },
  });
  const page = await openPage(context, '/en/');
  await page.evaluate(
    (ms) =>
      new Promise((done) => {
        const section = document.querySelector('[data-story]');
        const top = section.getBoundingClientRect().top + window.scrollY;
        const span = Math.max(0, section.offsetHeight - window.innerHeight);
        const from = top + span * 0.02;
        const to = top + span * 0.98;
        window.scrollTo({ top: from, behavior: 'instant' });
        const start = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms);
          window.scrollTo({ top: from + (to - from) * t, behavior: 'instant' });
          if (t < 1) requestAnimationFrame(step);
          else done();
        };
        setTimeout(() => requestAnimationFrame(step), 800);
      }),
    9000,
  );
  await page.waitForTimeout(600);
  await context.close(); // flushes the video

  const video = readdirSync(tmp).find((f) => f.endsWith('.webm'));
  const target = join(OUT, 'story.webp');
  const run = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      '0.8',
      '-i',
      join(tmp, video),
      '-vf',
      'fps=12,scale=720:-1:flags=lanczos',
      '-c:v',
      'libwebp_anim',
      '-loop',
      '0',
      '-quality',
      '55',
      '-compression_level',
      '6',
      target,
    ],
    { encoding: 'utf8' },
  );
  if (run.status !== 0) {
    console.error(run.stderr);
    failures.push('ffmpeg could not write story.webp');
  } else {
    report('story.webp', statSync(target).size, MAX_ANIMATION);
  }
  rmSync(tmp, { recursive: true, force: true });
}

await browser.close();
if (failures.length > 0) {
  console.error(`Over budget or failed: ${failures.join('; ')}`);
  process.exit(1);
}
