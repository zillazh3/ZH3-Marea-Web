import type { CanvasKit, Image } from 'canvaskit-wasm';
import type { Rgb } from './style';
import type { Fonts } from './text';

const DEMO_BG: Rgb = [0x0d, 0x0b, 0x26];
const DEMO_COLORS: readonly Rgb[] = [
  [0x2b, 0x34, 0xe0],
  [0x6a, 0x2c, 0xff],
  [0xb3, 0x9c, 0xff],
  [0x14, 0x10, 0x5e],
  [0x3f, 0x83, 0xff],
];

function color4f(rgb: Rgb, alpha: number): Float32Array {
  return Float32Array.of(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, alpha);
}

/**
 * Generates the prototype violet mesh cover (`marea/demo_cover.py`).
 * When `label` is false, omits "MAREA DE LUZ" (used as filler cover for projects without artwork).
 */
export function createDemoCover(ck: CanvasKit, fonts: Fonts, size = 600, label = true): Image {
  const surface = ck.MakeSurface(size, size);
  if (!surface) throw new Error('CanvasKit failed to create demo cover surface.');
  try {
    const canvas = surface.getCanvas();
    canvas.clear(color4f(DEMO_BG, 1));

    const rect = ck.XYWHRect(0, 0, size, size);
    const paint = new ck.Paint();
    DEMO_COLORS.forEach((col, i) => {
      const sp = 0.05 + i * 0.013;
      const ph = i * 1.7;
      const r = 0.55 + (i % 3) * 0.15;
      const x = size * (0.5 + 0.38 * Math.sin(12 * sp + ph));
      const y = size * (0.5 + 0.38 * Math.cos(12 * sp * 1.3 + ph * 0.7));
      const shader = ck.Shader.MakeRadialGradient(
        [x, y],
        size * r,
        [color4f(col, 1), color4f(col, 0)],
        null,
        ck.TileMode.Clamp,
      );
      paint.setShader(shader);
      canvas.drawRect(rect, paint);
      paint.setShader(null);
      shader.delete();
    });

    const preBlur = surface.makeImageSnapshot();
    const blurSigma = size * 0.05;
    const blurFilter = ck.ImageFilter.MakeBlur(blurSigma, blurSigma, ck.TileMode.Clamp, null);
    paint.setImageFilter(blurFilter);
    canvas.drawImage(preBlur, 0, 0, paint);
    paint.setImageFilter(null);
    blurFilter.delete();
    preBlur.delete();

    if (label) {
      paint.setAntiAlias(true);
      paint.setColor(color4f([255, 255, 255], 235 / 255));
      const blob1 = fonts.plainBlob('MAREA', size * 0.097, true);
      const blob2 = fonts.plainBlob('DE LUZ', size * 0.097, true);
      canvas.drawTextBlob(blob1, size * 0.067, size * 0.8, paint);
      canvas.drawTextBlob(blob2, size * 0.067, size * 0.9, paint);
      blob1.delete();
      blob2.delete();
    }

    paint.delete();
    return surface.makeImageSnapshot();
  } finally {
    surface.dispose();
  }
}
