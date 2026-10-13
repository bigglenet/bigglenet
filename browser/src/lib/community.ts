// Small things the community pages share (feed, clubs, the board, events, collections).
import { i18n, t } from './i18n.svelte';

/** "Fri 17 Oct, 20:00" for an event (unix seconds). */
export function when(seconds: number): string {
  const d = new Date(seconds * 1000);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(i18n.locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "5 minutes ago", "yesterday", "3 days ago" (milliseconds). */
export function ago(ms: number): string {
  const s = Math.round((ms - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'auto' });
  const abs = Math.abs(s);
  if (abs < 60) return t('just now');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ms).toLocaleDateString(i18n.locale, { day: 'numeric', month: 'short', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** A date and time for <input type="datetime-local">, from unix seconds (and back). */
export const toLocalInput = (seconds: number) => {
  const d = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value: string) => (value ? Math.floor(new Date(value).getTime() / 1000) : null);
