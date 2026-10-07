// home.biggle: live site directory, the typing address bar, visit count and copy buttons.
const $ = (id) => document.getElementById(id);
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function countVisit() {
  const el = $('visits');
  if (!el) return;
  const visits = ((await biggle.storage.get('visits')) ?? 0) + 1;
  await biggle.storage.set('visits', visits);
  el.textContent = visits === 1 ? 'This is your first visit.' : `You've been here ${visits} times.`;
}

function renderSites(sites) {
  const list = $('site-list');
  const count = $('site-count');
  if (count) count.textContent = sites.length;
  if (!list) return;
  list.replaceChildren(
    ...sites.map((site) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `biggle://${site.name}.biggle/`;
      const tile = document.createElement('span');
      tile.className = 'tile';
      tile.textContent = site.name[0].toUpperCase();
      const text = document.createElement('span');
      text.className = 'site-text';
      const name = document.createElement('strong');
      name.textContent = `${site.name}.biggle`;
      text.append(name);
      if (site.title) {
        const title = document.createElement('span');
        title.textContent = site.title;
        text.append(title);
      }
      a.append(tile, text);
      li.append(a);
      return li;
    }),
  );
}

// Types out real addresses, one after another.
function typeAddresses(names) {
  const el = $('typed');
  if (!el || calm || names.length < 2) return;
  const addresses = names.map((n) => `biggle://${n}.biggle`);
  let i = 0;
  let shown = addresses[0];
  const prefix = 'biggle://';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    for (;;) {
      await wait(2200);
      while (shown.length > prefix.length) {
        shown = shown.slice(0, -1);
        el.textContent = shown;
        await wait(35);
      }
      i = (i + 1) % addresses.length;
      const next = addresses[i];
      while (shown.length < next.length) {
        shown = next.slice(0, shown.length + 1);
        el.textContent = shown;
        await wait(70);
      }
    }
  })();
}

async function loadSites() {
  if (typeof biggle.sites !== 'function') {
    const list = $('site-list');
    if (list) list.innerHTML = '<li class="loading">Update your Biggle browser to see every site here.</li>';
    return;
  }
  try {
    const sites = await biggle.sites();
    renderSites(sites);
    typeAddresses(['home', ...sites.map((s) => s.name).filter((n) => n !== 'home')]);
  } catch {
    const list = $('site-list');
    if (list) list.innerHTML = '<li class="loading">The directory is taking a nap. Try again in a bit.</li>';
  }
}

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const block = $(button.dataset.copy);
    let copied = false;
    try {
      if (typeof biggle.copy !== 'function') throw new Error('old browser');
      await biggle.copy(block.textContent);
      copied = true;
    } catch {
      // Sandboxed pages often can't use the clipboard API. Fall back to copying the selection.
      getSelection().selectAllChildren(block);
      copied = document.execCommand('copy');
      if (copied) getSelection().removeAllRanges();
    }
    button.textContent = copied ? 'Copied' : /Mac/.test(navigator.platform) ? 'Press ⌘C' : 'Press Ctrl+C';
    setTimeout(() => (button.textContent = 'Copy'), 1600);
  });
}

countVisit();
loadSites();
