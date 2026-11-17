<script lang="ts">
  import type { LocalePreference } from '@/features/i18n/locale';
  import { THEME_PREFERENCES, type ThemePreference } from '@/features/preferences/preferences';
  import Button from '../components/Button.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import Segmented from '../components/Segmented.svelte';
  import Switch from '../components/Switch.svelte';
  import { describeError } from '../errors';
  import { i18n } from '../i18n.svelte';
  import { configuredSourceUrl } from '../sourceUrl';
  import { spicy } from '../services';
  import { layout } from '../state/layout.svelte';
  import { preferences } from '../state/preferences.svelte';
  import { spicyKey } from '../state/spicyKey.svelte';
  import { spotifyRedirectUri, spotifyStatus } from '../state/spotify.svelte';
  import { notifications } from '../state/toasts.svelte';
  import WipeDataCard from './WipeDataCard.svelte';

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
  let clientIdDraft = $state(spotifyStatus.clientId);
  let connectingSpotify = $state(false);
  const redirectUri = spotifyRedirectUri();
  const sourceUrl = configuredSourceUrl();

  // The stored key arrives after the first paint; show it unless the user already started typing.
  $effect(() => {
    if (keyDraft === '') keyDraft = spicyKey.value;
  });

  $effect(() => {
    if (clientIdDraft === '') clientIdDraft = spotifyStatus.clientId;
  });

  async function saveSpotifyClientId(): Promise<void> {
    await spotifyStatus.saveClientId(clientIdDraft);
    clientIdDraft = spotifyStatus.clientId;
  }

  async function connectSpotify(): Promise<void> {
    connectingSpotify = true;
    try {
      await saveSpotifyClientId();
      const url = await spotifyStatus.startConnect('settings');
      location.assign(url);
    } catch (error) {
      notifications.show(describeError(i18n.m, error), 'error');
      connectingSpotify = false;
    }
  }

  async function disconnectSpotify(): Promise<void> {
    await spotifyStatus.disconnect();
    notifications.show(m.settings.spotifyDisconnectedToast);
  }

  async function copyRedirectUri(): Promise<void> {
    try {
      await navigator.clipboard.writeText(redirectUri);
      notifications.show(m.settings.spotifyCopied, 'ok');
    } catch {
      notifications.show(m.errors.unknown, 'error');
    }
  }

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

  <section class="card">
    <h2>{m.settings.spotifyTitle}</h2>
    <p class="hint">{m.settings.spotifyIntro}</p>
    <div class="field">
      <label class="label" for="spotify-client-id">{m.settings.spotifyClientId}</label>
      <input
        id="spotify-client-id"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder={m.settings.spotifyClientIdPlaceholder}
        bind:value={clientIdDraft}
        onchange={() => void saveSpotifyClientId()}
      />
    </div>
    <div class="row">
      <span class="hint">
        {spotifyStatus.connected
          ? m.settings.spotifyStatusConnected
          : m.settings.spotifyStatusDisconnected}
      </span>
      <div class="btn-row">
        {#if spotifyStatus.connected}
          <Button onclick={() => void disconnectSpotify()}>{m.settings.spotifyDisconnect}</Button>
        {/if}
        <Button
          variant="primary"
          disabled={connectingSpotify}
          onclick={() => void connectSpotify()}
        >
          {connectingSpotify ? m.settings.spotifyConnecting : m.settings.spotifyConnect}
        </Button>
      </div>
    </div>
    <div class="field">
      <label class="label" for="spotify-redirect-uri">{m.settings.spotifyRedirectUri}</label>
      <div class="uri-row">
        <input id="spotify-redirect-uri" type="text" readonly value={redirectUri} />
        <Button onclick={() => void copyRedirectUri()}>{m.settings.spotifyCopy}</Button>
      </div>
    </div>
  </section>

  <section class="card">
    <h2>{m.settings.experimentalTitle}</h2>
    <div class="row">
      <span>{m.settings.wordfxLabel}</span>
      <Switch
        checked={preferences.value.wordfxExperimental}
        label={m.settings.wordfxLabel}
        onchange={(wordfxExperimental: boolean) => {
          preferences.update({ wordfxExperimental });
        }}
      />
    </div>
    <p class="hint">{m.settings.wordfxHint}</p>
  </section>

  <WipeDataCard />

  <section class="card">
    <h2>{m.settings.aboutTitle}</h2>
    <p class="hint">{m.settings.sourceCodeHint}</p>
    <div class="btn-row">
      {#if sourceUrl}
        <a class="source-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
          {m.settings.sourceCode}
        </a>
      {/if}
      <a class="source-link" href={m.settings.privacyHref} title={m.settings.privacyHint}>
        {m.settings.privacy}
      </a>
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

  .btn-row,
  .uri-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .uri-row input {
    flex: 1;
    min-width: 0;
  }

  .source-link {
    display: inline-flex;
    align-items: center;
    height: 34px;
    padding: 0 var(--space-3);
    border-radius: var(--r-ctl);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: var(--fs-sm);
    text-decoration: none;
  }

  .source-link:hover {
    background: var(--hover);
    border-color: var(--accent-icon);
  }
</style>
