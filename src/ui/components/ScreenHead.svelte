<script lang="ts">
  import type { Snippet } from 'svelte';
  import { layout } from '../state/layout.svelte';

  interface Props {
    title: string;
    subtitle?: string;
    children?: Snippet;
  }

  const { title, subtitle, children }: Props = $props();
</script>

<div class="head" class:dock={layout.isDock} class:has-end={Boolean(children)}>
  <h1>{title}</h1>
  {#if subtitle}<span class="sub">{subtitle}</span>{/if}
  {#if children}<div class="end">{@render children()}</div>{/if}
</div>

<style>
  .head {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
  }

  /* Leave room for the fixed top-right DockSettings gear (38 px) in phone/landscape dock mode. */
  .head.dock {
    padding-right: calc(38px + var(--space-3));
  }

  .head.dock.has-end .end {
    margin-left: 0;
  }

  .sub {
    color: var(--muted);
    font-size: var(--fs-md);
  }

  .end {
    margin-left: auto;
  }
</style>
