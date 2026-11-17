export const BACKUP_KEY = 'zh3marea.backup';
export const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export interface BackupState {
  /** Ids of projects downloaded as `.marea.json` at least once. */
  readonly exported: readonly string[];
  /** When the reminder was last shown (ms since the epoch), 0 if never. */
  readonly shownAt: number;
}

const EMPTY: BackupState = { exported: [], shownAt: 0 };

/** Anything missing or malformed reads as "never exported, never reminded". */
export function loadBackupState(storage: Pick<Storage, 'getItem'>): BackupState {
  try {
    const text = storage.getItem(BACKUP_KEY);
    const raw: unknown = text === null ? null : JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return EMPTY;
    const { exported, shownAt } = raw as Record<string, unknown>;
    return {
      exported: Array.isArray(exported)
        ? exported.filter((id): id is string => typeof id === 'string')
        : [],
      shownAt: typeof shownAt === 'number' && Number.isFinite(shownAt) ? shownAt : 0,
    };
  } catch {
    return EMPTY;
  }
}

/** Returns false when the browser refuses storage; the reminder then simply comes back next visit. */
export function saveBackupState(storage: Pick<Storage, 'setItem'>, state: BackupState): boolean {
  try {
    storage.setItem(BACKUP_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** How many saved projects were never exported, or 0 when the reminder is not due (it comes at most once a week). */
export function backupReminderCount(
  state: BackupState,
  projectIds: readonly string[],
  now: number,
): number {
  if (state.shownAt > 0 && now - state.shownAt < REMINDER_INTERVAL_MS) return 0;
  const exported = new Set(state.exported);
  return projectIds.filter((id) => !exported.has(id)).length;
}
