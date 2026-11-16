<script lang="ts">
  import type { Snippet } from 'svelte';
  import { router } from './router.svelte';
  import { pathFor, type RouteId } from './routes';

  interface Props {
    route: RouteId;
    children: Snippet;
  }

  const { route, children }: Props = $props();

  function onclick(event: MouseEvent): void {
    // Let the browser handle new-tab and modified clicks.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    router.navigate(route);
  }
</script>

<a href={pathFor(route)} aria-current={router.current === route ? 'page' : undefined} {onclick}>
  {@render children()}
</a>
