// Sends sign-in codes with Cloudflare Email Sending.
import { HttpError } from './http';

const SUBJECTS = {
  signup: 'Your Bigglenet sign-up code',
  verify: 'Confirm your email for Bigglenet',
  reset: 'Reset your Bigglenet password',
};

const LINES = {
  signup: 'Here is the code to finish making your Biggle ID.',
  verify: 'Here is the code to confirm this email address for your Biggle ID.',
  reset: 'Here is the code to reset your Bigglenet password.',
};

/**
 * Email a code. Returns null once sent. On a test server (EMAIL_DEV_MODE=1) nothing is sent
 * and the code comes back instead, so the flow can be tried without a mail setup.
 */
export async function sendCode(env: Env, to: string, code: string, purpose: keyof typeof SUBJECTS): Promise<string | null> {
  if (env.EMAIL_DEV_MODE === '1') return code;
  const text = `${LINES[purpose]}\n\n${code}\n\nIt works for 15 minutes. If you didn't ask for this, you can ignore this email.\n\nBigglenet`;
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:440px;margin:0 auto;padding:32px 24px;color:#222">
  <p style="font-size:22px;font-weight:800;letter-spacing:-0.02em;margin:0 0 16px">b.net</p>
  <p style="margin:0 0 20px;color:#555">${LINES[purpose]}</p>
  <p style="font-size:34px;font-weight:800;letter-spacing:0.18em;margin:0 0 20px;padding:16px;text-align:center;background:#f6f4f0;border-radius:14px">${code}</p>
  <p style="margin:0;color:#888;font-size:14px">It works for 15 minutes. If you didn't ask for this, you can ignore this email.</p>
</div>`;
  try {
    await env.EMAIL.send({ to, from: { email: env.MAIL_FROM, name: 'Bigglenet' }, subject: SUBJECTS[purpose], text, html });
  } catch (e) {
    console.error('Email failed', (e as { code?: string }).code, (e as Error).message);
    throw new HttpError(503, 'email_failed', "We couldn't send the email. Check the address and try again in a minute.");
  }
  return null;
}
