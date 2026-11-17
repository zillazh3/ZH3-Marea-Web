import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

const DIST_DIR = resolve('dist');
const MAX_JS_GZIP_BYTES = 15 * 1024;
const MAX_CSS_GZIP_BYTES = 20 * 1024;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function startPlainStaticServer(rootDir: string): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolvePromise) => {
    const server = createServer((req, res) => {
      const reqPath = (req.url ?? '/').split('?')[0] ?? '/';
      const safeRel = normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
      let target = join(rootDir, safeRel);
      if (existsSync(target) && statSync(target).isDirectory()) {
        target = join(target, 'index.html');
      }
      if (!existsSync(target) || statSync(target).isDirectory()) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      const ext = extname(target).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
      createReadStream(target).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unexpected server address');
      }
      resolvePromise({ server, baseUrl: `http://127.0.0.1:${String(address.port)}` });
    });
  });
}

let staticServer: Server | null = null;
let staticUrl = '';

test.beforeAll(async () => {
  if (!existsSync(join(DIST_DIR, 'index.html'))) {
    throw new Error('dist/index.html missing — run npm run build before Playwright landing tests');
  }
  const started = await startPlainStaticServer(DIST_DIR);
  staticServer = started.server;
  staticUrl = started.baseUrl;
});

test.afterAll(async () => {
  if (!staticServer) return;
  await new Promise<void>((resolvePromise) => {
    staticServer?.close(() => {
      resolvePromise();
    });
  });
});

