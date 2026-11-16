<script lang="ts" generics="T extends string">
  interface Props {
    label: string;
    value: T;
    options: readonly { value: T; label: string }[];
    onchange: (value: T) => void;
  }

  const { label, value, options, onchange }: Props = $props();
</script>

<div class="seg" role="group" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      aria-pressed={option.value === value}
      onclick={() => {
        onchange(option.value);
      }}>{option.label}</button
    >
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 3px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    gap: 2px;
  }

  button {
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: 9px;
    color: var(--muted);
    font-weight: 500;
    font-size: var(--fs-sm);
    white-space: nowrap;
  }

  button:hover {
    color: var(--text);
  }

  button[aria-pressed='true'] {
    background: var(--pill);
    color: var(--text);
    box-shadow: inset 0 0 0 1px var(--border);
  }
</style>
