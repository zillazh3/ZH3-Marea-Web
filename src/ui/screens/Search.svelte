<script lang="ts">
  import { trackKind, type LrclibTrack } from '@/features/providers/lrclib';
  import { toneFor } from '@/features/storage/meta';
  import { createFromTrack } from '../actions';
  import Badge from '../components/Badge.svelte';
  import Button from '../components/Button.svelte';
  import Empty from '../components/Empty.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import { describeError } from '../errors';
  import { i18n } from '../i18n.svelte';
  import Icon from '../icons/Icon.svelte';
  import { lrclib } from '../services';
  import Cover from '../shell/Cover.svelte';

  /** Wait for a pause in typing so each keystroke does not become a request. */
  const DEBOUNCE_MS = 350;
  const MIN_QUERY_LENGTH = 2;
  /** Songs with syllable timing first, then line timing, then the ones without lyrics. */
  const KIND_RANK = { syllable: 0, line: 1, none: 2 } as const;

  type Status =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'done'; tracks: readonly LrclibTrack[] }
    | { kind: 'failed'; message: string };

  const m = $derived(i18n.m);
  let query = $state('');
  let status = $state.raw<Status>({ kind: 'idle' });
  /** Id of the track whose lyrics are being opened, so its button cannot be pressed twice. */
  let opening = $state<number | null>(null);

  $effect(() => {
    const text = query.trim();
    if (text.length < MIN_QUERY_LENGTH) {
      status = { kind: 'idle' };
      return;
    }
    status = { kind: 'loading' };
    let stale = false;
    const timer = setTimeout(() => {
      lrclib.search(text).then(
        (found) => {
          if (stale) return;
          const tracks = found.toSorted(
            (a, b) => KIND_RANK[trackKind(a)] - KIND_RANK[trackKind(b)],
          );
          status = { kind: 'done', tracks };
        },
        (error: unknown) => {
          if (!stale) status = { kind: 'failed', message: describeError(i18n.m, error) };
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  async function create(track: LrclibTrack): Promise<void> {
    opening = track.id;
    await createFromTrack(track);
    opening = null;
  }
</script>

<ScreenHead title={m.nav.search} subtitle={m.search.subtitle} />

<div class="search-box">
  <Icon name="search" />
  <input
    type="search"
    bind:value={query}
    placeholder={m.search.placeholder}
    aria-label={m.search.label}
    autocomplete="off"
  />
</div>

<div class="results" aria-live="polite">
  {#if status.kind === 'idle'}
    <p class="note">{m.search.prompt}</p>
  {:else if status.kind === 'loading'}
    <p class="note">{m.search.searching}</p>
  {:else if status.kind === 'failed'}
    <p class="note" role="alert">{status.message}</p>
  {:else if status.tracks.length === 0}
    <Empty title={m.search.emptyTitle} hint={m.search.emptyHint} />
  {:else}
    {#each status.tracks as track (track.id)}
      {@const kind = trackKind(track)}
      <div class="result">
        <div class="art"><Cover tone={toneFor(track.trackName, track.artistName)} /></div>
        <div class="text">
          <div class="title">{track.trackName}</div>
          <div class="artist">{track.artistName}</div>
        </div>
        <Badge {kind} label={m.search.kind[kind]} />
        <Button
          disabled={kind === 'none' || opening !== null}
          title={kind === 'none' ? m.search.noSyncedLyrics : undefined}
          onclick={() => void create(track)}
        >
          {opening === track.id ? m.search.fetching : m.search.createClip}
        </Button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .search-box {
    position: relative;
    max-width: 640px;
    margin-bottom: var(--space-4);
    color: var(--faint);
    --icon-size: 18px;
  }

  .search-box :global(.icon) {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
  }

  input {
    width: 100%;
    height: 46px;
    padding: 0 var(--space-3) 0 44px;
    border-radius: var(--r-card);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: var(--fs-md);
    outline: none;
  }

  input:focus {
    border-color: var(--accent);
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 860px;
  }

  .note {
    color: var(--muted);
    padding: var(--space-3) 0;
  }

  .result {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto auto;
    gap: 14px;
    align-items: center;
    padding: var(--space-2) 10px;
    border-radius: 12px;
  }

  .result:hover {
    background: var(--hover);
  }

  .art {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    overflow: hidden;
  }

  .title {
    font-weight: 600;
  }

  .artist {
    font-size: var(--fs-sm);
    color: var(--muted);
  }

  .title,
  .artist {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 760px) {
    .result {
      grid-template-columns: 48px minmax(0, 1fr) auto;
    }

    .result :global(.badge) {
      display: none;
    }
  }
</style>
