// Smaller updates: when a release only changes the browser's own files, download just those
// (a few hundred KB) instead of the whole app. Each release has a signed bundle.json listing the
// files and their SHA-256 (scripts/web-bundle.mjs); a bundle is used only if its signature is
// right, every file matches, and this app's shell (main/ and preload/) is new enough for it
// ("bigglenetShell" in package.json: bump it when the browser files need something new from
// here). The files are kept in userData/web/<version>.
//
// If a bundle's files don't start (the browser doesn't say it's running within a minute), it's
// marked bad and the app goes back to its own files.
import { app, ipcMain, net } from 'electron';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t } from './language.js';
import { verifySignature } from './minisign.js';

const here = dirname(fileURLToPath(import.meta.url));
// (BIGGLE_RELEASES points somewhere else for desktop/scripts tests; never set in real use.)
const RELEASES = process.env.BIGGLE_RELEASES || 'https://github.com/bigglenet/bigglenet/releases/download';
const BOOT_TIMEOUT = 60_000;
export const SHELL = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8')).bigglenetShell ?? 0;

const root = () => join(app.getPath('userData'), 'web');
const stateFile = () => join(root(), 'state.json');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Whether version `a` is newer than `b`. */
export function newer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function readState() {
  try {
    return JSON.parse(readFileSync(stateFile(), 'utf8'));
  } catch {
    return { version: null, bad: [] };
  }
}

function writeState(state) {
  mkdirSync(root(), { recursive: true });
  writeFileSync(stateFile(), JSON.stringify(state));
}

/**
 * Which files to serve the browser from: a downloaded bundle, if it's newer than the app's own
 * files and hasn't failed; otherwise the app's own. Decided once, when the app starts.
 */
let active = null;
export function activeFiles(packaged) {
  if (active) return active;
  active = { dir: packaged, version: app.getVersion(), bundle: false };
  if (!app.isPackaged) return active;
  const state = readState();
  const dir = state.version && join(root(), state.version);
  if (dir && existsSync(join(dir, 'index.html')) && newer(state.version, app.getVersion()) && !(state.bad ?? []).includes(state.version)) {
    active = { dir, version: state.version, bundle: true };
  }
  return active;
}

/** The version of the browser files being served (a bundle's, or the app's own). */
export const currentVersion = () => active?.version ?? app.getVersion();

/** The newest release's bundle, if it's for `version`, signed, and fits this app. */
export async function findBundle(version, publicKey) {
  if (!app.isPackaged) return null;
  const base = `${RELEASES}/v${version}`;
  const [list, sig] = await Promise.all([net.fetch(`${base}/bundle.json`, { cache: 'no-store' }), net.fetch(`${base}/bundle.json.sig`, { cache: 'no-store' })]);
  if (!list.ok || !sig.ok) return null;
  const data = Buffer.from(await list.arrayBuffer());
  if (!verifySignature(data, (await sig.text()).trim(), publicKey)) return null;
  const manifest = JSON.parse(data.toString('utf8'));
  if (manifest.version !== version || !Number.isInteger(manifest.shell) || manifest.shell > SHELL || !Array.isArray(manifest.files)) return null;
  if ((readState().bad ?? []).includes(version)) return null;
  return manifest;
}

/** Hashes of the files being served now, to copy the ones that didn't change. */
function currentHashes() {
  const dir = active?.dir;
  const map = new Map();
  if (!dir) return map;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else map.set(sha256(readFileSync(path)), path);
    }
  };
  try {
    walk(dir);
  } catch {}
  return map;
}

/** Download a bundle's files (only the changed ones), check each, and keep them for next start. */
export async function downloadBundle(manifest) {
  const target = join(root(), manifest.version);
  const part = `${target}.part`;
  rmSync(part, { recursive: true, force: true });
  const have = currentHashes();
  for (const file of manifest.files) {
    const path = normalize(join(part, file.path));
    if (typeof file.path !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256) || relative(part, path).startsWith('..') || path.includes(`${sep}..${sep}`)) {
      throw new Error(t('That update lists a file it shouldn’t.'));
    }
    let data = have.has(file.sha256) ? readFileSync(have.get(file.sha256)) : null;
    if (!data) {
      const res = await net.fetch(`${RELEASES}/v${manifest.version}/web-${file.sha256}`);
      if (!res.ok) throw new Error(t('The download failed ({status}).', { status: res.status }));
      data = Buffer.from(await res.arrayBuffer());
    }
    if (sha256(data) !== file.sha256) throw new Error(t("A file in the update doesn't match. Not using it."));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  }
  rmSync(target, { recursive: true, force: true });
  renameSync(part, target);
  return target;
}

/** Use a downloaded bundle from the next start on, and tidy away older ones. */
export function useBundle(version) {
  const state = readState();
  writeState({ version, bad: state.bad ?? [] });
  for (const name of readdirSync(root())) {
    if (name !== version && name !== 'state.json' && name !== active?.version) rmSync(join(root(), name), { recursive: true, force: true });
  }
}

/**
 * Watch that a bundle's browser starts: it says so (app:booted). If it doesn't in time, the
 * bundle is marked bad and the app starts again with its own files.
 */
export function watchBoot() {
  let booted = false;
  ipcMain.handle('app:booted', () => {
    booted = true;
  });
  if (!active?.bundle) return;
  setTimeout(() => {
    if (booted) return;
    const state = readState();
    writeState({ version: null, bad: [...new Set([...(state.bad ?? []), active.version])] });
    app.relaunch();
    app.exit(0);
  }, BOOT_TIMEOUT);
}
