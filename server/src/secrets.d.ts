// Secrets and optional settings that aren't in wrangler.jsonc, so `wrangler types` doesn't
// know about them. Set with `wrangler secret put NAME` (and in .dev.vars for local dev).
interface Env {
  /** Signs preview links for sites waiting for approval. */
  PREVIEW_SECRET: string;
  /** Google sign-in. Both must be set for "Continue with Google" to appear. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** "1" on test servers: don't send emails, return the code in the response instead. */
  EMAIL_DEV_MODE?: string;
}
