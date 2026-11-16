import { codePointLength, isAlnum, vibratoPhase } from '@/shared/pycompat';
import { EASE, EASE_OUT, L_SCALE, SCALE, bezier, clamp01, smoothstep, type Curve } from './curves';
import type { InterludePhase, Plan } from './interlude';
import type { Line, Syllable } from './lyrics';
import type { CharMotion, ProfileName } from './motion';
import { Spr, Spring } from './springs';
import { TUNING } from './tuning';

/** Held notes go from "normal" to "maximum emphasis" between these durations (s). */
const SUSTAIN_FROM = 0.45;
const SUSTAIN_FULL = 1.4;
/** Line-level lyrics: each word starts filling this share of its duration before the previous one ends. */
const APPROX_OVERLAP = 0.35;
/** Emphasis by letters: words of at least this many seconds and 2..7 letters. */
const EMPH_MIN_S = 1;
const EMPH_MAX_LETTERS = 7;

/** CSS-style transition: from the current value toward a target, with a fixed curve and duration. */
export class Tween {
  t: number;
  v0: number;
  t0 = 0;
  readonly dur: number;
  private readonly ease: Curve;

  constructor(v: number, durMs: number, ease: Curve) {
    this.t = v;
    this.v0 = v;
    this.dur = durMs;
    this.ease = ease;
  }

  to(target: number, now: number): void {
    if (target !== this.t) {
      this.v0 = this.value(now);
      this.t = target;
      this.t0 = now;
    }
  }

  snap(v: number): void {
    this.t = v;
    this.v0 = v;
  }

  value(now: number): number {
    const x = clamp01((now - this.t0) / this.dur);
    return this.v0 + (this.t - this.v0) * this.ease(x);
  }
}

/** A syllable or a letter with its three springs; the engine fills the output fields every frame. */
export class Part {
  readonly text: string;
  b: number;
  e: number;
  readonly phase: number;
  readonly S: Spr;
  readonly Y = new Spr(0.01, 1.45, 0.4);
  readonly G = new Spr(0, 1.18, 0.56);
  /** Wipe progress of the syllable, or of the letter in emphasised words. */
  p = 0;
  /** Letters: start and end of their syllable, their position in it, and how many letters it has. */
  sb: number;
  se: number;
  j = 0;
  k = 1;
  /** 0..1: how sustained the syllable is (normal syllables only). */
  sus = 0;
  /** Per-character layer (dy in em, ds in scale); null = at rest. */
  motion: CharMotion | null = null;
  scale = 1;
  /** em */
  y = 0;
  x = 0;
  /** Halo radius in px and alpha (0 = no halo). */
  glowR = 0;
  glowA = 0;

  constructor(text: string, b: number, e: number, letter = false, phase = 0) {
    this.text = text;
    this.b = b;
    this.e = e;
    this.sb = b;
    this.se = e;
    this.phase = phase;
    this.S = new Spr(letter ? L_SCALE(0) : SCALE(0), 0.88, 0.64);
  }
}

export class Word {
  readonly parts: readonly Part[];
  readonly bg: boolean;
  readonly b: number;
  readonly e: number;
  readonly emph: boolean;
  readonly last: boolean;
  /** Line-level lyrics: wider wipe edge. */
  readonly soft: boolean;
  /** Index of the word in its line (read by the wordfx hooks). */
  readonly wordIndex: number;
  readonly text: string;
  /** Wipe progress of the whole word (emphasised: mean of its letters). */
  p = 0;

  constructor(
    parts: readonly Part[],
    bg: boolean,
    b: number,
    e: number,
    emph: boolean,
    last: boolean,
    soft: boolean,
    wordIndex: number,
  ) {
    this.parts = parts;
    this.bg = bg;
    this.b = b;
    this.e = e;
    this.emph = emph;
    this.last = last;
    this.soft = soft;
    this.wordIndex = wordIndex;
    this.text = parts.map((p) => p.text).join('');
  }
}

export class Dot {
  readonly sp = new Spr(0.5, 1.6, 0.5);
  readonly yp = new Spr(0, 2.1, 0.32);
  prev = 0;
  op = 0;
  scale = 1;
  y = 0;
  /** em and alpha */
  haloR = 0;
  haloA = 0;
}

export type ItemKind = 'line' | 'gap' | 'credit';

