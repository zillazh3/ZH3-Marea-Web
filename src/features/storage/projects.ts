import { projectToJson, readProject } from '@/features/projects/file';
import type { ClipProject } from '@/features/projects/project';
import { appDb } from './db';
import { projectMeta, type ProjectMeta } from './meta';

/** Saved projects: a light record for listing and the full `.marea.json` content for opening. */
export const projectStore = {
  /** Newest first. */
  async list(): Promise<ProjectMeta[]> {
    const db = await appDb();
    return (await db.getAllFromIndex('projects', 'by-updated')).reverse();
  },

  /** Saves under `id`, or under a new id; returns the record. */
  async save(project: ClipProject, id: string = crypto.randomUUID()): Promise<ProjectMeta> {
    const meta = projectMeta(project, id, Date.now());
    const db = await appDb();
    const tx = db.transaction(['projects', 'projectFiles'], 'readwrite');
    await Promise.all([
      tx.objectStore('projects').put(meta),
      tx.objectStore('projectFiles').put(projectToJson(project), id),
      tx.done,
    ]);
    return meta;
  },

  /** Throws `ProjectError` if what was stored no longer validates, and returns null for an unknown id. */
  async load(id: string): Promise<ClipProject | null> {
    const db = await appDb();
    const raw = await db.get('projectFiles', id);
    return raw ? readProject(raw) : null;
  },

  async remove(id: string): Promise<void> {
    const db = await appDb();
    const tx = db.transaction(['projects', 'projectFiles'], 'readwrite');
    await Promise.all([
      tx.objectStore('projects').delete(id),
      tx.objectStore('projectFiles').delete(id),
      tx.done,
    ]);
  },
};
