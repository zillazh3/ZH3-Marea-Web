import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Engine, type Measure } from '@/engine/engine';
import type { InterludePhase } from '@/engine/interlude';
import type { Lyrics } from '@/engine/lyrics';
import type { Params } from '@/engine/params';

export type Snapshot = Record<string, unknown>;

export interface GoldenEvent {
  frame: number;
  type: 'seek' | 'reconfigure';
  t?: number;
  blurm?: number;
}

export interface GoldenScenario {
  name: string;
  dt: number;
  now0: number;
  startMs: number;
  warmup: boolean;
  /** The recorded run marked every line as line-level lyrics (spread timing). */
  approx: boolean;
  total: number;
  params: Params;
  creditH: number;
  events: GoldenEvent[];
  paused: [number, number][];
  stageH: number;
  fontPx: number;
  frames: ({ frame: number } & Snapshot)[];
}

const FIXTURES = fileURLToPath(new URL('../fixtures/engine/', import.meta.url));

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(FIXTURES + name, 'utf8'));
}

export function loadScenario(name: string): GoldenScenario {
  return readFixture(`golden-${name}.json`) as GoldenScenario;
}

/** The demo song as recorded by the desktop, with the values its model computed for it. */
export interface DemoLyrics extends Lyrics {
  reference: { texts: string[]; interludes: [number, number][] };
}

export function loadDemoLyrics(): DemoLyrics {
  return readFixture('lyrics-demo.json') as DemoLyrics;
}

/** The same heights the desktop generator's stand-in renderer reports. */
export const measure: Measure = (line, active) => 60 + (active && line.bg.length > 0 ? 30 : 0);

// The fixtures keep the desktop's Spanish phase names.
const PHASE_NAMES: Record<InterludePhase, string> = {
  hidden: 'oculto',
  waiting: 'espera',
  exit: 'salida',
  hold: 'hold',
  breathe: 'respira',
};

/** The engine state in the shape tools/export-fixtures.py records. */
export function snapshot(engine: Engine): Snapshot {
  const near: Snapshot = {};
  for (const i of engine.animatedRange) {
    const item = engine.items[i];
    if (!item) continue;
    if (item.isGap) {
      near[String(i)] = {
        gap: true,
        op: item.groupOpacity,
        sc: item.groupScale,
        phase: PHASE_NAMES[item.phase],
        dots: item.dots.map((d) => ({
          op: d.op,
          y: d.y,
          s: d.scale,
          haloR: d.haloR,
          haloA: d.haloA,
        })),
      };
    } else if (item.isCredit) {
      near[String(i)] = { credit: true };
    } else {
      near[String(i)] = {
        words: item.words.map((w) => ({
          p: w.p,
          parts: w.parts.map((u) => ({
            p: u.p,
            x: u.x,
            y: u.y,
            s: u.scale,
            glowR: u.glowR,
            glowA: u.glowA,
            wdy: u.motion?.dy ?? null,
            wds: u.motion?.ds ?? null,
          })),
        })),
        motion: item.motion,
      };
    }
  }
  return {
    t: engine.t,
    now: engine.now,
    active: engine.active,
    live: [...engine.live].sort((a, b) => a - b),
    range: [...engine.animatedRange],
    settled: engine.isSettled(),
    items: engine.items.map((item) => ({
      y: item.y.p,
      s: item.s.p,
      blurT: item.blurTw.t,
      opT: item.opTw.t,
      blur: item.blur,
      opacity: item.opacity,
      act: item.act,
      bgP: item.bgP,
      bgOp: item.bgOp,
      on: item.on,
      h: item.h,
    })),
    near,
  };
}

/** Runs a scenario and calls `visit` with the recorded and the simulated state of every recorded frame. */
export function replay(
  scenario: GoldenScenario,
  lyrics: Lyrics,
  visit: (frame: number, expected: Snapshot, actual: Snapshot) => void,
): void {
  const source: Lyrics = scenario.approx
    ? { lines: lyrics.lines.map((line) => ({ ...line, approx: true })) }
    : lyrics;
  const engine = new Engine(source, measure, {
    stageH: scenario.stageH,
    fontPx: scenario.fontPx,
    params: scenario.params,
    now: scenario.now0,
    creditH: scenario.creditH,
  });
  if (scenario.warmup) engine.warmup(scenario.startMs);
  else engine.start(scenario.startMs);
  const events = new Map(scenario.events.map((e) => [e.frame, e]));
  const recorded = new Map(scenario.frames.map((f) => [f.frame, f]));
  for (let frame = 0; frame < scenario.total; frame += 1) {
    const event = events.get(frame);
    if (event?.type === 'seek' && event.t !== undefined) engine.seek(event.t);
    if (event?.type === 'reconfigure' && event.blurm !== undefined) {
      engine.params.blurm = event.blurm;
      engine.reconfigure();
    }
    const running = !scenario.paused.some(([from, to]) => frame >= from && frame < to);
    engine.advance(scenario.dt, running);
    const expected = recorded.get(frame);
    if (expected) visit(frame, expected, snapshot(engine));
  }
}

export interface Mismatch {
  path: string;
  expected: unknown;
  actual: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Walks two JSON trees; numbers must agree within `tolerance`, everything else exactly. */
export function compare(
  expected: unknown,
  actual: unknown,
  path: string,
  tolerance: number,
  mismatches: Mismatch[],
): void {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (!(Math.abs(expected - actual) <= tolerance)) mismatches.push({ path, expected, actual });
  } else if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      mismatches.push({ path: `${path}.length`, expected: expected.length, actual: actual.length });
      return;
    }
    expected.forEach((e: unknown, i) => {
      compare(e, actual[i], `${path}[${String(i)}]`, tolerance, mismatches);
    });
  } else if (isRecord(expected) && isRecord(actual)) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      compare(expected[key], actual[key], `${path}.${key}`, tolerance, mismatches);
    }
  } else if (expected !== actual) {
    mismatches.push({ path, expected, actual });
  }
}
