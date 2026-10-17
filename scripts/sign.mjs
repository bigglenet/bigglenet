// Signs release files with the release key (TAURI_SIGNING_PRIVATE_KEY, and
// TAURI_SIGNING_PRIVATE_KEY_PASSWORD if it has one), writing <file>.sig next to each.
//
// `tauri signer sign` makes minisign's newer "ED" signatures, which sign a BLAKE2b hash of the
// file. The desktop app checks signatures with Electron's crypto, which has no BLAKE2b, so it
// couldn't trust any update. This makes the older "Ed" kind instead (the file itself is signed),
// which every Bigglenet app can check (desktop/main/minisign.js).
//
//   node scripts/sign.mjs <file>...
import { createPrivateKey, scryptSync, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const b64 = (text) => Buffer.from(text.trim(), 'base64');

// libsodium's pickparams for crypto_pwhash_scryptsalsa208sha256, which minisign keys use.
function scryptParams(opslimit, memlimit) {
  const r = 8;
  let N = 1;
  let p;
  if (opslimit < 32768) opslimit = 32768;
  if (opslimit < memlimit / 32) {
    p = 1;
    const maxN = opslimit / (r * 4);
    while (N < 63 && 2 ** N <= maxN / 2) N++;
  } else {
    const maxN = memlimit / (r * 128);
    while (N < 63 && 2 ** N <= maxN / 2) N++;
    const maxrp = Math.min(Math.floor(opslimit / 4 / 2 ** N), 0x3fffffff);
    p = Math.floor(maxrp / r);
  }
  return { N: 2 ** N, r, p };
}

/** The release key: its id and Ed25519 private key. */
export function releaseKey(keyText = process.env.TAURI_SIGNING_PRIVATE_KEY, password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '') {
  if (!keyText) throw new Error('TAURI_SIGNING_PRIVATE_KEY is not set.');
  // Tauri keeps the minisign key file base64-encoded once more.
  const file = keyText.includes('untrusted comment') ? keyText : b64(keyText).toString('utf8');
  const raw = b64(file.split('\n')[1]);
  if (raw.length !== 158 || raw.subarray(0, 2).toString() !== 'Ed') throw new Error("That isn't a minisign secret key.");
  const keynum = Buffer.from(raw.subarray(54, 158));
  if (raw.subarray(2, 4).toString() === 'Sc') {
    const { N, r, p } = scryptParams(Number(raw.readBigUInt64LE(38)), Number(raw.readBigUInt64LE(46)));
    const stream = scryptSync(password, raw.subarray(6, 38), keynum.length, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 });
    for (let i = 0; i < keynum.length; i++) keynum[i] ^= stream[i];
  }
  const id = keynum.subarray(0, 8);
  const seed = keynum.subarray(8, 40);
  // An Ed25519 private key in PKCS#8 DER, from its 32-byte seed.
  const key = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  return { id: Buffer.from(id), key };
}

/** A minisign "Ed" signature file for `data`, base64-encoded the way Tauri's update feed has it. */
export function signature(data, name, { id, key } = releaseKey()) {
  const sig = sign(null, data, key);
  const trusted = `timestamp:${Math.floor(Date.now() / 1000)}\tfile:${name}`;
  const global = sign(null, Buffer.concat([sig, Buffer.from(trusted)]), key);
  const text = `untrusted comment: signature from tauri secret key\n${Buffer.concat([Buffer.from('Ed'), id, sig]).toString('base64')}\ntrusted comment: ${trusted}\n${global.toString('base64')}\n`;
  return Buffer.from(text).toString('base64');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const key = releaseKey();
  for (const file of process.argv.slice(2)) {
    writeFileSync(`${file}.sig`, signature(readFileSync(file), basename(file), key));
    console.log(`Signed ${basename(file)}`);
  }
}
