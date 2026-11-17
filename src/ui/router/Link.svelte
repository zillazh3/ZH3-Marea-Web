<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import { router } from './router.svelte';
  import { hashFor, type RouteId } from './routes';

  interface Props extends Omit<HTMLAnchorAttributes, 'href' | 'children'> {
    route: RouteId;
    children: Snippet;
  }

  const { route, children, ...rest }: Props = $props();

  function onclick(event: MouseEvent): void {
    // Let the browser handle new-tab and modified clicks.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    router.navigate(route);
  }
</script>

<a
  {...rest}
  href={hashFor(route)}
  aria-current={!router.callbackActive && router.current === route ? 'page' : undefined}
  {onclick}
>
  {@render children()}
</a>
