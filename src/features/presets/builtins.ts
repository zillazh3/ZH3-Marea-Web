import abisalJson from '@/shared/data/presets/Abisal.json';
import bajamarJson from '@/shared/data/presets/Bajamar.json';
import nieblaJson from '@/shared/data/presets/Niebla.json';
import pleamarJson from '@/shared/data/presets/Pleamar.json';
import { validatePreset, type PresetDocument } from './schema';

export interface PresetEntry {
  readonly name: string;
  readonly builtin: boolean;
  readonly preset: PresetDocument;
  readonly missingFont?: string;
}

const RAW_BUILTINS: readonly unknown[] = [bajamarJson, pleamarJson, nieblaJson, abisalJson];

export const BUILTIN_PRESETS: readonly PresetEntry[] = RAW_BUILTINS.map((raw) => {
  const { preset } = validatePreset(raw);
  return { name: preset.name, builtin: true, preset };
});
