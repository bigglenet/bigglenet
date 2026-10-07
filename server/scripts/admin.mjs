// Admin tool for the Bigglenet database.
//
//   npm run name -- list
//   npm run name -- set <name> <url> ["Title"]
//   npm run name -- rm <name>
//   npm run invite                    make a one-time invite code
//   npm run promote -- <username>     make someone an admin
//
// Works on the local dev database. Add --remote to change the live one.
import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';

const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const [group, ...rest] = args.filter((a) => a !== '--remote');

const sql = (s) => `'${String(s).replaceAll("'", "''")}'`;

function usage(message) {
  if (message) console.error(`${message}\n`);
  console.error(`Usage:
  npm run name -- list
  npm run name -- set <name> <url> ["Title"]
  npm run name -- rm <name>
  npm run invite
  npm run promote -- <username>

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

function run(command) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'bigglenet', remote ? '--remote' : '--local', '--command', command],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (group === 'name') {
  const [cmd, ...params] = rest;
  if (cmd === 'list') {
    run('SELECT name, url, title FROM names ORDER BY name');
  } else if (cmd === 'set') {
    const name = checkName(params[0]);
    const url = checkUrl(params[1] ?? '');
    const title = params[2] ? sql(params[2]) : 'NULL';
    run(`INSERT INTO names (name, url, title) VALUES (${sql(name)}, ${sql(url)}, ${title})
      ON CONFLICT(name) DO UPDATE SET url = excluded.url, title = excluded.title, updated_at = unixepoch()`);
  } else if (cmd === 'rm') {
    run(`DELETE FROM names WHERE name = ${sql(checkName(params[0]))}`);
  } else {
    usage();
  }
} else if (group === 'invite') {
  const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  run(`INSERT INTO invites (code) VALUES (${sql(code)})`);
  console.log(`\nInvite code: ${code.slice(0, 4)}-${code.slice(4)}`);
} else if (group === 'promote') {
  const username = (rest[0] ?? '').toLowerCase();
  if (!/^[a-z0-9_]{2,24}$/.test(username)) usage('Give the username to promote.');
  run(`UPDATE users SET is_admin = 1 WHERE username = ${sql(username)}`);
} else {
  usage();
}
