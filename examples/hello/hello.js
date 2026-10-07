// hello.biggle: little demos of what Biggle pages can do.
const $ = (id) => document.getElementById(id);
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mood: a colour remembered per visitor.
async function mood() {
  const apply = (m) => {
    document.documentElement.dataset.mood = m;
    document.querySelectorAll('[data-mood]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mood === m)));
  };
  apply((await biggle.storage.get('mood')) ?? 'sunny');
  document.querySelectorAll('.moods [data-mood]').forEach((b) =>
    b.addEventListener('click', () => {
      apply(b.dataset.mood);
      biggle.storage.set('mood', b.dataset.mood);
    }),
  );
}

async function whoIsHere() {
  if (!$('who-name')) return;
  const me = await biggle.me();
  $('avatar').textContent = me ? me.username[0].toUpperCase() : '?';
  $('who-name').textContent = me ? me.username : 'A mystery guest';
  $('who-note').textContent = me ? "That's you! Biggle told this page your name." : 'Sign in to Biggle and this page will know your name.';
}

function countUp(el, to) {
  if (calm) return void (el.textContent = to);
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 700);
    el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function visits() {
  if (!$('visits')) return;
  const n = ((await biggle.storage.get('visits')) ?? 0) + 1;
  await biggle.storage.set('visits', n);
  countUp($('visits'), n);
  $('reset').addEventListener('click', async () => {
    await biggle.storage.remove('visits');
    $('visits').textContent = 0;
  });
}

async function teleport() {
  const button = $('teleport');
  if (!button) return;
  let sites = [];
  try {
    sites = (await biggle.sites()).filter((s) => s.name !== biggle.site);
    $('site-count').textContent = `${sites.length + 1} sites on the Bigglenet right now.`;
  } catch {}
  button.addEventListener('click', () => {
    if (!sites.length) return void (button.textContent = 'Nowhere to go yet!');
    const pick = sites[Math.floor(Math.random() * sites.length)];
    button.textContent = `🚀 Off to ${pick.name}.biggle…`;
    setTimeout(() => biggle.go(`biggle://${pick.name}.biggle/`), calm ? 0 : 500);
  });
}

function share() {
  const button = $('copy');
  if (!button) return;
  button.addEventListener('click', async () => {
    try {
      await biggle.copy(`${$('quote').textContent} Come to hello.biggle on the Bigglenet.`);
      button.textContent = 'Copied! 💌';
    } catch {
      button.textContent = "Couldn't copy";
    }
    setTimeout(() => (button.textContent = 'Copy it'), 1600);
  });
}

// about.bhtml: echo back what was sent with the form.
function said() {
  const q = biggle.params.get('q');
  if (q && $('said')) {
    $('said').textContent = q;
    document.querySelector('.said').hidden = false;
  }
}

mood();
whoIsHere();
visits();
teleport();
share();
said();
addEventListener('biggle:user', whoIsHere);
