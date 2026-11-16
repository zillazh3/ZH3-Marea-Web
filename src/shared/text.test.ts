import { describe, expect, it } from 'vitest';
import { foldAccents, matchesQuery } from './text';

describe('foldAccents', () => {
  it('removes diacritics and lowercases', () => {
    expect(foldAccents('Exportación Éñe')).toBe('exportacion ene');
  });
});

describe('matchesQuery', () => {
  it('matches accent- and case-insensitively', () => {
    expect(matchesQuery('Exportaciones', 'exportac')).toBe(true);
    expect(matchesQuery('Sugerir rangos', 'RANGOS')).toBe(true);
  });

  it('matches everything for an empty query', () => {
    expect(matchesQuery('Ajustes', '   ')).toBe(true);
  });

  it('rejects labels that do not contain the query', () => {
    expect(matchesQuery('Inicio', 'editor')).toBe(false);
  });
});
