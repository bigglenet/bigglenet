# BHTML 1

BHTML is the page format of the Bigglenet. It is normal HTML, CSS and JavaScript with a few rules that make it a Biggle-only format.

## The header

Every `.bhtml` file must start with this line:

```
<!bhtml 1>
```

Whitespace and a UTF-8 byte-order mark before it are allowed. The Biggle browser refuses to render any file without the header, so a normal `.html` page will not open in Biggle either. Don't add `<!DOCTYPE html>`; the browser always renders BHTML in standards mode.

```html
<!bhtml 1>
<title>My site</title>
<h1>Hello, Bigglenet</h1>
<a href="about.bhtml">About me</a>
```

## Addresses

```
biggle://<name>.biggle/<path>?<query>#<fragment>
```

- `<name>` is 1–63 characters of `a-z`, `0-9` and `-`, and can't start or end with `-`.
- A path ending in `/` loads `index.bhtml` in that folder.
- Names are handed out by the Bigglenet admin. Each name points at a normal `https://` folder where the site's files live (bring your own host).

Relative links (`about.bhtml`, `../img/cat.png`, `?page=2`) work like on the normal web. Links to other Biggle sites use the full `biggle://` address.

| Link | What Biggle does |
|---|---|
| `about.bhtml`, `/blog/` | Opens it in the same tab |
| `biggle://friend.biggle/` | Opens another Biggle site |
| `#section` | Scrolls to the element with that `id` |
| `https://...`, `mailto:...` | Asks before opening it in your normal browser |
| `target="_blank"` or Cmd-click | Opens in a new Biggle tab |

GET forms navigate like links, with the form fields as the query string. POST forms aren't supported, since sites are static files.

## Biggle tags

These only do something in Biggle. In a normal browser they show their fallback content (whatever is inside them).

| Tag | Does |
|---|---|
| `<biggle-me>guest</biggle-me>` | Replaced with the visitor's Biggle username, or `guest` |
| `<biggle-signed-in>…</biggle-signed-in>` | Content shown only to signed-in visitors |
| `<biggle-signed-out>…</biggle-signed-out>` | Content shown only to signed-out visitors |

## The `biggle` JavaScript API

Available as `window.biggle` before any of the page's own scripts run.

```js
biggle.url               // "biggle://hello.biggle/about.bhtml?x=1"
biggle.site              // "hello"
biggle.params.get("x")   // "1" (a URLSearchParams of the query)
await biggle.me()        // { username: "ethem" } or null
await biggle.sites()     // [{ name: "hello", title: "Hello, Bigglenet" }, …] every .biggle site
biggle.go("other.bhtml") // navigate (relative, biggle:// or https://)
await biggle.copy("text") // copy to the clipboard (call it from a click)

// Per-site storage, saved by the browser. Pages get no cookies or localStorage.
await biggle.storage.set("visits", 3)  // any JSON value
await biggle.storage.get("visits")     // 3, or undefined
await biggle.storage.remove("visits")
await biggle.storage.keys()            // ["visits"]
await biggle.storage.clear()
```

Use `biggle.url` instead of `location`. Inside Biggle, `location` doesn't contain the page address.

Storage is limited to 1 MB per site.

Events:

```js
addEventListener("biggle:user", (e) => console.log(e.detail)) // sign-in or sign-out
```

## No ads, no tracking

Pages run in a sandbox. The browser enforces:

- No cookies, `localStorage`, `sessionStorage` or IndexedDB. Use `biggle.storage`.
- Scripts, styles, images, fonts, media and `fetch()` can only load from Biggle sites, plus `data:` and `blob:` URLs. Third-party scripts, ad networks, analytics and CDNs are blocked.
- No pop-ups and no embedded iframes.

If you need a library, put a copy of it in your site's files.

## Hosting a site

Upload your files to any static host. On Cloudflare Pages, add a `_headers` file so normal browsers show the source instead of rendering it:

```
/*.bhtml
  Content-Type: text/bhtml; charset=utf-8
```

Then ask an admin to point `yourname.biggle` at the site's URL (for example `https://yourname.pages.dev/`).

The Biggle server fetches your files through `https://bigglenet.ethembeldagli.dev/site/<name>/<path>`, so visitors never connect to your host directly.
