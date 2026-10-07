export const SERVER = (import.meta.env.VITE_BIGGLE_SERVER ?? 'https://bigglenet.ethembeldagli.dev').replace(/\/+$/, '');

/** Every site file is fetched from here: `${SITE_PREFIX}<name>/<path>`. */
export const SITE_PREFIX = `${SERVER}/site/`;
