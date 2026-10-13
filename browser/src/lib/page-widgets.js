// The Bigglenet's own tags for pages, and biggle.room(). Runs in every BHTML page right after
// page-runtime.js, in the same closure (loader.ts), so it can ask the browser things through
// __kit without the page being able to. Each tag draws itself in a shadow root, in the page's
// colours (it picks up --accent), and can be styled with ::part().
(() => {
  'use strict';
  const { call, post, init } = __kit;

  const BASE = `
:host{display:block;margin:20px 0;color:inherit;font:inherit}
*{box-sizing:border-box}
button{font:inherit;cursor:pointer}
h3{margin:0 0 .6em;font-size:1.15em}
.btn{padding:.5em 1.05em;border:0;border-radius:999px;background:var(--accent,#2563eb);color:#fff;font-weight:700}
.ghost{padding:.4em .9em;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:999px;background:none;color:inherit}
.muted{opacity:.7}
.error{margin:.5em 0 0;color:#d93025;font-size:.9em}
.card{padding:12px 14px;border-radius:14px;background:color-mix(in srgb,currentColor 5%,transparent);border:1px solid color-mix(in srgb,currentColor 12%,transparent)}
`;

  /** A tag that draws itself, once, when it's added to the page. */
  function tag(name, css, setup) {
    customElements.define(
      name,
      class extends HTMLElement {
        connectedCallback() {
          if (this.shadowRoot) return;
          const root = this.attachShadow({ mode: 'open' });
          const style = document.createElement('style');
          style.textContent = BASE + css;
          root.append(style);
          const showError = (e) => {
            let p = root.querySelector('.error');
            if (!p) {
              p = document.createElement('p');
              p.className = 'error';
              p.setAttribute('role', 'alert');
              root.append(p);
            }
            p.textContent = (e && e.message) || String(e);
          };
          setup(this, root, showError);
        }
      },
    );
  }

  const el = (name, props = {}, ...children) => {
    const node = document.createElement(name);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'part' || k.startsWith('aria-') || k === 'role') node.setAttribute(k, v);
      else if (k === 'class') node.className = v;
      else node[k] = v;
    }
    node.append(...children.filter((c) => c != null));
    return node;
  };
  const date = (at) => {
    const d = new Date(at * 1000);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  };

  // --- Rooms: biggle.room('lobby') ---

  __kit.room = async (name) => {
    const r = await call('room.join', name);
    const handlers = { message: new Set(), join: new Set(), leave: new Set() };
    let members = r.members;
    __kit.onPush((msg) => {
      if (msg.id !== r.id) return;
      const e = msg.event;
      if (e.type === 'join') members = members.includes(e.user) ? members : [...members, e.user];
      if (e.type === 'leave') members = members.filter((m) => m !== e.user);
      for (const fn of handlers[e.type] || []) {
        try {
          fn(e.type === 'message' ? { from: e.from, data: e.data } : e.user);
        } catch (err) {
          console.error(err);
        }
      }
    });
    return Object.freeze({
      /** Who's in the room (usernames), you included. */
      get members() {
        return [...members];
      },
      me: r.you,
      /** Send anything that fits in JSON to everyone else in the room. */
      send(data) {
        post({ type: 'room-send', id: r.id, data });
      },
      /** on('message', ({ from, data }) => …), on('join', (user) => …), on('leave', …). Returns a function that stops it. */
      on(type, fn) {
        handlers[type]?.add(fn);
        return () => handlers[type]?.delete(fn);
      },
      leave() {
        return call('room.leave', r.id);
      },
    });
  };

  // --- <biggle-comments>: comments on this page ---

  tag(
    'biggle-comments',
    `.head{display:flex;align-items:center;gap:12px;margin-bottom:12px}h3{flex:1;margin:0}
ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}.meta{display:flex;gap:8px;align-items:baseline;font-size:.85em;margin-bottom:3px}
.author{font-weight:700}.date{opacity:.6}.remove{margin-left:auto;border:0;background:none;color:inherit;opacity:.5;font-size:1.1em}
.body{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.empty{margin:0}.more{margin-top:10px}`,
    (host, root, showError) => {
      const title = el('span', { textContent: host.getAttribute('heading') || 'Comments' });
      const count = el('span', { class: 'muted' });
      const add = el('button', { class: 'btn', part: 'button', textContent: 'Add a comment' });
      const list = el('ol', { part: 'list' });
      const empty = el('p', { class: 'empty muted', textContent: 'No comments yet.' });
      const more = el('button', { class: 'ghost more', textContent: 'Show older comments', hidden: true });
      root.append(el('div', { class: 'head' }, el('h3', { part: 'title' }, title, ' ', count), add), list, empty, more);
      let total = 0;
      let oldest = null;
      const update = () => {
        count.textContent = total ? `· ${total}` : '';
        empty.hidden = list.children.length > 0;
      };
      const item = (c) => {
        const li = el('li', { class: 'card', part: 'comment' });
        const meta = el('div', { class: 'meta' }, el('span', { class: 'author', part: 'author', textContent: c.author }), el('time', { class: 'date', part: 'date', textContent: date(c.at) }));
        if (c.canDelete) {
          const x = el('button', { class: 'remove', textContent: '×', title: 'Take this comment down', 'aria-label': 'Take this comment down' });
          x.onclick = () => call('comments.delete', c.id).then(() => (li.remove(), total--, update()), showError);
          meta.append(x);
        }
        li.append(meta, el('p', { class: 'body', part: 'body', textContent: c.body }));
        return li;
      };
      const load = () =>
        call('comments.list', oldest).then((r) => {
          for (const c of r.comments) list.append(item(c));
          if (r.comments.length) oldest = r.comments[r.comments.length - 1].id;
          total = r.total;
          more.hidden = !r.more;
          update();
        }, showError);
      add.onclick = () =>
        call('comments.add').then((c) => {
          if (!c) return;
          list.prepend(item(c));
          total++;
          update();
        }, showError);
      more.onclick = load;
      load();
    },
  );

  // --- <biggle-poll id="…" question="…" options="Red|Green|Blue"> ---

  tag(
    'biggle-poll',
    `.q{margin:0 0 10px;font-weight:700;font-size:1.1em}.opts{display:grid;gap:8px}
.opt{position:relative;display:flex;justify-content:space-between;gap:10px;width:100%;padding:10px 14px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;background:none;color:inherit;text-align:left;overflow:hidden}
.opt .bar{position:absolute;inset:0 auto 0 0;background:color-mix(in srgb,var(--accent,#2563eb) 22%,transparent);transition:width .3s}
.opt span{position:relative}.opt.mine{border-color:var(--accent,#2563eb);font-weight:700}.total{margin:8px 0 0;font-size:.85em}`,
    (host, root, showError) => {
      const id = host.id || host.getAttribute('poll') || '';
      const question = host.getAttribute('question') || '';
      const options = (host.getAttribute('options') || [...host.querySelectorAll('option')].map((o) => o.textContent).join('|'))
        .split('|')
        .map((o) => o.trim())
        .filter(Boolean)
        .slice(0, 12);
      if (!id || options.length < 2) return showError('A poll needs an id and at least two options.');
      const box = el('div', { class: 'card', part: 'poll' });
      if (question) box.append(el('p', { class: 'q', part: 'question', textContent: question }));
      const opts = el('div', { class: 'opts' });
      const total = el('p', { class: 'total muted' });
      box.append(opts, total);
      root.append(box);
      const draw = (state) => {
        const counts = options.map((_, i) => state.counts[i] || 0);
        const sum = counts.reduce((a, b) => a + b, 0);
        const voted = state.mine !== null && state.mine !== undefined;
        opts.replaceChildren(
          ...options.map((label, i) => {
            const pct = sum ? Math.round((counts[i] / sum) * 100) : 0;
            const b = el('button', { class: 'opt' + (state.mine === i ? ' mine' : ''), part: 'option' });
            if (voted) b.append(el('span', { class: 'bar', style: `width:${pct}%` }));
            b.append(el('span', { textContent: label }));
            if (voted) b.append(el('span', { textContent: `${pct}%` }));
            b.onclick = () => call('poll.vote', id, i, options.length).then(draw, showError);
            return b;
          }),
        );
        total.textContent = voted ? `${sum} ${sum === 1 ? 'vote' : 'votes'} · tap another answer to change yours` : 'Tap an answer to vote and see the results.';
      };
      call('poll.get', id).then(draw, showError);
    },
  );

  // --- <biggle-like>: a heart and how many people like the site ---

  tag(
    'biggle-like',
    `:host{display:inline-block;margin:0}
.like{display:inline-flex;align-items:center;gap:.4em;padding:.45em .95em;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:999px;background:none;color:inherit;font-weight:700}
.like.on{border-color:transparent;background:color-mix(in srgb,#e64998 18%,transparent);color:#d6336c}.heart{font-size:1.15em}`,
    (host, root, showError) => {
      const b = el('button', { class: 'like', part: 'button' });
      root.append(b);
      let state = { count: 0, liked: false };
      const draw = () => {
        b.classList.toggle('on', state.liked);
        b.replaceChildren(el('span', { class: 'heart', textContent: state.liked ? '♥' : '♡' }), ` ${state.count.toLocaleString()}`);
        b.setAttribute('aria-pressed', String(state.liked));
        b.title = state.liked ? 'You like this site' : 'Like this site';
      };
      b.onclick = () => call('likes.set', !state.liked).then((s) => ((state = s), draw()), showError);
      call('likes.get').then((s) => ((state = s), draw()), showError);
      draw();
    },
  );

  // --- <biggle-leaderboard board="…" order="desc|asc" limit="10"> ---

  tag(
    'biggle-leaderboard',
    `table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;text-align:left;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}
th{font-size:.8em;opacity:.7;text-transform:uppercase;letter-spacing:.04em}.rank{width:3em;opacity:.7}.score{text-align:right;font-variant-numeric:tabular-nums}
tr.me td{font-weight:700;color:var(--accent,#2563eb)}.mine{margin:8px 0 0;font-size:.9em}`,
    (host, root, showError) => {
      const board = host.getAttribute('board') || 'main';
      const order = host.getAttribute('order') === 'asc' ? 'asc' : 'desc';
      const limit = Math.min(100, Number(host.getAttribute('limit')) || 10);
      const title = el('h3', { part: 'title', textContent: host.getAttribute('heading') || 'Leaderboard' });
      const table = el('table', { part: 'table' });
      const mine = el('p', { class: 'mine muted' });
      root.append(el('div', { class: 'card' }, title, table, mine));
      const me = () => __kit.user()?.username;
      const load = () =>
        call('scores.top', board, { order, limit }).then((r) => {
          table.replaceChildren(
            el('tr', {}, el('th', { textContent: '#' }), el('th', { textContent: 'Player' }), el('th', { class: 'score', textContent: 'Score' })),
            ...r.top.map((row, i) =>
              el('tr', { class: row.username === me() ? 'me' : '' }, el('td', { class: 'rank', textContent: i + 1 }), el('td', { textContent: row.username }), el('td', { class: 'score', textContent: Number(row.score).toLocaleString() })),
            ),
          );
          if (!r.top.length) table.append(el('tr', {}, el('td', { colSpan: 3, class: 'muted', textContent: 'No scores yet. Be the first!' })));
          mine.textContent = r.mine !== null ? `Your best: ${Number(r.mine).toLocaleString()} (#${r.rank})` : '';
        }, showError);
      load();
      addEventListener('biggle:scores', (e) => e.detail?.board === board && load());
      setInterval(load, 30_000);
    },
  );
  // --- <biggle-wall id="…" height="400">: a drawing everyone adds to, live ---

  tag(
    'biggle-wall',
    `.tools{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px}
.dot{width:26px;height:26px;border:2px solid transparent;border-radius:50%;box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 25%,transparent)}.dot.on{border-color:currentColor}
.size{min-width:32px;height:28px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:8px;background:none;color:inherit}.size.on{background:color-mix(in srgb,currentColor 12%,transparent)}
.spacer{flex:1}canvas{display:block;width:100%;border-radius:14px;background:#fff;touch-action:none;cursor:crosshair;box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 15%,transparent)}
.people{font-size:.85em}`,
    (host, root, showError) => {
      const id = host.id || 'main';
      const height = Math.min(1200, Math.max(150, Number(host.getAttribute('height')) || 400));
      const colors = ['#222222', '#e5484d', '#f59f00', '#2f9e44', '#1c7ed6', '#9c36b5', '#ffffff'];
      let color = colors[0];
      let width = 4;
      const canvas = el('canvas', { part: 'canvas', 'aria-label': 'Drawing wall' });
      canvas.style.height = `${height}px`;
      const tools = el('div', { class: 'tools' });
      const people = el('span', { class: 'people muted' });
      const clear = el('button', { class: 'ghost', textContent: 'Clear', hidden: true });
      for (const c of colors) {
        const b = el('button', { class: 'dot' + (c === color ? ' on' : ''), 'aria-label': c, style: `background:${c}` });
        b.onclick = () => {
          color = c;
          for (const d of tools.querySelectorAll('.dot')) d.classList.toggle('on', d === b);
        };
        tools.append(b);
      }
      for (const [w, label] of [[2, 'S'], [4, 'M'], [10, 'L']]) {
        const b = el('button', { class: 'size' + (w === width ? ' on' : ''), textContent: label });
        b.onclick = () => {
          width = w;
          for (const d of tools.querySelectorAll('.size')) d.classList.toggle('on', d === b);
        };
        tools.append(b);
      }
      tools.append(el('span', { class: 'spacer' }), people, clear);
      root.append(tools, canvas);

      const drawn = new Set();
      let strokes = [];
      const g = canvas.getContext('2d');
      const size = () => {
        const r = canvas.getBoundingClientRect();
        const dpr = devicePixelRatio || 1;
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        redraw();
      };
      const line = (s) => {
        if (!s.points.length) return;
        const sx = canvas.width / 1000;
        const sy = canvas.height / 1000;
        g.strokeStyle = s.color;
        g.lineWidth = s.width * (canvas.width / 800);
        g.lineCap = g.lineJoin = 'round';
        g.beginPath();
        s.points.forEach(([x, y], i) => (i ? g.lineTo(x * sx, y * sy) : g.moveTo(x * sx, y * sy)));
        if (s.points.length === 1) g.lineTo(s.points[0][0] * sx + 0.1, s.points[0][1] * sy);
        g.stroke();
      };
      const redraw = () => {
        g.clearRect(0, 0, canvas.width, canvas.height);
        strokes.forEach(line);
      };
      const add = (s) => {
        if (s.id && drawn.has(s.id)) return;
        if (s.id) drawn.add(s.id);
        strokes.push(s);
        line(s);
      };
      new ResizeObserver(size).observe(canvas);

      // Drawing.
      let current = null;
      const point = (e) => {
        const r = canvas.getBoundingClientRect();
        return [Math.round(((e.clientX - r.left) / r.width) * 10000) / 10, Math.round(((e.clientY - r.top) / r.height) * 10000) / 10];
      };
      canvas.onpointerdown = (e) => {
        canvas.setPointerCapture(e.pointerId);
        current = { color, width, points: [point(e)] };
        line(current);
      };
      canvas.onpointermove = (e) => {
        if (!current || current.points.length >= 600) return;
        const p = point(e);
        const last = current.points[current.points.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return;
        current.points.push(p);
        line({ ...current, points: current.points.slice(-2) });
      };
      canvas.onpointerup = () => {
        const s = current;
        current = null;
        if (!s) return;
        strokes.push(s);
        call('wall.add', id, s).then((r) => r.stroke && drawn.add(r.stroke.id), showError);
      };
      clear.onclick = () => call('wall.clear', id).catch(showError);

      call('wall.get', id).then((r) => {
        strokes = [];
        r.strokes.forEach(add);
        clear.hidden = !r.canClear;
      }, showError);
      // Everyone else's strokes, live.
      __kit
        .room(`wall-${id}`)
        .then((room) => {
          const who = () => (people.textContent = room.members.length > 1 ? `${room.members.length} drawing here` : '');
          who();
          room.on('join', who);
          room.on('leave', who);
          room.on('message', ({ data }) => {
            if (data?.wall === 'stroke' && data.stroke) add(data.stroke);
            else if (data?.wall === 'clear') {
              strokes = [];
              drawn.clear();
              redraw();
            }
          });
        })
        .catch(() => {});
    },
  );

  // --- <biggle-contact>: a button to message whoever made the site ---

  tag('biggle-contact', `.done{margin:.6em 0 0}`, (host, root, showError) => {
    const b = el('button', { class: 'btn', part: 'button', textContent: host.getAttribute('label') || 'Message the owner' });
    const done = el('p', { class: 'done muted', hidden: true, textContent: 'Sent! Thanks.' });
    b.onclick = () =>
      call('contact').then((r) => {
        if (r) done.hidden = false;
      }, showError);
    root.append(b, done);
  });

  // --- <biggle-embed src="biggle://other.biggle/page" height="360">: another page, inside this one ---

  tag('biggle-embed', `iframe{display:block;width:100%;border:0;border-radius:14px;background:#fff;box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 15%,transparent)}`, (host, root, showError) => {
    const src = host.getAttribute('src') || '';
    const frame = el('iframe', { part: 'frame', title: host.getAttribute('title') || src });
    frame.setAttribute('sandbox', 'allow-scripts allow-forms');
    frame.style.height = `${Math.min(2000, Math.max(80, Number(host.getAttribute('height')) || 360))}px`;
    root.append(frame);
    call('embed', src).then((srcdoc) => (frame.srcdoc = srcdoc), showError);
    // Links in it open in the browser, like this page's own; it can't ask the browser anything.
    addEventListener('message', (e) => {
      if (e.source !== frame.contentWindow || !e.data || e.data.biggle !== 1) return;
      const m = e.data;
      if (m.type === 'navigate' || m.type === 'external') post({ type: m.type, url: m.url, newTab: true });
      else if (m.type === 'call') frame.contentWindow.postMessage({ biggle: 1, type: 'result', id: m.id, error: 'Embedded pages can’t do that.' }, '*');
    });
  });

  // --- <biggle-online>: how many people are on the Bigglenet right now ---

  tag('biggle-online', `:host{display:inline;margin:0}`, (host, root) => {
    const n = el('span', { part: 'count', textContent: '…' });
    root.append(n);
    const load = () => call('online').then((r) => (n.textContent = Number(r.online).toLocaleString()), () => {});
    load();
    setInterval(load, 60_000);
  });

  // --- <biggle-new-sites limit="5">: the newest sites on the Bigglenet ---

  tag(
    'biggle-new-sites',
    `ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}a{display:flex;flex-direction:column;padding:10px 12px;border-radius:12px;color:inherit;text-decoration:none;background:color-mix(in srgb,currentColor 5%,transparent)}
a:hover{background:color-mix(in srgb,currentColor 10%,transparent)}.name{font-weight:700}.title{font-size:.88em;opacity:.7}`,
    (host, root, showError) => {
      const list = el('ul', { part: 'list' });
      root.append(list);
      call('newSites', Number(host.getAttribute('limit')) || 5).then((sites) => {
        list.replaceChildren(
          ...sites.map((s) =>
            el('li', {}, el('a', { href: `biggle://${s.address}/`, part: 'site' }, el('span', { class: 'name', textContent: s.address }), s.title ? el('span', { class: 'title', textContent: s.title }) : null)),
          ),
        );
      }, showError);
    },
  );

  // --- <biggle-status user="ethem">: someone's status ("📚 Revising") ---

  tag('biggle-status', `:host{display:inline;margin:0}`, (host, root) => {
    const span = el('span', { part: 'status' });
    root.append(span);
    const user = host.getAttribute('user') || '';
    call('status', user).then((r) => {
      const s = r.status;
      span.textContent = s && (!s.until || s.until > Date.now()) ? `${s.emoji || ''} ${s.text || ''}`.trim() : '';
    }, () => {});
  });

  // --- <biggle-webring ring="3">: this site's place in a webring (previous, next, random) ---

  tag(
    'biggle-webring',
    `.ring{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 18px;text-align:center}
.name{font-weight:700}a{color:inherit;font-weight:600}`,
    (host, root, showError) => {
      const id = Number(host.getAttribute('ring'));
      if (!id) return showError('Say which webring: <biggle-webring ring="3">.');
      const box = el('nav', { class: 'card ring', part: 'ring', 'aria-label': 'Webring' });
      root.append(box);
      call('webring', id).then((r) => {
        const link = (s, text) => (s ? el('a', { href: `biggle://${s.address}/`, part: 'link', textContent: text, title: s.title || s.address }) : null);
        if (!r.member) {
          box.append(el('span', { class: 'muted', textContent: `This site isn't in the ${r.ring.name} webring yet.` }));
          return;
        }
        box.append(
          ...[link(r.prev, '← Previous'), el('span', { class: 'name', part: 'name', textContent: r.ring.name }), link(r.random, 'Random'), link(r.next, 'Next →')].filter(Boolean),
        );
      }, showError);
    },
  );

  // An embedded page (inside a <biggle-embed>) doesn't run as its own page.
  if (init.embedded) document.documentElement.dataset.embedded = '';
})();
