import { describe, expect, it } from 'vitest';
import {
  EASE_OUT,
  GLOW_PROTOTYPE,
  L_SCALE,
  L_YOFF,
  SCALE,
  WIPE,
  WIPE_INV,
  YOFF,
  bezier,
  clamp,
  glowCurve,
  smoothstepRange,
} from '@/engine/curves';
import {
  breathing,
  dotEnter,
  dotOp,
  interludeSnap,
  planInterlude,
  type InterludePhase,
} from '@/engine/interlude';
import { blurLevel, posYPolicy } from '@/engine/layout';
import { Spr, Spring } from '@/engine/springs';
import curves from '../fixtures/engine/curves.json';
import layout from '../fixtures/engine/layout.json';
import refs from '../fixtures/engine/refs.json';

// Pure functions are held to 1e-9: only last-ulp differences of exp/sin/cos between libm and V8 are expected.
const TOL = 1e-9;

function close(actual: number, expected: number | undefined, tol = TOL): void {
  expect(Math.abs(actual - (expected ?? NaN))).toBeLessThanOrEqual(tol);
}

function expectCurve(
  curve: (x: number) => number,
  xs: readonly number[],
  expected: readonly number[],
): void {
  xs.forEach((x, i) => {
    close(curve(x), expected[i]);
  });
}

describe('curves against the prototype fixture', () => {
  it('matches the CSS beziers', () => {
    const easings: Record<string, (x: number) => number> = {
      easeOut: EASE_OUT,
      lightingEasing: bezier(0.56, 0.01, 0.45, 1),
      enterFadeEasing: bezier(0.59, 0.02, 0.07, 1),
      exitP1: bezier(0.14, 0.06, 0.25, 1),
      exitP2: bezier(0.29, 0.03, 1, 0.38),
      exitFade: bezier(0.43, 0.08, 0.83, 0.31),
      bezIn: bezier(0.2, 0.4, 0.58, 1),
      bezOut: bezier(0.3, 0, 0.58, 1),
    };
    for (const [name, curve] of Object.entries(easings)) {
      expectCurve(curve, refs.xs, (refs as unknown as Record<string, number[]>)[name] ?? []);
    }
  });

  it('matches the splines and clamps outside [0, 1]', () => {
    expectCurve(SCALE, refs.xs, refs.SCALE);
    expectCurve(YOFF, refs.xs, refs.YOFF);
    expectCurve(GLOW_PROTOTYPE, refs.xs, refs.GLOW);
    expectCurve(L_SCALE, refs.xs, refs.L_SCALE);
    expectCurve(L_YOFF, refs.xs, refs.L_YOFF);
    close(SCALE(-0.5), refs.splineOutside[0]);
    close(SCALE(1.5), refs.splineOutside[1]);
  });

  it('matches the curves added after the prototype', () => {
    expectCurve(WIPE, curves.xs, curves.WIPE);
    expectCurve(WIPE_INV, curves.xs, curves.WIPE_INV);
    expectCurve(glowCurve(0.85, 0.7), curves.xs, curves.glow);
    expectCurve(glowCurve(0.3, 1), curves.xs, curves.glowEarly);
    for (const [a, b, x, expected] of curves.smoothstepRange) {
      close(smoothstepRange(a ?? 0, b ?? 0, x ?? 0), expected);
    }
    for (const [v, expected] of curves.clamp) close(clamp(v ?? 0, -1, 2), expected);
  });
});

describe('springs', () => {
  it('steps the analytic spring like the prototype', () => {
    for (const c of refs.spr) {
      const s = new Spr(c.p, c.f, c.d);
      s.g = c.g;
      s.v = c.v;
      c.dts.forEach((dt, i) => {
        close(s.step(dt), c.out[i]);
      });
    }
  });

  it('integrates the k/c spring with its stagger delay and comes to rest exactly', () => {
    for (const c of refs.spring) {
      const s = new Spring(0);
      s.k = c.k;
      s.c = c.c;
      let now = 1000;
      s.to(c.target, c.delay, now);
      for (const want of c.out) {
        now += (1 / 60) * 1000;
        close(s.step(1 / 60, now), want);
      }
      expect(s.p).toBe(c.target);
    }
  });
});

describe('layout rules', () => {
  it('chooses the scroll spring constants', () => {
    for (const c of refs.policy) {
      const [k, damping] = posYPolicy(c.seek, c.inter, c.iv);
      close(k, c.out.k);
      close(damping, c.out.c);
    }
  });

  it('blurs lines by their distance from the active one', () => {
    for (const [i, active, blurm, scale, expected] of layout.blur) {
      close(blurLevel(i ?? 0, active ?? 0, blurm, scale), expected);
    }
  });
});

const PHASES: Record<string, InterludePhase> = {
  oculto: 'hidden',
  espera: 'waiting',
  salida: 'exit',
  hold: 'hold',
  respira: 'breathe',
};

describe('interlude', () => {
  it('breathes like the prototype', () => {
    refs.xs.forEach((x, i) => {
      close(breathing(x), refs.breathing[i]);
    });
  });

  it('matches the dot helpers', () => {
    curves.dotOp.forEach((expected, i) => {
      close(dotOp([-0.2, 0, 0.5, 1, 1.5][i] ?? 0), expected);
    });
    for (const [i, ms, expected] of curves.dotEnter) close(dotEnter(i ?? 0, ms ?? 0), expected);
  });

  it('plans and samples every reference gap', () => {
    for (const c of refs.interlude) {
      const plan = planInterlude(c.total, c.delayEnd);
      if (c.plan === null) {
        expect(plan).toBeNull();
      } else {
        expect(plan?.mode).toBe(c.plan.mode);
        expect(plan?.body).toBe(c.plan.bodyMs);
        expect(plan?.bodyEnd).toBe(c.plan.bodyEnd);
        close(plan?.dot3Target ?? NaN, c.plan.dot3Target);
        if (c.plan.mode === 'breathe') {
          expect(plan?.seg).toBe(c.plan.seg);
          expect(plan?.dot3Dur).toBe(c.plan.dot3Dur);
          close(plan?.period ?? NaN, c.plan.period);
        }
      }
      for (const s of c.samples) {
        const snap = interludeSnap(plan, s.el);
        expect(snap.phase).toBe(PHASES[s.phase]);
        close(snap.groupOpacity, s.op);
        close(snap.groupScale, s.sc);
        s.d.forEach((want, i) => {
          close(snap.dotOpacity[i] ?? NaN, want);
        });
        s.f.forEach((want, i) => {
          close(snap.dotFill[i] ?? NaN, want);
        });
      }
    }
  });
});
