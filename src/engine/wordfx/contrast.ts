import { smoothstepRange } from '@/shared/color';
import { pyRound } from '@/shared/pycompat';
import type { FxParams, Rgb } from './fxtypes';

const TARGET = 3.0;
const SWITCH = 0.22;
const BAND = 0.07;
const RAMP_HI = 3.5;
const RAMP_LO = 2.5;

const ADAPT_CACHE = new Map<string, Rgb>();

function toLin(c: number): number {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function toSrgb(v: number): number {
  const clamped = v <= 0 ? 0 : v >= 1 ? 1 : v;
  const curved = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return pyRound(255 * curved);
}

export function luminance(rgb: Rgb): number {
  return 0.2126 * toLin(rgb[0]) + 0.7152 * toLin(rgb[1]) + 0.0722 * toLin(rgb[2]);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function adaptRgb(rgb: Rgb, bg: Rgb): Rgb {
  const key = `${String(rgb[0])},${String(rgb[1])},${String(rgb[2])}|${String(bg[0])},${String(bg[1])},${String(bg[2])}`;
  const cached = ADAPT_CACHE.get(key);
  if (cached) return cached;

  const a = Math.min(1, Math.max(0, (RAMP_HI - contrastRatio(rgb, bg)) / (RAMP_HI - RAMP_LO)));
  if (a <= 0) {
    if (ADAPT_CACHE.size >= 4096) ADAPT_CACHE.clear();
    ADAPT_CACHE.set(key, rgb);
    return rgb;
  }

  const y = luminance(rgb);
  const lb = luminance(bg);
  const lightY = Math.min(1, TARGET * (lb + 0.05) - 0.05);
  const darkY = Math.max(0, (lb + 0.05) / TARGET - 0.05);
  const w = smoothstepRange(SWITCH - BAND, SWITCH + BAND, lb);
  const t = y < 1 ? Math.max(0, (lightY - y) / (1 - y)) : 0;
  const k = y > 0 ? Math.min(1, darkY / y) : 1;

  const ch = (v: number): number => {
    const c = toLin(v);
    const target = (1 - w) * (c + (1 - c) * t) + w * (c * k);
    return toSrgb(c + (target - c) * a);
  };
  const out: Rgb = [ch(rgb[0]), ch(rgb[1]), ch(rgb[2])];
  if (ADAPT_CACHE.size >= 4096) ADAPT_CACHE.clear();
  ADAPT_CACHE.set(key, out);
  return out;
}

export function adaptFxParams(p: FxParams, bg: Rgb | null): FxParams {
  if (bg === null) return p;
  const cf = adaptRgb(p.colorFrom, bg);
  const ct = adaptRgb(p.colorTo, bg);
  const co = adaptRgb(p.oscColor, bg);
  if (
    cf[0] === p.colorFrom[0] &&
    cf[1] === p.colorFrom[1] &&
    cf[2] === p.colorFrom[2] &&
    ct[0] === p.colorTo[0] &&
    ct[1] === p.colorTo[1] &&
    ct[2] === p.colorTo[2] &&
    co[0] === p.oscColor[0] &&
    co[1] === p.oscColor[1] &&
    co[2] === p.oscColor[2]
  ) {
    return p;
  }
  return { ...p, colorFrom: cf, colorTo: ct, oscColor: co };
}
