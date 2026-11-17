import type { BlendMode, Canvas, MaskFilter, Path } from 'canvaskit-wasm';
import { wordParticles, type Particle } from '@/engine/wordfx/anim';
import { adaptFxParams } from '@/engine/wordfx/contrast';
import type { CarrierWord, FxParams, FxWordEntry, Rgb } from '@/engine/wordfx/fxtypes';
import { rgba4f } from '../overlays';
import {
  HALO_SIGMA,
  WHITE,
  backdropDarkFactor,
  clamp01,
  type LetterBox,
  type WordfxRenderCaches,
} from './caches';

const DEG_TO_RAD = Math.PI / 180;

function makeStarPath(
  caches: WordfxRenderCaches,
  x: number,
  y: number,
  rx: number,
  ry: number,
  waist = 0,
): Path {
  const wx = rx * waist;
  const wy = ry * waist;
  const b = new caches.ck.PathBuilder();
  b.moveTo(x, y - ry);
  b.quadTo(x + wx, y - wy, x + rx, y);
  b.quadTo(x + wx, y + wy, x, y + ry);
  b.quadTo(x - wx, y + wy, x - rx, y);
  b.quadTo(x - wx, y - wy, x, y - ry);
  b.close();
  return b.detachAndDelete();
}

function makeTeardropPath(
  caches: WordfxRenderCaches,
  topY: number,
  botY: number,
  waistX: number,
  waistY: number,
): Path {
  const b = new caches.ck.PathBuilder();
  b.moveTo(0, topY);
  b.quadTo(waistX, waistY, 0, botY);
  b.quadTo(-waistX, waistY, 0, topY);
  b.close();
  return b.detachAndDelete();
}

function drawGlowOrb(
  canvas: Canvas,
  caches: WordfxRenderCaches,
  px: number,
  py: number,
  r: number,
  color: Rgb,
  haloMul: number,
  haloA: number,
  bodyMul: number,
  bodyA: number,
  coreCol: Rgb,
  coreMul: number,
  coreA: number,
  haloMode: BlendMode,
  bodyMode: BlendMode,
  coreMode: BlendMode,
): void {
  caches.pHalo.setBlendMode(haloMode);
  caches.pHalo.setColor(rgba4f(color, clamp01(haloA)));
  canvas.drawCircle(px, py, r * haloMul, caches.pHalo);
  caches.pFill.setBlendMode(bodyMode);
  caches.pFill.setColor(rgba4f(color, clamp01(bodyA)));
  canvas.drawCircle(px, py, r * bodyMul, caches.pFill);
  caches.pCore.setBlendMode(coreMode);
  caches.pCore.setColor(rgba4f(coreCol, clamp01(coreA)));
  canvas.drawCircle(px, py, coreMul, caches.pCore);
}

function drawStreakLine(
  canvas: Canvas,
  caches: WordfxRenderCaches,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgb,
  strokeW: number,
  strokeA: number,
  coreCol: Rgb,
  coreA: number,
  coreR: number,
  mode: BlendMode,
): void {
  caches.pStroke.setBlendMode(mode);
  caches.pStroke.setStrokeCap(caches.ck.StrokeCap.Round);
  caches.pStroke.setStrokeWidth(strokeW);
  caches.pStroke.setColor(rgba4f(color, clamp01(strokeA)));
  canvas.drawLine(x0, y0, x1, y1, caches.pStroke);
  caches.pCore.setBlendMode(mode);
  caches.pCore.setColor(rgba4f(coreCol, clamp01(coreA)));
  canvas.drawCircle(x0, y0, coreR, caches.pCore);
}

