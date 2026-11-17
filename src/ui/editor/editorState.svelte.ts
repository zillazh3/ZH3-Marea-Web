import { AudioMasterClock } from '@/features/audio/clock';
import { decodeAudioBytes, type DecodedAudio } from '@/features/audio/local';
import { demoLyrics } from '@/features/lyrics/demo';
import {
  applyPreset,
  capturePreset,
  defaultBackgroundFields,
  defaultFxSettings,
  presetSignature,
  type LookState,
  type PresetSection,
} from '@/features/presets/schema';
import type { PresetEntry } from '@/features/presets/builtins';
import {
  clipRangeMs,
  restoreEditorState,
  serializeEditorState,
  type AudioSourceMode,
} from '@/features/projects/editorLook';
import type { ClipProject } from '@/features/projects/project';
import { opfsAvailable, readFile, writeFile } from '@/features/storage/opfs';
import { toneFor } from '@/features/storage/meta';
import { presetStore } from '@/features/storage/presets';
import { projectStore } from '@/features/storage/projects';
import { PreviewClient } from '@/render/previewClient';
import { defaultStyle } from '@/render/style';
import { defaultParams } from '@/engine/params';
import { describeError } from '../errors';
import { i18n } from '../i18n.svelte';
import { library } from '../state/library.svelte';
import { player } from '../state/player.svelte';
import { session } from '../state/session.svelte';
import { notifications } from '../state/toasts.svelte';

export const PREVIEW_W = 540;
export const PREVIEW_H = 960;
const THUMB_W = 216;
const THUMB_H = 384;
const THUMB_T_MS = 12_500;
const SCRUB_THROTTLE_MS = 32;
const SAVE_DEBOUNCE_MS = 400;

