// Invite links: share yours, and whoever signs up through it is your friend straight away.
//
//   GET  /api/invites         your link (made the first time you ask) and how many joined with it
//   POST /api/invites/new     a new link; the old one stops working
//   GET  /api/invites/:code   who an invite is from, for the sign-up screen (no sign-in needed)
//   GET  /invite/:code        the link itself: opens the web app, which shows who invited you
//
// Sign-up (auth.ts, google.ts) passes the code along to useInvite().
import { requireUser } from './auth';
import { record } from './feed';
import { HttpError, json, redirect } from './http';
import { addNotification } from './notifications';
import { makeFriends } from './social';

const CODE_RE = /^[A-Za-z0-9]{6,16}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

async function shown(req: Request, env: Env, userId: number, code: string) {
  const joined = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE invited_by = ?').bind(userId).first<{ n: number }>();
  return json({ code, link: `${new URL(req.url).origin}/invite/${code}`, joined: joined?.n ?? 0 });
}

export async function myInvite(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const row = await env.DB.prepare('SELECT code FROM invites WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(me.id).first<{ code: string }>();
  if (row) return shown(req, env, me.id, row.code);
  const code = newCode();
  await env.DB.prepare('INSERT INTO invites (code, user_id) VALUES (?, ?)').bind(code, me.id).run();
  return shown(req, env, me.id, code);
}

export async function newInvite(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const code = newCode();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM invites WHERE user_id = ?').bind(me.id),
    env.DB.prepare('INSERT INTO invites (code, user_id) VALUES (?, ?)').bind(code, me.id),
  ]);
  return shown(req, env, me.id, code);
}

export async function inviteInfo(_req: Request, env: Env, code: string): Promise<Response> {
  const row = CODE_RE.test(code)
    ? await env.DB.prepare('SELECT u.username, u.avatar_v FROM invites i JOIN users u ON u.id = i.user_id WHERE i.code = ?')
        .bind(code)
        .first<{ username: string; avatar_v: number | null }>()
    : null;
  if (!row) throw new HttpError(404, 'no_such_invite', 'That invite link doesn’t work any more. Ask for a new one.');
  return json({ from: row.username, avatar: row.avatar_v });
}

/** The link people share: the web app takes it from there. */
export async function inviteLink(_req: Request, _env: Env, code: string): Promise<Response> {
  return redirect(CODE_RE.test(code) ? `/?invite=${code}` : '/', 302);
}

/** Someone just signed up with `code`: make them friends with whoever invited them. */
export async function useInvite(env: Env, code: unknown, user: { id: number; username: string }) {
  if (typeof code !== 'string' || !CODE_RE.test(code)) return;
  const from = await env.DB.prepare('SELECT i.user_id, u.username FROM invites i JOIN users u ON u.id = i.user_id WHERE i.code = ?')
    .bind(code)
    .first<{ user_id: number; username: string }>();
  if (!from || from.user_id === user.id) return;
  await env.DB.batch([
    env.DB.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').bind(code),
    env.DB.prepare('UPDATE users SET invited_by = ? WHERE id = ?').bind(from.user_id, user.id),
  ]);
  await makeFriends(env, from.user_id, user.id);
  await addNotification(env, from.user_id, 'invite-joined', { username: user.username });
  await record(env, user.id, 'joined', { via: from.username });
}
