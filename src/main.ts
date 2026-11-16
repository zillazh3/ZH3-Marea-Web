import { mount } from 'svelte';
import App from '@/ui/App.svelte';
import '@/ui/styles/tokens.css';
import '@/ui/styles/base.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount point in index.html.');

mount(App, { target });
