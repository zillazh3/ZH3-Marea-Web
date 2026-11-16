<script lang="ts">
  import type { LocalePreference } from '@/features/i18n/locale';
  import { THEME_PREFERENCES, type ThemePreference } from '@/features/preferences/preferences';
  import Button from '../components/Button.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import Segmented from '../components/Segmented.svelte';
  import Switch from '../components/Switch.svelte';
  import { describeError } from '../errors';
  import { i18n } from '../i18n.svelte';
  import { spicy } from '../services';
  import { layout } from '../state/layout.svelte';
  import { preferences } from '../state/preferences.svelte';
  import { spicyKey } from '../state/spicyKey.svelte';
  import { notifications } from '../state/toasts.svelte';

  const m = $derived(i18n.m);
  const themeLabels = $derived<Record<ThemePreference, string>>({
    system: m.settings.themeSystem,
    dark: m.settings.themeDark,
    light: m.settings.themeLight,
  });
  const themeOptions = $derived(
    THEME_PREFERENCES.map((value) => ({ value, label: themeLabels[value] })),
  );
  const languageOptions = $derived<{ value: LocalePreference; label: string }[]>([
    { value: 'auto', label: m.settings.languageAuto },
    { value: 'es-MX', label: m.settings.languageEs },
    { value: 'en', label: m.settings.languageEn },
  ]);

  let keyDraft = $state(spicyKey.value);
  let testing = $state(false);

  // The stored key arrives after the first paint; show it unless the user already started typing.
  $effect(() => {
    if (keyDraft === '') keyDraft = spicyKey.value;
  });

  async function saveKey(): Promise<boolean> {
    const previous = spicyKey.value;
    const stored = await spicyKey.save(keyDraft);
    keyDraft = spicyKey.value;
    if (!stored) notifications.show(m.toast.notSaved, 'error');
    else if (spicyKey.value !== previous) {
      notifications.show(spicyKey.value ? m.settings.spicySaved : m.settings.spicyRemoved);
    }
    return stored;
  }

  async function testKey(): Promise<void> {
    testing = true;
    try {
      await saveKey();
      await spicy.checkKey();
      notifications.show(m.settings.spicyWorks, 'ok');
    } catch (error) {
      notifications.show(describeError(i18n.m, error), 'error');
    } finally {
      testing = false;
    }
  }

  function onLanguage(event: Event & { currentTarget: HTMLSelectElement }): void {
    const chosen = languageOptions.find((option) => option.value === event.currentTarget.value);
    if (chosen) i18n.setPreference(chosen.value);
  }
</script>

<ScreenHead title={m.nav.settings} />

<div class="settings">
  <section class="card">
    <h2>{m.settings.appearance}</h2>
    <div class="row">
      <span class="label">{m.settings.theme}</span>
      <Segmented
        label={m.settings.theme}
        value={preferences.value.theme}
        options={themeOptions}
        onchange={(theme: ThemePreference) => {
          preferences.update({ theme });
        }}
      />
    </div>
    <div class="row">
      <label class="label" for="language">{m.settings.language}</label>
      <select id="language" value={i18n.preference} onchange={onLanguage}>
        {#each languageOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
    {#if !layout.isDock}
      <div class="row">
        <div>
          {m.settings.menuCollapsed}
          <small>{m.settings.menuCollapsedHint}</small>
        </div>
        <Switch
          checked={layout.railCollapsed}
          label={m.settings.menuCollapsed}
          onchange={() => {
            layout.toggleRail();
          }}
        />
      </div>
    {/if}
  </section>

  <section class="card">
    <h2>{m.settings.spicyTitle}</h2>
    <p class="hint">{m.settings.spicyIntro}</p>
    <div class="field">
      <label class="label" for="spicy-key">{m.settings.spicyKey}</label>
      <input
        id="spicy-key"
        type="password"
        autocomplete="off"
        spellcheck="false"
        aria-describedby="spicy-hint"
        bind:value={keyDraft}
        onchange={() => void saveKey()}
      />
    </div>
    <p class="hint" id="spicy-hint">{m.settings.spicyHint(location.origin)}</p>
    <div>
      <Button disabled={testing} onclick={() => void testKey()}>
        {testing ? m.settings.spicyTesting : m.settings.spicyTest}
      </Button>
    </div>
  </section>
</div>

<style>
  .settings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
    gap: var(--space-4);
    max-width: 1100px;
  }

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

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: var(--fs-sm);
  }

  small {
    display: block;
    color: var(--faint);
    font-size: var(--fs-xs);
  }

  .label {
    font-size: var(--fs-xs);
    color: var(--muted);
    font-weight: 500;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .hint {
    color: var(--faint);
    font-size: var(--fs-xs);
    overflow-wrap: anywhere;
  }

  input,
  select {
    height: 38px;
    padding: 0 var(--space-3);
    border-radius: var(--r-ctl);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    outline: none;
  }

  input {
    width: 100%;
  }

  select {
    min-width: 200px;
  }

  input:focus,
  select:focus {
    border-color: var(--accent);
  }
</style>
