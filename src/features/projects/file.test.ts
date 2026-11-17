import { describe, expect, it } from 'vitest';
import { demoLyrics } from '@/features/lyrics/demo';
import { ProjectError } from './errors';
import { parseProjectText, projectToJson, readProject, serializeProject } from './file';
import { newProject } from './project';

function baseJson(): Record<string, unknown> {
  return projectToJson(newProject({ title: 'T', artist: 'A', lyrics: demoLyrics() }));
}

describe('readProject hardening', () => {
  it('keeps a "__proto__" key as own data without changing the prototype, and writes it back', () => {
    const text = JSON.stringify(baseJson()).replace(/^\{/, '{"__proto__":{"polluted":true},');
    const project = parseProjectText(text);
    expect(Object.getPrototypeOf(project.extra)).toBe(Object.prototype);
    expect(Object.hasOwn(project.extra, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(serializeProject(project)).toContain('"__proto__": {\n    "polluted": true');
  });

  it('rejects an oversized cover', () => {
    const raw = { ...baseJson(), cover_png_b64: 'A'.repeat(12 * 1024 * 1024 + 1) };
    expect(() => readProject(raw)).toThrow(ProjectError);
    expect(() => readProject(raw)).toThrow(/tooLarge/);
  });
});
