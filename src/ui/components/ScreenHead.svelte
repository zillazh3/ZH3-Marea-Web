<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle?: string;
    children?: Snippet;
  }

  const { title, subtitle, children }: Props = $props();
</script>

<div class="head">
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

  .sub {
    color: var(--muted);
    font-size: var(--fs-md);
  }

  .end {
    margin-left: auto;
  }
</style>
