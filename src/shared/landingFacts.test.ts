import { describe, expect, it } from 'vitest';
import abisal from '@/shared/data/presets/Abisal.json';
import bajamar from '@/shared/data/presets/Bajamar.json';
import niebla from '@/shared/data/presets/Niebla.json';
import pleamar from '@/shared/data/presets/Pleamar.json';
import { LANDING_CORRIENTES, WORDFX_CATEGORY_COUNT } from './landingFacts';
import { DEFAULT_REPO_URL, DEFAULT_WINDOWS_RELEASE_URL, resolveSiteConfig } from './site';

describe('landing single source of truth', () => {
  it('derives Corrientes stats and CSS tokens directly from shared preset JSONs', () => {
    expect(LANDING_CORRIENTES.map((c) => c.name)).toEqual([
      bajamar.name,
      pleamar.name,
      niebla.name,
      abisal.name,
    ]);

    const [b, p, n, a] = LANDING_CORRIENTES;
    expect(b?.size).toBe(Math.round(bajamar.tipografia.font_frac * 1000));
    expect(p?.size).toBe(Math.round(pleamar.tipografia.font_frac * 1000));
    expect(n?.cssVars.blurPx).toBeGreaterThan(0);
    expect(b?.cssVars.blurPx).toBe(0);
    expect(a?.cssVars.dimAlpha).toBe(abisal.fondo.bg_veil);
    expect(a?.cssVars.glowColor).toBe(abisal.color.glow_rgb);
  });

  it('computes the wordfx category count from library.json', () => {
    expect(WORDFX_CATEGORY_COUNT).toBe(55);
  });

  it('resolves external URLs and canonical origin from one config', () => {
    const defaults = resolveSiteConfig();
    expect(defaults.repoUrl).toBe(DEFAULT_REPO_URL);
    expect(defaults.windowsReleaseUrl).toBe(DEFAULT_WINDOWS_RELEASE_URL);

    const overridden = resolveSiteConfig({
      VITE_SOURCE_URL: 'https://github.com/example/zh3marea/',
      VITE_SITE_URL: 'https://marea.example.com/',
    });
    expect(overridden.repoUrl).toBe('https://github.com/example/zh3marea');
    expect(overridden.windowsReleaseUrl).toBe(DEFAULT_WINDOWS_RELEASE_URL);
    expect(overridden.siteUrl).toBe('https://marea.example.com');

    const release = resolveSiteConfig({
      VITE_WINDOWS_RELEASE_URL: 'https://example.com/download/',
    });
    expect(release.windowsReleaseUrl).toBe('https://example.com/download');
  });
});
