import type { ClipProject } from '@/features/projects/project';

// The project open in the editor. `id` is its place in the library, or null while it could not be saved.
let project = $state.raw<ClipProject | null>(null);
let id = $state<string | null>(null);

export const session = {
  get project(): ClipProject | null {
    return project;
  },
  get id(): string | null {
    return id;
  },
  open(next: ClipProject, libraryId: string | null): void {
    project = next;
    id = libraryId;
  },
  close(): void {
    project = null;
    id = null;
  },
};
