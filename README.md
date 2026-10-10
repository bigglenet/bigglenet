<div align="center">
  <img src="brand/icon-app.png" alt="b.net" height="150">
  <h1>Bigglenet - v0.1.13</h1>
</div>

A small, friendly alternative to the web. Sites are written in **BHTML**, live at **`name.biggle`** addresses, and open in the **Biggle browser**, which blocks ads and trackers by design.

- **BHTML pages:** normal HTML, CSS and JS with a `<!bhtml 1>` header, so they only open in Biggle.
- **A built-in site editor:** pick a name and a look, add text, pictures and buttons. No code or hosting needed. Admins approve every new site.
- **Import a website you already have:** from its link, a folder or a .zip.
- **`.biggle` names:** sites made in the editor get theirs straight away; you can also host files anywhere and point a name at them.
- **One Biggle ID:** sign up with your email or Google, and every site can greet you by name.
- **Friends and chat:** add friends and message them live, right in the browser.
- **No ads, no tracking:** pages run sandboxed, with no cookies, and can't load anything from outside the Bigglenet.

## Get the browser

- **Mac, Windows, Linux:** download it from [Releases](https://github.com/bigglenet/bigglenet/releases/latest). It updates itself.
- **Phone:** open [bigglenet.ethembeldagli.dev](https://bigglenet.ethembeldagli.dev) and add it to your home screen. The web version only runs as a home-screen app; in a normal browser tab it shows how to install it.

You need a Biggle ID to use it: sign up with your email address (we send a code to confirm it) or with Google. Then open **home.biggle** to look around.

## Make a site

The easy way: in Biggle, open your account menu → **My sites** (or go to `biggle://sites`). Pick a name and a look, then add blocks. It saves as you go, and goes live once an admin approves it.

The hands-on way: write the HTML yourself, in the editor's Code view or on your own host.

Already have a website? In **My sites**, choose **Import a website** and give its link, or pick its folder or a .zip of it. Biggle copies the pages (as .bhtml), pictures, styles, scripts and fonts, including ones the site loaded from other places, and points every link at the copies. Trackers are left out. Up to 25 pages, 60 files and 5 MB. Games and apps are too big and too lively to copy: admins can tick **Keep it live** instead, and the name then shows the original site as it is, fetched fresh each time (or use **Live app** in the Admin page, or `npm run name -w server -- set <name> <url> --live`). Pages get `localStorage` and cookies kept per site, so saves work.

```html
<!bhtml 1>
<title>My site</title>
<h1>Hello, <biggle-me>guest</biggle-me>!</h1>
<a href="about.bhtml">About me</a>
```

To host it yourself, save it as `index.bhtml`, upload the folder to any static host (Cloudflare Pages, GitHub Pages…) and ask an admin to point your `.biggle` name at it. [spec/BHTML.md](spec/BHTML.md) has everything else, and [examples/hello](examples/hello) is a complete site.

## How it fits together

```
browser/      the Biggle browser (Svelte), also served as the PWA
desktop/      the desktop app (Tauri), wrapping the browser
server/       Cloudflare Worker: Biggle DNS, site gateway, accounts, friends, chat
sites/home/   home.biggle, the Bigglenet's homepage
examples/     example sites (hello.biggle)
spec/         the BHTML format
brand/        logo and app icons
```

The browser renders each page in a sandboxed iframe with a strict Content-Security-Policy. It fetches site files through the server's gateway (`/site/<name>/<path>`). Every site hosted on the Bigglenet lives in the server's database and is served by the one Worker; names that point at an outside host are fetched from there. Sites waiting for approval are only reachable through signed preview links (`/preview/<token>/<path>`) given to their owner and admins.

## Develop

```bash
npm install
npm run setup     # local database, with hello.biggle and home.biggle in it
npm run dev       # server :8787, browser :5173
```

Put local settings in `server/.dev.vars`. With `EMAIL_DEV_MODE=1`, sign-up codes are shown in the app instead of emailed:

```
PREVIEW_SECRET=any-long-random-string
EMAIL_DEV_MODE=1
```

Chrome-based browsers stop sandboxed pages from reaching `localhost`, so locally a page's own CSS, images and scripts don't load there. To test pages, run the browser against the live server instead:

```bash
npm run dev:live
```

Desktop app:

```bash
npm run app:dev     # live-reloading app
npm run app:build   # build it for this computer (needs the update signing key, see below)
```

## Run your own Bigglenet

```bash
npm run db:migrate:remote -w server           # set up the database
npx wrangler secret put PREVIEW_SECRET        # in server/: any long random string
npm run deploy                                # build the PWA and deploy the Worker
npm run promote -w server -- you --remote     # after signing up, make yourself an admin
```

**Updates:** `npm run release` puts out a new version everywhere at once: it bumps the version, deploys the website and phone app, and tags the release so GitHub builds the desktop apps, which then offer the update. Use it instead of `npm run deploy` so the web and desktop apps stay in step.

**Email:** to confirm an address, people email a code from the app to `JOIN_ADDRESS` (in `server/wrangler.jsonc`). That needs no mail service: in Cloudflare Email Routing for that domain, add a rule sending that address to the `bigglenet` Worker (`npx wrangler email routing rules create <domain> --match-type literal --match-field to --match-value <address> --action-type worker --action-value bigglenet`). Cloudflare checks the email really came from the sender's address before the Worker sees it. To email codes out instead, verify a sending domain with [Resend](https://resend.com), set `MAIL_FROM`, and in `server/` run `npx wrangler secret put RESEND_API_KEY`. With neither, nobody is asked to confirm an email and new accounts can only be made with Google.

**Google sign-in (optional):** in Google Cloud Console, make an OAuth client of type *Web application* with the redirect URI `https://<your server>/api/auth/google/callback`, then in `server/` run `npx wrangler secret put GOOGLE_CLIENT_ID` and `npx wrangler secret put GOOGLE_CLIENT_SECRET`. The "Continue with Google" button appears once both are set.

Admins approve new sites and hand out `.biggle` names for self-hosted sites from `biggle://admin` in the browser, or from the command line:

```bash
npm run name -w server -- set ethem https://ethem.pages.dev/ "Ethem's site" --remote
npm run promote -w server -- someone --remote
```

`home.biggle` (`sites/home`) and `hello.biggle` (`examples/hello`) are hosted on the Bigglenet itself, like sites made in the editor: no extra workers. Publish changes to them with `npm run deploy:home` or `npm run deploy:hello`, or upload any folder as a site:

```bash
npm run site -w server -- push <name> <folder> ["Title"] --owner <username> --remote
```

## Release

Bump the version in `desktop/src-tauri/tauri.conf.json` and push a matching tag. GitHub Actions builds the Mac, Windows and Linux apps, signs the updates and publishes them as a release. Installed apps check the latest release's `latest.json`, download the update in the background and offer a restart.

```bash
git tag v0.2.0 && git push origin v0.2.0
```

Updates are signed with a private key kept outside the repo, in `~/.tauri/bigglenet.key`, and as the `TAURI_SIGNING_PRIVATE_KEY` Actions secret. Back it up: without it, installed apps can't receive updates. Building locally needs it too:

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/bigglenet.key)" npm run app:build
```

The web app updates itself on every deploy and offers a reload.

## License

[MIT](LICENSE)
