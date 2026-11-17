import { appUrlFor, hasSpotifyCallbackQuery, hashFor, routeFromHash, type RouteId } from './routes';

const initial = routeFromHash(location.hash);
let current = $state<RouteId>(initial);
let callbackActive = $state(hasSpotifyCallbackQuery(location.search));

function syncFromLocation(): void {
  current = routeFromHash(location.hash);
}

window.addEventListener('hashchange', syncFromLocation);
window.addEventListener('popstate', syncFromLocation);

// Normalize the address bar (empty or unknown hash) without dropping OAuth callback params before Callback reads them.
if (!callbackActive) {
  history.replaceState(history.state, '', appUrlFor(initial, location.search));
}

export const router = {
  get current(): RouteId {
    return current;
  },
  get callbackActive(): boolean {
    return callbackActive;
  },
  navigate(route: RouteId): void {
    callbackActive = false;
    if (route === current && location.hash === hashFor(route)) return;
    history.pushState(null, '', appUrlFor(route, location.search));
    current = route;
  },
  finishCallback(route: RouteId): void {
    callbackActive = false;
    current = route;
    history.replaceState(null, '', appUrlFor(route));
  },
  clearCallbackUrl(): void {
    history.replaceState(history.state, '', appUrlFor('settings'));
  },
};
