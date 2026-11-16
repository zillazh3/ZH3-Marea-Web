import { lyricsKind, type Lyrics } from '@/features/lyrics/model';
import { ProviderError } from './errors';
import type { LyricsProvider, TrackQuery } from './types';

/**
 * Several providers in order of preference: the first with real syllables wins; if none has them, the first with line timing.
 * A provider that fails (offline, bad key, rate limit) does not stop another from answering; the error surfaces only when
 * nobody had lyrics.
 */
export class ChainProvider implements LyricsProvider {
  private readonly providers: readonly LyricsProvider[];

  constructor(providers: readonly LyricsProvider[]) {
    this.providers = providers;
  }

  async fetch(query: TrackQuery): Promise<Lyrics | null> {
    let best: Lyrics | null = null;
    let failure: ProviderError | null = null;
    for (const provider of this.providers) {
      let lyrics: Lyrics | null;
      try {
        lyrics = await provider.fetch(query);
      } catch (error) {
        if (!(error instanceof ProviderError)) throw error;
        failure ??= error;
        continue;
      }
      if (lyrics && lyricsKind(lyrics) === 'syllable') return lyrics;
      best ??= lyrics; // line timing: keep looking in case another provider has syllables
    }
    if (best === null && failure) throw failure;
    return best;
  }
}
