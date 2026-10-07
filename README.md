<p align="center"><img src="brand/wordmark.png" alt="b.net" height="96"></p>

# Bigglenet

A small, friendly alternative to the web. Sites are written in **BHTML**, live at **`name.biggle`** addresses, and open in the **Biggle browser**, which blocks ads and trackers by design.

- **BHTML pages:** normal HTML, CSS and JS with a `<!bhtml 1>` header, so they only open in Biggle.
- **`.biggle` names:** host your files anywhere and the Bigglenet points your name at them.
- **One Biggle ID:** sign in once and every site can greet you by name.
- **Friends and chat:** add friends and message them live, right in the browser.
- **No ads, no tracking:** pages run sandboxed, with no cookies, and can't load anything from outside the Bigglenet.

## Get the browser

- **Mac, Windows, Linux:** download it from [Releases](https://github.com/bigglenet/bigglenet/releases/latest).
- **Phone:** open [bigglenet.ethembeldagli.dev](https://bigglenet.ethembeldagli.dev) and add it to your home screen.

Anyone can join: make a Biggle ID from the **Sign in** button. Then open **home.biggle** to look around.

## Make a site

```html
<!bhtml 1>
<title>My site</title>
<h1>Hello, <biggle-me>guest</biggle-me>!</h1>
<a href="about.bhtml">About me</a>
```

Save it as `index.bhtml`, upload the folder to any static host (Cloudflare Pages, GitHub Pages…) and ask an admin to point your `.biggle` name at it. [spec/BHTML.md](spec/BHTML.md) has everything else, and [examples/hello](examples/hello) is a complete site.

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

The browser renders each page in a sandboxed iframe with a strict Content-Security-Policy. It fetches site files through the server's gateway (`/site/<name>/<path>`), which looks up where the name points and fetches the file from that host.

## Develop

```bash
npm install
npm run setup     # local database, with hello.biggle pointing at the example site
npm run dev       # example site :8080, server :8787, browser :5173
```

Chrome-based browsers stop sandboxed pages from reaching `localhost`, so locally a page's own CSS, images and scripts don't load there. To test pages, run the browser against the live server instead:

```bash
npm run dev:live
```

Desktop app:

```bash
npm run app:dev     # live-reloading app
npm run app:build   # build it for this computer
```

## Run your own Bigglenet

```bash
npm run deploy                                # build the PWA and deploy the Worker
npm run db:migrate:remote -w server           # set up the database
npm run promote -w server -- you --remote     # after signing up, make yourself an admin
```

Admins hand out `.biggle` names from `biggle://admin` in the browser, or from the command line:

```bash
npm run name -w server -- set ethem https://ethem.pages.dev/ "Ethem's site" --remote
npm run promote -w server -- someone --remote
```

The two Bigglenet sites are static folders. Publish changes with `npm run deploy:home` or `npm run deploy:hello`.

## Release

Bump the version in `desktop/src-tauri/tauri.conf.json` and push a matching tag. GitHub Actions builds the Mac, Windows and Linux apps and publishes them as a release.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## License

[MIT](LICENSE)
