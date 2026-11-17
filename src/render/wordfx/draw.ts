import type { Canvas, TextBlob } from 'canvaskit-wasm';
import { echoes, strainBoost, wordLetterStates, type LetterState } from '@/engine/wordfx/anim';
import { FX } from '@/engine/wordfx/config';
import { adaptFxParams } from '@/engine/wordfx/contrast';
import {
  FX_AXES,
  type CarrierWord,
  type FxParams,
  type FxWordEntry,
  type Rgb,
} from '@/engine/wordfx/fxtypes';
import { lerpRgb, smoothstepRange } from '@/shared/color';
import { rgba4f } from '../overlays';
import type { Fonts } from '../text';
import {
  BLUR_MIN_PX,
  CENTER_Y,
  CHROMA_MIN_PX,
  GRAIN_TILE,
  GRAIN_VARIANTS,
  WHITE,
  backdropDarkFactor,
  clamp01,
  glowTier,
  type LetterBox,
  type WordfxRenderCaches,
} from './caches';
import { drawWordParticles } from './particles';

export const STREAK_Y_EM = 0.26;
const STREAK_TRAIL_STOPS = [0.0, 0.25, 0.5, 0.75, 1.0] as const;
const STREAK_FRONT_STOPS = [0.33, 0.66, 1.0] as const;
const LABEL_SCALE = 0.3;
const DEBUG_AMBER: Rgb = [255, 197, 107];

function drawLetterBody(
  canvas: Canvas,
  caches: WordfxRenderCaches,
  blob: TextBlob,
  lx: number,
  base: number,
  size: number,
  w: number,
  color: Rgb,
  fr: number,
  chroma: number,
  flip: number,
  hSlant: number,
): void {
  const ck = caches.ck;
  const halves = fr < 0.01 ? ([0] as const) : ([-1, 1] as const);
  const cx = lx + w / 2;
  const cy = base - CENTER_Y * size;
  for (const h of halves) {
    canvas.save();
    if (h !== 0) {
      canvas.translate((h * fr * FX.fractureGap * size) / 2, 0);
      canvas.rotate(h * fr * FX.fractureRotDeg * flip, cx, cy);
      const s = hSlant * size;
      const top = base - 1.3 * size;
      const bot = base + 0.5 * size;
      const pad = 0.5 * size;
      const edge = h < 0 ? lx - pad : lx + w + pad;
      const pb = new ck.PathBuilder();
      pb.moveTo(edge, top);
      pb.lineTo(cx + s, top);
      pb.lineTo(cx - s, bot);
      pb.lineTo(edge, bot);
      pb.close();
      const clip = pb.detachAndDelete();
      canvas.clipPath(clip, ck.ClipOp.Intersect, true);
      clip.delete();
    }
    if (chroma !== 0) {
      const [r, g, b] = color;
      const channels: readonly [Rgb, number][] = [
        [[r, 0, 0], -chroma],
        [[0, g, 0], 0],
        [[0, 0, b], chroma],
      ];
      for (const [c, off] of channels) {
        caches.pBodyPlus.setColor(rgba4f(c, 1));
        canvas.drawTextBlob(blob, lx + off, base, caches.pBodyPlus);
      }
    } else {
      caches.pBody.setColor(rgba4f(color, 1));
      canvas.drawTextBlob(blob, lx, base, caches.pBody);
    }
    canvas.restore();
  }
}

function enterLetter(
  canvas: Canvas,
  st: LetterState,
  cx: number,
  cy: number,
  size: number,
  dxExtra = 0,
  dyExtra = 0,
): void {
  canvas.save();
  canvas.translate(cx + (st.dx + dxExtra) * size, cy + (st.dy + dyExtra) * size);
  if (st.rotDeg !== 0) canvas.rotate(st.rotDeg, 0, 0);
  if (st.stretch !== 0) {
    canvas.scale(st.scale / (1.0 + st.stretch), st.scale * (1.0 + st.stretch));
  } else if (st.scale !== 1.0) {
    canvas.scale(st.scale, st.scale);
  }
  canvas.translate(-cx, -cy);
}

