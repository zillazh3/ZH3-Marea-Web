import rawLibrary from '@/assets/wordfx/library.json';
import type { Rgb } from '@/engine/wordfx/fxtypes';
import { isRecord, type JsonObject } from '@/shared/json';
import { normalizeWord } from './lexicon';

export const LANGS = ['es', 'en'] as const;
export type FxLang = (typeof LANGS)[number];
export const KINDS = ['emotion', 'element', 'month'] as const;
export type CategoryKind = (typeof KINDS)[number];

export const VALID_PRIMITIVES = new Set([
  'displacement',
  'letter_offset',
  'scale',
  'rotation',
  'opacity',
  'blur',
  'letter_spacing',
  'gravity_drift',
  'jitter',
  'wave',
  'glow',
  'hue_shift',
  'desaturate',
  'chromatic',
  'grain',
  'particles',
  'mask_reveal',
  'erode',
  'fracture',
  'trail',
  'sparkle',
]);

const AXES_BOUNDS: Record<string, readonly [number, number]> = {
  valence: [-1, 1],
  arousal: [0, 1],
  gravity: [-1, 1],
  temperature: [-1, 1],
  fragility: [0, 1],
  blur: [0, 1],
};

export interface Category {
  readonly name: string;
  readonly lemmas: Readonly<Record<FxLang, ReadonlySet<string>>>;
  readonly vector: Readonly<Record<string, number>>;
  readonly primitives: readonly string[];
  readonly priority: number;
  readonly kind: CategoryKind;
  readonly color: readonly Rgb[];
}

export interface WordFxLibrary {
  readonly categories: Readonly<Record<string, Category>>;
  readonly index: Readonly<Record<FxLang, Readonly<Record<string, readonly string[]>>>>;
  readonly known: Readonly<Record<FxLang, ReadonlySet<string>>>;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function parseColors(name: string, raw: unknown): readonly Rgb[] {
  const arr = typeof raw === 'string' ? [raw] : raw;
  if (!Array.isArray(arr) || arr.length > 2) {
    throw new Error(`«${name}»: invalid color list`);
  }
  return arr.map((c) => {
    if (typeof c !== 'string' || !HEX_RE.test(c)) {
      throw new Error(`«${name}»: invalid hex color`);
    }
    return [
      Number.parseInt(c.slice(1, 3), 16),
      Number.parseInt(c.slice(3, 5), 16),
      Number.parseInt(c.slice(5, 7), 16),
    ];
  });
}

export function parseLibrary(raw: JsonObject): WordFxLibrary {
  const cats: Record<string, Category> = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (name.startsWith('_')) continue;
    if (!isRecord(entry)) throw new Error(`«${name}»: expected object`);

    const lemmas: Record<FxLang, Set<string>> = { es: new Set(), en: new Set() };
    const rawLemmas = isRecord(entry.lemmas) ? entry.lemmas : {};
    for (const [lang, words] of Object.entries(rawLemmas)) {
      if (lang !== 'es' && lang !== 'en') throw new Error(`«${name}»: unknown lang ${lang}`);
      if (!Array.isArray(words)) throw new Error(`«${name}»: lemmas.${lang} must be list`);
      for (const w of words) {
        if (typeof w !== 'string') throw new Error(`«${name}»: lemma must be string`);
        const normalized = w
          .split(/\s+/)
          .map((p) => normalizeWord(p))
          .filter(Boolean)
          .join(' ');
        if (normalized) lemmas[lang].add(normalized);
      }
    }
    if (lemmas.es.size === 0 && lemmas.en.size === 0) {
      throw new Error(`«${name}»: empty lemmas`);
    }

    if (!isRecord(entry.vector)) throw new Error(`«${name}»: missing vector`);
    const vector: Record<string, number> = {};
    for (const [axis, bounds] of Object.entries(AXES_BOUNDS)) {
      const val = entry.vector[axis];
      if (typeof val !== 'number' || !Number.isFinite(val) || val < bounds[0] || val > bounds[1]) {
        throw new Error(`«${name}»: invalid vector.${axis}`);
      }
      vector[axis] = val;
    }

    const primsRaw = Array.isArray(entry.primitives) ? entry.primitives : [];
    const primitives: string[] = [];
    for (const p of primsRaw) {
      if (typeof p !== 'string' || !VALID_PRIMITIVES.has(p)) {
        throw new Error(`«${name}»: invalid primitive ${String(p)}`);
      }
      primitives.push(p);
    }

    const kindRaw = entry.kind ?? 'emotion';
    if (kindRaw !== 'emotion' && kindRaw !== 'element' && kindRaw !== 'month') {
      throw new Error(`«${name}»: invalid kind`);
    }
    const prio = entry.priority ?? 5;
    if (typeof prio !== 'number' || !Number.isInteger(prio) || prio < 0 || prio > 10) {
      throw new Error(`«${name}»: invalid priority`);
    }

    cats[name] = {
      name,
      lemmas,
      vector,
      primitives,
      priority: prio,
      kind: kindRaw,
      color: parseColors(name, entry.color ?? []),
    };
  }

  const index: Record<FxLang, Record<string, string[]>> = { es: {}, en: {} };
  const known: Record<FxLang, Set<string>> = { es: new Set(), en: new Set() };
  for (const lang of LANGS) {
    const idx = index[lang];
    for (const cat of Object.values(cats)) {
      for (const lemma of cat.lemmas[lang]) {
        let bucket = idx[lemma];
        if (!bucket) {
          bucket = [];
          idx[lemma] = bucket;
        }
        bucket.push(cat.name);
        known[lang].add(lemma);
      }
    }
    for (const list of Object.values(idx)) {
      list.sort((a, b) => (cats[b]?.priority ?? 0) - (cats[a]?.priority ?? 0));
    }
  }

  return { categories: cats, index, known };
}

let cachedBundled: WordFxLibrary | null = null;

export function loadBundledLibrary(): WordFxLibrary {
  cachedBundled ??= parseLibrary(rawLibrary);
  return cachedBundled;
}
