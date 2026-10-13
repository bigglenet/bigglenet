// What a chat's event lines say ("ethem joined the club"). The server keeps them in English
// (chat.ts, clubs.ts, events.ts), so they're put into the reader's language here; anything not
// listed shows as it came.
import { t } from './i18n.svelte';

const EVENTS: [RegExp, string][] = [
  [/^made the group$/, '{who} made the group'],
  [/^named the group “(?<name>.*)”$/, '{who} named the group “{name}”'],
  [/^removed the group name$/, '{who} removed the group name'],
  [/^added (?<names>.+)$/, '{who} added {names}'],
  [/^left the group$/, '{who} left the group'],
  [/^started a call$/, '{who} started a call'],
  [/^started a video call$/, '{who} started a video call'],
  [/^Call ended · (?<minutes>\d+) min$/, 'Call ended · {minutes} min'],
  [/^started the club$/, '{who} started the club'],
  [/^joined the club$/, '{who} joined the club'],
  [/^left the club$/, '{who} left the club'],
  [/^was taken out of the club$/, '{who} was taken out of the club'],
  [/^renamed the club “(?<name>.*)” and made (?<site>\S+) the club’s site$/, '{who} renamed the club “{name}” and made {site} the club’s site'],
  [/^renamed the club “(?<name>.*)” and stopped sharing a site with the club$/, '{who} renamed the club “{name}” and stopped sharing a site with the club'],
  [/^renamed the club “(?<name>.*)”$/, '{who} renamed the club “{name}”'],
  [/^made (?<site>\S+) the club’s site$/, '{who} made {site} the club’s site'],
  [/^stopped sharing a site with the club$/, '{who} stopped sharing a site with the club'],
  [/^planned “(?<title>.*)”: (?<link>biggle:\/\/\S+)$/, '{who} planned “{title}”: {link}'],
];

/** An event line, with `who` (their name as you see it) doing it. */
export function eventText(who: string | null, body: string): string {
  for (const [re, text] of EVENTS) {
    const m = body.match(re);
    if (m) return t(text, { who, ...m.groups });
  }
  return who ? `${who} ${body}` : body;
}
