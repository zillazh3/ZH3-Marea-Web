import { FX } from '@/engine/wordfx/config';
import { durationMode } from '@/engine/wordfx/envelope';
import {
  FX_AXES,
  type FxParams,
  type FxSigAxis,
  type FxWaveform,
  type Rgb,
} from '@/engine/wordfx/fxtypes';
import { ambientVectorColor } from '@/engine/wordfx/planLookup';
import { CUSTOM_PARTICLE_KINDS, signatureFor } from '@/engine/wordfx/signatures';
import { clamp, hsvToRgb, lerpRgb, luma, rgbToHsv } from '@/shared/color';
import { pyRound } from '@/shared/pycompat';
import { sha1Uint32, sha1Uint64 } from '@/shared/sha1';
import type { Category, WordFxLibrary } from './library';
import type { WordMatch } from './matcher';
import { pickVariant, variantId } from './variants';

const EPS = 1e-6;
const GRAY: Rgb = [154, 154, 154];

const ANCHORS: readonly (readonly [number, number, Rgb])[] = [
  [-0.7, -0.6, [0x5b, 0x7a, 0x99]],
  [-0.7, 0.6, [0x8b, 0x2e, 0x3c]],
  [0.7, -0.7, [0x9f, 0xd8, 0xe0]],
  [0.4, -0.2, [0xb9, 0xa7, 0xe8]],
  [0.6, 0.4, [0xff, 0xc5, 0x6b]],
  [0.8, 0.9, [0xff, 0x8f, 0xa3]],
  [0.0, 0.0, GRAY],
];

const AXES_BOUNDS: Readonly<Record<string, readonly [number, number]>> = {
  valence: [-1, 1],
  arousal: [0, 1],
  gravity: [-1, 1],
  temperature: [-1, 1],
  fragility: [0, 1],
  blur: [0, 1],
};

const LIMITS: Readonly<Record<string, number>> = {
  driftEm: 0.45,
  jitterEm: 0.08,
  waveEm: 0.15,
  spacingEm: 0.2,
  scaleAmp: 0.2,
  rotationDeg: 20.0,
  letterOffsetEm: 0.6,
  blurEm: 0.1,
  chromaticEm: 0.05,
  glow: 1.0,
  grain: 1.0,
  trail: 1.0,
  erode: 1.0,
  fracture: 1.0,
};

const MIN_LUMA = 0.6;
const POSITIVE_LUMA = 0.22;
const AUTHORED_WEIGHT = 0.92;
const VIBRANCE = 1.35;

const COLOR_COMBOS: readonly (readonly [readonly string[], Rgb, number, Rgb, number, boolean])[] = [
  [['sadness', 'anger'], [217, 43, 75], 0.72, [110, 18, 36], 0.78, false],
  [['sadness', 'healing'], [230, 194, 122], 0.65, [143, 168, 184], 0.5, false],
  [['memory', 'craft'], [228, 178, 96], 0.62, [192, 152, 108], 0.5, false],
  [['celestial', 'shadow'], [178, 166, 238], 0.58, [142, 132, 204], 0.62, true],
  [['growth', 'fire'], [255, 180, 36], 0.8, [255, 122, 18], 0.85, false],
];

export function unitHash(seed: string, key: string): number {
  return sha1Uint32(`${seed}:${key}`) / 4_294_967_296;
}

export function seedFor(trackId: string, line: string | number, word: number): string {
  return sha1Uint64(`${trackId}:${String(line)}:${String(word)}`).toString(10);
}

export function blendCategories(cats: readonly string[], lib: WordFxLibrary): number[] {
  const ws: { w: number; cat: Category }[] = [];
  let tot = 0;
  for (const c of cats) {
    const cat = lib.categories[c];
    if (!cat) continue;
    const w = Math.max(EPS, cat.priority) * (cat.kind === 'emotion' ? 1.5 : 1.0);
    ws.push({ w, cat });
    tot += w;
  }
  const denom = tot || 1;
  return FX_AXES.map(
    (axis) => ws.reduce((acc, { w, cat }) => acc + w * (cat.vector[axis] ?? 0), 0) / denom,
  );
}

