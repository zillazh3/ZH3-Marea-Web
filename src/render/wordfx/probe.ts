import type { CanvasKit, Image, Surface } from 'canvaskit-wasm';
import type { Rgb } from '@/engine/wordfx/fxtypes';
import { pyRound } from '@/shared/pycompat';
import { CoverBackground, type CoverBgOptions } from '../background';

const PROBE_W = 32;
const PROBE_H = 56;
const PROBE_HZ = 10;

/**
 * Low-res background sampler (32x56 at 10 Hz with summed-area table) so adaptive wordfx contrast sees
 * the real cover animation behind any word box in O(1) per word. Mirrors `Scene._backdrop`.
 */
export class BackdropProbe {
  private readonly ck: CanvasKit;
  private readonly w: number;
  private readonly h: number;
  private readonly surface: Surface;
  private readonly smallBg: CoverBackground;
  private cachedAtS: number | null = null;
  private readonly sat = new Int32Array((PROBE_H + 1) * (PROBE_W + 1) * 3);
  private disposed = false;

  constructor(ck: CanvasKit, cover: Image, w: number, h: number, opts: CoverBgOptions) {
    this.ck = ck;
    this.w = w;
    this.h = h;
    const surf = ck.MakeSurface(PROBE_W, PROBE_H);
    if (!surf) throw new Error('CanvasKit failed to create backdrop probe surface.');
    this.surface = surf;
    this.smallBg = new CoverBackground(ck, cover, PROBE_W, PROBE_H, opts);
  }

  update(cover: Image, opts: CoverBgOptions): void {
    this.smallBg.update(cover, opts);
    this.cachedAtS = null;
  }

  invalidate(): void {
    this.cachedAtS = null;
  }

  sample(tSeconds: number, x: number, top: number, w: number, h: number): Rgb | null {
    const q = pyRound(tSeconds * PROBE_HZ) / PROBE_HZ;
    if (this.cachedAtS !== q) {
      const canvas = this.surface.getCanvas();
      canvas.clear(this.ck.Color4f(0, 0, 0, 1));
      this.smallBg.draw(canvas, q);
      this.surface.flush();
      const pixels = canvas.readPixels(0, 0, {
        width: PROBE_W,
        height: PROBE_H,
        colorType: this.ck.ColorType.RGBA_8888,
        alphaType: this.ck.AlphaType.Unpremul,
        colorSpace: this.ck.ColorSpace.SRGB,
      });
      if (!(pixels instanceof Uint8Array)) return null;

      this.sat.fill(0);
      const stride = (PROBE_W + 1) * 3;
      for (let y = 1; y <= PROBE_H; y += 1) {
        let rowR = 0;
        let rowG = 0;
        let rowB = 0;
        const pyOffset = (y - 1) * PROBE_W * 4;
        const rowBase = y * stride;
        const prevBase = (y - 1) * stride;
        for (let col = 1; col <= PROBE_W; col += 1) {
          const idx = pyOffset + (col - 1) * 4;
          rowR += pixels[idx] ?? 0;
          rowG += pixels[idx + 1] ?? 0;
          rowB += pixels[idx + 2] ?? 0;
          const outIdx = rowBase + col * 3;
          const aboveIdx = prevBase + col * 3;
          this.sat[outIdx] = (this.sat[aboveIdx] ?? 0) + rowR;
          this.sat[outIdx + 1] = (this.sat[aboveIdx + 1] ?? 0) + rowG;
          this.sat[outIdx + 2] = (this.sat[aboveIdx + 2] ?? 0) + rowB;
        }
      }
      this.cachedAtS = q;
    }

    const stride = (PROBE_W + 1) * 3;
    const x0 = Math.min(Math.trunc((Math.max(0.0, x) / this.w) * PROBE_W), PROBE_W - 1);
    const x1 = Math.min(
      PROBE_W,
      Math.max(Math.trunc((Math.min(this.w, x + w) / this.w) * PROBE_W) + 1, x0 + 1),
    );
    const y0 = Math.min(Math.trunc((Math.max(0.0, top) / this.h) * PROBE_H), PROBE_H - 1);
    const y1 = Math.min(
      PROBE_H,
      Math.max(Math.trunc((Math.min(this.h, top + h) / this.h) * PROBE_H) + 1, y0 + 1),
    );
    const i00 = y0 * stride + x0 * 3;
    const i01 = y0 * stride + x1 * 3;
    const i10 = y1 * stride + x0 * 3;
    const i11 = y1 * stride + x1 * 3;
    const area = (y1 - y0) * (x1 - x0);
    return [
      Math.trunc(
        ((this.sat[i11] ?? 0) -
          (this.sat[i01] ?? 0) -
          (this.sat[i10] ?? 0) +
          (this.sat[i00] ?? 0)) /
          area,
      ),
      Math.trunc(
        ((this.sat[i11 + 1] ?? 0) -
          (this.sat[i01 + 1] ?? 0) -
          (this.sat[i10 + 1] ?? 0) +
          (this.sat[i00 + 1] ?? 0)) /
          area,
      ),
      Math.trunc(
        ((this.sat[i11 + 2] ?? 0) -
          (this.sat[i01 + 2] ?? 0) -
          (this.sat[i10 + 2] ?? 0) +
          (this.sat[i00 + 2] ?? 0)) /
          area,
      ),
    ];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.smallBg.dispose();
    this.surface.dispose();
  }
}
