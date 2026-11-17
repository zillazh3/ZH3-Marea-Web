import { describe, expect, it } from 'vitest';
import { analyzeAudio, onsetEnvelope, toMono } from '@/features/audio/analysis';
import { analyzeAudioStats } from '@/features/wordfx/audiofeat';
import fixture from '../fixtures/audio/analysis.json';

function makeTestStereo(rate: number, seconds: number) {
  const n = Math.round(rate * seconds);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const beatPhase = t % 0.5;
    const kick = Math.exp(-beatPhase * 28.0);
    const env = t >= 2.1 && t <= 3.0 ? 0.04 : t > 3.1 ? 0.78 : 0.42;
    const melody =
      0.35 * Math.sin(2 * Math.PI * 440.0 * t) +
      0.25 * Math.sin(2 * Math.PI * 554.37 * t) +
      0.2 * Math.sin(2 * Math.PI * 659.25 * t);
    const hf =
      (t > 3.1 ? 0.35 : 0.08) * Math.sin(2 * Math.PI * 3100.0 * t) +
      (t > 3.1 ? 0.2 : 0.04) * Math.sin(2 * Math.PI * 4700.0 * t);
    const s = env * (melody + hf + 0.5 * kick * Math.sin(2 * Math.PI * 1200.0 * beatPhase));
    left[i] = s;
    right[i] = s * 0.92;
  }
  return { fileName: 'fixture.wav', sampleRate: rate, left, right, durationMs: seconds * 1000 };
}

describe('audio analysis parity (T8.1)', () => {
  const audio = makeTestStereo(fixture.rate, fixture.seconds);
  const mono = toMono(audio);
  const env = onsetEnvelope(mono, fixture.rate);
  const ana = analyzeAudio(audio, fixture.rate);
  const stats = analyzeAudioStats(audio, fixture.rate, ana);

  it('matches onset envelope samples from desktop align.onset_envelope', () => {
    expect(env.rate).toBe(fixture.onsetRate);
    expect(env.flux.length).toBe(fixture.onsetLen);
    for (let k = 0; k < fixture.onsetSamples.length; k += 1) {
      const idx = k * 25;
      expect(env.flux[idx] ?? 0).toBeCloseTo(fixture.onsetSamples[k] ?? 0, 3);
    }
  });

  it('matches analyze_audio tempo, beats, pauses, accents, rms, and contrast curves', () => {
    expect(ana.rate).toBe(fixture.analysis.rate);
    expect(ana.durationMs).toBeCloseTo(fixture.analysis.durationMs, 3);
    expect(ana.tempoBpm).toBeCloseTo(fixture.analysis.tempoBpm, 2);
    expect(ana.beatPeriodMs).toBeCloseTo(fixture.analysis.beatPeriodMs, 2);
    expect(ana.beatsMs.length).toBe(fixture.analysis.beatsMs.length);
    for (let i = 0; i < fixture.analysis.beatsMs.length; i += 1) {
      expect(ana.beatsMs[i] ?? 0).toBeCloseTo(fixture.analysis.beatsMs[i] ?? 0, 3);
    }
    expect(ana.pausesMs.length).toBe(fixture.analysis.pausesMs.length);
    const pausesExpected: readonly [number, number][] = fixture.analysis.pausesMs;
    for (let i = 0; i < pausesExpected.length; i += 1) {
      expect(ana.pausesMs[i]?.[0] ?? 0).toBeCloseTo(pausesExpected[i]?.[0] ?? 0, 3);
      expect(ana.pausesMs[i]?.[1] ?? 0).toBeCloseTo(pausesExpected[i]?.[1] ?? 0, 3);
    }
    expect(ana.accentsMs.length).toBe(fixture.analysis.accentsMs.length);
    for (let i = 0; i < fixture.analysis.accentsMs.length; i += 1) {
      expect(ana.accentsMs[i]?.[0] ?? 0).toBeCloseTo(fixture.analysis.accentsMs[i]?.[0] ?? 0, 3);
      expect(ana.accentsMs[i]?.[1] ?? 0).toBeCloseTo(fixture.analysis.accentsMs[i]?.[1] ?? 0, 3);
    }
    expect(ana.rms.length).toBe(fixture.analysis.rmsLen);
    for (let k = 0; k < fixture.analysis.rmsSamples.length; k += 1) {
      const idx = k * 25;
      expect(ana.rms[idx] ?? 0).toBeCloseTo(fixture.analysis.rmsSamples[k] ?? 0, 4);
      expect(ana.contrast[idx] ?? 0).toBeCloseTo(fixture.analysis.contrastSamples[k] ?? 0, 4);
      expect(ana.macroContrast[idx] ?? 0).toBeCloseTo(
        fixture.analysis.macroContrastSamples[k] ?? 0,
        4,
      );
    }
  });

  it('matches wordfx audiofeat AudioStats (key, mode, brightness, energy, strain curve)', () => {
    expect(stats.tempoBpm).toBeCloseTo(fixture.wordfxStats.tempoBpm, 2);
    expect(stats.energy).toBeCloseTo(fixture.wordfxStats.energy, 4);
    expect(stats.brightness).toBeCloseTo(fixture.wordfxStats.brightness, 4);
    expect(stats.key).toBe(fixture.wordfxStats.key);
    expect(stats.mode).toBeCloseTo(fixture.wordfxStats.mode, 4);
    expect(stats.strain).toBeCloseTo(fixture.wordfxStats.strain, 4);
    expect(stats.strainRate).toBe(fixture.wordfxStats.strainRate);
    expect(stats.strainCurve?.length ?? 0).toBe(fixture.wordfxStats.strainLen);
    for (let k = 0; k < fixture.wordfxStats.strainSamples.length; k += 1) {
      const idx = k * 15;
      expect(stats.strainCurve?.[idx] ?? 0).toBeCloseTo(
        fixture.wordfxStats.strainSamples[k] ?? 0,
        4,
      );
    }
  });
});