export function anchorColor(valence: number, temperature: number, arousal: number): Rgb {
  let tot = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (const [v, t, rgb] of ANCHORS) {
    const w = 1 / ((valence - v) ** 2 + (temperature - t) ** 2 + 1e-4);
    tot += w;
    rSum += w * rgb[0];
    gSum += w * rgb[1];
    bSum += w * rgb[2];
  }
  const [h, sRaw, vRaw] = rgbToHsv(rSum / tot / 255, gSum / tot / 255, bSum / tot / 255);
  const s = sRaw * (0.45 + 0.55 * clamp(arousal, 0, 1));
  const v = Math.min(1, vRaw * (0.85 + 0.15 * clamp(valence, -1, 1)));
  const [rr, gg, bb] = hsvToRgb(h, s, v);
  return [pyRound(rr * 255), pyRound(gg * 255), pyRound(bb * 255)];
}

export function blendPalette(rgb: Rgb, palette: readonly Rgb[], weight = 0.6): Rgb {
  if (palette.length === 0) return rgb;
  let rM = 0;
  let gM = 0;
  let bM = 0;
  for (const c of palette) {
    rM += c[0];
    gM += c[1];
    bM += c[2];
  }
  rM /= palette.length;
  gM /= palette.length;
  bM /= palette.length;
  return [
    pyRound(weight * rgb[0] + (1 - weight) * rM),
    pyRound(weight * rgb[1] + (1 - weight) * gM),
    pyRound(weight * rgb[2] + (1 - weight) * bM),
  ];
}

function legible(rgb: Rgb, floor = MIN_LUMA): Rgb {
  const y = luma(rgb);
  return y >= floor ? rgb : lerpRgb(rgb, [255, 255, 255], (floor - y) / (1 - y));
}

function floorLuma(valence: number): number {
  return MIN_LUMA + POSITIVE_LUMA * clamp(valence, 0, 1);
}

function authored(cats: readonly string[], lib: WordFxLibrary): readonly [Rgb, Rgb] | null {
  for (const c of cats) {
    const col = lib.categories[c]?.color ?? [];
    const first = col[0];
    const last = col[col.length - 1];
    if (first && last) return [first, last];
  }
  return null;
}

function finishColor(rgb: Rgb, vivid: boolean, valence = 0): Rgb {
  let out = rgb;
  if (vivid) {
    const [h, s, v] = rgbToHsv(out[0] / 255, out[1] / 255, out[2] / 255);
    const [r, g, b] = hsvToRgb(h, Math.min(1, s * VIBRANCE), v);
    out = [pyRound(r * 255), pyRound(g * 255), pyRound(b * 255)];
  }
  return legible(out, floorLuma(valence));
}

function hueShift(rgb: Rgb, deg: number): Rgb {
  const [h, s, v] = rgbToHsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  const shiftedH = (((h + deg / 360) % 1) + 1) % 1;
  const [r, g, b] = hsvToRgb(shiftedH, s, v);
  return [pyRound(r * 255), pyRound(g * 255), pyRound(b * 255)];
}

function buildPrimitives(
  match: WordMatch,
  lib: WordFxLibrary,
  vec: readonly number[],
  seed: string,
): string[] {
  const prims: string[] = [];
  const seen = new Set<string>();
  const add = (p: string): void => {
    if (!seen.has(p)) {
      seen.add(p);
      prims.push(p);
    }
  };

  for (const c of match.categories) {
    for (const p of lib.categories[c]?.primitives ?? []) add(p);
  }
  if (seen.has('mask_reveal')) {
    add('letter_offset');
    if (Math.abs(vec[2] ?? 0) >= 0.28 && !seen.has('displacement') && !seen.has('gravity_drift')) {
      add('displacement');
    }
  }
  if (unitHash(seed, 'extra') < 0.4) {
    const pool = [
      (vec[0] ?? 0) > 0 && !seen.has('glow') ? 'glow' : '',
      (vec[1] ?? 0) > 0.5 && !seen.has('jitter') ? 'jitter' : '',
      (vec[5] ?? 0) > 0.3 && !seen.has('trail') ? 'trail' : '',
    ].filter(Boolean);
    if (pool.length > 0) {
      const picked = pool[Math.floor(unitHash(seed, 'pick') * pool.length)];
      if (picked) add(picked);
    }
  }
  return prims;
}

