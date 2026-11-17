import { MOTION_MODES } from '@/engine/motion';
import { defaultParams, type Params } from '@/engine/params';
import { defaultStyle, type Rgb, type Style } from '@/render/style';
import { isRecord, parseJson, type JsonObject } from '@/shared/json';
import { PresetError } from './errors';

export const PRESET_SCHEMA = 'marea.preset';
export const PRESET_VERSION = 1;
export const PRESET_MAX_BYTES = 256 * 1024;
export const PRESET_SECTIONS = [
  'tipografia',
  'color',
  'fondo',
  'efectos',
  'marca_de_agua',
] as const;

export type PresetSection = (typeof PRESET_SECTIONS)[number];
export type PresetSectionsData = Record<PresetSection, JsonObject>;

export interface PresetDocument {
  schema: typeof PRESET_SCHEMA;
  version: number;
  name: string;
  description: string;
  created: string;
  updated: string;
  tipografia: JsonObject;
  color: JsonObject;
  fondo: JsonObject;
  efectos: JsonObject;
  marca_de_agua: JsonObject;
}

export interface FxSettings {
  fxIntensity: number;
  adaptBg: boolean;
}

export interface LookState {
  style: Style;
  params: Params;
  background: JsonObject;
  fx: FxSettings;
}

export interface PresetFlag {
  kind: 'missingFont';
  font: string;
}

export interface ValidatedPreset {
  preset: PresetDocument;
  flags: PresetFlag[];
}

export function defaultFxSettings(): FxSettings {
  return { fxIntensity: 1, adaptBg: true };
}

export function defaultBackgroundFields(): JsonObject {
  return {
    source: 'cover',
    loop: 'repeat',
    fit: 'cover',
    zoom: 1,
    pan_x: 0,
    pan_y: 0,
    dim: 0.25,
    blur: 0,
    saturation: 1,
    scrim: 0,
    cover_tint: 0,
  };
}

type FieldKind =
  | { kind: 'num'; lo: number; hi: number }
  | { kind: 'bool' }
  | { kind: 'choice'; choices: readonly string[] }
  | { kind: 'str'; maxLen: number }
  | { kind: 'font'; maxLen: number }
  | { kind: 'rgb' }
  | { kind: 'rgbOrNone' };

type TargetGroup = 'style' | 'params' | 'bg' | 'fx';

interface FieldSpec {
  readonly key: string;
  readonly section: PresetSection;
  readonly target: TargetGroup;
  readonly spec: FieldKind;
  readonly prop: string;
}

const LOOPS = ['repeat', 'pingpong', 'hold'] as const;
const FITS = ['cover', 'contain'] as const;
const SOURCES = ['cover', 'video', 'transparent'] as const;
const WM_SIDES = ['left', 'right'] as const;

