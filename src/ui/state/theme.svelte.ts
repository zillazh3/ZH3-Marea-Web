import { preferences } from './preferences.svelte';

const query = matchMedia('(prefers-color-scheme: dark)');
let systemDark = $state(query.matches);
query.addEventListener('change', (event) => {
  systemDark = event.matches;
});

const resolved = $derived<'dark' | 'light'>(
  preferences.value.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.value.theme,
);

export const theme = {
  get resolved(): 'dark' | 'light' {
    return resolved;
  },
  toggle(): void {
    preferences.update({ theme: resolved === 'dark' ? 'light' : 'dark' });
  },
};
