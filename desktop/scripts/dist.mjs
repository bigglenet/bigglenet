// Builds the desktop app for this computer's system and puts the files a release needs in
// dist/release, named as they always were (the update feed and download links depend on it). Files
// installed apps update from are signed with the release key, if TAURI_SIGNING_PRIVATE_KEY is set:
// older apps check that same signature, so they update to this one.
//
//   npm run dist -w desktop        (build the browser first: npm run build -w browser)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

if (!existsSync('../browser/dist/index.html')) throw new Error('Build the browser first: npm run build -w browser');
rmSync('dist', { recursive: true, force: true });
const out = join('dist', 'release');

// Each system builds its own kinds of install.
if (process.platform === 'darwin') run('npx', ['electron-builder', '--mac', '--arm64', '--x64', '--publish', 'never']);
else if (process.platform === 'win32') run('npx', ['electron-builder', '--win', '--publish', 'never']);
else run('npx', ['electron-builder', '--linux', '--publish', 'never']);
mkdirSync(out, { recursive: true });

/** Files to sign: what installed apps download when they update. */
const updates = [];

if (process.platform === 'darwin') {
  // The older app's arch names: aarch64 (Apple silicon) and x64 (Intel).
  for (const [arch, name, dir] of [
    ['arm64', 'aarch64', 'mac-arm64'],
    ['x64', 'x64', 'mac'],
  ]) {
    renameSync(join('dist', `Bigglenet_${version}_${arch}.dmg`), join(out, `Bigglenet_${version}_${name}.dmg`));
    // Updates swap in the whole app bundle.
    const archive = join(out, `Bigglenet_${version}_${name}.app.tar.gz`);
    run('tar', ['-czf', archive, '-C', join('dist', dir), 'Bigglenet.app']);
    updates.push(archive);
  }
} else {
  const wanted = /(-setup\.exe|\.AppImage|\.deb|\.rpm)$/;
  for (const name of readdirSync('dist').filter((n) => wanted.test(n))) {
    renameSync(join('dist', name), join(out, name));
    updates.push(join(out, name));
  }
}

if (process.env.TAURI_SIGNING_PRIVATE_KEY) {
  // Signatures every installed app can check (scripts/sign.mjs).
  run('node', ['../scripts/sign.mjs', ...updates]);
} else {
  console.warn('TAURI_SIGNING_PRIVATE_KEY is not set, so the update files are not signed.');
}

console.log(`\nBigglenet ${version}:\n${readdirSync(out).map((n) => `  ${n}`).join('\n')}`);
