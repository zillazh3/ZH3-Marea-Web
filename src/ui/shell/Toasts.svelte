<script lang="ts">
  import { i18n } from '../i18n.svelte';
  import { layout } from '../state/layout.svelte';
  import { notifications } from '../state/toasts.svelte';
</script>

<div
  class="toasts"
  class:dock={layout.isDock}
  role="status"
  aria-live="polite"
  aria-label={i18n.m.shell.notifications}
>
  {#each notifications.items as toast (toast.id)}
    <div class="toast" class:ok={toast.kind === 'ok'}>{toast.message}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    z-index: 70;
    right: var(--space-6);
    bottom: var(--space-6);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
    pointer-events: none;
  }

  .toasts.dock {
    right: 50%;
    transform: translateX(50%);
    align-items: center;
    bottom: calc(var(--dock-clearance) + env(safe-area-inset-bottom));
  }

  .toast {
    padding: 10px var(--space-4);
    border-radius: var(--r-pill);
    background: var(--pop-bg);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-toast);
    font-size: var(--fs-sm);
    animation: rise var(--dur-toast) var(--ease);
  }

  .toast.ok {
    border-color: color-mix(in srgb, var(--ok) 50%, var(--border));
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
</style>
