import { describe, expect, it } from 'vitest';
import {
  BACKUP_KEY,
  REMINDER_INTERVAL_MS,
  backupReminderCount,
  loadBackupState,
  saveBackupState,
} from './backup';

const NOW = 1_800_000_000_000;

describe('backup reminder', () => {
  it('counts projects that were never exported', () => {
    const state = { exported: ['a'], shownAt: 0 };
    expect(backupReminderCount(state, ['a', 'b', 'c'], NOW)).toBe(2);
  });

  it('stays quiet when every project was exported or the library is empty', () => {
    expect(backupReminderCount({ exported: ['a', 'b'], shownAt: 0 }, ['a', 'b'], NOW)).toBe(0);
    expect(backupReminderCount({ exported: [], shownAt: 0 }, [], NOW)).toBe(0);
  });

  it('shows at most once a week', () => {
    const shown = { exported: [], shownAt: NOW - REMINDER_INTERVAL_MS + 1 };
    expect(backupReminderCount(shown, ['a'], NOW)).toBe(0);
    expect(backupReminderCount({ ...shown, shownAt: NOW - REMINDER_INTERVAL_MS }, ['a'], NOW)).toBe(
      1,
    );
  });

  it('round-trips through storage and ignores malformed content', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
    expect(loadBackupState(storage)).toEqual({ exported: [], shownAt: 0 });
    expect(saveBackupState(storage, { exported: ['a'], shownAt: 5 })).toBe(true);
    expect(loadBackupState(storage)).toEqual({ exported: ['a'], shownAt: 5 });
    data.set(BACKUP_KEY, '{"exported":[1,"b"],"shownAt":"x"}');
    expect(loadBackupState(storage)).toEqual({ exported: ['b'], shownAt: 0 });
    data.set(BACKUP_KEY, 'not json');
    expect(loadBackupState(storage)).toEqual({ exported: [], shownAt: 0 });
  });

  it('reports a storage that refuses writes', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(saveBackupState(storage, { exported: [], shownAt: 0 })).toBe(false);
  });
});
