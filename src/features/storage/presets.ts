import { BUILTIN_PRESETS, type PresetEntry } from '@/features/presets/builtins';
import { PresetError } from '@/features/presets/errors';
import {
  parsePresetText,
  validatePreset,
  type PresetDocument,
  type PresetFlag,
} from '@/features/presets/schema';
import { appDb } from './db';

const BUILTIN_NAMES = new Set(BUILTIN_PRESETS.map((p) => p.name.toLocaleLowerCase()));

function keyFor(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function isoNow(): string {
  return new Date().toISOString().slice(0, 19);
}

function assertNameValid(name: string): string {
  const clean = name.trim();
  if (!clean) throw new PresetError('emptyName');
  if (clean.length > 60) throw new PresetError('nameTooLong');
  return clean;
}

export const presetStore = {
  async list(): Promise<PresetEntry[]> {
    const db = await appDb();
    const rawUser = await db.getAll('presets');
    const user: PresetEntry[] = [];
    const seen = new Set(BUILTIN_NAMES);
    for (const raw of rawUser) {
      try {
        const { preset, flags } = validatePreset(raw);
        const name = preset.name || 'Corriente';
        const k = keyFor(name);
        if (seen.has(k)) continue;
        seen.add(k);
        const missing = flags[0]?.font;
        user.push({
          name,
          builtin: false,
          preset: { ...preset, name },
          ...(missing !== undefined ? { missingFont: missing } : {}),
        });
      } catch {
        // Ignore corrupted user entries so they don't break the list.
      }
    }
    user.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return [...BUILTIN_PRESETS, ...user];
  },

  async get(name: string): Promise<PresetEntry | null> {
    const k = keyFor(name);
    const all = await this.list();
    return all.find((p) => keyFor(p.name) === k) ?? null;
  },

  async save(name: string, preset: PresetDocument): Promise<PresetEntry> {
    const clean = assertNameValid(name);
    const k = keyFor(clean);
    const existing = await this.list();
    if (existing.some((p) => keyFor(p.name) === k)) {
      throw new PresetError('duplicateName', clean);
    }
    const now = isoNow();
    const validated = validatePreset({
      ...preset,
      name: clean,
      created: now,
      updated: now,
    }).preset;
    const db = await appDb();
    await db.put('presets', validated, k);
    return { name: clean, builtin: false, preset: validated };
  },

  async update(name: string, preset: PresetDocument): Promise<PresetEntry> {
    const existing = await this.get(name);
    if (!existing) throw new PresetError('notFound', name);
    if (existing.builtin) throw new PresetError('builtinReadOnly', existing.name);
    const validated = validatePreset({
      ...preset,
      name: existing.name,
      description: existing.preset.description,
      created: existing.preset.created,
      updated: isoNow(),
    }).preset;
    const db = await appDb();
    await db.put('presets', validated, keyFor(existing.name));
    return { name: existing.name, builtin: false, preset: validated };
  },

  async rename(name: string, newName: string): Promise<PresetEntry> {
    const existing = await this.get(name);
    if (!existing) throw new PresetError('notFound', name);
    if (existing.builtin) throw new PresetError('builtinReadOnly', existing.name);
    const clean = assertNameValid(newName);
    const newKey = keyFor(clean);
    const oldKey = keyFor(existing.name);
    if (newKey !== oldKey) {
      const all = await this.list();
      if (all.some((p) => keyFor(p.name) === newKey)) {
        throw new PresetError('duplicateName', clean);
      }
    }
    const updated: PresetDocument = { ...existing.preset, name: clean, updated: isoNow() };
    const db = await appDb();
    const tx = db.transaction('presets', 'readwrite');
    if (newKey !== oldKey) await tx.store.delete(oldKey);
    await tx.store.put(updated, newKey);
    await tx.done;
    return { name: clean, builtin: false, preset: updated };
  },

  async duplicate(name: string): Promise<PresetEntry> {
    const existing = await this.get(name);
    if (!existing) throw new PresetError('notFound', name);
    const all = await this.list();
    const taken = new Set(all.map((p) => keyFor(p.name)));
    const base = `${existing.name} (copia)`;
    let candidate = base;
    let n = 2;
    while (taken.has(keyFor(candidate))) {
      candidate = `${base} ${String(n)}`;
      n += 1;
    }
    return this.save(candidate, existing.preset);
  },

  async remove(name: string): Promise<void> {
    const existing = await this.get(name);
    if (!existing) throw new PresetError('notFound', name);
    if (existing.builtin) throw new PresetError('builtinReadOnly', existing.name);
    const db = await appDb();
    await db.delete('presets', keyFor(existing.name));
  },

  async importJsonText(
    text: string,
    fallbackName: string,
  ): Promise<{ entry: PresetEntry; flags: PresetFlag[] }> {
    const { preset, flags } = parsePresetText(text);
    const base = preset.name || fallbackName || 'Corriente';
    const all = await this.list();
    const taken = new Set(all.map((p) => keyFor(p.name)));
    let candidate = base;
    let n = 2;
    while (taken.has(keyFor(candidate))) {
      candidate = `${base} (${String(n)})`;
      n += 1;
    }
    const entry = await this.save(candidate, preset);
    return { entry, flags };
  },

  async exportJsonText(name: string): Promise<string> {
    const existing = await this.get(name);
    if (!existing) throw new PresetError('notFound', name);
    return `${JSON.stringify(existing.preset, null, 2)}\n`;
  },

  async getThumb(signature: string): Promise<Uint8Array | null> {
    const db = await appDb();
    return (await db.get('presetThumbs', signature)) ?? null;
  },

  async putThumb(signature: string, pngBytes: Uint8Array): Promise<void> {
    const db = await appDb();
    await db.put('presetThumbs', pngBytes, signature);
  },
};
