import abisalJson from './builtins/Abisal.json';
import bajamarJson from './builtins/Bajamar.json';
import nieblaJson from './builtins/Niebla.json';
import pleamarJson from './builtins/Pleamar.json';
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
