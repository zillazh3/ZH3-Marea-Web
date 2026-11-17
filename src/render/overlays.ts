import type { Canvas, CanvasKit, Image, MaskFilter, Paint, Path, TextBlob } from 'canvaskit-wasm';
import type { Engine } from '@/engine/engine';
import type { Item } from '@/engine/items';
import { pyRound } from '@/shared/pycompat';
import type { Rgb, Style } from './style';
import type { CreditLayout, Fonts, ItemLayout } from './text';
import { LINE_H } from './text';

export const WM_SIZE = 0.022;
export const WM_FADE_MS = 600;
export const WM_BASELINE = 0.835;
export const WM_RIGHT_MARGIN = 0.17;
export const WM_DODGE = 0.7;

const CREDIT_GAP_TOP = 1.1;
const PAD_L = 1.0;

export function rgba4f(rgb: Rgb, alpha: number): Float32Array {
  return Float32Array.of(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, Math.min(1, Math.max(0, alpha)));
}

export interface HeaderEntry {
  readonly blob: TextBlob;
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
}

export interface HeaderCache {
  key: string;
  entries: HeaderEntry[];
}

export interface WaveCache {
  key: string;
  items: { path: Path; strokeWidth: number }[];
}

export function disposeHeaderCache(cache: HeaderCache | null): void {
  if (!cache) return;
  for (const e of cache.entries) e.blob.delete();
}

export function disposeWaveCache(cache: WaveCache | null): void {
  if (!cache) return;
  for (const w of cache.items) w.path.delete();
}

export function drawHeader(
  ck: CanvasKit,
  canvas: Canvas,
  fonts: Fonts,
  cover: Image,
  style: Style,
  ref: number,
  h: number,
  stageLeft: number,
  stageRight: number,
  paint: Paint,
  prevCache: HeaderCache | null,
): HeaderCache {
  const cs = 0.14 * ref;
  const hx = stageLeft + 0.04 * ref;
  const hy = 0.06 * h;
  const box = ck.XYWHRect(hx, hy, cs, cs);
  const rrect = ck.RRectXY(box, cs * 0.14, cs * 0.14);

  canvas.save();
  canvas.clipRRect(rrect, ck.ClipOp.Intersect, true);
  canvas.drawImageRectOptions(
    cover,
    ck.XYWHRect(0, 0, cover.width(), cover.height()),
    box,
    ck.FilterMode.Linear,
    ck.MipmapMode.None,
    null,
  );
  canvas.restore();

  const key = `${style.title}\0${style.artist}\0${String(ref)}\0${String(stageLeft)}\0${String(stageRight)}`;
  let cache = prevCache;
  if (cache?.key !== key) {
    disposeHeaderCache(cache);
    const tx = hx + cs + 0.035 * ref;
    const avail = stageRight - 0.04 * ref - tx;
    const specs: [string, number, number, number, boolean][] = [
      [style.title, 0.04 * ref, 0.45, 1, true],
      [style.artist, 0.032 * ref, 0.8, 0.62, false],
    ];
    const entries: HeaderEntry[] = [];
    for (const [raw, sz, baseFrac, alpha, bold] of specs) {
      if (!raw) continue;
      let text = raw;
      while (fonts.measurePlain(text, sz, bold) > avail && text.length > 1) {
        text = `${text.slice(0, -2)}…`;
      }
      entries.push({
        blob: fonts.plainBlob(text, sz, bold),
        x: tx,
        y: hy + cs * baseFrac,
        alpha,
      });
    }
    cache = { key, entries };
  }

  for (const e of cache.entries) {
    paint.setColor(rgba4f([255, 255, 255], e.alpha));
    paint.setShader(null);
    paint.setMaskFilter(null);
    canvas.drawTextBlob(e.blob, e.x, e.y, paint);
  }
  return cache;
}

export function drawCredit(
  canvas: Canvas,
  fonts: Fonts,
  creditLayout: CreditLayout,
  size: number,
  fillPaint: Paint,
): void {
  const { blocks, csize } = creditLayout;
  let y = CREDIT_GAP_TOP * size;
  const boldColor = rgba4f([255, 255, 255], 0.62);
  const regColor = rgba4f([255, 255, 255], 0.38);
  const baseOffset = fonts.baseline(csize);

  fillPaint.setShader(null);
  fillPaint.setMaskFilter(null);

  for (const rows of blocks) {
    for (const row of rows) {
      const base = y + baseOffset;
      for (const word of row) {
        const run = fonts.text(word.word, csize, word.bold);
        fillPaint.setColor(word.bold ? boldColor : regColor);
        canvas.drawTextBlob(run.blob, PAD_L * size + word.x, base, fillPaint);
      }
      y += LINE_H * csize;
    }
    y += 0.35 * csize;
  }
}

export function drawGap(
  canvas: Canvas,
  item: Item,
  size: number,
  stageW: number,
  pGlow: Paint,
  pFill: Paint,
  maskBlur: (sigma: number) => MaskFilter | null,
): void {
  const d = 0.32 * size;
  const gap = 0.24 * size;
  const gw = 3 * d + 2 * gap;
  const left = item.duet ? stageW - 0.15 * stageW - gw : size;
  const cy = item.h / 2;
  const white: Rgb = [255, 255, 255];

  pGlow.setShader(null);
  pFill.setShader(null);
  pFill.setMaskFilter(null);

  canvas.save();
  canvas.translate(left + gw / 2, cy);
  canvas.scale(item.groupScale, item.groupScale);
  canvas.translate(-gw / 2, 0);

  item.dots.forEach((dot, i) => {
    canvas.save();
    canvas.translate(i * (d + gap) + d / 2, dot.y * size);
    canvas.scale(dot.scale, dot.scale);
    if (dot.haloA > 0) {
      pGlow.setColor(rgba4f(white, dot.haloA * dot.op * item.groupOpacity));
      pGlow.setMaskFilter(maskBlur((dot.haloR * size) / 2));
      canvas.drawCircle(0, 0, d / 2, pGlow);
    }
    pFill.setColor(rgba4f(white, dot.op * item.groupOpacity));
    canvas.drawCircle(0, 0, d / 2, pFill);
    canvas.restore();
  });

  canvas.restore();
}

