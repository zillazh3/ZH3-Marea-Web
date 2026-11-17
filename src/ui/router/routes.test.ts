import { describe, expect, it } from 'vitest';
import {
  appUrlFor,
  hasSpotifyCallbackQuery,
  hashFor,
  pathFor,
  ROUTES,
  routeFromHash,
} from './routes';

describe('routes', () => {
  it('round-trips every route through its hash', () => {
    for (const route of ROUTES) {
      expect(routeFromHash(hashFor(route))).toBe(route);
      expect(pathFor(route)).toBe(`/app/${hashFor(route)}`);
    }
  });

  it('ignores a leading slash or trailing slash inside the hash', () => {
    expect(routeFromHash('#/editor/')).toBe('editor');
    expect(routeFromHash('#settings')).toBe('settings');
  });

  it('sends empty or unknown hashes to the home screen', () => {
    expect(routeFromHash('#nope')).toBe('home');
    expect(routeFromHash('#')).toBe('home');
    expect(routeFromHash('')).toBe('home');
  });

  it('detects Spotify OAuth callback query parameters and cleans them from appUrlFor', () => {
    expect(hasSpotifyCallbackQuery('?code=abc&state=xyz')).toBe(true);
    expect(hasSpotifyCallbackQuery('?error=access_denied&state=xyz')).toBe(true);
    expect(hasSpotifyCallbackQuery('?seed')).toBe(false);
    expect(appUrlFor('settings', '?code=abc&state=xyz')).toBe('/app/#settings');
    expect(appUrlFor('home', '?seed=1')).toBe('/app/?seed=1#home');
  });
});