function drawSpark(
  canvas: Canvas,
  caches: WordfxRenderCaches,
  q: Particle,
  px: number,
  py: number,
  r: number,
  size: number,
  halo: MaskFilter,
  darkFactor: number,
  alphaScale: number,
): void {
  const a = clamp01(q.alpha * alphaScale);
  if (a < 0.01) return;
  const ck = caches.ck;
  const style = q.style || 'star';
  const plusMode = darkFactor > 0.25 ? ck.BlendMode.Plus : ck.BlendMode.SrcOver;
  const coreCol = q.coreColor ?? WHITE;
  caches.pHalo.setMaskFilter(halo);

  if (style === 'celestial') {
    caches.pHalo.setBlendMode(plusMode);
    caches.pHalo.setColor(rgba4f(q.color, a * (0.3 + 0.16 * darkFactor)));
    canvas.drawCircle(px, py, r * 2.15, caches.pHalo);
    const arm = r * (0.72 + 0.45 * a);
    const path = makeStarPath(caches, px, py, arm, arm, 0.05);
    caches.pFill.setBlendMode(plusMode);
    caches.pFill.setColor(rgba4f(q.color, clamp01(a * 1.15)));
    canvas.drawPath(path, caches.pFill);
    path.delete();
    if (r >= 0.11 * size) {
      const d = arm * 0.4;
      caches.pStroke.setBlendMode(plusMode);
      caches.pStroke.setColor(rgba4f(coreCol, a * 0.6));
      caches.pStroke.setStrokeWidth(Math.max(0.7, r * 0.08));
      caches.pStroke.setStrokeCap(ck.StrokeCap.Round);
      canvas.drawLine(px - d, py - d, px + d, py + d, caches.pStroke);
      canvas.drawLine(px - d, py + d, px + d, py - d, caches.pStroke);
    }
    caches.pCore.setBlendMode(plusMode);
    caches.pCore.setColor(rgba4f(coreCol, clamp01(a * 1.25)));
    canvas.drawCircle(px, py, Math.max(0.8, r * 0.26), caches.pCore);
  } else if (style === 'ember') {
    caches.pHalo.setBlendMode(plusMode);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.5));
    canvas.drawCircle(px, py, r * 1.85, caches.pHalo);
    drawStreakLine(
      canvas,
      caches,
      px,
      py,
      px,
      py - q.vyEm * 0.08 * size,
      q.color,
      Math.max(0.9, r * 0.5),
      a * 0.78,
      coreCol,
      a * 1.2,
      Math.max(0.9, r * 0.42),
      plusMode,
    );
  } else if (style === 'buoyant') {
    caches.pHalo.setBlendMode(plusMode);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.38));
    canvas.drawCircle(px, py, r * 1.55, caches.pHalo);
    const path = makeStarPath(caches, px, py, r * 0.85, r * (0.75 + 0.55 * a), 0.06);
    caches.pFill.setBlendMode(plusMode);
    caches.pFill.setColor(rgba4f(q.color, clamp01(a * 1.15)));
    canvas.drawPath(path, caches.pFill);
    path.delete();
    caches.pCore.setBlendMode(plusMode);
    caches.pCore.setColor(rgba4f(coreCol, clamp01(a * 1.15)));
    canvas.drawCircle(px, py, Math.max(0.8, r * 0.3), caches.pCore);
  } else if (style === 'bokeh') {
    drawGlowOrb(
      canvas,
      caches,
      px,
      py,
      r,
      q.color,
      1.75,
      a * 0.36,
      0.88,
      a * 0.42,
      coreCol,
      Math.max(0.8, r * 0.36),
      a * 0.68,
      plusMode,
      ck.BlendMode.SrcOver,
      plusMode,
    );
  } else if (style === 'flare') {
    caches.pHalo.setBlendMode(plusMode);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.48));
    canvas.drawOval(
      ck.LTRBRect(px - r * 1.9, py - r * 0.28, px + r * 1.9, py + r * 0.28),
      caches.pHalo,
    );
    caches.pCore.setBlendMode(plusMode);
    caches.pCore.setColor(rgba4f(coreCol, a * 0.82));
    canvas.drawCircle(px, py, Math.max(0.9, r * 0.52), caches.pCore);
  } else {
    caches.pHalo.setBlendMode(ck.BlendMode.SrcOver);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.7));
    canvas.drawCircle(px, py, r * 0.6, caches.pHalo);
    const arm = r * (0.5 + 0.5 * a);
    const path = makeStarPath(caches, px, py, arm, arm, 0);
    caches.pFill.setBlendMode(ck.BlendMode.SrcOver);
    caches.pFill.setColor(rgba4f(q.color, clamp01(a * 1.3)));
    canvas.drawPath(path, caches.pFill);
    path.delete();
  }
}

