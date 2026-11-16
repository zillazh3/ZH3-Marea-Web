import type { Lyrics } from '@/features/lyrics/model';
import type { JsonObject } from '@/shared/json';

export const PROJECT_SCHEMA = 'marea.project';
export const PROJECT_VERSION = 1;

/** The Spotify track a project came from (same fields as the desktop's). */
export interface Track {
  id: string;
  title: string;
  artists: string[];
  album: string;
  durationMs: number;
  coverUrl: string | null;
  uri: string;
}

/**
 * A clip project: the lyrics, the song's data, its cover and the editor's state. Blocks the web editor does not interpret yet
 * (`cinematic`, `background`, `editor`) and unknown top-level keys travel as they came, so a desktop project survives a round trip.
 */
export interface ClipProject {
  title: string;
  artist: string;
  /** PNG, base64; empty when there is no cover (the desktop then draws a filler). */
  coverPngB64: string;
  /** Name of the file the lyrics were opened from, if any. */
  source: string;
  track: Track | null;
  /** Name of the user's audio file; the bytes live in the browser's storage. */
  audioPath: string;
  /** Positive: the file's audio runs late relative to the lyrics. */
  audioOffsetMs: number;
  lyrics: Lyrics;
  cinematic: JsonObject;
  background: JsonObject;
  editor: JsonObject;
  /** Top-level keys this version does not know. */
  extra: JsonObject;
}

// Defaults written by the desktop (`to_dict` of an untouched config), so a new web project opens there without surprises.
export const DEFAULT_BACKGROUND: JsonObject = {
  schema: 'marea.background',
  version: 1,
  source: 'cover',
  video: null,
  video_size: 0,
  video_mtime_ns: 0,
  trim_in_ms: 0,
  trim_out_ms: 0,
  offset_ms: 0,
  loop: 'repeat',
  fit: 'cover',
  zoom: 1,
  pan_x: 0,
  pan_y: 0,
  dim: 0.25,
  blur: 0,
  saturation: 1,
  scrim: 0,
  cover_tint: 0,
};

export const DEFAULT_CINEMATIC: JsonObject = {
  schema: 'marea.cinematic',
  version: 1,
  enabled: false,
  primary_video_id: '',
  opening_trim_ms: 0,
  auto_opening_trim: true,
  default_treatment: {
    opacity: 1,
    blur: 0.35,
    vignette: 0.45,
    grain: 0.08,
    saturation: 0.82,
    contrast: 0.92,
    dim: 0.32,
  },
  resources: {},
  intervals: [],
};

export function newProject(
  fields: Pick<ClipProject, 'title' | 'artist' | 'lyrics'> & Partial<ClipProject>,
): ClipProject {
  return {
    coverPngB64: '',
    source: '',
    track: null,
    audioPath: '',
    audioOffsetMs: 0,
    cinematic: structuredClone(DEFAULT_CINEMATIC),
    background: structuredClone(DEFAULT_BACKGROUND),
    editor: {},
    extra: {},
    ...fields,
  };
}
