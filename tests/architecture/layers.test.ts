import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { layerRules } from '../../eslint.layers.js';

const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
    ...layerRules,
  ],
});

async function violations(filePath: string, code: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.errorCount ?? 0;
}

describe('layer import rules', () => {
  it('rejects an engine file importing from ui', async () => {
    expect(await violations('src/engine/probe.ts', "import '@/ui/App.svelte';")).toBe(1);
    expect(await violations('src/engine/probe.ts', "import '../ui/App.svelte';")).toBe(1);
  });

  it('rejects an engine file importing from render', async () => {
    expect(await violations('src/engine/probe.ts', "import '@/render/frame';")).toBe(1);
  });

  it('rejects features importing from ui', async () => {
    expect(await violations('src/features/probe.ts', "import '@/ui/i18n.svelte';")).toBe(1);
  });

  it('allows imports that point inward', async () => {
    expect(await violations('src/render/probe.ts', "import '@/engine/engine';")).toBe(0);
    expect(await violations('src/ui/probe.ts', "import '@/features/i18n/locale';")).toBe(0);
    expect(await violations('src/engine/probe.ts', "import '@/shared/pycompat';")).toBe(0);
  });
});
