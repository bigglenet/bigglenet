import { mount } from 'svelte';
import { gate } from './lib/gate';
import { registerServiceWorker } from './lib/platform';
import './app.css';

const target = document.getElementById('app')!;
// In development, ?landing (or ?landing=ios / android) shows the website instead of the app.
const asked = import.meta.env.DEV ? new URLSearchParams(location.search).get('landing') : null;
const where = asked === null ? gate() : asked === 'ios' || asked === 'android' ? asked : 'desktop';

// bnet moved to bnet.ethembeldagli.dev. Apps installed from the old address keep using it; anyone
// else opening it in a browser goes to the new one.
if (where !== 'ok' && location.hostname === 'bigglenet.ethembeldagli.dev') {
  location.replace(`https://bnet.ethembeldagli.dev${location.pathname}${location.search}${location.hash}`);
}
registerServiceWorker();

// Outside the desktop app and the installed phone app, the bnet website (src/landing).
// The page and its language (Turkish is downloaded only if it's used) load side by side.
const language = import('./lib/i18n.svelte').then((m) => m.languageReady);
if (where === 'ok') {
  Promise.all([import('./App.svelte'), language]).then(([{ default: App }]) => mount(App, { target }));
} else {
  Promise.all([import('./landing/mount'), language]).then(([{ mountLanding }]) => mountLanding(target, where));
}
