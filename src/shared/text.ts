/** Lowercases and strips diacritics so "Exportación" matches a query typed as "exportacion". */
export function foldAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function matchesQuery(label: string, query: string): boolean {
  const needle = foldAccents(query.trim());
  return needle === '' || foldAccents(label).includes(needle);
}
