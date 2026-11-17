import { pyRound } from './pycompat';

export type RgbTriple = readonly [number, number, number];

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function smoothstepRange(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerpRgb(a: RgbTriple, b: RgbTriple, u: number): RgbTriple {
  if (u <= 0 || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2])) return a;
  if (u >= 1) return b;
  return [
    pyRound(a[0] + (b[0] - a[0]) * u),
    pyRound(a[1] + (b[1] - a[1]) * u),
    pyRound(a[2] + (b[2] - a[2]) * u),
  ];
}

export function luma(rgb: RgbTriple): number {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

/** Exact port of Python `colorsys.rgb_to_hsv(r, g, b)` on `[0, 1]` inputs. */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  const v = maxc;
  if (minc === maxc) return [0, 0, v];
  const s = (maxc - minc) / maxc;
  const rc = (maxc - r) / (maxc - minc);
  const gc = (maxc - g) / (maxc - minc);
  const bc = (maxc - b) / (maxc - minc);
  let h = r === maxc ? bc - gc : g === maxc ? 2 + rc - bc : 4 + gc - rc;
  h = (((h / 6) % 1) + 1) % 1;
  return [h, s, v];
}

/** Exact port of Python `colorsys.hsv_to_rgb(h, s, v)` on `[0, 1]` inputs. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  if (s === 0) return [v, v, v];
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}
