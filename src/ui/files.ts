/** A file the browser could not read (moved, deleted or permission lost after it was picked). */
export class FileReadError extends Error {
  constructor() {
    super('file could not be read');
    this.name = 'FileReadError';
  }
}

/** Opens the system file picker; null when the user cancels. Must be called from a user gesture. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
    });
    input.addEventListener('cancel', () => {
      resolve(null);
    });
    input.click();
  });
}

export async function readText(file: File): Promise<string> {
  try {
    return await file.text();
  } catch {
    throw new FileReadError();
  }
}

/** Triggers a browser file download from a Blob. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Defer revocation slightly so large MP4 streams start before the URL is torn down.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Saves `text` through the browser's download, which is how a static page hands a file to the user. */
export function downloadText(filename: string, text: string, type: string): void {
  downloadBlob(filename, new Blob([text], { type }));
}
