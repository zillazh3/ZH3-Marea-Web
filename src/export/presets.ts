export const EXPORT_FPS = 60;
export const EXPORT_PREROLL_MS = 3000;
export const EXPORT_AUDIO_RATE = 48_000;
export const EXPORT_OUTROS_MS = [500, 2000, 4000, 8000] as const;
export const EXPORT_MODES = ['lyrics', 'song', 'full'] as const;
export const EXPORT_MARKERS = ['none', 'flash', 'beep'] as const;

export type ExportMode = (typeof EXPORT_MODES)[number];
export type ExportMarker = (typeof EXPORT_MARKERS)[number];
export type ExportOutroMs = (typeof EXPORT_OUTROS_MS)[number];
export type ExportFormatId = 'tiktok' | 'square' | 'wide';

export interface ExportPresetSpec {
  readonly id: ExportFormatId;
  readonly width: number;
  readonly height: number;
}

export const EXPORT_PRESETS: Record<ExportFormatId, ExportPresetSpec> = {
  tiktok: { id: 'tiktok', width: 1080, height: 1920 },
  square: { id: 'square', width: 1080, height: 1080 },
  wide: { id: 'wide', width: 1920, height: 1080 },
};

const RESERVED_INVALID = new Set('<' + '>:"/\\|?*');
const RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${String(i + 1)}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${String(i + 1)}`),
]);

function stripInvalidFilenameChars(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch.charCodeAt(0) < 32 || RESERVED_INVALID.has(ch)) continue;
    out += ch;
  }
  return out;
}

/** Sanitizes a filename stem equivalently to desktop `marea/sysutil.py:safe_filename`. */
export function safeFilename(text: string, fallback: string, limit = 100): string {
  const cleaned = stripInvalidFilenameChars(text).replace(/^[ .]+|[ .]+$/g, '');
  const trimmed = cleaned.slice(0, limit).replace(/[ .]+$/g, '');
  const base = trimmed || fallback;
  const head = (base.split('.')[0] ?? '').trimEnd().toUpperCase();
  return RESERVED_NAMES.has(head) ? `_${base}` : base;
}

/** Builds `Artist - Title (versos X–Y) [ZH3 Marea].mp4`, matching `marea/export/job.py:clip_name`. */
export function clipFilename(
  artist: string,
  title: string,
  first: number | null,
  last: number | null,
  tag = '',
): string {
  const a = artist.trim();
  const t = title.trim();
  const rawBase = a ? `${a} - ${t || 'Sin título'}` : t || 'Sin título';
  const base = safeFilename(rawBase, 'Sin título');
  const span =
    first === null || last === null
      ? 'completa'
      : `versos ${String(first + 1)}–${String(last + 1)}`;
  const tagPart = tag.trim() ? ` [${safeFilename(tag, '')}]` : '';
  return `${base} (${span})${tagPart} [ZH3 Marea].mp4`;
}