function categoryBaseColor(
  cats: readonly string[],
  lib: WordFxLibrary,
  palette: readonly Rgb[],
  desaturate: boolean,
): Rgb {
  const v = blendCategories(cats, lib);
  const auth = authored(cats, lib);
  let base = auth ? auth[0] : anchorColor(v[0] ?? 0, v[3] ?? 0, v[1] ?? 0);
  if (desaturate && !auth) base = lerpRgb(base, GRAY, 0.2);
  const blended = blendPalette(base, palette, auth ? AUTHORED_WEIGHT : 0.6);
  return finishColor(blended, !auth && !desaturate && (v[1] ?? 0) >= 0.15, v[0] ?? 0);
}

export interface ComposeOpts {
  readonly trackId?: string;
  readonly bleedDonors?: readonly { match: WordMatch; weight: number }[];
  readonly lineMood?: readonly number[] | null;
  readonly songMood?: readonly number[] | null;
  readonly palette?: readonly Rgb[];
  readonly repeatN?: number;
  readonly lineKey?: string;
  readonly intensity?: number;
  readonly bleed?: number;
  readonly beatPeriodMs?: number | null;
  readonly partner?: WordMatch | null;
  readonly oscPhase?: number;
  readonly rawVocals?: boolean;
  readonly isBg?: boolean;
  readonly handoffOverlapS?: number;
  readonly avoidVariant?: string;
  readonly light?: boolean;
}

function round6(x: number): number {
  return pyRound(x * 1_000_000) / 1_000_000;
}

