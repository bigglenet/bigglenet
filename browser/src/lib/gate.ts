// Where the Biggle browser is allowed to run. On the web it only works as an installed
// phone app (a PWA on the home screen). Computers use the desktop app instead.
import { isApp } from './platform';

export type Gate = 'ok' | 'desktop' | 'ios' | 'android';

type NavigatorExtras = Navigator & { standalone?: boolean; userAgentData?: { mobile?: boolean } };

export function gate(): Gate {
  if (isApp || import.meta.env.DEV) return 'ok';

  const nav = navigator as NavigatorExtras;
  const ua = nav.userAgent;
  // iPadOS reports itself as a Mac, so look for a touch screen too.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const mobile = ios || android || nav.userAgentData?.mobile === true;
  const installed =
    nav.standalone === true ||
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches;

  if (mobile && installed) return 'ok';
  if (!mobile) return 'desktop';
  return ios ? 'ios' : 'android';
}
