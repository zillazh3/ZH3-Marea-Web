import type { CanvasKit, Image } from 'canvaskit-wasm';
import type { Rgb } from './style';

const SAMPLE = 32;

/**
 * Computes up to `k` representative RGB colors from RGBA pixel bytes using 4-bit channel buckets,
 * ranked by `area * (0.3 + meanSaturation)` — exact port of `marea/wordfx/palette.py`.
 */
export function dominantColorsFromRgba(rgba: Uint8Array, k = 3): Rgb[] {
  const buckets = new Map<
    number,
    { count: number; rSum: number; gSum: number; bSum: number; satSum: number }
  >();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    let entry = buckets.get(key);
    if (!entry) {
      entry = { count: 0, rSum: 0, gSum: 0, bSum: 0, satSum: 0 };
      buckets.set(key, entry);
    }
    entry.count += 1;
    entry.rSum += r;
    entry.gSum += g;
    entry.bSum += b;
    entry.satSum += sat;
  }

  const ranked = [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      score: b.count * (0.3 + b.satSum / b.count),
      b,
    }))
    .sort((a, b) => b.score - a.score || b.key - a.key);

  return ranked
    .slice(0, k)
    .map(({ b }) => [
      Math.trunc(b.rSum / b.count),
      Math.trunc(b.gSum / b.count),
      Math.trunc(b.bSum / b.count),
    ]);
}

/** Downsamples `cover` to 32x32 and extracts its top `k` dominant colors. */
export function dominantColors(ck: CanvasKit, cover: Image, k = 3): Rgb[] {
  const surface = ck.MakeSurface(SAMPLE, SAMPLE);
  if (!surface) return [];
  try {
    const canvas = surface.getCanvas();
    canvas.clear(ck.Color4f(0, 0, 0, 0));
    canvas.drawImageRectOptions(
      cover,
      ck.XYWHRect(0, 0, cover.width(), cover.height()),
      ck.XYWHRect(0, 0, SAMPLE, SAMPLE),
      ck.FilterMode.Linear,
      ck.MipmapMode.None,
      null,
    );
    const pixels = canvas.readPixels(0, 0, {
      width: SAMPLE,
      height: SAMPLE,
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    if (!(pixels instanceof Uint8Array)) return [];
    return dominantColorsFromRgba(pixels, k);
  } finally {
    surface.dispose();
  }
}
