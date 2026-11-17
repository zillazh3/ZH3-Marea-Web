import { FX } from '@/engine/wordfx/config';
import type { MotionSignature } from '@/engine/wordfx/signatures';

export interface VariantSpec {
  readonly name: string;
  readonly weight: number;
  readonly sig: Partial<MotionSignature>;
}

const BASE: VariantSpec = { name: 'base', weight: 1.0, sig: {} };

function v(name: string, sig: Partial<MotionSignature>, weight = 1.0): VariantSpec {
  return { name, weight, sig };
}

export const VARIANTS: Readonly<Record<string, readonly VariantSpec[]>> = {
  sadness: [
    v('heavy', { waveform: 'breath', freqRangeHz: [0.3, 0.5], ampRangeEm: [0.012, 0.024] }),
    v('bleed', { tintSpread: 'ink' }),
  ],
  joy: [
    v('lift', { waveform: 'orbit', axis: 'y', ampRangeEm: [0.02, 0.035] }),
    v('sparkle', { shimmer: 0.6, sparkleStyle: 'star' }),
  ],
  anguish: [
    v('tremor', {
      waveform: 'sine',
      axis: 'x',
      freqRangeHz: [8.0, 10.0],
      ampRangeEm: [0.006, 0.012],
    }),
    v('pulse', {
      waveform: 'heartbeat',
      axis: 'scale',
      freqRangeHz: [1.4, 1.8],
      ampRangeEm: [0.03, 0.045],
    }),
  ],
  fear: [
    v('shrink', { waveform: 'erode', axis: 'scale', ampRangeEm: [0.02, 0.04] }),
    v('flutter', { waveform: 'flicker', axis: 'y', freqRangeHz: [3.0, 4.0] }),
  ],
  love: [
    v('breathe', { waveform: 'breath', freqRangeHz: [0.7, 1.1] }),
    v('glow', { shimmer: 0.5, glowSpread: 0.65 }),
  ],
  anger: [
    v('scatter', { scatterEm: 0.05 }),
    v('flare', { waveform: 'step', freqRangeHz: [2.2, 3.4], glowSpread: 0.7 }),
  ],
  fire: [
    v('heat', { waveform: 'shimmer', freqRangeHz: [2.2, 3.2] }),
    v('flare', { glowSpread: 0.9, shimmer: 0.5 }),
  ],
  water: [
    v('ripple', { motif: 'ripple' }),
    v('tide', { waveform: 'breath', freqRangeHz: [0.4, 0.7] }),
  ],
  air: [
    v('gust', { waveform: 'surge' }),
    v('float', { waveform: 'sine', axis: 'y', freqRangeHz: [0.3, 0.5] }),
  ],
  celestial: [
    v('twinkle', { shimmer: 0.7, sparkleStyle: 'star' }),
    v('corona', { glowSpread: 0.9, motif: 'corona' }),
  ],
  shadow: [v('veil', { tintSpread: 'ink' }), v('ember-core', { glowSpread: 0.3, shimmer: 0.4 })],
  hope: [v('dawn', { shimmer: 0.8 }), v('rise', { axis: 'y', freqRangeHz: [0.4, 0.7] })],
  loneliness: [
    v('drift', { waveform: 'sine', freqRangeHz: [0.2, 0.4] }),
    v('hollow', { waveform: 'erode', axis: 'y' }),
  ],
  desire: [
    v('ember', { sparkleStyle: 'ember', glowSpread: 0.7 }),
    v('sway', { waveform: 'orbit', axis: 'x', freqRangeHz: [0.6, 0.9] }),
  ],
  freedom: [v('soar', { axis: 'y', waveform: 'orbit' }), v('scatter', { scatterEm: 0.06 })],
  light: [
    v('sweep', { shimmer: 1.0 }),
    v('halo', { glowSpread: 0.95, motif: 'corona', shimmer: 0.4 }),
  ],
  electric: [v('crackle', { glitch: 1.0 }), v('pulse', { waveform: 'tick', glitch: 0.0 })],
  cold: [
    v('frost', { tintSpread: 'frost' }),
    v('shiver', { waveform: 'flicker', freqRangeHz: [2.4, 3.2], tintSpread: '' }),
  ],
  death: [
    v('fade', { tintSpread: 'ink', waveform: 'erode' }),
    v('still', { waveform: 'sine', freqRangeHz: [0.2, 0.3], ampRangeEm: [0.004, 0.008] }),
  ],
  scream: [
    v('burst', { scatterEm: 0.07 }),
    v('tremor', { waveform: 'flicker', freqRangeHz: [6.0, 8.0] }),
  ],
  whisper: [
    v('hush', { waveform: 'sine', freqRangeHz: [0.3, 0.5] }),
    v('breathy', { waveform: 'breath', shimmer: 0.3 }),
  ],
  breath: [
    v('inhale', { waveform: 'breath', axis: 'scale' }),
    v('sigh', { waveform: 'erode', axis: 'y' }),
  ],
};

export function optionsFor(category: string): readonly VariantSpec[] {
  const vs = VARIANTS[category];
  if (!vs || vs.length === 0) return [BASE];
  return vs[0]?.name === 'base' ? vs : [BASE, ...vs];
}

export function variantId(category: string, name: string): string {
  return `${category}.${name}`;
}

export function weightOf(category: string, spec: VariantSpec): number {
  const custom = FX.variantWeights[variantId(category, spec.name)];
  return Math.max(0, custom ?? spec.weight);
}

export function pickVariant(category: string, u: number, avoid = ''): VariantSpec {
  let opts = optionsFor(category);
  if (opts.length > 1 && avoid) {
    const rest = opts.filter((spec) => variantId(category, spec.name) !== avoid);
    if (rest.length > 0) opts = rest;
  }
  const ws = opts.map((spec) => weightOf(category, spec));
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return opts[0] ?? BASE;
  let x = u * total;
  for (let i = 0; i < opts.length; i += 1) {
    x -= ws[i] ?? 0;
    const picked = opts[i];
    if (x < 0 && picked) return picked;
  }
  return opts[opts.length - 1] ?? BASE;
}
