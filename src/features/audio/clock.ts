import { AUDIO_RATE, type DecodedAudio } from './local';

/**
 * Web Audio playback engine that acts as the master clock during preview playback.
 */
export class AudioMasterClock {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private cachedAudio: DecodedAudio | null = null;
  private source: AudioBufferSourceNode | null = null;

  private playing = false;
  private startCtxTimeS = 0;
  private startClipOffsetMs = 0;
  private rangeStartMs = 0;
  private rangeEndMs = 1000;

  private ensureContext(): AudioContext {
    this.ctx ??= new AudioContext({ sampleRate: AUDIO_RATE });
    return this.ctx;
  }

  private ensureBuffer(audio: DecodedAudio): AudioBuffer {
    if (this.buffer && this.cachedAudio === audio) return this.buffer;
    const ctx = this.ensureContext();
    const buf = ctx.createBuffer(2, audio.left.length, AUDIO_RATE);
    buf.copyToChannel(new Float32Array(audio.left), 0);
    buf.copyToChannel(new Float32Array(audio.right), 1);
    this.buffer = buf;
    this.cachedAudio = audio;
    return buf;
  }

  setAudio(audio: DecodedAudio | null): void {
    if (audio === this.cachedAudio) return;
    this.stopSource();
    this.cachedAudio = audio;
    this.buffer = null;
  }

  async play(
    audio: DecodedAudio,
    rangeStartMs: number,
    rangeEndMs: number,
    clipOffsetMs: number,
    audioOffsetMs: number,
  ): Promise<void> {
    this.stopSource();
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const buffer = this.ensureBuffer(audio);
    this.rangeStartMs = rangeStartMs;
    this.rangeEndMs = Math.max(rangeStartMs + 1, rangeEndMs);
    this.startClipOffsetMs = clipOffsetMs;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const filePosS = (rangeStartMs + clipOffsetMs + audioOffsetMs) / 1000;
    const now = ctx.currentTime;
    this.startCtxTimeS = now;
    this.source = src;
    this.playing = true;

    if (filePosS < 0) {
      src.start(now - filePosS, 0);
    } else if (filePosS < buffer.duration) {
      src.start(now, filePosS);
    }
  }

  updateOffset(audioOffsetMs: number): void {
    if (!this.playing || !this.cachedAudio) {
      return;
    }
    const pos = this.currentClipOffsetMs();
    void this.play(this.cachedAudio, this.rangeStartMs, this.rangeEndMs, pos, audioOffsetMs);
  }

  currentClipOffsetMs(): number {
    if (!this.playing || !this.ctx) return this.startClipOffsetMs;
    const elapsedMs = (this.ctx.currentTime - this.startCtxTimeS) * 1000;
    return Math.max(0, this.startClipOffsetMs + elapsedMs);
  }

  pause(): number {
    const pos = this.currentClipOffsetMs();
    this.stopSource();
    this.startClipOffsetMs = pos;
    return pos;
  }

  private stopSource(): void {
    this.playing = false;
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // Ignore if source already ended or never started.
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  dispose(): void {
    this.stopSource();
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
    this.buffer = null;
    this.cachedAudio = null;
  }
}
