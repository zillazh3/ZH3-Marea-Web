import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { declared, readHeaderRules } from './headers';

const LANDING_PAGES = ['/', '/en/', '/privacidad/', '/en/privacy/'];
const UNSAFE = /'unsafe-(?:inline|eval)'/;

test.describe('headers served by wrangler dev from public/_headers', () => {
  for (const path of LANDING_PAGES) {
    test(`${path} gets the strict landing policy and the shared security headers`, async ({
      request,
    }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const headers = response.headers();

      // Equal to the rule, so no second policy was appended to it (the policies of two rules would be comma-joined).
      expect(headers['content-security-policy']).toBe(declared('/*', 'content-security-policy'));
      expect(headers['content-security-policy']).not.toMatch(UNSAFE);
      expect(headers['content-security-policy']).not.toContain('wasm-unsafe-eval');
      expect(headers['content-security-policy']).not.toContain('https://');
      expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(headers['content-security-policy']).toContain('upgrade-insecure-requests');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['permissions-policy']).toContain('camera=()');
      expect(headers['permissions-policy']).toContain('microphone=()');
      expect(headers['cache-control']).toBe('no-cache');
    });
  }

  test('/app/ gets the app policy: WebAssembly and the listed origins, nothing else', async ({
    request,
  }) => {
    const response = await request.get('/app/');
    expect(response.status()).toBe(200);
    const headers = response.headers();
    const policy = headers['content-security-policy'] ?? '';

    expect(policy).toBe(declared('/app/*', 'content-security-policy'));
    expect(policy).toContain("'wasm-unsafe-eval'");
    expect(policy).not.toMatch(UNSAFE);
    const origins = policy.match(/https:\/\/[a-z.]+/g) ?? [];
    expect([...new Set(origins)].sort()).toEqual([
      'https://accounts.spotify.com',
      'https://api.spicylyrics.org',
      'https://api.spotify.com',
      'https://i.scdn.co',
      'https://lrclib.net',
    ]);
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control']).toBe('no-cache');
  });

  test('every hashed asset is cached for a year; the workers get the app policy from their own response', async ({
    request,
  }) => {
    const files = readdirSync(join(process.cwd(), 'dist', 'assets'));
    const samples = [
      'app-',
      'preview.worker-',
      'export.worker-',
      'canvaskit-',
      'main-',
      'InterTight-Latin',
    ].map((prefix) => files.find((name) => name.startsWith(prefix)));
    expect(samples.every(Boolean)).toBe(true);

    for (const name of samples) {
      const url = `/assets/${name ?? ''}`;
      const response = await request.get(url);
      expect(response.status(), url).toBe(200);
      const headers = response.headers();
      expect(headers['cache-control'], url).toBe('public, max-age=31536000, immutable');
      expect(headers['content-security-policy'], url).toBe(
        declared('/assets/*', 'content-security-policy'),
      );
      expect(headers['x-content-type-options'], url).toBe('nosniff');
    }
  });

  test('the service worker and the manifest are revalidated on every load', async ({ request }) => {
    const sw = await request.get('/app/sw.js');
    expect(sw.status()).toBe(200);
    expect(sw.headers()['cache-control']).toBe('no-cache');

    const manifest = await request.get('/app/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    expect(manifest.headers()['cache-control']).toBe('no-cache');
    expect(manifest.headers()['content-type']).toContain('application/manifest+json');
  });

  test('/app redirects to /app/ and an unknown path serves the 404 page', async ({ request }) => {
    const redirect = await request.get('/app', { maxRedirects: 0 });
    expect(redirect.status()).toBeGreaterThanOrEqual(300);
    expect(redirect.status()).toBeLessThan(400);
    expect(redirect.headers().location).toMatch(/\/app\/$/);

    const missing = await request.get('/no-such-page');
    expect(missing.status()).toBe(404);
    expect(await missing.text()).toContain('404');
    expect(missing.headers()['content-security-policy']).toBe(
      declared('/*', 'content-security-policy'),
    );
  });

  test('_headers stays within Cloudflare limits: at most 100 rules, one * per pattern', () => {
    const rules = readHeaderRules();
    expect(rules.length).toBeLessThanOrEqual(100);
    for (const rule of rules) expect(rule.pattern.split('*').length - 1).toBeLessThanOrEqual(1);
  });
});
