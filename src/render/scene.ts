import type {
  Canvas,
  CanvasKit,
  Image,
  ImageFilter,
  MaskFilter,
  Paint,
  Shader,
} from 'canvaskit-wasm';
import { Engine } from '@/engine/engine';
import type { Item, Word } from '@/engine/items';
import type { Line, Lyrics } from '@/engine/lyrics';
import type { Params } from '@/engine/params';
import { TUNING } from '@/engine/tuning';
import type { FxPlanData } from '@/engine/wordfx/fxtypes';
import { planInterludeColor, planStrainAt } from '@/engine/wordfx/planLookup';
import { pyRound } from '@/shared/pycompat';
import { CoverBackground } from './background';
import { WordfxRenderCaches } from './wordfx/caches';
import {
  buildWordFxMap,
  drawSceneFxWord,
  isWordFxIdle,
  type WordFxAttachment,
} from './wordfx/carrier';
import { drawDebugLabel } from './wordfx/draw';
import { BackdropProbe } from './wordfx/probe';
import {
  disposeHeaderCache,
  disposeWaveCache,
  drawCredit,
  drawGap,
  drawHeader,
  drawWatermark,
  mixWhite,
  rgba4f,
  type HeaderCache,
  type WaveCache,
} from './overlays';
import { dominantColors } from './palette';
import type { Rgb, Style } from './style';
import {
  BG_PAD_TOP,
  DESIGN_PX,
  ItemLayout,
  LINE_H,
  PAD_V,
  creditLines,
  layoutCredit,
  type CreditLayout,
  type Fonts,
} from './text';
import { drawWord } from './wordDraw';

const BLOOM: readonly (readonly [number, number])[] = [
  [0.28, 0.16],
  [0.06, 0.22],
];
const BLOOM_STEPS = 16;
const CACHE_LIMIT = 256;
const WHITE: Rgb = [255, 255, 255];

export interface LyricsWithCredit extends Lyrics {
  readonly credit?: string;
  readonly writers?: readonly string[];
}

export interface StageRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Port of `marea/render/scene.py`: renders one frame from `Engine` state onto a CanvasKit `Canvas`.
 */
export class Scene {
  readonly ck: CanvasKit;
  readonly w: number;
  readonly h: number;
  readonly ref: number;
  readonly size: number;
  readonly k: number;
  readonly stage: StageRect;
  readonly engine: Engine;

  private style: Style;
  private readonly fonts: Fonts;
  private readonly cover: Image;
  private readonly bg: CoverBackground;
  private readonly byLine = new Map<Line, Item>();
  private readonly layouts = new Map<Item, ItemLayout>();
  private readonly creditLayout: CreditLayout;

  private readonly pWhite: Paint;
  private readonly pFill: Paint;
  private readonly pWipeFill: Paint;
  private readonly pGlow: Paint;
  private readonly pWipeGlow: Paint;
  private readonly pDstIn: Paint;
  private readonly pLayer: Paint;
  private readonly pStroke: Paint;
  private readonly stageFadeShader: Shader;
  private readonly stageFadePaint: Paint;

  private readonly bloomCache = new Map<string, ImageFilter>();
  private readonly maskBlurCache = new Map<number, MaskFilter>();
  private readonly blurFilterCache = new Map<number, ImageFilter>();
  private headerCache: HeaderCache | null = null;
  private waveCache: WaveCache | null = null;
  private glowTint: Rgb | null = null;
  private fxPlan: FxPlanData | null = null;
  private fxDebug = false;
  private fxByWord = new WeakMap<Word, WordFxAttachment>();
  private fxCaches: WordfxRenderCaches | null = null;
  private probe: BackdropProbe | null = null;
  private readonly lineIndexByRef = new Map<object, number>();
  private disposed = false;

  clipStartMs: number | null = null;

