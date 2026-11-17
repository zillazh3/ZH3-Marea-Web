import { LyricsError } from './errors';
import { newLine, newLyrics, type BgVocal, type Line, type Lyrics, type Syllable } from './model';
import { parseTime, spread } from './timing';

const TT = 'http://www.w3.org/ns/ttml';
const TTM = 'http://www.w3.org/ns/ttml#metadata';
const MAREA = 'https://zh3.marea/ns/ttml';

/** A lyrics file is a few hundred KB at most; this stops a pathological file before it reaches the parser. */
export const MAX_TTML_CHARS = 5_000_000;

// ---- DOM helpers with ElementTree semantics (text, tail, itertext) ----

function childElements(el: Element): Element[] {
  return Array.from(el.children);
}

function isText(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE;
}

/** Text between `el` and its next sibling element (ElementTree's `tail`), comments skipped. */
function tail(el: Element): string {
  let out = '';
  for (let n = el.nextSibling; n && n.nodeType !== Node.ELEMENT_NODE; n = n.nextSibling) {
    if (isText(n)) out += n.textContent ?? '';
  }
  return out;
}

/** Text before the first child element (ElementTree's `text`). */
function leadingText(el: Element): string {
  let out = '';
  for (let n = el.firstChild; n && n.nodeType !== Node.ELEMENT_NODE; n = n.nextSibling) {
    if (isText(n)) out += n.textContent ?? '';
  }
  return out;
}

function ttmRole(el: Element): string {
  return el.getAttributeNS(TTM, 'role') ?? '';
}

/** Attribute value, treating a missing and an empty attribute alike (Python's `get(...) or default`). */
function orElse(value: string | null, fallback: string): string {
  return value === null || value === '' ? fallback : value;
}

function isTt(el: Element, name: string): boolean {
  return el.namespaceURI === TT && el.localName === name;
}

/** Python's `" ".join(text.split())`. */
function collapse(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(' ');
}

/** `strip("() \n")`: removes any of those characters from both ends. */
function stripBackground(text: string): string {
  return text.replace(/^[() \n]+|[() \n]+$/g, '');
}

// ---- spans and words ----

/** Direct child `<span>` elements that carry `begin` and no `ttm:role`. */
function timedSpanChildren(container: Element): Element[] {
  return childElements(container).filter(
    (c) => isTt(c, 'span') && !ttmRole(c) && c.hasAttribute('begin'),
  );
}

function spanEndMs(
  spans: Element[],
  idx: number,
  beginMs: number,
  fallbackEnd: number | null,
): number {
  const span = spans[idx];
  const rawEnd = span?.getAttribute('end');
  if (rawEnd !== null && rawEnd !== undefined) return parseTime(rawEnd);
  const next = spans[idx + 1];
  if (next) return Math.max(beginMs, parseTime(next.getAttribute('begin') ?? ''));
  return Math.max(beginMs, fallbackEnd ?? beginMs);
}

interface TimedWord {
  text: string;
  begin: number;
  end: number;
}

/** Groups timed child spans into words using TTML whitespace rules: leading, trailing or tail whitespace delimits words. */
function wordGroups(container: Element, bg: boolean, fallbackEnd: number | null): TimedWord[][] {
  const spans = timedSpanChildren(container);
  let groups: TimedWord[][] = [[]];
  spans.forEach((span, j) => {
    const raw = span.textContent;
    const current = (): TimedWord[] => groups[groups.length - 1] ?? [];
    if (/^\s/.test(raw) && current().length > 0) groups.push([]);
    const begin = parseTime(span.getAttribute('begin') ?? '');
    const end = spanEndMs(spans, j, begin, fallbackEnd);
    const text = raw.trim();
    if (text) current().push({ text, begin, end });
    if (/\s$/.test(raw) || /^\s+$/.test(tail(span))) groups.push([]);
  });
  groups = groups.filter((g) => g.length > 0);
  if (bg && groups.length > 0) {
    // Apple wraps background vocals in "( ... )".
    const firstWord = groups[0]?.[0];
    if (firstWord) firstWord.text = firstWord.text.replace(/^\(+/, '');
    const lastGroup = groups[groups.length - 1];
    const lastWord = lastGroup?.[lastGroup.length - 1];
    if (lastWord) lastWord.text = lastWord.text.replace(/\)+$/, '');
    groups = groups.map((g) => g.filter((w) => w.text !== '')).filter((g) => g.length > 0);
  }
  return groups;
}

