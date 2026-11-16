<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    hint: string;
    children?: Snippet;
  }

  const { title, hint, children }: Props = $props();
</script>

<div class="empty">
  <b>{title}</b>
  <p>{hint}</p>
  {@render children?.()}
</div>

<style>
  .empty {
    padding: 48px var(--space-6);
    text-align: center;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  b {
    color: var(--text);
    font-size: var(--fs-md);
  }

  p {
    margin-bottom: var(--space-3);
  }
</style>