  constructor(
    ck: CanvasKit,
    fonts: Fonts,
    lyrics: LyricsWithCredit,
    cover: Image,
    w: number,
    h: number,
    params: Params,
    style: Style,
    fxPlan: FxPlanData | null = null,
    fxDebug = false,
  ) {
    this.ck = ck;
    this.fonts = fonts;
    this.cover = cover;
    this.w = w;
    this.h = h;
    this.style = { ...style };

    this.bg = new CoverBackground(ck, cover, w, h, {
      blur: style.bgBlur,
      veil: style.bgVeil,
      sat: style.bgSat,
      speed: style.bgSpeed,
    });

    this.ref = Math.min(w, 0.8 * h);
    this.size = style.fontFrac * this.ref;
    this.k = this.size / DESIGN_PX;
    const stageW = Math.min(0.94 * w, 1.2 * h);
    this.stage = { x: (w - stageW) / 2, y: 0.16 * h, w: stageW, h: 0.72 * h };

    this.stageFadeShader = ck.Shader.MakeLinearGradient(
      [0, 0],
      [0, this.stage.h],
      [rgba4f(WHITE, 0), rgba4f(WHITE, 1), rgba4f(WHITE, 1), rgba4f(WHITE, 0)],
      [0, 0.06, 0.9, 1],
      ck.TileMode.Clamp,
    );
    this.stageFadePaint = new ck.Paint();
    this.stageFadePaint.setBlendMode(ck.BlendMode.DstIn);
    this.stageFadePaint.setShader(this.stageFadeShader);

    this.pWhite = new ck.Paint();
    this.pWhite.setAntiAlias(true);
    this.pWhite.setColor(rgba4f(style.textRgb, 1));

    this.pFill = new ck.Paint();
    this.pFill.setAntiAlias(true);
    this.pWipeFill = new ck.Paint();
    this.pWipeFill.setAntiAlias(true);
    this.pGlow = new ck.Paint();
    this.pGlow.setAntiAlias(true);
    this.pWipeGlow = new ck.Paint();
    this.pWipeGlow.setAntiAlias(true);
    this.pDstIn = new ck.Paint();
    this.pDstIn.setBlendMode(ck.BlendMode.DstIn);
    this.pLayer = new ck.Paint();
    this.pLayer.setAntiAlias(true);
    this.pStroke = new ck.Paint();
    this.pStroke.setAntiAlias(true);
    this.pStroke.setStyle(ck.PaintStyle.Stroke);
    this.pStroke.setStrokeCap(ck.StrokeCap.Round);
    this.pStroke.setStrokeJoin(ck.StrokeJoin.Round);

    const credit = style.credit ? creditLines(lyrics.writers ?? [], lyrics.credit ?? '') : [];
    const availCredit = stageW - 1.0 * this.size - 0.15 * stageW;
    this.creditLayout = layoutCredit(credit, fonts, this.size, availCredit);

    this.engine = new Engine(lyrics, (line, active) => this.measureLine(line, active), {
      stageH: this.stage.h,
      fontPx: this.size,
      params,
      creditH: this.creditLayout.height,
    });
    for (let li = 0; li < lyrics.lines.length; li += 1) {
      const l = lyrics.lines[li];
      if (l) this.lineIndexByRef.set(l, li);
    }
    for (const item of this.engine.items) {
      if (!item.isGap && !item.isCredit && item.line) {
        this.byLine.set(item.line, item);
      }
    }
    this.setWordfx(fxPlan, fxDebug);
  }

  /** Attaches or clears semantic wordfx plan without rebuilding scene geometry or engine state. */
  setWordfx(fxPlan: FxPlanData | null, fxDebug = false): void {
    if (this.fxPlan !== fxPlan) {
      this.fxPlan = fxPlan;
      this.fxByWord = buildWordFxMap(fxPlan, this.engine.items, this.lineIndexByRef);
    }
    this.fxDebug = fxDebug;
  }

  private getFxCaches(): WordfxRenderCaches {
    this.fxCaches ??= new WordfxRenderCaches(this.ck);
    return this.fxCaches;
  }

  private getProbe(): BackdropProbe {
    this.probe ??= new BackdropProbe(this.ck, this.cover, this.w, this.h, {
      blur: this.style.bgBlur,
      veil: this.style.bgVeil,
      sat: this.style.bgSat,
      speed: this.style.bgSpeed,
    });
    return this.probe;
  }

  /** Updates style fields that do not require rebuilding geometry/engine. */
  updateStyle(next: Style): void {
    const glowChanged =
      next.glowRgb?.[0] !== this.style.glowRgb?.[0] ||
      next.glowRgb?.[1] !== this.style.glowRgb?.[1] ||
      next.glowRgb?.[2] !== this.style.glowRgb?.[2];
    if (
      glowChanged ||
      next.bloomGain !== this.style.bloomGain ||
      next.dimAlpha !== this.style.dimAlpha
    ) {
      this.clearBloomCache();
      this.glowTint = null;
    }
    this.style = { ...next };
    this.pWhite.setColor(rgba4f(next.textRgb, 1));
    this.bg.update(this.cover, {
      blur: next.bgBlur,
      veil: next.bgVeil,
      sat: next.bgSat,
      speed: next.bgSpeed,
    });
    this.probe?.update(this.cover, {
      blur: next.bgBlur,
      veil: next.bgVeil,
      sat: next.bgSat,
      speed: next.bgSpeed,
    });
  }

