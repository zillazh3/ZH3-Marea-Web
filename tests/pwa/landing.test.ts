import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANDING_CORRIENTES, WORDFX_CATEGORY_COUNT } from '@/shared/landingFacts';
import {
  renderLandingHtml,
  renderNotFoundHtml,
  renderPresetCss,
  renderPrivacyHtml,
  renderRobotsTxt,
  renderSitemapXml,
} from '../../tools/renderLanding';

describe('landing build-time rendering and single source of truth', () => {
  it('keeps src/landing/styles/presets.css synced with shared preset JSONs', () => {
    const cssPath = join(process.cwd(), 'src', 'landing', 'styles', 'presets.css');
    const actual = readFileSync(cssPath, 'utf8').replaceAll('\r\n', '\n');
    expect(actual).toBe(renderPresetCss(LANDING_CORRIENTES));
  });

  it('renders es-MX and en HTML with /app/ links, computed stats, hreflang, and JSON-LD', () => {
    const esHtml = renderLandingHtml('es-MX');
    const enHtml = renderLandingHtml('en');

    expect(esHtml).toContain('<html lang="es-MX">');
    expect(esHtml).toContain('href="/app/"');
    expect(esHtml).toContain(`>${String(WORDFX_CATEGORY_COUNT)}</dt>`);
    expect(esHtml).toContain('hreflang="en"');
    expect(esHtml).toContain('application/ld+json');
    expect(esHtml).not.toContain('fonts.googleapis.com');
    expect(esHtml).not.toContain('style="');

    expect(enHtml).toContain('<html lang="en">');
    expect(enHtml).toContain('href="/app/"');
    expect(enHtml).toContain('Busca la canción que no te sueltas');
    expect(enHtml).toContain('Bajamar');
    expect(enHtml).toContain('hreflang="es-MX"');
    expect(enHtml).toContain('Español');
  });

  it('generates robots.txt and sitemap.xml from the configured site origin', () => {
    const robots = renderRobotsTxt();
    expect(robots).toContain('Sitemap: https://zh3marea.workers.dev/sitemap.xml');
    const sitemap = renderSitemapXml();
    expect(sitemap).toContain('<loc>https://zh3marea.workers.dev/</loc>');
    expect(sitemap).toContain('<loc>https://zh3marea.workers.dev/en/</loc>');
  });

  it('lists both privacy pages in the sitemap with hreflang alternates', () => {
    const sitemap = renderSitemapXml();
    expect(sitemap).toContain('<loc>https://zh3marea.workers.dev/privacidad/</loc>');
    expect(sitemap).toContain('<loc>https://zh3marea.workers.dev/en/privacy/</loc>');
    expect(sitemap).toContain('hreflang="es-MX" href="https://zh3marea.workers.dev/privacidad/"');
    expect(sitemap).toContain('hreflang="en" href="https://zh3marea.workers.dev/en/privacy/"');
  });

  it('links the privacy page from the footer of both landing pages', () => {
    expect(renderLandingHtml('es-MX')).toContain('<a href="/privacidad/">Privacidad</a>');
    expect(renderLandingHtml('en')).toContain('<a href="/en/privacy/">Privacy</a>');
  });

  it('renders privacy pages as plain static HTML: no scripts, no inline styles, repo and issues links', () => {
    for (const [locale, other] of [
      ['es-MX', '/en/privacy/'],
      ['en', '/privacidad/'],
    ] as const) {
      const html = renderPrivacyHtml(locale);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toContain('style="');
      expect(html).toContain('href="https://github.com/zillazh3/ZH3-Marea/issues"');
      expect(html).toContain('AGPL-3.0');
      expect(html).toContain('<time datetime="2026-11-16">');
      expect(html).toContain(`href="${other}"`);
      expect(html).not.toContain('{repo}');
      expect(html).not.toContain('{issues}');
    }
  });

  it('renders a noindex 404 page with both languages and only an external script', () => {
    const html = renderNotFoundHtml();
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain('data-locale="es-MX"');
    expect(html).toContain('data-locale="en" hidden');
    expect(html).toContain('href="/app/"');
    expect(html).toContain('src="/src/landing/not-found.ts"');
    expect(html).not.toMatch(/<script(?![^>]* src=)/i);
  });
});