export const PRESET_FIELDS: readonly FieldSpec[] = [
  {
    key: 'font_family',
    section: 'tipografia',
    target: 'style',
    prop: 'fontFamily',
    spec: { kind: 'font', maxLen: 80 },
  },
  {
    key: 'font_frac',
    section: 'tipografia',
    target: 'style',
    prop: 'fontFrac',
    spec: { kind: 'num', lo: 0.04, hi: 0.1 },
  },
  { key: 'text_rgb', section: 'color', target: 'style', prop: 'textRgb', spec: { kind: 'rgb' } },
  {
    key: 'glow_rgb',
    section: 'color',
    target: 'style',
    prop: 'glowRgb',
    spec: { kind: 'rgbOrNone' },
  },
  {
    key: 'glow_gain',
    section: 'color',
    target: 'style',
    prop: 'glowGain',
    spec: { kind: 'num', lo: 0, hi: 3 },
  },
  { key: 'bloom', section: 'color', target: 'style', prop: 'bloom', spec: { kind: 'bool' } },
  {
    key: 'bloom_gain',
    section: 'color',
    target: 'style',
    prop: 'bloomGain',
    spec: { kind: 'num', lo: 0, hi: 3 },
  },
  {
    key: 'dim_alpha',
    section: 'color',
    target: 'style',
    prop: 'dimAlpha',
    spec: { kind: 'num', lo: 0.05, hi: 0.35 },
  },
  {
    key: 'source',
    section: 'fondo',
    target: 'bg',
    prop: 'source',
    spec: { kind: 'choice', choices: SOURCES },
  },
  {
    key: 'bg_blur',
    section: 'fondo',
    target: 'style',
    prop: 'bgBlur',
    spec: { kind: 'num', lo: 0.2, hi: 3 },
  },
  {
    key: 'bg_veil',
    section: 'fondo',
    target: 'style',
    prop: 'bgVeil',
    spec: { kind: 'num', lo: 0, hi: 0.8 },
  },
  {
    key: 'bg_sat',
    section: 'fondo',
    target: 'style',
    prop: 'bgSat',
    spec: { kind: 'num', lo: 0, hi: 2 },
  },
  {
    key: 'bg_speed',
    section: 'fondo',
    target: 'style',
    prop: 'bgSpeed',
    spec: { kind: 'num', lo: 0, hi: 3 },
  },
  {
    key: 'loop',
    section: 'fondo',
    target: 'bg',
    prop: 'loop',
    spec: { kind: 'choice', choices: LOOPS },
  },
  {
    key: 'fit',
    section: 'fondo',
    target: 'bg',
    prop: 'fit',
    spec: { kind: 'choice', choices: FITS },
  },
  {
    key: 'zoom',
    section: 'fondo',
    target: 'bg',
    prop: 'zoom',
    spec: { kind: 'num', lo: 1, hi: 3 },
  },
  {
    key: 'pan_x',
    section: 'fondo',
    target: 'bg',
    prop: 'pan_x',
    spec: { kind: 'num', lo: -1, hi: 1 },
  },
  {
    key: 'pan_y',
    section: 'fondo',
    target: 'bg',
    prop: 'pan_y',
    spec: { kind: 'num', lo: -1, hi: 1 },
  },
  {
    key: 'dim',
    section: 'fondo',
    target: 'bg',
    prop: 'dim',
    spec: { kind: 'num', lo: 0, hi: 0.85 },
  },
  {
    key: 'blur',
    section: 'fondo',
    target: 'bg',
    prop: 'blur',
    spec: { kind: 'num', lo: 0, hi: 1 },
  },
  {
    key: 'saturation',
    section: 'fondo',
    target: 'bg',
    prop: 'saturation',
    spec: { kind: 'num', lo: 0, hi: 1.6 },
  },
  {
    key: 'scrim',
    section: 'fondo',
    target: 'bg',
    prop: 'scrim',
    spec: { kind: 'num', lo: 0, hi: 1 },
  },
  {
    key: 'cover_tint',
    section: 'fondo',
    target: 'bg',
    prop: 'cover_tint',
    spec: { kind: 'num', lo: 0, hi: 1 },
  },
  {
    key: 'fx_intensity',
    section: 'efectos',
    target: 'fx',
    prop: 'fxIntensity',
    spec: { kind: 'num', lo: 0, hi: 1.5 },
  },
  {
    key: 'adapt_bg',
    section: 'efectos',
    target: 'fx',
    prop: 'adaptBg',
    spec: { kind: 'bool' },
  },
  {
    key: 'motion',
    section: 'efectos',
    target: 'params',
    prop: 'motion',
    spec: { kind: 'choice', choices: MOTION_MODES },
  },
  {
    key: 'motion_amt',
    section: 'efectos',
    target: 'params',
    prop: 'motionAmt',
    spec: { kind: 'num', lo: 0, hi: 1.5 },
  },
  {
    key: 'blurm',
    section: 'efectos',
    target: 'params',
    prop: 'blurm',
    spec: { kind: 'num', lo: 0, hi: 2 },
  },
  {
    key: 'wob',
    section: 'efectos',
    target: 'params',
    prop: 'wob',
    spec: { kind: 'num', lo: 0.25, hi: 1 },
  },
  { key: 'vib', section: 'efectos', target: 'params', prop: 'vib', spec: { kind: 'bool' } },
  { key: 'emph', section: 'efectos', target: 'params', prop: 'emph', spec: { kind: 'bool' } },
  {
    key: 'wm_text',
    section: 'marca_de_agua',
    target: 'style',
    prop: 'wmText',
    spec: { kind: 'str', maxLen: 60 },
  },
  {
    key: 'wm_side',
    section: 'marca_de_agua',
    target: 'style',
    prop: 'wmSide',
    spec: { kind: 'choice', choices: WM_SIDES },
  },
  {
    key: 'wm_glyph',
    section: 'marca_de_agua',
    target: 'style',
    prop: 'wmGlyph',
    spec: { kind: 'bool' },
  },
  {
    key: 'wm_alpha',
    section: 'marca_de_agua',
    target: 'style',
    prop: 'wmAlpha',
    spec: { kind: 'num', lo: 0, hi: 1 },
  },
];

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;
const ALLOWED_FONTS = new Set(['', 'Inter Tight']);

export function rgbToHex(rgb: Rgb): string {
  const hex = (n: number): string =>
    Math.max(0, Math.min(255, Math.trunc(n)))
      .toString(16)
      .toUpperCase()
      .padStart(2, '0');
  return `${String.fromCharCode(35)}${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`;
}

