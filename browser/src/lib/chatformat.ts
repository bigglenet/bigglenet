// Small helpers for showing chats: times, days and links in messages.
import { fromInput } from './url';

const DAY = 86_400_000;
const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);

/** "14:05" today, "Yesterday", "Mon" this week, or "12 Oct". */
export function shortTime(at: number): string {
  const today = startOfDay(Date.now());
  if (at >= today) return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (at >= today - DAY) return 'Yesterday';
  if (at >= today - 6 * DAY) return new Date(at).toLocaleDateString([], { weekday: 'short' });
  return new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const fullTime = (at: number) => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** "Today", "Yesterday", or the date. */
export function dayLabel(at: number): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(at);
  if (day === today) return 'Today';
  if (day === today - DAY) return 'Yesterday';
  const sameYear = new Date(at).getFullYear() === new Date().getFullYear();
  return new Date(at).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

export const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);

/** "3:07" or "1:02:45". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export type Part = { text: string; link?: { kind: 'biggle' | 'external'; href: string } };

const LINK_RE = /(biggle:\/\/[^\s<>"]+|https?:\/\/[^\s<>"]+|\b[a-z0-9-]+\.biggle(?:\/[^\s<>"]*)?)/gi;

/** Split a message into text and links to biggle sites or the normal web. */
export function linkify(body: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of body.matchAll(LINK_RE)) {
    // Leave trailing punctuation out of the link.
    const raw = m[0].replace(/[.,!?;:)\]'"]+$/, '');
    const target = fromInput(raw);
    if (!target) continue;
    if (m.index > last) parts.push({ text: body.slice(last, m.index) });
    parts.push({ text: raw, link: target });
    last = m.index + raw.length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts;
}

/** Show a camera or microphone stream in a <video> or <audio>. */
export function srcObject(el: HTMLMediaElement, stream: MediaStream | null) {
  const set = (s: MediaStream | null) => {
    if (el.srcObject !== s) el.srcObject = s;
    if (s) el.play().catch(() => {});
  };
  set(stream);
  return { update: set, destroy: () => (el.srcObject = null) };
}
