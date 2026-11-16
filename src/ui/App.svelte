<script lang="ts">
  import type { Component } from 'svelte';
  import { i18n } from './i18n.svelte';
  import Link from './router/Link.svelte';
  import { router } from './router/router.svelte';
  import { ROUTES, type RouteId } from './router/routes';
  import Ajustes from './screens/Ajustes.svelte';
  import Biblioteca from './screens/Biblioteca.svelte';
  import Buscar from './screens/Buscar.svelte';
  import Callback from './screens/Callback.svelte';
  import Editor from './screens/Editor.svelte';
  import Exportaciones from './screens/Exportaciones.svelte';
  import Inicio from './screens/Inicio.svelte';

  const SCREENS: Record<RouteId, Component> = {
    inicio: Inicio,
    buscar: Buscar,
    editor: Editor,
    biblioteca: Biblioteca,
    exportaciones: Exportaciones,
    ajustes: Ajustes,
    callback: Callback,
  };

  const NAV_ROUTES = ROUTES.filter((route) => route !== 'callback');
  const Screen = $derived(SCREENS[router.current]);
  const section = $derived(i18n.m.nav[router.current === 'callback' ? 'spotify' : router.current]);

  let main: HTMLElement | undefined = $state();
  let shownRoute = router.current;

  $effect(() => {
    document.title = i18n.m.app.documentTitle(section);
    document.documentElement.lang = i18n.locale;
  });

  // Move focus to the new screen so keyboard and screen-reader users land on it; the initial load keeps focus untouched.
  $effect(() => {
    const route = router.current;
    if (route === shownRoute) return;
    shownRoute = route;
    main?.focus();
  });
</script>

<nav aria-label={i18n.m.nav.label}>
  {#each NAV_ROUTES as route (route)}
    <Link {route}>{i18n.m.nav[route]}</Link>
  {/each}
</nav>

<main bind:this={main} tabindex="-1">
  <Screen />
</main>

<style>
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-4);
  }

  nav :global(a) {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--r-ctl);
    color: var(--muted);
  }

  nav :global(a[aria-current='page']) {
    color: var(--text);
    background: var(--pill);
  }

  main {
    padding: var(--space-4);
    outline: none;
  }
</style>