function drawMotif(
  canvas: Canvas,
  caches: WordfxRenderCaches,
  p: FxParams,
  x: number,
  base: number,
  width: number,
  size: number,
  t: number,
  b0: number,
  b1: number,
  darkFactor: number,
  carrier: CarrierWord | null,
  wipeAlpha: number,
  reduce: boolean,
): void {
  if (!p.motif || reduce || wipeAlpha <= 0.01 || width <= 0.0) return;
  const frontU = carrier !== null ? carrier.fillFrontU : smoothstepRange(b0, b1, t);
  let act =
    smoothstepRange(b0 - 0.15, b0 + 0.12, t) *
    (1.0 - 0.85 * smoothstepRange(b1, b1 + p.releaseS, t));
  if (carrier !== null) act *= clamp01(carrier.lineAct);
  if (act < 0.01) return;

  const ck = caches.ck;
  const plusM = darkFactor > 0.25 ? ck.BlendMode.Plus : ck.BlendMode.SrcOver;
  const aBase = act * wipeAlpha * (0.45 + 0.55 * darkFactor);
  const gcol = p.glowColor ?? p.colorFrom;
  const motif = p.motif;

  if (motif === 'threshold') {
    const a = aBase * Math.sin(Math.PI * clamp01(frontU)) * 0.45;
    if (a < 0.01) return;
    const px = x + frontU * width;
    caches.pHalo.setBlendMode(plusM);
    caches.pHalo.setMaskFilter(caches.maskBlur(0.08 * size));
    caches.pHalo.setColor(rgba4f(gcol, a * 0.65));
    canvas.drawOval(
      ck.LTRBRect(px - 0.11 * size, base - 0.98 * size, px + 0.11 * size, base + 0.24 * size),
      caches.pHalo,
    );
    caches.pStroke.setBlendMode(plusM);
    caches.pStroke.setStrokeCap(ck.StrokeCap.Round);
    caches.pStroke.setStrokeWidth(Math.max(0.9, 0.025 * size));
    caches.pStroke.setColor(rgba4f([255, 252, 240], a));
    canvas.drawLine(px, base - 0.88 * size, px, base + 0.16 * size, caches.pStroke);
  } else if (motif === 'gust') {
    const a = aBase * 0.24 * Math.min(1.0, frontU + 0.15);
    if (a < 0.01) return;
    const span = width * Math.min(1.0, Math.max(0.15, frontU));
    caches.pHalo.setBlendMode(plusM);
    caches.pHalo.setMaskFilter(caches.maskBlur(0.06 * size));
    caches.pHalo.setColor(rgba4f(gcol, a * 0.45));
    canvas.drawOval(
      ck.LTRBRect(x - 0.08 * size, base - 0.62 * size, x + span + 0.1 * size, base - 0.14 * size),
      caches.pHalo,
    );
    caches.pStroke.setBlendMode(plusM);
    caches.pStroke.setStrokeCap(ck.StrokeCap.Round);
    caches.pStroke.setStrokeWidth(Math.max(1.1, 0.036 * size));
    caches.pStroke.setColor(rgba4f(gcol, a));
    canvas.drawLine(
      x - 0.08 * size,
      base - 0.15 * size,
      x + span,
      base - 0.34 * size,
      caches.pStroke,
    );
    canvas.drawLine(
      x + 0.05 * size,
      base - 0.42 * size,
      x + span + 0.1 * size,
      base - 0.6 * size,
      caches.pStroke,
    );
  } else if (motif === 'corona') {
    const a = aBase * 0.24 * Math.min(1.0, frontU + 0.2);
    if (a < 0.01) return;
    const cx = x + width * 0.5;
    const cyW = base - CENTER_Y * size;
    caches.pHalo.setBlendMode(plusM);
    caches.pHalo.setMaskFilter(caches.maskBlur(0.22 * size));
    caches.pHalo.setColor(rgba4f(gcol, a));
    canvas.drawOval(
      ck.LTRBRect(cx - width * 0.58, cyW - 0.58 * size, cx + width * 0.58, cyW + 0.58 * size),
      caches.pHalo,
    );
  } else if (motif === 'equinox') {
    const a = aBase * 0.34;
    if (a < 0.01) return;
    const cx = x + width * 0.5;
    const yEq = base + 0.17 * size;
    const halfW = 0.5 * width * Math.min(1.0, frontU + 0.15);
    caches.pStroke.setBlendMode(plusM);
    caches.pStroke.setStrokeCap(ck.StrokeCap.Round);
    caches.pStroke.setStrokeWidth(Math.max(1.0, 0.032 * size));
    caches.pStroke.setColor(rgba4f(p.colorFrom, a));
    canvas.drawLine(cx - halfW, yEq, cx, yEq, caches.pStroke);
    caches.pStroke.setColor(rgba4f(p.colorTo, a));
    canvas.drawLine(cx, yEq, cx + halfW, yEq, caches.pStroke);
    caches.pCore.setBlendMode(plusM);
    caches.pCore.setColor(rgba4f([255, 250, 240], clamp01(a * 1.15)));
    canvas.drawCircle(cx, yEq, Math.max(1.0, 0.045 * size), caches.pCore);
  } else if (motif === 'ripple') {
    const a = aBase * 0.3 * Math.min(1.0, frontU + 0.1);
    if (a < 0.01) return;
    const span = width * Math.min(1.0, Math.max(0.1, frontU));
    const y0 = base + 0.16 * size;
    const amp = 0.022 * size;
    const steps = Math.max(4, Math.min(28, Math.trunc(span / (0.12 * size))));
    const pb = new ck.PathBuilder();
    for (let k = 0; k <= steps; k += 1) {
      const px = x + (span * k) / steps;
      const py = y0 + amp * Math.sin((2.0 * Math.PI * (px - x)) / (0.9 * size) - 2.4 * t);
      if (k === 0) pb.moveTo(px, py);
      else pb.lineTo(px, py);
    }
    const path = pb.detachAndDelete();
    caches.pStroke.setBlendMode(plusM);
    caches.pStroke.setStrokeCap(ck.StrokeCap.Round);
    caches.pStroke.setStrokeWidth(Math.max(1.0, 0.026 * size));
    caches.pStroke.setColor(rgba4f(gcol, a));
    canvas.drawPath(path, caches.pStroke);
    path.delete();
  } else if (motif === 'vigil') {
    const pulse = 0.85 + 0.15 * Math.sin(2.8 * t);
    const a = aBase * 0.24 * pulse * Math.min(1.0, frontU + 0.2);
    if (a < 0.01) return;
    const cx = x + width * 0.5;
    const yV = base + 0.1 * size;
    caches.pHalo.setBlendMode(plusM);
    caches.pHalo.setMaskFilter(caches.maskBlur(0.18 * size));
    caches.pHalo.setColor(rgba4f(gcol, a));
    canvas.drawOval(
      ck.LTRBRect(cx - width * 0.52, yV - 0.26 * size, cx + width * 0.52, yV + 0.26 * size),
      caches.pHalo,
    );
  }
}

