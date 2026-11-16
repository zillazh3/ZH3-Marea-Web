// Origin private file system: where large files live (the user's audio now, exported video later). Writes stream to disk, so
// memory stays flat however big the file is.

export function opfsAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage
  );
}

async function directory(
  path: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let dir = await navigator.storage.getDirectory();
  for (const name of path) dir = await dir.getDirectoryHandle(name, { create });
  return dir;
}

/** Writes `data` to `path/name`, replacing what was there. */
export async function writeFile(path: readonly string[], name: string, data: Blob): Promise<void> {
  const dir = await directory(path, true);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

/** The file, or null when it does not exist. */
export async function readFile(path: readonly string[], name: string): Promise<File | null> {
  try {
    const dir = await directory(path, false);
    return await (await dir.getFileHandle(name)).getFile();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}

export async function removeFile(path: readonly string[], name: string): Promise<void> {
  try {
    await (await directory(path, false)).removeEntry(name);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
}

/**
 * Asks the browser not to evict this site's data under storage pressure. Called when the first project is saved, so the request
 * comes with a reason. Returns whether the data is now persistent.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false; // only a hint: the app works the same when the browser declines or the call is blocked
  }
}