export function composeWordFx(
  match: WordMatch,
  lib: WordFxLibrary,
  opts: ComposeOpts = {},
): FxParams {
  const {
    trackId = '',
    bleedDonors,
    lineMood = null,
    songMood = null,
    palette = [],
    repeatN = 0,
    lineKey = '',
    intensity: rawIntensity = 1.0,
    bleed = 0.3,
    beatPeriodMs = null,
    partner = null,
    oscPhase = 0,
    rawVocals = false,
    isBg = false,
    handoffOverlapS = 0.32,
    avoidVariant = '',
    light = false,
  } = opts;

  const seed = seedFor(trackId, lineKey || match.line, match.word);
  const intensity = clamp(rawIntensity, 0, 1.5) * (isBg ? 0.4 : light ? FX.lightScale : 1.0);

  const weightedNear = (bleedDonors ?? []).filter((d) => d.weight > 0 && bleed > 0);
  const parts: { w: number; v: readonly number[] }[] = [
    { w: 1.0, v: blendCategories(match.categories, lib) },
    ...weightedNear.map((d) => ({ w: d.weight, v: blendCategories(d.match.categories, lib) })),
  ];
  const bleedTotal = round6(weightedNear.reduce((acc, d) => acc + d.weight, 0));
  const bleedFrom = weightedNear.map((d) => d.match.lemma).join(',');
  let strongestDonor: WordMatch | null = null;
  let maxDonorW = -Infinity;
  for (const d of weightedNear) {
    if (d.weight > maxDonorW) {
      maxDonorW = d.weight;
      strongestDonor = d.match;
    }
  }
  if (lineMood) parts.push({ w: 0.15, v: lineMood });
  if (songMood) parts.push({ w: 0.15, v: songMood });
  const totW = parts.reduce((acc, p) => acc + p.w, 0);
  const vec = FX_AXES.map((axis, i) => {
    const b = AXES_BOUNDS[axis] ?? [-1, 1];
    const sum = parts.reduce((acc, p) => acc + p.w * (p.v[i] ?? 0), 0);
    return clamp(sum / totW, b[0], b[1]);
  });

  const val = vec[0] ?? 0;
  const aro = vec[1] ?? 0;
  const gra = vec[2] ?? 0;
  const tem = vec[3] ?? 0;
  const fra = vec[4] ?? 0;
  const blu = vec[5] ?? 0;
  const holdS = Math.max(0, (match.endMs - match.beginMs) / 1000);

  const prims = buildPrimitives(match, lib, vec, seed);
  const on = new Set(prims);

  let strainGain = 0;
  let forcedRaw = false;
  if (rawVocals && intensity > 0) {
    const cats = match.categories
      .map((c) => lib.categories[c])
      .filter((c): c is Category => Boolean(c));
    if (
      match.categories.includes('anguish') ||
      match.categories.includes('fear') ||
      on.has('jitter') ||
      on.has('chromatic')
    ) {
      strainGain = 0.85;
    } else if (aro >= 0.5 && cats.some((c) => c.kind === 'emotion')) {
      strainGain = 0.5;
    }
    if (strainGain > 0 && !on.has('jitter') && !on.has('chromatic')) {
      prims.push('chromatic', 'jitter');
      on.add('chromatic');
      on.add('jitter');
      forcedRaw = true;
    }
  }

  const auth = authored(match.categories, lib);
  let baseCol = auth ? auth[0] : anchorColor(val, tem, aro);
  if (on.has('desaturate') && !auth) baseCol = lerpRgb(baseCol, GRAY, 0.2);
  const cFromRaw = blendPalette(baseCol, palette, auth ? AUTHORED_WEIGHT : 0.6);
  let cToRaw = auth ? blendPalette(auth[1], palette, AUTHORED_WEIGHT) : cFromRaw;
  if (strongestDonor) {
    const nv = blendCategories(strongestDonor.categories, lib);
    const nauth = authored(strongestDonor.categories, lib);
    const nCol = nauth
      ? blendPalette(nauth[0], palette, AUTHORED_WEIGHT)
      : blendPalette(anchorColor(nv[0] ?? 0, nv[3] ?? 0, nv[1] ?? 0), palette, 0.6);
    cToRaw = lerpRgb(cToRaw, nCol, Math.min(1, 2 * bleedTotal));
  }
  if (!auth) {
    if (on.has('desaturate')) cToRaw = lerpRgb(cToRaw, GRAY, 0.5);
    if (on.has('hue_shift')) cToRaw = hueShift(cToRaw, tem >= 0 ? -25 : 25);
  }
  const vivid = !auth && !on.has('desaturate') && aro >= 0.15;
  let colorFrom = finishColor(cFromRaw, vivid, val);
  let colorTo = finishColor(cToRaw, vivid, val);
  let oscColor: Rgb = [255, 255, 255];

  if (partner) {
    const pdes = partner.categories.some(
      (c) => lib.categories[c]?.primitives.includes('desaturate') ?? false,
    );
    oscColor = categoryBaseColor(partner.categories, lib, palette, pdes);
  } else {
    const catsSet = new Set(match.categories);
    for (const [req, cfTgt, wFrom, ctTgt, wTo, keepLeg] of COLOR_COMBOS) {
      if (req.every((r) => catsSet.has(r))) {
        colorFrom = lerpRgb(colorFrom, cfTgt, wFrom);
        colorTo = lerpRgb(colorTo, ctTgt, wTo);
        if (keepLeg) {
          colorFrom = legible(colorFrom);
          colorTo = legible(colorTo);
        }
        break;
      }
    }
  }

  if (intensity <= 0) {
    return {
      seed,
      vector: vec,
      primitives: [],
      bleed: bleedTotal,
      bleedFrom,
      repeatN,
      holdS,
      colorFrom,
      colorTo,
      oscColor,
      note: match.note,
      driftEm: 0,
      jitterEm: 0,
      jitterHz: 0,
      waveEm: 0,
      waveHz: 0,
      spacingEm: 0,
      scaleAmp: 0,
      scalePeriodS: 1.2,
      rotationDeg: 0,
      staggerMs: 0,
      letterOffsetEm: 0,
      opacityMin: 1,
      blurEm: 0,
      glow: 0,
      grain: 0,
      chromaticEm: 0,
      trail: 0,
      erode: 0,
      vanishS: 0,
      particles: 0,
      fracture: 0,
      sparkle: 0,
      flash: 0.45,
      audioGain: 0,
      oscHz: 0,
      oscPhase: 0,
      oscJitterEm: 0,
      strainGain: 0,
      releaseS: 0.65,
      residueLevel: 0.16,
      zeta: 1,
      isHero: true,
      isBg: false,
      tier: 'strong',
      bleedDonorS: -1,
      bleedDonorEndS: -1,
      handoffOverlapS: 0.32,
      durationMode: 'normal',
      waveform: 'sine',
      sigFreqHz: 1.2,
      sigAxis: 'y',
      sigAmpEm: 0.03,
      fillTint: 0.42,
      fillEdgeSoftness: 1,
      glowSpread: 0.25,
      glowColor: null,
      particleKind: 'dust',
      sparkleStyle: 'star',
      motif: '',
      tintSpread: '',
      scatterEm: 0,
      glitch: 0,
      shimmer: 0,
      glowGain: 1,
      streak: 0,
      variant: '',
    };
  }

  const hf = clamp(holdS / 1.2, 0.3, 1.5);
  const k = intensity * (0.85 + 0.3 * unitHash(seed, 'mag'));
  const cap = (key: string, v: number): number => {
    const lim = LIMITS[key] ?? 1;
    return clamp(v * k, -lim, lim);
  };

  const driftEm =
    on.has('displacement') || on.has('gravity_drift')
      ? cap('driftEm', gra * 0.26 * (1 + 0.3 * clamp(holdS / 2.4, 0, 1)))
      : 0;
  const letterOffsetEm = on.has('letter_offset') ? cap('letterOffsetEm', 0.15 + 0.25 * fra) : 0;
  const scaleAmp = on.has('scale') ? cap('scaleAmp', 0.04 + 0.08 * aro) : 0;
  const rotationDeg = on.has('rotation') ? cap('rotationDeg', 3 + 7 * aro) : 0;
  const blurEm = on.has('blur') ? cap('blurEm', 0.12 * blu) : 0;
  let spacingEm = on.has('letter_spacing') ? cap('spacingEm', 0.06 * val - 0.1 * gra) : 0;
  let jitterEm = on.has('jitter') ? cap('jitterEm', 0.01 + 0.035 * aro) : 0;
  const waveEm = on.has('wave') ? cap('waveEm', 0.03 + 0.06 * aro) : 0;
  let glow = on.has('glow')
    ? cap('glow', clamp(0.45 + 0.45 * val + 0.4 * clamp((tem - 0.5) / 0.4, 0, 1), 0.15, 1))
    : 0;
  let chromaticEm = on.has('chromatic') ? cap('chromaticEm', 0.006 + 0.02 * aro) : 0;
  const grain = on.has('grain') ? cap('grain', 0.2 + 0.5 * fra) : 0;
  const trail = on.has('trail') ? cap('trail', 0.15 + blu) : 0;
  const erode = on.has('erode') ? cap('erode', 0.4 * fra * hf) : 0;
  let fracture = on.has('fracture') ? cap('fracture', 0.6 * fra * hf) : 0;

  if (rawVocals && match.categories.includes('anguish')) {
    if (on.has('jitter'))
      jitterEm = clamp(jitterEm * 1.2, -(LIMITS.jitterEm ?? 0.08), LIMITS.jitterEm ?? 0.08);
    if (on.has('chromatic'))
      chromaticEm = clamp(
        chromaticEm * 1.2,
        -(LIMITS.chromaticEm ?? 0.05),
        LIMITS.chromaticEm ?? 0.05,
      );
  }
  if (forcedRaw) {
    chromaticEm = Math.max(chromaticEm, 0.02);
    jitterEm = Math.max(jitterEm, 0.01);
  }

  let particles = on.has('particles') ? pyRound(clamp(30 * fra * hf * k, 0, 28)) : 0;
  let sparkle = on.has('sparkle')
    ? pyRound(clamp((4 + Math.floor(unitHash(seed, 'spk') * 4)) * intensity, 4, 9))
    : 0;
  const opacityMin = on.has('opacity') ? 1 - clamp((0.15 + 0.5 * fra) * k, 0, 0.9) : 1;
  const jitterHz = on.has('jitter') ? 4 + 10 * aro : 0;
  const waveHz = on.has('wave') ? 0.6 + 2.4 * aro : 0;
  const scalePeriodS = on.has('scale') ? 2.2 - 1.2 * aro : 1.2;
  const staggerMs =
    on.has('letter_offset') || on.has('mask_reveal')
      ? beatPeriodMs
        ? clamp(beatPeriodMs / 4, 40, 140)
        : clamp(140 - 220 * aro, 40, 140)
      : 0;
  glow = Math.max(glow, (0.3 + 0.2 * clamp(val, 0, 1)) * intensity);
  const flash =
    (0.45 + 0.3 * clamp(val, 0, 1) + (on.has('sparkle') || on.has('glow') ? 0.2 : 0)) * intensity;
  let audioGain = on.has('jitter') || on.has('glow') ? 0.3 + 0.5 * aro : 0;
  const finalStrainGain = strainGain > 0 ? Math.min(1, strainGain * intensity) : 0;
  if (strainGain > 0) audioGain = Math.max(audioGain, 0.4);

  let oscHz = 0;
  let oscJitterEm = 0;
  let finalOscPhase = 0;
  if (partner) {
    oscHz = 2.0;
    finalOscPhase = oscPhase;
    oscJitterEm = 0.03 * intensity;
    audioGain = Math.max(audioGain, 0.3);
  }

  const { mode: dMode } = durationMode(holdS);
  let sig = signatureFor(match.categories, vec);
  const lead = match.categories[0] ?? '';
  const glowGain = FX.glowByCategory[lead] ?? 1.0;
  const streak = clamp(
    (FX.streakByCategory[lead] ?? FX.streakDefault) * Math.min(1, intensity),
    0,
    1,
  );
  const pickedVariant = lead ? pickVariant(lead, unitHash(seed, 'variant'), avoidVariant) : null;
  if (pickedVariant && Object.keys(pickedVariant.sig).length > 0) {
    sig = { ...sig, ...pickedVariant.sig };
  }

  let pKind = sig.particleKind;
  let pMax = sig.particleMax;
  const amb = Math.min(1, Math.max(0, match.ambiguity));
  const calmDamp = 0.72 + 0.28 * clamp(aro / 0.35, 0, 1);
  const ambDamp = 1 - 0.15 * amb;
  let sigWaveform = sig.waveform;
  let sigAxis = sig.axis;
  let sigFreq = sig.freqRangeHz[0] + (sig.freqRangeHz[1] - sig.freqRangeHz[0]) * aro;
  let sigAmp =
    (sig.ampRangeEm[0] + (sig.ampRangeEm[1] - sig.ampRangeEm[0]) * Math.max(aro, fra)) *
    Math.min(1.5, intensity);
  let releaseS = sig.releaseMs / 1000;
  let residueLevel = sig.residueLevel;
  const zeta = sig.zeta;
  let glowSpread = sig.glowSpread;
  let glowColor = sig.glowColor;
  let sparkleStyle = sig.sparkleStyle;

  const catsSet = new Set(match.categories);
  if (catsSet.has('sadness') && catsSet.has('water')) {
    pKind = 'tear';
    pMax = Math.max(pMax, 14);
  } else if (catsSet.has('sadness') && catsSet.has('anger')) {
    pKind = 'crimson';
    pMax = Math.max(pMax, 14);
    sigWaveform = 'breath';
    sigAxis = 'scale';
    sigFreq = 1.05 + 0.35 * aro;
    sigAmp = Math.max(sigAmp, 0.024 * Math.min(1.5, intensity));
    fracture = Math.max(fracture, 0.42 * Math.min(1.3, intensity));
    chromaticEm = Math.max(chromaticEm, 0.014 * Math.min(1.3, intensity));
  } else if (catsSet.has('sadness') && catsSet.has('healing')) {
    pKind = 'wisp';
    pMax = Math.max(pMax, 8);
    fracture = Math.max(fracture, 0.16 * Math.min(1.2, intensity));
    if (dMode !== 'accent') sparkle = Math.max(sparkle, 4);
  } else if (catsSet.has('memory') && catsSet.has('craft')) {
    releaseS = Math.max(releaseS, 0.92);
    residueLevel = Math.max(residueLevel, 0.28);
    glowColor = [236, 194, 118];
  } else if (catsSet.has('celestial') && catsSet.has('shadow')) {
    sigWaveform = 'orbit';
    sigAxis = 'xy';
    spacingEm = clamp(
      Math.min(spacingEm, -0.035 * Math.min(1.3, intensity)),
      -(LIMITS.spacingEm ?? 0.2),
      LIMITS.spacingEm ?? 0.2,
    );
    glowSpread = Math.max(glowSpread, 0.35);
    glowColor = [128, 116, 206];
  } else if (catsSet.has('growth') && catsSet.has('fire')) {
    pKind = 'ember';
    pMax = Math.max(pMax, 18);
    sparkleStyle = 'ember';
    sigWaveform = 'flicker';
    sigAxis = 'y';
    glowSpread = Math.max(glowSpread, 0.8);
    glowColor = [255, 146, 48];
  }

  if (dMode === 'accent' || light) {
    particles = 0;
    sparkle = 0;
    if (light) chromaticEm = 0;
  } else if (on.has('particles') && CUSTOM_PARTICLE_KINDS.has(pKind) && intensity > 0) {
    const scaledPmax = pMax * Math.min(1.5, intensity) * calmDamp * ambDamp;
    particles = pyRound(clamp(Math.max(particles * ambDamp, scaledPmax), 0, 28));
  }

  return {
    seed,
    vector: vec,
    primitives: prims,
    bleed: bleedTotal,
    bleedFrom,
    repeatN,
    holdS,
    colorFrom,
    colorTo,
    driftEm,
    jitterEm,
    jitterHz,
    waveEm,
    waveHz,
    spacingEm,
    scaleAmp,
    scalePeriodS,
    rotationDeg,
    staggerMs,
    letterOffsetEm,
    opacityMin,
    blurEm,
    glow,
    grain,
    chromaticEm,
    trail,
    erode,
    vanishS: 0,
    particles,
    fracture,
    sparkle,
    flash,
    audioGain,
    oscHz,
    oscColor,
    oscPhase: finalOscPhase,
    oscJitterEm,
    note: match.note,
    strainGain: finalStrainGain,
    releaseS,
    residueLevel,
    zeta,
    isHero: !isBg && !light,
    isBg,
    tier: isBg ? 'support' : light ? 'light' : 'strong',
    bleedDonorS: strongestDonor ? strongestDonor.beginMs / 1000 : -1,
    bleedDonorEndS: strongestDonor ? strongestDonor.endMs / 1000 : -1,
    handoffOverlapS,
    durationMode: dMode,
    waveform: sigWaveform as FxWaveform,
    sigFreqHz: sigFreq,
    sigAxis: sigAxis as FxSigAxis,
    sigAmpEm: sigAmp,
    fillTint: sig.fillTint,
    fillEdgeSoftness: sig.fillEdgeSoftness,
    glowSpread,
    glowColor,
    particleKind: CUSTOM_PARTICLE_KINDS.has(pKind) ? pKind : 'dust',
    sparkleStyle,
    motif: sig.motif,
    tintSpread: sig.tintSpread,
    scatterEm: light ? 0 : sig.scatterEm,
    glitch: light ? 0 : sig.glitch,
    shimmer: light ? 0 : sig.shimmer,
    glowGain: light ? Math.min(1, glowGain) : glowGain,
    streak: light || isBg ? 0 : streak,
    variant: pickedVariant ? variantId(lead, pickedVariant.name) : '',
  };
}