export function streakAlpha(p: FxParams, t: number, b0: number, b1: number): number {
  const rel = Math.max(0.05, p.releaseS);
  return smoothstepRange(b0 - 0.05, b0 + 0.1, t) * (1.0 - smoothstepRange(b1, b1 + rel, t));
}

export function drawWordStreak(
  canvas: Canvas,
  caches: WordfxRenderCaches,
  fx: FxWordEntry,
  x: number,
  base: number,
  width: number,
  size: number,
  t: number,
  frontU: number,
  opts: {
    readonly resScale?: number;
    readonly wipeAlpha?: number;
    readonly adaptedParams?: FxParams | null;
    readonly darkFactor?: number | null;
  } = {},
): void {
  const p = opts.adaptedParams ?? fx.params;
  const wipeAlpha = opts.wipeAlpha ?? 1.0;
  if (p.streak <= 0.0 || width <= 0.0 || wipeAlpha <= 0.003) return;
  const b0 = fx.match.beginMs / 1000.0;
  const b1 = fx.match.endMs / 1000.0;
  const df = opts.darkFactor ?? 1.0;
  const a = FX.streakOpacity * p.streak * streakAlpha(p, t, b0, b1) * wipeAlpha * (0.4 + 0.6 * df);
  if (a < 0.004) return;

  const head = x + clamp01(frontU) * width;
  const ov = FX.streakOvershootEm * size;
  const tail = Math.max(x - ov, head - FX.streakTrailEm * size);
  const tip = Math.min(x + width + ov, head + FX.streakFrontEm * size);
  const span = tip - tail;
  if (span < 1.0) return;

  const gcol = p.glowColor ?? p.colorFrom;
  const col = lerpRgb(gcol, WHITE, FX.streakWhiteMix);
  const stops: [number, number][] = [];
  for (const s of STREAK_TRAIL_STOPS)
    stops.push([tail + (head - tail) * s, a * s ** FX.streakDecay]);
  for (const u of STREAK_FRONT_STOPS) stops.push([head + (tip - head) * u, a * (1.0 - u) ** 2]);
  const pos = stops.map(([sx]) => (sx - tail) / span);
  pos[0] = 0.0;
  pos[pos.length - 1] = 1.0;

  const ck = caches.ck;
  const y = base - STREAK_Y_EM * size;
  const th = Math.max(1.0, FX.streakThicknessPx * (opts.resScale ?? 1.0));
  caches.pStreak.setBlendMode(df > 0.05 ? ck.BlendMode.Plus : ck.BlendMode.SrcOver);

  for (const [k, alphaK] of [
    [3.5, 0.22],
    [1.0, 1.0],
  ] as const) {
    const colors = stops.map(([, sa]) => rgba4f(col, Math.min(1.0, sa * alphaK)));
    const shader = ck.Shader.MakeLinearGradient(
      [tail, 0],
      [tip, 0],
      colors,
      pos,
      ck.TileMode.Clamp,
    );
    caches.pStreak.setShader(shader);
    canvas.drawRect(ck.LTRBRect(tail, y - (th * k) / 2, tip, y + (th * k) / 2), caches.pStreak);
    caches.pStreak.setShader(null);
    shader.delete();
  }
}

