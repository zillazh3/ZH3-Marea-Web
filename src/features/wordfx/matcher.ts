import type { Line, Lyrics, Syllable } from '@/engine/lyrics';
import { FX } from '@/engine/wordfx/config';
import { guessLang, lemmaCandidates, lineLang, normalizeWord } from './lexicon';
import type { FxLang, WordFxLibrary } from './library';
import {
  WILDCARD,
  type GuardCond,
  type PhraseRule,
  type SenseCond,
  type SenseRule,
  type WordFxRules,
} from './rules';

export const NEGATION_WINDOW = 2;
export const HOLD_CAP_S = 3.0;

const NEG_CLITICS: Readonly<Record<FxLang, ReadonlySet<string>>> = {
  es: new Set(['me', 'te', 'se', 'nos', 'os', 'lo', 'la', 'los', 'las', 'le', 'les', 'siquiera']),
  en: new Set(['me', 'you', 'him', 'her', 'us', 'them', 'even', 'ever', 'to']),
};
const NEG_BRIDGES: Readonly<Record<FxLang, ReadonlySet<string>>> = {
  es: new Set([
    'me',
    'te',
    'se',
    'nos',
    'os',
    'lo',
    'la',
    'los',
    'las',
    'le',
    'les',
    'a',
    'de',
    'en',
    'dejes',
    'dejas',
    'deja',
    'dejen',
    'hagas',
    'hace',
    'hacen',
    'puedo',
    'puedes',
    'puede',
    'podemos',
    'pueden',
    'pude',
    'podia',
    'quiero',
    'quieres',
    'quiere',
    'queremos',
    'quieren',
    'quise',
    'vuelvo',
    'vuelves',
    'vuelve',
    'vuelven',
    'vas',
    'va',
    'van',
    'voy',
    'vayas',
    'vaya',
    'siento',
    'sientes',
    'siente',
    'sentimos',
    'sienten',
    'veo',
    'ves',
    've',
    'vi',
    'tengo',
    'tienes',
    'tiene',
    'estoy',
    'estas',
    'esta',
    'soy',
    'eres',
    'es',
    'pido',
    'pide',
  ]),
  en: new Set([
    'to',
    'be',
    'feel',
    'seem',
    'want',
    'need',
    'try',
    'get',
    'go',
    'stay',
    'even',
    'ever',
    'me',
    'you',
    'him',
    'her',
    'us',
    'them',
  ]),
};
const LOWERCASE_GUARDED_MONTHS = new Set(['may', 'march']);
const EN_MONTH_CUES = new Set([
  'in',
  'on',
  'of',
  'since',
  'from',
  'until',
  'till',
  'by',
  'before',
  'after',
  'through',
  'during',
  'every',
  'each',
  'next',
  'last',
  'this',
  'mid',
  'early',
  'late',
  'between',
  'into',
  'month',
  'day',
  'night',
  'morning',
  'evening',
  'rain',
  'wind',
  'breeze',
  'sun',
  'sky',
  'flower',
  'bloom',
  'moon',
  'light',
  'air',
  'sweet',
  'warm',
  'cold',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]);

export interface WordMatch {
  readonly line: number;
  readonly word: number;
  readonly text: string;
  readonly lemma: string;
  readonly lang: FxLang;
  readonly categories: readonly string[];
  readonly beginMs: number;
  readonly endMs: number;
  readonly score: number;
  readonly pair: number;
  readonly note: string;
  readonly ambiguity: number;
}

export function wordGroups(syllables: readonly Syllable[]): Syllable[][] {
  const groups: Syllable[][] = [];
  let cur: Syllable[] = [];
  for (const s of syllables) {
    cur.push(s);
    if (s.wordEnd) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) groups.push(cur);
  return groups;
}

interface Tok {
  readonly word: number;
  readonly text: string;
  readonly norm: string;
  readonly lang: FxLang;
  readonly begin: number;
  readonly end: number;
  readonly candsCache: Partial<Record<FxLang, readonly string[]>>;
}

function tokCands(tok: Tok, lang: FxLang = tok.lang): readonly string[] {
  let res = tok.candsCache[lang];
  if (!res) {
    res = lemmaCandidates(tok.text, lang);
    tok.candsCache[lang] = res;
  }
  return res;
}

