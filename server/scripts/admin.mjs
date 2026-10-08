// Admin tool for the Bigglenet database.
//
//   npm run name -- list
//   npm run name -- set <name> <url> ["Title"] [--live]
//                                     --live: a normal website (an app, a game) shown as it is
//   npm run name -- rm <name>
//   npm run promote -- <username>     make someone an admin
//   npm run site -- push <name> <folder> ["Title"] [--owner <username>]
//                                     host a folder's files on the Bigglenet as <name>.biggle
//
// Works on the local dev database. Add --remote to change the live one.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const ownerAt = args.indexOf('--owner');
const owner = ownerAt === -1 ? null : args[ownerAt + 1];
const live = args.includes('--live');
const [group, ...rest] = args.filter(
  (a, i) => a !== '--remote' && a !== '--live' && (ownerAt === -1 || (i !== ownerAt && i !== ownerAt + 1)),
);

// Same as FILE_TYPES in src/sites.ts.
const FILE_TYPES = {
  bhtml: 'text/bhtml; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
};

const sql = (s) => `'${String(s).replaceAll("'", "''")}'`;

function usage(message) {
  if (message) console.error(`${message}\n`);
  console.error(`Usage:
  npm run name -- list
  npm run name -- set <name> <url> ["Title"] [--live]
  npm run name -- rm <name>
  npm run promote -- <username>
  npm run site -- push <name> <folder> ["Title"] [--owner <username>]

Add --remote to change the live database.`);
  process.exit(1);
}

function checkName(name) {
  name = (name ?? '').toLowerCase().replace(/\.biggle$/, '');
  if (!NAME_RE.test(name)) usage(`"${name}" isn't a valid name. Use a-z, 0-9 and "-", up to 63 characters.`);
  return name;
}

function checkUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    usage(`"${raw}" isn't a URL.`);
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) usage('The URL must start with https://');
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

function run(command, file = false) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'bigglenet', remote ? '--remote' : '--local', file ? '--file' : '--command', command],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Every file in a folder that the Bigglenet can host, skipping hidden files and _headers. */
function siteFiles(folder) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry.startsWith('_')) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const path = relative(folder, full).split('\\').join('/');
        const type = FILE_TYPES[path.split('.').pop().toLowerCase()];
        if (!type) usage(`Biggle can't host ${path}.`);
        out.push({ path, type, bytes: readFileSync(full) });
      }
    }
  };
  walk(folder);
  if (!out.some((f) => f.path === 'index.bhtml')) usage(`${folder} has no index.bhtml.`);
  return out;
}

if (group === 'name') {
  const [cmd, ...params] = rest;
  if (cmd === 'list') {
    run('SELECT name, url, title, live FROM names ORDER BY name');
  } else if (cmd === 'set') {
    const name = checkName(params[0]);
    const url = checkUrl(params[1] ?? '');
    const title = params[2] ? sql(params[2]) : 'NULL';
    run(`INSERT INTO names (name, url, title, status, live) VALUES (${sql(name)}, ${sql(url)}, ${title}, 'live', ${live ? 1 : 0})
      ON CONFLICT(name) DO UPDATE SET url = excluded.url, title = excluded.title, status = 'live', live = excluded.live,
        updated_at = unixepoch()`);
  } else if (cmd === 'rm') {
    run(`DELETE FROM names WHERE name = ${sql(checkName(params[0]))}`);
  } else {
    usage();
  }
} else if (group === 'site') {
  const [cmd, rawName, folder, title] = rest;
  if (cmd !== 'push' || !folder) usage();
  const name = checkName(rawName);
  const files = siteFiles(folder);
  const ownerSql = owner ? `(SELECT id FROM users WHERE username = ${sql(owner.toLowerCase())})` : 'NULL';
  const statements = [
    `INSERT INTO names (name, url, title, owner_id, status) VALUES (${sql(name)}, NULL, ${title ? sql(title) : 'NULL'}, ${ownerSql}, 'live')
     ON CONFLICT(name) DO UPDATE SET url = NULL, title = COALESCE(excluded.title, names.title),
       owner_id = COALESCE(excluded.owner_id, names.owner_id), status = 'live', updated_at = unixepoch();`,
    `DELETE FROM site_files WHERE site = ${sql(name)};`,
    ...files.map(
      (f) =>
        `INSERT INTO site_files (site, path, type, content, size) VALUES (${sql(name)}, ${sql(f.path)}, ${sql(f.type)}, X'${f.bytes.toString('hex')}', ${f.bytes.length});`,
    ),
  ];
  const file = join(mkdtempSync(join(tmpdir(), 'biggle-')), 'site.sql');
  writeFileSync(file, statements.join('\n'));
  run(file, true);
  console.log(`\n${name}.biggle: ${files.length} files (${files.map((f) => f.path).join(', ')})`);
} else if (group === 'promote') {
  const username = (rest[0] ?? '').toLowerCase();
  if (!/^[a-z0-9_]{2,24}$/.test(username)) usage('Give the username to promote.');
  run(`UPDATE users SET is_admin = 1 WHERE username = ${sql(username)}`);
} else {
  usage();
}
