export const ROUTES = [
  'inicio',
  'buscar',
  'editor',
  'biblioteca',
  'exportaciones',
  'ajustes',
  'callback',
] as const;
export type RouteId = (typeof ROUTES)[number];

const PATHS: Record<RouteId, string> = {
  inicio: '/',
  buscar: '/buscar',
  editor: '/editor',
  biblioteca: '/biblioteca',
  exportaciones: '/exportaciones',
  ajustes: '/ajustes',
  callback: '/callback',
};

export function pathFor(route: RouteId): string {
  return PATHS[route];
}

/** Unknown paths resolve to the home screen so a stale link never lands on a blank page. */
export function routeFromPath(pathname: string): RouteId {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ROUTES.find((route) => PATHS[route] === normalized) ?? 'inicio';
}