  private clearBloomCache(): void {
    for (const f of this.bloomCache.values()) f.delete();
    this.bloomCache.clear();
  }

  private getLayout(item: Item): ItemLayout {
    let lay = this.layouts.get(item);
    if (!lay) {
      lay = new ItemLayout(item, this.fonts, this.size, this.stage.w);
      this.layouts.set(item, lay);
    }
    return lay;
  }

  private measureLine(line: Line, active: boolean): number {
    const item = this.byLine.get(line);
    if (!item) return 0;
    const lay = this.getLayout(item);
    return active ? lay.hActive : lay.hInactive;
  }

  private maskBlur = (sigma: number): MaskFilter | null => {
    if (sigma <= 0.005) return null;
    const key = pyRound(sigma * 200);
    let mf = this.maskBlurCache.get(key);
    if (!mf) {
      if (this.maskBlurCache.size >= CACHE_LIMIT) {
        for (const v of this.maskBlurCache.values()) v.delete();
        this.maskBlurCache.clear();
      }
      mf = this.ck.MaskFilter.MakeBlur(this.ck.BlurStyle.Normal, Math.max(0.01, key / 200), true);
      this.maskBlurCache.set(key, mf);
    }
    return mf;
  };

  private blurFilter(sigma: number): ImageFilter | null {
    if (sigma <= 0.01) return null;
    const key = pyRound(sigma * 200);
    let bf = this.blurFilterCache.get(key);
    if (!bf) {
      if (this.blurFilterCache.size >= CACHE_LIMIT) {
        for (const v of this.blurFilterCache.values()) v.delete();
        this.blurFilterCache.clear();
      }
      const s = Math.max(0.01, key / 200);
      bf = this.ck.ImageFilter.MakeBlur(s, s, this.ck.TileMode.Decal, null);
      this.blurFilterCache.set(key, bf);
    }
    return bf;
  }

  private getGlowRgb(): Rgb {
    if (this.glowTint) return this.glowTint;
    if (this.style.glowRgb) {
      this.glowTint = this.style.glowRgb;
      return this.glowTint;
    }
    const dom = dominantColors(this.ck, this.cover, 1);
    const base: Rgb = dom[0] ?? WHITE;
    this.glowTint = mixWhite(base, TUNING.glowWhiteMix);
    return this.glowTint;
  }

  private bloomFilter(size: number, act: number): ImageFilter | null {
    const lvl = pyRound(Math.min(1, Math.max(0, act)) * BLOOM_STEPS);
    const bloomGain = TUNING.bloomGain * this.style.bloomGain;
    if (!this.style.bloom || lvl === 0 || bloomGain <= 0) return null;

    const key = `${String(size)}|${String(lvl)}`;
    let filter = this.bloomCache.get(key);
    if (filter) return filter;
    if (this.bloomCache.size >= CACHE_LIMIT) this.clearBloomCache();

    const ck = this.ck;
    const k = lvl / BLOOM_STEPS;
    const dim = this.style.dimAlpha;
    const da = dim + (TUNING.unsungAlphaActive - dim) * k;
    const ba = dim + (1 - dim) * k;
    const gain = 1 / (ba - da);

    const cf = ck.ColorFilter.MakeMatrix([
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      gain,
      -da * gain,
    ]);
    const onlySung = ck.ImageFilter.MakeColorFilter(cf, null);
    const outerRgb = this.getGlowRgb();
    const innerRgb = mixWhite(outerRgb, 0.5);
    const [b0, b1] = BLOOM;
    if (!b0 || !b1) return null;
    const h0 = ck.ImageFilter.MakeDropShadowOnly(
      0,
      0,
      (b0[0] * size) / 2,
      (b0[0] * size) / 2,
      rgba4f(outerRgb, Math.min(1, b0[1] * bloomGain * k)),
      onlySung,
    );
    const h1 = ck.ImageFilter.MakeDropShadowOnly(
      0,
      0,
      (b1[0] * size) / 2,
      (b1[0] * size) / 2,
      rgba4f(innerRgb, Math.min(1, b1[1] * bloomGain * k)),
      onlySung,
    );
    const halos = ck.ImageFilter.MakeBlend(ck.BlendMode.SrcOver, h0, h1);
    const pass = ck.ImageFilter.MakeOffset(0, 0, null);
    filter = ck.ImageFilter.MakeBlend(ck.BlendMode.SrcOver, halos, pass);

    cf.delete();
    onlySung.delete();
    h0.delete();
    h1.delete();
    halos.delete();
    pass.delete();
    this.bloomCache.set(key, filter);
    return filter;
  }

