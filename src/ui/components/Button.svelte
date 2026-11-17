<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from '../icons/Icon.svelte';
  import type { IconName } from '../icons/icons';

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'default' | 'danger';
    icon?: IconName;
    children: Snippet;
  }

  const { variant = 'default', icon, children, ...rest }: Props = $props();
</script>

<button class={variant} type="button" {...rest}>
  {#if icon}<Icon name={icon} />{/if}
  {@render children()}
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    font-weight: 500;
    white-space: nowrap;
    --icon-size: 16px;
  }

  button:hover {
    background: var(--hover);
  }

  button.primary {
    background: var(--grad);
    border-color: transparent;
    color: var(--on-accent);
    font-weight: 600;
  }

  button.primary:hover {
    background: var(--grad-hover);
  }

  button.danger {
    border-color: var(--danger);
    color: var(--danger);
    font-weight: 600;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
