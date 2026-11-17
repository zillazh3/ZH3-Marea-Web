import type { Canvas, CanvasKit, Image, Paint } from 'canvaskit-wasm';

const LAYERS = [
  { period: 36, direction: 1, alpha: 1.0, phase: 0.0, zoom: 1.0 },
  { period: 28, direction: -1, alpha: 0.55, phase: 2.1, zoom: 1.7 },
  { period: 40, direction: 1, alpha: 0.5, phase: 4.2, zoom: 1.3 },
  { period: 24, direction: -1, alpha: 0.4, phase: 5.3, zoom: 2.2 },
] as const;

const RES = 192;
const BLUR = 0.08;
const DRIFT = 0.1;
const SCALE_SWING = 0.12;
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

export interface CoverBgOptions {
  blur: number;
  veil: number;
  sat: number;
  speed: number;
}

/**
 * Apple Music-style animated cover background (`marea/render/background.py`).
 * Pre-blurs and saturates 4 low-res cover crops once, then transforms and composites per frame.
 */
export class CoverBackground {
  private readonly ck: CanvasKit;
  private cover: Image;
  private w: number;
  private h: number;
  private drift: number;
  private size: number;
  private opts: CoverBgOptions;
  private layers: Image[] = [];
  private readonly layerPaints: Paint[];
  private disposed = false;

  constructor(ck: CanvasKit, cover: Image, w: number, h: number, opts: CoverBgOptions) {
    this.ck = ck;
    this.cover = cover;
    this.w = w;
    this.h = h;
    const diag = Math.hypot(w, h);
    this.drift = DRIFT * diag;
    this.size = (diag + 2 * this.drift) / (1 - SCALE_SWING);
    this.opts = { ...opts };
    this.layerPaints = LAYERS.map((layer) => {
      const p = new ck.Paint();
      p.setAlphaf(layer.alpha);
      return p;
    });
    this.rebuildLayers();
  }

  update(cover: Image, opts: CoverBgOptions): void {
    const needsRebuild =
      cover !== this.cover || opts.blur !== this.opts.blur || opts.sat !== this.opts.sat;
    this.cover = cover;
    this.opts = { ...opts };
    if (needsRebuild) this.rebuildLayers();
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const diag = Math.hypot(w, h);
    this.drift = DRIFT * diag;
    this.size = (diag + 2 * this.drift) / (1 - SCALE_SWING);
    this.rebuildLayers();
  }

  private rebuildLayers(): void {
    this.deleteLayers();
    const ck = this.ck;
    const sigma = (BLUR * this.opts.blur * this.w * RES) / this.size;
    const cw = this.cover.width();
    const ch = this.cover.height();
    const side = Math.min(cw, ch);

    const sat = this.opts.sat;
    const inv = 1 - sat;
    const colorFilter = ck.ColorFilter.MakeMatrix([
      LUMA_R * inv + sat,
      LUMA_G * inv,
      LUMA_B * inv,
      0,
      0,
      LUMA_R * inv,
      LUMA_G * inv + sat,
      LUMA_B * inv,
      0,
      0,
      LUMA_R * inv,
      LUMA_G * inv,
      LUMA_B * inv + sat,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
    ]);
    const blurFilter = ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Mirror, null);
    const paint = new ck.Paint();
    paint.setColorFilter(colorFilter);
    paint.setImageFilter(blurFilter);

    const dst = ck.XYWHRect(0, 0, RES, RES);
    for (const layer of LAYERS) {
      const surface = ck.MakeSurface(RES, RES);
      if (!surface) throw new Error('CanvasKit failed to create background layer surface.');
      const srcSide = side / layer.zoom;
      const src = ck.XYWHRect((cw - srcSide) / 2, (ch - srcSide) / 2, srcSide, srcSide);
      surface
        .getCanvas()
        .drawImageRectOptions(
          this.cover,
          src,
          dst,
          ck.FilterMode.Linear,
          ck.MipmapMode.None,
          paint,
        );
      this.layers.push(surface.makeImageSnapshot());
      surface.dispose();
    }

    paint.delete();
    blurFilter.delete();
    colorFilter.delete();
  }

  draw(canvas: Canvas, tSeconds: number): void {
    const ck = this.ck;
    const t = tSeconds * this.opts.speed;
    const src = ck.XYWHRect(0, 0, RES, RES);
    const dst = ck.XYWHRect(-this.size / 2, -this.size / 2, this.size, this.size);

    for (let i = 0; i < LAYERS.length; i += 1) {
      const layer = LAYERS[i];
      const img = this.layers[i];
      const paint = this.layerPaints[i];
      if (!layer || !img || !paint) continue;
      const a = (2 * Math.PI * t) / layer.period + layer.phase;
      const scale = 1 + SCALE_SWING * Math.sin(a * 1.3 + layer.phase);
      canvas.save();
      canvas.translate(
        this.w / 2 + this.drift * Math.sin(a),
        this.h / 2 + this.drift * Math.cos(a * 0.8),
      );
      canvas.rotate((layer.direction * 360 * t) / (3 * layer.period), 0, 0);
      canvas.scale(scale, scale);
      canvas.drawImageRectOptions(img, src, dst, ck.FilterMode.Linear, ck.MipmapMode.None, paint);
      canvas.restore();
    }

    canvas.drawColor(ck.Color4f(0, 0, 0, this.opts.veil));
  }

  private deleteLayers(): void {
    for (const img of this.layers) img.delete();
    this.layers = [];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.deleteLayers();
    for (const paint of this.layerPaints) paint.delete();
  }
}
