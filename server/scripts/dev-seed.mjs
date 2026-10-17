// A small local database to try things on: three people (tester is an admin and friends with
// friend; other knows nobody), each signed in, and a few live sites. Their session tokens go in
// .dev-tokens.json, for tests and for signing in by hand (localStorage "biggle:session").
//
//   npm run dev:reset -w server     (with the local server stopped)
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const hex = (s) => `X'${Buffer.from(s).toString('hex')}'`;
const people = ['tester', 'friend', 'other'];
const tokens = Object.fromEntries(people.map((p) => [p, randomBytes(32).toString('base64url')]));

const page = (title, body) => `<!bhtml 1>
<html>
<head><title>${title}</title></head>
<body>
<h1>${title}</h1>
${body}
</body>
</html>
`;
// [name, owner, title, files]
const sites = [
  ['gbtest', 'friend', 'Guestbook test', { 'index.bhtml': page('Guestbook test', '<p>Hello from gbtest. The quick brown fox.</p>\n<biggle-guestbook></biggle-guestbook>') }],
  ['article', 'friend', 'A long read', { 'index.bhtml': page('A long read', '<p>All about small webs and why they matter.</p>') }],
  ['kittest', 'tester', 'Kit test', { 'index.bhtml': page('Kit test', '<biggle-poll id="p" question="Best?" options="A|B"></biggle-poll>\n<biggle-like></biggle-like>\n<biggle-comments></biggle-comments>') }],
];

let sql = '';
people.forEach((p, i) => {
  sql += `INSERT INTO users (id, username, password_hash, password_salt, is_admin, email, email_verified) VALUES (${i + 1}, ${q(p)}, 'x', 'x', ${p === 'tester' ? 1 : 0}, ${q(`${p}@example.com`)}, 1);\n`;
  sql += `INSERT INTO sessions (token_hash, user_id) VALUES (${q(createHash('sha256').update(tokens[p]).digest('hex'))}, ${i + 1});\n`;
});
sql += `INSERT INTO friendships (user_id, friend_id, status) VALUES (1, 2, 'friends'), (2, 1, 'friends');\n`;
for (const [name, owner, title, files] of sites) {
  sql += `INSERT INTO names (name, tld, title, owner_id, status) VALUES (${q(name)}, 'biggle', ${q(title)}, ${people.indexOf(owner) + 1}, 'live');\n`;
  for (const [path, text] of Object.entries(files)) {
    sql += `INSERT INTO site_files (site, path, type, content, size) VALUES (${q(name)}, ${q(path)}, 'text/html', ${hex(text)}, ${Buffer.byteLength(text)});\n`;
  }
}

const file = join(mkdtempSync(join(tmpdir(), 'biggle-seed-')), 'seed.sql');
writeFileSync(file, sql);
execFileSync('npx', ['wrangler', 'd1', 'execute', 'bigglenet', '--local', '--file', file], { stdio: 'ignore' });
writeFileSync('.dev-tokens.json', JSON.stringify(tokens, null, 2));
console.log('Seeded: tester (admin), friend, other. Tokens in server/.dev-tokens.json.');
