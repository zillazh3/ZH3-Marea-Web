import type { Canvas, CanvasKit, Paint } from 'canvaskit-wasm';
import type { Engine } from '@/engine/engine';
import type { Item, Word } from '@/engine/items';
import { TUNING } from '@/engine/tuning';
import { adaptFxParams } from '@/engine/wordfx/contrast';
import type {
  CarrierLetter,
  CarrierWord,
  FxPlanData,
  FxWordEntry,
  Rgb,
} from '@/engine/wordfx/fxtypes';
import { planRmsAt, planWordFx } from '@/engine/wordfx/planLookup';
import { clamp01, backdropDarkFactor, type WordfxRenderCaches } from './caches';
import { drawWordFx, drawWordStreak } from './draw';
import { drawWordParticles } from './particles';
import type { BackdropProbe } from './probe';
import type { Fonts } from '../text';
import { LINE_H } from '../text';
import { FW, ORIGIN_CH, ORIGIN_SYL, wipeShader } from '../wordDraw';

export interface WordFxAttachment {
  readonly fx: FxWordEntry | null;
  readonly fxLayer: FxWordEntry | null;
}

export function buildWordFxMap(
  plan: FxPlanData | null,
  lines: readonly { readonly line: object | null; readonly words: readonly Word[] }[],
  lineIndexByRef: ReadonlyMap<object, number>,
): WeakMap<Word, WordFxAttachment> {
  const map = new WeakMap<Word, WordFxAttachment>();
  if (!plan) return map;
  for (const item of lines) {
    if (!item.line) continue;
    const li = lineIndexByRef.get(item.line);
    if (li === undefined) continue;
    for (let wi = 0; wi < item.words.length; wi += 1) {
      const w = item.words[wi];
      if (!w) continue;
      const fx = w.bg ? null : planWordFx(plan, li, wi, false);
      const fxLayer = planWordFx(plan, li, wi, w.bg);
      if (fx !== null || fxLayer !== null) {
        map.set(w, { fx, fxLayer });
      }
    }
  }
  return map;
}

export function isWordFxIdle(
  word: Word,
  fxItem: FxWordEntry,
  tNow: number,
  strainNow: number,
  fxDebug: boolean,
): boolean {
  const p = fxItem.params;
  const antiS = p.isHero ? TUNING.anticipationS : 0.0;
  return (
    word.p === 0.0 &&
    !fxDebug &&
    tNow <= fxItem.match.beginMs / 1000.0 - antiS - 0.05 &&
    p.opacityMin >= 1.0 &&
    p.blurEm <= 0.0 &&
    p.grain <= 0.0 &&
    p.particles <= 0.0 &&
    p.sparkle <= 0.0 &&
    p.vanishS <= 0.0 &&
    (strainNow <= 0.0 || p.strainGain <= 0.0) &&
    (p.bleedDonorS < 0.0 || tNow <= p.bleedDonorS - 0.17)
  );
}

export function buildCarrierWord(
  fonts: Fonts,
  item: Item,
  word: Word,
  size: number,
  blurScale: number,
): CarrierWord {
  const cLetters: CarrierLetter[] = [];
  let filled = 0.0;
  let totalW = 0.0;

  for (const u of word.parts) {
    const pw = fonts.text(u.text, size, true).width;
    filled += pw * u.p;
    totalW += pw;
    const chars = Array.from(u.text);
    const k = Math.max(1, chars.length);
    if (word.emph) {
      const dy = u.y + (u.motion?.dy[0] ?? 0.0);
      const sc = u.scale * (1.0 + (u.motion?.ds[0] ?? 0.0));
      cLetters.push({
        fillP: u.p,
        onsetS: u.b,
        yEm: dy,
        scale: sc,
        glowA: u.glowA,
        glowR: u.glowR,
        xEm: 0.0,
      });
    } else {
      const frontPx = u.p * pw;
      let cx = 0.0;
      const grow = (u.scale - 1.0) / size;
      for (let j = 0; j < chars.length; j += 1) {
        const cw = fonts.text(chars[j] ?? '', size, true).width;
        const lp = clamp01((frontPx - cx) / Math.max(1.0, cw));
        const dy = u.y + (u.motion?.dy[j] ?? 0.0);
        const sc = u.scale * (1.0 + (u.motion?.ds[j] ?? 0.0));
        cLetters.push({
          fillP: lp,
          onsetS: u.b + ((u.e - u.b) * j) / k,
          yEm: dy,
          scale: sc,
          glowA: u.glowA,
          glowR: u.glowR,
          xEm: (cx + cw / 2 - pw / 2) * grow + u.x,
        });
        cx += cw;
      }
    }
  }

  const frontU = totalW > 0.0 ? clamp01(filled / totalW) : word.p;
  return {
    letters: cLetters,
    fillFrontU: frontU,
    lineAct: item.act,
    lineOn: item.on,
    lineOpacity: item.opacity,
    lineBlurPx: item.blur * blurScale,
    lineStartS: item.start,
    lineEndS: item.end,
    isBg: word.bg,
  };
}

