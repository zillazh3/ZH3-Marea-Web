import type { CanvasKit, Font, TextBlob, Typeface } from 'canvaskit-wasm';
import type { Item, Word } from '@/engine/items';

export const DESIGN_PX = 42;
export const LINE_H = 1.25;
export const PAD_V = 0.4;
export const PAD_L = 1.0;
export const PAD_R = 0.15;
export const BG_SCALE = 0.7;
export const BG_PAD_TOP = 0.3;
export const LETTER_SPACING = -0.012;
export const CREDIT_SCALE = 0.42;
export const CREDIT_GAP_TOP = 1.1;

const TEXT_CACHE_MAX = 2048;
const FONT_CACHE_MAX = 256;
const BASELINE_CACHE_MAX = 128;

export interface GlyphRun {
  readonly ids: Uint16Array;
  readonly xs: readonly number[];
  readonly width: number;
}

export interface TextRun {
  readonly blob: TextBlob;
  readonly width: number;
}

export interface PositionedWord {
  readonly word: Word;
  readonly x: number;
  readonly width: number;
}

export interface CreditWord {
  readonly word: string;
  readonly x: number;
  readonly bold: boolean;
}

export interface CreditLayout {
  readonly blocks: readonly (readonly (readonly CreditWord[])[])[];
  readonly csize: number;
  readonly height: number;
}

function must<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`CanvasKit failed to create ${what}.`);
  return value;
}

/**
 * Unshaped font & text-blob cache mirroring `marea/render/text.py`.
 * Uses bundled Inter Tight TTF bytes with cmap glyphs, manual advances, no kerning, and -0.012 em letter-spacing.
 */
export class Fonts {
  private readonly ck: CanvasKit;
  private readonly boldFace: Typeface;
  private readonly regularFace: Typeface;
  private readonly fontCache = new Map<string, Font>();
  private readonly textCache = new Map<string, TextRun>();
  private readonly baselineCache = new Map<number, number>();
  private disposed = false;

  constructor(ck: CanvasKit, boldData: ArrayBuffer, regularData: ArrayBuffer) {
    this.ck = ck;
    this.boldFace = must(ck.Typeface.MakeTypefaceFromData(boldData), 'bold typeface');
    this.regularFace = must(ck.Typeface.MakeTypefaceFromData(regularData), 'regular typeface');
  }

  font(size: number, bold = true): Font {
    const key = `${String(size)}|${bold ? '1' : '0'}`;
    let font = this.fontCache.get(key);
    if (!font) {
      if (this.fontCache.size >= FONT_CACHE_MAX) {
        for (const cached of this.fontCache.values()) cached.delete();
        this.fontCache.clear();
      }
      font = new this.ck.Font(bold ? this.boldFace : this.regularFace, size);
      font.setSubpixel(true);
      font.setLinearMetrics(true);
      font.setHinting(this.ck.FontHinting.None);
      font.setEdging(this.ck.FontEdging.AntiAlias);
      this.fontCache.set(key, font);
    }
    return font;
  }

  /** Glyph IDs, manual X advances with -0.012 em letter-spacing, and total advance width. */
  glyphs(str: string, size: number, bold = true): GlyphRun {
    const font = this.font(size, bold);
    const ids = font.getGlyphIDs(str);
    const widths = font.getGlyphWidths(ids);
    const ls = LETTER_SPACING * size;
    const xs: number[] = [];
    let x = 0;
    for (const w of widths) {
      xs.push(x);
      x += w + ls;
    }
    return { ids, xs, width: x };
  }

  /** Cached unshaped `TextBlob` and width for a single-line run. */
  text(str: string, size: number, bold = true): TextRun {
    const key = `${str}\0${String(size)}\0${bold ? '1' : '0'}`;
    const existing = this.textCache.get(key);
    if (existing) {
      // Refresh LRU position.
      this.textCache.delete(key);
      this.textCache.set(key, existing);
      return existing;
    }
    const { ids, xs, width } = this.glyphs(str, size, bold);
    const xforms = new Float32Array(ids.length * 4);
    for (let i = 0; i < ids.length; i += 1) {
      xforms[i * 4] = 1;
      xforms[i * 4 + 2] = xs[i] ?? 0;
    }
    const blob = must(
      this.ck.TextBlob.MakeFromRSXformGlyphs(ids, xforms, this.font(size, bold)),
      'TextBlob',
    );
    const run: TextRun = { blob, width };
    this.textCache.set(key, run);
    if (this.textCache.size > TEXT_CACHE_MAX) {
      const oldest = this.textCache.keys().next();
      if (!oldest.done) {
        const evicted = this.textCache.get(oldest.value);
        this.textCache.delete(oldest.value);
        evicted?.blob.delete();
      }
    }
    return run;
  }

  /** Width without letter-spacing, matching Skia `font.measureText(str)` used in the header. */
  measurePlain(str: string, size: number, bold = true): number {
    const font = this.font(size, bold);
    const ids = font.getGlyphIDs(str);
    const widths = font.getGlyphWidths(ids);
    let total = 0;
    for (const w of widths) total += w;
    return total;
  }

