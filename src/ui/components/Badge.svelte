<script lang="ts">
  interface Props {
    kind: 'syllable' | 'line' | 'none';
    label: string;
  }

  const { kind, label }: Props = $props();
</script>

<span class="badge {kind}">{label}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-xs);
    color: var(--muted);
    white-space: nowrap;
  }

  .badge::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--faint);
  }

  .syllable::before {
    background: var(--ok);
  }

  .line::before {
    background: var(--accent-icon);
  }
</style>
