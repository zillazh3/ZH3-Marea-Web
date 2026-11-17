<script lang="ts">
  import type { Component } from 'svelte';
  import { router } from './router/router.svelte';
  import type { RouteId } from './router/routes';
  import Callback from './screens/Callback.svelte';
  import Editor from './screens/Editor.svelte';
  import Exports from './screens/Exports.svelte';
  import Home from './screens/Home.svelte';
  import Library from './screens/Library.svelte';
  import Search from './screens/Search.svelte';
  import Settings from './screens/Settings.svelte';
  import Shell from './shell/Shell.svelte';

  const SCREENS: Record<RouteId, Component> = {
    home: Home,
    search: Search,
    editor: Editor,
    library: Library,
    exports: Exports,
    settings: Settings,
  };

  const Screen = $derived(SCREENS[router.current]);
</script>

<Shell>
  {#if router.callbackActive}
    <Callback />
  {:else}
    <Screen />
  {/if}
</Shell>
