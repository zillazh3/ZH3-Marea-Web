export interface SiteConfig {
  readonly repoUrl: string;
  readonly windowsReleaseUrl: string;
  readonly siteUrl: string;
  readonly appPath: string;
  readonly licenseId: string;
  readonly authorName: string;
}

export const DEFAULT_REPO_URL = 'https://github.com/zillazh3/ZH3-Marea-Web';
/** The Windows build lives in the desktop repository, not in this one. */
export const DEFAULT_WINDOWS_RELEASE_URL = 'https://github.com/zillazh3/ZH3-Marea/releases/latest';
export const DEFAULT_SITE_URL = 'https://zh3marea.workers.dev';
export const APP_PATH = '/app/';

export function sanitizeHttpUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function resolveSiteConfig(env?: {
  readonly VITE_SOURCE_URL?: string | undefined;
  readonly VITE_SITE_URL?: string | undefined;
  readonly VITE_WINDOWS_RELEASE_URL?: string | undefined;
}): SiteConfig {
  const repoUrl = sanitizeHttpUrl(env?.VITE_SOURCE_URL) ?? DEFAULT_REPO_URL;
  const windowsReleaseUrl =
    sanitizeHttpUrl(env?.VITE_WINDOWS_RELEASE_URL) ?? DEFAULT_WINDOWS_RELEASE_URL;
  const siteUrl = sanitizeHttpUrl(env?.VITE_SITE_URL) ?? DEFAULT_SITE_URL;
  return {
    repoUrl,
    windowsReleaseUrl,
    siteUrl,
    appPath: APP_PATH,
    licenseId: 'AGPL-3.0-only',
    authorName: 'Zilla-ZH3',
  };
}
