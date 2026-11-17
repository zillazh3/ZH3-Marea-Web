import type { Canvas, CanvasKit, MaskFilter, Paint, Shader, TextBlob } from 'canvaskit-wasm';
import type { Part, Word } from '@/engine/items';
import { TUNING } from '@/engine/tuning';
import { rgba4f } from './overlays';
import type { Rgb, Style } from './style';
import { LINE_H, type Fonts } from './text';

export const FW = 0.5;
const FW_SOFT = 1.3;
export const ORIGIN_SYL = 0.81;
export const ORIGIN_CH = 0.75;
const WHITE: Rgb = [255, 255, 255];

export interface WordDrawContext {
  readonly ck: CanvasKit;
  readonly fonts: Fonts;
  readonly style: Style;
  readonly k: number;
  readonly glowTint: Rgb;
  readonly pWhite: Paint;
  readonly pFill: Paint;
  readonly pWipeFill: Paint;
  readonly pGlow: Paint;
  readonly pWipeGlow: Paint;
  readonly pDstIn: Paint;
  readonly maskBlur: (sigma: number) => MaskFilter | null;
}

export function wipeShader(
  ck: CanvasKit,
  x: number,
  w: number,
  p: number,
  ba: number,
  da: number,
  size: number,
  a = 1,
  fw = FW,
  rgb: Rgb = WHITE,
): Shader {
  const x1 = x + p * (w + fw * size) - fw * size;
  return ck.Shader.MakeLinearGradient(
    [x1, 0],
    [x1 + fw * size, 0],
    [rgba4f(rgb, a * ba), rgba4f(rgb, a * da)],
    [0, 1],
    ck.TileMode.Clamp,
  );
}

function drawGlyphs(
  ctx: WordDrawContext,
  canvas: Canvas,
  u: Part,
  blob: TextBlob,
  x: number,
  base: number,
  pw: number,
  size: number,
  oy: number,
  textPaint: Paint,
  glowPaint: Paint | null,
): void {
  const ox = x + pw / 2;
  canvas.save();
  canvas.translate(ox + u.x * size, oy + u.y * size);
  canvas.scale(u.scale, u.scale);
  canvas.translate(-ox, -oy);

  if (u.motion === null) {
    if (glowPaint) canvas.drawTextBlob(blob, x, base, glowPaint);
    canvas.drawTextBlob(blob, x, base, textPaint);
  } else {
    let cx = x;
    const chars = Array.from(u.text);
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i] ?? '';
      const dy = u.motion.dy[i] ?? 0;
      const ds = u.motion.ds[i] ?? 0;
      const run = ctx.fonts.text(ch, size, true);
      canvas.save();
      canvas.translate(cx + run.width / 2, oy + dy * size);
      canvas.scale(1 + ds, 1 + ds);
      canvas.translate(-(cx + run.width / 2), -oy);
      if (glowPaint) canvas.drawTextBlob(run.blob, cx, base, glowPaint);
      canvas.drawTextBlob(run.blob, cx, base, textPaint);
      canvas.restore();
      cx += run.width;
    }
  }

  canvas.restore();
}

export function drawWord(
  ctx: WordDrawContext,
  canvas: Canvas,
  word: Word,
  x: number,
  lineTop: number,
  ww: number,
  size: number,
  ba: number,
  da: number,
): void {
  const base = lineTop + ctx.fonts.baseline(size);
  const tint = ctx.glowTint;
  const rgb = ctx.style.textRgb;
  const gg = ctx.style.glowGain;

  if (!word.emph) {
    const fw = word.soft ? FW_SOFT : FW;
    let cx = x;
    for (const u of word.parts) {
      const run = ctx.fonts.text(u.text, size, true);
      let textPaint: Paint;
      let glowPaint: Paint | null = null;
      let fillShader: Shader | null = null;
      let glowShader: Shader | null = null;

      if (u.p <= 0) {
        ctx.pFill.setShader(null);
        ctx.pFill.setColor(rgba4f(rgb, da));
        textPaint = ctx.pFill;
      } else if (u.p >= 1) {
        ctx.pFill.setShader(null);
        ctx.pFill.setColor(rgba4f(rgb, ba));
        textPaint = ctx.pFill;
        if (u.glowA > 0) {
          ctx.pGlow.setShader(null);
          ctx.pGlow.setColor(rgba4f(tint, u.glowA * gg * ba));
          ctx.pGlow.setMaskFilter(ctx.maskBlur((u.glowR * ctx.k) / 2));
          glowPaint = ctx.pGlow;
        }
      } else {
        fillShader = wipeShader(ctx.ck, cx, run.width, u.p, ba, da, size, 1, fw, rgb);
        ctx.pWipeFill.setColor(rgba4f(WHITE, 1));
        ctx.pWipeFill.setShader(fillShader);
        textPaint = ctx.pWipeFill;
        if (u.glowA > 0) {
          glowShader = wipeShader(ctx.ck, cx, run.width, u.p, ba, 0, size, u.glowA * gg, fw, tint);
          ctx.pWipeGlow.setColor(rgba4f(WHITE, 1));
          ctx.pWipeGlow.setShader(glowShader);
          ctx.pWipeGlow.setMaskFilter(ctx.maskBlur((u.glowR * ctx.k) / 2));
          glowPaint = ctx.pWipeGlow;
        }
      }

      drawGlyphs(
        ctx,
        canvas,
        u,
        run.blob,
        cx,
        base,
        run.width,
        size,
        lineTop + ORIGIN_SYL * size,
        textPaint,
        glowPaint,
      );

      if (fillShader) {
        ctx.pWipeFill.setShader(null);
        fillShader.delete();
      }
      if (glowShader) {
        ctx.pWipeGlow.setShader(null);
        glowShader.delete();
      }
      cx += run.width;
    }
    return;
  }

  const pad = TUNING.glowPadEm * size;
  const bounds = ctx.ck.LTRBRect(
    x - pad,
    lineTop - pad,
    x + ww + pad,
    lineTop + LINE_H * size + pad,
  );
  canvas.saveLayer(undefined, bounds);
  let cx = x;
  let filled = 0;
  for (const c of word.parts) {
    const run = ctx.fonts.text(c.text, size, true);
    let glowPaint: Paint | null = null;
    if (c.glowA > 0) {
      ctx.pGlow.setShader(null);
      ctx.pGlow.setColor(rgba4f(tint, c.glowA * gg));
      ctx.pGlow.setMaskFilter(ctx.maskBlur((c.glowR * ctx.k) / 2));
      glowPaint = ctx.pGlow;
    }
    drawGlyphs(
      ctx,
      canvas,
      c,
      run.blob,
      cx,
      base,
      run.width,
      size,
      lineTop + ORIGIN_CH * size,
      ctx.pWhite,
      glowPaint,
    );
    cx += run.width;
    filled += run.width * c.p;
  }
  const wordWipe = wipeShader(ctx.ck, x, ww, ww > 0 ? filled / ww : 0, ba, da, size);
  ctx.pDstIn.setShader(wordWipe);
  canvas.drawRect(bounds, ctx.pDstIn);
  ctx.pDstIn.setShader(null);
  wordWipe.delete();
  canvas.restore();
}