function timedSpans(parent: Element, bg = false, fallbackEnd: number | null = null): Syllable[] {
  const out: Syllable[] = [];
  for (const group of wordGroups(parent, bg, fallbackEnd)) {
    for (const w of group) out.push({ text: w.text, begin: w.begin, end: w.end, wordEnd: false });
    const last = out[out.length - 1];
    if (last) last.wordEnd = true;
  }
  const last = out[out.length - 1];
  if (last) last.wordEnd = false;
  return out;
}

/** Text of a `<p>` without timed spans, ignoring background vocals and translations. */
function plainText(p: Element): string {
  let out = leadingText(p);
  for (const child of childElements(p)) {
    if (!ttmRole(child)) out += child.textContent;
    out += tail(child);
  }
  return collapse(out);
}

function bgVocal(span: Element): BgVocal | null {
  let syllables = timedSpans(span, true);
  const begin = span.getAttribute('begin');
  const end = span.getAttribute('end');
  if (syllables.length === 0 && begin && end) {
    // A background voice timed only per line.
    const text = collapse(stripBackground(span.textContent));
    if (text) syllables = spread(text, parseTime(begin), parseTime(end));
  }
  const first = syllables[0];
  const last = syllables[syllables.length - 1];
  if (!first || !last) return null;
  return {
    start: begin ? parseTime(begin) : first.begin,
    end: end ? parseTime(end) : last.end,
    syllables,
    role: orElse(span.getAttributeNS(MAREA, 'role'), 'backing'),
    agent: span.getAttributeNS(TTM, 'agent') ?? '',
  };
}

/** `v1` and `v2` are kept; any other id (e.g. `person2`) is assigned by order of appearance. */
function foldAgent(raw: string | null, agents: Map<string, string>): string {
  if (raw === null) return 'v1';
  if (raw === 'v1' || raw === 'v2') return raw;
  const known = agents.get(raw);
  if (known !== undefined) return known;
  const assigned = agents.size === 0 ? 'v1' : 'v2';
  agents.set(raw, assigned);
  return assigned;
}

function parseP(p: Element, agents: Map<string, string>): Line | null {
  const rawBegin = p.getAttribute('begin');
  const rawEnd = p.getAttribute('end');
  let start = rawBegin ? parseTime(rawBegin) : null;
  let end = rawEnd ? parseTime(rawEnd) : null;
  let syllables = timedSpans(p, false, end);
  let approx = false;
  if (syllables.length === 0) {
    // TTML timed only per line.
    const text = plainText(p);
    if (text && start !== null && end !== null) {
      syllables = spread(text, start, end);
      approx = true;
    }
  }
  const bg: BgVocal[] = [];
  for (const child of childElements(p)) {
    if (isTt(child, 'span') && ttmRole(child) === 'x-bg') {
      const vocal = bgVocal(child);
      if (vocal) bg.push(vocal);
    }
  }
  const firstBg = bg[0];
  if (syllables.length === 0 && !firstBg) return null;

  const leadless = syllables.length === 0;
  const rawAgent = orElse(p.getAttributeNS(TTM, 'agent'), leadless && firstBg ? firstBg.agent : '');
  const role = orElse(p.getAttributeNS(MAREA, 'role'), leadless && firstBg ? firstBg.role : '');
  const first = syllables[0];
  const last = syllables[syllables.length - 1];
  if (first && last) {
    start = Math.min(start ?? first.begin, ...bg.map((b) => b.start));
    end = Math.max(end ?? last.end, ...bg.map((b) => b.end));
  } else {
    start = Math.min(...bg.map((b) => b.start), ...(start !== null ? [start] : []));
    end = Math.max(...bg.map((b) => b.end), ...(end !== null ? [end] : []));
  }
  return newLine({
    start,
    end,
    agent: foldAgent(rawAgent || null, agents),
    syllables,
    bg,
    approx,
    role,
    rawAgent,
  });
}

/** Rejects documents that declare entities: TTML never needs them, and they are how expansion bombs are built. */
const UNSAFE_DECLARATION = /<!(DOCTYPE|ENTITY)/i;

export function parseTtml(source: string): Lyrics {
  if (source.length > MAX_TTML_CHARS) throw new LyricsError('ttmlTooLarge');
  if (UNSAFE_DECLARATION.test(source)) throw new LyricsError('ttmlUnsafe');
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const failure = doc.querySelector('parsererror');
  if (failure) throw new LyricsError('ttmlInvalid', failure.textContent);
  const root = doc.documentElement;
  if (!isTt(root, 'tt')) throw new LyricsError('ttmlNotTtml');

  const agents = new Map<string, string>();
  const lines: Line[] = [];
  for (const p of Array.from(root.getElementsByTagNameNS(TT, 'p'))) {
    const line = parseP(p, agents);
    if (line) lines.push(line);
  }
  return newLyrics(lines.sort((a, b) => a.start - b.start));
}
