<script lang="ts">
  import {
    PRESET_SECTIONS,
    changedSections,
    currentPresetValues,
    type PresetSection,
  } from '@/features/presets/schema';
  import { presetStore } from '@/features/storage/presets';
  import Button from '../components/Button.svelte';
  import { describeError } from '../errors';
  import { downloadText, pickFile, readText } from '../files';
  import { i18n } from '../i18n.svelte';
  import Icon from '../icons/Icon.svelte';
  import { notifications } from '../state/toasts.svelte';
  import type { EditorController } from './editorState.svelte';

  interface Props {
    editor: EditorController;
  }

  const { editor }: Props = $props();
  const m = $derived(i18n.m.editor.style);

  let selectedName = $state('');
  let selectedSections = $state<Record<PresetSection, boolean>>({
    tipografia: true,
    color: true,
    fondo: true,
    efectos: true,
    marca_de_agua: true,
  });
  let menuOpen = $state(false);
  let promptMode = $state<'save' | 'rename' | null>(null);
  let promptValue = $state('');
  let confirmDelete = $state(false);

  const selectedEntry = $derived(
    editor.presets.find((p) => p.name === selectedName) ??
      editor.presets.find((p) => p.name === editor.appliedPreset) ??
      editor.presets[0] ??
      null,
  );
  const activeSections = $derived(PRESET_SECTIONS.filter((sec) => selectedSections[sec]));
  const partialApply = $derived(activeSections.length < PRESET_SECTIONS.length);

  const statusText = $derived.by(() => {
    const applied = editor.presets.find((p) => p.name === editor.appliedPreset);
    if (!applied) return editor.appliedPreset ? m.lastApplied(editor.appliedPreset) : '';
    const diff = changedSections(applied.preset, currentPresetValues(editor.look));
    if (diff.length === 0) return m.applied(applied.name);
    return m.modified(applied.name, diff.map((s) => m.sections[s].toLocaleLowerCase()).join(', '));
  });

  function applySelected(): void {
    if (!selectedEntry || activeSections.length === 0) return;
    editor.applyCorriente(selectedEntry, activeSections);
    selectedName = selectedEntry.name;
  }

  function startSaveAs(): void {
    promptMode = 'save';
    promptValue = '';
    menuOpen = false;
  }

  function startRename(): void {
    if (!selectedEntry || selectedEntry.builtin) return;
    promptMode = 'rename';
    promptValue = selectedEntry.name;
    menuOpen = false;
  }

  async function submitPrompt(): Promise<void> {
    const mode = promptMode;
    const name = promptValue.trim();
    if (!mode) return;
    try {
      if (mode === 'save') {
        const entry = await presetStore.save(name, editor.captureCurrentPreset(name));
        editor.appliedPreset = entry.name;
        selectedName = entry.name;
        await editor.refreshPresets();
        notifications.show(m.savedToast(entry.name), 'ok');
      } else if (selectedEntry && !selectedEntry.builtin) {
        const entry = await presetStore.rename(selectedEntry.name, name);
        if (editor.appliedPreset === selectedEntry.name) editor.appliedPreset = entry.name;
        selectedName = entry.name;
        await editor.refreshPresets();
      }
      promptMode = null;
    } catch (error) {
      notifications.show(describeError(i18n.m, error), 'error');
    }
  }

  async function updateSelected(): Promise<void> {
    if (!selectedEntry || selectedEntry.builtin) return;
    try {
      const entry = await presetStore.update(
        selectedEntry.name,
        editor.captureCurrentPreset(selectedEntry.name),
      );
      editor.appliedPreset = entry.name;
      await editor.refreshPresets();
      notifications.show(m.updatedToast(entry.name), 'ok');
    } catch (error) {
      notifications.show(describeError(i18n.m, error), 'error');
    }
  }

  async function duplicateSelected(): Promise<void> {
    if (!selectedEntry) return;
    menuOpen = false;
    try {
      const entry = await presetStore.duplicate(selectedEntry.name);
      selectedName = entry.name;
      await editor.refreshPresets();
    } catch (error) {
      notifications.show(describeError(i18n.m, error), 'error');
    }
  }

  async function deleteSelected(): Promise<void> {
    if (!selectedEntry || selectedEntry.builtin) return;
    if (!confirmDelete) {
      confirmDelete = true;
      return;
    }
    confirmDelete = false;
    menuOpen = false;
    try {
      await presetStore.remove(selectedEntry.name);
      if (editor.appliedPreset === selectedEntry.name) editor.appliedPreset = '';
      selectedName = '';
      await editor.refreshPresets();
    } catch (error) {
      notifications.show(describeError(i18n.m, error), 'error');
    }
  }

  async function importPreset(): Promise<void> {
    menuOpen = false;
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const text = await readText(file);
      const { entry, flags } = await presetStore.importJsonText(
        text,
        file.name.replace(/\.json$/i, ''),
      );
      selectedName = entry.name;
      await editor.refreshPresets();
      const missing = flags[0]?.font;
      if (missing) {
        notifications.show(`${m.missingFont(missing)} ${m.importedToast(entry.name)}`, 'info');
      } else {
        notifications.show(m.importedToast(entry.name), 'ok');
      }
    } catch (error) {
      notifications.show(describeError(i18n.m, error), 'error');
    }
  }

  async function exportSelected(): Promise<void> {
    if (!selectedEntry) return;
    menuOpen = false;
    try {
      const text = await presetStore.exportJsonText(selectedEntry.name);
      downloadText(`${selectedEntry.name}.json`, text, 'application/json');
    } catch (error) {
      notifications.show(describeError(i18n.m, error), 'error');
    }
  }
