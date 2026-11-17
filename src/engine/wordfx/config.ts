export interface FxConfig {
  readonly maxFxPerLine: number;
  readonly maxStrongPerLine: number;
  readonly lightScale: number;
  readonly variantWeights: Readonly<Record<string, number>>;

  readonly anticipationAmp: number;
  readonly accentMaxS: number;
  readonly heldMinS: number;
  readonly accentAmp: number;
  readonly heldAmpCap: number;
  readonly minReleaseS: number;
  readonly maxReleaseS: number;
  readonly minResidue: number;
  readonly maxResidue: number;
  readonly residueGain: number;
  readonly pastLineTint: number;

  readonly driftMaxEm: number;
  readonly waveMaxEm: number;
  readonly scaleAmpMax: number;
  readonly rotationMaxDeg: number;
  readonly offsetMaxEm: number;
  readonly offsetMaxHeldEm: number;

  readonly stretchAmt: number;
  readonly stretchS: number;
  readonly anticipationDipEm: number;

  readonly enterS: number;
  readonly erodeTail: number;
  readonly vanishS: number;
  readonly driftTailS: number;
  readonly echoHz: number;
  readonly gravity: number;

  readonly glowGain: number;
  readonly glowCoreWhite: number;
  readonly glowSigmas: readonly [number, number, number];
  readonly glowByCategory: Readonly<Record<string, number>>;
  readonly glowBuildStart: number;
  readonly glowBrightFloor: number;
  readonly glowAsc: number;
  readonly glowDesc: number;

  readonly streakThicknessPx: number;
  readonly streakOpacity: number;
  readonly streakFrontEm: number;
  readonly streakTrailEm: number;
  readonly streakDecay: number;
  readonly streakOvershootEm: number;
  readonly streakWhiteMix: number;
  readonly streakByCategory: Readonly<Record<string, number>>;
  readonly streakDefault: number;

  readonly ghosts: readonly (readonly [number, number])[];
  readonly fractureGap: number;
  readonly fractureRotDeg: number;
}

export const FX: FxConfig = {
  maxFxPerLine: 2,
  maxStrongPerLine: 1,
  lightScale: 0.55,
  variantWeights: {},

  anticipationAmp: 0.13,
  accentMaxS: 0.25,
  heldMinS: 0.7,
  accentAmp: 0.4,
  heldAmpCap: 1.85,
  minReleaseS: 0.4,
  maxReleaseS: 0.9,
  minResidue: 0.1,
  maxResidue: 0.25,
  residueGain: 0.0,
  pastLineTint: 0.0,

  driftMaxEm: 0.04,
  waveMaxEm: 0.035,
  scaleAmpMax: 0.06,
  rotationMaxDeg: 4.0,
  offsetMaxEm: 0.05,
  offsetMaxHeldEm: 0.08,

  stretchAmt: 0.03,
  stretchS: 0.18,
  anticipationDipEm: 0.02,

  enterS: 0.12,
  erodeTail: 0.4,
  vanishS: 1.0,
  driftTailS: 0.15,
  echoHz: 0.35,
  gravity: 1.2,

  glowGain: 1.25,
  glowCoreWhite: 0.5,
  glowSigmas: [0.085, 0.135, 0.215],
  glowByCategory: {
    celestial: 1.5,
    light: 1.5,
    fire: 1.4,
    electric: 1.45,
    joy: 1.35,
    love: 1.3,
    hope: 1.35,
    summer: 1.3,
    healing: 1.15,
    tenderness: 1.1,
    sadness: 0.85,
    loneliness: 0.8,
    shadow: 0.7,
    fear: 0.75,
    death: 0.7,
    numbness: 0.6,
    loss: 0.85,
  },
  glowBuildStart: 0.55,
  glowBrightFloor: 0.6,
  glowAsc: 1.0,
  glowDesc: 0.4,

  streakThicknessPx: 1.0,
  streakOpacity: 0.3,
  streakFrontEm: 0.3,
  streakTrailEm: 1.4,
  streakDecay: 2.2,
  streakOvershootEm: 0.15,
  streakWhiteMix: 0.85,
  streakByCategory: {
    celestial: 1.0,
    light: 1.0,
    electric: 1.0,
    fire: 0.85,
    love: 0.7,
    joy: 0.8,
    hope: 0.7,
    summer: 0.7,
    healing: 0.5,
    tenderness: 0.45,
    dream: 0.4,
    sadness: 0.15,
    fear: 0.0,
    shadow: 0.0,
    loneliness: 0.1,
  },
  streakDefault: 0.0,

  ghosts: [
    [0.12, 0.1],
    [0.08, 0.2],
    [0.04, 0.35],
  ],
  fractureGap: 0.08,
  fractureRotDeg: 4.0,
};
