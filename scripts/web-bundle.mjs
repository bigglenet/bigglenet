// Smaller updates for the desktop app: the browser's own files (browser/dist), as a signed list
// (bundle.json) and the files named by their SHA-256 (web-<hash>), for the release. Installed
// apps whose shell (desktop/main and preload) is new enough download only the files that changed,
// check them against the signed list, and switch to them (desktop/main/webbundle.js). Run in CI
// after building, with TAURI_SIGNING_PRIVATE_KEY set (the same key that signs full updates).
//
//   node scripts/web-bundle.mjs <out dir>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const out = process.argv[2] ?? 'desktop/dist/release';
const dist = 'browser/dist';
const desktop = JSON.parse(readFileSync('desktop/package.json', 'utf8'));
const version = desktop.version;
const shell = desktop.bigglenetShell;
if (!Number.isInteger(shell)) throw new Error('desktop/package.json needs "bigglenetShell".');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

mkdirSync(out, { recursive: true });
const files = walk(dist).map((path) => {
  const data = readFileSync(path);
  const sha256 = createHash('sha256').update(data).digest('hex');
  copyFileSync(path, join(out, `web-${sha256}`));
  return { path: relative(dist, path).split(sep).join('/'), sha256, size: data.length };
});
const manifest = join(out, 'bundle.json');
writeFileSync(manifest, JSON.stringify({ version, shell, files }, null, 1));

if (process.env.TAURI_SIGNING_PRIVATE_KEY) {
  execFileSync('node', [join('scripts', 'sign.mjs'), manifest], { stdio: 'inherit' });
  console.log(`Signed bundle.json: ${files.length} files for ${version} (shell ${shell}).`);
} else {
  console.warn('TAURI_SIGNING_PRIVATE_KEY is not set, so bundle.json is not signed (apps will ignore it).');
}
