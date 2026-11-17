import {
  newLine,
  newLyrics,
  type BgVocal,
  type Line,
  type Lyrics,
  type Syllable,
} from '@/features/lyrics/model';
import { asArray, asString, asText, isRecord, parseJson, type JsonObject } from '@/shared/json';
import { ProjectError } from './errors';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_CINEMATIC,
  PROJECT_SCHEMA,
  PROJECT_VERSION,
  type ClipProject,
  type Track,
} from './project';

// Reading and writing `.marea.json` (`marea.project` v1), compatible with the desktop app. Every field is validated at this
// boundary: nothing downstream sees a shape it has not been promised.

/** A cover is a few hundred KB; this bounds what an imported file can make the app decode. */
const MAX_COVER_B64_CHARS = 12 * 1024 * 1024;

const KNOWN_KEYS = new Set([
  'schema',
  'version',
  'title',
  'artist',
  'cover_png_b64',
  'source',
  'track',
  'audio',
  'lyrics',
  'cinematic',
  'background',
  'editor',
]);

// ---- field validators ----

function obj(value: unknown, where: string): JsonObject {
  if (!isRecord(value)) throw new ProjectError('notObject', where);
  return value;
}

function list(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new ProjectError('notList', where);
  return value;
}

/** The JSON values Python treats as false, which its `value or default` replaces. */
function isFalsy(value: unknown): boolean {
  return value === undefined || value === null || value === '' || value === 0 || value === false;
}

function orEmpty(value: unknown): unknown {
  return isFalsy(value) ? [] : value;
}

function num(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new ProjectError('notNumber', where, String(value));
  return value;
}

/** A required interval: numeric, finite, and not ending before it starts. */
function span(d: JsonObject, a: string, b: string, where: string): [number, number] {
  for (const key of [a, b]) {
    if (!(key in d)) throw new ProjectError('missingKey', where, key);
  }
  const start = num(d[a], `${where}.${a}`);
  const end = num(d[b], `${where}.${b}`);
  if (end < start)
    throw new ProjectError('endsBeforeStart', where, `${String(start)} > ${String(end)}`);
  return [start, end];
}

function readSyllable(value: unknown, where: string): Syllable {
  const d = obj(value, where);
  if (typeof d.text !== 'string') throw new ProjectError('notText', `${where}.text`);
  const [begin, end] = span(d, 'begin', 'end', where);
  return { text: d.text, begin, end, wordEnd: Boolean(d.word_end) };
}

function readSyllables(value: unknown, where: string): Syllable[] {
  return list(orEmpty(value), where).map((s, j) => readSyllable(s, `${where}[${String(j)}]`));
}

function readLyrics(value: unknown): Lyrics {
  if (!isRecord(value) || !Array.isArray(value.lines)) throw new ProjectError('noLines', 'lyrics');
  const lines: Line[] = [];
  // Only each interval is validated: overlapping lines, duets and backing vocals are all valid data.
  value.lines.forEach((raw, i) => {
    const where = `lyrics.lines[${String(i)}]`;
    const ld = obj(raw, where);
    const syllables = readSyllables(ld.syllables, `${where}.syllables`);
    const bg: BgVocal[] = [];
    list(orEmpty(ld.bg), `${where}.bg`).forEach((rawBg, k) => {
      const bw = `${where}.bg[${String(k)}]`;
      const bd = obj(rawBg, bw);
      if (!bd.syllables) return;
      const [start, end] = span(bd, 'start', 'end', bw);
      bg.push({
        start,
        end,
        syllables: readSyllables(bd.syllables, `${bw}.syllables`),
        role: asString(bd.role, 'backing'),
        agent: asString(bd.agent),
      });
    });
    if (syllables.length === 0 && bg.length === 0) return;
    const [start, end] = span(ld, 'start', 'end', where);
    lines.push(
      newLine({
        start,
        end,
        agent: asString(ld.agent, 'v1'),
        syllables,
        bg,
        approx: Boolean(ld.approx),
        role: asString(ld.role),
        rawAgent: asString(ld.raw_agent),
      }),
    );
  });
  if (lines.length === 0) throw new ProjectError('noLines', 'lyrics');
  return newLyrics(lines, {
    source: asString(value.source),
    credit: asString(value.credit),
    writers: asArray(orEmpty(value.writers)).map(asText),
  });
}

function readTrack(value: unknown): Track | null {
  if (!isRecord(value) || !value.id) return null;
  const artists = value.artists;
  if (artists !== undefined && artists !== null && !Array.isArray(artists)) {
    throw new ProjectError('badArtists', 'track.artists');
  }
  return {
    id: asText(value.id),
    title: asString(value.title),
    artists: (artists ?? []).map(asText),
    album: asString(value.album),
    durationMs: Math.trunc(num(value.duration_ms ?? 0, 'track.duration_ms')),
    coverUrl: typeof value.cover_url === 'string' ? value.cover_url : null,
    uri: asString(value.uri),
  };
}

