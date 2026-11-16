<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../icons/Icon.svelte';
  import type { IconName } from '../icons/icons';
  import Link from '../router/Link.svelte';
  import type { RouteId } from '../router/routes';
  import { layout } from '../state/layout.svelte';
  import { tip } from './tooltip.svelte';

  interface Props {
    route: RouteId;
    icon: IconName;
    label: string;
    /** Draws the icon on the brand gradient (the Editor in the dock). */
    featured?: boolean;
    /** Extra content over the icon (the export ring). */
    overlay?: Snippet;
    /** Content after the label (the export count). */
    trailing?: Snippet;
  }

  const { route, icon, label, featured = false, overlay, trailing }: Props = $props();
</script>

<Link
  {route}
  class={['nav-item', { dock: layout.isDock, collapsed: layout.railCollapsed, featured }]}
  {@attach tip(
    () => label,
    () => layout.railCollapsed && !layout.isDock,
  )}
>
  <span class="ico">
    {@render overlay?.()}
    <Icon name={icon} />
  </span>
  <span class="label">{label}</span>
  {@render trailing?.()}
</Link>

<style>
  :global(.nav-item) {
    position: relative;
    z-index: 1;
    width: 100%;
    height: var(--nav-h);
    display: grid;
    grid-template-columns: 56px 1fr auto;
    align-items: center;
    border-radius: var(--r-nav);
    color: var(--muted);
    font-weight: 500;
    font-size: var(--fs-body);
    white-space: nowrap;
    transition:
      color var(--dur-fast),
      background var(--dur-fast);
  }

  :global(.nav-item:hover) {
    color: var(--text);
    background: var(--hover);
  }

  :global(.nav-item[aria-current='page']) {
    color: var(--text);
    font-weight: 600;
    background: none;
  }

  :global(.nav-item[aria-current='page'] .ico) {
    color: var(--accent-icon);
  }

  .ico {
    position: relative;
    justify-self: center;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
  }

  .label {
    transition: opacity var(--dur-label);
  }

  :global(.nav-item.collapsed) .label {
    opacity: 0;
    pointer-events: none;
  }

  /* Bottom dock: icon over label, five equal slots. */
  :global(.nav-item.dock) {
    height: var(--nav-h-dock);
    grid-template-columns: 1fr;
    grid-template-rows: 30px auto;
    justify-items: center;
    align-content: center;
    font-size: 11px;
  }

  :global(.nav-item.dock) .label {
    opacity: 1;
  }

  :global(.nav-item.dock.featured) .ico {
    background: var(--grad);
    border-radius: var(--r-ctl);
    color: var(--on-accent);
  }
</style>