  render(canvas: Canvas): void {
    const ck = this.ck;
    const st = this.stage;

    this.bg.draw(canvas, this.engine.t);
    this.headerCache = drawHeader(
      ck,
      canvas,
      this.fonts,
      this.cover,
      this.style,
      this.ref,
      this.h,
      st.x,
      st.x + st.w,
      this.pFill,
      this.headerCache,
    );

    const stageRect = ck.XYWHRect(0, 0, st.w, st.h);
    canvas.save();
    canvas.clipRect(ck.XYWHRect(st.x, st.y, st.w, st.h), ck.ClipOp.Intersect, false);
    canvas.translate(st.x, st.y);
    canvas.saveLayer(undefined, stageRect);
    for (const item of this.engine.items) this.drawItem(canvas, item);
    canvas.drawRect(stageRect, this.stageFadePaint);
    canvas.restore();
    canvas.restore();

    this.waveCache = drawWatermark(
      ck,
      canvas,
      this.fonts,
      this.style,
      this.engine,
      this.w,
      this.h,
      this.ref,
      st.x,
      st.y,
      this.clipStartMs,
      (it) => this.getLayout(it),
      this.pGlow,
      this.pFill,
      this.pStroke,
      this.maskBlur,
      this.waveCache,
    );
  }

  private drawItem(canvas: Canvas, item: Item): void {
    if (item.isGap && item.groupOpacity < 0.001) return;
    const sigma = item.blur * this.k;
    const m = 0.6 * this.size + 3 * sigma;
    if (item.y.p + item.h < -m || item.y.p > this.stage.h + m) return;

    const ck = this.ck;
    canvas.save();
    canvas.translate(0, item.y.p);
    const ox = item.duet && !item.isGap ? this.stage.w : 0;
    canvas.translate(ox, item.h / 2);
    canvas.scale(item.s.p, item.s.p);
    canvas.translate(-ox, -item.h / 2);

    const layered = item.opacity < 0.999 || sigma > 0.01;
    if (layered) {
      this.pLayer.setAlphaf(item.opacity);
      this.pLayer.setImageFilter(this.blurFilter(sigma));
      canvas.saveLayer(this.pLayer, ck.LTRBRect(-m, -m, this.stage.w + m, item.h + m));
    }

    if (item.isGap) {
      const dotRgb: Rgb =
        this.fxPlan !== null && this.fxPlan.intensity > 0.0
          ? planInterludeColor(this.fxPlan, this.engine.t)
          : WHITE;
      drawGap(canvas, item, this.size, this.stage.w, this.pGlow, this.pFill, this.maskBlur, dotRgb);
    } else if (item.isCredit) {
      drawCredit(canvas, this.fonts, this.creditLayout, this.size, this.pFill);
    } else {
      this.drawLine(canvas, item, this.getLayout(item));
    }

    if (layered) canvas.restore();
    canvas.restore();
  }

