import type {
  CanvasKit,
  ColorFilter,
  Image,
  ImageFilter,
  MaskFilter,
  Paint,
  TextBlob,
} from 'canvaskit-wasm';
import { FX } from '@/engine/wordfx/config';
import type { Rgb } from '@/engine/wordfx/fxtypes';
import { rgba4f } from '../overlays';
import type { Fonts } from '../text';

export const HALO_SIGMA = 0.035;
export const GRAIN_VARIANTS = 16;
export const GRAIN_TILE = 128;
export const CENTER_Y = 0.35;
export const CHROMA_MIN_PX = 0.3;
export const BLUR_MIN_PX = 0.4;
export const WHITE: Rgb = [255, 255, 255];

export interface LetterBox {
  readonly ch: string;
  readonly x: number;
  readonly w: number;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function backdropDarkFactor(backdrop: Rgb | null): number {
  if (backdrop === null) return 1.0;
  const luma = (0.2126 * backdrop[0] + 0.7152 * backdrop[1] + 0.0722 * backdrop[2]) / 255.0;
  return luma >= 0.38 ? 0.0 : (0.38 - luma) / 0.38;
}

export function glowTier(glowSpread: number): 0 | 1 | 2 {
  if (glowSpread < 0.3) return 0;
  if (glowSpread < 0.6) return 1;
  return 2;
}

function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const hit = map.get(key);
  if (hit !== undefined) {
    map.delete(key);
    map.set(key, hit);
  }
  return hit;
}

function lruSet<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  limit: number,
  disposeValue?: (v: V) => void,
): void {
  map.set(key, value);
  if (map.size > limit) {
    const oldest = map.keys().next();
    if (!oldest.done) {
      const evicted = map.get(oldest.value);
      map.delete(oldest.value);
      if (evicted !== undefined && disposeValue) disposeValue(evicted);
    }
  }
}

export class WordfxRenderCaches {
  readonly ck: CanvasKit;
  readonly pFill: Paint;
  readonly pStroke: Paint;
  readonly pHalo: Paint;
  readonly pCore: Paint;
  readonly pBody: Paint;
  readonly pBodyPlus: Paint;
  readonly pLayer: Paint;
  readonly pGlow: Paint;
  readonly pPlus: Paint;
  readonly pGrain: Paint;
  readonly pStreak: Paint;

  private readonly maskBlurCache = new Map<number, MaskFilter>();
  private readonly wordBlurCache = new Map<number, ImageFilter>();
  private readonly tintCfCache = new Map<number, ColorFilter>();
  private readonly lettersCache = new Map<string, readonly LetterBox[]>();
  private readonly blobsCache = new Map<string, readonly TextBlob[]>();
  private readonly glowSprites = new Map<string, { img: Image; pad: number }>();
  private readonly grainTiles = new Map<number, Image>();
  private disposed = false;

  constructor(ck: CanvasKit) {
    this.ck = ck;
    this.pFill = new ck.Paint();
    this.pFill.setAntiAlias(true);
    this.pStroke = new ck.Paint();
    this.pStroke.setAntiAlias(true);
    this.pStroke.setStyle(ck.PaintStyle.Stroke);
    this.pHalo = new ck.Paint();
    this.pHalo.setAntiAlias(true);
    this.pCore = new ck.Paint();
    this.pCore.setAntiAlias(true);
    this.pBody = new ck.Paint();
    this.pBody.setAntiAlias(true);
    this.pBodyPlus = new ck.Paint();
    this.pBodyPlus.setAntiAlias(true);
    this.pBodyPlus.setBlendMode(ck.BlendMode.Plus);
    this.pLayer = new ck.Paint();
    this.pLayer.setAntiAlias(true);
    this.pGlow = new ck.Paint();
    this.pGlow.setAntiAlias(true);
    this.pPlus = new ck.Paint();
    this.pPlus.setAntiAlias(true);
    this.pPlus.setBlendMode(ck.BlendMode.Plus);
    this.pGrain = new ck.Paint();
    this.pGrain.setBlendMode(ck.BlendMode.SrcATop);
    this.pStreak = new ck.Paint();
    this.pStreak.setAntiAlias(true);
  }

  maskBlur(sigmaQ: number): MaskFilter {
    const key = Math.round(Math.max(0.01, sigmaQ) * 100);
    const hit = lruGet(this.maskBlurCache, key);
    if (hit) return hit;
    const mf = this.ck.MaskFilter.MakeBlur(
      this.ck.BlurStyle.Normal,
      Math.max(0.01, key / 100),
      true,
    );
    lruSet(this.maskBlurCache, key, mf, 256, (v) => {
      v.delete();
    });
    return mf;
  }

