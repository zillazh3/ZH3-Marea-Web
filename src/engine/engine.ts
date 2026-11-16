import { pyRound } from '@/shared/pycompat';
import { renderGap, renderLine } from './animate';
import { buildGap, buildLine } from './build';
import { Item, type Tween } from './items';
import { blurLevel, posYPolicy } from './layout';
import { interludesOf, type Line, type Lyrics } from './lyrics';
import { defaultParams, type Params } from './params';
import { TUNING } from './tuning';

// Pure animation state (no drawing): port of `relayout` / `renderLine` / `frame` of the prototype. Internal time `t` is in
// seconds, `now` in ms (for the stagger delays). It advances in fixed steps with `advance(dt)`, so two identical runs produce
// identical states. The renderer reads `engine.items`. Lengths are design px (a 42 px letter) or em, depending on the field.

/** A line counts as active this long before it starts (see tuning). */
const LOOKAHEAD = TUNING.anticipationS;
/** Fixed seconds of simulation before a seek target, so springs settle before the first frame. */
const WARMUP_PREROLL_MS = 3000;
/** Height of a gap's dots relative to the font. */
const GAP_HEIGHT_EM = 1.1;

type Reason = 'init' | 'seek' | 'config' | 'tick';

/** Height in px of a line, given whether it is active (an active line with a background voice grows). */
export type Measure = (line: Line, active: boolean) => number;

export interface EngineOptions {
  stageH: number;
  fontPx?: number;
  params?: Partial<Params>;
  now?: number;
  /** Above 0, appends the lyrics credit as one more item of this height; it scrolls with the lines and is never active. */
  creditH?: number;
}

export class Engine {
  readonly params: Params;
  readonly items: Item[] = [];
  t = 0;
  now: number;
  active = -1;
  /** Indices painted as active: the active line plus earlier lines whose end (background voice included) has not passed. */
  live: ReadonlySet<number> = new Set();
  private seekFlag = true;
  private configFlag = false;
  private activeRange: readonly number[] = [];
  private readonly measure: Measure;
  private readonly stageH: number;
  private readonly fontPx: number;
  private readonly creditH: number;

  constructor(lyrics: Lyrics, measure: Measure, options: EngineOptions) {
    this.params = { ...defaultParams(), ...options.params };
    this.measure = measure;
    this.stageH = options.stageH;
    this.fontPx = options.fontPx ?? 42;
    this.creditH = options.creditH ?? 0;
    this.now = options.now ?? 0;

    const entries: { start: number; order: number; build: (idx: number) => Item }[] = [
      ...lyrics.lines.map((src) => ({
        start: src.start,
        order: 1,
        build: (idx: number) => buildLine(idx, src),
      })),
      ...interludesOf(lyrics).map((src) => ({
        start: src.start,
        order: 0,
        build: (idx: number) => buildGap(idx, src),
      })),
    ].sort((a, b) => a.start - b.start || a.order - b.order);
    entries.forEach((entry, idx) => {
      this.items.push(entry.build(idx));
    });
    const last = this.items[this.items.length - 1];
    if (this.creditH > 0 && last) {
      this.items.push(new Item('credit', this.items.length, null, last.end, last.end));
    }
    this.items.forEach((item, i) => {
      // The dots go to the right when a duet follows.
      const next = this.items[i + 1];
      if (item.isGap && next) item.duet = next.duet;
    });
  }

  /** Indices of the items that are animated this frame (read by tests and by the renderer's culling). */
  get animatedRange(): readonly number[] {
    return this.activeRange;
  }

  // ---- time control ----

  start(tMs: number): void {
    this.t = tMs / 1000;
    this.active = -1;
    this.seekFlag = true;
  }

  seek(tMs: number): void {
    this.t = tMs / 1000;
    this.seekFlag = true;
  }

  /** The parameters (blur, scale...) changed: recompute the layout on the next frame. */
  reconfigure(): void {
    this.configFlag = true;
  }

  /** One fixed step. With `running = false` (paused) song time stops but the springs keep going. */
  advance(dt: number, running = true): void {
    if (running) this.t += dt;
    this.now += dt * 1000;
    this.frame(dt);
  }

  /** True when pending config or seek flags are cleared and every spring and tween has converged. */
  isSettled(): boolean {
    if (this.seekFlag || this.configFlag) return false;
    const now = this.now;
    return this.items.every(
      (item) =>
        item.y.isResting &&
        item.s.isResting &&
        [item.blurTw, item.opTw, item.actTw, item.bgpTw, item.bgoTw].every(
          (tw) => tw.v0 === tw.t || now >= tw.t0 + tw.dur,
        ) &&
        item.dots.every((dot) => dot.sp.isSettled && dot.yp.isSettled) &&
        item.words.every((w) =>
          w.parts.every((u) => u.S.isSettled && u.Y.isSettled && u.G.isSettled),
        ),
    );
  }

  /** Simulates from `prerollMs` before `tMs` so springs settle cleanly before frame 0. */
  warmup(tMs: number, dt = 1 / 60, prerollMs = WARMUP_PREROLL_MS): void {
    const fromMs = Math.max(0, tMs - prerollMs);
    this.start(fromMs);
    const steps = pyRound((tMs - fromMs) / 1000 / dt);
    if (steps === 0) {
      this.advance(0, false);
    } else {
      for (let i = 0; i < steps; i += 1) this.advance(dt);
    }
    this.t = tMs / 1000; // keep integer frame alignment on the first frame
  }