  private drawLine(canvas: Canvas, item: Item, lay: ItemLayout): void {
    const ck = this.ck;
    const size = lay.size;
    const dim = this.style.dimAlpha;
    const ba = dim + (1 - dim) * item.act;
    const da = dim + (TUNING.unsungAlphaActive - dim) * item.act;
    const bloom = this.bloomFilter(size, item.act);
    const m = (BLOOM[0]?.[0] ?? 0.28) * size * 2;
    const top = PAD_V * size;

    if (bloom) {
      this.pLayer.setAlphaf(1);
      this.pLayer.setImageFilter(bloom);
      canvas.saveLayer(this.pLayer, ck.LTRBRect(-m, -m, lay.width + m, item.h + m));
    }
    this.drawBlock(canvas, item, lay, lay.main, lay.mainW, size, top, ba, da);
    if (bloom) canvas.restore();

    if (lay.bg.length > 0 && item.bgOp > 0.003) {
      const boxTop = top + lay.mainH;
      const ox = item.duet ? lay.width - lay.padR : lay.padL;
      canvas.save();
      canvas.translate(ox, boxTop - 0.8 * lay.bgH * (1 - item.bgP));
      canvas.scale(0.8 + 0.2 * item.bgP, 0.8 + 0.2 * item.bgP);
      canvas.translate(-ox, -boxTop);
      this.pLayer.setAlphaf(0.4 * item.bgOp);
      this.pLayer.setImageFilter(bloom);
      canvas.saveLayer(
        this.pLayer,
        ck.LTRBRect(-m, boxTop - m, lay.width + m, boxTop + lay.bgH + m),
      );
      this.drawBlock(
        canvas,
        item,
        lay,
        lay.bg,
        lay.bgW,
        lay.bgSize,
        boxTop + BG_PAD_TOP * lay.bgSize,
        ba,
        da,
      );
      canvas.restore();
      canvas.restore();
    }
  }

  private drawBlock(
    canvas: Canvas,
    item: Item,
    lay: ItemLayout,
    rows: readonly (readonly { word: Word; x: number; width: number }[])[],
    widths: readonly number[],
    size: number,
    top: number,
    ba: number,
    da: number,
  ): void {
    const wordCtx = {
      ck: this.ck,
      fonts: this.fonts,
      style: this.style,
      k: this.k,
      glowTint: this.getGlowRgb(),
      pWhite: this.pWhite,
      pFill: this.pFill,
      pWipeFill: this.pWipeFill,
      pGlow: this.pGlow,
      pWipeGlow: this.pWipeGlow,
      pDstIn: this.pDstIn,
      maskBlur: this.maskBlur,
    };
    const plan = this.fxPlan;
    const fxActive = plan !== null && plan.intensity > 0.0;
    const tNow = this.engine.t;
    const strainNow = fxActive ? planStrainAt(plan, tNow) : 0.0;
    const fxEnv = fxActive
      ? {
          ck: this.ck,
          canvas,
          caches: this.getFxCaches(),
          fonts: this.fonts,
          engine: this.engine,
          plan,
          probe: plan.adaptBg ? this.getProbe() : null,
          pDstIn: this.pDstIn,
          stageLeft: this.stage.x,
          stageTop: this.stage.y,
          ref: this.ref,
          k: this.k,
        }
      : null;

    rows.forEach((row, ri) => {
      const rw = widths[ri] ?? 0;
      const x0 = item.duet ? lay.width - lay.padR - rw : lay.padL;
      const lt = top + ri * LINE_H * size;
      for (const box of row) {
        const attach = fxEnv ? this.fxByWord.get(box.word) : undefined;
        const fxItem = attach?.fx ?? attach?.fxLayer ?? null;
        if (
          fxEnv === null ||
          fxItem === null ||
          isWordFxIdle(box.word, fxItem, tNow, strainNow, this.fxDebug)
        ) {
          drawWord(wordCtx, canvas, box.word, x0 + box.x, lt, box.width, size, ba, da);
          continue;
        }
        drawSceneFxWord(
          fxEnv,
          item,
          box.word,
          fxItem,
          x0 + box.x,
          lt,
          box.width,
          size,
          ba,
          da,
          strainNow,
        );
        if (this.fxDebug && attach?.fx) {
          drawDebugLabel(
            canvas,
            fxEnv.caches,
            this.fonts,
            attach.fx,
            x0 + box.x,
            box.width,
            lt + this.fonts.baseline(size),
            size,
          );
        }
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.fxCaches?.dispose();
    this.fxCaches = null;
    this.probe?.dispose();
    this.probe = null;
    this.clearBloomCache();
    for (const mf of this.maskBlurCache.values()) mf.delete();
    this.maskBlurCache.clear();
    for (const bf of this.blurFilterCache.values()) bf.delete();
    this.blurFilterCache.clear();
    disposeHeaderCache(this.headerCache);
    disposeWaveCache(this.waveCache);
    this.stageFadePaint.delete();
    this.stageFadeShader.delete();
    this.pWhite.delete();
    this.pFill.delete();
    this.pWipeFill.delete();
    this.pGlow.delete();
    this.pWipeGlow.delete();
    this.pDstIn.delete();
    this.pLayer.delete();
    this.pStroke.delete();
    this.bg.dispose();
  }
}