  wordBlur(sigmaQ: number): ImageFilter {
    const key = Math.round(Math.max(0.01, sigmaQ) * 100);
    const hit = lruGet(this.wordBlurCache, key);
    if (hit) return hit;
    const s = Math.max(0.01, key / 100);
    const bf = this.ck.ImageFilter.MakeBlur(s, s, this.ck.TileMode.Decal, null);
    lruSet(this.wordBlurCache, key, bf, 128, (v) => {
      v.delete();
    });
    return bf;
  }

  tintCf(rgb: Rgb): ColorFilter {
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    const hit = lruGet(this.tintCfCache, key);
    if (hit) return hit;
    const cf = this.ck.ColorFilter.MakeBlend(rgba4f(rgb, 1), this.ck.BlendMode.SrcIn);
    lruSet(this.tintCfCache, key, cf, 512, (v) => {
      v.delete();
    });
    return cf;
  }

  lettersFor(fonts: Fonts, text: string, size: number): readonly LetterBox[] {
    const key = `${text}\0${String(size)}`;
    const hit = lruGet(this.lettersCache, key);
    if (hit) return hit;
    const out: LetterBox[] = [];
    let x = 0;
    for (const ch of Array.from(text)) {
      const w = fonts.text(ch, size, true).width;
      out.push({ ch, x, w });
      x += w;
    }
    lruSet(this.lettersCache, key, out, 2048);
    return out;
  }

  wordBlobs(fonts: Fonts, text: string, size: number): readonly TextBlob[] {
    const key = `${text}\0${String(size)}`;
    const hit = lruGet(this.blobsCache, key);
    if (hit) return hit;
    const out = Array.from(text).map((ch) => fonts.text(ch, size, true).blob);
    lruSet(this.blobsCache, key, out, 2048);
    return out;
  }

  glowSprite(
    fonts: Fonts,
    ch: string,
    size: number,
    w: number,
    tier: 0 | 1 | 2,
  ): { img: Image; pad: number } {
    const sigmaEm = FX.glowSigmas[tier];
    const key = `${ch}\0${String(size)}\0${String(tier)}`;
    const hit = lruGet(this.glowSprites, key);
    if (hit) return hit;

    const sigma = sigmaEm * size;
    const pad = Math.ceil(3 * sigma);
    const surfW = Math.max(1, Math.ceil(w) + 2 * pad);
    const surfH = Math.max(1, Math.ceil((FX.glowAsc + FX.glowDesc) * size) + 2 * pad);
    const surf = this.ck.MakeSurface(surfW, surfH);
    if (!surf) {
      throw new Error('CanvasKit failed to allocate glow sprite surface.');
    }
    const p = new this.ck.Paint();
    p.setAntiAlias(true);
    p.setColor(rgba4f(WHITE, 1));
    p.setMaskFilter(this.maskBlur(sigma));
    surf.getCanvas().drawTextBlob(fonts.text(ch, size, true).blob, pad, pad + FX.glowAsc * size, p);
    p.delete();
    const img = surf.makeImageSnapshot();
    surf.dispose();
    const entry = { img, pad };
    lruSet(this.glowSprites, key, entry, 240, (v) => {
      v.img.delete();
    });
    return entry;
  }

  grainTile(variant: number): Image {
    const idx = ((variant % GRAIN_VARIANTS) + GRAIN_VARIANTS) % GRAIN_VARIANTS;
    const hit = lruGet(this.grainTiles, idx);
    if (hit) return hit;
    const surf = this.ck.MakeSurface(GRAIN_TILE, GRAIN_TILE);
    if (!surf) {
      throw new Error('CanvasKit failed to allocate grain tile surface.');
    }
    const shader = this.ck.Shader.MakeFractalNoise(0.9, 0.9, 1, idx * 7 + 1, 0, 0);
    const paint = new this.ck.Paint();
    paint.setShader(shader);
    surf.getCanvas().drawPaint(paint);
    paint.delete();
    shader.delete();
    const img = surf.makeImageSnapshot();
    surf.dispose();
    this.grainTiles.set(idx, img);
    return img;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mf of this.maskBlurCache.values()) mf.delete();
    this.maskBlurCache.clear();
    for (const bf of this.wordBlurCache.values()) bf.delete();
    this.wordBlurCache.clear();
    for (const cf of this.tintCfCache.values()) cf.delete();
    this.tintCfCache.clear();
    for (const g of this.glowSprites.values()) g.img.delete();
    this.glowSprites.clear();
    for (const img of this.grainTiles.values()) img.delete();
    this.grainTiles.clear();
    this.lettersCache.clear();
    this.blobsCache.clear();
    this.pFill.delete();
    this.pStroke.delete();
    this.pHalo.delete();
    this.pCore.delete();
    this.pBody.delete();
    this.pBodyPlus.delete();
    this.pLayer.delete();
    this.pGlow.delete();
    this.pPlus.delete();
    this.pGrain.delete();
    this.pStreak.delete();
  }
}
