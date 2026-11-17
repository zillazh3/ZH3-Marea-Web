import rawRules from '@/assets/wordfx/rules.json';
import { isRecord, type JsonObject } from '@/shared/json';
import { normalizeWord } from './lexicon';
import type { FxLang } from './library';

export const WILDCARD = '*';

export interface PhraseRule {
  readonly tokens: readonly string[];
  readonly lang: FxLang;
  readonly categories: readonly string[];
  readonly label: string;
  readonly at: number;
}

export interface GuardCond {
  readonly prev: ReadonlySet<string>;
  readonly next: ReadonlySet<string>;
  readonly lineEnd: boolean;
  readonly lineStart: boolean;
}

export interface GuardRule {
  readonly keepIf: GuardCond | null;
  readonly dropIf: GuardCond | null;
}

export interface ReversalRule {
  readonly trigger: readonly string[];
  readonly side: 'before' | 'after';
  readonly lang: FxLang;
  readonly map: ReadonlyMap<string, readonly string[]>;
}

export interface SenseCond {
  readonly prev: ReadonlySet<string>;
  readonly next: ReadonlySet<string>;
  readonly near: ReadonlySet<string>;
  readonly coCats: ReadonlySet<string>;
  readonly lineEnd: boolean;
  readonly lineStart: boolean;
}

export interface SenseRule {
  readonly id: number;
  readonly word: string;
  readonly lang: FxLang;
  readonly cond: SenseCond;
  readonly categories: readonly string[];
  readonly label: string;
}

export interface WordFxRules {
  readonly phrases: readonly PhraseRule[];
  readonly negators: Readonly<Record<FxLang, ReadonlySet<string>>>;
  readonly negation: ReadonlyMap<string, readonly string[]>;
  readonly reversals: readonly ReversalRule[];
  readonly guards: ReadonlyMap<string, readonly GuardRule[]>; // key: `${lang}:${word}`
  readonly contrastCategories: readonly (readonly [string, string])[];
  readonly contrastWords: readonly (readonly [string, string])[];
  readonly senses: ReadonlyMap<string, readonly SenseRule[]>; // key: `${lang}:${word}`
}

function asLang(val: unknown): FxLang {
  if (val !== 'es' && val !== 'en') throw new Error(`Invalid lang: ${String(val)}`);
  return val;
}

function asWord(val: unknown): string {
  if (typeof val !== 'string' || val.trim().split(/\s+/).length !== 1) {
    throw new Error(`Expected single word, got ${String(val)}`);
  }
  const n = normalizeWord(val);
  if (!n) throw new Error(`Empty word: ${val}`);
  return n;
}

function asWords(val: unknown): Set<string> {
  if (!Array.isArray(val)) return new Set();
  return new Set(val.map((w) => asWord(w)));
}

function asCats(val: unknown, allowEmpty = false): readonly string[] {
  if (!Array.isArray(val)) throw new Error('Expected category array');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of val) {
    if (typeof c !== 'string' || !c.trim()) throw new Error('Invalid category name');
    const trimmed = c.trim();
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  if (!allowEmpty && out.length === 0) throw new Error('Empty categories list');
  return out;
}

function parseCatMap(val: unknown): Map<string, readonly string[]> {
  const out = new Map<string, readonly string[]>();
  if (!isRecord(val)) return out;
  for (const [k, v] of Object.entries(val)) {
    if (k.startsWith('_')) continue;
    out.set(k, asCats(v, true));
  }
  return out;
}

function parseGuardCond(val: unknown): GuardCond | null {
  if (val === undefined || val === null) return null;
  if (!isRecord(val)) throw new Error('Expected condition object');
  return {
    prev: asWords(val.prev),
    next: asWords(val.next),
    lineEnd: val.line_end === true,
    lineStart: val.line_start === true,
  };
}