</script>

<div class="corrientes">
  <div class="label-row">
    <span class="flabel">{m.presets}</span>
    {#if statusText}
      <span class="status">{statusText}</span>
    {/if}
  </div>

  <div class="strip" role="listbox" aria-label={m.presets}>
    {#each editor.presets as entry (entry.name)}
      {@const isSelected = selectedEntry?.name === entry.name}
      {@const thumbUrl = editor.thumbUrls[entry.name]}
      <button
        type="button"
        class="preset-card"
        role="option"
        aria-selected={isSelected}
        title={entry.preset.description || entry.name}
        onclick={() => {
          selectedName = entry.name;
          confirmDelete = false;
        }}
        ondblclick={applySelected}
      >
        <span class="thumb-box">
          {#if thumbUrl}
            <img src={thumbUrl} alt="" />
          {:else}
            <span class="thumb-ph"><i></i><i></i></span>
          {/if}
        </span>
        <span class="pname">{entry.name}{entry.builtin ? '' : ' ·'}</span>
      </button>
    {/each}
  </div>

  <div class="actions">
    <Button
      variant="primary"
      disabled={!selectedEntry || activeSections.length === 0}
      onclick={applySelected}
    >
      {partialApply ? m.applyPartial(activeSections.length, PRESET_SECTIONS.length) : m.apply}
    </Button>
    <Button onclick={startSaveAs}>{m.saveAs}</Button>
    <Button
      disabled={!selectedEntry || selectedEntry.builtin}
      onclick={() => void updateSelected()}
    >
      {m.update}
    </Button>
    <div class="more-wrap">
      <button
        type="button"
        class="more-btn"
        aria-label={m.moreActions}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={() => {
          menuOpen = !menuOpen;
          confirmDelete = false;
        }}
      >
        <Icon name="ellipsis" />
      </button>

      {#if menuOpen}
        <div class="menu" role="menu">
          <div class="menu-head">{m.applyOnlyTo}</div>
          {#each PRESET_SECTIONS as sec (sec)}
            <label class="menu-check">
              <input
                type="checkbox"
                checked={selectedSections[sec]}
                onchange={(e) => {
                  selectedSections = {
                    ...selectedSections,
                    [sec]: e.currentTarget.checked,
                  };
                }}
              />
              <span>{m.sections[sec]}</span>
            </label>
          {/each}
          <hr />
          <button
            type="button"
            class="mi"
            role="menuitem"
            disabled={!selectedEntry || selectedEntry.builtin}
            onclick={startRename}
          >
            {m.rename}
          </button>
          <button
            type="button"
            class="mi"
            role="menuitem"
            disabled={!selectedEntry}
            onclick={() => void duplicateSelected()}
          >
            {m.duplicate}
          </button>
          <button
            type="button"
            class="mi danger"
            role="menuitem"
            disabled={!selectedEntry || selectedEntry.builtin}
            onclick={() => void deleteSelected()}
          >
            {confirmDelete && selectedEntry ? m.confirmDelete(selectedEntry.name) : m.delete}
          </button>
          <hr />
          <button type="button" class="mi" role="menuitem" onclick={() => void importPreset()}>
            {m.importJson}
          </button>
          <button
            type="button"
            class="mi"
            role="menuitem"
            disabled={!selectedEntry}
            onclick={() => void exportSelected()}
          >
            {m.exportJson}
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if promptMode !== null}
    <form
      class="prompt-row"
      onsubmit={(e) => {
        e.preventDefault();
        void submitPrompt();
      }}
    >
      <input
        type="text"
        class="input"
        maxlength="60"
        placeholder={m.promptName}
        aria-label={m.promptName}
        bind:value={promptValue}
      />
      <Button variant="primary" type="submit">{m.promptSave}</Button>
      <Button
        onclick={() => {
          promptMode = null;
        }}
      >
        {m.promptCancel}
      </Button>
    </form>
  {/if}
</div>

<style>
  .corrientes {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .label-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
  }

  .flabel {
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  .status {
    font-size: var(--fs-xs);
    color: var(--faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .strip {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .preset-card {
    flex: none;
    width: 72px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 4px;
    border-radius: 12px;
    border: 1px solid transparent;
    color: var(--muted);
    font-size: var(--fs-xs);
    font-weight: 500;
    text-align: center;
  }

  .preset-card:hover {
    background: var(--hover);
    color: var(--text);
  }

  .preset-card[aria-selected='true'] {
    border-color: var(--accent);
    background: var(--pill);
    color: var(--text);
  }

  .thumb-box {
    display: block;
    width: 62px;
    height: 78px;
    border-radius: 9px;
    overflow: hidden;
    background: var(--surface-2);
  }

  .thumb-box img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .thumb-ph {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    background: var(--grad);
    opacity: 0.55;
  }

  .thumb-ph i {
    position: absolute;
    left: 8px;
    height: 4px;
    border-radius: 2px;
    background: var(--on-accent);
  }

  .thumb-ph i:first-child {
    top: 30px;
    width: 60%;
  }

  .thumb-ph i:last-child {
    top: 40px;
    width: 42%;
    opacity: 0.45;
  }

  .pname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .more-wrap {
    position: relative;
    margin-left: auto;
  }

  .more-btn {
    --icon-size: 16px;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    color: var(--muted);
  }

  .more-btn:hover {
    background: var(--hover);
    color: var(--text);
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    min-width: 210px;
    padding: 6px;
    border-radius: var(--r-card);
    background: var(--pop-bg);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-menu);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .menu-head {
    padding: 6px 8px 4px;
    font-size: var(--fs-xs);
    color: var(--faint);
  }

  .menu-check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 5px 8px;
    border-radius: 8px;
    font-size: var(--fs-sm);
    cursor: pointer;
  }

  .menu-check:hover {
    background: var(--hover);
  }

  .menu hr {
    border: 0;
    height: 1px;
    background: var(--border);
    margin: 4px 6px;
  }

  .mi {
    width: 100%;
    text-align: left;
    padding: 7px 10px;
    border-radius: 8px;
    font-size: var(--fs-sm);
  }

  .mi:hover:not(:disabled) {
    background: var(--pill);
  }

  .mi:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .mi.danger {
    color: var(--danger);
  }

  .prompt-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    margin-top: var(--space-1);
  }

  .input {
    flex: 1;
    min-width: 0;
    height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--r-ctl);
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: var(--fs-sm);
  }
</style>
