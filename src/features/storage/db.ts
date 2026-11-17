import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PresetDocument } from '@/features/presets/schema';
import type { CacheEntry } from '@/features/providers/cache';
import type { JsonObject } from '@/shared/json';
import type { ProjectMeta } from './meta';

// One IndexedDB database for everything small and structured. Large binaries (audio, exported video) go to OPFS, see opfs.ts.

export const DB_NAME = 'zh3marea';
const DB_VERSION = 3;

export interface ExportClipRecord {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly label: string;
  readonly fileName: string;
  readonly opfsName: string | null;
  readonly sizeBytes: number;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
  readonly audioCodec: 'aac' | 'opus' | null;
  readonly createdAt: number;
  readonly thumbPng: Uint8Array | null;
}

interface AppSchema extends DBSchema {
  /** Light records for the library listing. */
  projects: { key: string; value: ProjectMeta; indexes: { 'by-updated': number } };
  /** The `.marea.json` content of each project, kept apart so listing the library never loads covers and lyrics. */
  projectFiles: { key: string; value: JsonObject };
  lyricsCache: { key: string; value: CacheEntry };
  /** API keys and tokens of this device. Not encrypted: a key stored next to its secret would be false assurance. */
  secrets: { key: string; value: string };
  /** User-created Corrientes presets, keyed by lowercase name. */
  presets: { key: string; value: PresetDocument };
  /** Cached 216x384 PNG thumbnails for Corrientes, keyed by visual signature hash. */
  presetThumbs: { key: string; value: Uint8Array };
  /** Metadata + thumbnails for completed exports whose MP4 lives in OPFS. */
  exportHistory: {
    key: string;
    value: ExportClipRecord;
    indexes: { 'by-created': number };
  };
}

export type AppDb = IDBPDatabase<AppSchema>;

let opened: Promise<AppDb> | undefined;

/** The shared connection, opened on first use. */
export function appDb(): Promise<AppDb> {
  opened ??= openDB<AppSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('by-updated', 'updatedAt');
        db.createObjectStore('projectFiles');
        db.createObjectStore('lyricsCache');
        db.createObjectStore('secrets');
      }
      if (oldVersion < 2) {
        db.createObjectStore('presets');
        db.createObjectStore('presetThumbs');
      }
      if (oldVersion < 3) {
        const exportsStore = db.createObjectStore('exportHistory', { keyPath: 'id' });
        exportsStore.createIndex('by-created', 'createdAt');
      }
    },
    // Another tab is deleting or upgrading the database: let go so it is not blocked.
    blocking() {
      void closeAppDb();
    },
  });
  return opened;
}

/** Closes the shared connection so the database can be deleted; the next `appDb()` call reopens it. */
export async function closeAppDb(): Promise<void> {
  const pending = opened;
  opened = undefined;
  try {
    (await pending)?.close();
  } catch {
    // The connection never opened (IndexedDB blocked), so there is nothing to close.
  }
}
