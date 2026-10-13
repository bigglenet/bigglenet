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
| `<biggle-visits></biggle-visits>` | How many visits the site has had (each person counts once a day). `kind="visitors"` counts different people, `kind="today"` and `kind="week"` the last day and 7 days |
| `<biggle-guestbook></biggle-guestbook>` | A guestbook: visitors leave notes, newest first. Signing opens a box in the browser itself, so a page can't sign it for anyone. The note's writer, the site's owner and admins can take a note down. `heading="…"` changes its title. It uses the page's `--accent` colour, and its parts can be styled with `::part(note)`, `::part(author)`, `::part(date)`, `::part(body)`, `::part(button)` and `::part(title)` |

| `<biggle-comments></biggle-comments>` | Comments on this page (each page of a site has its own). Like the guestbook, writing one opens the browser's own box. `heading="…"` changes its title. Parts: `comment`, `author`, `date`, `body`, `button`, `title`, `list` |
| `<biggle-poll id="colour" question="Best colour?" options="Red\|Green\|Blue"></biggle-poll>` | A poll. Everyone gets one vote, and can change it; results show after voting. `id` keeps polls apart (up to 12 options, split by `\|`, or as `<option>`s inside it) |
| `<biggle-like></biggle-like>` | A heart and how many people like the site |
| `<biggle-leaderboard board="main" order="desc" limit="10"></biggle-leaderboard>` | High scores sent with `biggle.scores.submit()`. `order="asc"` for boards where lower is better (fastest times). It updates when the page submits a score |
| `<biggle-wall id="main" height="400"></biggle-wall>` | A wall anyone signed in can draw on, live: everyone sees each line as it's drawn. The site's owner can clear it |
| `<biggle-contact label="Say hi"></biggle-contact>` | A button to message whoever made the site. It arrives in a chat if you're friends, otherwise in their notifications |
| `<biggle-embed src="biggle://other.biggle/" height="360"></biggle-embed>` | Another Biggle page inside this one. It runs on its own and can't ask the browser for anything; its links open in the browser |
| `<biggle-online></biggle-online>` | How many people are on the Bigglenet right now |
| `<biggle-new-sites limit="5"></biggle-new-sites>` | The newest sites on the Bigglenet, as links |
| `<biggle-status user="ethem"></biggle-status>` | Someone's status, like 📚 Revising |

Each tag draws itself in the page's colours (it uses `--accent`) and can be styled with `::part()`. Anything that writes as the visitor, like a comment, a vote or a like, needs them to click: a page can't do it by itself.

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
await biggle.idToken()   // proof of who's signed in, for your own server (see below), or null
await biggle.visits()    // { visits: 120, visitors: 31, today: 4, week: 22 } for this site
await biggle.online()    // 42: how many people are on the Bigglenet right now

// High scores, per board. submit() keeps each person's best; call it after a game.
await biggle.scores.submit("main", 1200)  // { top: [{ username, score, at }, …], mine: 1200, rank: 3 }
await biggle.scores.submit("speedrun", 41.2, { order: "asc" }) // lower is better
await biggle.scores.top("main", { limit: 10 })     // the same, without submitting

// An achievement, shown on the visitor's profile. Each key counts once per person.
await biggle.achieve("first-win", "First win!", "Won a game") // { new: true }

// Per-site storage, saved by the browser.
await biggle.storage.set("visits", 3)  // any JSON value
await biggle.storage.get("visits")     // 3, or undefined
await biggle.storage.remove("visits")
await biggle.storage.keys()            // ["visits"]
await biggle.storage.clear()
```

Use `biggle.url` instead of `location`. Inside Biggle, `location` doesn't contain the page address.

Storage is limited to 1 MB per site. `localStorage` works too (kept per site by the browser, also 1 MB), and `sessionStorage` and cookies last for the visit.

**Knowing who's signed in, on your server.** `biggle.me()` is fine for showing a name, but your server can't trust what the page says. Send it `await biggle.idToken()` instead (for example as `Authorization: Biggle <token>`), and have the server ask the Bigglenet:

```
GET https://bigglenet.ethembeldagli.dev/api/identity/verify?site=<your site name>&token=<token>
→ 200 { "username": "ethem", "site": "<your site name>" }   or 401 if it isn't valid
```

Tokens last an hour and only work for the site they were made for.

Events:

```js
addEventListener("biggle:user", (e) => console.log(e.detail)) // sign-in or sign-out
```

### Rooms: live multiplayer

Everyone on a site can meet in a room: for multiplayer games, chat rooms, or anything live. The browser holds the connection, so pages never see the visitor's sign-in.

```js
const room = await biggle.room("lobby")   // join (signed-in visitors only)
room.me                                    // "ethem"
room.members                               // ["ethem", "sam"], you included
room.send({ x: 10, y: 20 })                // to everyone else in the room (anything JSON, up to 16 KB)
room.on("message", ({ from, data }) => …)  // from someone else
room.on("join", (user) => …)
room.on("leave", (user) => …)
await room.leave()
```

A room holds up to 50 people, and each can send up to 30 messages a second. Leaving the page leaves its rooms.

## No ads, no tracking

Pages run in a sandbox. The browser enforces:

- No real cookies or IndexedDB. `localStorage`, `sessionStorage` and cookies are stand-ins kept by Biggle (see above).
- Scripts, styles, images, fonts, media and `fetch()` can only load from Biggle sites, plus `data:` and `blob:` URLs. Third-party scripts, ad networks, analytics and CDNs are blocked.
- No pop-ups and no embedded iframes.

If you need a library, put a copy of it in your site's files.

## Hosting a site

The easiest way is the site editor built into Biggle (`biggle://sites`): it hosts your files on the Bigglenet and gives you a name. New sites wait for an admin's approval before anyone else can see them.

To host a site yourself, upload your files to any static host. On Cloudflare Pages, add a `_headers` file so normal browsers show the source instead of rendering it:

```
/*.bhtml
  Content-Type: text/bhtml; charset=utf-8
```

Then ask an admin to point `yourname.biggle` at the site's URL (for example `https://yourname.pages.dev/`).

The Biggle server fetches your files through `https://bigglenet.ethembeldagli.dev/site/<name>/<path>`, so visitors never connect to your host directly.