function decodeBase64Bytes(b64: string): Uint8Array | null {
  if (!b64) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function systemReducesMotion(): boolean {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function formatTimecode(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSec = safe / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec - mins * 60;
  return `${String(mins)}:${secs.toFixed(1).padStart(4, '0')}`;
}

export class EditorController {
  first = $state(0);
  last = $state(0);
  anchor = $state(0);
  look = $state.raw<LookState>({
    style: defaultStyle(),
    params: defaultParams(),
    background: defaultBackgroundFields(),
    fx: defaultFxSettings(),
  });
  audioSource = $state<AudioSourceMode>('solo');
  appliedPreset = $state('');

  playing = $state(false);
  offsetMs = $state(0);
  durationMs = $state(1000);
  previewReady = $state(false);
  previewError = $state('');
  halfRate = $state(false);

  audio = $state.raw<DecodedAudio | null>(null);
  audioLoading = $state(false);
  audioMissing = $state(false);

  presets = $state.raw<PresetEntry[]>([]);
  thumbUrls = $state.raw<Record<string, string>>({});

  private project: ClipProject | null = null;
  private projectId: string | null = null;
  private lyricsSpec: {
    lines: ClipProject['lyrics']['lines'];
    credit?: string;
    writers?: readonly string[];
  } | null = null;
  private coverBytes: Uint8Array | null = null;
  private client: PreviewClient | null = null;
  private readonly audioClock = new AudioMasterClock();
  private audioRafId: number | null = null;
  private scrubTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingScrubMs: number | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private thumbTimer: ReturnType<typeof setTimeout> | null = null;
  private thumbToken = 0;
  private loadToken = 0;

  openProject(project: ClipProject, id: string | null): void {
    this.stopAudioPlayback();
    this.playing = false;
    this.project = project;
    this.projectId = id;
    this.lyricsSpec = {
      lines: project.lyrics.lines,
      credit: project.lyrics.credit,
      writers: project.lyrics.writers,
    };
    this.coverBytes = decodeBase64Bytes(project.coverPngB64);
    this.audio = null;
    this.audioMissing = false;
    this.audioLoading = false;

    const restored = restoreEditorState(project, systemReducesMotion());
    this.first = restored.first;
    this.last = restored.last;
    this.anchor = restored.first;
    this.look = restored.look;
    this.audioSource = restored.audioSource;
    this.appliedPreset = restored.preset;
    this.offsetMs = 0;
    const [r0, r1] = clipRangeMs(project, this.first, this.last);
    this.durationMs = Math.max(1, r1 - r0);

    player.load(
      {
        title: project.title || i18n.m.editor.untitled,
        artist: project.artist,
        tone: toneFor(project.title, project.artist),
      },
      { playing: false, progress: 0, onToggle: () => void this.togglePlaying() },
    );

    this.configureWorker();
    void this.refreshPresets();

    const token = ++this.loadToken;
    if (project.audioPath && id && opfsAvailable()) {
      this.audioLoading = true;
      void this.loadSavedAudio(id, project.audioPath, token);
    } else if (project.audioPath) {
      this.audioMissing = true;
    }
  }

  private async loadSavedAudio(id: string, pathName: string, token: number): Promise<void> {
    try {
      const file = await readFile(['audio'], id);
      if (token !== this.loadToken) return;
      if (!file) {
        this.audioLoading = false;
        this.audioMissing = true;
        return;
      }
      const decoded = await decodeAudioBytes(await file.arrayBuffer(), pathName);
      if (token !== this.loadToken) return;
      this.audio = decoded;
      this.audioMissing = false;
      this.audioClock.setAudio(decoded);
    } catch {
      if (token === this.loadToken) this.audioMissing = true;
    } finally {
      if (token === this.loadToken) this.audioLoading = false;
    }
  }

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.client?.dispose();
    this.previewReady = false;
    this.previewError = '';
    try {
      this.client = new PreviewClient(canvas, PREVIEW_W, PREVIEW_H, {
        onReady: () => {
          this.previewReady = true;
          this.configureWorker();
          this.scheduleMissingThumbs(800);
        },
        onError: (msg) => {
          this.previewError = msg;
        },
        onPosition: (pos) => {
          this.halfRate = pos.halfRate;
          if (!(this.playing && this.audioSource === 'local' && this.audio)) {
            this.offsetMs = pos.offsetMs;
            this.durationMs = pos.durationMs;
            player.setProgress(pos.offsetMs / Math.max(1, pos.durationMs));
          }
        },
      });
    } catch (err) {
      this.previewError = err instanceof Error ? err.message : 'Preview unavailable';
    }
  }

  private configureWorker(): void {
    if (!this.client || !this.previewReady || !this.project || !this.lyricsSpec) return;
    const [rangeStartMs, rangeEndMs] = clipRangeMs(this.project, this.first, this.last);
    this.durationMs = Math.max(1, rangeEndMs - rangeStartMs);
    this.client.configure({
      lyrics: this.lyricsSpec,
      coverBytes: this.coverBytes,
      demoCoverLabel:
        this.project.title === 'Marea de luz' && this.project.artist === 'Demo · letra original',
      params: this.look.params,
      style: this.look.style,
      rangeStartMs,
      rangeEndMs,
    });
  }

  private isAudioMaster(): boolean {
    return this.audioSource === 'local' && this.audio !== null;
  }

  async togglePlaying(): Promise<void> {
    if (!this.project || !this.previewReady) return;
    if (this.playing) {
      this.pausePlayback();
      return;
    }
    const [rangeStartMs, rangeEndMs] = clipRangeMs(this.project, this.first, this.last);
    this.cancelScheduledThumbs();
    this.playing = true;
    player.setPlaying(true);

    if (this.isAudioMaster() && this.audio) {
      await this.audioClock.play(
        this.audio,
        rangeStartMs,
        rangeEndMs,
        this.offsetMs,
        this.project.audioOffsetMs,
      );
      this.client?.setPlaying(true, 'audio', this.offsetMs);
      this.startAudioLoop();
    } else {
      this.client?.setPlaying(true, 'solo', this.offsetMs);
    }
  }

  pausePlayback(): void {
    if (!this.playing) return;
    this.playing = false;
    player.setPlaying(false);
    if (this.isAudioMaster()) {
      this.offsetMs = Math.min(this.durationMs, this.audioClock.pause());
    }
    this.stopAudioLoop();
    this.client?.setPlaying(false, this.isAudioMaster() ? 'audio' : 'solo', this.offsetMs);
    this.scheduleMissingThumbs(200);
  }

  private startAudioLoop(): void {
    this.stopAudioLoop();
    const tick = (): void => {
      if (!this.playing || !this.isAudioMaster() || !this.project || !this.audio) return;
      const pos = this.audioClock.currentClipOffsetMs();
      if (pos >= this.durationMs) {
        this.offsetMs = 0;
        const [r0, r1] = clipRangeMs(this.project, this.first, this.last);
        void this.audioClock.play(this.audio, r0, r1, 0, this.project.audioOffsetMs);
        this.client?.seek(0);
        player.setProgress(0);
      } else {
        this.offsetMs = pos;
        this.client?.sendAudioClock(pos);
        player.setProgress(pos / Math.max(1, this.durationMs));
      }
      this.audioRafId = requestAnimationFrame(tick);
    };
    this.audioRafId = requestAnimationFrame(tick);
  }

  private stopAudioLoop(): void {
    if (this.audioRafId !== null) {
      cancelAnimationFrame(this.audioRafId);
      this.audioRafId = null;
    }
  }

  private stopAudioPlayback(): void {
    this.stopAudioLoop();
    this.audioClock.pause();
  }

  scrubTo(nextOffsetMs: number): void {
    const clamped = Math.max(0, Math.min(this.durationMs, nextOffsetMs));
    this.offsetMs = clamped;
    player.setProgress(clamped / Math.max(1, this.durationMs));
    this.pendingScrubMs = clamped;
    this.scrubTimer ??= setTimeout(() => {
      this.scrubTimer = null;
      if (this.pendingScrubMs !== null) {
        this.client?.seek(this.pendingScrubMs);
        this.pendingScrubMs = null;
      }
    }, SCRUB_THROTTLE_MS);
  }

  flushScrub(nextOffsetMs: number): void {
    if (this.scrubTimer !== null) {
      clearTimeout(this.scrubTimer);
      this.scrubTimer = null;
    }
    this.pendingScrubMs = null;
    const clamped = Math.max(0, Math.min(this.durationMs, nextOffsetMs));
    this.offsetMs = clamped;
    player.setProgress(clamped / Math.max(1, this.durationMs));
    this.client?.seek(clamped);
    if (this.playing && this.isAudioMaster() && this.project && this.audio) {
      const [r0, r1] = clipRangeMs(this.project, this.first, this.last);
      void this.audioClock.play(this.audio, r0, r1, clamped, this.project.audioOffsetMs);
    }
  }

  selectVerse(row: number, shiftKey: boolean): void {
    if (!this.project) return;
    const n = this.project.lyrics.lines.length;
    if (row < 0 || row >= n) return;
    if (shiftKey) {
      this.first = Math.min(this.anchor, row);
      this.last = Math.max(this.anchor, row);
    } else {
      this.anchor = row;
      this.first = row;
      this.last = row;
    }
    this.onRangeChanged(true);
  }

  setVerseRange(first: number, last: number): void {
    if (!this.project) return;
    const n = this.project.lyrics.lines.length;
    if (n <= 0) return;
    const lo = Math.max(0, Math.min(n - 1, Math.trunc(Math.min(first, last))));
    const hi = Math.max(lo, Math.min(n - 1, Math.trunc(Math.max(first, last))));
    if (lo === this.first && hi === this.last) return;
    this.first = lo;
    this.last = hi;
    this.onRangeChanged(true);
  }

  extendVerseRange(deltaStart: number, deltaEnd: number): void {
    if (!this.project) return;
    const n = this.project.lyrics.lines.length;
    const nextFirst = Math.max(0, Math.min(this.last, this.first + deltaStart));
    const nextLast = Math.max(nextFirst, Math.min(n - 1, this.last + deltaEnd));
    if (nextFirst === this.first && nextLast === this.last) return;
    this.first = nextFirst;
    this.last = nextLast;
    this.onRangeChanged(true);
  }

  playFromVerse(row: number): void {
    if (!this.project) return;
    if (row < this.first || row > this.last) return;
    const line = this.project.lyrics.lines[row];
    if (!line) return;
    const [r0] = clipRangeMs(this.project, this.first, this.last);
    this.flushScrub(Math.max(0, line.start - r0));
    if (!this.playing) void this.togglePlaying();
  }

  private onRangeChanged(seekToStart: boolean): void {
    if (!this.project) return;
    const [r0, r1] = clipRangeMs(this.project, this.first, this.last);
    this.durationMs = Math.max(1, r1 - r0);
    if (seekToStart) this.offsetMs = 0;
    this.client?.setRange(r0, r1, seekToStart);
    if (this.playing && this.isAudioMaster() && this.audio) {
      void this.audioClock.play(this.audio, r0, r1, this.offsetMs, this.project.audioOffsetMs);
    }
    this.markDirty();
  }

  updateLook(patch: Partial<LookState>): void {
    this.look = { ...this.look, ...patch };
    this.configureWorker();
    this.markDirty();
  }

  updateMetadata(title: string, artist: string): void {
    if (!this.project) return;
    this.project.title = title;
    this.project.artist = artist;
    this.look = {
      ...this.look,
      style: { ...this.look.style, title, artist },
    };
    player.load(
      {
        title: title || i18n.m.editor.untitled,
        artist,
        tone: toneFor(title, artist),
      },
      {
        playing: this.playing,
        progress: this.offsetMs / Math.max(1, this.durationMs),
        onToggle: () => void this.togglePlaying(),
      },
    );
    this.configureWorker();
    this.markDirty();
  }

  async setCoverFile(file: File): Promise<void> {
    if (!this.project) return;
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(file);
    } catch {
      notifications.show(i18n.m.editor.background.badCover, 'error');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      notifications.show(i18n.m.editor.background.badCover, 'error');
      return;
    }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const pngBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (!pngBlob) {
      notifications.show(i18n.m.editor.background.badCover, 'error');
      return;
    }
    const bytes = new Uint8Array(await pngBlob.arrayBuffer());
    let bin = '';
    for (const byte of bytes) bin += String.fromCharCode(byte);
    this.project.coverPngB64 = btoa(bin);
    this.coverBytes = bytes;
    this.configureWorker();
    this.markDirty();
  }

  setAudioSource(mode: AudioSourceMode): void {
    if (this.audioSource === mode) return;
    const wasPlaying = this.playing;
    if (wasPlaying) this.pausePlayback();
    this.audioSource = mode;
    this.markDirty();
    if (wasPlaying) void this.togglePlaying();
  }

  async setAudioFile(file: File): Promise<void> {
    if (!this.project) return;
    const wasPlaying = this.playing;
    if (wasPlaying) this.pausePlayback();
    this.audioLoading = true;
    this.audioMissing = false;
    try {
      const buf = await file.arrayBuffer();
      const decoded = await decodeAudioBytes(buf, file.name);
      if (this.projectId && opfsAvailable()) {
        await writeFile(['audio'], this.projectId, file);
      }
      this.project.audioPath = file.name;
      this.project.audioOffsetMs = 0;
      this.audio = decoded;
      this.audioSource = 'local';
      this.audioClock.setAudio(decoded);
      this.markDirty();
    } catch (error) {
      notifications.show(describeError(i18n.m, error), 'error');
    } finally {
      this.audioLoading = false;
    }
  }

  setAudioOffset(offsetMs: number): void {
    if (!this.project) return;
    this.project.audioOffsetMs = offsetMs;
    this.audioClock.updateOffset(offsetMs);
    this.markDirty();
  }

  applyCorriente(entry: PresetEntry, sections: readonly PresetSection[]): void {
    const nextLook = applyPreset(entry.preset, this.look, sections);
    this.appliedPreset = entry.name;
    this.look = nextLook;
    this.configureWorker();
    this.markDirty();
    if (entry.missingFont) {
      notifications.show(i18n.m.editor.style.missingFont(entry.missingFont), 'info');
    }
  }

  captureCurrentPreset(name: string, description = '') {
    return capturePreset(this.look, name, description);
  }

  async refreshPresets(): Promise<void> {
    this.presets = await presetStore.list();
    this.scheduleMissingThumbs(100);
  }

  private cancelScheduledThumbs(): void {
    this.thumbToken += 1;
    if (this.thumbTimer !== null) {
      clearTimeout(this.thumbTimer);
      this.thumbTimer = null;
    }
  }

  private scheduleMissingThumbs(delayMs: number): void {
    if (this.playing || !this.client || !this.previewReady) return;
    if (this.thumbTimer !== null) clearTimeout(this.thumbTimer);
    this.thumbTimer = setTimeout(() => {
      this.thumbTimer = null;
      if (!this.playing) void this.renderMissingThumbs();
    }, delayMs);
  }

  private shouldStopThumbs(token: number): boolean {
    return token !== this.thumbToken || this.playing;
  }

  private async renderMissingThumbs(): Promise<void> {
    if (!this.client || !this.previewReady || this.presets.length === 0 || this.playing) return;
    const token = ++this.thumbToken;
    const lyrics = demoLyrics();
    const urls: Record<string, string> = { ...this.thumbUrls };

    for (const entry of this.presets) {
      if (this.shouldStopThumbs(token)) return;
      if (urls[entry.name]) continue;
      const sig = await presetSignature(entry.preset);
      let png = await presetStore.getThumb(sig);
      if (!png) {
        if (this.shouldStopThumbs(token)) return;
        const applied = applyPreset(entry.preset, {
          style: { ...defaultStyle(), title: 'Marea de luz', artist: 'Demo', wmText: '' },
          params: defaultParams(),
          background: defaultBackgroundFields(),
          fx: defaultFxSettings(),
        });
        try {
          png = await this.client.renderThumb({
            id: `${entry.name}-${sig}`,
            lyrics,
            params: applied.params,
            style: applied.style,
            width: THUMB_W,
            height: THUMB_H,
            tMs: THUMB_T_MS,
          });
          await presetStore.putThumb(sig, png);
        } catch {
          continue;
        }
        // Yield briefly between uncached thumbnails so playback/scrub interactions win the worker.
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (this.shouldStopThumbs(token)) return;
      urls[entry.name] = URL.createObjectURL(new Blob([png.slice().buffer], { type: 'image/png' }));
      this.thumbUrls = { ...urls };
    }
  }

  private markDirty(): void {
    if (!this.project) return;
    this.project.editor = serializeEditorState(this.project.editor, {
      first: this.first,
      last: this.last,
      look: this.look,
      audioSource: this.audioSource,
      preset: this.appliedPreset,
    });
    if (!this.projectId) return;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    const id = this.projectId;
    const proj = this.project;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void projectStore.save(proj, id).then(() => library.refresh());
    }, SAVE_DEBOUNCE_MS);
  }

  dispose(): void {
    this.loadToken += 1;
    this.cancelScheduledThumbs();
    this.stopAudioPlayback();
    if (this.scrubTimer !== null) {
      clearTimeout(this.scrubTimer);
      this.scrubTimer = null;
    }
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.client?.dispose();
    this.client = null;
    this.audioClock.dispose();
    for (const url of Object.values(this.thumbUrls)) URL.revokeObjectURL(url);
    this.thumbUrls = {};
    player.clearHandler();
    if (session.id === this.projectId && this.playing) {
      player.setPlaying(false);
    }
  }
}
