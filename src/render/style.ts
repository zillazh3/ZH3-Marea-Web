import { TUNING } from '@/engine/tuning';

/** 0..255 integer RGB triple. */
export type Rgb = readonly [number, number, number];

export type WatermarkSide = 'left' | 'right';

/** Visual appearance of a clip, mirroring desktop `Style` in `marea/render/scene.py`. */
export interface Style {
  /** Font size as a fraction of `ref = min(w, 0.8 * h)`. */
  fontFrac: number;
  bloom: boolean;
  title: string;
  artist: string;
  /** Empty string = bundled Inter Tight (the only font in v1). */
  fontFamily: string;
  wmText: string;
  wmSide: WatermarkSide;
  wmGlyph: boolean;
  credit: boolean;
  textRgb: Rgb;
  /** null = derived from the cover's dominant color pulled toward white. */
  glowRgb: Rgb | null;
  glowGain: number;
  bloomGain: number;
  dimAlpha: number;
  wmAlpha: number;
  bgBlur: number;
  bgVeil: number;
  bgSat: number;
  bgSpeed: number;
}

export function defaultStyle(): Style {
  return {
    fontFrac: 0.066,
    bloom: true,
    title: '',
    artist: '',
    fontFamily: '',
    wmText: 'Zilla-ZH3',
    wmSide: 'left',
    wmGlyph: false,
    credit: true,
    textRgb: [255, 255, 255],
    glowRgb: null,
    glowGain: 1,
    bloomGain: 1,
    dimAlpha: TUNING.dimAlpha,
    wmAlpha: 0.4,
    bgBlur: 1,
    bgVeil: 0.22,
    bgSat: 1.3,
    bgSpeed: 1,
  };
}
