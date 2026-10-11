// Checks minisign signatures: the ones on Bigglenet's updates (made with the release signing key,
// see "Release" in the README). The same key signed the older Tauri releases, so their update
// feed and ours are one and the same.
import { createHash, createPublicKey, verify } from 'node:crypto';

// An Ed25519 public key in DER, from its 32 raw bytes.
const ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** The base64 text of a minisign key or signature file, split into its lines. */
function lines(base64) {
  return Buffer.from(base64.trim(), 'base64').toString('utf8').split('\n').map((l) => l.trim());
}

/**
 * Whether `signature` (a minisign .sig file, base64 encoded as in the update feed) is a valid
 * signature of `data` by `publicKey` (a minisign public key file, base64 encoded).
 */
export function verifySignature(data, signature, publicKey) {
  const key = Buffer.from(lines(publicKey)[1], 'base64');
  const sigLines = lines(signature);
  const sig = Buffer.from(sigLines[1], 'base64');
  if (key.length !== 42 || sig.length !== 74 || key.subarray(0, 2).toString() !== 'Ed') return false;
  // The signature names the key it was made with.
  if (!sig.subarray(2, 10).equals(key.subarray(2, 10))) return false;
  const pk = createPublicKey({ key: Buffer.concat([ED25519_PREFIX, key.subarray(10)]), format: 'der', type: 'spki' });

  // "ED" signs a BLAKE2b-512 hash of the file; the older "Ed" signs the file itself.
  const algorithm = sig.subarray(0, 2).toString();
  if (algorithm !== 'ED' && algorithm !== 'Ed') return false;
  const message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data;
  if (!verify(null, message, pk, sig.subarray(10))) return false;

  // The trusted comment is signed too, along with the signature.
  const trusted = sigLines[2]?.replace(/^trusted comment: /, '');
  const global = sigLines[3] && Buffer.from(sigLines[3], 'base64');
  if (trusted === undefined || !global) return false;
  return verify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted)]), pk, global);
}