function drawParticle(
  canvas: Canvas,
  caches: WordfxRenderCaches,
  q: Particle,
  px: number,
  py: number,
  r: number,
  size: number,
  halo: MaskFilter,
  darkFactor: number,
  alphaScale: number,
): void {
  const a = clamp01(q.alpha * alphaScale);
  if (a < 0.01) return;
  if (q.kind === 'spark') {
    drawSpark(canvas, caches, q, px, py, r, size, halo, darkFactor, alphaScale);
    return;
  }

  const ck = caches.ck;
  const srcOver = ck.BlendMode.SrcOver;
  const plusMode = darkFactor > 0.25 ? ck.BlendMode.Plus : srcOver;
  caches.pFill.setBlendMode(srcOver);
  caches.pStroke.setBlendMode(srcOver);
  caches.pHalo.setBlendMode(srcOver);
  caches.pHalo.setMaskFilter(halo);
  caches.pCore.setBlendMode(srcOver);
  const kind = q.kind;

  if (kind === 'firefly') {
    drawGlowOrb(
      canvas,
      caches,
      px,
      py,
      r,
      q.color,
      2.6,
      a * 0.45,
      1.25,
      a * 0.85,
      [255, 250, 225],
      r * 0.65,
      a * 1.15,
      srcOver,
      srcOver,
      srcOver,
    );
  } else if (kind === 'petal') {
    canvas.save();
    canvas.translate(px, py);
    canvas.rotate(q.rotDeg, 0, 0);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.35));
    canvas.drawCircle(0, 0, r * 1.4, caches.pHalo);
    const path = makeTeardropPath(caches, -r * 1.35, r * 1.15, r * 0.95, -r * 0.15);
    caches.pFill.setColor(rgba4f(q.color, a));
    canvas.drawPath(path, caches.pFill);
    path.delete();
    canvas.restore();
  } else if (kind === 'leaf') {
    canvas.save();
    canvas.translate(px, py);
    canvas.rotate(q.rotDeg, 0, 0);
    const path = makeTeardropPath(caches, -r * 1.55, r * 1.35, r * 1.1, -r * 0.1);
    caches.pFill.setColor(rgba4f(q.color, a));
    canvas.drawPath(path, caches.pFill);
    path.delete();
    caches.pStroke.setColor(rgba4f([255, 240, 210], a * 0.45));
    caches.pStroke.setStrokeWidth(Math.max(0.7, r * 0.18));
    canvas.drawLine(0, -r * 1.15, 0, r * 1.25, caches.pStroke);
    canvas.restore();
  } else if (kind === 'snow') {
    canvas.save();
    canvas.translate(px, py);
    canvas.rotate(q.rotDeg, 0, 0);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.32));
    canvas.drawCircle(0, 0, r * 1.3, caches.pHalo);
    caches.pStroke.setColor(rgba4f(q.color, a));
    caches.pStroke.setStrokeWidth(Math.max(0.9, r * 0.24));
    caches.pStroke.setStrokeCap(ck.StrokeCap.Round);
    const arm = r * 1.15;
    for (const [dxU, dyU] of [
      [1.0, 0.0],
      [0.5, 0.8660254],
      [-0.5, 0.8660254],
    ] as const) {
      const dx = dxU * arm;
      const dy = dyU * arm;
      canvas.drawLine(-dx, -dy, dx, dy, caches.pStroke);
    }
    if (r >= 2.2) {
      caches.pCore.setColor(rgba4f(WHITE, a));
      canvas.drawCircle(0, 0, r * 0.28, caches.pCore);
    }
    canvas.restore();
  } else if (kind === 'ember') {
    canvas.save();
    canvas.translate(px, py);
    canvas.rotate(q.rotDeg, 0, 0);
    caches.pHalo.setBlendMode(darkFactor > 0.2 ? ck.BlendMode.Plus : srcOver);
    caches.pHalo.setColor(rgba4f(q.color, a * (0.46 + 0.16 * darkFactor)));
    canvas.drawCircle(0, 0, r * 2.4, caches.pHalo);
    const path = makeTeardropPath(caches, -r * 1.65, r * 0.92, r * 0.92, r * 0.24);
    caches.pFill.setColor(rgba4f(q.color, a));
    canvas.drawPath(path, caches.pFill);
    path.delete();
    const coreCol = q.coreColor ?? [255, 245, 200];
    caches.pCore.setBlendMode(plusMode);
    caches.pCore.setColor(rgba4f(coreCol, clamp01(a * 1.15)));
    canvas.drawCircle(0, r * 0.18, Math.max(0.8, r * 0.48), caches.pCore);
    canvas.restore();
  } else if (kind === 'raindrop' || kind === 'tear' || kind === 'crimson') {
    canvas.save();
    canvas.translate(px, py);
    canvas.rotate(q.rotDeg, 0, 0);
    const stretch = kind === 'raindrop' ? 1.0 + Math.min(0.45, Math.abs(q.vyEm) * 0.18) : 1.0;
    const topMul = (kind === 'tear' || kind === 'crimson' ? 2.05 : 1.65) * stretch;
    if (kind === 'tear' || kind === 'crimson') {
      caches.pHalo.setColor(rgba4f(q.color, a * 0.34));
      canvas.drawCircle(0, 0, r * 1.45, caches.pHalo);
    }
    const path = makeTeardropPath(caches, -r * topMul, r * 1.12, r * 0.98, r * 0.22);
    caches.pFill.setColor(rgba4f(q.color, a * (kind === 'crimson' ? 0.94 : 0.88)));
    canvas.drawPath(path, caches.pFill);
    path.delete();
    const glint: Rgb = kind === 'crimson' ? [255, 200, 210] : [240, 250, 255];
    caches.pCore.setColor(rgba4f(glint, a * 0.75));
    canvas.drawCircle(-r * 0.18, r * 0.35, r * 0.24, caches.pCore);
    canvas.restore();
  } else if (kind === 'ripple' || kind === 'stain') {
    const rx = r * 1.35;
    const ry = r * 0.36;
    const rect = ck.LTRBRect(px - rx, py - ry, px + rx, py + ry);
    if (kind === 'stain') {
      caches.pFill.setColor(rgba4f(q.color, a * 0.42));
      canvas.drawOval(rect, caches.pFill);
    }
    caches.pStroke.setColor(rgba4f(q.color, a * 0.8));
    caches.pStroke.setStrokeWidth(Math.max(0.8, r * 0.08));
    canvas.drawOval(rect, caches.pStroke);
  } else if (kind === 'bubble') {
    caches.pFill.setColor(rgba4f(q.color, a * 0.18));
    canvas.drawCircle(px, py, r * 1.05, caches.pFill);
    caches.pStroke.setColor(rgba4f(q.color, a * 0.85));
    caches.pStroke.setStrokeWidth(Math.max(0.8, r * 0.22));
    canvas.drawCircle(px, py, r * 1.05, caches.pStroke);
    caches.pCore.setColor(rgba4f(WHITE, a * 0.9));
    canvas.drawCircle(px - r * 0.35, py - r * 0.35, r * 0.25, caches.pCore);
  } else if (kind === 'mist') {
    caches.pHalo.setMaskFilter(caches.maskBlur(Math.max(1.5, r * 0.65)));
    caches.pHalo.setColor(rgba4f(q.color, a * 0.32));
    canvas.drawCircle(px - r * 0.32, py + r * 0.1, r * 1.18, caches.pHalo);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.28));
    canvas.drawCircle(px + r * 0.34, py - r * 0.1, r * 0.96, caches.pHalo);
  } else if (kind === 'shard') {
    canvas.save();
    canvas.translate(px, py);
    canvas.rotate(q.rotDeg, 0, 0);
    const b = new ck.PathBuilder();
    b.moveTo(0, -r * 1.5);
    b.lineTo(r * 0.85, r * 0.65);
    b.lineTo(-r * 0.55, r * 1.1);
    b.close();
    const path = b.detachAndDelete();
    caches.pFill.setColor(rgba4f(q.color, a * 0.85));
    canvas.drawPath(path, caches.pFill);
    path.delete();
    caches.pStroke.setColor(rgba4f(WHITE, a * 0.85));
    caches.pStroke.setStrokeWidth(Math.max(0.7, r * 0.16));
    canvas.drawLine(0, -r * 1.35, r * 0.65, r * 0.55, caches.pStroke);
    canvas.restore();
  } else if (kind === 'wisp') {
    const sp = Math.hypot(q.vxEm, q.vyEm);
    const ux = sp > 1e-4 ? q.vxEm / sp : 0.0;
    const uy = sp > 1e-4 ? q.vyEm / sp : -1.0;
    caches.pFill.setBlendMode(plusMode);
    for (const [step, rMul, aMul] of [
      [0.11, 0.38, 0.22],
      [0.055, 0.62, 0.44],
    ] as const) {
      caches.pFill.setColor(rgba4f(q.color, a * aMul));
      canvas.drawCircle(px - ux * step * size, py - uy * step * size, r * rMul, caches.pFill);
    }
    drawGlowOrb(
      canvas,
      caches,
      px,
      py,
      r,
      q.color,
      1.85,
      a * 0.38,
      0.68,
      a * 0.88,
      q.coreColor ?? WHITE,
      Math.max(0.8, r * 0.28),
      a * 0.95,
      plusMode,
      plusMode,
      plusMode,
    );
  } else if (kind === 'seed') {
    canvas.save();
    canvas.translate(px, py);
    canvas.rotate(q.rotDeg, 0, 0);
    caches.pStroke.setColor(rgba4f(q.color, a * 0.9));
    caches.pStroke.setStrokeWidth(Math.max(0.7, r * 0.18));
    caches.pStroke.setStrokeCap(ck.StrokeCap.Round);
    canvas.drawLine(0, -r * 0.35, 0, r * 1.15, caches.pStroke);
    for (const ang of [-42.0, 0.0, 42.0]) {
      const rad = ang * DEG_TO_RAD;
      canvas.drawLine(
        0,
        -r * 0.35,
        Math.sin(rad) * r * 1.05,
        -r * 0.35 - Math.cos(rad) * r * 1.05,
        caches.pStroke,
      );
    }
    canvas.restore();
  } else if (kind === 'prism') {
    canvas.save();
    canvas.translate(px, py);
    canvas.rotate(q.rotDeg, 0, 0);
    caches.pHalo.setBlendMode(plusMode);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.38));
    canvas.drawCircle(0, 0, r * 1.7, caches.pHalo);
    const path = makeStarPath(caches, 0, 0, r * 0.9, r * 1.45, 0.45);
    caches.pFill.setBlendMode(plusMode);
    caches.pFill.setColor(rgba4f(q.color, a * 0.88));
    canvas.drawPath(path, caches.pFill);
    path.delete();
    caches.pCore.setBlendMode(plusMode);
    caches.pCore.setColor(rgba4f(q.coreColor ?? [255, 250, 235], a));
    canvas.drawCircle(0, 0, Math.max(0.7, r * 0.26), caches.pCore);
    canvas.restore();
  } else if (kind === 'candle') {
    drawGlowOrb(
      canvas,
      caches,
      px,
      py,
      r,
      q.color,
      2.1,
      a * 0.45,
      0.85,
      a * 0.82,
      q.coreColor ?? [255, 242, 228],
      Math.max(0.8, r * 0.38),
      a,
      plusMode,
      srcOver,
      plusMode,
    );
  } else if (kind === 'gale') {
    canvas.save();
    canvas.translate(px, py);
    canvas.rotate(q.rotDeg, 0, 0);
    drawStreakLine(
      canvas,
      caches,
      r * 0.6,
      0,
      -r * 2.2,
      0,
      q.color,
      Math.max(0.8, r * 0.36),
      a * 0.72,
      q.coreColor ?? [242, 255, 215],
      a * 0.95,
      Math.max(0.8, r * 0.4),
      plusMode,
    );
    canvas.restore();
  } else if (kind === 'pollen') {
    drawGlowOrb(
      canvas,
      caches,
      px,
      py,
      r,
      q.color,
      1.9,
      a * 0.42,
      0.75,
      a * 0.92,
      q.coreColor ?? [255, 250, 215],
      Math.max(0.7, r * 0.34),
      a,
      plusMode,
      srcOver,
      plusMode,
    );
  } else if (kind === 'corona') {
    caches.pHalo.setBlendMode(plusMode);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.48));
    canvas.drawCircle(px, py, r * 2.3, caches.pHalo);
    const path = makeStarPath(caches, px, py, r * 1.05, r * 0.65, 0.18);
    caches.pFill.setBlendMode(plusMode);
    caches.pFill.setColor(rgba4f(q.color, a * 0.86));
    canvas.drawPath(path, caches.pFill);
    path.delete();
    caches.pCore.setBlendMode(plusMode);
    caches.pCore.setColor(rgba4f(q.coreColor ?? [255, 252, 224], a));
    canvas.drawCircle(px, py, Math.max(0.8, r * 0.35), caches.pCore);
  } else if (kind === 'starburst') {
    caches.pHalo.setBlendMode(plusMode);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.48));
    canvas.drawCircle(px, py, r * 2.0, caches.pHalo);
    drawStreakLine(
      canvas,
      caches,
      px,
      py,
      px - q.vxEm * 0.14 * size,
      py - q.vyEm * 0.14 * size,
      q.color,
      Math.max(0.9, r * 0.42),
      a * 0.82,
      q.coreColor ?? [255, 248, 205],
      a * 1.15,
      Math.max(0.9, r * 0.45),
      plusMode,
    );
  } else if (kind === 'harvest') {
    canvas.save();
    canvas.translate(px, py);
    canvas.rotate(q.rotDeg, 0, 0);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.3));
    canvas.drawCircle(0, 0, r * 1.5, caches.pHalo);
    caches.pFill.setColor(rgba4f(q.color, a * 0.9));
    canvas.drawOval(ck.LTRBRect(-r * 1.25, -r * 0.42, r * 1.25, r * 0.42), caches.pFill);
    canvas.restore();
  } else if (kind === 'equinox') {
    drawGlowOrb(
      canvas,
      caches,
      px,
      py,
      r,
      q.color,
      1.85,
      a * 0.36,
      0.82,
      a * 0.78,
      q.coreColor ?? [240, 255, 250],
      Math.max(0.7, r * 0.3),
      a * 0.85,
      srcOver,
      srcOver,
      srcOver,
    );
  } else if (kind === 'spectral') {
    drawGlowOrb(
      canvas,
      caches,
      px,
      py,
      r,
      q.color,
      2.0,
      a * 0.4,
      0.8,
      a * 0.75,
      q.coreColor ?? [248, 232, 255],
      Math.max(0.7, r * 0.32),
      a * 0.9,
      plusMode,
      srcOver,
      plusMode,
    );
  } else if (kind === 'lantern') {
    caches.pHalo.setBlendMode(plusMode);
    caches.pHalo.setColor(rgba4f(q.color, a * 0.48));
    canvas.drawCircle(px, py, r * 2.4, caches.pHalo);
    caches.pFill.setBlendMode(srcOver);
    caches.pFill.setColor(rgba4f(q.color, a * 0.88));
    canvas.drawRRect(
      ck.RRectXY(
        ck.LTRBRect(px - r * 0.72, py - r * 0.95, px + r * 0.72, py + r * 0.95),
        r * 0.48,
        r * 0.48,
      ),
      caches.pFill,
    );
    caches.pCore.setBlendMode(plusMode);
    caches.pCore.setColor(rgba4f(q.coreColor ?? [255, 242, 198], clamp01(a * 1.15)));
    canvas.drawCircle(px, py + r * 0.25, Math.max(0.8, r * 0.38), caches.pCore);
  } else {
    caches.pHalo.setColor(rgba4f(q.color, a * 0.5));
    canvas.drawCircle(px, py, r * 1.8, caches.pHalo);
    caches.pFill.setColor(rgba4f(q.color, a));
    canvas.drawCircle(px, py, r, caches.pFill);
  }
}