function readVersion(raw: unknown): number {
  const value = raw === undefined ? 0 : raw;
  const version =
    typeof value === 'number'
      ? Math.trunc(value)
      : typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isFinite(version)) throw new ProjectError('badVersion', 'version', String(raw));
  return version;
}

/** Validates a parsed `.marea.json`. Throws `ProjectError` on anything the desktop would also refuse. */
export function readProject(raw: unknown): ClipProject {
  if (!isRecord(raw)) throw new ProjectError('invalidJson');
  if (raw.schema !== PROJECT_SCHEMA)
    throw new ProjectError('unsupportedSchema', 'schema', String(raw.schema));
  const version = readVersion(raw.version);
  if (version < 1 || version > PROJECT_VERSION) {
    throw new ProjectError(
      'unsupportedVersion',
      'version',
      `${String(version)} (max ${String(PROJECT_VERSION)})`,
    );
  }

  if (typeof raw.cover_png_b64 === 'string' && raw.cover_png_b64.length > MAX_COVER_B64_CHARS)
    throw new ProjectError('tooLarge', 'cover_png_b64');
  const lyrics = readLyrics(raw.lyrics ?? {});
  const audio = obj(isFalsy(raw.audio) ? {} : raw.audio, 'audio');
  const extra: JsonObject = {};
  for (const [key, value] of Object.entries(raw)) {
    // defineProperty, not assignment: a "__proto__" key must stay an own property rather than set the prototype.
    if (!KNOWN_KEYS.has(key))
      Object.defineProperty(extra, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  return {
    title: asString(raw.title),
    artist: asString(raw.artist),
    coverPngB64: asString(raw.cover_png_b64),
    source: asString(raw.source).trim(),
    track: readTrack(raw.track),
    audioPath: asString(audio.path).trim(),
    audioOffsetMs: num(audio.offset_ms ?? 0, 'audio.offset_ms'),
    lyrics,
    cinematic: isRecord(raw.cinematic) ? raw.cinematic : structuredClone(DEFAULT_CINEMATIC),
    background: isRecord(raw.background) ? raw.background : structuredClone(DEFAULT_BACKGROUND),
    editor: isRecord(raw.editor) ? raw.editor : {},
    extra,
  };
}

/** Parses the text of a `.marea.json`. */
export function parseProjectText(text: string): ClipProject {
  const raw = parseJson(text);
  if (raw === null) throw new ProjectError('invalidJson');
  return readProject(raw);
}

// ---- writing ----

function syllableJson(s: Syllable): JsonObject {
  return { text: s.text, begin: s.begin, end: s.end, word_end: s.wordEnd };
}

function lineJson(line: Line): JsonObject {
  const out: JsonObject = {
    start: line.start,
    end: line.end,
    agent: line.agent,
    approx: line.approx,
    syllables: line.syllables.map(syllableJson),
    bg: line.bg.map((b) => ({
      start: b.start,
      end: b.end,
      syllables: b.syllables.map(syllableJson),
      ...(b.role && b.role !== 'backing' ? { role: b.role } : {}),
      ...(b.agent ? { agent: b.agent } : {}),
    })),
  };
  if (line.role) out.role = line.role;
  if (line.rawAgent) out.raw_agent = line.rawAgent;
  return out;
}

export function projectToJson(project: ClipProject): JsonObject {
  const track = project.track;
  return {
    ...project.extra,
    schema: PROJECT_SCHEMA,
    version: PROJECT_VERSION,
    title: project.title,
    artist: project.artist,
    cover_png_b64: project.coverPngB64,
    source: project.source,
    track: track
      ? {
          id: track.id,
          title: track.title,
          artists: track.artists,
          album: track.album,
          duration_ms: track.durationMs,
          cover_url: track.coverUrl,
          uri: track.uri,
        }
      : null,
    audio: { path: project.audioPath, offset_ms: project.audioOffsetMs },
    lyrics: {
      source: project.lyrics.source,
      credit: project.lyrics.credit,
      writers: [...project.lyrics.writers],
      lines: project.lyrics.lines.map(lineJson),
    },
    cinematic: project.cinematic,
    background: project.background,
    editor: project.editor,
  };
}

/** The text of a `.marea.json`, indented like the desktop's. */
export function serializeProject(project: ClipProject): string {
  return `${JSON.stringify(projectToJson(project), null, 2)}\n`;
}
