import { mount } from 'svelte';
import { gate } from './lib/gate';
import { registerServiceWorker } from './lib/platform';
import './app.css';

const target = document.getElementById('app')!;
const where = gate();
registerServiceWorker();

// Outside the desktop app and the installed phone app, only show how to get Bigglenet.
// The page and its language (Turkish is downloaded only if it's used) load side by side.
const language = import('./lib/i18n.svelte').then((m) => m.languageReady);
if (where === 'ok') {
  Promise.all([import('./App.svelte'), language]).then(([{ default: App }]) => mount(App, { target }));
} else {
  Promise.all([import('./components/GatePage.svelte'), language]).then(([{ default: GatePage }]) => mount(GatePage, { target, props: { gate: where } }));
}
