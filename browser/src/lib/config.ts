// On the web it's the site itself: bnet.ethembeldagli.dev, or bigglenet.ethembeldagli.dev for the
// phone apps installed from there before the move. The desktop app uses bnet.ethembeldagli.dev.
const here = typeof location !== 'undefined' && /^https:\/\/(bnet|bigglenet)\.ethembeldagli\.dev$/.test(location.origin) ? location.origin : null;
export const SERVER = (import.meta.env.VITE_BIGGLE_SERVER ?? here ?? 'https://bnet.ethembeldagli.dev').replace(/\/+$/, '');
/** Passkeys belong to the address they were made on: the desktop app makes and uses them at the first one. */
export const PASSKEY_SERVER = (import.meta.env.VITE_BIGGLE_SERVER ?? 'https://bigglenet.ethembeldagli.dev').replace(/\/+$/, '');

/** Every site file is fetched from here: `${SITE_PREFIX}<name>/<path>`. */
export const SITE_PREFIX = `${SERVER}/site/`;

/** Sites waiting for approval are previewed from here, with a signed token: `${PREVIEW_PREFIX}<token>/<path>`. */
export const PREVIEW_PREFIX = `${SERVER}/preview/`;