test.describe('static landing & app integration', () => {
  test('serves /, /en/, and /app/ as plain static files with zero console or third-party errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const externalRequests: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin !== staticUrl && url.protocol.startsWith('http')) {
        externalRequests.push(req.url());
      }
    });

    await page.goto(`${staticUrl}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-MX');
    await expect(page.getByRole('link', { name: 'Abrir la app' })).toHaveAttribute('href', '/app/');
    await expect(page.getByText('55')).toBeVisible();

    await page.getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(`${staticUrl}/en/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: 'Open the app' })).toHaveAttribute('href', '/app/');
    // Story lyrics stay in their original Spanish text on the English page.
    await expect(page.getByText(/Busca la canción que no te sueltas/)).toBeAttached();

    await page.goto(`${staticUrl}/app/#settings`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ajustes');

    // Missing path returns 404 (verifies zero SPA fallback).
    const missing = await page.request.get(`${staticUrl}/nonexistent-route`);
    expect(missing.status()).toBe(404);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test('meets landing JS (<= 15 KB gzip) and CSS (<= 20 KB gzip) size budgets', () => {
    const indexHtml = readFileSync(join(DIST_DIR, 'index.html'), 'utf8');
    const jsMatches = [...indexHtml.matchAll(/src="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    const cssMatches = [...indexHtml.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].map((m) => m[1]);

    expect(jsMatches.length).toBeGreaterThan(0);
    expect(cssMatches.length).toBeGreaterThan(0);

    let totalJsGzip = 0;
    for (const rel of jsMatches) {
      if (!rel) continue;
      totalJsGzip += gzipSync(readFileSync(join(DIST_DIR, rel))).byteLength;
    }

    let totalCssGzip = 0;
    for (const rel of cssMatches) {
      if (!rel) continue;
      totalCssGzip += gzipSync(readFileSync(join(DIST_DIR, rel))).byteLength;
    }

    expect(totalJsGzip).toBeLessThanOrEqual(MAX_JS_GZIP_BYTES);
    expect(totalCssGzip).toBeLessThanOrEqual(MAX_CSS_GZIP_BYTES);
    expect(
      readdirSync(join(DIST_DIR, 'assets')).some((f) => /InterTight-Latin.*\.woff2$/i.test(f)),
    ).toBe(true);
  });

  test('supports keyboard navigation through header links and Corrientes carousel buttons', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${staticUrl}/`);

    await page.keyboard.press('Tab');
    await expect(page.locator('.site-header > a').first()).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.locator('.site-header nav a').first()).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    const list = page.locator('[data-currents]');
    const nextBtn = page.getByRole('button', { name: 'Siguiente' });
    await nextBtn.scrollIntoViewIfNeeded();
    await nextBtn.focus();
    const before = await list.evaluate((el) => el.scrollLeft);
    await page.keyboard.press('Enter');
    await expect.poll(async () => list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);

    const afterNext = await list.evaluate((el) => el.scrollLeft);
    const prevBtn = page.getByRole('button', { name: 'Anterior' });
    await prevBtn.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => list.evaluate((el) => el.scrollLeft)).toBeLessThan(afterNext);
  });

  test.describe('JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });

    test('renders all copy and story lyrics readably without JavaScript', async ({ page }) => {
      await page.goto(`${staticUrl}/`);
      await expect(
        page.getByText('Elige una canción, marca los versos y llévate un clip'),
      ).toBeVisible();
      await expect(page.getByText('Busca la canción que no te sueltas,')).toBeVisible();
      await expect(page.getByText('hasta que brillen.')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'En tu PC y en tu cel' })).toBeVisible();
      await expect(page.getByText('Bajamar')).toBeVisible();
    });
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('renders non-sticky full story, static phone clip, and zero scroll animations', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${staticUrl}/`);
      await page.evaluate(() => document.fonts.ready);

      const stagePosition = await page
        .locator('.story-stage')
        .evaluate((el) => getComputedStyle(el).position);
      expect(stagePosition).toBe('relative');

      await expect(page.locator('.story-closing')).toBeVisible();
      await expect(page.locator('.hero-phone .clip li[data-state="active"]')).toHaveCount(1);
    });
  });

  test('animates story syllables, verse counter, sea level, and closing CTA on scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${staticUrl}/`);
    await page.evaluate(() => document.fonts.ready);

    await page.evaluate(() => {
      const story = document.querySelector('#como-se-ve');
      if (!story) return;
      const top = story.getBoundingClientRect().top + window.scrollY;
      const maxOffset = story.scrollHeight - window.innerHeight;
      window.scrollTo({ top: top + maxOffset * 0.55, behavior: 'instant' });
    });

    await expect(page.locator('[data-story-count]')).toHaveText('Verso 3 de 5');
    await expect(page.locator('.syllable[data-fx="water"]').first()).toBeVisible();
    await expect(page.locator('.syllable[data-state="sung"]').first()).toBeAttached();

    await page.evaluate(() => {
      const story = document.querySelector('#como-se-ve');
      if (!story) return;
      const top = story.getBoundingClientRect().top + window.scrollY;
      const maxOffset = story.scrollHeight - window.innerHeight;
      window.scrollTo({ top: top + maxOffset * 0.96, behavior: 'instant' });
    });

    await expect(page.locator('.story-closing')).toHaveAttribute('data-visible', '');
    await expect(page.locator('.story-closing')).toBeVisible();

    await page.evaluate(() => {
      document
        .querySelector('#corrientes')
        ?.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await expect(
      page.locator('.currents .current-syllable[data-fx="water"]').first(),
    ).toBeVisible();
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const cards = [...document.querySelectorAll('.currents li figure p:nth-child(2)')];
          return cards.some((card) => {
            const progresses = [...card.querySelectorAll<HTMLElement>('.current-syllable')].map(
              (el) => Number.parseFloat(el.style.getPropertyValue('--progress') || '0'),
            );
            if (progresses.length < 2) return false;
            const hasPartial = progresses.some((p) => p > 0 && p < 1);
            const monotone = progresses.every(
              (p, i) => i === 0 || p <= (progresses[i - 1] ?? 1) + 0.001,
            );
            return hasPartial && monotone;
          });
        });
      })
      .toBe(true);
  });

  test('matches visual snapshots across desktop (1440x900) and mobile (390x844)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${staticUrl}/`);
    await page.evaluate(() => document.fonts.ready);

    const desktopCheckpoints = [
      { name: 'landing-desktop-hero.png', selector: null },
      { name: 'landing-desktop-story.png', selector: '#como-se-ve' },
      { name: 'landing-desktop-platforms.png', selector: '#donde' },
      { name: 'landing-desktop-currents.png', selector: '#corrientes' },
      { name: 'landing-desktop-closing.png', selector: '#empezar' },
    ] as const;

    for (const point of desktopCheckpoints) {
      await page.evaluate((sel) => {
        if (!sel) {
          window.scrollTo({ top: 0, behavior: 'instant' });
          return;
        }
        document.querySelector(sel)?.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, point.selector);
      await expect(page).toHaveScreenshot(point.name, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await expect(page).toHaveScreenshot('landing-mobile-hero.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
    await page.evaluate(() => {
      document
        .querySelector('#corrientes')
        ?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await expect(page).toHaveScreenshot('landing-mobile-currents.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
