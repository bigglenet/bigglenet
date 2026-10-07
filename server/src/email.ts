// Sends sign-in codes with Resend (https://resend.com).
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

/** Whether emails can be sent: on once the RESEND_API_KEY secret is set. */
export const emailReady = (env: Env) => !!env.RESEND_API_KEY || env.EMAIL_DEV_MODE === '1';

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

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Bigglenet <${env.MAIL_FROM}>`, to: [to], subject: SUBJECTS[purpose], html, text }),
    });
  } catch {
    res = new Response(null, { status: 599 });
  }
  if (!res.ok) {
    console.error('Email failed', res.status, await res.text().catch(() => ''));
    throw new HttpError(503, 'email_failed', "We couldn't send the email. Check the address and try again in a minute.");
  }
  return null;
}
