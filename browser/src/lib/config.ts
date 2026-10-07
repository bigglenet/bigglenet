export const SERVER = (import.meta.env.VITE_BIGGLE_SERVER ?? 'https://bigglenet.ethembeldagli.dev').replace(/\/+$/, '');

/** Every site file is fetched from here: `${SITE_PREFIX}<name>/<path>`. */
export const SITE_PREFIX = `${SERVER}/site/`;

/** Sites waiting for approval are previewed from here, with a signed token: `${PREVIEW_PREFIX}<token>/<path>`. */
export const PREVIEW_PREFIX = `${SERVER}/preview/`;
