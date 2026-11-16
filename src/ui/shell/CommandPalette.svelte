<script lang="ts">
  import { matchesQuery } from '@/shared/text';
  import { openDemo, openProjectFile, openTtml } from '../actions';
  import Icon from '../icons/Icon.svelte';
  import { i18n } from '../i18n.svelte';
  import { router } from '../router/router.svelte';
  import { layout } from '../state/layout.svelte';
  import { palette } from '../state/palette.svelte';
  import { theme } from '../state/theme.svelte';
  import { buildCommands, type Command } from './commands';

  const m = $derived(i18n.m);
  const commands = $derived(
    buildCommands(m, {
      navigate: (route) => {
        router.navigate(route);
      },
      toggleTheme: () => {
        theme.toggle();
      },
      toggleRail: () => {
        layout.toggleRail();
      },
      openTtml: () => void openTtml(),
      openProject: () => void openProjectFile(),
      openDemo: () => void openDemo(),
    }),
  );

  let dialog: HTMLDialogElement | undefined = $state();
  let query = $state('');
  let active = $state(0);

  const results = $derived(
    commands.filter((command) => matchesQuery(`${command.label} ${command.keywords}`, query)),
  );
  const activeCommand = $derived(results[active]);
  const activeId = $derived(activeCommand ? optionId(activeCommand) : undefined);

  function optionId(command: Command): string {
    return `palette-option-${command.id}`;
  }

  function groupLabel(group: Command['group']): string {
    return group === 'goTo' ? m.palette.goTo : m.palette.action;
  }

  function run(command: Command): void {
    palette.hide();
    command.run();
  }

  // The dialog element owns focus trapping and Escape; the store only mirrors its state.
  $effect(() => {
    if (!dialog) return;
    if (palette.open && !dialog.open) {
      query = '';
      active = 0;
      dialog.showModal();
    } else if (!palette.open && dialog.open) {
      dialog.close();
    }
  });

  function onkeydown(event: KeyboardEvent): void {
    if (results.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + results.length) % results.length;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = results[active];
      if (command) run(command);
    }
  }

  function onBackdropClick(event: MouseEvent): void {
    if (event.target === dialog) palette.hide();
  }
</script>

<!-- The backdrop click is a pointer shortcut; Escape already closes the dialog natively. -->
<dialog
  bind:this={dialog}
  aria-label={m.palette.label}
  onclose={() => {
    palette.hide();
  }}
  onclick={onBackdropClick}
>
  <div class="panel">
    <div class="field">
      <Icon name="search" />
      <input
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-results"
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        autocomplete="off"
        spellcheck="false"
        placeholder={m.palette.placeholder}
        aria-label={m.palette.label}
        bind:value={query}
        oninput={() => {
          active = 0;
        }}
        {onkeydown}
      />
    </div>

    <ul id="palette-results" class="results" role="listbox" aria-label={m.palette.label}>
      {#each results as command, index (command.id)}
        {#if index === 0 || results[index - 1]?.group !== command.group}
          <li class="group" role="presentation">{groupLabel(command.group)}</li>
        {/if}
        <li role="presentation">
          <button
            id={optionId(command)}
            class="option"
            class:active={index === active}
            type="button"
            role="option"
            tabindex="-1"
            aria-selected={index === active}
            onmousemove={() => {
              active = index;
            }}
            onclick={() => {
              run(command);
            }}
          >
            <Icon name={command.icon} />
            <span class="label">{command.label}</span>
            {#if command.shortcut}<kbd>{command.shortcut}</kbd>{/if}
          </button>
        </li>
      {/each}
    </ul>

    {#if results.length === 0}
      <p class="none" role="status">{m.palette.none}</p>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    margin: 12vh auto 0;
    width: min(560px, calc(100vw - 2 * var(--space-4)));
    max-height: 70vh;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--r-card);
    background: var(--pop-bg);
    color: var(--text);
    box-shadow: var(--shadow-palette);
    overflow: hidden;
  }

  dialog::backdrop {
    background: var(--scrim);
    backdrop-filter: blur(6px);
  }

  dialog[open] {
    animation: pop var(--dur-pop) var(--ease);
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.98);
    }
  }

  .panel {
    display: flex;
    flex-direction: column;
    max-height: inherit;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 var(--space-4);
    height: 54px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
    --icon-size: 18px;
  }

  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: none;
    border: 0;
    color: var(--text);
    font: inherit;
    font-size: var(--fs-md);
  }

  input::placeholder {
    color: var(--faint);
  }

  /* The dialog already shows a ring through :focus-within below. */
  input:focus-visible {
    outline: none;
  }

  .field:focus-within {
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  .results {
    list-style: none;
    padding: 6px;
    overflow-y: auto;
  }

  .group {
    padding: 10px 10px 4px;
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .option {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    height: 40px;
    padding: 0 10px;
    border-radius: var(--r-ctl);
    color: var(--text);
    text-align: left;
    --icon-size: 18px;
  }

  .option.active {
    background: var(--pill);
  }

  .label {
    flex: 1;
  }

  kbd {
    font: inherit;
    font-size: 11px;
    color: var(--faint);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
  }

  .none {
    padding: var(--space-5) var(--space-4);
    color: var(--muted);
    text-align: center;
  }
</style>
