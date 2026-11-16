<script lang="ts">
  import Icon from '../icons/Icon.svelte';
  import { i18n } from '../i18n.svelte';
  import Link from '../router/Link.svelte';
  import { layout } from '../state/layout.svelte';
</script>

<!-- The dock has no room for a sixth item, so phones reach Ajustes from the top corner like the mockup. -->
{#if layout.isDock}
  <Link route="settings" class="dock-settings" aria-label={i18n.m.nav.settings}>
    <Icon name="settings" />
  </Link>
{/if}

<style>
  :global(.dock-settings) {
    position: fixed;
    z-index: 18;
    top: var(--space-4);
    right: var(--space-4);
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: var(--r-ctl);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
    --icon-size: 18px;
  }

  :global(.dock-settings[aria-current='page']) {
    color: var(--text);
    background: var(--pill);
  }
</style>
