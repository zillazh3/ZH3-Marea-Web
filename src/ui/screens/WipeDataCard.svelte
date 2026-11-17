<script lang="ts">
  import { wipeAllData } from '@/features/storage/wipe';
  import { downloadAllSaved } from '../actions';
  import Button from '../components/Button.svelte';
  import { i18n } from '../i18n.svelte';
  import { library } from '../state/library.svelte';

  const m = $derived(i18n.m);
  let dialog: HTMLDialogElement | undefined = $state();
  let working = $state(false);
  let failed = $state(false);

  function open(): void {
    failed = false;
    dialog?.showModal();
  }

  async function confirm(): Promise<void> {
    working = true;
    failed = false;
    try {
      await wipeAllData();
      location.replace('/app/'); // a fresh load, so nothing in memory writes the deleted data back
    } catch {
      failed = true;
      working = false;
    }
  }
</script>

<section class="card">
  <h2>{m.settings.dataTitle}</h2>
  <p class="hint">{m.settings.dataIntro}</p>
  <div>
    <Button variant="danger" onclick={open}>{m.settings.wipeButton}</Button>
  </div>
</section>

<dialog
  bind:this={dialog}
  aria-labelledby="wipe-title"
  oncancel={(event) => {
    if (working) event.preventDefault();
  }}
>
  <h2 id="wipe-title">{m.settings.wipeTitle}</h2>
  <p>{m.settings.wipeIntro}</p>
  <ul>
    {#each m.settings.wipeItems as item (item)}
      <li>{item}</li>
    {/each}
  </ul>
  {#if library.items.length > 0}
    <p class="hint">{m.settings.wipeBackupHint}</p>
    <div>
      <Button icon="download" disabled={working} onclick={() => void downloadAllSaved()}>
        {m.settings.wipeBackup(library.items.length)}
      </Button>
    </div>
  {/if}
  {#if failed}
    <p class="error" role="alert">{m.settings.wipeFailed}</p>
  {/if}
  <div class="actions">
    <Button
      disabled={working}
      onclick={() => {
        dialog?.close();
      }}
    >
      {m.settings.wipeCancel}
    </Button>
    <Button variant="danger" disabled={working} onclick={() => void confirm()}>
      {working ? m.settings.wipeWorking : m.settings.wipeConfirm}
    </Button>
  </div>
</dialog>

<style>
  .card {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  h2 {
    font-size: var(--fs-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .hint {
    color: var(--faint);
    font-size: var(--fs-xs);
  }

  dialog {
    margin: 12vh auto 0;
    width: min(480px, calc(100vw - 2 * var(--space-4)));
    padding: var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--r-card);
    background: var(--pop-bg);
    color: var(--text);
    box-shadow: var(--shadow-palette);
  }

  dialog[open] {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  dialog::backdrop {
    background: var(--scrim);
    backdrop-filter: blur(6px);
  }

  dialog p,
  li {
    font-size: var(--fs-sm);
  }

  ul {
    list-style: disc;
    padding-left: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .error {
    color: var(--danger);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
</style>
