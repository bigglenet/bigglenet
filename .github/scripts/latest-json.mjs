// Writes latest.json, which tells installed apps the newest version and where to get it, from
// a release's signed files. The build jobs run side by side, so they don't write it themselves:
// they'd overwrite each other's entries and some systems would never hear about the update.
//
//   GITHUB_REPOSITORY=owner/repo node .github/scripts/latest-json.mjs <release id>
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const repo = process.env.GITHUB_REPOSITORY;
const id = process.argv[2];
if (!repo || !id) throw new Error('Usage: GITHUB_REPOSITORY=owner/repo node latest-json.mjs <release id>');

const gh = (...args) => execFileSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
const release = JSON.parse(gh(`repos/${repo}/releases/${id}`));
const assets = new Map(release.assets.map((a) => [a.name, a]));

// Which file each kind of installed app updates from.
const KINDS = [
  [/_aarch64\.app\.tar\.gz$/, ['darwin-aarch64', 'darwin-aarch64-app']],
  [/_x64\.app\.tar\.gz$/, ['darwin-x86_64', 'darwin-x86_64-app']],
  [/\.AppImage$/, ['linux-x86_64', 'linux-x86_64-appimage']],
  [/\.deb$/, ['linux-x86_64-deb']],
  [/\.rpm$/, ['linux-x86_64-rpm']],
  [/-setup\.exe$/, ['windows-x86_64', 'windows-x86_64-nsis']],
  [/\.msi$/, ['windows-x86_64-msi']],
];

const platforms = {};
for (const [name, asset] of assets) {
  const kind = KINDS.find(([re]) => re.test(name));
  const sig = assets.get(`${name}.sig`);
  if (!kind || !sig) continue;
  const signature = gh('-H', 'Accept: application/octet-stream', `repos/${repo}/releases/assets/${sig.id}`).trim();
  for (const platform of kind[1]) platforms[platform] = { signature, url: asset.url };
}

const missing = ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-x86_64'].filter((p) => !platforms[p]);
if (missing.length) throw new Error(`No signed update for ${missing.join(', ')}.`);

const version = release.tag_name.replace(/^v/, '');
writeFileSync('latest.json', JSON.stringify({ version, notes: '', pub_date: new Date().toISOString(), platforms }, null, 2));
console.log(`latest.json for ${version}: ${Object.keys(platforms).sort().join(', ')}`);
