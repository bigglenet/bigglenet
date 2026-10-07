import { mount } from 'svelte';
import { gate } from './lib/gate';
import { registerServiceWorker } from './lib/platform';
import './app.css';

const target = document.getElementById('app')!;
const where = gate();
registerServiceWorker();

// Outside the desktop app and the installed phone app, only show how to get Bigglenet.
if (where === 'ok') {
  import('./App.svelte').then(({ default: App }) => mount(App, { target }));
} else {
  import('./components/GatePage.svelte').then(({ default: GatePage }) => mount(GatePage, { target, props: { gate: where } }));
}
