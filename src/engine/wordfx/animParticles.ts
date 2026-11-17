import { lerpRgb, smoothstepRange } from '@/shared/color';
import { splitmix64 } from '@/shared/sha1';
import { FX } from './config';
import type { FxParams, Rgb } from './fxtypes';
import { CUSTOM_PARTICLE_KINDS } from './signatures';

const MASK64 = 0xffff_ffff_ffff_ffffn;
const RAD_TO_DEG = 180 / Math.PI;
const WHITE: Rgb = [255, 255, 255];

export interface Particle {
  readonly xEm: number;
  readonly yEm: number;
  readonly rEm: number;
  readonly alpha: number;
  readonly kind: string;
  readonly color: Rgb;
  readonly rotDeg: number;
  readonly style: string;
  readonly lifeU: number;
  readonly vxEm: number;
  readonly vyEm: number;
  readonly coreColor: Rgb | null;
}

export function mix64(z: bigint): bigint {
  // Reuses SplitMix64 constants over uint64 without mutating caller state.
  let v = (z + 0x9e37_79b9_7f4a_7c15n) & MASK64;
  v = ((v ^ (v >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & MASK64;
  v = ((v ^ (v >> 27n)) * 0x94d0_49bb_1331_11ebn) & MASK64;
  return (v ^ (v >> 31n)) & MASK64;
}

export function toSeedBigInt(seed: string | bigint | number): bigint {
  return (typeof seed === 'bigint' ? seed : BigInt(seed)) & MASK64;
}

export function hash01(seed: string | bigint | number, ...keys: (bigint | number)[]): number {
  let z = mix64(toSeedBigInt(seed));
  for (const k of keys) {
    z = mix64(z ^ (BigInt(k) & MASK64));
  }
  return Number(z >> 11n) / 9007199254740992;
}

export function noise1(seed: string | bigint | number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3.0 - 2.0 * f);
  const z0 = mix64(toSeedBigInt(seed));
  const a = (Number(mix64(z0 ^ (BigInt(i) & MASK64)) >> 11n) / 9007199254740992) * 2.0 - 1.0;
  const b = (Number(mix64(z0 ^ (BigInt(i + 1) & MASK64)) >> 11n) / 9007199254740992) * 2.0 - 1.0;
  return a + (b - a) * u;
}

export function seedK(seed: string | bigint | number, salt: number, k: number): bigint {
  const mixed =
    (BigInt(salt) * 0x9e37_79b9_7f4a_7c15n + BigInt(k) * 0xbf58_476d_1ce4_e5b9n) & MASK64;
  return mix64(mix64(toSeedBigInt(seed)) ^ mixed);
}

export function u01(zp: bigint, s: number): number {
  return (
    Number(mix64(zp ^ ((BigInt(s) * 0x94d0_49bb_1331_11ebn) & MASK64)) >> 11n) / 9007199254740992
  );
}

export function letterKey(p: FxParams, i: number, salt: number): bigint {
  return (
    (BigInt(p.seed) * 0x9e3779b1n + BigInt(i) * 0x85ebca6bn + BigInt(salt) * 0xc2b2ae35n) & MASK64
  );
}

export function wordLetterColor(p: FxParams, i: number, n: number): Rgb {
  const u = n > 1 ? i / (n - 1) : 0.0;
  return lerpRgb(p.colorFrom, p.colorTo, u);
}

export function erodedCount(p: FxParams, n: number, roundFn: (x: number) => number): number {
  if (p.erode <= 0.0) return 0;
  const k = roundFn(p.erode * n);
  return Math.min(n, Math.max(k, p.erode > 0.05 ? 1 : 0));
}

function particle(
  xEm: number,
  yEm: number,
  rEm: number,
  alpha: number,
  kind: string,
  color: Rgb = WHITE,
  opts: {
    rotDeg?: number;
    style?: string;
    lifeU?: number;
    vxEm?: number;
    vyEm?: number;
    coreColor?: Rgb | null;
  } = {},
): Particle {
  return {
    xEm,
    yEm,
    rEm,
    alpha,
    kind,
    color,
    rotDeg: opts.rotDeg ?? 0.0,
    style: opts.style ?? '',
    lifeU: opts.lifeU ?? 0.5,
    vxEm: opts.vxEm ?? 0.0,
    vyEm: opts.vyEm ?? 0.0,
    coreColor: opts.coreColor ?? null,
  };
}

const MONTH_PARTICLES = new Set([
  'prism',
  'candle',
  'gale',
  'dew_petal',
  'pollen',
  'corona',
  'starburst',
  'harvest',
  'equinox',
  'spectral',
  'lantern',
  'snow_star',
]);

function monthParticle(
  kind: string,
  k: number,
  zp: bigint,
  x0: number,
  age: number,
  life: number,
  lifeU: number,
  env: number,
  ph: number,
  col: Rgb,
  u4: number,
  u5: number,
  u6: number,
  u7: number,
  u9: number,
  u11: number,
  u12: number,
): Particle {
  if (kind === 'prism') {
    const side = k % 2 === 0 ? -1.0 : 1.0;
    const x = x0 + side * (0.14 + 0.16 * u4) * age;
    const y = -0.25 - 0.5 * u5 - (0.2 + 0.15 * u6) * age;
    const rot = 45.0 * u11 + side * 35.0 * age;
    return particle(
      x,
      y,
      0.048 + 0.042 * u7,
      0.9 * env,
      'prism',
      lerpRgb(col, [215, 245, 255], 0.45),
      {
        rotDeg: rot,
        lifeU,
        coreColor: [255, 248, 224],
      },
    );
  }
  if (kind === 'candle') {
    if (k % 3 === 0) {
      const x = x0 + 0.12 * (u4 - 0.5) * age + 0.06 * Math.sin(1.2 * age + ph);
      const y = -0.22 - 0.45 * u5 - (0.12 + 0.1 * u6) * age;
      const r = (0.11 + 0.08 * u7) * (0.85 + 0.35 * lifeU);
      return particle(x, y, r, 0.38 * env, 'mist', lerpRgb(col, [255, 214, 232], 0.55), { lifeU });
    }
    const x = x0 + 0.05 * Math.sin(2.4 * age + ph) + 0.04 * (u4 - 0.5) * age;
    const y = -0.18 - 0.48 * u5 - (0.28 + 0.18 * u6) * age;
    const pulse = 0.72 + 0.28 * Math.sin(4.5 * age + ph);
    return particle(
      x,
      y,
      0.044 + 0.036 * u7,
      0.92 * env * pulse,
      'candle',
      lerpRgb(col, [255, 206, 194], 0.5),
      {
        lifeU,
        coreColor: [255, 242, 228],
      },
    );
  }
  if (kind === 'gale') {
    const vx = 0.62 + 0.38 * u4;
    const vy = -0.24 - 0.16 * u6;
    const x = x0 + vx * age;
    const y = -0.22 - 0.5 * u5 + vy * age + 0.07 * Math.sin(3.6 * age + ph);
    const rot = Math.atan2(vy, vx) * RAD_TO_DEG;
    return particle(
      x,
      y,
      0.05 + 0.04 * u7,
      0.9 * env,
      'gale',
      lerpRgb(col, [164, 248, 194], 0.45),
      {
        rotDeg: rot,
        lifeU,
        vxEm: vx,
        vyEm: vy,
        coreColor: [242, 255, 215],
      },
    );
  }
  if (kind === 'dew_petal') {
    const yTop = -0.78 - 0.25 * u5;
    if (lifeU < 0.35) {
      const u = lifeU / 0.35;
      return particle(
        x0 + 0.04 * u,
        yTop + 0.48 * u,
        0.044 + 0.032 * u7,
        0.88 * smoothstepRange(0, 0.2, u),
        'raindrop',
        lerpRgb(col, [186, 232, 255], 0.55),
        {
          rotDeg: -4.0,
          lifeU,
          vyEm: 0.45,
        },
      );
    }
    const dt = (lifeU - 0.35) / 0.65;
    const x = x0 + 0.04 + 0.14 * Math.sin(3.2 * dt + ph) + 0.1 * (u4 - 0.4) * dt;
    const y = yTop + 0.48 - (0.34 + 0.2 * u6) * dt;
    const rot = (u11 - 0.5) * 70.0 + (u12 > 0.5 ? 55.0 : -55.0) * dt;
    return particle(
      x,
      y,
      0.058 + 0.044 * u7,
      0.92 * Math.sin(Math.PI * dt) ** 0.65,
      'petal',
      lerpRgb(col, [255, 206, 228], 0.5),
      {
        rotDeg: rot,
        lifeU,
      },
    );
  }
  if (kind === 'pollen') {
    const ang = ph + (2.4 + 0.8 * u9) * age;
    const rad = 0.1 + 0.12 * u4;
    const sub = k % 3 === 0 ? 'petal' : 'pollen';
    const rot = (u11 - 0.5) * 80.0 + 45.0 * age;
    return particle(
      x0 + Math.cos(ang) * rad,
      -0.15 - 0.45 * u5 - (0.3 + 0.22 * u6) * age,
      0.046 + 0.042 * u7,
      0.92 * env,
      sub,
      lerpRgb(col, [255, 234, 145], 0.45),
      {
        rotDeg: rot,
        lifeU,
        coreColor: [255, 250, 215],
      },
    );
  }
  if (kind === 'corona') {
    const ang = ph + (1.2 + 0.5 * u9) * age;
    const rx = 0.22 + 0.18 * u4;
    const ry = 0.14 + 0.12 * u5;
    return particle(
      x0 + Math.cos(ang) * rx,
      -0.45 + Math.sin(ang) * ry - 0.08 * age,
      0.052 + 0.044 * u7,
      0.92 * env,
      'corona',
      lerpRgb(col, [255, 222, 140], 0.48),
      {
        rotDeg: ang * RAD_TO_DEG,
        lifeU,
        coreColor: [255, 252, 224],
      },
    );
  }
  if (kind === 'starburst') {
    const spreadAng = -Math.PI * 0.5 + (u4 - 0.5) * 1.35;
    const speed = 0.55 + 0.45 * u6;
    const buoy = 1.0 - (1.0 - lifeU) ** 1.4;
    const vx = Math.cos(spreadAng) * speed;
    const vy = Math.sin(spreadAng) * speed;
    return particle(
      x0 + vx * life * buoy,
      -0.22 - 0.42 * u5 + vy * life * buoy,
      0.048 + 0.04 * u7,
      0.94 * env,
      'starburst',
      lerpRgb(col, [255, 168, 72], 0.55),
      {
        rotDeg: spreadAng * RAD_TO_DEG,
        lifeU,
        vxEm: vx,
        vyEm: vy,
        coreColor: [255, 248, 205],
      },
    );
  }
  if (kind === 'harvest') {
    const x = x0 + (0.22 + 0.16 * u4) * age + 0.06 * Math.sin(1.4 * age + ph);
    const y = -0.62 - 0.35 * u5 + (0.14 + 0.1 * u6) * age;
    const rot = (u11 - 0.5) * 60.0 + 25.0 * Math.sin(1.6 * age + ph);
    return particle(
      x,
      y,
      0.056 + 0.044 * u7,
      0.9 * env,
      'harvest',
      lerpRgb(col, [255, 218, 130], 0.45),
      {
        rotDeg: rot,
        lifeU,
      },
    );
  }
  if (kind === 'equinox') {
    if (k % 2 === 0) {
      const x = x0 + 0.1 * (u4 - 0.5) * age + 0.07 * Math.sin(1.6 * age + ph);
      const y = -0.35 - 0.3 * u5 - (0.16 + 0.12 * u6) * age;
      return particle(
        x,
        y,
        0.052 + 0.04 * u7,
        0.8 * env,
        'equinox',
        lerpRgb(col, [176, 224, 212], 0.55),
        {
          lifeU,
          coreColor: [240, 255, 250],
        },
      );
    }
    const x = x0 + 0.14 * Math.sin(2.4 * age + ph) + 0.06 * (u4 - 0.5) * age;
    const y = -0.58 - 0.32 * u5 + (0.2 + 0.14 * u6) * age;
    const rot = 36.0 * Math.cos(2.4 * age + ph) + (u11 - 0.5) * 24.0;
    return particle(
      x,
      y,
      0.062 + 0.042 * u7,
      0.9 * env,
      'leaf',
      lerpRgb(col, [224, 152, 92], 0.55),
      {
        rotDeg: rot,
        lifeU,
      },
    );
  }
  if (kind === 'spectral') {
    if (k % 3 === 0) {
      const x = x0 + 0.16 * (u4 - 0.45) * age + 0.1 * Math.sin(1.2 * age + ph);
      const y = -0.25 - 0.45 * u5 - (0.14 + 0.1 * u6) * age;
      const r = (0.12 + 0.09 * u7) * (0.85 + 0.35 * lifeU);
      return particle(x, y, r, 0.42 * env, 'mist', lerpRgb(col, [186, 148, 245], 0.55), { lifeU });
    }
    const x = x0 + 0.16 * Math.sin(2.2 * age + ph) + 0.07 * noise1(zp ^ 0x9e37n, age * 2.5);
    const y = -0.18 - 0.46 * u5 - (0.22 + 0.16 * u6) * age;
    return particle(
      x,
      y,
      0.046 + 0.038 * u7,
      0.86 * env,
      'spectral',
      lerpRgb(col, [238, 152, 104], 0.45),
      {
        lifeU,
        coreColor: [248, 232, 255],
      },
    );
  }
  if (kind === 'lantern') {
    const x = x0 + 0.06 * Math.sin(1.1 * age + ph) + 0.04 * (u4 - 0.5) * age;
    const y = -0.12 - 0.42 * u5 - (0.24 + 0.16 * u6) * age;
    return particle(
      x,
      y,
      0.056 + 0.044 * u7,
      0.92 * env,
      'lantern',
      lerpRgb(col, [255, 178, 64], 0.55),
      {
        lifeU,
        coreColor: [255, 242, 198],
      },
    );
  }
  if (k % 3 === 0) {
    const x = x0 + 0.08 * Math.sin(1.2 * age + ph) + 0.04 * (u4 - 0.5) * age;
    const y = -0.35 - 0.55 * u5 - 0.08 * age;
    const hope = 0.45 + 0.55 * smoothstepRange(0.25, 0.75, lifeU);
    return particle(
      x,
      y,
      0.068 + 0.055 * u7,
      0.92 * env * hope,
      'spark',
      lerpRgb(col, [255, 238, 186], 0.6),
      {
        style: 'celestial',
        lifeU,
        coreColor: [255, 255, 245],
      },
    );
  }
  const x = x0 + 0.07 * (u4 - 0.3) * age + 0.06 * Math.sin(1.4 * age + ph);
  const y = -0.78 - 0.4 * u5 + (0.18 + 0.14 * u6) * age;
  const rot = 360.0 * u11 + (u12 > 0.5 ? 30.0 : -30.0) * age;
  return particle(x, y, 0.056 + 0.048 * u7, 0.9 * env, 'snow', lerpRgb(col, [226, 246, 255], 0.6), {
    rotDeg: rot,
    lifeU,
  });
}

function customParticle(
  p: FxParams,
  k: number,
  lettersXEm: readonly number[],
  lettersWEm: readonly number[],
  t: number,
  beginS: number,
  dur: number,
  onsets: readonly number[] | null | undefined,
): Particle | null {
  const n = lettersXEm.length;
  const zp = seedK(p.seed, 300, k);
  const v0 = u01(zp, 0);
  const v1 = u01(zp, 1);
  const v2 = u01(zp, 2);
  const li = Math.trunc(v2 * n) % n;
  const startS = onsets?.length === n ? (onsets[li] ?? beginS) : beginS;
  const spawn = startS + v0 * Math.max(0.3, dur * 0.85);
  const kind = p.particleKind;
  let life: number;
  if (kind === 'ember') {
    life = k % 3 === 0 ? 0.58 + 0.34 * v1 : 1.02 + 0.52 * v1;
  } else if (kind === 'shard') {
    life = 0.9 + 0.5 * v1;
  } else if (kind === 'starburst') {
    life = 0.85 + 0.45 * v1;
  } else if (kind === 'gale') {
    life = 1.0 + 0.45 * v1;
  } else if (kind === 'crimson' || kind === 'dew_petal') {
    life = 1.65 + 0.55 * v1;
  } else if (kind === 'lantern' || kind === 'snow_star') {
    life = 1.85 + 0.65 * v1;
  } else {
    life = 1.5 + 0.7 * v1;
  }
  const age = t - spawn;
  if (age < 0.0 || age >= life) return null;
  const v3 = u01(zp, 3);
  const v4 = u01(zp, 4);
  const v5 = u01(zp, 5);
  const v6 = u01(zp, 6);
  const v7 = u01(zp, 7);
  const x0 = (lettersXEm[li] ?? 0) + v3 * (lettersWEm[li] ?? 0);
  const ph = 2.0 * Math.PI * u01(zp, 10);
  const col = wordLetterColor(p, li, n);
  const lifeU = Math.min(1.0, age / life);
  const env = Math.sin(Math.PI * lifeU) ** 0.75;
  if (MONTH_PARTICLES.has(kind)) {
    return monthParticle(
      kind,
      k,
      zp,
      x0,
      age,
      life,
      lifeU,
      env,
      ph,
      col,
      v4,
      v5,
      v6,
      v7,
      u01(zp, 9),
      u01(zp, 11),
      u01(zp, 12),
    );
  }
  if (kind === 'petal') {
    const v8 = u01(zp, 8);
    const v11 = u01(zp, 11);
    const v12 = u01(zp, 12);
    const x = x0 + (0.16 + 0.16 * v4) * age + 0.13 * Math.sin(2.3 * age + ph);
    const y = -0.15 - 0.55 * v5 - (0.34 + 0.28 * v6) * age + 0.05 * Math.sin(3.4 * age + ph);
    const rot = (v11 - 0.5) * 90.0 + (v12 > 0.5 ? 70.0 : -70.0) * age;
    return particle(
      x,
      y,
      0.065 + 0.05 * v7,
      0.92 * env,
      'petal',
      lerpRgb(col, v8 < 0.65 ? [255, 210, 226] : WHITE, 0.35),
      {
        rotDeg: rot,
        lifeU,
      },
    );
  }
  if (kind === 'firefly') {
    const v9 = u01(zp, 9);
    const v11 = u01(zp, 11);
    const x =
      x0 +
      0.2 * Math.sin(1.9 * age + ph) +
      0.09 * (v4 - 0.5) * age +
      0.06 * Math.cos(0.9 * age + ph * 0.5);
    const y = -0.25 - 0.65 * v5 - (0.16 + 0.14 * v6) * age + 0.15 * Math.cos(1.7 * age + ph * 0.7);
    const blink = 0.28 + 0.72 * Math.sin(Math.PI * ((1.2 + 0.9 * v9) * age + v11)) ** 2;
    return particle(
      x,
      y,
      0.045 + 0.045 * v7,
      0.98 * env * blink,
      'firefly',
      lerpRgb(col, [255, 232, 145], 0.45),
      { lifeU },
    );
  }
  if (kind === 'leaf') {
    const v8 = u01(zp, 8);
    const v11 = u01(zp, 11);
    const vxOsc = 0.22 * 3.1 * Math.cos(3.1 * age + ph);
    const x = x0 + 0.14 * (v4 - 0.35) * age + 0.22 * Math.sin(3.1 * age + ph);
    const y = -0.6 - 0.45 * v5 + (0.3 + 0.24 * v6) * age + 0.08 * age * age;
    const rot = 48.0 * Math.cos(3.1 * age + ph) + 12.0 * Math.tanh(vxOsc) + (v11 - 0.5) * 28.0;
    return particle(
      x,
      y,
      0.07 + 0.05 * v7,
      0.94 * env,
      'leaf',
      lerpRgb(col, v8 < 0.5 ? [242, 168, 72] : [214, 98, 62], 0.4),
      {
        rotDeg: rot,
        lifeU,
      },
    );
  }
  if (kind === 'snow') {
    const v11 = u01(zp, 11);
    const v12 = u01(zp, 12);
    const x = x0 + 0.09 * (v4 - 0.25) * age + 0.08 * Math.sin(1.9 * age + ph);
    const y = -0.8 - 0.45 * v5 + (0.24 + 0.18 * v6) * age;
    const rot = 360.0 * v11 + (v12 > 0.5 ? 42.0 : -42.0) * age;
    return particle(
      x,
      y,
      0.06 + 0.055 * v7,
      0.92 * env,
      'snow',
      lerpRgb(col, [235, 249, 255], 0.6),
      {
        rotDeg: rot,
        lifeU,
      },
    );
  }
  if (kind === 'ember') {
    const v9 = u01(zp, 9);
    const buoy = 1.0 - (1.0 - lifeU) ** 1.55;
    const riseDist = (0.9 + 0.65 * v6) * life;
    const y = -0.08 - 0.48 * v5 - riseDist * buoy;
    const vy = -(riseDist / life) * 1.55 * (1.0 - lifeU) ** 0.55;
    const swayF = 4.2 + 2.2 * v9;
    const curl = 0.055 * noise1(zp ^ 0x517cc1b7n, age * 3.4);
    const x =
      x0 + (v4 - 0.5) * 0.34 * lifeU ** 0.85 * life + 0.12 * Math.sin(swayF * age + ph) + curl;
    const vx = (v4 - 0.5) * 0.3 + 0.12 * swayF * Math.cos(swayF * age + ph);
    const rot = Math.max(
      -38.0,
      Math.min(38.0, Math.atan2(vx, Math.max(0.15, -vy)) * RAD_TO_DEG * 0.65),
    );
    const flicker =
      0.6 + 0.4 * (0.5 + 0.5 * Math.sin(13.5 * age + ph) * Math.cos(5.3 * age + ph * 0.4));
    const fadeIn = smoothstepRange(0.0, 0.08, lifeU);
    const fadeOut = (1.0 - lifeU) ** 1.25;
    const hotCol = lerpRgb(col, [255, 224, 128], 0.55);
    const midCol = lerpRgb(col, [255, 118, 34], 0.7);
    const coolCol: Rgb = [212, 54, 20];
    const bodyCol =
      lifeU < 0.5
        ? lerpRgb(hotCol, midCol, lifeU * 2.0)
        : lerpRgb(midCol, coolCol, (lifeU - 0.5) * 2.0);
    const coreCol = lerpRgb([255, 250, 218], [255, 170, 72], lifeU ** 0.8);
    const rBase = k % 3 === 0 ? 0.036 + 0.032 * v7 : 0.048 + 0.046 * v7;
    const r = rBase * (1.0 - 0.42 * lifeU);
    return particle(x, y, r, 0.96 * fadeIn * fadeOut * flicker, 'ember', bodyCol, {
      rotDeg: rot,
      lifeU,
      vxEm: vx,
      vyEm: vy,
      coreColor: coreCol,
    });
  }
  if (kind === 'raindrop') {
    const fallIn = smoothstepRange(0.0, 0.1, lifeU);
    const y = -0.55 - 0.4 * v5 + (0.48 + 0.34 * v6) * age + 0.45 * age * age;
    const vy = 0.48 + 0.34 * v6 + 0.9 * age;
    return particle(
      x0 + 0.06 * age,
      y,
      0.046 + 0.036 * v7,
      0.9 * env * fallIn,
      'raindrop',
      lerpRgb(col, [175, 215, 255], 0.45),
      {
        rotDeg: -5.5,
        lifeU,
        vyEm: vy,
      },
    );
  }
  if (kind === 'tear') {
    const tCol = lerpRgb(col, [185, 224, 255], 0.55);
    const yBase = 0.08 + 0.04 * v5;
    const r0 = 0.052 + 0.036 * v7;
    if (age < 0.24) {
      const u = age / 0.24;
      return particle(
        x0,
        yBase + 0.04 * u,
        r0 * (0.4 + 0.6 * Math.sin(u * Math.PI * 0.5)),
        0.9 * Math.min(1.0, u * 2.2),
        'tear',
        tCol,
      );
    }
    if (age < 1.0) {
      const dt = age - 0.24;
      return particle(x0, yBase + 0.04 + 0.14 * dt + 1.15 * dt * dt, r0, 0.92, 'tear', tCol);
    }
    const u = Math.min(1.0, (age - 1.0) / 0.5);
    const yPool = yBase + 0.04 + 0.14 * 0.76 + 1.15 * 0.76 * 0.76;
    return particle(
      x0,
      yPool,
      r0 * (1.2 + 4.2 * u),
      0.75 * (1.0 - u) ** 1.4,
      'ripple',
      lerpRgb(tCol, [230, 245, 255], 0.4),
    );
  }
  if (kind === 'crimson') {
    const cEdge = lerpRgb(col, [217, 43, 75], 0.72);
    const cWine = lerpRgb(cEdge, [110, 18, 36], 0.65);
    const yBase = -0.04 + 0.16 * v5;
    const r0 = 0.056 + 0.04 * v7;
    if (age < 0.34) {
      const u = age / 0.34;
      return particle(
        x0,
        yBase + 0.03 * u,
        r0 * (0.35 + 0.65 * Math.sin(u * Math.PI * 0.5)),
        0.92 * Math.min(1.0, u * 2.0),
        'crimson',
        cEdge,
      );
    }
    if (age < 1.3) {
      const dt = age - 0.34;
      const u = dt / 0.96;
      return particle(
        x0,
        yBase + 0.03 + 0.08 * dt + 0.48 * dt * dt,
        r0,
        0.94,
        'crimson',
        lerpRgb(cEdge, cWine, u * 0.85),
      );
    }
    const u = Math.min(1.0, (age - 1.3) / 0.45);
    const yPool = yBase + 0.03 + 0.08 * 0.96 + 0.48 * 0.96 * 0.96;
    return particle(x0, yPool, r0 * (1.0 + 2.2 * u), 0.78 * (1.0 - u) ** 1.5, 'stain', cWine);
  }
  if (kind === 'bubble') {
    const x = x0 + 0.06 * (v4 - 0.5) * age + 0.1 * Math.sin(3.0 * age + ph);
    const y = -0.05 - 0.4 * v5 - (0.36 + 0.25 * v6) * age;
    return particle(
      x,
      y,
      0.055 + 0.055 * v7,
      0.86 * env,
      'bubble',
      lerpRgb(col, [190, 244, 255], 0.5),
      { lifeU },
    );
  }
  if (kind === 'mist') {
    const x = x0 + 0.2 * (v4 - 0.4) * age + 0.12 * Math.sin(1.1 * age + ph);
    const y = -0.22 - 0.55 * v5 - (0.14 + 0.12 * v6) * (life * (1.0 - (1.0 - lifeU) ** 1.3));
    const r = (0.14 + 0.11 * v7) * (0.82 + 0.42 * lifeU);
    return particle(x, y, r, 0.44 * env, 'mist', lerpRgb(col, [240, 248, 255], 0.55), { lifeU });
  }
  if (kind === 'shard') {
    const v11 = u01(zp, 11);
    const v12 = u01(zp, 12);
    const vx = (v4 - 0.5) * 0.72;
    const y = -0.25 - 0.35 * v5 + (0.2 * v6 - 0.15) * age + 0.55 * age * age;
    const rot = 360.0 * v11 + (v12 > 0.5 ? 220.0 : -220.0) * age * (1.0 - 0.25 * lifeU);
    return particle(
      x0 + vx * age,
      y,
      0.06 + 0.048 * v7,
      0.94 * (1.0 - lifeU),
      'shard',
      lerpRgb(col, [235, 245, 255], 0.55),
      {
        rotDeg: rot,
        lifeU,
      },
    );
  }
  if (kind === 'wisp') {
    const v9 = u01(zp, 9);
    const wRate = 1.6 + 0.8 * v9;
    const ang = ph + wRate * age;
    const rad = 0.15 + 0.19 * v4;
    const rise = p.sigAxis === 'scale' ? 0.18 : 0.14;
    const x = x0 + Math.cos(ang) * rad;
    const y = -0.42 - 0.35 * v5 - rise * age + Math.sin(ang) * rad * 0.55;
    const vx = -Math.sin(ang) * rad * wRate;
    const vy = -rise + Math.cos(ang) * rad * 0.55 * wRate;
    return particle(
      x,
      y,
      0.048 + 0.042 * v7,
      0.86 * env,
      'wisp',
      lerpRgb(col, [232, 222, 255], 0.45),
      {
        lifeU,
        vxEm: vx,
        vyEm: vy,
        coreColor: [255, 252, 245],
      },
    );
  }
  if (kind === 'spark') {
    const v9 = u01(zp, 9);
    const v11 = u01(zp, 11);
    const y = -0.2 - 0.65 * v5 - (0.22 + 0.18 * v6) * age;
    const x = x0 + 0.12 * Math.sin(1.8 * age + ph) + 0.06 * (v4 - 0.5) * age;
    const tw = 0.25 + 0.75 * Math.sin(Math.PI * ((1.0 + 0.7 * v9) * age + v11)) ** 2;
    return particle(x, y, 0.075 + 0.065 * v7, 0.9 * env * tw, 'spark', lerpRgb(col, WHITE, 0.45), {
      style: p.sparkleStyle || 'celestial',
      lifeU,
      coreColor: WHITE,
    });
  }
  let x: number;
  let y: number;
  let rot: number;
  if (p.sigAxis === 'scale' || p.driftEm < -0.05) {
    const ang = ph + 2.2 * age;
    x = x0 + 0.14 * Math.sin(ang) + 0.12 * (v4 - 0.5) * age;
    y = -0.18 - 0.45 * v5 - (0.34 + 0.22 * v6) * age;
    rot = 16.0 * Math.cos(ang);
  } else {
    x = x0 + (0.5 + 0.34 * v4) * age;
    y = -0.25 - 0.5 * v5 - 0.18 * age + 0.11 * Math.sin(2.5 * age + ph);
    rot = 24.0 + 18.0 * Math.cos(2.5 * age + ph);
  }
  return particle(
    x,
    y,
    0.062 + 0.045 * v7,
    0.88 * env,
    'seed',
    lerpRgb(col, [240, 250, 255], 0.65),
    {
      rotDeg: rot,
      lifeU,
    },
  );
}

function emitSparkles(
  p: FxParams,
  lettersXEm: readonly number[],
  lettersWEm: readonly number[],
  t: number,
  beginS: number,
  endS: number,
  fillFrontU: number | null | undefined,
  out: Particle[],
): void {
  if (p.sparkle <= 0 || t < beginS - 0.1 || t > endS + 3.0) return;
  const n = lettersXEm.length;
  const win =
    smoothstepRange(beginS - 0.1, beginS + 0.2, t) *
    (1.0 - smoothstepRange(endS + 2.5, endS + 3.0, t));
  let width = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const right = (lettersXEm[i] ?? 0) + (lettersWEm[i] ?? 0);
    if (right > width) width = right;
  }
  const frontX = fillFrontU !== null && fillFrontU !== undefined ? fillFrontU * width : null;
  const style = p.sparkleStyle || 'star';
  const dtT = Math.max(0.0, t - beginS);
  for (let k = 0; k < p.sparkle; k += 1) {
    const zp = seedK(p.seed, 200, k);
    const v0 = u01(zp, 0);
    const v1 = u01(zp, 1);
    const v2 = u01(zp, 2);
    const v3 = u01(zp, 3);
    const v4 = u01(zp, 4);
    const u = v2 * 1.2 - 0.1;
    let x: number;
    let ci: number;
    if (frontX !== null) {
      x = Math.min(width * 1.05, Math.max(-0.05 * width, frontX + (v2 - 0.5) * 0.38 * width));
      ci = Math.min(n - 1, Math.max(0, Math.trunc((x / Math.max(width, 1e-4)) * n)));
    } else {
      x = u * width;
      ci = Math.min(n - 1, Math.max(0, Math.trunc(u * n)));
    }
    const baseCol = wordLetterColor(p, ci, n);
    if (style === 'celestial') {
      const isHero = k % 3 === 0;
      const freq = 0.65 + 0.75 * v0;
      const tw = 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(2.0 * Math.PI * (freq * t + v1))) ** 2.2;
      const ang = 2.0 * Math.PI * v1 + 0.55 * dtT;
      const dxArc = 0.065 * Math.cos(ang);
      const dyArc = -0.045 * Math.sin(ang);
      const r = isHero ? 0.14 + 0.07 * v4 : 0.058 + 0.052 * v4;
      out.push(
        particle(
          x + dxArc,
          -1.08 + 1.3 * v3 + dyArc,
          r,
          tw * win,
          'spark',
          lerpRgb(baseCol, [232, 240, 255], 0.45),
          {
            style: 'celestial',
            coreColor: WHITE,
          },
        ),
      );
    } else if (style === 'ember') {
      const cyc = (dtT * (0.85 + 0.45 * v0) + v1) % 1.0;
      const tw = Math.sin(Math.PI * cyc) ** 0.7 * (0.65 + 0.35 * Math.sin(18.0 * t + 6.28 * v1));
      const xE = x + 0.08 * Math.sin(5.0 * cyc + 6.28 * v0);
      const yE = -0.15 - 0.78 * v3 - 0.45 * cyc;
      out.push(
        particle(
          xE,
          yE,
          0.055 + 0.055 * v4,
          Math.max(0.0, tw) * win,
          'spark',
          lerpRgb(baseCol, [255, 168, 56], 0.62),
          {
            style: 'ember',
            lifeU: cyc,
            vyEm: -0.55,
            coreColor: [255, 248, 212],
          },
        ),
      );
    } else if (style === 'buoyant') {
      const freq = 1.05 + 0.85 * v0;
      const tw = Math.max(0.0, Math.sin(2.0 * Math.PI * (freq * t + v1))) ** 1.6;
      const arc = 0.1 * Math.sin(Math.PI * ((dtT * 0.9 + v1) % 1.0));
      out.push(
        particle(
          x,
          -0.92 + 1.15 * v3 - arc,
          0.095 + 0.095 * v4,
          tw * win,
          'spark',
          lerpRgb(baseCol, [255, 246, 224], 0.45),
          {
            style: 'buoyant',
            vyEm: -0.35,
            coreColor: [255, 252, 236],
          },
        ),
      );
    } else if (style === 'bokeh') {
      const freq = 0.45 + 0.55 * v0;
      const tw = 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(2.0 * Math.PI * (freq * t + v1))) ** 1.5;
      const driftY = -0.08 * Math.sin(1.4 * dtT + 6.28 * v1);
      out.push(
        particle(
          x,
          -0.95 + 1.15 * v3 + driftY,
          0.085 + 0.095 * v4,
          0.75 * tw * win,
          'spark',
          lerpRgb(baseCol, [255, 236, 225], 0.4),
          {
            style: 'bokeh',
            coreColor: [255, 248, 238],
          },
        ),
      );
    } else if (style === 'flare') {
      const freq = 0.6 + 0.7 * v0;
      const tw = Math.max(0.0, Math.sin(2.0 * Math.PI * (freq * t + v1))) ** 2.2;
      out.push(
        particle(
          x,
          -0.88 + 0.75 * v3,
          0.1 + 0.1 * v4,
          tw * win,
          'spark',
          lerpRgb(baseCol, [255, 248, 232], 0.55),
          {
            style: 'flare',
            coreColor: [255, 252, 242],
          },
        ),
      );
    } else {
      const tw = Math.max(0.0, Math.sin(2.0 * Math.PI * ((0.8 + v0) * t + v1))) ** 2;
      out.push(
        particle(
          x,
          -1.0 + 1.25 * v3,
          0.11 + 0.12 * v4,
          tw * win,
          'spark',
          lerpRgb(baseCol, WHITE, 0.5),
          {
            style: 'star',
          },
        ),
      );
    }
  }
}

