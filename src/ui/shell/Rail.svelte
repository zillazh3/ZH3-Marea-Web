<script lang="ts">
  import Icon from '../icons/Icon.svelte';
  import { i18n } from '../i18n.svelte';
  import { exportQueue } from '../state/exportQueue.svelte';
  import { layout } from '../state/layout.svelte';
  import { palette } from '../state/palette.svelte';
  import { spotifyStatus } from '../state/spotify.svelte';
  import ExportRing from './ExportRing.svelte';
  import NavItem from './NavItem.svelte';
  import NowPlaying from './NowPlaying.svelte';
  import RailHead from './RailHead.svelte';
  import Tide from './Tide.svelte';
  import { tip } from './tooltip.svelte';

  const m = $derived(i18n.m);
  let rail: HTMLElement | undefined = $state();

  const ARROW_STEP: Record<string, number> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowUp: -1,
    ArrowLeft: -1,
  };

  /** Arrow keys move focus between the navigation items, wrapping around. */
  function onkeydown(event: KeyboardEvent): void {
    const step = ARROW_STEP[event.key];
    if (step === undefined || !rail) return;
    const items = [...rail.querySelectorAll<HTMLElement>('.nav-item')].filter(
      (item) => item.offsetParent !== null,
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    items[(index + step + items.length) % items.length]?.focus();
  }
</script>

<!-- Arrow keys are a convenience on top of the links, which stay reachable with Tab. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<nav
  bind:this={rail}
  class="rail"
  class:collapsed={layout.railCollapsed}
  class:dock={layout.isDock}
  aria-label={m.nav.label}
  {onkeydown}
>
  <Tide {rail} />

  {#if !layout.isDock}
    <RailHead />
    <button
      class="cmd"
      type="button"
      aria-keyshortcuts="Control+K"
      onclick={() => {
        palette.show();
      }}
      {@attach tip(
        () => `${m.shell.openPalette} (${m.shell.paletteShortcut})`,
        () => layout.railCollapsed,
      )}
    >
      <Icon name="search" />
      <span>{m.shell.openPalette}</span>
      <kbd>{m.shell.paletteShortcut}</kbd>
    </button>
  {/if}

  <ul class="nav">
    <li><NavItem route="home" icon="house" label={m.nav.home} /></li>
    <li><NavItem route="search" icon="search" label={m.nav.search} /></li>
    <li><NavItem route="editor" icon="sliders-horizontal" label={m.nav.editor} featured /></li>
    {#if !layout.isDock}<li class="sep" aria-hidden="true"></li>{/if}
    <li><NavItem route="library" icon="library" label={m.nav.library} /></li>
    <li>
      <NavItem route="exports" icon="download" label={m.nav.exports}>
        {#snippet overlay()}
          <ExportRing progress={exportQueue.progress} />
        {/snippet}
        {#snippet trailing()}
          {#if exportQueue.pending > 0}
            <span class="count">
              <span aria-hidden="true">{exportQueue.pending}</span>
              <span class="sr-only">{m.shell.queueCount(exportQueue.pending)}</span>
            </span>
          {/if}
        {/snippet}
      </NavItem>
    </li>
  </ul>

  {#if !layout.isDock}
    <div class="spacer"></div>
    <ul class="nav">
      <li><NavItem route="settings" icon="settings" label={m.nav.settings} /></li>
    </ul>
    <div
      class="status"
      {@attach tip(
        () => (spotifyStatus.connected ? m.shell.spotifyConnected : m.shell.spotifyDisconnected),
        () => layout.railCollapsed,
      )}
    >
      <i class="dot" class:ok={spotifyStatus.connected}></i>
      <span>{spotifyStatus.connected ? m.shell.spotifyConnected : m.shell.spotifyDisconnected}</span
      >
    </div>
    <NowPlaying />
  {/if}
</nav>

<style>
  .rail {
    position: fixed;
    z-index: 20;
    top: var(--rail-gap);
    bottom: var(--rail-gap);
    left: calc(var(--rail-gap) + env(safe-area-inset-left));
    width: var(--rail-w);
    display: flex;
    flex-direction: column;
    padding: var(--space-3) 10px;
    gap: var(--space-1);
    border-radius: var(--r-rail);
    background: var(--rail-bg);
    border: 1px solid var(--border);
    backdrop-filter: blur(26px) saturate(150%);
    box-shadow: var(--shadow-rail);
    overflow-x: clip;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    transition: width var(--dur-rail) var(--ease);
  }

  .rail.collapsed {
    width: var(--rail-w-collapsed);
  }

  .rail.dock {
    top: auto;
    left: calc(var(--dock-inset) + env(safe-area-inset-left));
    right: calc(var(--dock-inset) + env(safe-area-inset-right));
    overflow-y: clip;
    bottom: calc(var(--dock-inset) + env(safe-area-inset-bottom));
    width: auto;
    height: var(--dock-h);
    flex-direction: row;
    padding: 6px;
    border-radius: 20px;
  }

  .nav {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dock .nav {
    flex: 1;
    flex-direction: row;
    gap: 0;
  }

  .dock .nav li {
    flex: 1;
  }

  .sep {
    height: 1px;
    background: var(--border);
    margin: var(--space-2) 14px;
  }

  .spacer {
    flex: 1;
  }

  .cmd {
    display: grid;
    grid-template-columns: 56px 1fr auto;
    align-items: center;
    height: 40px;
    border-radius: var(--r-nav);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
    text-align: left;
    margin-bottom: 10px;
    white-space: nowrap;
    --icon-size: 18px;
  }

  .cmd:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .cmd :global(svg) {
    justify-self: center;
  }

  .cmd kbd {
    font: inherit;
    font-size: 11px;
    color: var(--faint);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
    margin-right: var(--space-2);
  }

  .cmd span,
  .cmd kbd,
  .status span {
    transition: opacity var(--dur-label);
  }

  .collapsed .cmd span,
  .collapsed .cmd kbd,
  .collapsed .status span {
    opacity: 0;
    pointer-events: none;
  }

  .status {
    display: grid;
    grid-template-columns: 56px 1fr;
    align-items: center;
    height: 30px;
    color: var(--muted);
    font-size: var(--fs-sm);
    white-space: nowrap;
  }

  .dot {
    justify-self: center;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--faint);
  }

  .dot.ok {
    background: var(--ok);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--ok) 18%, transparent);
  }

  .count {
    display: grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    margin-right: 10px;
    border-radius: var(--r-pill);
    background: var(--grad);
    color: var(--on-accent);
    font-size: 11px;
    font-weight: 600;
  }

  .collapsed .count {
    position: absolute;
    top: 3px;
    left: 36px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    margin: 0;
    font-size: 10px;
  }

  .dock .count {
    position: absolute;
    top: 2px;
    left: calc(50% + 6px);
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    margin: 0;
    font-size: 10px;
  }
</style>
