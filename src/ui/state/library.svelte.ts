import { projectStore } from '@/features/storage/projects';
import type { ProjectMeta } from '@/features/storage/meta';

let items = $state<ProjectMeta[]>([]);
let loaded = $state(false);

export const library = {
  get items(): readonly ProjectMeta[] {
    return items;
  },
  /** False until the first read finishes, so screens do not flash their empty state. */
  get loaded(): boolean {
    return loaded;
  },

  async refresh(): Promise<void> {
    try {
      items = await projectStore.list();
    } catch {
      items = []; // IndexedDB is blocked (private window): the library is simply empty
    }
    loaded = true;
  },

  async remove(id: string): Promise<void> {
    await projectStore.remove(id);
    await this.refresh();
  },
};
