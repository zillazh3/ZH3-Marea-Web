import { describe, expect, it } from 'vitest';
import { pathFor, ROUTES, routeFromPath } from './routes';

describe('routes', () => {
  it('round-trips every route through its path', () => {
    for (const route of ROUTES) {
      expect(routeFromPath(pathFor(route))).toBe(route);
    }
  });

  it('ignores a trailing slash', () => {
    expect(routeFromPath('/editor/')).toBe('editor');
  });

  it('sends unknown paths to the home screen', () => {
    expect(routeFromPath('/nope')).toBe('home');
    expect(routeFromPath('')).toBe('home');
  });
});
