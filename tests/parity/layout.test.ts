import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit } from 'canvaskit-wasm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '@/engine/engine';
import { demoLyrics } from '@/features/lyrics/demo';
import { Fonts, ItemLayout, PAD_L, PAD_R, layoutCredit } from '@/render/text';
import { at } from '@/shared/indexed';

interface LayoutFixture {
  glyphRuns: { text: string; size: number; xs: number[]; width: number }[];
  baselines: { size: number; baseline: number }[];
  itemLayouts: {
    w: number;
    h: number;
    size: number;
    stageW: number;
    items: {
      index: number;
      duet: boolean;
      hInactive: number;
      hActive: number;
      mainW: number[];
      bgW: number[];
      mainRows: { text: string; x: number; w: number }[][];
      bgRows: { text: string; x: number; w: number }[][];
    }[];
    credit: {
      csize: number;
      height: number;
      blocks: { word: string; x: number; bold: boolean }[][][];
    };
  }[];
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
  readFileSync(resolve(process.cwd(), 'tests/fixtures/render/layout.json'), 'utf8'),
) as LayoutFixture;

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * Desktop skia-python uses the system FreeType/HarfBuzz binary while CanvasKit bundles FreeType in WASM,
 * differing by at most ~0.04 % on linear glyph widths (measured max 0.34 px on a 1000 px run in M2b).
 */
const SUBPIXEL_TOL_PX = 0.4;

describe('text layout parity against desktop Skia', () => {
  let ck: CanvasKit;
  let fonts: Fonts;

  beforeAll(async () => {
    ck = await CanvasKitInit({ locateFile: () => wasmPath });
    fonts = new Fonts(ck, toArrayBuffer(boldBytes), toArrayBuffer(regularBytes));
  });

  afterAll(() => {
    fonts.dispose();
  });

  it('matches unshaped glyph x positions and run widths', () => {
    for (const expected of fixture.glyphRuns) {
      const actual = fonts.glyphs(expected.text, expected.size, true);
      expect(actual.xs.length).toBe(expected.xs.length);
      for (let i = 0; i < expected.xs.length; i += 1) {
        expect(Math.abs(at(actual.xs, i) - at(expected.xs, i))).toBeLessThan(SUBPIXEL_TOL_PX);
      }
      expect(Math.abs(actual.width - expected.width)).toBeLessThan(SUBPIXEL_TOL_PX);
    }
  });

  it('matches font baselines', () => {
    for (const expected of fixture.baselines) {
      expect(Math.abs(fonts.baseline(expected.size) - expected.baseline)).toBeLessThan(1e-4);
    }
  });

  it('produces identical line breaks and item geometry on the demo song', () => {
    const lyrics = demoLyrics();
    for (const spec of fixture.itemLayouts) {
      const eng = new Engine(lyrics, () => 0, { stageH: 0.72 * spec.h, fontPx: spec.size });
      const lineItems = eng.items.filter((item) => !item.isGap && !item.isCredit);
      expect(lineItems.length).toBe(spec.items.length);

      spec.items.forEach((exp, idx) => {
        const item = at(lineItems, idx);
        const lay = new ItemLayout(item, fonts, spec.size, spec.stageW);
        expect(lay.main.map((row) => row.map((w) => w.word.text))).toEqual(
          exp.mainRows.map((row) => row.map((w) => w.text)),
        );
        expect(lay.bg.map((row) => row.map((w) => w.word.text))).toEqual(
          exp.bgRows.map((row) => row.map((w) => w.text)),
        );

        expect(Math.abs(lay.hInactive - exp.hInactive)).toBeLessThan(1e-4);
        expect(Math.abs(lay.hActive - exp.hActive)).toBeLessThan(1e-4);

        lay.main.forEach((row, ri) => {
          const expRow = at(exp.mainRows, ri);
          row.forEach((w, wi) => {
            const ew = at(expRow, wi);
            expect(Math.abs(w.x - ew.x)).toBeLessThan(SUBPIXEL_TOL_PX);
            expect(Math.abs(w.width - ew.w)).toBeLessThan(SUBPIXEL_TOL_PX);
          });
        });
      });

      const avail = spec.stageW - PAD_L * spec.size - PAD_R * spec.stageW;
      const cred = layoutCredit(
        [
          ['Written by', 'A. Autora, B. Autor'],
          ['Provided by', 'Apple Music'],
        ],
        fonts,
        spec.size,
        avail,
      );
      expect(cred.blocks.map((b) => b.map((r) => r.map((w) => w.word)))).toEqual(
        spec.credit.blocks.map((b) => b.map((r) => r.map((w) => w.word))),
      );
      expect(Math.abs(cred.csize - spec.credit.csize)).toBeLessThan(1e-6);
      expect(Math.abs(cred.height - spec.credit.height)).toBeLessThan(1e-4);
    }
  });
});
