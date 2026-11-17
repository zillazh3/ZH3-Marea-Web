import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface HeaderRule {
  readonly pattern: string;
  readonly headers: ReadonlyMap<string, string>;
}

/** Reads `public/_headers`: a pattern line, then indented `Name: value` lines. Detach lines (`! Name`) are skipped. */
export function readHeaderRules(): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: { pattern: string; headers: Map<string, string> } | null = null;
  for (const line of readFileSync(join(process.cwd(), 'public', '_headers'), 'utf8').split(
    /\r?\n/,
  )) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: new Map() };
      rules.push(current);
    } else if (current && !line.trim().startsWith('!')) {
      const colon = line.indexOf(':');
      current.headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
    }
  }
  return rules;
}

/** The value a header must have in the file for `pattern`. */
export function declared(pattern: string, header: string): string {
  const value = readHeaderRules()
    .find((rule) => rule.pattern === pattern)
    ?.headers.get(header);
  if (value === undefined) throw new Error(`public/_headers has no ${header} for ${pattern}`);
  return value;
}
