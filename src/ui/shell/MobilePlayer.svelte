<script lang="ts">
  import Icon from '../icons/Icon.svelte';
  import { i18n } from '../i18n.svelte';
  import { layout } from '../state/layout.svelte';
  import { player } from '../state/player.svelte';
  import Cover from './Cover.svelte';

  const m = $derived(i18n.m.player);
  const track = $derived(player.track);
</script>

{#if track && layout.isDock}
  <div class="player" role="group" aria-label={m.nowPlaying}>
    <div class="cover"><Cover tone={track.tone} /></div>
    <div class="meta">
      <div class="t">{track.title}</div>
      <div class="a">{track.artist}</div>
    </div>
    <button
      class="play"
      type="button"
      aria-label={player.playing ? m.pause : m.play}
      onclick={() => {
        player.togglePlaying();
      }}
    >
      <Icon name={player.playing ? 'pause' : 'play'} />
    </button>
  </div>
{/if}

<style>
  .player {
    position: fixed;
    z-index: 19;
    left: calc(var(--space-4) + env(safe-area-inset-left));
    right: calc(var(--space-4) + env(safe-area-inset-right));
    bottom: calc(var(--mobile-player-bottom) + env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: 36px 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 7px var(--space-2);
    border-radius: var(--r-card);
    background: var(--rail-bg);
    border: 1px solid var(--border);
    backdrop-filter: blur(22px);
  }

  /* Sideways on a phone there is no vertical room for both the player and the dock. */
  @media (max-height: 500px) {
    .player {
      display: none;
    }
  }

  .cover {
    width: 36px;
    height: 36px;
    border-radius: var(--space-2);
    overflow: hidden;
  }

  .meta {
    min-width: 0;
  }

  .t {
    font-weight: 600;
    font-size: var(--fs-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .a {
    font-size: var(--fs-xs);
    color: var(--muted);
  }

  .play {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--r-ctl);
  }
</style>
