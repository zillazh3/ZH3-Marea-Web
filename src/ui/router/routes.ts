export const ROUTES = ['home', 'search', 'editor', 'library', 'exports', 'settings'] as const;
export type RouteId = (typeof ROUTES)[number];

export const APP_BASE_PATH = '/app/';

const HASHES: Record<RouteId, string> = {
  home: '#home',
  search: '#search',
  editor: '#editor',
  library: '#library',
  exports: '#exports',
  settings: '#settings',
};

export function hashFor(route: RouteId): string {
  return HASHES[route];
}

export function pathFor(route: RouteId): string {
  return `${APP_BASE_PATH}${HASHES[route]}`;
}

/** Unknown or empty hashes resolve to the home screen so a stale link never lands on a blank page. */
export function routeFromHash(hash: string): RouteId {
  const cleaned = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  return ROUTES.find((route) => route === cleaned) ?? 'home';
}

export function hasSpotifyCallbackQuery(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.has('code') || params.has('error');
}

/** Keeps non-OAuth query parameters (such as `?seed` in local development) when rewriting the app URL. */
export function appUrlFor(route: RouteId, search = ''): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete('code');
  params.delete('state');
  params.delete('error');
  const cleanSearch = params.toString();
  return `${APP_BASE_PATH}${cleanSearch ? `?${cleanSearch}` : ''}${HASHES[route]}`;
}
