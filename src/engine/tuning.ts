// Every look-and-feel knob of the lyric renderer, mirroring marea/engine/tuning.py. The engine, the scene and the wordfx
// renderer all read TUNING, so this file imports nothing. Lengths are design px (a 42 px letter) or em unless stated.
// The desktop's `jump_log_em` diagnostic is not ported: the web build has no log to feed.

export const TUNING = {
  // ---- timing ----
  /** Seconds before its sung onset that a line becomes active and a hero word reacts. */
  anticipationS: 0.05,

  // ---- scroll (spring physics per line) ----
  /** Delay between consecutive lines following the active one: the cascade. */
  staggerMs: 50,
  /** Each line below the active one waits this much less than the previous. */
  staggerDecay: 1.05,
  scrollKBase: 170,
  /** Extra stiffness when the next line follows quickly. */
  scrollKRange: 50,
  scrollDamping: 2.2,
  /** Stiffness and damping after a seek or over an interlude. */
  scrollSeekK: 90,
  scrollSeekC: 15,

  // ---- active vs inactive lines ----
  inactiveScale: 0.97,
  lineScaleK: 100,
  lineScaleC: 12,
  activeOpacity: 0.85,
  dimAlpha: 0.2,
  unsungAlphaActive: 0.4,
  blurPerLine: 1,
  blurMax: 5,

  // ---- per-syllable motion ----
  liftGain: 1.4,
  letterLiftGain: 1,
  sustainScale: 1,
  sustainLift: 2,
  sustainGlow: 0.6,

  // ---- glow ----
  glowAlpha: 0.44,
  glowRadius: 4,
  glowRadiusGain: 3,
  emphGlowAlpha: 1.27,
  emphGlowRadius: 4,
  emphGlowRadiusGain: 12,
  glowPeakAt: 0.85,
  glowEndLevel: 0.7,
  glowWhiteMix: 0.6,
  bloomGain: 1.25,
  glowPadEm: 0.8,

  // ---- stability ----
  /** Seconds a line that left the active neighbourhood keeps animating, so its bounce, glow and wave ease to rest. */
  tailSettleS: 1.5,
} as const;