  /** Plain `TextBlob` without -0.012 em letter-spacing (used by `drawString` equivalents). */
  plainBlob(str: string, size: number, bold = true): TextBlob {
    const font = this.font(size, bold);
    return must(this.ck.TextBlob.MakeFromText(str, font), 'plain TextBlob');
  }

  /** Distance from top of the `LINE_H * size` box to the baseline. */
  baseline(size: number): number {
    let b = this.baselineCache.get(size);
    if (b === undefined) {
      const m = this.font(size, true).getMetrics();
      b = (LINE_H * size - (m.descent - m.ascent)) / 2 - m.ascent;
      if (this.baselineCache.size >= BASELINE_CACHE_MAX) this.baselineCache.clear();
      this.baselineCache.set(size, b);
    }
    return b;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.textCache.values()) entry.blob.delete();
    this.textCache.clear();
    for (const font of this.fontCache.values()) font.delete();
    this.fontCache.clear();
    this.baselineCache.clear();
    this.boldFace.delete();
    this.regularFace.delete();
  }
}

/** Greedy word wrap matching `marea/render/text.py:layout_block`. */
export function layoutBlock(
  words: readonly Word[],
  fonts: Fonts,
  size: number,
  avail: number,
): { rows: PositionedWord[][]; widths: number[] } {
  if (words.length === 0) return { rows: [], widths: [] };
  const space = fonts.text(' ', size).width;
  const rows: PositionedWord[][] = [[]];
  const widths: number[] = [0];
  for (const w of words) {
    let ww = 0;
    for (const p of w.parts) ww += fonts.text(p.text, size).width;
    let lastRow = rows[rows.length - 1];
    let lastW = widths[widths.length - 1] ?? 0;
    if (lastRow && lastRow.length > 0 && lastW + space + ww > avail) {
      lastRow = [];
      rows.push(lastRow);
      widths.push(0);
      lastW = 0;
    }
    const x = lastW + (lastRow && lastRow.length > 0 ? space : 0);
    lastRow?.push({ word: w, x, width: ww });
    widths[widths.length - 1] = x + ww;
  }
  return { rows, widths };
}

export function creditLines(
  writers: readonly string[],
  credit: string,
): readonly [string, string][] {
  const candidates: [string, string][] = [
    ['Written by', writers.join(', ')],
    ['Provided by', credit],
  ];
  return candidates.filter(([, text]) => Boolean(text));
}

export function layoutCredit(
  lines: readonly [string, string][],
  fonts: Fonts,
  size: number,
  avail: number,
): CreditLayout {
  const csize = CREDIT_SCALE * size;
  const space = fonts.text(' ', csize, false).width;
  const blocks: CreditWord[][][] = [];
  for (const [label, text] of lines) {
    const rows: CreditWord[][] = [[]];
    let x = 0;
    const labelWords = label
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => ({ word, bold: false }));
    const textWords = text
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => ({ word, bold: true }));
    for (const { word, bold } of [...labelWords, ...textWords]) {
      const w = fonts.text(word, csize, bold).width;
      let lastRow = rows[rows.length - 1];
      if (lastRow && lastRow.length > 0 && x + space + w > avail) {
        lastRow = [];
        rows.push(lastRow);
        x = 0;
      }
      x += lastRow && lastRow.length > 0 ? space : 0;
      lastRow?.push({ word, x, bold });
      x += w;
    }
    blocks.push(rows);
  }
  const nRows = blocks.reduce((sum, r) => sum + r.length, 0);
  const height =
    blocks.length > 0
      ? CREDIT_GAP_TOP * size +
        nRows * LINE_H * csize +
        (blocks.length - 1) * 0.35 * csize +
        PAD_V * size
      : 0;
  return { blocks, csize, height };
}

export class ItemLayout {
  readonly size: number;
  readonly width: number;
  readonly padL: number;
  readonly padR: number;
  readonly bgSize: number;
  readonly main: PositionedWord[][];
  readonly mainW: number[];
  readonly bg: PositionedWord[][];
  readonly bgW: number[];
  readonly mainH: number;
  readonly bgH: number;
  readonly hInactive: number;
  readonly hActive: number;

  constructor(item: Item, fonts: Fonts, size: number, width: number) {
    this.size = size;
    this.width = width;
    this.padL = item.duet ? PAD_R * width : PAD_L * size;
    this.padR = item.duet ? PAD_L * size : PAD_R * width;
    const avail = width - this.padL - this.padR;
    this.bgSize = BG_SCALE * size;
    const mainRes = layoutBlock(
      item.words.filter((w) => !w.bg),
      fonts,
      size,
      avail,
    );
    this.main = mainRes.rows;
    this.mainW = mainRes.widths;
    const bgWords = item.words.filter((w) => w.bg);
    const bgRes = bgWords.length > 0 ? layoutBlock(bgWords, fonts, this.bgSize, avail) : null;
    this.bg = bgRes ? bgRes.rows : [];
    this.bgW = bgRes ? bgRes.widths : [];
    this.mainH = this.main.length * LINE_H * size;
    this.bgH = bgWords.length > 0 ? (BG_PAD_TOP + this.bg.length * LINE_H) * this.bgSize : 0;
    this.hInactive = 2 * PAD_V * size + this.mainH;
    this.hActive = this.hInactive + this.bgH;
  }
}