  // ---- layout ----

  private findActive(): number {
    let a = 0;
    this.items.forEach((item, i) => {
      if (item.start <= this.t + LOOKAHEAD && !item.isCredit) a = i;
    });
    return a;
  }

  /** The scroll follows `a`, but an earlier line whose background voice is still singing stays alive (Line.end includes it). */
  private findLive(a: number): ReadonlySet<number> {
    const target = this.items[a];
    const live = new Set([a]);
    for (let i = 0; i < a; i += 1) {
      const item = this.items[i];
      if (item?.kind === 'line' && target && this.t < item.end && item.end > target.start)
        live.add(i);
    }
    return live;
  }

  private relayout(reason: Reason, now: number): void {
    const { params, items, active } = this;
    const target = items[active];
    if (!target) return;
    const seekLike = reason !== 'tick';
    for (const [i, item] of items.entries()) {
      item.on = this.live.has(i);
      item.h = item.isGap
        ? item.on
          ? GAP_HEIGHT_EM * this.fontPx
          : 0
        : item.isCredit
          ? this.creditH
          : item.line
            ? this.measure(item.line, item.on)
            : 0;
    }
    const tops: number[] = [];
    let cum = 0;
    for (const item of items) {
      tops.push(cum);
      cum += item.h;
    }
    const offset = this.stageH * params.align - target.h / 2 - (tops[active] ?? 0);

    const previous = items[active - 1];
    const interval =
      active > 0 && previous && !target.isGap ? (target.start - previous.start) * 1000 : null;
    const [k, c] = posYPolicy(reason === 'seek', target.isGap, interval);

    let delay = 0;
    let base = seekLike ? 0 : params.stagger;
    for (const [i, item] of items.entries()) {
      const y = offset + (tops[i] ?? 0);
      item.y.k = k;
      item.y.c = c;
      if (reason === 'init') item.y.snap(y);
      else item.y.to(y, delay, now);
      if (y + item.h >= 0) {
        delay += base;
        if (i >= active) base /= TUNING.staggerDecay;
      }
      const plain = item.isGap || item.isCredit; // no 0.97 scale, no blur, no inactive-line opacity
      const on = item.on;
      item.s.to(on || !params.scale || plain ? 1 : TUNING.inactiveScale, 0, now);
      if (reason === 'init') item.s.snap(item.s.t);
      const blur = plain || on ? 0 : blurLevel(i, active, params.blurm);
      const targets: [Tween, number][] = [
        [item.blurTw, blur > 0.01 ? blur : 0],
        [item.opTw, plain || !on ? 1 : TUNING.activeOpacity],
        [item.actTw, on ? 1 : 0],
        [item.bgpTw, on ? 1 : 0],
        [item.bgoTw, on ? 1 : 0],
      ];
      for (const [tween, value] of targets) {
        if (reason === 'init') tween.snap(value);
        else tween.to(value, now);
      }
    }
  }

  // ---- per frame ----

  private frame(dt: number): void {
    const a = this.findActive();
    const live = this.findLive(a);
    const liveChanged = live.size !== this.live.size || [...live].some((i) => !this.live.has(i));
    if (a !== this.active || liveChanged || this.seekFlag || this.configFlag) {
      const reason: Reason =
        this.active === -1 ? 'init' : this.seekFlag ? 'seek' : this.configFlag ? 'config' : 'tick';
      this.active = a;
      this.live = live;
      this.seekFlag = false;
      this.configFlag = false;
      const n = this.items.length;
      const lo = Math.max(0, a - 1);
      const hi = Math.min(n - 1, a + 1);
      const near = new Set(live);
      for (let i = lo; i <= hi; i += 1) near.add(i);
      if (reason === 'tick' || reason === 'config') {
        // A line leaving the range keeps animating until it settles: settling it at once made it jump.
        for (let i = 0; i < lo; i += 1) {
          const item = this.items[i];
          if (item?.kind === 'line' && this.t < item.end + TUNING.tailSettleS) near.add(i);
        }
      }
      this.activeRange = n > 0 ? [...near].sort((x, y) => x - y) : [];
      this.relayout(reason, this.now);
      this.items.forEach((item, i) => {
        this.renderItem(item, live.has(i), near.has(i) ? dt : 0);
      });
    } else {
      for (const i of this.activeRange) {
        const item = this.items[i];
        if (item) this.renderItem(item, live.has(i), dt);
      }
    }
    const now = this.now;
    for (const item of this.items) {
      if (!item.y.isResting) item.y.step(dt, now);
      if (!item.s.isResting) item.s.step(dt, now);
      item.blur = item.blurTw.value(now);
      item.opacity = item.opTw.value(now);
      item.act = item.actTw.value(now);
      item.bgP = item.bgpTw.value(now);
      item.bgOp = item.bgoTw.value(now);
    }
  }

  private renderItem(item: Item, on: boolean, dt: number): void {
    if (item.isGap) renderGap(item, this.t, on, dt);
    else if (!item.isCredit) renderLine(item, this.t, on, dt, this.params);
  }
}
