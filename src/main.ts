import { mount } from 'svelte';
import App from '@/ui/App.svelte';
import '@/ui/styles/tokens.css';
import '@/ui/styles/base.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount point in index.html.');

if (import.meta.env.DEV && new URLSearchParams(location.search).has('seed')) {
  await import('@/ui/dev/seed');
}

mount(App, { target });
