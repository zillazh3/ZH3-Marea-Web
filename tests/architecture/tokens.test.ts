import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const TOKENS = join('ui', 'styles', 'tokens.css');
const SOURCE_FILE = /\.(ts|svelte|css|html)$/;
const COLOR_LITERAL =
  /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('design tokens', () => {
  it('keeps color literals inside tokens.css', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(TOKENS))
      .filter((file) => COLOR_LITERAL.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
});
