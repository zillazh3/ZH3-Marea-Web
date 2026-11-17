import { describe, expect, it } from 'vitest';
import { pickLandingLocale } from './locale';

describe('pickLandingLocale', () => {
  it('lets a stored manual choice win over the browser languages', () => {
    expect(pickLandingLocale('es-MX', ['en-US'])).toBe('es-MX');
    expect(pickLandingLocale('en', ['es-MX'])).toBe('en');
  });

  it('follows the first supported browser language', () => {
    expect(pickLandingLocale(null, ['en-US', 'es'])).toBe('en');
    expect(pickLandingLocale(null, ['fr-FR', 'es-AR'])).toBe('es-MX');
  });

  it('ignores an unknown stored value and falls back to Spanish', () => {
    expect(pickLandingLocale('fr', ['fr-FR'])).toBe('es-MX');
    expect(pickLandingLocale(null, [])).toBe('es-MX');
  });
});
