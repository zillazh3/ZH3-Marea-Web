import { backupReminderCount, loadBackupState, saveBackupState } from '@/features/storage/backup';

/** Reading `localStorage` itself can throw when site data is blocked; the reminder is then simply off. */
function browserStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export const backup = {
  /** Remembers that this project now has a `.marea.json` copy. */
  markExported(id: string): void {
    const storage = browserStorage();
    if (!storage) return;
    const state = loadBackupState(storage);
    if (state.exported.includes(id)) return;
    saveBackupState(storage, { ...state, exported: [...state.exported, id] });
  },

  /** How many projects the reminder is about, or 0. A reminder that is due counts as shown, so it will not repeat for a week. */
  claimReminder(projectIds: readonly string[], now = Date.now()): number {
    const storage = browserStorage();
    if (!storage) return 0;
    const state = loadBackupState(storage);
    const count = backupReminderCount(state, projectIds, now);
    if (count > 0) saveBackupState(storage, { ...state, shownAt: now });
    return count;
  },
};
