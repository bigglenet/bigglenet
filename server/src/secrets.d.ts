// Secrets and optional settings that aren't in wrangler.jsonc, so `wrangler types` doesn't
// know about them. Set with `wrangler secret put NAME` (and in .dev.vars for local dev).
interface Env {
  /** Signs preview links for sites waiting for approval. */
  PREVIEW_SECRET: string;
  /** Google sign-in. Both must be set for "Continue with Google" to appear. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Resend API key. Setting it turns on email sign-up, password resets and email confirmation. */
  RESEND_API_KEY?: string;
  /** "1" on test servers: don't send emails, return the code in the response instead. */
  EMAIL_DEV_MODE?: string;
  /**
   * "1" when running locally (.dev.vars). wrangler dev hands the Worker the production hostname,
   * so this is how passkeys know to belong to localhost, and push may go to a local test endpoint.
   */
  LOCAL_DEV?: string;
  /** Web push (push.ts): our VAPID public key (base64url) and private key (a JWK, as JSON). */
  VAPID_PUBLIC?: string;
  VAPID_PRIVATE?: string;
  /** Nightly backups and restoring (backups.ts): an API token that can edit D1, and the account. */
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
}