export function hexToRgb(value: unknown): Rgb | null {
  if (typeof value !== 'string') return null;
  const match = HEX_RE.exec(value);
  const body = match?.[1];
  if (!body) return null;
  return [
    Number.parseInt(body.slice(0, 2), 16),
    Number.parseInt(body.slice(2, 4), 16),
    Number.parseInt(body.slice(4, 6), 16),
  ];
}

function isoNow(): string {
  return new Date().toISOString().slice(0, 19);
}

function defaultMap(): Record<string, unknown> {
  const st = defaultStyle() as unknown as Record<string, unknown>;
  const pa = defaultParams() as unknown as Record<string, unknown>;
  const bg = defaultBackgroundFields() as Record<string, unknown>;
  const fx = defaultFxSettings() as unknown as Record<string, unknown>;
  const groups: Record<TargetGroup, Record<string, unknown>> = {
    style: st,
    params: pa,
    bg,
    fx,
  };
  const out: Record<string, unknown> = {};
  for (const field of PRESET_FIELDS) {
    out[field.key] = groups[field.target][field.prop];
  }
  return out;
}

function cleanValue(spec: FieldKind, v: unknown, fallback: unknown): unknown {
  switch (spec.kind) {
    case 'num':
      return typeof v === 'number' && Number.isFinite(v)
        ? Math.min(spec.hi, Math.max(spec.lo, v))
        : fallback;
    case 'bool':
      return typeof v === 'boolean' ? v : fallback;
    case 'choice':
      return typeof v === 'string' && spec.choices.includes(v) ? v : fallback;
    case 'str':
    case 'font':
      return typeof v === 'string' ? v.trim().slice(0, spec.maxLen) : fallback;
    case 'rgb':
      return hexToRgb(v) ?? fallback;
    case 'rgbOrNone':
      return v === null ? null : (hexToRgb(v) ?? fallback);
  }
}

function encodeValue(spec: FieldKind, v: unknown): unknown {
  if (spec.kind === 'rgb' || spec.kind === 'rgbOrNone') {
    return v === null ? null : rgbToHex(v as Rgb);
  }
  return v;
}

export function capturePreset(look: LookState, name = '', description = ''): PresetDocument {
  const now = isoNow();
  const src: Record<TargetGroup, Record<string, unknown>> = {
    style: look.style as unknown as Record<string, unknown>,
    params: look.params as unknown as Record<string, unknown>,
    bg: { ...defaultBackgroundFields(), ...look.background },
    fx: look.fx as unknown as Record<string, unknown>,
  };
  const out: PresetDocument = {
    schema: PRESET_SCHEMA,
    version: PRESET_VERSION,
    name,
    description,
    created: now,
    updated: now,
    tipografia: {},
    color: {},
    fondo: {},
    efectos: {},
    marca_de_agua: {},
  };
  for (const field of PRESET_FIELDS) {
    out[field.section][field.key] = encodeValue(field.spec, src[field.target][field.prop]);
  }
  return out;
}

export function currentPresetValues(look: LookState): PresetSectionsData {
  const full = capturePreset(look);
  return {
    tipografia: full.tipografia,
    color: full.color,
    fondo: full.fondo,
    efectos: full.efectos,
    marca_de_agua: full.marca_de_agua,
  };
}

export function applyPreset(
  preset: Partial<PresetSectionsData>,
  look: LookState,
  sections: readonly PresetSection[] = PRESET_SECTIONS,
): LookState {
  const style: Style = { ...look.style, textRgb: [...look.style.textRgb] as unknown as Rgb };
  const params: Params = { ...look.params };
  const background: JsonObject = { ...look.background };
  const fx: FxSettings = { ...look.fx };
  const dst: Record<TargetGroup, Record<string, unknown>> = {
    style: style as unknown as Record<string, unknown>,
    params: params as unknown as Record<string, unknown>,
    bg: background,
    fx: fx as unknown as Record<string, unknown>,
  };
  const sectionSet = new Set<PresetSection>(sections);

  for (const field of PRESET_FIELDS) {
    if (!sectionSet.has(field.section)) continue;
    const secObj = preset[field.section];
    if (!isRecord(secObj) || !(field.key in secObj)) continue;
    const rawVal = secObj[field.key];
    if (field.spec.kind === 'rgb' || field.spec.kind === 'rgbOrNone') {
      dst[field.target][field.prop] = typeof rawVal === 'string' ? hexToRgb(rawVal) : rawVal;
    } else {
      dst[field.target][field.prop] = rawVal;
    }
  }
  if (background.source === 'video' && (background.video === null || !background.video)) {
    background.source = 'cover';
  }
  return { style, params, background, fx };
}

function parseVersion(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string' && /^\s*[+-]?\d+\s*$/.test(raw)) return Number(raw);
  throw new PresetError('badVersion');
}

