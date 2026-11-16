<script lang="ts">
  interface Props {
    checked: boolean;
    label: string;
    onchange: (checked: boolean) => void;
  }

  const { checked, label, onchange }: Props = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  onclick={() => {
    onchange(!checked);
  }}
></button>

<style>
  button {
    position: relative;
    width: 38px;
    height: 22px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    border: 1px solid var(--border);
    flex: none;
    transition: background var(--dur-fast);
  }

  button::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text);
    transition: transform var(--dur-ui) var(--ease);
  }

  button[aria-checked='true'] {
    background: var(--grad);
    border-color: transparent;
  }

  button[aria-checked='true']::after {
    transform: translateX(16px);
    background: var(--on-accent);
  }
</style>