export function drawWordFx(
  canvas: Canvas,
  caches: WordfxRenderCaches,
  fonts: Fonts,
  fx: FxWordEntry,
  letters: readonly LetterBox[],
  x: number,
  base: number,
  size: number,
  t: number,
  opts: {
    readonly rms?: number;
    readonly reduce?: boolean;
    readonly strain?: number;
    readonly onsets?: readonly number[] | null;
    readonly backdrop?: Rgb | null;
    readonly carrier?: CarrierWord | null;
    readonly originY?: number | null;
    readonly wipeAlpha?: number;
    readonly includeParticles?: boolean;
    readonly adaptedParams?: FxParams | null;
    readonly darkFactor?: number | null;
  } = {},
): void {
  const n = letters.length;
  const wipeAlpha = opts.wipeAlpha ?? 1.0;
  if (n === 0 || wipeAlpha <= 0.003) return;

  const ck = caches.ck;
  const rms = opts.rms ?? 0.0;
  const reduce = opts.reduce ?? false;
  const strain = opts.strain ?? 0.0;
  const backdrop = opts.backdrop ?? null;
  const carrier = opts.carrier ?? null;
  const p = opts.adaptedParams ?? adaptFxParams(fx.params, backdrop);
  const b0 = fx.match.beginMs / 1000.0;
  const b1 = fx.match.endMs / 1000.0;
  const effSpacing =
    carrier !== null
      ? Math.max(-0.006, Math.min(0.014, p.spacingEm)) * carrier.fillFrontU
      : p.spacingEm;
  const gap = effSpacing * size;
  const xs = letters.map((L, i) => x + L.x + i * gap);
  const lastL = letters[n - 1];
  const width = lastL ? lastL.x + lastL.w + (n - 1) * gap : 0;
  const text = letters.map((L) => L.ch).join('');
  const blobs = caches.wordBlobs(fonts, text, size);
  const cy = opts.originY ?? base - CENTER_Y * size;
  let chroma = (p.chromaticEm + 0.045 * strainBoost(p, strain)) * size;
  if (Math.abs(chroma) < CHROMA_MIN_PX) chroma = 0.0;
  const fr = reduce || p.fracture <= 0.0 ? 0.0 : p.fracture * smoothstepRange(b0, b1 + 0.15, t);

  const grain = p.grain > 0.0;
  let box: Float32Array | null = null;
  if (grain) {
    const pad = 0.6 * size;
    box = ck.LTRBRect(x - pad, base - 1.6 * size, x + width + pad, base + 0.8 * size);
    canvas.saveLayer(undefined, box);
  }

  const cLetters = carrier !== null && carrier.letters.length === n ? carrier.letters : null;
  const lineAct = carrier !== null ? carrier.lineAct : null;
  const lineEndS = carrier !== null ? carrier.lineEndS : null;
  const states = wordLetterStates(p, n, t, b0, b1, {
    rms,
    reduce,
    strain,
    onsets: opts.onsets ?? null,
    cLetters,
    lineAct,
    lineEndS,
  });

  if (p.trail > 0.0 && !reduce) {
    const anyGhost = cLetters === null || p.erode > 0.0 || cLetters.some((cl) => cl.fillP > 0.0);
    if (anyGhost) {
      for (const [delay, a0] of FX.ghosts) {
        const gStates = wordLetterStates(p, n, t - delay, b0, b1, {
          rms,
          reduce,
          strain,
          onsets: opts.onsets ?? null,
          cLetters,
          lineAct,
          lineEndS,
        });
        for (let i = 0; i < n; i += 1) {
          const L = letters[i];
          const g = gStates[i];
          const st = states[i];
          const blob = blobs[i];
          if (!L || !g || !st || !blob) continue;
          if (cLetters !== null && (cLetters[i]?.fillP ?? 0) <= 0.0 && p.erode <= 0.0) continue;
          const a = g.alpha * a0 * p.trail;
          if (
            a < 0.004 ||
            (g.dx === st.dx && g.dy === st.dy && g.scale === st.scale && g.rotDeg === st.rotDeg)
          ) {
            continue;
          }
          enterLetter(canvas, g, (xs[i] ?? x) + L.w / 2, cy, size);
          caches.pBody.setColor(rgba4f(g.color, a));
          canvas.drawTextBlob(blob, xs[i] ?? x, base, caches.pBody);
          canvas.restore();
        }
      }
    }
  }

  const go = smoothstepRange(b0, b0 + 0.12, t);
  if (p.trail > 0.0) {
    for (const ec of echoes(p, t, reduce)) {
      const dx = ec.dxEm * go;
      const dy = ec.dyEm * go;
      for (let i = 0; i < n; i += 1) {
        const L = letters[i];
        const st = states[i];
        const blob = blobs[i];
        if (!L || !st || !blob) continue;
        const a = st.alpha * ec.alphaFactor;
        if (a < 0.004) continue;
        enterLetter(canvas, st, (xs[i] ?? x) + L.w / 2, cy, size, dx, dy);
        caches.pBody.setColor(rgba4f(st.color, a));
        canvas.drawTextBlob(blob, xs[i] ?? x, base, caches.pBody);
        canvas.restore();
      }
    }
  }

  const df = opts.darkFactor ?? backdropDarkFactor(backdrop);
  drawMotif(canvas, caches, p, x, base, width, size, t, b0, b1, df, carrier, wipeAlpha, reduce);

  if (states.some((s) => s.glow > 0.02)) {
    const tier = glowTier(p.glowSpread);
    const build = reduce
      ? 1.0
      : FX.glowBuildStart + (1.0 - FX.glowBuildStart) * smoothstepRange(b0, b1, t);
    const gain = FX.glowGain * p.glowGain * build * (1.0 - (1.0 - df) * (1.0 - FX.glowBrightFloor));
    const addInner = df > 0.05 && p.glowSpread >= 0.3 && !reduce;
    for (let i = 0; i < n; i += 1) {
      const L = letters[i];
      const st = states[i];
      if (!L || !st) continue;
      let a = Math.min(1.0, st.glow * 0.7 * gain) * st.alpha * wipeAlpha;
      if (cLetters !== null) a *= Math.min(1.0, 4.0 * (cLetters[i]?.fillP ?? 0));
      if (a < 0.01) continue;
      const gcol = p.glowColor ?? st.color;
      const sprite = caches.glowSprite(fonts, L.ch, size, L.w, tier);
      const lx = xs[i] ?? x;
      enterLetter(canvas, st, lx + L.w / 2, cy, size);
      caches.pGlow.setAlphaf(a);
      caches.pGlow.setColorFilter(caches.tintCf(gcol));
      canvas.drawImageOptions(
        sprite.img,
        lx - sprite.pad,
        base - FX.glowAsc * size - sprite.pad,
        ck.FilterMode.Linear,
        ck.MipmapMode.None,
        caches.pGlow,
      );
      if (addInner && st.glow > 0.25) {
        const aPlus = Math.min(0.45, a * 0.42 * df * p.glowSpread);
        if (aPlus >= 0.01) {
          const innerCol: Rgb =
            p.particleKind === 'ember' ? [255, 224, 150] : lerpRgb(gcol, WHITE, FX.glowCoreWhite);
          const s0 = caches.glowSprite(fonts, L.ch, size, L.w, 0);
          caches.pPlus.setAlphaf(aPlus);
          caches.pPlus.setColorFilter(caches.tintCf(innerCol));
          canvas.drawImageOptions(
            s0.img,
            lx - s0.pad,
            base - FX.glowAsc * size - s0.pad,
            ck.FilterMode.Linear,
            ck.MipmapMode.None,
            caches.pPlus,
          );
        }
      }
      canvas.restore();
    }
    caches.pGlow.setColorFilter(null);
    caches.pPlus.setColorFilter(null);
  }

  const sigma = (states[0]?.blurEm ?? 0) * size * 0.5;
  const wblur = sigma * 2 > BLUR_MIN_PX;
  if (wblur) {
    if (box === null) {
      const pad = 0.6 * size;
      box = ck.LTRBRect(x - pad, base - 1.6 * size, x + width + pad, base + 0.8 * size);
    }
    caches.pLayer.setAlphaf(1.0);
    caches.pLayer.setImageFilter(caches.wordBlur(sigma));
    canvas.saveLayer(caches.pLayer, box);
    caches.pLayer.setImageFilter(null);
  }

  const seedInt = BigInt(p.seed);
  for (let i = 0; i < n; i += 1) {
    const st = states[i];
    const L = letters[i];
    const blob = blobs[i];
    if (!st || !L || !blob) continue;
    const effAlpha = st.alpha * wipeAlpha;
    if (effAlpha < 0.004) continue;
    const lx = xs[i] ?? x;
    enterLetter(canvas, st, lx + L.w / 2, cy, size);
    const flip = ((seedInt >> BigInt(i)) & 1n) !== 0n ? 1.0 : -1.0;
    const slant = (Number((seedInt >> BigInt(i + 3)) & 7n) - 3.5) * 0.04;
    const chromaI = cLetters !== null ? chroma * (cLetters[i]?.fillP ?? 0) : chroma;
    if (Math.abs(chromaI) >= CHROMA_MIN_PX) {
      const e = 0.4 * size + Math.abs(chromaI);
      const rect = ck.LTRBRect(lx - e, base - 1.3 * size - e, lx + L.w + e, base + 0.5 * size + e);
      caches.pLayer.setAlphaf(effAlpha);
      canvas.saveLayer(caches.pLayer, rect);
      drawLetterBody(canvas, caches, blob, lx, base, size, L.w, st.color, fr, chromaI, flip, slant);
      canvas.restore();
    } else if (fr >= 0.01) {
      caches.pLayer.setAlphaf(effAlpha);
      canvas.saveLayer(caches.pLayer, undefined);
      drawLetterBody(canvas, caches, blob, lx, base, size, L.w, st.color, fr, 0.0, flip, slant);
      canvas.restore();
    } else {
      caches.pBody.setColor(rgba4f(st.color, effAlpha));
      canvas.drawTextBlob(blob, lx, base, caches.pBody);
    }
    canvas.restore();
  }
  if (wblur) canvas.restore();

  if (opts.includeParticles !== false && (p.particles > 0 || p.sparkle > 0)) {
    drawWordParticles(canvas, caches, fx, letters, x, base, size, t, {
      reduce,
      ...(opts.onsets !== undefined ? { onsets: opts.onsets } : {}),
      backdrop,
      carrier,
      adaptedParams: p,
      darkFactor: df,
    });
  }

  if (grain && box !== null) {
    const frame = t >= 0 ? Math.trunc(t * 24) : -Math.trunc(-t * 24) - 1;
    const k = Number((seedInt ^ (BigInt(frame) * 0x9e3779b1n)) & 0xffff_ffffn);
    const tile = caches.grainTile(k % GRAIN_VARIANTS);
    const offX = (k >>> 8) % GRAIN_TILE;
    const offY = (k >>> 16) % GRAIN_TILE;
    const shader = tile.makeShaderOptions(
      ck.TileMode.Repeat,
      ck.TileMode.Repeat,
      ck.FilterMode.Nearest,
      ck.MipmapMode.None,
      [1, 0, offX, 0, 1, offY, 0, 0, 1],
    );
    caches.pGrain.setShader(shader);
    caches.pGrain.setAlphaf(Math.min(1.0, p.grain * 0.35));
    canvas.drawRect(box, caches.pGrain);
    caches.pGrain.setShader(null);
    shader.delete();
    canvas.restore();
  }
}

