<script lang="ts">
  import type { Snippet } from 'svelte';
  import { i18n } from '../i18n.svelte';
  import { router } from '../router/router.svelte';
  import { layout } from '../state/layout.svelte';
  import { palette } from '../state/palette.svelte';
  import { theme } from '../state/theme.svelte';
  import { configuredSourceUrl } from '../sourceUrl';
  import Ambient from './Ambient.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import DockSettings from './DockSettings.svelte';
  import MobilePlayer from './MobilePlayer.svelte';
  import Rail from './Rail.svelte';
  import SvgDefs from './SvgDefs.svelte';
  import Toasts from './Toasts.svelte';
  import TipBubble from './TipBubble.svelte';

  interface Props {
    children: Snippet;
  }

  const { children }: Props = $props();

  const section = $derived(i18n.m.nav[router.callbackActive ? 'spotify' : router.current]);
  const sourceUrl = configuredSourceUrl();

  let main: HTMLElement | undefined = $state();
  let shownView = router.callbackActive ? 'callback' : router.current;

  $effect(() => {
    document.title = i18n.m.app.documentTitle(section);
    document.documentElement.lang = i18n.locale;
    document.documentElement.setAttribute('data-theme', theme.resolved);
  });

  // Move focus to the new screen so keyboard and screen-reader users land on it; the initial load keeps focus untouched.
  $effect(() => {
    const view = router.callbackActive ? 'callback' : router.current;
    if (view === shownView) return;
    shownView = view;
    main?.focus();
  });

  function onkeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === 'k') {
      event.preventDefault();
      palette.toggle();
    } else if (key === 'b') {
      event.preventDefault();
      layout.toggleRail();
    }
  }
</script>

<svelte:window {onkeydown} />

<SvgDefs />
<Ambient />
<Rail />

<main
  bind:this={main}
  tabindex="-1"
  class:collapsed={layout.railCollapsed}
  class:dock={layout.isDock}
>
  {@render children()}
  {#if sourceUrl}
    <footer class="app-footer">
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{i18n.m.settings.sourceCode}</a>
    </footer>
  {/if}
</main>

<DockSettings />
<MobilePlayer />
<CommandPalette />
<Toasts />
<TipBubble />

<style>
  main {
    min-height: 100dvh;
    padding: var(--page-pad);
    margin-left: calc(var(--rail-w) + 2 * var(--rail-gap) + env(safe-area-inset-left));
    max-width: calc(var(--screen-max) + var(--rail-w) + 2 * var(--rail-gap));
    outline: none;
    transition: margin-left var(--dur-rail) var(--ease);
  }

  main.collapsed {
    margin-left: calc(var(--rail-w-collapsed) + 2 * var(--rail-gap) + env(safe-area-inset-left));
  }

  main.dock {
    margin-left: 0;
    padding: var(--page-pad-dock);
    padding-left: calc(var(--space-4) + env(safe-area-inset-left));
    padding-right: calc(var(--space-4) + env(safe-area-inset-right));
  }

  .app-footer {
    margin-top: var(--space-6);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
    font-size: var(--fs-xs);
  }

  .app-footer a {
    color: var(--faint);
    text-decoration: none;
  }

  .app-footer a:hover {
    color: var(--text);
    text-decoration: underline;
  }
</style>
