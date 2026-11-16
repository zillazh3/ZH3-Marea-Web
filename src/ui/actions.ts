import { demoLyrics } from '@/features/lyrics/demo';
import { parseTtml } from '@/features/lyrics/ttml';
import { ProjectError } from '@/features/projects/errors';
import { parseProjectText, serializeProject } from '@/features/projects/file';
import { newProject, type ClipProject } from '@/features/projects/project';
import { trackToLyrics, type LrclibTrack } from '@/features/providers/lrclib';
import { requestPersistence } from '@/features/storage/opfs';
import { projectStore } from '@/features/storage/projects';
import { downloadText, pickFile, readText } from './files';
import { describeError } from './errors';
import { i18n } from './i18n.svelte';
import { router } from './router/router.svelte';
import { library } from './state/library.svelte';
import { session } from './state/session.svelte';
import { notifications } from './state/toasts.svelte';

const FILE_NAME_FORBIDDEN = /[\\/:*?"<>|]+/g;

/** Runs a user-initiated flow and tells the user, in their language, when it fails. */
async function attempt(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(error);
    notifications.show(describeError(i18n.m, error), 'error');
  }
}

/** Puts `project` in the library (when the browser lets us), makes it the open one and goes to the editor. */
async function openProject(project: ClipProject): Promise<void> {
  let id: string | null = null;
  try {
    const firstProject = library.items.length === 0;
    id = (await projectStore.save(project)).id;
    await library.refresh();
    if (firstProject) void requestPersistence(); // asked once, when there is something worth keeping
  } catch (error) {
    console.error(error);
    notifications.show(i18n.m.toast.notSaved, 'error');
  }
  session.open(project, id);
  router.navigate('editor');
  notifications.show(i18n.m.toast.opened(project.title || i18n.m.editor.untitled), 'ok');
}

export function openDemo(): Promise<void> {
  return attempt(() =>
    openProject(
      newProject({ title: 'Marea de luz', artist: 'Demo · letra original', lyrics: demoLyrics() }),
    ),
  );
}

export function openTtml(): Promise<void> {
  return attempt(async () => {
    const file = await pickFile('.ttml,.xml,application/ttml+xml');
    if (!file) return;
    const lyrics = parseTtml(await readText(file));
    if (lyrics.lines.length === 0) throw new ProjectError('noLines');
    await openProject(
      newProject({
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: '',
        lyrics,
        source: file.name,
      }),
    );
  });
}

export function openProjectFile(): Promise<void> {
  return attempt(async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    await openProject(parseProjectText(await readText(file)));
  });
}

/** Opens a project that is already in the library, without saving it again. */
export function openSaved(id: string): Promise<void> {
  return attempt(async () => {
    const project = await projectStore.load(id);
    if (!project) {
      await library.refresh(); // it was removed elsewhere (another tab)
      return;
    }
    session.open(project, id);
    router.navigate('editor');
  });
}

export function createFromTrack(track: LrclibTrack): Promise<void> {
  return attempt(async () => {
    const lyrics = await trackToLyrics(track);
    if (!lyrics) {
      notifications.show(i18n.m.search.lyricsNotFound);
      return;
    }
    await openProject(
      newProject({
        title: track.trackName,
        artist: track.artistName,
        lyrics: { ...lyrics, source: 'lrclib', credit: 'LRCLIB' },
      }),
    );
  });
}

export function downloadSaved(id: string): Promise<void> {
  return attempt(async () => {
    const project = await projectStore.load(id);
    if (!project) return;
    const name = (project.title || i18n.m.editor.untitled).replace(FILE_NAME_FORBIDDEN, '_');
    downloadText(`${name}.marea.json`, serializeProject(project), 'application/json');
  });
}

export function deleteSaved(id: string, title: string): Promise<void> {
  return attempt(async () => {
    await library.remove(id);
    if (session.id === id) session.close();
    notifications.show(i18n.m.library.deleted(title));
  });
}
