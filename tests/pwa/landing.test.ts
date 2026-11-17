import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANDING_CORRIENTES, WORDFX_CATEGORY_COUNT } from '@/shared/landingFacts';
import {
  renderLandingHtml,
  renderPresetCss,
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
});