/** A line of lyrics, an interlude, or the trailing credit. */
export class Item {
  readonly kind: ItemKind;
  readonly index: number;
  readonly line: Line | null;
  readonly start: number;
  readonly end: number;
  readonly y = new Spring(0);
  readonly s = new Spring(TUNING.inactiveScale);
  h = 0;
  on = false;
  duet = false;
  /** Interludes: speed factor of their animation (above 1 for intros shorter than the minimum plan). */
  speed = 1;
  /** Automatic per-character profile (lines only). */
  motion: ProfileName | '' = '';
  /** Line-level lyrics: continuous sweep instead of word-by-word animation. */
  approx = false;
  words: Word[] = [];
  dots: Dot[] = [];
  plan: Plan | null = null;
  phase: InterludePhase = 'hidden';
  groupOpacity = 0;
  groupScale = 1;
  readonly blurTw = new Tween(0, 400, EASE);
  readonly opTw = new Tween(1, 400, EASE);
  /** Crossfade of the glow. */
  readonly actTw = new Tween(0, 450, EASE_OUT);
  /** Entrance of the background voice. */
  readonly bgpTw = new Tween(0, 550, bezier(0.2, 0.9, 0.25, 1));
  readonly bgoTw = new Tween(0, 300, EASE);
  /** Values after their transitions. */
  blur = 0;
  opacity = 0;
  act = 0;
  bgP = 0;
  bgOp = 0;

  constructor(kind: ItemKind, index: number, line: Line | null, start: number, end: number) {
    this.kind = kind;
    this.index = index;
    this.line = line;
    this.start = start;
    this.end = end;
    this.s.k = TUNING.lineScaleK;
    this.s.c = TUNING.lineScaleC;
    // Scale hovers near 1.0: the default 0.01 threshold would settle a 0.5 % error at once, which is several px at the line edge.
    this.s.eps = 1e-4;
  }

  get isGap(): boolean {
    return this.kind === 'gap';
  }

  get isCredit(): boolean {
    return this.kind === 'credit';
  }
}

/** Groups syllables into words, with letter emphasis on long short words. `approx`: spread timing, so no letter emphasis. */
export function buildWords(
  syllables: readonly Syllable[],
  bg: boolean,
  lineIndex: number,
  approx: boolean,
): Word[] {
  const groups: Syllable[][] = [];
  let current: Syllable[] = [];
  for (const s of syllables) {
    current.push(s);
    if (s.wordEnd) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group, wi) => {
    const first = group[0];
    const lastSyl = group[group.length - 1];
    if (!first || !lastSyl) throw new RangeError('empty word group');
    const text = group.map((s) => s.text).join('');
    let wb = first.begin / 1000;
    let we = lastSyl.end / 1000;
    const isLast = wi === groups.length - 1;
    const letters = Array.from(text).filter(isAlnum).length;

    if (!approx && we - wb >= EMPH_MIN_S && letters > 1 && letters <= EMPH_MAX_LETTERS) {
      const parts: Part[] = [];
      for (const s of group) {
        // Letters spread inside THEIR syllable, so the pause between syllables ("si... ento") has no active letters.
        const sb = s.begin / 1000;
        const se = s.end / 1000;
        const k = Math.max(1, codePointLength(s.text));
        Array.from(s.text).forEach((ch, j) => {
          const c = new Part(
            ch,
            sb + ((se - sb) * j) / k,
            sb + ((se - sb) * (j + 1)) / k,
            true,
            vibratoPhase(lineIndex, wi + (bg ? 97 : 0), parts.length),
          );
          c.sb = sb;
          c.se = se;
          c.j = j;
          c.k = k;
          parts.push(c);
        });
      }
      return new Word(parts, bg, wb, we, true, isLast, false, wi);
    }

    const parts = group.map((s) => new Part(s.text, s.begin / 1000, s.end / 1000));
    for (const u of parts) {
      u.sus = smoothstep((u.e - u.b - SUSTAIN_FROM) / (SUSTAIN_FULL - SUSTAIN_FROM));
    }
    if (approx) {
      // Each word overlaps its neighbours so the fill reads as one sweep along the line.
      const overlap = APPROX_OVERLAP * (we - wb);
      const firstPart = parts[0];
      const lastPart = parts[parts.length - 1];
      if (wi > 0 && firstPart) {
        wb -= overlap;
        firstPart.b -= overlap;
      }
      if (!isLast && lastPart) {
        we += overlap;
        lastPart.e += overlap;
      }
    }
    return new Word(parts, bg, wb, we, false, isLast, approx, wi);
  });
}
