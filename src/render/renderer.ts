import type { CanvasKit, Image, Surface } from 'canvaskit-wasm';
import type { Params } from '@/engine/params';
import type { FxPlanData, Rgb } from '@/engine/wordfx/fxtypes';
import { isCoverSizeAllowed } from '@/shared/imageSize';
import { createDemoCover } from './cover';
import { dominantColors } from './palette';
import { Scene, type LyricsWithCredit } from './scene';
import type { Style } from './style';
import type { Fonts } from './text';

export interface SceneSpec {
  readonly lyrics: LyricsWithCredit;
  readonly coverBytes: Uint8Array | null;
  readonly demoCoverLabel: boolean;
  readonly width: number;
  readonly height: number;
  readonly params: Params;
  readonly style: Style;
  readonly clipStartMs: number | null;
  readonly fxPlan?: FxPlanData | null;
  readonly fxDebug?: boolean;
}

export interface FrameRenderer {
  configure(spec: SceneSpec): void;
  seek(tMs: number): void;
  step(dt: number, running?: boolean): void;
  drawFrame(surface: Surface): void;
  isSettled(): boolean;
  currentTimeMs(): number;
  dispose(): void;
}

function decodeCover(
  ck: CanvasKit,
  fonts: Fonts,
  coverBytes: Uint8Array | null,
  demoLabel: boolean,
): Image {
  if (coverBytes && coverBytes.byteLength > 0 && isCoverSizeAllowed(coverBytes)) {
    const decoded = ck.MakeImageFromEncoded(coverBytes);
    if (decoded) return decoded;
  }
  return createDemoCover(ck, fonts, 600, demoLabel);
}

function sameBytes(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameLyrics(a: LyricsWithCredit, b: LyricsWithCredit): boolean {
  return a === b || (a.lines === b.lines && a.credit === b.credit && a.writers === b.writers);
}

/**
 * Stateful CanvasKit renderer behind a narrow `drawFrame` interface (ADR 0003).
 * Shared by the live preview worker and future offline export.
 */
export class CanvasKitRenderer implements FrameRenderer {
  private readonly ck: CanvasKit;
  private readonly fonts: Fonts;
  private scene: Scene | null = null;
  private coverImage: Image | null = null;
  private lastSpec: SceneSpec | null = null;
  private disposed = false;

  constructor(ck: CanvasKit, fonts: Fonts) {
    this.ck = ck;
    this.fonts = fonts;
  }

  configure(spec: SceneSpec): void {
    const prev = this.lastSpec;
    const needsCover =
      !prev ||
      !sameBytes(prev.coverBytes, spec.coverBytes) ||
      prev.demoCoverLabel !== spec.demoCoverLabel;
    const needsScene =
      !this.scene ||
      !prev ||
      needsCover ||
      !sameLyrics(prev.lyrics, spec.lyrics) ||
      prev.width !== spec.width ||
      prev.height !== spec.height ||
      prev.style.fontFrac !== spec.style.fontFrac ||
      prev.style.credit !== spec.style.credit;

    if (needsScene) {
      const offsetMs = this.scene ? this.scene.engine.t * 1000 : null;
      this.scene?.dispose();
      this.scene = null;
      if (needsCover || !this.coverImage) {
        this.coverImage?.delete();
        this.coverImage = decodeCover(this.ck, this.fonts, spec.coverBytes, spec.demoCoverLabel);
      }
      this.scene = new Scene(
        this.ck,
        this.fonts,
        spec.lyrics,
        this.coverImage,
        spec.width,
        spec.height,
        spec.params,
        spec.style,
        spec.fxPlan ?? null,
        spec.fxDebug ?? false,
      );
      this.scene.clipStartMs = spec.clipStartMs;
      if (offsetMs !== null) this.scene.engine.warmup(offsetMs);
    } else if (this.scene) {
      this.scene.updateStyle(spec.style);
      Object.assign(this.scene.engine.params, spec.params);
      this.scene.engine.reconfigure();
      this.scene.setWordfx(spec.fxPlan ?? null, spec.fxDebug ?? false);
      this.scene.clipStartMs = spec.clipStartMs;
    }

    this.lastSpec = spec;
  }

  /** Extracts up to `k` dominant colors from the currently active cover image. */
  coverPalette(k = 5): Rgb[] {
    return this.coverImage ? dominantColors(this.ck, this.coverImage, k) : [];
  }

  seek(tMs: number): void {
    this.scene?.engine.warmup(tMs);
  }

  step(dt: number, running = true): void {
    this.scene?.engine.advance(dt, running);
  }

  drawFrame(surface: Surface): void {
    if (!this.scene) return;
    this.scene.render(surface.getCanvas());
    surface.flush();
  }

  isSettled(): boolean {
    return this.scene ? this.scene.engine.isSettled() : true;
  }

  currentTimeMs(): number {
    return this.scene ? this.scene.engine.t * 1000 : 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene?.dispose();
    this.scene = null;
    this.coverImage?.delete();
    this.coverImage = null;
  }
}

/** Renders a single settled frame to PNG bytes on an offscreen CanvasKit surface. */
export function renderSnapshotPng(
  ck: CanvasKit,
  fonts: Fonts,
  spec: SceneSpec,
  tMs: number,
): Uint8Array {
  const surface = ck.MakeSurface(spec.width, spec.height);
  if (!surface) throw new Error('CanvasKit failed to create snapshot surface.');
  const renderer = new CanvasKitRenderer(ck, fonts);
  try {
    renderer.configure(spec);
    renderer.seek(tMs);
    renderer.drawFrame(surface);
    const snapshot = surface.makeImageSnapshot();
    try {
      const encoded = snapshot.encodeToBytes();
      if (!encoded) throw new Error('CanvasKit failed to encode snapshot PNG.');
      return encoded;
    } finally {
      snapshot.delete();
    }
  } finally {
    renderer.dispose();
    surface.dispose();
  }
}
