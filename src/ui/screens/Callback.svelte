<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../components/Button.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import { describeError } from '../errors';
  import { i18n } from '../i18n.svelte';
  import { router } from '../router/router.svelte';
  import { ROUTES, type RouteId } from '../router/routes';
  import { spotifyStatus } from '../state/spotify.svelte';
  import { notifications } from '../state/toasts.svelte';

  const m = $derived(i18n.m);
  let errorMessage = $state('');

  onMount(() => {
    void (async () => {
      const search = window.location.search;
      try {
        const target = await spotifyStatus.completeCallback(search);
        notifications.show(m.settings.spotifyConnectedToast, 'ok');
        const nextRoute: RouteId = (ROUTES as readonly string[]).includes(target)
          ? (target as RouteId)
          : 'settings';
        router.finishCallback(nextRoute);
      } catch (error) {
        errorMessage = describeError(i18n.m, error);
        router.clearCallbackUrl();
      }
    })();
  });
</script>

<ScreenHead title={m.nav.spotify} />

<div class="card box">
  {#if errorMessage}
    <p class="err" role="alert">{errorMessage}</p>
    <div>
      <Button
        variant="primary"
        onclick={() => {
          router.navigate('settings');
        }}>{m.settings.spotifyCallbackBack}</Button
      >
    </div>
  {:else}
    <p class="msg">{m.settings.spotifyCallbackWorking}</p>
  {/if}
</div>

<style>
  .box {
    max-width: 480px;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .msg {
    color: var(--muted);
    font-size: var(--fs-md);
  }

  .err {
    color: var(--danger);
    font-size: var(--fs-md);
  }
</style>
