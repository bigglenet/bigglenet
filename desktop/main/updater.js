// Updates: the newest release's latest.json says which file each kind of install updates from,
// and each file is signed with the release key (minisign.js). Older Bigglenet apps (built with
// Tauri) read the same feed, so they update to this one the same way.
import { app, ipcMain, net } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { verifySignature } from './minisign.js';

const run = promisify(execFile);

const FEED = 'https://github.com/bigglenet/bigglenet/releases/latest/download/latest.json';
// The public half of the release signing key.
const PUBLIC_KEY =
  'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDlCNEY3Qjg4Qjc5RjA5RDUKUldUVkNaKzNpSHRQbTZVTm9rTmVNN0o2bE9HcDZMdVN1eVlEZXNyZUpYK3ZZVGFwdWJWeFNGeXQK';

/** How this copy was installed, on Linux: an AppImage, or a .deb or .rpm package. */
function linuxKind() {
  if (process.env.APPIMAGE) return 'appimage';
  return existsSync('/etc/debian_version') ? 'deb' : 'rpm';
}

/** The update feed's names for this computer, most specific first. */
function feedKeys() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (process.platform === 'darwin') return [`darwin-${arch}-app`, `darwin-${arch}`];
  if (process.platform === 'win32') return [`windows-${arch}-nsis`, `windows-${arch}`];
  const kind = linuxKind();
  return kind === 'appimage' ? [`linux-${arch}-appimage`, `linux-${arch}`] : [`linux-${arch}-${kind}`];
}

/** Whether version `a` is newer than `b` ("0.4.1" > "0.4.0"). */
function newer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

/** The downloaded, checked update, waiting to be installed. */
let ready = null;
let checking = null;

async function check() {
  if (!app.isPackaged) return null;
  if (ready) return { version: ready.version };
  const res = await net.fetch(FEED, { cache: 'no-store' });
  if (!res.ok) return null;
  const feed = await res.json();
  if (typeof feed.version !== 'string' || !newer(feed.version, app.getVersion())) return null;
  const entry = feedKeys()
    .map((key) => feed.platforms?.[key])
    .find((e) => e && typeof e.url === 'string' && typeof e.signature === 'string');
  if (!entry) return null;

  const download = await net.fetch(entry.url);
  if (!download.ok) return null;
  const data = Buffer.from(await download.arrayBuffer());
  if (!verifySignature(data, entry.signature, PUBLIC_KEY)) throw new Error("The update's signature doesn't match. Not installing it.");

  const dir = join(tmpdir(), 'bigglenet-update');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, basename(new URL(entry.url).pathname));
  writeFileSync(file, data);
  ready = { version: feed.version, file };
  return { version: feed.version };
}

/** Install the downloaded update and start the new version. */
async function install() {
  if (!ready) return;
  const { file } = ready;

  if (process.platform === 'darwin') {
    // Swap the whole app bundle for the new one.
    const bundle = resolve(process.execPath, '../../..');
    const dir = mkdtempSync(join(tmpdir(), 'bigglenet-new-'));
    await run('tar', ['-xzf', file, '-C', dir]);
    const unpacked = readdirSync(dir).find((n) => n.endsWith('.app'));
    if (!unpacked) throw new Error("The update didn't contain the app.");
    const old = `${bundle}.old`;
    rmSync(old, { recursive: true, force: true });
    renameSync(bundle, old);
    try {
      renameSync(join(dir, unpacked), bundle);
    } catch {
      await run('ditto', [join(dir, unpacked), bundle]);
    }
    rmSync(old, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
    app.relaunch();
    app.exit(0);
    return;
  }

  if (process.platform === 'win32') {
    // The installer runs on its own, quietly, and starts the new version when it's done.
    spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    app.quit();
    return;
  }

  const kind = linuxKind();
  if (kind === 'appimage') {
    const target = process.env.APPIMAGE;
    copyFileSync(file, `${target}.new`);
    chmodSync(`${target}.new`, 0o755);
    renameSync(`${target}.new`, target);
    app.relaunch({ execPath: target });
  } else {
    // System packages need the administrator's password (pkexec asks for it).
    await run('pkexec', kind === 'deb' ? ['dpkg', '-i', file] : ['rpm', '-U', '--force', file]);
    app.relaunch();
  }
  app.exit(0);
}

export function setupUpdater() {
  ipcMain.handle('updates:check', () => {
    checking ??= check().finally(() => (checking = null));
    return checking;
  });
  ipcMain.handle('updates:install', () => install());
}
