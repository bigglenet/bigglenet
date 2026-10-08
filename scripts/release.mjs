// Puts out a new Bigglenet version everywhere at once: the website and phone app, and the
// desktop apps. Bumps the version, deploys, then commits and tags it. The tag makes GitHub
// build the desktop apps, and installed apps offer the update by themselves.
//
//   npm run release            0.1.4 → 0.1.5
//   npm run release -- 0.2.0   a version of your choosing
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
function fail(message) {
  console.error(message);
  process.exit(1);
}

if (out('git branch --show-current') !== 'main') fail('Release from the main branch.');
if (out('git status --porcelain')) fail('Commit or put away your changes first.');
run('git pull --ff-only');

const current = JSON.parse(readFileSync('desktop/src-tauri/tauri.conf.json', 'utf8')).version;
const next = process.argv[2] ?? current.replace(/\d+$/, (n) => String(Number(n) + 1));
if (!/^\d+\.\d+\.\d+$/.test(next)) fail(`"${next}" isn't a version like 1.2.3.`);
if (out(`git tag -l v${next}`)) fail(`v${next} already exists.`);

function edit(path, change) {
  const before = readFileSync(path, 'utf8');
  const after = change(before);
  if (after === before) fail(`Couldn't find the version in ${path}.`);
  writeFileSync(path, after);
}
const json = (s) => s.replace(`"version": "${current}"`, `"version": "${next}"`);
edit('desktop/src-tauri/tauri.conf.json', json);
edit('desktop/package.json', json);
edit('package.json', json);
edit('desktop/src-tauri/Cargo.toml', (s) => s.replace(/^version = "[^"]*"/m, `version = "${next}"`));
edit('desktop/src-tauri/Cargo.lock', (s) => s.replace(/(name = "bigglenet"\nversion = )"[^"]*"/, `$1"${next}"`));
edit('README.md', (s) => s.replace(/Bigglenet - v[\d.]+/, `Bigglenet - v${next}`));
run('npm install --package-lock-only --ignore-scripts --no-audit --no-fund');

console.log(`\nDeploying ${next}…`);
try {
  run('npm run deploy');
} catch {
  fail('The deploy failed, so nothing was committed. Undo the version bump with: git checkout .');
}
run(`git commit -qam "Bigglenet ${next}"`);
run(`git tag v${next}`);
run('git push -q origin main');
run(`git push -q origin v${next}`);
console.log(`\nBigglenet ${next} is live on the web. The desktop apps build on GitHub now (about 15 minutes),\nthen installed apps offer the update.`);