export interface ComposeAmbientOpts {
  readonly trackId?: string;
  readonly lineI?: number;
  readonly lineKey?: string;
  readonly wordI?: number;
  readonly holdS?: number;
  readonly intensity?: number;
  readonly palette?: readonly Rgb[];
  readonly bleedCol?: Rgb | null;
  readonly bleedWeight?: number;
  readonly donor?: WordMatch | null;
  readonly isBg?: boolean;
  readonly handoffOverlapS?: number;
}

export function composeAmbientFx(vec: readonly number[], opts: ComposeAmbientOpts = {}): FxParams {
  const {
    trackId = '',
    lineI = 0,
    lineKey = '',
    wordI = 0,
    holdS = 0.4,
    intensity = 1,
    palette = [],
    bleedCol = null,
    bleedWeight = 0,
    donor = null,
    isBg = false,
    handoffOverlapS = 0.32,
  } = opts;

  const k = clamp(intensity, 0, 1) * (isBg ? 0.4 : 1);
  const col = blendPalette(ambientVectorColor(vec), palette, 0.45);
  const cTo =
    bleedCol && bleedWeight > 0 ? lerpRgb(col, bleedCol, Math.min(0.85, bleedWeight * 2)) : col;
  const fillTint = clamp(0.15 * k * (1 + 1.2 * bleedWeight), 0, bleedWeight > 0 ? 0.25 : 0.15);
  const sigAmp = clamp(0.005 * k * (1 + 1.5 * bleedWeight), 0, 0.012);
  const softness = clamp(1 + 0.12 * (vec[5] ?? 0), 0.85, 1.25);
  const { mode: dMode } = durationMode(Math.max(0.05, holdS));

  return {
    seed: seedFor(trackId, lineKey || lineI, wordI),
    vector: vec.slice(0, 6),
    primitives: [],
    bleed: Math.round(bleedWeight * 10_000) / 10_000,
    bleedFrom: donor ? donor.lemma : '',
    repeatN: 0,
    holdS,
    colorFrom: col,
    colorTo: cTo,
    driftEm: 0,
    jitterEm: 0,
    jitterHz: 0,
    waveEm: 0,
    waveHz: 0,
    spacingEm: 0,
    scaleAmp: 0,
    scalePeriodS: 1.2,
    rotationDeg: 0,
    staggerMs: 0,
    letterOffsetEm: 0,
    opacityMin: 1,
    blurEm: 0,
    glow: clamp(0.12 * k, 0, 0.15),
    grain: 0,
    chromaticEm: 0,
    trail: 0,
    erode: 0,
    vanishS: 0,
    particles: 0,
    fracture: 0,
    sparkle: 0,
    flash: 0.45,
    audioGain: 0,
    oscHz: 0,
    oscColor: [255, 255, 255],
    oscPhase: 0,
    oscJitterEm: 0,
    note: 'ambient',
    strainGain: 0,
    releaseS: 0.65,
    residueLevel: 0.14,
    zeta: 1,
    isHero: false,
    isBg,
    tier: 'ambient',
    bleedDonorS: donor ? donor.beginMs / 1000 : -1,
    bleedDonorEndS: donor ? donor.endMs / 1000 : -1,
    handoffOverlapS,
    durationMode: dMode,
    waveform: 'sine',
    sigFreqHz: 0.8,
    sigAxis: 'y',
    sigAmpEm: sigAmp,
    fillTint,
    fillEdgeSoftness: softness,
    glowSpread: 0.18,
    glowColor: null,
    particleKind: 'dust',
    sparkleStyle: 'star',
    motif: '',
    tintSpread: '',
    scatterEm: 0,
    glitch: 0,
    shimmer: 0,
    glowGain: 1,
    streak: 0,
    variant: '',
  };
}
