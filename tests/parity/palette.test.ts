import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import CanvasKitInit from 'canvaskit-wasm';
import { describe, expect, it } from 'vitest';
import { createDemoCover } from '@/render/cover';
import { dominantColors, dominantColorsFromRgba } from '@/render/palette';
import { Fonts } from '@/render/text';
import { at } from '@/shared/indexed';

interface PaletteFixture {
  demoCoverDominant: [number, number, number][];
  sample32Rgba: number[];
}

const require = createRequire(import.meta.url);
const wasmPath = resolve(
  dirname(require.resolve('canvaskit-wasm/package.json')),
  'bin/canvaskit.wasm',
);
const boldBytes = readFileSync(resolve(process.cwd(), 'src/render/fonts/InterTight-Bold.ttf'));
const regularBytes = readFileSync(
  resolve(process.cwd(), 'src/render/fonts/InterTight-Regular.ttf'),
);
const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/render/palette.json'), 'utf8'),
) as PaletteFixture;

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('cover palette parity against desktop', () => {
  it('computes identical dominant colors from identical 32x32 RGBA pixels', () => {
    const rgba = Uint8Array.from(fixture.sample32Rgba);
    expect(dominantColorsFromRgba(rgba, 3)).toEqual(fixture.demoCoverDominant);
  });

  it('extracts closely matching dominant colors from CanvasKit demo cover', async () => {
    const ck = await CanvasKitInit({ locateFile: () => wasmPath });
    const fonts = new Fonts(ck, toArrayBuffer(boldBytes), toArrayBuffer(regularBytes));
    const cover = createDemoCover(ck, fonts, 600, true);
    try {
      const dom = dominantColors(ck, cover, 3);
      expect(dom.length).toBe(3);
      // Downsampling kernels between CPU Skia and CanvasKit CPU surface match closely.
      const top = at(dom, 0);
      const exp = at(fixture.demoCoverDominant, 0);
      for (let c = 0; c < 3; c += 1) {
        expect(Math.abs(at(top, c) - at(exp, c))).toBeLessThanOrEqual(4);
      }
    } finally {
      cover.delete();
      fonts.dispose();
    }
  });
});