interface Hit {
  readonly match: WordMatch;
  readonly cands: ReadonlySet<string>;
}

function isPyLower(s: string): boolean {
  return s === s.toLowerCase() && s !== s.toUpperCase();
}

function tokenizeLine(line: Line, lib: WordFxLibrary): Tok[] {
  const groups = wordGroups(line.syllables);
  const texts = groups.map((g) => g.map((s) => s.text).join(''));
  const fallback = lineLang(texts, lib.known);
  const toks: Tok[] = [];
  for (let wi = 0; wi < groups.length; wi += 1) {
    const g = groups[wi];
    const t = texts[wi] ?? '';
    const norm = normalizeWord(t);
    if (!norm || !g || g.length === 0) continue;
    const head = g[0];
    const tail = g[g.length - 1];
    if (!head || !tail) continue;
    const guessed = guessLang(t, lib.known, fallback) === 'en' ? 'en' : 'es';
    toks.push({
      word: wi,
      text: t,
      norm,
      lang: guessed,
      begin: head.begin,
      end: tail.end,
      candsCache: {},
    });
  }
  return toks;
}

function scoreCats(lib: WordFxLibrary, cats: readonly string[], holdMs: number): number {
  let maxPrio = 0;
  for (const c of cats) {
    const p = lib.categories[c]?.priority ?? 0;
    if (p > maxPrio) maxPrio = p;
  }
  return maxPrio * (1 + Math.min(holdMs / 1000, HOLD_CAP_S));
}

function orderCats(lib: WordFxLibrary, cats: readonly string[]): readonly string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const c of cats) {
    if (c in lib.categories && !seen.has(c)) {
      seen.add(c);
      unique.push(c);
    }
  }
  unique.sort((a, b) => (lib.categories[b]?.priority ?? 0) - (lib.categories[a]?.priority ?? 0));
  return unique;
}

export interface PhraseTable {
  readonly table: readonly PhraseRule[];
  readonly buckets: ReadonlyMap<string, readonly { idx: number; rule: PhraseRule }[]>;
}

export function buildPhraseTable(lib: WordFxLibrary, rules: WordFxRules): PhraseTable {
  const out: PhraseRule[] = [];
  for (const p of rules.phrases) {
    const cats = orderCats(lib, p.categories);
    if (cats.length > 0) out.push({ ...p, categories: cats });
  }
  for (const lang of ['es', 'en'] as const) {
    const idx = lib.index[lang];
    for (const [lemma, cats] of Object.entries(idx)) {
      if (lemma.includes(' ')) {
        out.push({
          tokens: lemma.split(' '),
          lang,
          categories: [...cats],
          label: lemma,
          at: -1,
        });
      }
    }
  }
  out.sort((a, b) => b.tokens.length - a.tokens.length);

  const buckets = new Map<string, { idx: number; rule: PhraseRule }[]>();
  for (let idx = 0; idx < out.length; idx += 1) {
    const rule = out[idx];
    if (!rule) continue;
    const head = rule.tokens[0] ?? '';
    const list = buckets.get(head) ?? [];
    list.push({ idx, rule });
    buckets.set(head, list);
  }
  return { table: out, buckets };
}

function fitsPhrase(toks: readonly Tok[], i: number, ph: PhraseRule): boolean {
  if (i + ph.tokens.length > toks.length) return false;
  for (let n = 0; n < ph.tokens.length; n += 1) {
    const pat = ph.tokens[n];
    const tok = toks[i + n];
    if (!tok) return false;
    if (pat !== WILDCARD && (!pat || !tokCands(tok, ph.lang).includes(pat))) return false;
  }
  return true;
}

function pickPhrase(toks: readonly Tok[], i: number, pt: PhraseTable): PhraseRule | null {
  const tok = toks[i];
  if (!tok) return null;
  const seen = new Set<number>();
  const cands: { idx: number; rule: PhraseRule }[] = [];
  const keys = [...tokCands(tok, 'es'), ...tokCands(tok, 'en'), WILDCARD];
  for (const key of keys) {
    const bucket = pt.buckets.get(key);
    if (!bucket) continue;
    for (const item of bucket) {
      if (!seen.has(item.idx)) {
        seen.add(item.idx);
        cands.push(item);
      }
    }
  }
  if (cands.length === 0) return null;
  if (cands.length > 1) cands.sort((a, b) => a.idx - b.idx);
  for (const item of cands) {
    if (fitsPhrase(toks, i, item.rule)) return item.rule;
  }
  return null;
}

