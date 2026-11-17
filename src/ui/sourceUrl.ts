import { resolveSiteConfig } from '@/shared/site';

/** Resolves the configured repository URL from `VITE_SOURCE_URL`, falling back to the canonical repository URL. */
export function configuredSourceUrl(): string | null {
  return resolveSiteConfig({
    VITE_SOURCE_URL: import.meta.env.VITE_SOURCE_URL as string | undefined,
    VITE_SITE_URL: import.meta.env.VITE_SITE_URL as string | undefined,
  }).repoUrl;
}
