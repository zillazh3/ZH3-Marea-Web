import { appDb, type ExportClipRecord } from './db';
import { opfsAvailable, readFile, removeFile } from './opfs';

const EXPORTS_DIR = ['exports'] as const;
const MAX_HISTORY = 50;

export const exportHistoryStore = {
  async list(): Promise<ExportClipRecord[]> {
    const db = await appDb();
    const all = await db.getAllFromIndex('exportHistory', 'by-created');
    return all.reverse();
  },

  async put(record: ExportClipRecord): Promise<void> {
    const db = await appDb();
    await db.put('exportHistory', record);
    const all = await db.getAllFromIndex('exportHistory', 'by-created');
    if (all.length > MAX_HISTORY) {
      const overflow = all.slice(0, all.length - MAX_HISTORY);
      for (const stale of overflow) {
        await db.delete('exportHistory', stale.id);
        if (stale.opfsName && opfsAvailable()) {
          await removeFile(EXPORTS_DIR, stale.opfsName);
        }
      }
    }
  },

  async remove(id: string): Promise<void> {
    const db = await appDb();
    const existing = await db.get('exportHistory', id);
    await db.delete('exportHistory', id);
    if (existing?.opfsName && opfsAvailable()) {
      await removeFile(EXPORTS_DIR, existing.opfsName);
    }
  },

  async readClipBlob(opfsName: string | null): Promise<Blob | null> {
    if (!opfsName || !opfsAvailable()) return null;
    return readFile(EXPORTS_DIR, opfsName);
  },
};
