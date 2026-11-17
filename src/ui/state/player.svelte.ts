export interface PlayerTrack {
  title: string;
  artist: string;
  /** Index into the placeholder cover palettes in tokens.css, until real artwork exists. */
  tone: number;
}

let track = $state<PlayerTrack | null>(null);
let playing = $state(false);
let progress = $state(0);
let toggleHandler: (() => void) | null = null;

export const player = {
  get track(): PlayerTrack | null {
    return track;
  },
  get playing(): boolean {
    return playing;
  },
  /** 0..1 position within the current track. */
  get progress(): number {
    return progress;
  },
  load(
    next: PlayerTrack,
    options: { playing: boolean; progress: number; onToggle?: () => void },
  ): void {
    track = next;
    playing = options.playing;
    progress = options.progress;
    toggleHandler = options.onToggle ?? null;
  },
  setPlaying(next: boolean): void {
    playing = next;
  },
  setProgress(next: number): void {
    progress = Math.max(0, Math.min(1, next));
  },
  clearHandler(): void {
    toggleHandler = null;
  },
  togglePlaying(): void {
    if (!track) return;
    if (toggleHandler) {
      toggleHandler();
    } else {
      playing = !playing;
    }
  },
};