export function drawWordParticles(
  canvas: Canvas,
  caches: WordfxRenderCaches,
  fx: FxWordEntry,
  letters: readonly LetterBox[],
  x: number,
  base: number,
  size: number,
  t: number,
  opts: {
    readonly reduce?: boolean;
    readonly onsets?: readonly number[] | null;
    readonly backdrop?: Rgb | null;
    readonly carrier?: CarrierWord | null;
    readonly wipeAlpha?: number;
    readonly adaptedParams?: FxParams | null;
    readonly darkFactor?: number | null;
  } = {},
): void {
  const n = letters.length;
  const reduce = opts.reduce ?? false;
  const wipeAlpha = opts.wipeAlpha ?? 1.0;
  if (reduce || n === 0 || wipeAlpha <= 0.003) return;
  const backdrop = opts.backdrop ?? null;
  const p = opts.adaptedParams ?? adaptFxParams(fx.params, backdrop);
  if (p.particles <= 0 && p.sparkle <= 0) return;

  const b0 = fx.match.beginMs / 1000.0;
  const b1 = fx.match.endMs / 1000.0;
  const carrier = opts.carrier ?? null;
  const effSpacing =
    carrier !== null
      ? Math.max(-0.006, Math.min(0.014, p.spacingEm)) * carrier.fillFrontU
      : p.spacingEm;
  const gap = effSpacing * size;
  const cLetters = carrier !== null && carrier.letters.length === n ? carrier.letters : null;
  const cOnsets = cLetters ? cLetters.map((cl) => cl.onsetS) : (opts.onsets ?? null);
  const frontU = carrier !== null ? carrier.fillFrontU : null;
  const xsEm = letters.map((L, i) => (L.x + i * gap) / size);
  const wsEm = letters.map((L) => L.w / size);
  const halo = caches.maskBlur(HALO_SIGMA * size);
  const df = opts.darkFactor ?? backdropDarkFactor(backdrop);

  for (const q of wordParticles(p, xsEm, wsEm, t, b0, b1, {
    reduce,
    onsets: cOnsets,
    fillFrontU: frontU,
  })) {
    if (q.alpha * wipeAlpha < 0.01) continue;
    drawParticle(
      canvas,
      caches,
      q,
      x + q.xEm * size,
      base + q.yEm * size,
      q.rEm * size,
      size,
      halo,
      df,
      wipeAlpha,
    );
  }
}
