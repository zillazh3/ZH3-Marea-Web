import { describe, expect, it } from 'vitest';
import { detectLocale, messagesFor, resolveLocale } from './locale';
import type { Messages } from './messages';

describe('detectLocale', () => {
  it('maps any Spanish variant to es-MX', () => {
    expect(detectLocale(['es-AR', 'en-US'])).toBe('es-MX');
  });

  it('picks the first supported language in order', () => {
    expect(detectLocale(['fr-FR', 'en-GB', 'es'])).toBe('en');
  });

  it('falls back to es-MX when nothing matches', () => {
    expect(detectLocale(['de', 'ja'])).toBe('es-MX');
    expect(detectLocale([])).toBe('es-MX');
  });
});

describe('resolveLocale', () => {
  it('lets a manual choice override the browser', () => {
    expect(resolveLocale('en', ['es-MX'])).toBe('en');
    expect(resolveLocale('auto', ['en-US'])).toBe('en');
  });
});

describe('messagesFor', () => {
  it('returns the dictionary of the locale', () => {
    expect(messagesFor('en').nav.home).toBe('Home');
    expect(messagesFor('es-MX').app.documentTitle('Editor')).toBe('Editor – ZH3 Marea');
  });
});

describe('Messages', () => {
  it('rejects a dictionary with a missing key at compile time', () => {
    // @ts-expect-error nav.label is required by the es-MX shape
    const incomplete: Messages = { ...messagesFor('en'), nav: { home: 'Home' } };
    expect(incomplete.nav.home).toBe('Home');
  });
});
