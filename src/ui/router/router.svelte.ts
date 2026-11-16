import { pathFor, routeFromPath, type RouteId } from './routes';

const initial = routeFromPath(location.pathname);
let current = $state<RouteId>(initial);

window.addEventListener('popstate', () => {
  current = routeFromPath(location.pathname);
});

// Normalize the address bar (unknown path, trailing slash) without adding a history entry.
history.replaceState(history.state, '', pathFor(initial) + location.search);

export const router = {
  get current(): RouteId {
    return current;
  },
  navigate(route: RouteId): void {
    if (route === current) return;
    history.pushState(null, '', pathFor(route));
    current = route;
  },
};
