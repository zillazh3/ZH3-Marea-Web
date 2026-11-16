import type { Lyrics } from '@/features/lyrics/model';

export interface TrackQuery {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  /** Spicy Lyrics identifies tracks by Spotify id. */
  spotifyId?: string;
}

export interface LyricsProvider {
  /** Lyrics of the track, or null when the provider has none. Throws `ProviderError` when it cannot answer. */
  fetch(query: TrackQuery): Promise<Lyrics | null>;
}
