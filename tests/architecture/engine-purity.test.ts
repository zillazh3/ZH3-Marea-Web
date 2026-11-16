import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The engine and the shared helpers run in workers and in Node tests: they must not reach for the DOM or the page.
const DOM_USE = /\b(document|window|localStorage|sessionStorage|navigator|requestAnimationFrame)\b/;

function sources(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => `${dir}/${name}`);
}

function codeOnly(file: string): string {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
    .join('\n');
}

describe('pure layers', () => {
  it.each(['src/engine', 'src/shared'])('%s has no DOM access', (dir) => {
    for (const file of sources(dir)) {
      expect({ file, match: DOM_USE.exec(codeOnly(file))?.[0] }).toEqual({
        file,
        match: undefined,
      });
    }
  });
});
