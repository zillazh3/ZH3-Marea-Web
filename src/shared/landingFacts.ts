import rawWordfxLibrary from '@/assets/wordfx/library.json';
import abisalPreset from './data/presets/Abisal.json';
import bajamarPreset from './data/presets/Bajamar.json';
import nieblaPreset from './data/presets/Niebla.json';
import pleamarPreset from './data/presets/Pleamar.json';

export type CoverTheme = 'ocean' | 'sunset' | 'fog' | 'abyss';
export type PresetSlug = 'bajamar' | 'pleamar' | 'niebla' | 'abisal';

export interface LandingCorriente {
  readonly slug: PresetSlug;
  readonly name: string;
  readonly cover: CoverTheme;
  readonly brightness: number;
  readonly blur: number;
  readonly effects: number;
  readonly size: number;
  readonly sizeMax: number;
  readonly cssVars: {
    readonly textSizePx: number;
    readonly glowFactor: number;
    readonly blurPx: number;
    readonly dimAlpha: number;
    readonly textColor: string;
    readonly glowColor: string | null;
  };
}

interface RawPresetShape {
  readonly name: string;
  readonly tipografia: { readonly font_frac: number };
  readonly color: {
    readonly text_rgb: string;
    readonly glow_rgb: string | null;
    readonly glow_gain: number;
  };
  readonly fondo: {
    readonly bg_blur: number;
    readonly bg_veil: number;
  };
  readonly efectos: {
    readonly fx_intensity: number;
  };
}

const GLOW_GAIN_REF = 1.6;
const BG_BLUR_REF = 2.0;
const BG_BLUR_BASELINE = 1.0;
const BG_BLUR_CSS_SCALE = 17.5;
const FONT_FRAC_TO_MILLE = 1000;
const FONT_FRAC_TO_CARD_PX = 290;
const SIZE_METER_MAX = 100;

const PRESET_SPECS: readonly {
  readonly slug: PresetSlug;
  readonly cover: CoverTheme;
  readonly raw: RawPresetShape;
}[] = [
  { slug: 'bajamar', cover: 'ocean', raw: bajamarPreset },
  { slug: 'pleamar', cover: 'sunset', raw: pleamarPreset },
  { slug: 'niebla', cover: 'fog', raw: nieblaPreset },
  { slug: 'abisal', cover: 'abyss', raw: abisalPreset },
];

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildCorrientesFacts(): readonly LandingCorriente[] {
  return PRESET_SPECS.map(({ slug, cover, raw }) => {
    const brightness = clampPercent((raw.color.glow_gain / GLOW_GAIN_REF) * 100);
    const blur = clampPercent((raw.fondo.bg_blur / BG_BLUR_REF) * 100);
    const effects = clampPercent(raw.efectos.fx_intensity * 100);
    const size = Math.round(raw.tipografia.font_frac * FONT_FRAC_TO_MILLE);
    return {
      slug,
      name: raw.name,
      cover,
      brightness,
      blur,
      effects,
      size,
      sizeMax: SIZE_METER_MAX,
      cssVars: {
        textSizePx: Math.round(raw.tipografia.font_frac * FONT_FRAC_TO_CARD_PX),
        glowFactor: Number((brightness / 100).toFixed(2)),
        blurPx: Math.round(Math.max(0, raw.fondo.bg_blur - BG_BLUR_BASELINE) * BG_BLUR_CSS_SCALE),
        dimAlpha: raw.fondo.bg_veil,
        textColor: raw.color.text_rgb,
        glowColor: raw.color.glow_rgb,
      },
    };
  });
}

export function countWordfxCategories(library: Record<string, unknown> = rawWordfxLibrary): number {
  return Object.keys(library).filter((key) => !key.startsWith('_')).length;
}

export const LANDING_CORRIENTES: readonly LandingCorriente[] = buildCorrientesFacts();
export const WORDFX_CATEGORY_COUNT: number = countWordfxCategories();