function watermarkDodge(
  box: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  sz: number,
  engine: Engine,
  stageLeft: number,
  stageTop: number,
  getLayout: (item: Item) => ItemLayout,
): number {
  let worst = 0;
  const m = 0.5 * sz;
  for (const item of engine.items) {
    if (item.isGap || item.act < 0.05) continue;
    const lay = getLayout(item);
    const top = stageTop + item.y.p;
    const v =
      (Math.min(top + item.h, box.bottom + m) - Math.max(top, box.top - m)) / (box.height + 2 * m);
    const maxMain = lay.mainW.length > 0 ? Math.max(...lay.mainW) : 0;
    const maxBg = lay.bgW.length > 0 ? Math.max(...lay.bgW) : 0;
    const tw = Math.max(maxMain, maxBg);
    const x1 = stageLeft + (item.duet ? lay.width - lay.padR : lay.padL + tw);
    const hx = (Math.min(x1, box.right + m) - Math.max(x1 - tw, box.left - m)) / (0.5 * box.width);
    const clampedV = Math.min(1, Math.max(0, v));
    const clampedH = Math.min(1, Math.max(0, hx));
    worst = Math.max(worst, item.act * clampedV * clampedH);
  }
  return worst;
}

export function drawWatermark(
  ck: CanvasKit,
  canvas: Canvas,
  fonts: Fonts,
  style: Style,
  engine: Engine,
  w: number,
  h: number,
  ref: number,
  stageLeft: number,
  stageTop: number,
  clipStartMs: number | null,
  getLayout: (item: Item) => ItemLayout,
  pGlow: Paint,
  pFill: Paint,
  pStroke: Paint,
  maskBlur: (sigma: number) => MaskFilter | null,
  prevWaveCache: WaveCache | null,
): WaveCache | null {
  if (!style.wmText.trim()) return prevWaveCache;
  const sz = WM_SIZE * h;
  const gw = style.wmGlyph ? 1.5 * sz : 0;
  const textRun = fonts.text(style.wmText, sz, true);
  const boxW = gw + (gw > 0 ? 0.5 * sz : 0) + textRun.width;
  const boxLeft =
    style.wmSide === 'right' ? w - WM_RIGHT_MARGIN * ref - boxW : stageLeft + 0.04 * ref;
  const baseLine = WM_BASELINE * h;
  const box = {
    left: boxLeft,
    top: baseLine - sz,
    right: boxLeft + boxW,
    bottom: baseLine + 0.25 * sz,
    width: boxW,
    height: 1.25 * sz,
  };

  const fade = clipStartMs === null ? 1 : (engine.t * 1000 - clipStartMs) / WM_FADE_MS;
  const dodge = watermarkDodge(box, sz, engine, stageLeft, stageTop, getLayout);
  const alpha = style.wmAlpha * Math.min(1, Math.max(0, fade)) * (1 - WM_DODGE * dodge);
  if (alpha < 0.003) return prevWaveCache;

  const tx = box.left + (box.width - textRun.width);
  const base = box.top + sz;

  pGlow.setShader(null);
  pGlow.setColor(rgba4f([0, 0, 0], alpha * 0.9));
  pGlow.setMaskFilter(maskBlur(0.25 * sz));
  canvas.drawTextBlob(textRun.blob, tx, base + 0.06 * sz, pGlow);

  pFill.setShader(null);
  pFill.setMaskFilter(null);
  pFill.setColor(rgba4f([255, 255, 255], alpha));
  canvas.drawTextBlob(textRun.blob, tx, base, pFill);

  if (!style.wmGlyph) return prevWaveCache;

  const cy = base - 0.35 * sz;
  const waveW = 1.5 * sz;
  const key = `${String(box.left)}|${String(cy)}|${String(waveW)}|${String(sz)}`;
  let waveCache = prevWaveCache;
  if (waveCache?.key !== key) {
    disposeWaveCache(waveCache);
    const waveSpecs: [number, number][] = [
      [-0.34, 0.07],
      [0, 0.12],
      [0.34, 0.07],
    ];
    const items = waveSpecs.map(([dy, thick], idx) => {
      const builder = new ck.PathBuilder();
      for (let s = 0; s <= 16; s += 1) {
        const px = box.left + (waveW * s) / 16;
        const py = cy + dy * sz + 0.1 * sz * Math.sin(((s / 16) * 2 + idx * 0.3) * Math.PI);
        if (s === 0) builder.moveTo(px, py);
        else builder.lineTo(px, py);
      }
      const path = builder.snapshot();
      builder.delete();
      return { path, strokeWidth: thick * sz };
    });
    waveCache = { key, items };
  }

  pStroke.setColor(rgba4f([255, 255, 255], alpha));
  for (const item of waveCache.items) {
    pStroke.setStrokeWidth(item.strokeWidth);
    canvas.drawPath(item.path, pStroke);
  }
  return waveCache;
}

export function mixWhite(rgb: Rgb, mix: number): Rgb {
  return [
    pyRound(rgb[0] + (255 - rgb[0]) * mix),
    pyRound(rgb[1] + (255 - rgb[1]) * mix),
    pyRound(rgb[2] + (255 - rgb[2]) * mix),
  ];
}
