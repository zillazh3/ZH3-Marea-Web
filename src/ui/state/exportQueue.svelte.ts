import { summarizeQueue, type ExportJob } from '@/features/exports/queue';

let jobs = $state<ExportJob[]>([]);
const summary = $derived(summarizeQueue(jobs));

export const exportQueue = {
  get jobs(): readonly ExportJob[] {
    return jobs;
  },
  get pending(): number {
    return summary.pending;
  },
  get progress(): number | null {
    return summary.progress;
  },
  replace(next: ExportJob[]): void {
    jobs = next;
  },
};
