# The Bigglenet

A small alternative web for me and my friends. Sites are written in **BHTML**, live at **`name.biggle`** addresses, are reached over **`biggle://`**, and only open in the **Biggle browser** (a Tauri desktop app on Mac and a PWA on phones).

## Decisions so far

| Topic | Decision |
|---|---|
| Users | Me and friends, with accounts |
| Page format | `.bhtml`: normal HTML/CSS/JS plus Biggle-only features |
| Hosting sites | Bring your own host (Cloudflare Pages, GitHub Pages, anywhere) |
| `.biggle` names | Admin-only: admins hand names out and set where they point |
| Accounts | Open sign-up, one login everywhere (Biggle ID), friends and messaging |
| "Better than the web" | No ads, no tracking, enforced by the browser |
| Desktop app | Tauri |
| Mobile | PWA |
| Servers | `bigglenet.ethembeldagli.dev` on Cloudflare |

## Pieces

### 1. BHTML

- Files end in `.bhtml`; a site's home page is `index.bhtml`.
- The first line must be `<!bhtml 1>` instead of `<!DOCTYPE html>`. The Biggle browser refuses anything without it, so normal `.html` doesn't work in Biggle either.
- Everything after that is normal HTML, CSS and JS.
- Links use `biggle://name.biggle/path` or relative paths.
- Biggle-only extras:
  - `<biggle-me>` shows the visitor's Biggle username.
  - `<biggle-signed-in>` / `<biggle-signed-out>` show content depending on login.
  - `window.biggle` JS API: `biggle.me()`, `biggle.storage` (a per-site key-value store, because pages get no cookies).
- Why it breaks in Chrome: hosts serve `.bhtml` as `text/bhtml` so normal browsers download it instead of rendering, there's no doctype, `biggle://` links go nowhere, and the Biggle tags render empty.

### 2. Biggle DNS and gateway (Cloudflare Worker + D1)

- A `names` table maps `ethem` → `https://ethem-site.pages.dev/`. Only the admin can add or change names.
- `GET /resolve/:name` returns where a name points.
- `GET /site/:name/*path` fetches the file from the real host and returns it. The PWA needs this to get around CORS, and it lets the browser strip trackers in one place.

### 3. Biggle ID (accounts)

- Sign up and log in inside the Biggle browser.
- Sites never see your password or session token. The browser tells a page who you are through `biggle.me()` only.
- Each account has an `admin` flag; admins manage `.biggle` names.

### 4. Friends and messaging

- Friend requests, a friends list, and DMs in a sidebar of the browser.
- Real-time over WebSockets (Durable Object), with unread badges.

### 5. Biggle browser

One web app (Vite + TypeScript + Svelte) used in two places:

- **Desktop:** wrapped in Tauri. Registers `biggle://` so links from other apps open in Biggle.
- **Mobile:** installable PWA served from `bigglenet.ethembeldagli.dev`. Phones won't let a PWA own `biggle://`, so you type addresses in the app's address bar.

Features: address bar, tabs, back/forward, bookmarks, history, friends/chat sidebar.

Pages render in a sandboxed iframe with a strict Content-Security-Policy:

- No cookies or shared storage (no cross-site tracking).
- Network requests only to the site's own host; third-party scripts, ad networks and trackers are blocked.

## Repo layout

```
bigglenet/
  spec/       BHTML spec
  examples/   sample site (hello.biggle)
  server/     Cloudflare Worker: DNS, gateway, accounts, friends, messages
  browser/    shared browser UI (Vite + TS + Svelte)
  desktop/    Tauri wrapper
```

## Status

All seven steps of the original plan are done. v0.1.1 added the home.biggle homepage and open sign-up.

1. BHTML spec and an example site.
2. Browser shell that renders `.bhtml` pages.
3. Worker: Biggle DNS and the site gateway.
4. Accounts and `biggle.me()`. Sign-up started invite-only and opened to everyone in v0.1.1.
5. Friends and live messaging (Durable Object WebSockets).
6. Tauri desktop app with the `biggle://` scheme.
7. PWA served from `bigglenet.ethembeldagli.dev`.