export function validatePreset(raw: unknown): ValidatedPreset {
  if (!isRecord(raw)) throw new PresetError('notObject');
  if (raw.schema !== PRESET_SCHEMA) {
    throw new PresetError('unsupportedSchema', typeof raw.schema === 'string' ? raw.schema : '');
  }
  const version = parseVersion(raw.version === undefined ? 1 : raw.version);
  if (version < 1 || version > PRESET_VERSION) {
    throw new PresetError('unsupportedVersion', `v${String(version)}`);
  }

  const defaults = defaultMap();
  const flags: PresetFlag[] = [];
  const now = isoNow();
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : '';
  const description =
    typeof raw.description === 'string' ? raw.description.trim().slice(0, 300) : '';
  const out: PresetDocument = {
    schema: PRESET_SCHEMA,
    version: PRESET_VERSION,
    name,
    description,
    created: typeof raw.created === 'string' ? raw.created : now,
    updated: typeof raw.updated === 'string' ? raw.updated : now,
    tipografia: {},
    color: {},
    fondo: {},
    efectos: {},
    marca_de_agua: {},
  };

  for (const sec of PRESET_SECTIONS) {
    const src = raw[sec];
    if (!isRecord(src)) continue;
    for (const field of PRESET_FIELDS) {
      if (field.section !== sec || !(field.key in src)) continue;
      let cleaned = cleanValue(field.spec, src[field.key], defaults[field.key]);
      if (
        field.spec.kind === 'font' &&
        typeof cleaned === 'string' &&
        !ALLOWED_FONTS.has(cleaned)
      ) {
        flags.push({ kind: 'missingFont', font: cleaned });
        cleaned = '';
      }
      out[sec][field.key] = encodeValue(field.spec, cleaned);
    }
  }

  return { preset: out, flags };
}

export function parsePresetText(text: string): ValidatedPreset {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > PRESET_MAX_BYTES) throw new PresetError('tooLarge');
  const raw = parseJson(text);
  if (raw === null) throw new PresetError('invalidJson');
  return validatePreset(raw);
}

/** Partial preset extracted from saved `project.editor` (`style`, `params`, `fx` using desktop snake_case keys). */
export function presetFromEditorState(state: JsonObject): PresetSectionsData {
  const groups: Record<'style' | 'params' | 'fx', unknown> = {
    style: state.style,
    params: state.params,
    fx: state.fx,
  };
  const defaults = defaultMap();
  const out: PresetSectionsData = {
    tipografia: {},
    color: {},
    fondo: {},
    efectos: {},
    marca_de_agua: {},
  };
  for (const field of PRESET_FIELDS) {
    if (field.target === 'bg') continue;
    const src = groups[field.target];
    if (!isRecord(src) || !(field.key in src)) continue;
    let rawVal: unknown = src[field.key];
    if (
      (field.spec.kind === 'rgb' || field.spec.kind === 'rgbOrNone') &&
      Array.isArray(rawVal) &&
      rawVal.length === 3 &&
      rawVal.every((c) => typeof c === 'number' && Number.isFinite(c))
    ) {
      rawVal = rgbToHex([
        Math.max(0, Math.min(255, Math.trunc(rawVal[0] as number))),
        Math.max(0, Math.min(255, Math.trunc(rawVal[1] as number))),
        Math.max(0, Math.min(255, Math.trunc(rawVal[2] as number))),
      ]);
    }
    const cleaned = cleanValue(field.spec, rawVal, defaults[field.key]);
    out[field.section][field.key] = encodeValue(field.spec, cleaned);
  }
  return out;
}

export function changedSections(
  preset: Partial<PresetSectionsData>,
  current: Partial<PresetSectionsData>,
  sections: readonly PresetSection[] = PRESET_SECTIONS,
): PresetSection[] {
  const diff: PresetSection[] = [];
  for (const sec of sections) {
    const secPreset = preset[sec];
    const secCurrent = current[sec];
    if (!isRecord(secPreset)) continue;
    for (const [key, val] of Object.entries(secPreset)) {
      const cur = isRecord(secCurrent) ? secCurrent[key] : undefined;
      const same =
        typeof val === 'number' && typeof cur === 'number'
          ? Math.abs(cur - val) < 1e-6
          : cur === val;
      if (!same) {
        diff.push(sec);
        break;
      }
    }
  }
  return diff;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 16-hex-char SHA-1 signature over the visual sections of a preset (used as thumbnail cache key). */
export async function presetSignature(preset: PresetSectionsData): Promise<string> {
  const body: Record<string, JsonObject> = {};
  for (const sec of PRESET_SECTIONS) body[sec] = preset[sec];
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(canonicalJson(body)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
