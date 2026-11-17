// Layer-neutral types for wordfx (engine letter math, render drawing, and feature composition share these).

export type Rgb = readonly [number, number, number];

export const FX_AXES = [
  'valence',
  'arousal',
  'gravity',
  'temperature',
  'fragility',
  'blur',
] as const;

export type FxDurationMode = 'accent' | 'normal' | 'held';
export type FxTier = 'strong' | 'light' | 'support' | 'ambient';
export type FxWaveform =
  | 'sine'
  | 'heartbeat'
  | 'shake'
  | 'breath'
  | 'tick'
  | 'step'
  | 'flicker'
  | 'erode'
  | 'orbit'
  | 'pendulum'
  | 'surge'
  | 'shimmer';
export type FxSigAxis = 'y' | 'x' | 'scale' | 'rot' | 'arc';
export type FxTintSpread = '' | 'frost' | 'ink';

export interface FxParams {
  readonly seed: string; // unsigned 64-bit integer stored as decimal string for JSON/structured-clone safety
  readonly vector: readonly number[];
  readonly primitives: readonly string[];
  readonly bleed: number;
  readonly bleedFrom: string;
  readonly repeatN: number;
  readonly holdS: number;
  readonly colorFrom: Rgb;
  readonly colorTo: Rgb;
  readonly driftEm: number;
  readonly jitterEm: number;
  readonly jitterHz: number;
  readonly waveEm: number;
  readonly waveHz: number;
  readonly spacingEm: number;
  readonly scaleAmp: number;
  readonly scalePeriodS: number;
  readonly rotationDeg: number;
  readonly staggerMs: number;
  readonly letterOffsetEm: number;
  readonly opacityMin: number;
  readonly blurEm: number;
  readonly glow: number;
  readonly grain: number;
  readonly chromaticEm: number;
  readonly trail: number;
  readonly erode: number;
  readonly vanishS: number;
  readonly particles: number;
  readonly fracture: number;
  readonly sparkle: number;
  readonly flash: number;
  readonly audioGain: number;
  readonly oscHz: number;
  readonly oscColor: Rgb;
  readonly oscPhase: number;
  readonly oscJitterEm: number;
  readonly note: string;
  readonly strainGain: number;
  readonly releaseS: number;
  readonly residueLevel: number;
  readonly zeta: number;
  readonly isHero: boolean;
  readonly isBg: boolean;
  readonly tier: FxTier;
  readonly bleedDonorS: number;
  readonly bleedDonorEndS: number;
  readonly handoffOverlapS: number;
  readonly durationMode: FxDurationMode;
  readonly waveform: FxWaveform;
  readonly sigFreqHz: number;
  readonly sigAxis: FxSigAxis;
  readonly sigAmpEm: number;
  readonly fillTint: number;
  readonly fillEdgeSoftness: number;
  readonly glowSpread: number;
  readonly glowColor: Rgb | null;
  readonly particleKind: string;
  readonly sparkleStyle: string;
  readonly motif: string;
  readonly tintSpread: FxTintSpread;
  readonly scatterEm: number;
  readonly glitch: number;
  readonly shimmer: number;
  readonly glowGain: number;
  readonly streak: number;
  readonly variant: string;
}

export interface CarrierLetter {
  readonly fillP: number;
  readonly onsetS: number;
  readonly yEm: number;
  readonly scale: number;
  readonly glowA: number;
  readonly glowR: number;
  readonly xEm: number;
}

export interface CarrierWord {
  readonly letters: readonly CarrierLetter[];
  readonly fillFrontU: number;
  readonly lineAct: number;
  readonly lineOn: boolean;
  readonly lineOpacity: number;
  readonly lineBlurPx: number;
  readonly lineStartS: number;
  readonly lineEndS: number;
  readonly isBg: boolean;
}

export interface FxMatchMeta {
  readonly line: number;
  readonly word: number;
  readonly text: string;
  readonly lemma: string;
  readonly lang: string;
  readonly categories: readonly string[];
  readonly beginMs: number;
  readonly endMs: number;
  readonly score: number;
  readonly pair: number;
  readonly note: string;
  readonly ambiguity: number;
}

export interface FxWordEntry {
  readonly match: FxMatchMeta;
  readonly params: FxParams;
}

export interface FxPlanData {
  readonly words: Readonly<Record<string, FxWordEntry>>; // key: `${line}:${word}`
  readonly ambient: Readonly<Record<string, FxWordEntry>>;
  readonly bgWords: Readonly<Record<string, FxWordEntry>>;
  readonly intensity: number;
  readonly adaptBg: boolean;
  readonly rms: readonly number[];
  readonly rmsRate: number;
  readonly strain: readonly number[];
  readonly strainRate: number;
  readonly momentumSamples: readonly number[]; // flat N * 6 float samples
  readonly momentumRateHz: number;
  readonly audioOffsetMs: number;
}

export interface AudioStats {
  readonly durationMs: number;
  readonly tempoBpm: number;
  readonly energy: number;
  readonly brightness: number;
  readonly mode: number;
  readonly key: number;
  readonly strain: number;
  readonly strainCurve: Float32Array | null;
  readonly strainRate: number;
  readonly fromStem: boolean;
}