function hasAny(tok: Tok, names: ReadonlySet<string>, lang: FxLang): boolean {
  return tokCands(tok, lang).some((c) => names.has(c));
}

function holdsGuardCond(c: GuardCond, toks: readonly Tok[], k: number, lang: FxLang): boolean {
  const n = toks.length;
  const prevTok = k > 0 ? toks[k - 1] : undefined;
  const nextTok = k + 1 < n ? toks[k + 1] : undefined;
  return (
    (c.prev.size > 0 && prevTok !== undefined && hasAny(prevTok, c.prev, lang)) ||
    (c.next.size > 0 && nextTok !== undefined && hasAny(nextTok, c.next, lang)) ||
    (c.lineEnd && k === n - 1) ||
    (c.lineStart && k === 0)
  );
}

function isGuarded(rules: WordFxRules, toks: readonly Tok[], k: number): boolean {
  const tok = toks[k];
  if (!tok) return false;
  for (const c of tokCands(tok)) {
    const list = rules.guards.get(`${tok.lang}:${c}`);
    if (!list) continue;
    for (const g of list) {
      if (
        (g.dropIf && holdsGuardCond(g.dropIf, toks, k, tok.lang)) ||
        (g.keepIf && !holdsGuardCond(g.keepIf, toks, k, tok.lang))
      ) {
        return true;
      }
    }
  }
  return false;
}

function monthAllowed(
  lib: WordFxLibrary,
  toks: readonly Tok[],
  k: number,
  cand: string,
  cat: string,
): boolean {
  if (lib.categories[cat]?.kind !== 'month') return true;
  const tok = toks[k];
  if (tok?.norm !== cand) return false;
  if (tok.lang === 'en' && LOWERCASE_GUARDED_MONTHS.has(tok.norm) && isPyLower(tok.text)) {
    const prevTok = k > 0 ? toks[k - 1] : undefined;
    const nextTok = k + 1 < toks.length ? toks[k + 1] : undefined;
    const hasPrev = Boolean(prevTok && hasAny(prevTok, EN_MONTH_CUES, 'en'));
    const hasNext = Boolean(nextTok && hasAny(nextTok, EN_MONTH_CUES, 'en'));
    return hasPrev || hasNext;
  }
  return true;
}

function findReversal(
  lib: WordFxLibrary,
  rules: WordFxRules,
  toks: readonly Tok[],
  consumed: ReadonlySet<number>,
  k: number,
  cats: readonly string[],
): { cats: readonly string[]; span: number[]; label: string } | null {
  const lang = toks[k]?.lang;
  if (!lang) return null;
  for (const rv of rules.reversals) {
    const n = rv.trigger.length;
    const lo = rv.side === 'before' ? k - n : k + 1;
    if (rv.lang !== lang || lo < 0 || lo + n > toks.length) continue;
    let ok = true;
    const span: number[] = [];
    for (let idx = 0; idx < n; idx += 1) {
      const j = lo + idx;
      const trig = rv.trigger[idx] ?? '';
      const tj = toks[j];
      if (consumed.has(j) || !tj || !tokCands(tj, lang).includes(trig)) {
        ok = false;
        break;
      }
      span.push(j);
    }
    if (!ok) continue;
    const mapped: string[] = [];
    for (const c of cats) {
      const rep = rv.map.get(c);
      if (rep) mapped.push(...rep);
    }
    const nextCats = orderCats(lib, mapped);
    if (nextCats.length > 0) {
      return { cats: nextCats, span, label: rv.trigger.join(' ') };
    }
  }
  return null;
}

