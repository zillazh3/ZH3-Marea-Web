export interface PlayerTrack {
  title: string;
  artist: string;
  /** Index into the placeholder cover palettes in tokens.css, until real artwork exists. */
  tone: number;
}

let track = $state<PlayerTrack | null>(null);
let playing = $state(false);
let progress = $state(0);

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
  load(next: PlayerTrack, options: { playing: boolean; progress: number }): void {
    track = next;
    playing = options.playing;
    progress = options.progress;
  },
  togglePlaying(): void {
    if (track) playing = !playing;
  },
};
