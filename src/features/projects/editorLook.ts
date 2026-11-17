import { defaultParams, type Params } from '@/engine/params';
import {
  applyPreset,
  capturePreset,
  defaultBackgroundFields,
  defaultFxSettings,
  presetFromEditorState,
  type FxSettings,
  type LookState,
} from '@/features/presets/schema';
import { defaultStyle, type Style } from '@/render/style';
import { isRecord, type JsonObject } from '@/shared/json';
import type { ClipProject } from './project';

export type AudioSourceMode = 'solo' | 'local';

export const DEFAULT_VERSES = 6;
export const CLIP_TAIL_MS = 500;

export interface RestoredEditorState {
  readonly first: number;
  readonly last: number;
  readonly look: LookState;
  readonly audioSource: AudioSourceMode;
  readonly preset: string;
}

export function clampVerseRange(first: number, last: number, lineCount: number): [number, number] {
  if (lineCount <= 0) return [0, 0];
  const f = Math.max(0, Math.min(lineCount - 1, Math.trunc(first)));
  const l = Math.max(f, Math.min(lineCount - 1, Math.trunc(last)));
  return [f, l];
}

export function clipRangeMs(
  project: Pick<ClipProject, 'lyrics'>,
  first: number,
  last: number,
): [number, number] {
  const lines = project.lyrics.lines;
  const [f, l] = clampVerseRange(first, last, lines.length);
  const slice = lines.slice(f, l + 1);
  const head = slice[0];
  if (!head) return [0, CLIP_TAIL_MS];
  const maxEnd = slice.reduce((acc, line) => Math.max(acc, line.end), head.end);
  return [head.start, Math.max(head.start + 1, maxEnd + CLIP_TAIL_MS)];
}

export function restoreEditorState(
  project: ClipProject,
  systemReduceMotion: boolean,
): RestoredEditorState {
  const n = project.lyrics.lines.length;
  const ed = project.editor;
  const defFirst = 0;
  const defLast = Math.max(0, Math.min(n - 1, DEFAULT_VERSES - 1));
  const rawFirst = typeof ed.first === 'number' && Number.isFinite(ed.first) ? ed.first : defFirst;
  const rawLast = typeof ed.last === 'number' && Number.isFinite(ed.last) ? ed.last : defLast;
  const [first, last] = clampVerseRange(rawFirst, rawLast, n);

  const baseStyle: Style = {
    ...defaultStyle(),
    title: project.title,
    artist: project.artist,
  };
  const baseParams: Params = {
    ...defaultParams(),
    reduce: systemReduceMotion,
  };
  const baseBg: JsonObject = { ...defaultBackgroundFields(), ...project.background };
  const baseFx: FxSettings = defaultFxSettings();

  const partial = presetFromEditorState(ed);
  const look = applyPreset(partial, {
    style: baseStyle,
    params: baseParams,
    background: baseBg,
    fx: baseFx,
  });

  if (isRecord(ed.style) && typeof ed.style.credit === 'boolean') {
    look.style.credit = ed.style.credit;
  }
  if (isRecord(ed.params)) {
    if (typeof ed.params.align === 'number' && Number.isFinite(ed.params.align)) {
      look.params.align = Math.max(0.1, Math.min(0.9, ed.params.align));
    }
    if (typeof ed.params.stagger === 'number' && Number.isFinite(ed.params.stagger)) {
      look.params.stagger = Math.max(0, Math.min(200, ed.params.stagger));
    }
    if (typeof ed.params.float === 'boolean') look.params.float = ed.params.float;
    if (typeof ed.params.scale === 'boolean') look.params.scale = ed.params.scale;
    if (typeof ed.params.reduce === 'boolean') look.params.reduce = ed.params.reduce;
  }

  const rawAudioSrc = ed.audio_source;
  const audioSource: AudioSourceMode =
    rawAudioSrc === 'local' || rawAudioSrc === 'file' || project.audioPath !== ''
      ? 'local'
      : 'solo';

  const preset = typeof ed.preset === 'string' ? ed.preset : '';
  return { first, last, look, audioSource, preset };
}

/** Writes editor look back into `project.editor` (desktop snake_case) while preserving unknown keys. */
export function serializeEditorState(
  existingEditor: JsonObject,
  state: RestoredEditorState,
): JsonObject {
  const captured = capturePreset(state.look);
  const existingFx = isRecord(existingEditor.fx) ? existingEditor.fx : {};
  return {
    ...existingEditor,
    first: state.first,
    last: state.last,
    style: {
      font_frac: state.look.style.fontFrac,
      bloom: state.look.style.bloom,
      title: state.look.style.title,
      artist: state.look.style.artist,
      font_family: state.look.style.fontFamily,
      wm_text: state.look.style.wmText,
      wm_side: state.look.style.wmSide,
      wm_glyph: state.look.style.wmGlyph,
      credit: state.look.style.credit,
      text_rgb: [...state.look.style.textRgb],
      glow_rgb: state.look.style.glowRgb ? [...state.look.style.glowRgb] : null,
      glow_gain: state.look.style.glowGain,
      bloom_gain: state.look.style.bloomGain,
      dim_alpha: state.look.style.dimAlpha,
      wm_alpha: state.look.style.wmAlpha,
      bg_blur: state.look.style.bgBlur,
      bg_veil: state.look.style.bgVeil,
      bg_sat: state.look.style.bgSat,
      bg_speed: state.look.style.bgSpeed,
    },
    params: {
      align: state.look.params.align,
      stagger: state.look.params.stagger,
      blurm: state.look.params.blurm,
      float: state.look.params.float,
      emph: state.look.params.emph,
      scale: state.look.params.scale,
      vib: state.look.params.vib,
      wob: state.look.params.wob,
      motion: state.look.params.motion,
      motion_amt: state.look.params.motionAmt,
      reduce: state.look.params.reduce,
    },
    audio_source: state.audioSource,
    fx: {
      ...existingFx,
      fx_intensity: captured.efectos.fx_intensity,
      adapt_bg: captured.efectos.adapt_bg,
    },
    preset: state.preset,
  };
}