function findNegator(
  rules: WordFxRules,
  toks: readonly Tok[],
  consumed: ReadonlySet<number>,
  k: number,
): string | null {
  const tok = toks[k];
  if (!tok) return null;
  const negs = rules.negators[tok.lang];
  if (negs.size === 0) return null;
  for (let j = k - 1; j > Math.max(k - 1 - NEGATION_WINDOW, -1); j -= 1) {
    const tj = toks[j];
    if (!consumed.has(j) && tj && negs.has(tj.norm)) return tj.norm;
  }
  const j = k - 3;
  const tj = toks[j];
  const t2 = toks[k - 2];
  const t1 = toks[k - 1];
  if (
    j >= 0 &&
    !consumed.has(j) &&
    !consumed.has(k - 2) &&
    !consumed.has(k - 1) &&
    tj &&
    negs.has(tj.norm) &&
    t2 &&
    t1 &&
    NEG_CLITICS[tok.lang].has(t2.norm) &&
    NEG_BRIDGES[tok.lang].has(t1.norm)
  ) {
    return tj.norm;
  }
  return null;
}

function senseHolds(
  sc: SenseCond,
  toks: readonly Tok[],
  lineCats: ReadonlyMap<number, readonly string[]>,
  k: number,
  lang: FxLang,
  negDeleted: ReadonlySet<number>,
): boolean {
  const n = toks.length;
  const prevTok = k > 0 ? toks[k - 1] : undefined;
  const nextTok = k + 1 < n ? toks[k + 1] : undefined;
  if (sc.prev.size > 0 && !(prevTok && hasAny(prevTok, sc.prev, lang))) return false;
  if (sc.next.size > 0 && !(nextTok && hasAny(nextTok, sc.next, lang))) return false;
  if (sc.lineEnd && k !== n - 1) return false;
  if (sc.lineStart && k !== 0) return false;
  if (sc.near.size > 0) {
    let foundNear = false;
    for (let m = 0; m < n; m += 1) {
      const tm = toks[m];
      if (m !== k && !negDeleted.has(m) && tm && hasAny(tm, sc.near, lang)) {
        foundNear = true;
        break;
      }
    }
    if (!foundNear) return false;
  }
  if (sc.coCats.size > 0) {
    let foundCo = false;
    for (const [m, cats] of lineCats) {
      if (m !== k && cats.some((c) => sc.coCats.has(c))) {
        foundCo = true;
        break;
      }
    }
    if (!foundCo) return false;
  }
  return true;
}

function sensesFor(rules: WordFxRules, tok: Tok, lemma: string): SenseRule[] {
  const out: SenseRule[] = [];
  const seen = new Set<number>();
  const keys = [lemma, ...tokCands(tok).filter((c) => c !== lemma)];
  for (const key of keys) {
    const list = rules.senses.get(`${tok.lang}:${key}`);
    if (!list) continue;
    for (const sr of list) {
      if (!seen.has(sr.id)) {
        seen.add(sr.id);
        out.push(sr);
      }
    }
  }
  return out;
}

function computeAmbiguity(cats: readonly string[], note: string, hasSenses: boolean): number {
  if (note.startsWith('phrase:') || note.startsWith('rev:') || note.startsWith('sense:')) {
    return hasSenses || cats.length >= 2 ? 0.15 : 0;
  }
  if (hasSenses) {
    return Math.round(Math.min(1, 0.45 + 0.2 * Math.max(cats.length - 1, 0)) * 100) / 100;
  }
  if (cats.length >= 2) {
    return Math.round(Math.min(1, 0.25 * (cats.length - 1)) * 100) / 100;
  }
  return 0;
}

function isContrastPair(rules: WordFxRules, a: Hit, b: Hit): boolean {
  for (const x of a.match.categories) {
    for (const y of b.match.categories) {
      if (
        rules.contrastCategories.some(
          ([ca, cb]) => (ca === x && cb === y) || (ca === y && cb === x),
        )
      ) {
        return true;
      }
    }
  }
  return rules.contrastWords.some(
    ([wa, wb]) => (a.cands.has(wa) && b.cands.has(wb)) || (a.cands.has(wb) && b.cands.has(wa)),
  );
}

function appendNote(m: WordMatch, extra: string): string {
  return m.note ? `${m.note}; ${extra}` : extra;
}

