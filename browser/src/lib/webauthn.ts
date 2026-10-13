// Passkeys in this browser (server/src/passkeys.ts). The desktop app does them in the system
// browser instead (account.svelte.ts), which knows about Touch ID, Windows Hello and phones.
const b64 = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const bytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const passkeysHere = typeof window !== 'undefined' && !!window.PublicKeyCredential;

type LoginOptions = { challenge: string; rpId: string; userVerification: UserVerificationRequirement; timeout: number };
type RegisterOptions = {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  authenticatorSelection: AuthenticatorSelectionCriteria;
  excludeCredentials: { type: 'public-key'; id: string }[];
  timeout: number;
  attestation: AttestationConveyancePreference;
};

/** Ask for a passkey, and what the server needs to check it. */
export async function getPasskey(o: LoginOptions) {
  const c = (await navigator.credentials.get({ publicKey: { ...o, challenge: bytes(o.challenge) } })) as PublicKeyCredential | null;
  if (!c) throw new Error('No passkey was chosen.');
  const r = c.response as AuthenticatorAssertionResponse;
  return { id: c.id, clientDataJSON: b64(r.clientDataJSON), authenticatorData: b64(r.authenticatorData), signature: b64(r.signature) };
}

/** Make a passkey, and what the server keeps of it. */
export async function createPasskey(o: RegisterOptions) {
  const c = (await navigator.credentials.create({
    publicKey: { ...o, challenge: bytes(o.challenge), user: { ...o.user, id: bytes(o.user.id) }, excludeCredentials: o.excludeCredentials.map((x) => ({ ...x, id: bytes(x.id) })) },
  })) as PublicKeyCredential | null;
  if (!c) throw new Error('No passkey was made.');
  const r = c.response as AuthenticatorAttestationResponse;
  const key = r.getPublicKey();
  if (!key) throw new Error('This browser can’t make passkeys Bigglenet can use.');
  return { id: c.id, clientDataJSON: b64(r.clientDataJSON), publicKey: b64(key), algorithm: r.getPublicKeyAlgorithm() };
}