function parseSenseCond(val: unknown): SenseCond {
  if (!isRecord(val)) throw new Error('Expected sense condition object');
  return {
    prev: asWords(val.prev),
    next: asWords(val.next),
    near: asWords(val.near),
    coCats: new Set(Array.isArray(val.co_cats) ? asCats(val.co_cats, true) : []),
    lineEnd: val.line_end === true,
    lineStart: val.line_start === true,
  };
}

export function parseRules(raw: JsonObject): WordFxRules {
  const phrases: PhraseRule[] = [];
  if (Array.isArray(raw.phrases)) {
    for (const item of raw.phrases) {
      if (!isRecord(item) || typeof item.pattern !== 'string') throw new Error('Invalid phrase');
      const tokens = item.pattern
        .trim()
        .split(/\s+/)
        .map((p) => (p === WILDCARD ? WILDCARD : normalizeWord(p)));
      const at = typeof item.at === 'number' ? item.at : -1;
      phrases.push({
        tokens,
        lang: asLang(item.lang),
        categories: asCats(item.categories),
        label: tokens.join(' '),
        at,
      });
    }
  }

  const negators: Record<FxLang, Set<string>> = { es: new Set(), en: new Set() };
  if (isRecord(raw.negators)) {
    for (const [k, v] of Object.entries(raw.negators)) {
      if (k.startsWith('_')) continue;
      negators[asLang(k)] = asWords(v);
    }
  }

  const negation = parseCatMap(raw.negation);

  const reversals: ReversalRule[] = [];
  if (Array.isArray(raw.reversals)) {
    for (const item of raw.reversals) {
      if (!isRecord(item) || !Array.isArray(item.trigger)) throw new Error('Invalid reversal');
      const side = item.side === 'after' ? 'after' : 'before';
      reversals.push({
        trigger: item.trigger.map((t) => asWord(t)),
        side,
        lang: asLang(item.lang),
        map: parseCatMap(item.map),
      });
    }
  }

  const guards = new Map<string, GuardRule[]>();
  if (Array.isArray(raw.pos_guards)) {
    for (const item of raw.pos_guards) {
      if (!isRecord(item)) throw new Error('Invalid pos_guard');
      const key = `${asLang(item.lang)}:${asWord(item.word)}`;
      const list = guards.get(key) ?? [];
      list.push({
        keepIf: parseGuardCond(item.keep_if),
        dropIf: parseGuardCond(item.drop_if),
      });
      guards.set(key, list);
    }
  }

  const ct = isRecord(raw.contrast) ? raw.contrast : {};
  const contrastCategories: [string, string][] = [];
  if (Array.isArray(ct.categories)) {
    for (const pair of ct.categories) {
      if (Array.isArray(pair) && pair.length === 2) {
        const a = asCats([pair[0]])[0];
        const b = asCats([pair[1]])[0];
        if (a && b) contrastCategories.push([a, b]);
      }
    }
  }
  const contrastWords: [string, string][] = [];
  if (Array.isArray(ct.words)) {
    for (const pair of ct.words) {
      if (Array.isArray(pair) && pair.length === 2) {
        contrastWords.push([asWord(pair[0]), asWord(pair[1])]);
      }
    }
  }

  const senses = new Map<string, SenseRule[]>();
  let senseId = 1;
  if (Array.isArray(raw.senses)) {
    for (const item of raw.senses) {
      if (!isRecord(item)) throw new Error('Invalid sense');
      const word = asWord(item.word);
      const lang = asLang(item.lang);
      const key = `${lang}:${word}`;
      const list = senses.get(key) ?? [];
      list.push({
        id: senseId,
        word,
        lang,
        cond: parseSenseCond(item.if),
        categories: asCats(item.categories),
        label: typeof item.label === 'string' ? item.label.trim() : '',
      });
      senseId += 1;
      senses.set(key, list);
    }
  }

  return {
    phrases,
    negators,
    negation,
    reversals,
    guards,
    contrastCategories,
    contrastWords,
    senses,
  };
}

let cachedBundled: WordFxRules | null = null;

export function loadBundledRules(): WordFxRules {
  cachedBundled ??= parseRules(rawRules);
  return cachedBundled;
}
