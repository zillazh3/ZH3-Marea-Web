import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoLyrics } from '@/features/lyrics/demo';
import { at } from '@/shared/indexed';
import { ProjectError, type ProjectErrorCode } from '@/features/projects/errors';
import {
  parseProjectText,
  projectToJson,
  readProject,
  serializeProject,
} from '@/features/projects/file';
import { newProject } from '@/features/projects/project';
import type { JsonObject } from '@/shared/json';

function load(name: string): JsonObject {
  const text = readFileSync(resolve(process.cwd(), 'tests/fixtures/project', name), 'utf8');
  return JSON.parse(text) as JsonObject;
}

const lines = (d: JsonObject): JsonObject[] => (d.lyrics as { lines: JsonObject[] }).lines;
const line0 = (d: JsonObject): JsonObject => at(lines(d), 0);
const syl0 = (d: JsonObject): JsonObject => at(line0(d).syllables as JsonObject[], 0);
const bg0 = (d: JsonObject): JsonObject => at(at(lines(d), 2).bg as JsonObject[], 0);

describe('.marea.json written by the desktop', () => {
  for (const name of ['demo.marea.json', 'rich.marea.json']) {
    it(`${name} survives a round trip unchanged`, () => {
      const raw = load(name);
      expect(projectToJson(readProject(raw))).toEqual(raw);
    });

    it(`${name} survives text serialization`, () => {
      const raw = load(name);
      expect(JSON.parse(serializeProject(parseProjectText(JSON.stringify(raw))))).toEqual(raw);
    });
  }

  it('reads the rich project into the model', () => {
    const project = readProject(load('rich.marea.json'));
    expect(project.title).toBe('Año nuevo, vida nueva');
    expect(project.track?.artists).toEqual(['Los Ñandúes', 'Invitada']);
    // The desktop recorded a Windows path; it is kept exactly as written.
    const windowsPath = ['D:', 'música', 'canción.mp3'].join(String.fromCharCode(92));
    expect([project.audioPath, project.audioOffsetMs]).toEqual([windowsPath, -120.5]);
    expect(project.lyrics.writers).toEqual(['A. Autora', 'B. Autor']);
    const duet = project.lyrics.lines.find((l) => l.rawAgent === 'singerB');
    expect([duet?.agent, duet?.role]).toEqual(['v2', 'duet']);
    expect(
      project.lyrics.lines.some((l) => l.bg.some((b) => b.role === 'echo' && b.agent === 'v2')),
    ).toBe(true);
    expect(project.editor.style).toBe('bajamar');
  });

  it('keeps unknown top-level keys and unsupported blocks verbatim', () => {
    const cinematic = {
      schema: 'marea.cinematic',
      version: 1,
      enabled: true,
      resources: { x: { path: 'C:/v.mp4' } },
    };
    const raw = { ...load('demo.marea.json'), futureFeature: { a: [1, 2] }, cinematic };
    const out = projectToJson(readProject(raw));
    expect(out.futureFeature).toEqual({ a: [1, 2] });
    expect(out.cinematic).toEqual(cinematic);
  });
});

describe('malformed projects are rejected before they reach the editor', () => {
  const cases: [string, (d: JsonObject) => void, ProjectErrorCode][] = [
    ['missing line start', (d) => delete line0(d).start, 'missingKey'],
    ['missing line end', (d) => delete line0(d).end, 'missingKey'],
    ['missing syllable text', (d) => delete syl0(d).text, 'notText'],
    ['missing syllable begin', (d) => delete syl0(d).begin, 'missingKey'],
    ['string start', (d) => (line0(d).start = '6000'), 'notNumber'],
    ['boolean start', (d) => (line0(d).start = true), 'notNumber'],
    ['null end', (d) => (syl0(d).end = null), 'notNumber'],
    ['line ends before it starts', (d) => (line0(d).end = -1), 'endsBeforeStart'],
    ['numeric syllable text', (d) => (syl0(d).text = 5), 'notText'],
    ['syllables is a string', (d) => (line0(d).syllables = 'hola'), 'notList'],
    ['a line is a string', (d) => (lines(d)[0] = 'verso' as never), 'notObject'],
    ['background vocal without start', (d) => delete bg0(d).start, 'missingKey'],
    ['background vocal end is text', (d) => (bg0(d).end = 'x'), 'notNumber'],
    ['audio is a string', (d) => (d.audio = 'nada'), 'notObject'],
    ['offset is text', (d) => ((d.audio as JsonObject).offset_ms = '12'), 'notNumber'],
    ['version is text', (d) => (d.version = 'uno'), 'badVersion'],
    ['track duration is text', (d) => (d.track = { id: 't', duration_ms: 'largo' }), 'notNumber'],
    ['track artists is not a list', (d) => (d.track = { id: 't', artists: 'x' }), 'badArtists'],
    ['unknown schema', (d) => (d.schema = 'other'), 'unsupportedSchema'],
    ['future version', (d) => (d.version = 2), 'unsupportedVersion'],
    ['version zero', (d) => (d.version = 0), 'unsupportedVersion'],
    ['no lyrics', (d) => delete d.lyrics, 'noLines'],
    ['empty lines', (d) => ((d.lyrics as JsonObject).lines = []), 'noLines'],
  ];

  for (const [name, mutate, code] of cases) {
    it(name, () => {
      const raw = structuredClone(load('demo.marea.json'));
      mutate(raw);
      expect(() => readProject(raw)).toThrow(expect.objectContaining({ code }) as Error);
    });
  }

  it('rejects text that is not JSON, and JSON that is not an object', () => {
    expect(() => parseProjectText('no es json')).toThrow(ProjectError);
    expect(() => parseProjectText('[1, 2]')).toThrow(ProjectError);
  });

  it('names the offending field', () => {
    const raw = structuredClone(load('demo.marea.json'));
    syl0(raw).end = 'x';
    expect(() => readProject(raw)).toThrow(
      expect.objectContaining({ where: 'lyrics.lines[0].syllables[0].end' }) as Error,
    );
  });
});

describe('a new web project', () => {
  it('carries the desktop defaults and opens back as the same project', () => {
    const project = newProject({ title: 'Demo', artist: 'Yo', lyrics: demoLyrics() });
    const json = projectToJson(project);
    expect(json.background).toMatchObject({
      schema: 'marea.background',
      source: 'cover',
      dim: 0.25,
    });
    expect(json.cinematic).toMatchObject({ schema: 'marea.cinematic', enabled: false });
    expect(projectToJson(parseProjectText(serializeProject(project)))).toEqual(json);
  });
});