function applyNegation(
  lib: WordFxLibrary,
  rules: WordFxRules,
  singles: Map<number, { lemma: string; cats: readonly string[]; note: string }>,
  lineCats: Map<number, readonly string[]>,
  negDeleted: Set<number>,
  k: number,
  lemma: string,
  cats: readonly string[],
  neg: string,
): void {
  const mapped: string[] = [];
  for (const c of cats) {
    const rep = rules.negation.get(c);
    if (rep) mapped.push(...rep);
    else mapped.push(c);
  }
  const nextCats = orderCats(lib, mapped);
  if (nextCats.length > 0) {
    singles.set(k, { lemma, cats: nextCats, note: `neg:${neg}` });
    lineCats.set(k, nextCats);
  } else {
    singles.delete(k);
    lineCats.delete(k);
  }
  negDeleted.add(k);
}

export function matchLine(
  line: Line,
  lineIdx: number,
  lib: WordFxLibrary,
  rules: WordFxRules,
  maxFx = FX.maxFxPerLine,
  phraseTable?: PhraseTable,
): WordMatch[] {
  const pt = phraseTable ?? buildPhraseTable(lib, rules);
  const toks = tokenizeLine(line, lib);
  const hits: Hit[] = [];
  const consumed = new Set<number>();
  const lineCats = new Map<number, readonly string[]>();

  let i = 0;
  while (i < toks.length) {
    const ph = pickPhrase(toks, i, pt);
    if (!ph) {
      i += 1;
      continue;
    }
    const j = i + ph.tokens.length;
    const first = toks[i];
    const last = toks[j - 1];
    if (!first || !last) break;
    const key = ph.at >= 0 ? (toks[i + ph.at] ?? last) : last;
    const b0 = ph.at >= 0 ? key.begin : first.begin;
    const b1 = ph.at >= 0 ? key.end : last.end;
    const note = `phrase:${ph.label}`;
    const m: WordMatch = {
      line: lineIdx,
      word: key.word,
      text: toks
        .slice(i, j)
        .map((t) => t.text)
        .join(' '),
      lemma: ph.label,
      lang: ph.lang,
      categories: ph.categories,
      beginMs: b0,
      endMs: b1,
      score: scoreCats(lib, ph.categories, b1 - b0),
      pair: -1,
      note,
      ambiguity: ph.categories.length >= 2 ? 0.15 : 0,
    };
    hits.push({ match: m, cands: new Set([...tokCands(key, ph.lang), ph.label]) });
    for (let cIdx = i; cIdx < j; cIdx += 1) lineCats.set(cIdx, ph.categories);
    for (let cIdx = i; cIdx < j; cIdx += 1) consumed.add(cIdx);
    i = j;
  }

  const singles = new Map<number, { lemma: string; cats: readonly string[]; note: string }>();
  for (let k = 0; k < toks.length; k += 1) {
    const tok = toks[k];
    if (!tok || consumed.has(k) || isGuarded(rules, toks, k)) continue;
    const langIdx = lib.index[tok.lang];
    for (const c of tokCands(tok)) {
      const rawCats = langIdx[c];
      if (!rawCats) continue;
      const filtered = rawCats.filter((cat) => monthAllowed(lib, toks, k, c, cat));
      if (filtered.length > 0) {
        singles.set(k, { lemma: c, cats: filtered, note: '' });
        lineCats.set(k, filtered);
        break;
      }
    }
  }

  const negDeleted = new Set<number>();
  for (const k of [...singles.keys()].sort((a, b) => a - b)) {
    const cur = singles.get(k);
    if (!cur) continue;
    const rev = findReversal(lib, rules, toks, consumed, k, cur.cats);
    if (rev) {
      singles.set(k, { lemma: cur.lemma, cats: rev.cats, note: `rev:${rev.label}` });
      lineCats.set(k, rev.cats);
      for (const j of rev.span) {
        singles.delete(j);
        lineCats.delete(j);
        negDeleted.add(j);
      }
    }
  }

  const negHits = new Map<number, string>();
  for (const k of [...singles.keys()].sort((a, b) => a - b)) {
    const cur = singles.get(k);
    const tok = toks[k];
    if (!cur || !tok || cur.note.startsWith('rev:')) continue;
    const neg = findNegator(rules, toks, consumed, k);
    if (neg && cur.cats.some((c) => rules.negation.has(c))) {
      negHits.set(k, neg);
      if (!(rules.senses.size > 0 && sensesFor(rules, tok, cur.lemma).length > 0)) {
        applyNegation(lib, rules, singles, lineCats, negDeleted, k, cur.lemma, cur.cats, neg);
      }
    }
  }

  const senseFlags = new Map<number, boolean>();
  if (rules.senses.size > 0) {
    for (const k of [...singles.keys()].sort((a, b) => a - b)) {
      const cur = singles.get(k);
      if (!cur || cur.note.startsWith('rev:') || cur.note.startsWith('neg:')) continue;
      const tok = toks[k];
      if (!tok) continue;
      const srules = sensesFor(rules, tok, cur.lemma);
      senseFlags.set(k, srules.length > 0);
      for (const sr of srules) {
        if (senseHolds(sr.cond, toks, lineCats, k, tok.lang, negDeleted)) {
          const ordered = orderCats(lib, sr.categories);
          if (ordered.length > 0) {
            const lbl = sr.label || ordered.join(',');
            singles.set(k, { lemma: cur.lemma, cats: ordered, note: `sense:${lbl}` });
            lineCats.set(k, ordered);
            break;
          }
        }
      }
    }
  }

  for (const [k, neg] of negHits) {
    const cur = singles.get(k);
    if (!cur || cur.note.startsWith('neg:') || !cur.cats.some((c) => rules.negation.has(c))) {
      continue;
    }
    applyNegation(lib, rules, singles, lineCats, negDeleted, k, cur.lemma, cur.cats, neg);
  }

  for (const [k, cur] of singles) {
    const tok = toks[k];
    if (!tok) continue;
    const hasS =
      senseFlags.get(k) ?? (rules.senses.size > 0 && sensesFor(rules, tok, cur.lemma).length > 0);
    hits.push({
      match: {
        line: lineIdx,
        word: tok.word,
        text: tok.text,
        lemma: cur.lemma,
        lang: tok.lang,
        categories: cur.cats,
        beginMs: tok.begin,
        endMs: tok.end,
        score: scoreCats(lib, cur.cats, tok.end - tok.begin),
        pair: -1,
        note: cur.note,
        ambiguity: computeAmbiguity(cur.cats, cur.note, hasS),
      },
      cands: new Set([...tokCands(tok), cur.lemma]),
    });
  }
  hits.sort((a, b) => a.match.word - b.match.word);

  const pairs: { score: number; x: number; y: number }[] = [];
  for (let x = 0; x < hits.length; x += 1) {
    const hx = hits[x];
    if (!hx) continue;
    for (let y = x + 1; y < hits.length; y += 1) {
      const hy = hits[y];
      if (!hy) continue;
      if (isContrastPair(rules, hx, hy)) {
        pairs.push({ score: hx.match.score + hy.match.score, x, y });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.x - b.x || a.y - b.y);

  const chosen: WordMatch[] = [];
  const taken = new Set<number>();
  for (const p of pairs) {
    if (chosen.length + 2 > maxFx) break;
    if (taken.has(p.x) || taken.has(p.y)) continue;
    taken.add(p.x);
    taken.add(p.y);
    const ma = hits[p.x]?.match;
    const mb = hits[p.y]?.match;
    if (!ma || !mb) continue;
    chosen.push(
      { ...ma, pair: mb.word, note: appendNote(ma, `pair:${mb.lemma}`) },
      { ...mb, pair: ma.word, note: appendNote(mb, `pair:${ma.lemma}`) },
    );
  }

  const rest = hits
    .filter((_, idx) => !taken.has(idx))
    .map((h) => h.match)
    .sort((a, b) => b.score - a.score || a.word - b.word);

  const combined = [...chosen, ...rest.slice(0, Math.max(maxFx - chosen.length, 0))];
  combined.sort((a, b) => a.word - b.word);
  return combined;
}

export function matchLyrics(
  lyrics: Lyrics,
  lib: WordFxLibrary,
  rules: WordFxRules,
  maxFx = FX.maxFxPerLine,
): Map<string, WordMatch> {
  const pt = buildPhraseTable(lib, rules);
  const out = new Map<string, WordMatch>();
  for (let li = 0; li < lyrics.lines.length; li += 1) {
    const line = lyrics.lines[li];
    if (!line) continue;
    for (const m of matchLine(line, li, lib, rules, maxFx, pt)) {
      out.set(`${String(m.line)}:${String(m.word)}`, m);
    }
  }
  return out;
}