export function debugLabelLines(fx: FxWordEntry): string[] {
  const { match: m, params: p } = fx;
  const vec = FX_AXES.map(
    (a, idx) =>
      `${a.slice(0, 3)} ${(p.vector[idx] ?? 0) >= 0 ? '+' : ''}${(p.vector[idx] ?? 0).toFixed(2)}`,
  ).join(' ');
  const bleed = p.bleed ? `contagio ${p.bleed.toFixed(2)} (${p.bleedFrom})` : 'sin contagio';
  const rep = p.repeatN ? ` · rep ${String(p.repeatN)}` : '';
  const note = m.note ? ` · ${m.note}` : '';
  const variant = p.variant ? ` · ${p.variant}` : '';
  return [
    `[${String(m.line)}.${String(m.word)}] ${m.lemma} · ${m.lang} · ${m.categories.join('+')}${variant}${rep}${note}`,
    vec,
    `${bleed} · ${p.primitives.join(', ')}`,
  ];
}

export function drawDebugLabel(
  canvas: Canvas,
  caches: WordfxRenderCaches,
  fonts: Fonts,
  fx: FxWordEntry,
  x: number,
  ww: number,
  base: number,
  size: number,
): void {
  const paint = caches.pBody;
  paint.setColor(rgba4f(DEBUG_AMBER, 230 / 255));
  const lines = debugLabelLines(fx);
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i] ?? '';
    const run = fonts.text(text, LABEL_SCALE * size, false);
    canvas.drawTextBlob(
      run.blob,
      x + (ww - run.width) / 2,
      base - (1.0 + 0.36 * (lines.length - 1 - i)) * size,
      paint,
    );
  }
  caches.pStroke.setBlendMode(caches.ck.BlendMode.SrcOver);
  caches.pStroke.setColor(rgba4f(DEBUG_AMBER, 230 / 255));
  caches.pStroke.setStrokeWidth(Math.max(1.0, 0.04 * size));
  canvas.drawLine(x, base + 0.12 * size, x + ww, base + 0.12 * size, caches.pStroke);
}