export function particles(
  p: FxParams,
  lettersXEm: readonly number[],
  lettersWEm: readonly number[],
  t: number,
  beginS: number,
  endS: number,
  reduce = false,
  onsets: readonly number[] | null = null,
  fillFrontU: number | null = null,
  roundFn: (x: number) => number = Math.round,
): Particle[] {
  const n = lettersXEm.length;
  const dur = Math.max(endS - beginS, 0.05);
  if (
    reduce ||
    n === 0 ||
    p.durationMode === 'accent' ||
    dur < 0.25 ||
    (p.particles <= 0 && p.sparkle <= 0)
  ) {
    return [];
  }
  const effectiveEnd = beginS + dur;
  const out: Particle[] = [];
  if (CUSTOM_PARTICLE_KINDS.has(p.particleKind)) {
    for (let k = 0; k < Math.max(p.particles, 0); k += 1) {
      const q = customParticle(p, k, lettersXEm, lettersWEm, t, beginS, dur, onsets);
      if (q !== null) out.push(q);
    }
  } else {
    const erodedRaw = erodedCount(p, n, roundFn);
    const ne = Math.max(erodedRaw, 1);
    for (let k = 0; k < Math.max(p.particles, 0); k += 1) {
      const zp = seedK(p.seed, 100, k);
      const v0 = u01(zp, 0);
      const v1 = u01(zp, 1);
      const v2 = u01(zp, 2);
      const li = n - ne + (Math.trunc(v2 * ne) % ne);
      let spawn: number;
      if (onsets?.length === n) {
        const liOnset = onsets[li] ?? beginS;
        spawn = liOnset + v0 * Math.min(0.25, Math.max(0.05, effectiveEnd - liOnset));
      } else {
        spawn =
          p.vanishS > 0.0
            ? p.vanishS + v0 * FX.vanishS
            : effectiveEnd - FX.erodeTail * dur + v0 * (FX.erodeTail * dur + FX.driftTailS);
      }
      const life = 1.0 + 0.4 * v1;
      const age = t - spawn;
      if (age < 0.0 || age >= life) continue;
      const v3 = u01(zp, 3);
      const v4 = u01(zp, 4);
      const v5 = u01(zp, 5);
      const v6 = u01(zp, 6);
      const v7 = u01(zp, 7);
      const v8 = u01(zp, 8);
      const v9 = u01(zp, 9);
      const v10 = u01(zp, 10);
      const lifeU = age / life;
      const damp = (1.0 - Math.exp(-2.0 * age)) * 0.5;
      let x =
        (lettersXEm[li] ?? 0) +
        v3 * (lettersWEm[li] ?? 0) +
        (v4 - 0.4) * 0.4 * damp +
        0.03 * Math.sin(2.0 * Math.PI * ((0.5 + 0.4 * v9) * age + v10)) +
        0.02 * noise1(zp ^ 0x3c6ef372n, age * 2.2);
      if (erodedRaw > 0) x = Math.max(lettersXEm[n - ne] ?? x, x);
      const y0 = p.driftEm - 0.1 - 0.5 * v5;
      const y =
        p.driftEm >= 0.0
          ? y0 - 0.1 * v6 * age + 0.5 * FX.gravity * age * age
          : y0 - (0.2 + 0.2 * v6) * age;
      let col = wordLetterColor(p, li, n);
      if (v8 < 0.25) col = lerpRgb(col, WHITE, 0.4);
      out.push(
        particle(x, y, 0.035 + 0.055 * v7, 0.95 * (1.0 - lifeU) ** 1.5, 'dust', col, { lifeU }),
      );
    }
  }
  emitSparkles(p, lettersXEm, lettersWEm, t, beginS, effectiveEnd, fillFrontU, out);
  return out;
}

export { splitmix64 };