export interface FxWordDrawEnv {
  readonly ck: CanvasKit;
  readonly canvas: Canvas;
  readonly caches: WordfxRenderCaches;
  readonly fonts: Fonts;
  readonly engine: Engine;
  readonly plan: FxPlanData;
  readonly probe: BackdropProbe | null;
  readonly pDstIn: Paint;
  readonly stageLeft: number;
  readonly stageTop: number;
  readonly ref: number;
  readonly k: number;
}

export function drawSceneFxWord(
  env: FxWordDrawEnv,
  item: Item,
  word: Word,
  fxItem: FxWordEntry,
  x: number,
  lineTop: number,
  ww: number,
  size: number,
  ba: number,
  da: number,
  strain: number,
): void {
  const { ck, canvas, caches, fonts, engine, plan } = env;
  const pFx = fxItem.params;
  const pad = TUNING.glowPadEm * size;
  const bounds = ck.LTRBRect(x - pad, lineTop - pad, x + ww + pad, lineTop + LINE_H * size + pad);
  const carrier = buildCarrierWord(fonts, item, word, size, env.k);
  const frontU = carrier.fillFrontU;
  const tNow = engine.t;
  const oy = lineTop + (word.emph ? ORIGIN_CH : ORIGIN_SYL) * size;
  const backdrop: Rgb | null =
    plan.adaptBg && env.probe
      ? env.probe.sample(tNow, x + env.stageLeft, lineTop + env.stageTop, ww, LINE_H * size)
      : null;
  const pAdapted = adaptFxParams(pFx, backdrop);
  const darkFactor = backdropDarkFactor(backdrop);
  const letters = caches.lettersFor(fonts, word.text, size);
  const onsets = carrier.letters.map((cl) => cl.onsetS);
  const rmsNow = planRmsAt(plan, tNow);
  const base = lineTop + fonts.baseline(size);
  const simpleWipe =
    (frontU <= 0.0 || frontU >= 1.0) &&
    pFx.grain <= 0.0 &&
    pFx.blurEm <= 0.0 &&
    pFx.fracture <= 0.0 &&
    Math.abs(pFx.chromaticEm) === 0.0 &&
    pFx.trail <= 0.0 &&
    (strain <= 0.0 || pFx.strainGain <= 0.0);

  if (simpleWipe) {
    drawWordFx(canvas, caches, fonts, fxItem, letters, x, base, size, tNow, {
      rms: rmsNow,
      reduce: engine.params.reduce,
      strain,
      onsets,
      backdrop,
      carrier,
      originY: oy,
      wipeAlpha: frontU >= 1.0 ? ba : da,
      includeParticles: false,
      adaptedParams: pAdapted,
      darkFactor,
    });
  } else {
    canvas.saveLayer(undefined, bounds);
    drawWordFx(canvas, caches, fonts, fxItem, letters, x, base, size, tNow, {
      rms: rmsNow,
      reduce: engine.params.reduce,
      strain,
      onsets,
      backdrop,
      carrier,
      originY: oy,
      includeParticles: false,
      adaptedParams: pAdapted,
      darkFactor,
    });
    const fw = FW * Math.max(0.35, Math.min(1.8, pFx.fillEdgeSoftness));
    const shader = wipeShader(ck, x, ww, frontU, ba, da, size, 1, fw);
    env.pDstIn.setShader(shader);
    canvas.drawRect(bounds, env.pDstIn);
    env.pDstIn.setShader(null);
    shader.delete();
    canvas.restore();
  }

  const pWipeA = da + (ba - da) * clamp01(frontU);
  if (pFx.streak > 0.0 && !engine.params.reduce) {
    drawWordStreak(canvas, caches, fxItem, x, base, ww, size, tNow, frontU, {
      resScale: env.ref / 1080.0,
      wipeAlpha: pWipeA,
      adaptedParams: pAdapted,
      darkFactor,
    });
  }
  if (pFx.particles > 0 || pFx.sparkle > 0) {
    drawWordParticles(canvas, caches, fxItem, letters, x, base, size, tNow, {
      reduce: engine.params.reduce,
      onsets,
      backdrop,
      carrier,
      wipeAlpha: pWipeA,
      adaptedParams: pAdapted,
      darkFactor,
    });
  }
}
