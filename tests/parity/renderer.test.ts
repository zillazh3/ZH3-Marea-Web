import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import CanvasKitInit from 'canvaskit-wasm';
import { describe, expect, it } from 'vitest';
import { defaultParams } from '@/engine/params';
import { demoLyrics } from '@/features/lyrics/demo';
import { buildFxPlan } from '@/features/wordfx/plan';
import { CanvasKitRenderer, renderSnapshotPng } from '@/render/renderer';
import { defaultStyle } from '@/render/style';
import { Fonts } from '@/render/text';

const require = createRequire(import.meta.url);
const wasmPath = resolve(
  dirname(require.resolve('canvaskit-wasm/package.json')),
  'bin/canvaskit.wasm',
);
const boldBytes = readFileSync(resolve(process.cwd(), 'src/render/fonts/InterTight-Bold.ttf'));
const regularBytes = readFileSync(
  resolve(process.cwd(), 'src/render/fonts/InterTight-Regular.ttf'),
);

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('CanvasKit Scene snapshot rendering', () => {
  it('renders deterministic PNG frames across timestamps (intro dots, active wipe, watermark)', async () => {
    const ck = await CanvasKitInit({ locateFile: () => wasmPath });
    const fonts = new Fonts(ck, toArrayBuffer(boldBytes), toArrayBuffer(regularBytes));
    try {
      const spec = {
        lyrics: demoLyrics(),
        coverBytes: null,
        demoCoverLabel: true,
        width: 216,
        height: 384,
        params: defaultParams(),
        style: { ...defaultStyle(), title: 'Marea de luz', artist: 'Demo' },
        clipStartMs: 6000,
      };
      const pngA = renderSnapshotPng(ck, fonts, spec, 12500);
      const pngB = renderSnapshotPng(ck, fonts, spec, 12500);
      const pngIntro = renderSnapshotPng(ck, fonts, spec, 1500);

      // PNG signature bytes: 89 50 4E 47
      expect(Array.from(pngA.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(pngA.byteLength).toBeGreaterThan(5000);
      expect(pngA).toEqual(pngB);
      expect(pngIntro).not.toEqual(pngA);
    } finally {
      fonts.dispose();
    }
  });

  it('reconfigures style/params in place without resetting engine clock when lyrics/cover contents match', async () => {
    const ck = await CanvasKitInit({ locateFile: () => wasmPath });
    const fonts = new Fonts(ck, toArrayBuffer(boldBytes), toArrayBuffer(regularBytes));
    const renderer = new CanvasKitRenderer(ck, fonts);
    try {
      const lyrics = demoLyrics();
      const coverA = Uint8Array.of(1, 2, 3);
      const coverB = Uint8Array.of(1, 2, 3);
      renderer.configure({
        lyrics: { lines: lyrics.lines, credit: lyrics.credit, writers: lyrics.writers },
        coverBytes: coverA,
        demoCoverLabel: true,
        width: 216,
        height: 384,
        params: defaultParams(),
        style: defaultStyle(),
        clipStartMs: 6000,
      });
      renderer.seek(7000);
      renderer.step(1 / 60, true);
      const tBefore = renderer.currentTimeMs();

      renderer.configure({
        lyrics: { lines: lyrics.lines, credit: lyrics.credit, writers: lyrics.writers },
        coverBytes: coverB,
        demoCoverLabel: true,
        width: 216,
        height: 384,
        params: { ...defaultParams(), wob: 0.55 },
        style: { ...defaultStyle(), bloom: false },
        clipStartMs: 6000,
      });
      expect(renderer.currentTimeMs()).toBe(tBefore);
    } finally {
      renderer.dispose();
      fonts.dispose();
    }
  });

  it('renders deterministic wordfx frames (adaptBg, glow, particles, debug labels) distinct from plain render', async () => {
    const ck = await CanvasKitInit({ locateFile: () => wasmPath });
    const fonts = new Fonts(ck, toArrayBuffer(boldBytes), toArrayBuffer(regularBytes));
    try {
      const lyrics = demoLyrics();
      const fxPlan = buildFxPlan(lyrics, {
        intensity: 1.2,
        adaptBg: true,
        trackId: 'test-demo',
        palette: [
          [28, 36, 68],
          [110, 140, 210],
          [220, 180, 120],
        ],
      });
      expect(Object.keys(fxPlan.words).length).toBeGreaterThan(0);

      const baseSpec = {
        lyrics,
        coverBytes: null,
        demoCoverLabel: true,
        width: 216,
        height: 384,
        params: defaultParams(),
        style: { ...defaultStyle(), title: 'Marea de luz', artist: 'Demo' },
        clipStartMs: 6000,
      };
      const firstWord = Object.values(fxPlan.words)[0];
      const activeMs = firstWord ? firstWord.match.beginMs + 180 : 12500;

      const plainPng = renderSnapshotPng(ck, fonts, { ...baseSpec, fxPlan: null }, activeMs);
      const fxPngA = renderSnapshotPng(
        ck,
        fonts,
        { ...baseSpec, fxPlan, fxDebug: false },
        activeMs,
      );
      const fxPngB = renderSnapshotPng(
        ck,
        fonts,
        { ...baseSpec, fxPlan, fxDebug: false },
        activeMs,
      );
      const debugPng = renderSnapshotPng(
        ck,
        fonts,
        { ...baseSpec, fxPlan, fxDebug: true },
        activeMs,
      );

      expect(fxPngA.byteLength).toBeGreaterThan(5000);
      expect(fxPngA).toEqual(fxPngB);
      expect(fxPngA).not.toEqual(plainPng);
      expect(debugPng).not.toEqual(fxPngA);
    } finally {
      fonts.dispose();
    }
  });
});
